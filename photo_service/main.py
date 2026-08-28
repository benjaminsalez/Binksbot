"""
Micro-service d'identification de carte Pokemon par photo.

Utilise en repli quand l'analyse du TITRE Vinted (matcher.js) ne suffit pas
a extraire un nom de carte -> on essaie de lire la photo de l'annonce.

Endpoint unique :
    POST /identify   { "image_url": "https://..." }
    ->   { "name": str|null, "hp": int|null, "attacks": [...], "raw_text": [...] }

Le resultat est volontairement minimal (nom + PV + attaques) : c'est ce qui
s'est montre fiable lors des tests manuels du 27/08. Le numero de carte
(x/y) n'est PAS renvoye car pas assez fiable pour l'instant -> le nom seul
suffit a alimenter lookupTcgdexCote() cote Node, qui gere deja tres bien
l'ambiguite (elle refuse de deviner si les prix des candidats divergent
trop).
"""

import io
import logging
import re

import cv2
import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from paddleocr import PaddleOCR
from pydantic import BaseModel

# Textes de mise en page frequemment lus par l'OCR AVANT le vrai nom de la
# carte (logos, badges de stade...) -> a ignorer lors de la recherche du
# nom. Prefixes plutot que mots exacts, pour couvrir les variantes d'OCR
# (ex: "NIVEAU1" lu "NIVEAUT"). Repere en prod le 28/08.
NAME_BLOCKLIST_PREFIXES = ("tcg", "base", "pokemon", "pokémon", "carte", "niveau", "stage")

# Etiquettes de type de carte Energie/Dresseur/Objet -> le vrai nom de la
# carte est colle juste AVANT cette etiquette dans le meme bloc de texte
# OCR (ex: "Potion Energy Special Energy Card" -> nom = "Potion Energy").
# Utile car ces cartes interessent aussi l'utilisateur, pas seulement les
# Pokemon (demande du 28/08).
TYPE_LABEL_MARKERS = (
    "special energy card",
    "special energy",
    "energy card",
    "pokémon tool",
    "pokemon tool",
    "trainer card",
    "supporter card",
    "stadium card",
    "item card",
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("photo_service")

app = FastAPI(title="BinksBot photo identifier")

# Charge une seule fois au demarrage (pas a chaque requete), comme
# recommande par PaddleOCR. enable_mkldnn=False contourne un bug connu de
# PaddlePaddle sur certaines configs CPU (NotImplementedError PIR/oneDNN).
_ocr = PaddleOCR(
    lang="fr",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    enable_mkldnn=False,
)


class IdentifyRequest(BaseModel):
    image_url: str


class Attack(BaseModel):
    name: str
    damage: str


class IdentifyResponse(BaseModel):
    name: str | None = None
    hp: int | None = None
    card_number: str | None = None
    attacks: list[Attack] = []
    raw_text: list[str] = []


def download_image(url: str) -> np.ndarray:
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    arr = np.frombuffer(resp.content, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image illisible (format non supporte ou corrompue)")
    return img


def isolate_card(img: np.ndarray, pad_frac: float = 0.04, bottom_extra: float = 0.10) -> np.ndarray:
    """Isole automatiquement la carte dans la photo (enleve le fond/table).
    Marge de securite genereuse en bas, car le bord bas de la carte est
    souvent sous-detecte (contraste faible avec certains fonds)."""
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges1 = cv2.Canny(blur, 20, 80)
    grad = cv2.morphologyEx(blur, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    _, edges2 = cv2.threshold(grad, 15, 255, cv2.THRESH_BINARY)
    edges = cv2.bitwise_or(edges1, edges2)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=3)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img
    c = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)
    px, py = int(w * pad_frac), int(h * pad_frac)
    py_bottom = py + int(h * bottom_extra)
    x0, y0 = max(0, x - px), max(0, y - py)
    x1, y1 = min(W, x + w + px), min(H, y + h + py_bottom)
    if x1 <= x0 or y1 <= y0:
        return img
    return img[y0:y1, x0:x1]


def extract_card_number(texts: list[str]) -> str | None:
    """Cherche le numero de carte au format NNN/NNN (ex: '081/189') ou avec
    un prefixe de lettres pour les sous-series speciales comme les cartes
    "Trainer Gallery" (ex: 'TG02/TG30', repere en prod le 28/08). Distinct
    du numero de Pokedex qui apparait parfois dans le texte de description
    ("N 273 Pokemon...") -> celui-la n'a jamais de slash, donc pas de
    risque de confusion avec ce pattern."""
    pattern = re.compile(r"\b([A-Za-z]{0,3}\d{1,3})\s*/\s*([A-Za-z]{0,3}\d{1,3})\b")
    for t in texts:
        m = pattern.search(t)
        if m:
            return f"{m.group(1)}/{m.group(2)}"
    return None


def parse_card_text(texts: list[str]) -> dict:
    """Extrait Nom + PV + attaque(s) a partir de la liste de textes OCR bruts.
    Voir les tests manuels du 27/08 pour la logique (regex, pas de ML)."""
    result = {"name": None, "hp": None, "attacks": []}
    if not texts:
        return result

    # Carte Energie/Dresseur/Objet : le vrai nom est colle juste AVANT
    # l'etiquette de type dans le meme bloc OCR (ex: "Potion Energy
    # Special Energy Card" -> nom = "Potion Energy"). Teste le 28/08 sur
    # de vrais cas ("Potion Energy", "Counterattack Claws").
    for t in texts[:6]:
        t_lower = t.lower()
        for marker in TYPE_LABEL_MARKERS:
            idx = t_lower.find(marker)
            if idx > 2:
                name_part = t[:idx].strip()
                if len(name_part) >= 3:
                    result["name"] = name_part
                    break
        if result["name"]:
            break

    # Sinon, nom de Pokemon classique : on ignore les textes de mise en
    # page connus (logos, badges) au lieu de prendre le tout premier texte
    # a l'aveugle -> teste sur 9 vrais cas le 28/08, 9/9 corrects (corrige
    # au passage un bug deja vu la veille sur "BASE").
    if not result["name"]:
        for t in texts[:5]:
            m = re.match(r"^([A-Za-zÀ-ÿ' \-]+)", t)
            candidate = m.group(1).strip() if m else t.strip()
            if not candidate or len(candidate) < 3:
                continue
            if candidate.lower().startswith(NAME_BLOCKLIST_PREFIXES):
                continue
            result["name"] = candidate
            break
    if result["name"] is None and texts:
        result["name"] = texts[0].strip()

    hp_pattern = re.compile(r"(\d{2,3})[\s.]*[Pp][VvYy]|[Pp][VvYy][\s.]*(\d{2,3})")
    hp_index = None
    for i, t in enumerate(texts[:4]):
        m = hp_pattern.search(t)
        if m:
            result["hp"] = int(m.group(1) or m.group(2))
            hp_index = i
            break
    if result["hp"] is None:
        for i, t in enumerate(texts[:4]):
            if re.fullmatch(r"\d{2,3}", t.strip()):
                result["hp"] = int(t.strip())
                hp_index = i
                break

    # On ne scanne les attaques qu'APRES la paire nom+PV, pour ne plus la
    # confondre avec une vraie attaque (bug repere en prod le 28/08 sur
    # Rubombelle et Cizayox : "Rubombelle","70" et "Cizayox","140"
    # captures a tort comme si c'etait des attaques).
    start = (hp_index + 1) if hp_index is not None else 1

    dmg_pattern = re.compile(r"^\d{1,3}\+?$")
    for i in range(start, len(texts) - 1):
        name_candidate = texts[i].strip()
        dmg_candidate = texts[i + 1].strip()
        if (
            1 <= len(name_candidate.split()) <= 4
            and re.match(r"^[A-Za-zÀ-ÿ' ]+$", name_candidate)
            and dmg_pattern.match(dmg_candidate)
            and name_candidate.lower() not in ("poke body", "poke-body")
        ):
            result["attacks"].append({"name": name_candidate, "damage": dmg_candidate})

    return result


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/identify", response_model=IdentifyResponse)
def identify(req: IdentifyRequest):
    try:
        img = download_image(req.image_url)
    except Exception as exc:
        logger.warning("Telechargement image echoue: %s", exc)
        raise HTTPException(status_code=400, detail=f"Telechargement image echoue: {exc}")

    try:
        card = isolate_card(img)
        result = _ocr.predict(card)
        texts: list[str] = []
        for res in result:
            texts.extend(res.get("rec_texts", []))
        parsed = parse_card_text(texts)
        parsed["card_number"] = extract_card_number(texts)
        parsed["raw_text"] = texts
        return parsed
    except Exception as exc:
        logger.exception("OCR echoue")
        raise HTTPException(status_code=500, detail=f"OCR echoue: {exc}")
