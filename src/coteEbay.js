import axios from "axios";

const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET } = process.env;

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Recupere (et met en cache) un token d'acces OAuth2 pour l'API eBay,
 * via le flow "client credentials" (acces applicatif, pas besoin de
 * connexion utilisateur).
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET manquants dans les variables d'environnement.");
  }

  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");

  const response = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    }
  );

  cachedToken = response.data.access_token;
  // On retire 60s de marge par rapport a l'expiration reelle, par securite.
  tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
  return cachedToken;
}

// Espacement minimum entre deux requetes de recherche eBay.
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

// Cache en memoire des cotes deja trouvees (1h).
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

/**
 * Cherche des annonces ACTUELLEMENT EN VENTE sur eBay France pour un nom de
 * carte donne, et calcule un prix de reference (mediane) a partir des
 * annonces trouvees. ATTENTION: ce n'est PAS un historique de ventes reelles
 * (l'API eBay qui donne ca necessite un acces restreint/approuve), c'est une
 * estimation basee sur les annonces en cours -> a prendre comme indication,
 * pas comme verite absolue.
 */
export async function lookupEbayCote(cardName, setNumber) {
  if (!cardName) return null;

  const cacheKey = `${cardName.toLowerCase().trim()}|${setNumber || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    await throttle();
    const token = await getAccessToken();

    // On exclut explicitement les cartes gradees (PSA/BGS/CGC) de la
    // comparaison: une carte notee vaut nettement plus qu'une carte brute,
    // les melanger fausserait completement la mediane de reference.
    const numberPart = setNumber ? ` ${setNumber}` : "";
    const query = `pokemon ${cardName}${numberPart} carte -psa -bgs -cgc -grade -graded -note`;

    const response = await axios.get(SEARCH_URL, {
      params: {
        q: query,
        limit: 20,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR",
        "Accept-Language": "fr-FR",
      },
      timeout: 10000,
    });

    const items = response.data?.itemSummaries || [];
    const prices = items
      .map((i) => parseFloat(i.price?.value))
      .filter((p) => Number.isFinite(p) && p > 0);

    if (prices.length < 3) {
      // Pas assez de points de comparaison pour une estimation fiable.
      cache.set(cacheKey, { value: null, timestamp: Date.now() });
      return null;
    }

    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

    const result = {
      medianPrice: median,
      sampleSize: prices.length,
      currency: items[0]?.price?.currency || "EUR",
      // Lien vers la recherche eBay PUBLIQUE equivalente (memes termes),
      // pour pouvoir verifier soi-meme sur quoi se base le calcul de cote.
      searchUrl: `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(query)}`,
    };

    cache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    const errorBody = err.response?.data;
    const detail =
      errorBody?.error_description || // erreurs OAuth (token endpoint)
      errorBody?.errors?.[0]?.message || // erreurs Browse API
      err.message;
    console.error(`Erreur lookup eBay pour "${cardName}" (${err.response?.status || "?"}): ${detail}`);
    return null;
  }
}
