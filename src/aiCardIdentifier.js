import axios from "axios";

const { ANTHROPIC_API_KEY } = process.env;
const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // modele economique, largement suffisant pour cette tache

const SYSTEM_PROMPT = `Tu es un expert en cartes a collectionner Pokemon. On te donne le titre d'une annonce Vinted pour une carte Pokemon. Tu dois l'analyser et repondre UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou apres, avec exactement ces champs:

{
  "pokemonName": "nom anglais officiel du Pokemon (ex: Charizard), ou null si tu ne peux pas l'identifier",
  "cardVariant": "variante si mentionnee: ex, gx, vmax, vstar, mega, full art, alt art, etc, ou null",
  "setNumber": "numero dans l'extension au format xx/yyy si present dans le titre, ou null",
  "isGraded": true si le titre mentionne une note PSA/BGS/CGC (carte sous coque gradee), false sinon,
  "language": "fr, en, jp, de, ou null si non determinable",
  "conditionGuess": "mint, excellent, good, played, ou poor selon l'etat decrit ou suggere dans le titre, null si aucune info"
}

Ne mets aucun texte explicatif, juste le JSON.`;

// Cache en memoire par titre exact (evite de repayer l'analyse si jamais le
// meme titre revient, rare mais possible).
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Utilise Claude pour identifier precisement une carte Pokemon a partir du
 * titre d'une annonce. Retourne null si la cle API n'est pas configuree ou
 * en cas d'erreur (l'appelant doit alors se rabattre sur l'heuristique
 * classique de matcher.js).
 */
export async function identifyCardWithAI(title) {
  if (!ANTHROPIC_API_KEY || !title) return null;

  const cacheKey = title.trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const response = await axios.post(
      API_URL,
      {
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: title }],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const rawText = response.data?.content?.[0]?.text?.trim();
    if (!rawText) return null;

    // Au cas ou le modele encadrerait quand meme le JSON de ```json ... ```
    const cleaned = rawText.replace(/^```json\s*|```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    cache.set(cacheKey, { value: parsed, timestamp: Date.now() });
    return parsed;
  } catch (err) {
    console.error("Erreur identification IA:", err.response?.data?.error?.message || err.message);
    return null;
  }
}
