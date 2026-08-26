import axios from "axios";
import { createWorker } from "tesseract.js";

// On garde un seul "worker" Tesseract reutilise pour toutes les images,
// plutot que d'en recreer un a chaque fois (couteux en demarrage).
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("fra");
  }
  return workerPromise;
}

/**
 * Telecharge la photo d'une annonce Vinted et en extrait le texte visible
 * via OCR (gratuit, tourne localement, pas d'API externe). Utile quand le
 * titre de l'annonce ne permet pas d'identifier la carte, mais que la photo
 * montre clairement son nom/numero imprime dessus.
 * Retourne le texte brut extrait, ou null en cas d'echec (image
 * inaccessible, OCR en erreur, etc.) -> l'appelant doit alors se contenter
 * de l'identification par titre seule.
 */
export async function extractTextFromImage(imageUrl) {
  if (!imageUrl) return null;

  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
    });

    const worker = await getWorker();
    const { data } = await worker.recognize(Buffer.from(imageResponse.data));

    return data.text || null;
  } catch (err) {
    console.error(`Erreur OCR sur l'image:`, err.message);
    return null;
  }
}
