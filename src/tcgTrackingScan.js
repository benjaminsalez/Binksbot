import axios from "axios";
import Jimp from "jimp";
import { analyzeTitle } from "./matcher.js";

const SCAN_URL = "https://tcgtracking.com/tcgapi/v1/scan";
const PRODUCT_URL = "https://tcgtracking.com/tcgapi/v1/products";
const POKEMON_GAME_ID = 3; // categorie "Pokemon" chez TCGTracking

// ATTENTION: cet endpoint gratuit est annonce comme devant fermer autour du
// 30 septembre 2026, remplace par une version payante (openapi.tcgtracking.com).
// A surveiller/reevaluer a cette echeance.

const MIN_DELAY_MS = 500;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Telecharge une image et la redimensionne/compresse jusqu'a passer sous la
 * limite de 100KB imposee par l'API de scan. Privilegie une reduction de
 * taille plutot qu'une chute agressive de qualite (mieux pour la
 * reconnaissance: garder les details nets plutot qu'une image floue).
 */
async function prepareImage(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15000 });
  let image = await Jimp.read(Buffer.from(response.data));

  let quality = 90;
  let width = 700;
  image = image.resize(width, Jimp.AUTO);
  image.quality(quality);
  let buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

  while (buffer.length > 95_000 && (width > 350 || quality > 60)) {
    if (width > 350) {
      // On reduit d'abord la taille (garde plus de nettete par pixel)
      // plutot que la qualite JPEG, qui degraderait davantage les details
      // fins necessaires a une bonne reconnaissance.
      width = Math.floor(width * 0.85);
      image = image.resize(width, Jimp.AUTO);
    } else {
      quality -= 10;
    }
    image.quality(quality);
    buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  }

  return buffer;
}

/**
 * Scanne UNE photo via TCGTracking et retourne le meilleur candidat brut
 * (product_id + score), sans filtrage de seuil ni recuperation du produit
 * complet -> utilise par scanCardImages() pour comparer plusieurs photos.
 */
async function scanSinglePhoto(imageUrl) {
  const buffer = await prepareImage(imageUrl);
  if (buffer.length > 100_000) {
    console.log("[TCGTracking] Image trop lourde meme apres compression, photo ignoree.");
    return null;
  }

  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  await throttle();
  const scanResponse = await axios.post(
    SCAN_URL,
    { game_id: POKEMON_GAME_ID, limit: 5, image: dataUri },
    { timeout: 20000 }
  );

  const results = scanResponse.data?.results || [];
  if (results.length === 0) return null;

  return results[0]; // { product_id, score }
}

async function fetchProductAndExtract(productId, score) {
  await throttle();
  const productResponse = await axios.get(`${PRODUCT_URL}/${productId}`, { timeout: 15000 });
  const product = productResponse.data?.product;

  if (!product) {
    console.log("[TCGTracking] Reponse produit inattendue, aucune donnee exploitable.");
    return null;
  }

  console.log(`[TCGTracking] Produit recupere:`, JSON.stringify(product).slice(0, 400));

  const combinedText = `${product.name || ""} ${product.search_blob || ""}`;
  const extracted = analyzeTitle(combinedText);

  if (!extracted.cardName) {
    console.log("[TCGTracking] Aucun nom de Pokemon reconnu dans le produit recupere.");
    return null;
  }

  return {
    cardName: extracted.cardName,
    setNumber: extracted.setNumber
      ? `${extracted.setNumber.number}/${extracted.setNumber.setTotal || ""}`
      : null,
    score,
  };
}

/**
 * Scanne la photo d'une annonce via TCGTracking pour identifier la carte.
 * Retourne les infos du produit correspondant si un match suffisamment
 * confiant est trouve, sinon null. Utilise en secours quand
 * l'identification par titre echoue.
 */
export async function scanCardImage(imageUrl) {
  if (!imageUrl) return null;

  try {
    const best = await scanSinglePhoto(imageUrl);
    if (!best) {
      console.log("[TCGTracking] Aucun candidat retourne par le scan.");
      return null;
    }

    console.log(`[TCGTracking] Meilleur candidat: product_id=${best.product_id}, score=${best.score}`);

    if (best.score < 45) {
      console.log(`[TCGTracking] Score trop faible (${best.score}), resultat ignore.`);
      return null;
    }

    return await fetchProductAndExtract(best.product_id, best.score);
  } catch (err) {
    console.error("[TCGTracking] Erreur:", err.response?.data?.error || err.message);
    return null;
  }
}

/**
 * Essaie plusieurs photos de la meme annonce (jusqu'a 3) et garde le
 * meilleur score obtenu -> une photo differente peut etre mieux cadree/
 * eclairee que la premiere. S'arrete des qu'un score deja tres bon (>=75)
 * est trouve, pour ne pas gaspiller d'appels inutiles.
 */
export async function scanCardImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return null;

  let bestOverall = null;

  for (const url of imageUrls) {
    try {
      const result = await scanSinglePhoto(url);
      if (result && (!bestOverall || result.score > bestOverall.score)) {
        bestOverall = result;
      }
      if (bestOverall && bestOverall.score >= 75) {
        break; // deja tres bon, pas la peine de tester les autres photos
      }
    } catch (err) {
      console.error("[TCGTracking] Erreur sur une photo:", err.response?.data?.error || err.message);
    }
  }

  if (!bestOverall) {
    console.log("[TCGTracking] Aucun candidat trouve sur les photos testees.");
    return null;
  }

  console.log(
    `[TCGTracking] Meilleur candidat (sur ${imageUrls.length} photo(s)): product_id=${bestOverall.product_id}, score=${bestOverall.score}`
  );

  if (bestOverall.score < 45) {
    console.log(`[TCGTracking] Score trop faible (${bestOverall.score}), resultat ignore.`);
    return null;
  }

  return await fetchProductAndExtract(bestOverall.product_id, bestOverall.score);
}
