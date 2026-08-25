import { analyzeTitle } from "./matcher.js";
import { lookupCote } from "./cote.js";
import { lookupEbayCote } from "./coteEbay.js";
import { translateToEnglish } from "./pokemonNamesFr.js";

/**
 * Analyse une annonce et determine si c'est une bonne affaire par rapport
 * a une cote de reference, en tenant compte de l'etat detecte.
 * Retourne TOUJOURS un objet diagnostic, avec isDeal:true/false et une
 * raison si ce n'est pas une bonne affaire confirmee -> utile pour debug.
 *
 * Source de la cote:
 *  1. eBay (annonces en cours sur eBay France, marketplace EBAY_FR) -> prix
 *     median, plus proche du marche francais reel, mais PAS un historique
 *     de ventes reelles (limite d'acces API), juste des annonces en cours.
 *  2. pokemontcg.io (prix Cardmarket) en secours si eBay ne donne rien ou
 *     si les cles EBAY_CLIENT_ID/EBAY_CLIENT_SECRET ne sont pas configurees.
 */
export async function checkIfGoodDeal(item, thresholdPercent) {
  const titleGuess = item.title?.slice(0, 60) || "";
  const analysis = analyzeTitle(item.title || "");

  if (!analysis.cardName) {
    return { isDeal: false, reason: "nom_carte_non_extrait", titleGuess };
  }

  // On exclut les annonces explicitement dans une autre langue que le
  // francais (le titre mentionne "EN", "anglais", "jap", "allemande"...).
  // Si la langue n'est pas precisee du tout, on part du principe qu'elle
  // est francaise par defaut (site vinted.fr).
  if (analysis.language && analysis.language !== "fr") {
    return { isDeal: false, reason: "langue_non_fr", langueDetectee: analysis.language, titleGuess };
  }

  let referencePrice = null;
  let source = null;
  let matchedName = analysis.cardName;
  let cardmarketUrl = null;
  let ambiguous = false;
  let setName = null;

  const conditionMultiplier = analysis.condition?.multiplier ?? 0.85;

  // 1. Tentative eBay (nom en francais, marketplace France)
  const ebayCote = await lookupEbayCote(analysis.cardName);
  if (ebayCote) {
    referencePrice = ebayCote.medianPrice * conditionMultiplier;
    source = `eBay (${ebayCote.sampleSize} annonces en cours)`;
    matchedName = analysis.cardName;
  }

  // 2. Secours: pokemontcg.io (nom traduit en anglais)
  if (!referencePrice) {
    const translatedName = translateToEnglish(analysis.cardName);
    let cote = await lookupCote(translatedName, analysis.setNumber);
    if (!cote && translatedName !== analysis.cardName) {
      cote = await lookupCote(analysis.cardName, analysis.setNumber);
    }
    if (cote) {
      referencePrice = cote.trendPrice * conditionMultiplier;
      source = "pokemontcg.io (Cardmarket)";
      matchedName = cote.matchedName;
      cardmarketUrl = cote.cardmarketUrl;
      ambiguous = cote.ambiguous;
      setName = cote.setName;
    }
  }

  if (!referencePrice) {
    return { isDeal: false, reason: "cote_introuvable", cardNameGuess: analysis.cardName, titleGuess };
  }

  if (referencePrice <= 0 || !item.price) {
    return { isDeal: false, reason: "prix_invalide", cardNameGuess: analysis.cardName, titleGuess };
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
    condition: analysis.condition?.tier || "estimee (excellent par defaut)",
    language: analysis.language || "non detectee",
    cardmarketUrl,
    ambiguous,
    source,
  };
}
