import axios from "axios";

// URL du micro-service Python d'identification par photo (a deployer
// separement sur Railway, voir photo_service/). Vide/non definie ->
// l'identification par photo est simplement desactivee, le bot continue de
// fonctionner normalement avec l'identification par titre uniquement.
const { PHOTO_IDENTIFIER_URL } = process.env;

const TIMEOUT_MS = 12000;

/**
 * Essaie d'identifier une carte a partir de sa photo Vinted, EN REPLI
 * uniquement (quand l'analyse du titre ne suffit pas). Ne renvoie que le
 * nom du Pokemon pour l'instant (les PV/attaques sont extraits par le
 * service mais pas encore exploites cote Node -> voir note plus bas).
 *
 * Ne leve jamais d'exception : en cas d'echec (service down, timeout,
 * photo illisible...), retourne simplement null et le bot continue avec
 * ce qu'il avait deja (comportement identique a avant l'ajout de cette
 * fonctionnalite).
 */
export async function identifyCardFromPhoto(photoUrl) {
  if (!PHOTO_IDENTIFIER_URL || !photoUrl) return null;

  try {
    const response = await axios.post(
      `${PHOTO_IDENTIFIER_URL}/identify`,
      { image_url: photoUrl },
      { timeout: TIMEOUT_MS }
    );

    const { name, hp, attacks } = response.data || {};
    if (!name) return null;

    return {
      cardName: name,
      hp: hp ?? null,
      attacks: attacks ?? [],
    };
  } catch (err) {
    console.error("Identification par photo echouee:", err.message);
    return null;
  }
}
