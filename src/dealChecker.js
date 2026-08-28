import { analyzeTitle, mapVintedStatus } from "./matcher.js";
import { lookupTcgdexCote } from "./coteTcgdex.js";
import { looksLikeEnglishCardName } from "./pokemonNamesFr.js";
import { identifyCardWithAI } from "./aiCardIdentifier.js";
import { findSetAbbreviation } from "./setAbbreviations.js";
import { identifyCardFromPhoto } from "./photoIdentifier.js";

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
 * Identification de la carte (gratuit):
 *  1. Dictionnaire complet des 1025 Pokemon (FR/EN, toutes generations) ->
 *     recherche directe du nom dans le titre, fiable et sans cout.
 *  2. IA (Claude Haiku) UNIQUEMENT si ANTHROPIC_API_KEY est configuree.
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

  let cardName = aiResult?.pokemonName || analysis.cardName;
  let setNumber = aiResult?.setNumber || (analysis.setNumber ? `${analysis.setNumber.number}/${analysis.setNumber.setTotal}` : null);
  const isGraded = aiResult?.isGraded ?? analysis.isGraded;
  let identificationSource = aiResult?.pokemonName ? "IA" : analysis.cardNameSource;

  // --- Repli photo : le titre (et l'IA sur le titre) ne suffisent pas ->
  // on essaie de lire la photo de l'annonce. Desactive si
  // PHOTO_IDENTIFIER_URL n'est pas configuree (voir photoIdentifier.js).
  // Le numero de carte (cardNumber) est important ici : sans lui,
  // lookupTcgdexCote() doit deviner parmi toutes les reimpressions d'un
  // meme Pokemon au fil des annees, et refuse souvent par prudence si
  // leurs prix divergent trop (observe en prod le 28/08 sur Noadkoko et
  // Barbicha) -> avec le numero, elle retrouve l'edition exacte.
  if (!cardName) {
    const photoResult = await identifyCardFromPhoto(item.photoHighResUrl);
    if (photoResult?.cardName) {
      cardName = photoResult.cardName;
      identificationSource = "photo";
      if (photoResult.cardNumber) {
        setNumber = photoResult.cardNumber;
      }
    }
  }

  if (!cardName) {
    return { isDeal: false, reason: "nom_carte_non_extrait", titleGuess };
  }

  if (isGraded) {
    return { isDeal: false, reason: "carte_gradee", cardNameGuess: cardName, identificationSource, titleGuess };
  }

  // --- Langue ---
  const languageDetected = aiResult?.language || analysis.language;
  if (languageDetected && languageDetected !== "fr") {
    return { isDeal: false, reason: "langue_non_fr", langueDetectee: languageDetected, cardNameGuess: cardName, identificationSource, titleGuess };
  }
  if (!languageDetected && looksLikeEnglishCardName(cardName)) {
    return { isDeal: false, reason: "nom_anglais_detecte", cardNameGuess: cardName, identificationSource, titleGuess };
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

  const cote = await lookupTcgdexCote(cardName, setNumber, titleHint);

  if (!cote) {
    return { isDeal: false, reason: "cote_introuvable", cardNameGuess: cardName, identificationSource, titleGuess };
  }

  const referencePrice = cote.trendPrice * conditionMultiplier;
  const matchedName = cote.matchedName || cardName;

  if (referencePrice <= 0 || !item.price) {
    return { isDeal: false, reason: "prix_invalide", cardNameGuess: matchedName, identificationSource, titleGuess };
  }

  if (referencePrice < 5) {
    return {
      isDeal: false,
      reason: "cote_trop_faible",
      cardNameGuess: matchedName,
      referencePrice: referencePrice.toFixed(2),
      identificationSource,
      titleGuess,
    };
  }

  const discountPercent = ((referencePrice - item.price) / referencePrice) * 100;

  // Une remise "trop belle pour etre vraie" (>85%) est un signal d'alarme
  // plutot qu'une bonne nouvelle: c'est le signe le plus probable d'une
  // MAUVAISE identification (mauvaise carte comparee a la mauvaise cote)
  // plutot qu'une vraie pepite. On prefere rater une remise extreme reelle
  // (tres rare) que risquer d'induire un achat sur une fausse alerte.
  if (discountPercent > 85) {
    return {
      isDeal: false,
      reason: "remise_suspecte",
      cardNameGuess: matchedName,
      referencePrice: referencePrice.toFixed(2),
      askingPrice: item.price,
      discountPercent: Math.round(discountPercent),
      identificationSource,
      titleGuess,
    };
  }

  if (discountPercent < thresholdPercent) {
    return {
      isDeal: false,
      reason: "sous_le_seuil",
      cardNameGuess: matchedName,
      referencePrice: referencePrice.toFixed(2),
      askingPrice: item.price,
      discountPercent: Math.round(discountPercent),
      identificationSource,
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
