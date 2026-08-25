import axios from "axios";

const API_URL = "https://api.pokemontcg.io/v2/cards";

/**
 * Interroge pokemontcg.io pour trouver la cote (prix Cardmarket) d'une carte
 * a partir d'un nom devine et, si disponible, d'un numero d'extension.
 * Retourne null si aucune correspondance fiable n'est trouvee (mieux vaut
 * ne pas alerter que d'alerter sur une mauvaise estimation).
 */
export async function lookupCote(cardName, setNumber) {
  if (!cardName) return null;

  try {
    const query = `name:"${cardName}"`;
    const response = await axios.get(API_URL, {
      params: { q: query, pageSize: 20 },
      timeout: 10000,
    });

    let candidates = response.data?.data || [];
    if (candidates.length === 0) return null;

    // Si on a un numero d'extension, on essaie de restreindre aux cartes
    // qui matchent exactement ce numero (plus fiable).
    if (setNumber?.number) {
      const filtered = candidates.filter((c) => c.number === setNumber.number);
      if (filtered.length > 0) candidates = filtered;
    }

    // On ne garde que les cartes qui ont un prix Cardmarket disponible.
    const withPrice = candidates.filter((c) => c.cardmarket?.prices?.trendPrice);
    if (withPrice.length === 0) return null;

    // Si trop de candidats differents avec des prix tres eloignes, on est
    // dans le flou -> mieux vaut ne pas se prononcer plutot que de se tromper.
    if (withPrice.length > 5) {
      const prices = withPrice.map((c) => c.cardmarket.prices.trendPrice);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (max > min * 3) return null;
    }

    const best = withPrice[0];
    const prices = best.cardmarket.prices;

    return {
      matchedName: best.name,
      setName: best.set?.name,
      number: best.number,
      trendPrice: prices.trendPrice,
      averageSellPrice: prices.averageSellPrice,
      lowPrice: prices.lowPrice,
      cardmarketUrl: best.cardmarket?.url,
      ambiguous: withPrice.length > 1,
    };
  } catch (err) {
    console.error(`Erreur lookup cote pour "${cardName}":`, err.message);
    return null;
  }
}
