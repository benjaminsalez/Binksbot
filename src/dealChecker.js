import { analyzeTitle } from "./matcher.js";
import { lookupCote } from "./cote.js";

/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a la cote (prix Cardmarket), en tenant compte de l'etat detecte.
 * Retourne null si on ne peut pas se prononcer de facon fiable (carte non
 * identifiee, pas de prix trouve, etat inconnu) -> on prefere rater une
 * annonce plutot que d'alerter sur une estimation bancale.
 */
/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a la cote (prix Cardmarket), en tenant compte de l'etat detecte.
 * Retourne TOUJOURS un objet diagnostic, avec isDeal:true/false et une
 * raison si ce n'est pas une bonne affaire confirmee -> utile pour debug.
 */
export async function checkIfGoodDeal(item, thresholdPercent) {
  const titleGuess = item.title?.slice(0, 60) || "";
  const analysis = analyzeTitle(item.title || "");

  if (!analysis.cardName) {
    return { isDeal: false, reason: "nom_carte_non_extrait", titleGuess };
  }

  const cote = await lookupCote(analysis.cardName, analysis.setNumber);
  if (!cote) {
    return { isDeal: false, reason: "cote_introuvable", cardNameGuess: analysis.cardName, titleGuess };
  }

  const conditionMultiplier = analysis.condition?.multiplier ?? 0.85;
  const referencePrice = cote.trendPrice * conditionMultiplier;

  if (!referencePrice || referencePrice <= 0 || !item.price) {
    return { isDeal: false, reason: "prix_invalide", cardNameGuess: analysis.cardName, titleGuess };
  }

  const discountPercent = ((referencePrice - item.price) / referencePrice) * 100;

  if (discountPercent < thresholdPercent) {
    return {
      isDeal: false,
      reason: "sous_le_seuil",
      cardNameGuess: cote.matchedName,
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
    cardName: cote.matchedName,
    setName: cote.setName,
    condition: analysis.condition?.tier || "estimee (excellent par defaut)",
    language: analysis.language || "non detectee",
    cardmarketUrl: cote.cardmarketUrl,
    ambiguous: cote.ambiguous,
  };
}
