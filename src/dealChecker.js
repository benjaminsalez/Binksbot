import { analyzeTitle, mapVintedStatus } from "./matcher.js";
import { lookupTcgdexCote } from "./coteTcgdex.js";
import { looksLikeEnglishCardName } from "./pokemonNamesFr.js";
import { identifyCardWithAI } from "./aiCardIdentifier.js";
import { findSetAbbreviation } from "./setAbbreviations.js";

const CONDITION_MULTIPLIERS = {
  mint: 1.0,
  excellent: 0.85,
  good: 0.65,
  played: 0.45,
  poor: 0.3,
};

/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a la cote TCGdex (prix Cardmarket), en tenant compte de l'etat detecte.
 * Retourne TOUJOURS un objet diagnostic, avec isDeal:true/false et une
 * raison si ce n'est pas une bonne affaire confirmee -> utile pour debug.
 *
 * Identification de la carte (100% gratuit):
 *  1. Dictionnaire complet des 1025 Pokemon (FR/EN, toutes generations) ->
 *     recherche directe du nom dans le titre, fiable et sans cout.
 *  2. IA (Claude Haiku) UNIQUEMENT si ANTHROPIC_API_KEY est configuree ->
 *     utilisee en complement pour affiner (variante, numero) quand
 *     disponible, mais totalement optionnelle.
 *
 * Source de la cote: TCGdex uniquement (prix Cardmarket, support natif du
 * francais, pas de cle API, gratuit et fiable).
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
  // carte -> on l'exclut d'entree, avant meme d'appeler l'IA ou de chercher
  // une cote (evite de gaspiller des appels pour rien).
  if (analysis.isBulkLot) {
    return { isDeal: false, reason: "lot_detecte", titleGuess };
  }

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

  // --- Recherche de cote (TCGdex uniquement) ---
  // Si le titre contient une abreviation de serie connue (ex: "ME2", "ASC",
  // "TG"), on ajoute le nom complet correspondant au signal de departage
  // envoye a TCGdex -> aide a choisir la bonne carte quand plusieurs
  // versions partagent le meme numero dans des series differentes.
  const setAbbreviation = findSetAbbreviation(item.title || "");
  const titleHint = setAbbreviation ? `${item.title} ${setAbbreviation}` : item.title;

  const cote = await lookupTcgdexCote(cardName, setNumber, titleHint);

  if (!cote) {
    return { isDeal: false, reason: "cote_introuvable", cardNameGuess: cardName, titleGuess };
  }

  const referencePrice = cote.trendPrice * conditionMultiplier;
  const matchedName = cote.matchedName || cardName;

  if (referencePrice <= 0 || !item.price) {
    return { isDeal: false, reason: "prix_invalide", cardNameGuess: cardName, titleGuess };
  }

  // Cartes trop peu cheres: meme avec un gros pourcentage de remise, la
  // marge absolue est negligeable et le risque de mauvaise identification
  // pese proportionnellement plus lourd -> pas interessant a signaler.
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
    identificationSource,
    language: languageDetected || "non detectee",
    ambiguous: cote.ambiguous,
    source: "TCGdex (Cardmarket)",
    favouriteCount: item.favouriteCount,
    viewCount: item.viewCount,
  };
}
