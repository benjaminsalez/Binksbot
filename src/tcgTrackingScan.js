import axios from "axios";
import Jimp from "jimp";
import { analyzeTitle } from "./matcher.js";

const SCAN_URL = "https://tcgtracking.com/tcgapi/v1/scan";
const PRODUCT_URL = "https://tcgtracking.com/tcgapi/v1/products";
const POKEMON_GAME_ID = 3; // categorie "Pokemon" chez TCGTracking

// ATTENTION: cet endpoint gratuit est annonce comme devant fermer autour du
// 30 septembre 2026, remplace par une version payante (openapi.tcgtracking.com).
// A surveiller/reevaluer a cette echeance.

const MIN_DELAY_MS = 500;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Telecharge une image et la redimensionne/compresse jusqu'a passer sous la
 * limite de 100KB imposee par l'API de scan.
 */
async function prepareImage(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15000 });
  let image = await Jimp.read(Buffer.from(response.data));

  let quality = 80;
  let width = 600;
  image = image.resize(width, Jimp.AUTO);
  image.quality(quality);
  let buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

  while (buffer.length > 95_000 && (quality > 30 || width > 300)) {
    if (quality > 30) {
      quality -= 15;
    } else {
      width = Math.floor(width * 0.8);
      image = image.resize(width, Jimp.AUTO);
    }
    image.quality(quality);
    buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  }

  return buffer;
}

/**
 * Scanne la photo d'une annonce via TCGTracking pour identifier la carte
 * (comparaison d'image, pas juste du texte). Retourne les infos du produit
 * correspondant si un match suffisamment confiant est trouve, sinon null.
 * Utilise en secours quand l'identification par titre echoue.
 */
export async function scanCardImage(imageUrl) {
  if (!imageUrl) return null;

  try {
    const buffer = await prepareImage(imageUrl);
    if (buffer.length > 100_000) {
      console.log("[TCGTracking] Image trop lourde meme apres compression, scan annule.");
      return null;
    }

    const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;

    await throttle();
    const scanResponse = await axios.post(
      SCAN_URL,
      { game_id: POKEMON_GAME_ID, limit: 5, image: dataUri },
      { timeout: 20000 }
    );

    const results = scanResponse.data?.results || [];
    if (results.length === 0) {
      console.log("[TCGTracking] Aucun candidat retourne par le scan.");
      return null;
    }

    const best = results[0];
    console.log(`[TCGTracking] Meilleur candidat: product_id=${best.product_id}, score=${best.score}`);

    if (best.score < 25) {
      console.log(`[TCGTracking] Score trop faible (${best.score}), resultat ignore.`);
      return null;
    }

    await throttle();
    const productResponse = await axios.get(`${PRODUCT_URL}/${best.product_id}`, { timeout: 15000 });
    // La vraie donnee est imbriquee dans un champ "product", pas a la racine.
    const product = productResponse.data?.product;

    if (!product) {
      console.log("[TCGTracking] Reponse produit inattendue, aucune donnee exploitable.");
      return null;
    }

    console.log(`[TCGTracking] Produit recupere:`, JSON.stringify(product).slice(0, 400));

    // On reutilise notre systeme d'extraction deja eprouve (celui qui
    // marche sur les titres Vinted) plutot que d'ecrire un nouveau parseur:
    // le nom TCGPlayer inclut souvent le numero colle dedans (ex: "Iono's
    // Bellibolt ex - 194"), et search_blob contient en plus le nom de serie.
    const combinedText = `${product.name || ""} ${product.search_blob || ""}`;
    const extracted = analyzeTitle(combinedText);

    if (!extracted.cardName) {
      console.log("[TCGTracking] Aucun nom de Pokemon reconnu dans le produit recupere.");
      return null;
    }

    return {
      cardName: extracted.cardName,
      setNumber: extracted.setNumber
        ? `${extracted.setNumber.number}/${extracted.setNumber.setTotal || ""}`
        : null,
      score: best.score,
    };
  } catch (err) {
    console.error("[TCGTracking] Erreur:", err.response?.data?.error || err.message);
    return null;
  }
}
