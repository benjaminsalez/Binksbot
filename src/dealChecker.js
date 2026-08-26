import { analyzeTitle, mapVintedStatus } from "./matcher.js";
import { lookupCote } from "./cote.js";
import { lookupEbayCote } from "./coteEbay.js";
import { translateToEnglish, looksLikeEnglishCardName } from "./pokemonNamesFr.js";
import { identifyCardWithAI } from "./aiCardIdentifier.js";

const CONDITION_MULTIPLIERS = {
  mint: 1.0,
  excellent: 0.85,
  good: 0.65,
  played: 0.45,
  poor: 0.3,
};

/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a une cote de reference, en tenant compte de l'etat detecte.
 * Retourne TOUJOURS un objet diagnostic, avec isDeal:true/false et une
 * raison si ce n'est pas une bonne affaire confirmee -> utile pour debug.
 *
 * Identification de la carte (100% gratuit par defaut):
 *  1. Dictionnaire complet des 1025 Pokemon (FR/EN, toutes generations) ->
 *     recherche directe du nom dans le titre, fiable et sans cout.
 *  2. IA (Claude Haiku) UNIQUEMENT si ANTHROPIC_API_KEY est configuree ->
 *     utilisee en complement pour affiner (variante, numero) quand
 *     disponible, mais totalement optionnelle.
 *
 * Source de la cote:
 *  1. eBay (annonces en cours sur eBay France, cartes gradees exclues).
 *  2. pokemontcg.io (prix Cardmarket) en secours.
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

  // L'IA reste utilisable si une cle est configuree (optionnel), sinon on
  // continue tres bien sans -> aiResult vaudra simplement null.
  const aiResult = await identifyCardWithAI(item.title || "");

  const cardName = aiResult?.pokemonName || analysis.cardName;
  const setNumber = aiResult?.setNumber || (analysis.setNumber ? `${analysis.setNumber.number}/${analysis.setNumber.setTotal}` : null);
  const isGraded = aiResult?.isGraded ?? analysis.isGraded;
  const identificationSource = aiResult?.pokemonName ? "IA" : analysis.cardNameSource;

  if (!cardName) {
    return { isDeal: false, reason: "nom_carte_non_extrait", titleGuess };
  }

  // Une carte gradee (PSA/BGS/CGC) vaut normalement bien plus qu'une carte
  // brute -> on ne peut pas la comparer a une cote de carte non-gradee.
  if (isGraded) {
    return { isDeal: false, reason: "carte_gradee", cardNameGuess: cardName, titleGuess };
  }

  // --- Langue ---
  const languageDetected = aiResult?.language || analysis.language;
  if (languageDetected && languageDetected !== "fr") {
    return { isDeal: false, reason: "langue_non_fr", langueDetectee: languageDetected, titleGuess };
  }
  if (!languageDetected && looksLikeEnglishCardName(cardName)) {
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

  // --- Recherche de cote ---
  let referencePrice = null;
  let source = null;
  let matchedName = cardName;
  let cardmarketUrl = null;
  let ambiguous = false;
  let setName = null;
  let ebayPriceDisplay = null;
  let cardmarketPriceDisplay = null;

  const translatedName = translateToEnglish(cardName);

  // On interroge les deux sources EN PARALLELE (pas l'une puis l'autre),
  // pour pouvoir afficher les deux cotes independamment.
  const [ebayCote, cardmarketCote] = await Promise.all([
    lookupEbayCote(cardName, setNumber),
    lookupCote(translatedName, analysis.setNumber).then(async (cote) => {
      if (!cote && translatedName !== cardName) {
        return lookupCote(cardName, analysis.setNumber);
      }
      return cote;
    }),
  ]);

  if (ebayCote) {
    const ebayPrice = ebayCote.medianPrice * conditionMultiplier;
    ebayPriceDisplay = { price: ebayPrice.toFixed(2), sampleSize: ebayCote.sampleSize };
    referencePrice = ebayPrice;
    source = `eBay (${ebayCote.sampleSize} annonces en cours)`;
  }

  if (cardmarketCote) {
    matchedName = cardmarketCote.matchedName || matchedName;
    cardmarketUrl = cardmarketCote.cardmarketUrl;
    ambiguous = cardmarketCote.ambiguous;
    setName = cardmarketCote.setName;

    const cardmarketPrice = cardmarketCote.trendPrice * conditionMultiplier;
    cardmarketPriceDisplay = { price: cardmarketPrice.toFixed(2) };

    if (!referencePrice) {
      // eBay n'a rien donne -> Cardmarket devient la reference principale
      // pour le calcul de la remise.
      referencePrice = cardmarketPrice;
      source = "pokemontcg.io (Cardmarket)";
    }
  }

  if (!referencePrice) {
    return { isDeal: false, reason: "cote_introuvable", cardNameGuess: cardName, titleGuess };
  }

  if (referencePrice <= 0 || !item.price) {
    return { isDeal: false, reason: "prix_invalide", cardNameGuess: cardName, titleGuess };
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
      source,
      titleGuess,
    };
  }

  return {
    isDeal: true,
    discountPercent: Math.round(discountPercent),
    referencePrice: referencePrice.toFixed(2),
    cardName: matchedName,
    setName,
    condition: condition?.tier || "estimee (excellent par defaut)",
    conditionSource,
    identificationSource,
    language: languageDetected || "non detectee",
    cardmarketUrl,
    ambiguous,
    source,
    ebayPriceDisplay,
    cardmarketPriceDisplay,
    favouriteCount: item.favouriteCount,
    viewCount: item.viewCount,
  };
}
