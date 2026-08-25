// Mots a ignorer quand on essaie de deviner le nom de la carte dans un titre Vinted.
const NOISE_WORDS = new Set([
  "carte", "cartes", "pokemon", "pokémon", "fr", "vf", "francaise", "française",
  "anglaise", "anglais", "en", "vo", "neuve", "neuf", "tbe", "be", "holo",
  "reverse", "psa", "cgc", "bgs", "brillante", "rare", "secrete", "secrète",
  "full", "art", "illustration", "edition", "édition", "1ere", "1ère", "premiere",
  "première", "wizard", "jap", "japonaise", "japonais", "de", "du", "la", "le",
  "les", "a", "à", "vendre", "lot", "unique", "originale", "original", "tcg",
]);

/**
 * Essaie d'extraire le numero "xx/yyy" (numero dans l'extension) du titre.
 */
function extractSetNumber(title) {
  const match = title.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (!match) return null;
  return { number: match[1], setTotal: match[2] };
}

/**
 * Essaie de deviner le nom du Pokemon dans le titre, en retirant les mots-bruit
 * et le numero d'extension. Retourne le premier "bloc" de mots significatifs.
 * Heuristique simple, pas une garantie de bonne extraction.
 */
function extractCardName(title) {
  const withoutNumber = title.replace(/(\d{1,3})\s*\/\s*(\d{1,3})/, " ");
  const words = withoutNumber
    .replace(/[^\p{L}\s]/gu, " ") // enleve ponctuation/chiffres restants
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter((w) => !NOISE_WORDS.has(w.toLowerCase()));
  if (meaningful.length === 0) return null;

  // On garde les 1 a 3 premiers mots significatifs comme nom candidat
  // (la plupart des titres commencent par le nom du Pokemon).
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
  de: ["allemande", "allemand", "german"],
};

function detectLanguage(title) {
  const lower = ` ${title.toLowerCase()} `;
  for (const [lang, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return lang;
  }
  return null;
}

export function analyzeTitle(title) {
  return {
    cardName: extractCardName(title),
    setNumber: extractSetNumber(title),
    condition: detectCondition(title),
    language: detectLanguage(title),
  };
}
