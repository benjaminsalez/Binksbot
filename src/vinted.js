import axios from "axios";

/**
 * Recupere les dernieres annonces Vinted pour une recherche donnee.
 * Utilise l'API interne (non officielle) de Vinted.
 */
export async function searchVinted({ domain, searchText, priceMin, priceMax, catalogId, cookie }) {
  const params = new URLSearchParams({
    search_text: searchText,
    order: "newest_first",
    per_page: "20",
  });

  if (priceMin) {
    params.set("price_from", String(priceMin));
  }
  if (priceMax) {
    params.set("price_to", String(priceMax));
  }
  if (catalogId) {
    params.set("catalog_ids", String(catalogId));
  }

  const url = `https://www.${domain}/api/v2/catalog/items?${params.toString()}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9",
    Referer: `https://www.${domain}/`,
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await axios.get(url, { headers, timeout: 15000 });
  const items = response.data?.items ?? [];

  if (process.env.RAW_DEBUG === "true" && items.length > 0) {
    console.log("=== RAW_DEBUG: structure brute du 1er item ===");
    console.log(JSON.stringify(items[0], null, 2));
  }

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    price: item.price?.amount ?? item.total_item_price?.amount,
    currency: item.price?.currency_code ?? "EUR",
    url: item.url,
    photoUrl: item.photo?.url ?? item.photos?.[0]?.url ?? null,
    // Version haute resolution de la photo (la premiere), utilisee pour
    // l'OCR/le scan d'image -> la miniature normale est trop petite/floue.
    photoHighResUrl:
      item.photo?.full_size_url ??
      item.photo?.high_resolution?.url ??
      item.photos?.[0]?.full_size_url ??
      item.photos?.[0]?.high_resolution?.url ??
      item.photo?.url ??
      null,
    // Jusqu'a 3 photos haute resolution de l'annonce (pas juste la
    // premiere) -> utile pour le scan d'image, une photo differente peut
    // etre mieux cadree/eclairee que la premiere.
    photoHighResUrls: (item.photos || [])
      .slice(0, 3)
      .map((p) => p.full_size_url ?? p.high_resolution?.url ?? p.url)
      .filter(Boolean),
    brand: item.brand_title ?? null,
    user: item.user?.login ?? "inconnu",
    isBusiness: item.user?.business === true,
    isPromoted: item.promoted === true,
    vintedStatus: item.status ?? null,
    favouriteCount: item.favourite_count ?? null,
    viewCount: item.view_count ?? null,
  }));
}
