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

/**
 * Normalise un numero de carte pour comparaison: retire les zeros de tete
 * de la partie numerique (ex: "027" -> "27", "TG04" -> "TG4"), pour eviter
 * qu'un simple zero de tete ne fasse rater une correspondance exacte alors
 * que c'est bien la meme carte (TCGdex ne garde generalement pas les zeros
 * de tete dans son champ localId).
 */
function normalizeLocalId(id) {
  if (!id) return "";
  const match = id.match(/^([A-Za-z]*)0*(\d+)$/);
  if (match) return `${match[1]}${match[2]}`.toLowerCase();
  return id.toLowerCase();
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
export async function lookupTcgdexCote(cardNameFr, setNumber, titleHint) {
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

    // Si on a un numero d'extension, on cherche TOUTES les cartes qui le
    // partagent (la numerotation redemarre a chaque extension, donc "8"
    // existe dans des dizaines de sets differents) -> pas juste la premiere.
    let hasExactMatch = false;
    if (setNumber) {
      const numberOnly = normalizeLocalId(setNumber.split("/")[0]);
      const exactMatches = candidates.filter(
        (c) => normalizeLocalId(c.localId) === numberOnly
      );

      if (exactMatches.length === 1) {
        candidates = exactMatches;
        hasExactMatch = true;
      } else if (exactMatches.length > 1) {
        // Plusieurs cartes partagent ce numero dans des sets differents ->
        // on essaie de departager via le nom du set mentionne dans le titre
        // Vinted (ex: "Team Rocket" present dans le titre).
        let setMatch = null;
        if (titleHint) {
          const titleLower = titleHint.toLowerCase();
          setMatch = exactMatches.find(
            (c) => c.set?.name && titleLower.includes(c.set.name.toLowerCase())
          );
        }
        if (setMatch) {
          candidates = [setMatch];
          hasExactMatch = true;
        } else {
          // Toujours ambigu -> on laisse le controle d'ecart de prix
          // ci-dessous decider si deviner reste raisonnable.
          candidates = exactMatches;
        }
      }
    }

    // Pas de numero exact trouve et plusieurs cartes possibles portent ce
    // nom -> avant de deviner, on verifie si leurs prix sont proches (dans
    // ce cas la devinette a peu de consequences) ou tres eloignes (dans ce
    // cas mieux vaut refuser de se prononcer que de se tromper largement).
    if (!hasExactMatch && candidates.length > 1) {
      const sampleSize = Math.min(candidates.length, 4);
      const priceChecks = await Promise.all(
        candidates.slice(0, sampleSize).map(async (c) => {
          try {
            await throttle();
            const resp = await axios.get(`${CARD_URL}/${c.id}`, { timeout: 10000 });
            const price = resp.data?.pricing?.cardmarket?.trend;
            return price ? { card: resp.data, price } : null;
          } catch {
            return null;
          }
        })
      );

      const valid = priceChecks.filter(Boolean);
      if (valid.length >= 2) {
        const prices = valid.map((v) => v.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);

        if (max > min * 2.5) {
          // Trop d'ecart entre les versions possibles (ex: version commune
          // vs version rare du meme Pokemon) -> on refuse de deviner.
          cache.set(cacheKey, { value: null, timestamp: Date.now() });
          return null;
        }

        // Prix suffisamment proches -> on peut se permettre de prendre le
        // premier candidat sans risque significatif d'erreur importante.
        const best = valid[0].card;
        const cardmarket = best.pricing.cardmarket;
        const trendPrice = cardmarket.trend ?? cardmarket.avg30 ?? cardmarket.avg;
        const result = {
          matchedName: best.name,
          setName: best.set?.name || null,
          number: best.localId,
          trendPrice,
          ambiguous: true,
        };
        cache.set(cacheKey, { value: result, timestamp: Date.now() });
        return result;
      }
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
