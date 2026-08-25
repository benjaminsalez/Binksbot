import axios from "axios";

const API_URL = "https://api.pokemontcg.io/v2/cards";
const { POKEMONTCG_API_KEY } = process.env;

// Cache en memoire des cotes deja trouvees (evite de redemander la meme
// carte plusieurs fois dans un court laps de temps -> beaucoup d'annonces
// differentes partagent souvent le meme nom de carte).
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map();

// Espacement minimum entre deux requetes vers pokemontcg.io, pour ne pas
// saturer l'API (surtout sans cle API, la limite est basse).
const MIN_DELAY_MS = 600;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchWithRetry(query, attempt = 1) {
  await throttle();
  try {
    const headers = POKEMONTCG_API_KEY ? { "X-Api-Key": POKEMONTCG_API_KEY } : {};
    return await axios.get(API_URL, {
      params: { q: query, pageSize: 20 },
      timeout: 10000,
      headers,
    });
  } catch (err) {
    const status = err.response?.status;
    // Sur une erreur serveur temporaire (surcharge), on retente une fois
    // apres une petite pause, plutot que d'abandonner immediatement.
    if (attempt === 1 && (status === 500 || status === 502 || status === 503)) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchWithRetry(query, attempt + 1);
    }
    throw err;
  }
}

/**
 * Interroge pokemontcg.io pour trouver la cote (prix Cardmarket) d'une carte
 * a partir d'un nom devine et, si disponible, d'un numero d'extension.
 * Retourne null si aucune correspondance fiable n'est trouvee (mieux vaut
 * ne pas alerter que d'alerter sur une mauvaise estimation).
 */
export async function lookupCote(cardName, setNumber) {
  if (!cardName) return null;

  const cacheKey = `${cardName.toLowerCase()}|${setNumber?.number || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const query = `name:"${cardName}"`;
    const response = await fetchWithRetry(query);

    let candidates = response.data?.data || [];
    if (candidates.length === 0) {
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    // Si on a un numero d'extension, on essaie de restreindre aux cartes
    // qui matchent exactement ce numero (plus fiable).
    if (setNumber?.number) {
      const filtered = candidates.filter((c) => c.number === setNumber.number);
      if (filtered.length > 0) candidates = filtered;
    }

    // On ne garde que les cartes qui ont un prix Cardmarket disponible.
    const withPrice = candidates.filter((c) => c.cardmarket?.prices?.trendPrice);
    if (withPrice.length === 0) {
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    // Si trop de candidats differents avec des prix tres eloignes, on est
    // dans le flou -> mieux vaut ne pas se prononcer plutot que de se tromper.
    if (withPrice.length > 5) {
      const prices = withPrice.map((c) => c.cardmarket.prices.trendPrice);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (max > min * 3) {
        cache.set(cacheKey, { value: null, timestamp: Date.now() });
        return null;
      }
    }

    const best = withPrice[0];
    const prices = best.cardmarket.prices;

    const result = {
      matchedName: best.name,
      setName: best.set?.name,
      number: best.number,
      trendPrice: prices.trendPrice,
      averageSellPrice: prices.averageSellPrice,
      lowPrice: prices.lowPrice,
      cardmarketUrl: best.cardmarket?.url,
      ambiguous: withPrice.length > 1,
    };

    cache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`Erreur lookup cote pour "${cardName}":`, err.message);
    // On ne met PAS en cache les erreurs, pour pouvoir reessayer au prochain cycle.
    return null;
  }
}
