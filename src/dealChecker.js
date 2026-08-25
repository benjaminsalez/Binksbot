import { analyzeTitle } from "./matcher.js";
import { lookupCote } from "./cote.js";

/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a la cote (prix Cardmarket), en tenant compte de l'etat detecte.
 * Retourne null si on ne peut pas se prononcer de facon fiable (carte non
 * identifiee, pas de prix trouve, etat inconnu) -> on prefere rater une
 * annonce plutot que d'alerter sur une estimation bancale.
 */
export async function checkIfGoodDeal(item, thresholdPercent) {
  const analysis = analyzeTitle(item.title || "");

  if (!analysis.cardName) return null;

  const cote = await lookupCote(analysis.cardName, analysis.setNumber);
  if (!cote) return null;

  // Si l'etat n'est pas mentionne dans le titre, on part du principe le plus
  // prudent possible: on suppose un etat "excellent" par defaut (multiplicateur
  // eleve), pour ne jamais sur-estimer la remise et alerter a tort.
  const conditionMultiplier = analysis.condition?.multiplier ?? 0.85;
  const referencePrice = cote.trendPrice * conditionMultiplier;

  if (!referencePrice || referencePrice <= 0) return null;
  if (!item.price) return null;

  const discountPercent = ((referencePrice - item.price) / referencePrice) * 100;

  if (discountPercent < thresholdPercent) return null;

  return {
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
