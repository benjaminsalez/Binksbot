import axios from "axios";

/**
 * Recupere les dernieres annonces Vinted pour une recherche donnee.
 * Utilise l'API interne (non officielle) de Vinted.
 */
export async function searchVinted({ domain, searchText, priceMax, cookie }) {
  const params = new URLSearchParams({
    search_text: searchText,
    order: "newest_first",
    per_page: "20",
  });

  if (priceMax) {
    params.set("price_to", String(priceMax));
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

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    price: item.price?.amount ?? item.total_item_price?.amount,
    currency: item.price?.currency_code ?? "EUR",
    url: item.url,
    photoUrl: item.photo?.url ?? item.photos?.[0]?.url ?? null,
    brand: item.brand_title ?? null,
    user: item.user?.login ?? "inconnu",
  }));
}
