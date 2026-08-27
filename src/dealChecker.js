import { analyzeTitle, mapVintedStatus } from "./matcher.js";
import { lookupTcgdexCote } from "./coteTcgdex.js";
import { looksLikeEnglishCardName, translateToFrench } from "./pokemonNamesFr.js";
import { identifyCardWithAI } from "./aiCardIdentifier.js";
import { findSetAbbreviation } from "./setAbbreviations.js";
import { scanCardImage } from "./tcgTrackingScan.js";

const CONDITION_MULTIPLIERS = {
  mint: 1.0,
  excellent: 0.85,
  good: 0.65,
  played: 0.45,
  poor: 0.3,
};

/**
 * Extrait au mieux un nom/numero/serie depuis la reponse produit
 * TCGTracking (forme exacte pas totalement documentee, extraction
 * defensive avec plusieurs chemins possibles).
 */
function extractFromTcgTrackingProduct(product) {
  const name = product?.name || product?.card_name || null;
  const number = product?.number || product?.collector_number || null;
  const setName = product?.set_name || product?.expansion || null;
  return { name, number, setName };
}

/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a la cote TCGdex (prix Cardmarket), en tenant compte de l'etat detecte.
 * Retourne TOUJOURS un objet diagnostic, avec isDeal:true/false et une
 * raison si ce n'est pas une bonne affaire confirmee -> utile pour debug.
 *
 * Identification de la carte (gratuit):
 *  1. Dictionnaire complet des 1025 Pokemon (FR/EN, toutes generations) ->
 *     recherche directe du nom dans le titre, fiable et sans cout.
 *  2. IA (Claude Haiku) UNIQUEMENT si ANTHROPIC_API_KEY est configuree.
 *  3. Scan d'image TCGTracking en dernier secours si le titre ne suffit
 *     pas -> compare la photo a leur base de cartes (gratuit pour le
 *     moment, endpoint annonce comme devant fermer fin sept. 2026).
 *
 * Source de la cote: TCGdex uniquement (prix Cardmarket, gratuit, fiable).
 */
export async function checkIfGoodDeal(item, thresholdPercent) {
  const titleGuess = item.title?.slice(0, 60) || "";

  if (item.isBusiness) {
    return { isDeal: false, reason: "vendeur_professionnel", titleGuess };
  }
  if (item.isPromoted) {
    return { isDeal: false, reason: "annonce_boostee", titleGuess };
  }

  // --- Identification de la carte (gratuit, via le dictionnaire complet) ---
  const analysis = analyzeTitle(item.title || "");

  // Un LOT de plusieurs cartes ne peut pas etre compare a la cote d'UNE
  // carte -> on l'exclut d'entree.
  if (analysis.isBulkLot) {
    return { isDeal: false, reason: "lot_detecte", titleGuess };
  }

  const aiResult = await identifyCardWithAI(item.title || "");

  const cardName = aiResult?.pokemonName || analysis.cardName;
  const setNumber = aiResult?.setNumber || (analysis.setNumber ? `${analysis.setNumber.number}/${analysis.setNumber.setTotal}` : null);
  const isGraded = aiResult?.isGraded ?? analysis.isGraded;
  const identificationSource = aiResult?.pokemonName ? "IA" : analysis.cardNameSource;

  if (!cardName && !item.photoHighResUrl) {
    return { isDeal: false, reason: "nom_carte_non_extrait", titleGuess };
  }

  if (isGraded) {
    return { isDeal: false, reason: "carte_gradee", cardNameGuess: cardName, titleGuess };
  }

  // --- Langue ---
  const languageDetected = aiResult?.language || analysis.language;
  if (languageDetected && languageDetected !== "fr") {
    return { isDeal: false, reason: "langue_non_fr", langueDetectee: languageDetected, titleGuess };
  }
  if (!languageDetected && cardName && looksLikeEnglishCardName(cardName)) {
    return { isDeal: false, reason: "nom_anglais_detecte", cardNameGuess: cardName, titleGuess };
  }

  // --- Etat ---
  const vintedCondition = mapVintedStatus(item.vintedStatus);
  const aiCondition = aiResult?.conditionGuess
    ? { tier: aiResult.conditionGuess, multiplier: CONDITION_MULTIPLIERS[aiResult.conditionGuess] }
    : null;
  const condition = vintedCondition || aiCondition || analysis.condition;
  const conditionMultiplier = condition?.multiplier ?? 0.85;
  const conditionSource = vintedCondition ? "champ Vinted" : aiCondition ? "IA" : "devine depuis le titre";

  // --- Recherche de cote (TCGdex) ---
  const setAbbreviation = findSetAbbreviation(item.title || "");
  const titleHint = setAbbreviation ? `${item.title} ${setAbbreviation}` : item.title;

  let cote = cardName ? await lookupTcgdexCote(cardName, setNumber, titleHint) : null;
  let finalIdentificationSource = identificationSource;

  // Si l'identification par titre echoue (nom absent ou cote introuvable),
  // on tente le scan d'image en dernier recours avant d'abandonner.
  if (!cote && item.photoHighResUrl) {
    const scanResult = await scanCardImage(item.photoHighResUrl);
    if (scanResult) {
      const extracted = extractFromTcgTrackingProduct(scanResult.product);
      if (extracted.name) {
        const nameForTcgdex = translateToFrench(extracted.name);
        const scanCote = await lookupTcgdexCote(nameForTcgdex, extracted.number, item.title);
        if (scanCote) {
          cote = scanCote;
          finalIdentificationSource = `scan image (${scanResult.score}%)`;
        }
      }
    }
  }

  if (!cote) {
    return { isDeal: false, reason: "cote_introuvable", cardNameGuess: cardName, titleGuess };
  }

  const referencePrice = cote.trendPrice * conditionMultiplier;
  const matchedName = cote.matchedName || cardName;

  if (referencePrice <= 0 || !item.price) {
    return { isDeal: false, reason: "prix_invalide", cardNameGuess: matchedName, titleGuess };
  }

  if (referencePrice < 5) {
    return {
      isDeal: false,
      reason: "cote_trop_faible",
      cardNameGuess: matchedName,
      referencePrice: referencePrice.toFixed(2),
      titleGuess,
    };
  }

  const discountPercent = ((referencePrice - item.price) / referencePrice) * 100;

  if (discountPercent < thresholdPercent) {
    return {
      isDeal: false,
      reason: "sous_le_seuil",
      cardNameGuess: matchedName,
      referencePrice: referencePrice.toFixed(2),
      askingPrice: item.price,
      discountPercent: Math.round(discountPercent),
      titleGuess,
    };
  }

  return {
    isDeal: true,
    discountPercent: Math.round(discountPercent),
    referencePrice: referencePrice.toFixed(2),
    cardName: matchedName,
    cardNumber: setNumber || null,
    setName: cote.setName,
    condition: condition?.tier || "estimee (excellent par defaut)",
    conditionSource,
    identificationSource: finalIdentificationSource,
    language: languageDetected || "non detectee",
    ambiguous: cote.ambiguous,
    source: "TCGdex (Cardmarket)",
    favouriteCount: item.favouriteCount,
    viewCount: item.viewCount,
  };
}
