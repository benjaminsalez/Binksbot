import { FR_TO_EN } from "./pokemonNamesFr.js";

// Mots a ignorer quand on essaie de deviner le nom de la carte dans un titre Vinted.
const NOISE_WORDS = new Set([
  "carte", "cartes", "pokemon", "pokémon", "fr", "vf", "francaise", "française",
  "anglaise", "anglais", "en", "vo", "neuve", "neuf", "tbe", "be", "holo",
  "reverse", "psa", "cgc", "bgs", "brillante", "rare", "secrete", "secrète",
  "full", "art", "illustration", "edition", "édition", "1ere", "1ère", "premiere",
  "première", "wizard", "jap", "japonaise", "japonais", "de", "du", "la", "le",
  "les", "a", "à", "vendre", "lot", "unique", "originale", "original", "tcg",
]);

// Detection des annonces qui vendent un LOT de plusieurs cartes (pas une
// carte individuelle) -> comparer le prix total d'un lot a la cote d'UNE
// carte n'a aucun sens, ces annonces doivent etre completement ignorees
// par le calculateur de bonnes affaires, quelle que soit la langue.
const BULK_LOT_PATTERN = /\b(lots?|lotto|lotti|vrac|bundle|collezione)\b|\b\d{2,4}\s*(cartes?|cards?|carte)\b/i;

function detectIsBulkLot(title) {
  return BULK_LOT_PATTERN.test(title);
}

// Liste de tous les noms de Pokemon connus (FR + EN), triee du plus long au
// plus court pour matcher les noms les plus specifiques en premier (evite
// qu'un nom court comme "Mew" ne "mange" une correspondance dans "Mewtwo").
const ALL_KNOWN_NAMES = (() => {
  const names = new Set();
  for (const [fr, en] of Object.entries(FR_TO_EN)) {
    names.add(fr);
    names.add(en.toLowerCase());
  }
  return Array.from(names).sort((a, b) => b.length - a.length);
})();

/**
 * Cherche un nom de Pokemon CONNU (present dans notre dictionnaire complet
 * FR/EN) directement dans le titre, avec limite de mot (pas de faux positif
 * du type "Mew" trouve a l'interieur de "Mewtwo"). Beaucoup plus fiable que
 * la simple extraction "1ers mots non-bruit".
 * Retourne le nom EXACT tel qu'ecrit dans le dictionnaire (utile pour la
 * traduction FR->EN ensuite), ou null si rien de reconnu.
 */
function findKnownPokemonName(title) {
  const lower = title.toLowerCase();
  for (const name of ALL_KNOWN_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu");
    if (regex.test(` ${lower} `)) {
      return name;
    }
  }
  return null;
}

// Detection des cartes gradees (sous coque PSA/BGS/CGC): a exclure des
// comparaisons de prix, une carte notee valant nettement plus qu'une carte
// brute. "grad\w*" capte toutes les variantes: grade, gradee, graded,
// grading, gradata (italien), etc. Detection gratuite, pas besoin d'IA.
const GRADED_PATTERN = /\b(psa|bgs|cgc)\b|\bgrad\w*\b|note\s*\d{1,2}\s*\/\s*10/i;

function detectIsGraded(title) {
  return GRADED_PATTERN.test(title);
}

// Mapping des valeurs REELLES du champ "status" fourni par Vinted (rempli par
// le vendeur lui-meme lors de la publication) -> tier + multiplicateur.
// Beaucoup plus fiable que la detection par mots-cles dans le titre.
const VINTED_STATUS_MAP = {
  "neuf avec étiquette": { tier: "mint", multiplier: 1.0 },
  "neuf avec etiquette": { tier: "mint", multiplier: 1.0 },
  "neuf sans étiquette": { tier: "mint", multiplier: 0.95 },
  "neuf sans etiquette": { tier: "mint", multiplier: 0.95 },
  "très bon état": { tier: "excellent", multiplier: 0.85 },
  "tres bon etat": { tier: "excellent", multiplier: 0.85 },
  "bon état": { tier: "good", multiplier: 0.65 },
  "bon etat": { tier: "good", multiplier: 0.65 },
  "satisfaisant": { tier: "played", multiplier: 0.45 },
};

/**
 * Traduit le champ "status" reel de Vinted (ex: "Très bon état") vers un
 * tier + multiplicateur. Retourne null si la valeur n'est pas reconnue.
 */
export function mapVintedStatus(statusText) {
  if (!statusText) return null;
  const key = statusText.toLowerCase().trim();
  return VINTED_STATUS_MAP[key] || null;
}

/**
 * Essaie d'extraire le numero "xx/yyy" (numero dans l'extension) du titre.
 * Capture aussi un eventuel prefixe alphabetique (ex: "TG04/TG30" pour la
 * Trainer Gallery d'Origine Perdue, "GG01" pour Galar Gallery, etc.) -
 * essentiel pour ne pas confondre deux cartes portant le meme numero brut
 * dans des sous-series differentes.
 */
function extractSetNumber(title) {
  const match = title.match(/\b([A-Za-z]{0,3}\d{1,3})\s*\/\s*([A-Za-z]{0,3}\d{1,3})\b/);
  if (!match) return null;
  return { number: match[1], setTotal: match[2] };
}

/**
 * Essaie de deviner le nom du Pokemon dans le titre, en retirant les mots-bruit
 * et le numero d'extension. Retourne le premier "bloc" de mots significatifs.
 * Utilise UNIQUEMENT en dernier recours si le dictionnaire ne trouve rien.
 */
function extractCardNameFallback(title) {
  const withoutNumber = title.replace(/(\d{1,3})\s*\/\s*(\d{1,3})/, " ");
  const words = withoutNumber
    .replace(/[^\p{L}\s]/gu, " ") // enleve ponctuation/chiffres restants
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter((w) => !NOISE_WORDS.has(w.toLowerCase()));
  if (meaningful.length === 0) return null;

  return meaningful.slice(0, 2).join(" ");
}

const CONDITION_KEYWORDS = [
  { tier: "mint", multiplier: 1.0, words: ["mint", "psa 10", "gem mint", "neuve sous blister"] },
  { tier: "excellent", multiplier: 0.85, words: ["near mint", "nm", "excellent etat", "excellent état", "comme neuve"] },
  { tier: "good", multiplier: 0.65, words: ["tres bon etat", "très bon état", "tbe", "bon etat", "bon état"] },
  { tier: "played", multiplier: 0.45, words: ["jouee", "jouée", "used", "played", "etat moyen", "état moyen"] },
  { tier: "poor", multiplier: 0.3, words: ["abimee", "abîmée", "mauvais etat", "mauvais état", "pliee", "pliée"] },
];

/**
 * Detecte un etat approximatif a partir de mots-cles dans le titre.
 * Retourne null si rien de detecte (dans ce cas on reste prudent cote calcul).
 */
function detectCondition(title) {
  const lower = title.toLowerCase();
  for (const { tier, multiplier, words } of CONDITION_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) {
      return { tier, multiplier };
    }
  }
  return null;
}

const LANGUAGE_KEYWORDS = {
  fr: ["fr ", "française", "francaise", "vf", "français"],
  en: ["en ", "anglaise", "anglais", "english", "vo"],
  jp: ["jap", "japonaise", "japonais", "japanese"],
  de: ["allemande", "allemand", "german", "deutsch", "mit ", "gebraucht"],
  it: ["con ", "italiana", "italiano", "timbro", "nuova", "nuovo", "usata", "usato", "carta pokemon"],
  es: ["española", "espanol", "español", "nueva ", "usada", "usado", "carta pokemon"],
  pt: ["português", "portugues", "nova ", "novo ", "usada", "usado"],
};

function detectLanguage(title) {
  const lower = ` ${title.toLowerCase()} `;
  for (const [lang, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return lang;
  }
  return null;
}

export function analyzeTitle(title) {
  const dictionaryMatch = findKnownPokemonName(title);
  return {
    cardName: dictionaryMatch || extractCardNameFallback(title),
    cardNameSource: dictionaryMatch ? "dictionnaire" : "devine",
    setNumber: extractSetNumber(title),
    condition: detectCondition(title),
    language: detectLanguage(title),
    isGraded: detectIsGraded(title),
    isBulkLot: detectIsBulkLot(title),
  };
}
