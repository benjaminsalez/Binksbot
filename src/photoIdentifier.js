import axios from "axios";

// URL du micro-service Python d'identification par photo (a deployer
// separement sur Railway, voir photo_service/). Vide/non definie ->
// l'identification par photo est simplement desactivee, le bot continue de
// fonctionner normalement avec l'identification par titre uniquement.
const { PHOTO_IDENTIFIER_URL, DEAL_DEBUG } = process.env;
const dealDebugEnabled = DEAL_DEBUG === "true";

const TIMEOUT_MS = 20000;

// File d'attente simple : le service photo (PaddleOCR) ne traite qu'une
// image a la fois en interne -> si le bot envoie plusieurs requetes en
// parallele (plusieurs salons scannes en meme temps), elles se
// bousculaient et depassaient le timeout (observe en prod le 28/08,
// confirme par une courbe CPU quasi plate -> pas un souci de puissance,
// juste des requetes qui attendaient leur tour). On les met en file ici
// cote Node pour qu'elles patientent proprement au lieu de se percuter.
let queue = Promise.resolve();

function enqueue(task) {
  const result = queue.then(task, task);
  // On avale les erreurs ici pour ne jamais bloquer la file si une requete
  // echoue -> la suivante doit quand meme pouvoir s'executer.
  queue = result.catch(() => {});
  return result;
}

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
  if (!PHOTO_IDENTIFIER_URL) {
    if (dealDebugEnabled) {
      console.log("[DEBUG photo] PHOTO_IDENTIFIER_URL non definie, repli photo desactive.");
    }
    return null;
  }
  if (!photoUrl) {
    if (dealDebugEnabled) {
      console.log("[DEBUG photo] Aucune photo disponible sur cette annonce, repli photo ignore.");
    }
    return null;
  }

  return enqueue(async () => {
    if (dealDebugEnabled) {
      console.log(`[DEBUG photo] Tentative d'identification via photo: ${photoUrl}`);
    }

    try {
      const response = await axios.post(
        `${PHOTO_IDENTIFIER_URL}/identify`,
        { image_url: photoUrl },
        { timeout: TIMEOUT_MS }
      );

      const { name, hp, card_number, language, possible_lot, attacks } = response.data || {};

      if (dealDebugEnabled) {
        console.log(`[DEBUG photo] Reponse du service: ${JSON.stringify(response.data)}`);
      }

      if (!name) return null;

      return {
        cardName: name,
        hp: hp ?? null,
        cardNumber: card_number ?? null,
        language: language ?? null,
        possibleLot: possible_lot ?? false,
        attacks: attacks ?? [],
      };
    } catch (err) {
      console.error("Identification par photo echouee:", err.message);
      return null;
    }
  });
}
