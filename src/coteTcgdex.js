import axios from "axios";

const SEARCH_URL = "https://api.tcgdex.net/v2/fr/cards";
const CARD_URL = "https://api.tcgdex.net/v2/fr/cards";

// Espacement minimum entre deux requetes, par politesse envers le service
// (gratuit et sans cle, generalement genereux mais evitons d'abuser).
const MIN_DELAY_MS = 300;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Cache en memoire (1h), meme principe que les autres sources de cote.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

/**
 * Cherche la cote Cardmarket d'une carte via TCGdex (gratuit, sans cle API,
 * support natif du francais -> pas besoin de traduire le nom).
 * setNumber attendu au format "xx/yyy" ou juste "xx" (optionnel, affine la
 * recherche si plusieurs cartes portent le meme nom dans des sets differents).
 */
export async function lookupTcgdexCote(cardNameFr, setNumber) {
  if (!cardNameFr) return null;

  const cacheKey = `${cardNameFr.toLowerCase().trim()}|${setNumber || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    await throttle();
    const searchResponse = await axios.get(SEARCH_URL, {
      params: { name: cardNameFr },
      timeout: 10000,
    });

    let candidates = searchResponse.data || [];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    // Si on a un numero d'extension, on essaie de trouver la carte exacte
    // parmi les candidats (plus fiable qu'un simple premier resultat).
    if (setNumber) {
      const numberOnly = setNumber.split("/")[0];
      const exactMatch = candidates.find(
        (c) => c.localId?.toLowerCase() === numberOnly.toLowerCase()
      );
      if (exactMatch) candidates = [exactMatch];
    }

    const best = candidates[0];
    if (!best?.id) {
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    await throttle();
    const cardResponse = await axios.get(`${CARD_URL}/${best.id}`, { timeout: 10000 });
    const card = cardResponse.data;

    const cardmarket = card?.pricing?.cardmarket;
    if (!cardmarket) {
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    // On prend le "trend" comme reference (le plus proche d'un prix de
    // marche actuel), avec repli sur avg30 si absent. On regarde aussi la
    // variante holo si elle existe et semble plus pertinente (pas de moyen
    // simple de savoir si LA carte en question est holo sans info
    // supplementaire, donc on garde la version normale par defaut).
    const trendPrice = cardmarket.trend ?? cardmarket.avg30 ?? cardmarket.avg;
    if (!trendPrice) {
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    const result = {
      matchedName: card.name,
      setName: card.set?.name || null,
      number: card.localId,
      trendPrice,
      ambiguous: candidates.length > 1,
    };

    cache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`Erreur lookup TCGdex pour "${cardNameFr}":`, err.message);
    return null;
  }
}
