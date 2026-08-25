import "dotenv/config";
import { searchVinted } from "./vinted.js";
import { sendDiscordAlert } from "./discord.js";
import { loadSeenIds, saveSeenIds } from "./storage.js";

const {
  VINTED_DOMAIN = "vinted.fr",
  PRICE_MIN: GLOBAL_PRICE_MIN,
  PRICE_MAX: GLOBAL_PRICE_MAX,
  POLL_INTERVAL_SECONDS = "45",
  VINTED_COOKIE,
} = process.env;

// Parse une entree "mot-cle" ou "mot-cle:min-max" (min et max optionnels chacun)
function parseSearchEntry(entry) {
  const trimmed = entry.trim();
  const lastColon = trimmed.lastIndexOf(":");

  if (lastColon === -1) {
    return {
      searchText: trimmed,
      priceMin: GLOBAL_PRICE_MIN || undefined,
      priceMax: GLOBAL_PRICE_MAX || undefined,
    };
  }

  const keyword = trimmed.slice(0, lastColon).trim();
  const range = trimmed.slice(lastColon + 1).trim();
  const [minRaw, maxRaw] = range.split("-");

  return {
    searchText: keyword,
    priceMin: minRaw ? minRaw.trim() : GLOBAL_PRICE_MIN || undefined,
    priceMax: maxRaw ? maxRaw.trim() : GLOBAL_PRICE_MAX || undefined,
  };
}

/**
 * Construit les groupes (un salon Discord = un webhook + une liste de mots-cles)
 * a partir de toutes les paires de variables d'environnement
 * DISCORD_WEBHOOK_URL[_SUFFIXE] / VINTED_SEARCHES[_SUFFIXE].
 * Exemple: DISCORD_WEBHOOK_URL_JEUX + VINTED_SEARCHES_JEUX
 *          DISCORD_WEBHOOK_URL_CARTES + VINTED_SEARCHES_CARTES
 * La variante sans suffixe (DISCORD_WEBHOOK_URL / VINTED_SEARCHES) reste supportee.
 */
function buildGroups() {
  const groups = [];
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^DISCORD_WEBHOOK_URL(_.*)?$/);
    if (!match) continue;

    const suffix = match[1] || "";
    const webhookUrl = process.env[key];
    const searchesKey = `VINTED_SEARCHES${suffix}`;
    const searchesRaw = process.env[searchesKey];

    if (!webhookUrl || !searchesRaw) {
      console.warn(
        `Variable ${key} trouvee mais ${searchesKey} manquante ou vide, groupe ignore.`
      );
      continue;
    }

    const searches = searchesRaw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(parseSearchEntry);

    groups.push({
      label: suffix ? suffix.slice(1) : "default",
      webhookUrl,
      searches,
    });
  }
  return groups;
}

const groups = buildGroups();

if (groups.length === 0) {
  console.error(
    "Erreur: aucun groupe valide trouve. Il faut au moins DISCORD_WEBHOOK_URL + VINTED_SEARCHES (ou une variante suffixee)."
  );
  process.exit(1);
}

const intervalMs = Math.max(20, Number(POLL_INTERVAL_SECONDS)) * 1000;

// Le Set d'IDs vus est partage mais chaque entree est prefixee par le groupe,
// pour qu'une meme annonce puisse alerter plusieurs salons si elle correspond
// a plusieurs groupes differents.
let seenIds = loadSeenIds();
let isFirstRun = seenIds.size === 0;

async function checkOnce() {
  for (const group of groups) {
    for (const { searchText, priceMin, priceMax } of group.searches) {
      const priceLabel =
        priceMin || priceMax ? ` (${priceMin || "0"}-${priceMax || "∞"}€)` : "";
      const label = `${searchText}${priceLabel}`;
      const seenKey = (id) => `${group.label}::${id}`;

      try {
        const items = await searchVinted({
          domain: VINTED_DOMAIN,
          searchText,
          priceMin,
          priceMax,
          cookie: VINTED_COOKIE,
        });

        const newItems = items.filter((item) => !seenIds.has(seenKey(item.id)));

        for (const item of newItems) {
          seenIds.add(seenKey(item.id));
          if (!isFirstRun) {
            try {
              await sendDiscordAlert(group.webhookUrl, item, label);
              console.log(`Alerte envoyee [${group.label}]: [${label}] ${item.title}`);
            } catch (err) {
              console.error(`Erreur envoi Discord [${group.label}]:`, err.message);
            }
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        if (isFirstRun) {
          console.log(
            `Initialisation [${group.label}] "${label}": ${items.length} annonces existantes ignorees.`
          );
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 403 || status === 429 || status === 401) {
          console.error(
            `Bloque par Vinted (code ${status}) sur [${group.label}] "${label}". Verifie VINTED_COOKIE, voir README.`
          );
        } else {
          console.error(`Erreur recherche [${group.label}] "${label}":`, err.message);
        }
      }
    }
  }

  saveSeenIds(seenIds);
  isFirstRun = false;
}

const totalSearches = groups.reduce((sum, g) => sum + g.searches.length, 0);
console.log(
  `Bot demarre. ${groups.length} salon(s), ${totalSearches} recherche(s) au total, toutes les ${intervalMs / 1000}s sur ${VINTED_DOMAIN}.`
);

checkOnce();
setInterval(checkOnce, intervalMs);
