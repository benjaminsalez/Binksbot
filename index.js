import "dotenv/config";
import { searchVinted } from "./vinted.js";
import { sendDiscordAlert } from "./discord.js";
import { loadSeenIds, saveSeenIds } from "./storage.js";

const {
  DISCORD_WEBHOOK_URL,
  VINTED_SEARCHES,
  VINTED_DOMAIN = "vinted.fr",
  PRICE_MAX,
  POLL_INTERVAL_SECONDS = "45",
  VINTED_COOKIE,
} = process.env;

if (!DISCORD_WEBHOOK_URL) {
  console.error("Erreur: DISCORD_WEBHOOK_URL manquant dans .env");
  process.exit(1);
}

const searches = (VINTED_SEARCHES || "carte pokemon")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const intervalMs = Math.max(20, Number(POLL_INTERVAL_SECONDS)) * 1000;

let seenIds = loadSeenIds();
let isFirstRun = seenIds.size === 0;

async function checkOnce() {
  for (const searchText of searches) {
    try {
      const items = await searchVinted({
        domain: VINTED_DOMAIN,
        searchText,
        priceMax: PRICE_MAX,
        cookie: VINTED_COOKIE,
      });

      const newItems = items.filter((item) => !seenIds.has(item.id));

      for (const item of newItems) {
        seenIds.add(item.id);
        // Au tout premier lancement, on n'envoie pas d'alerte pour l'historique existant,
        // on marque juste tout comme "deja vu" pour ne pas spammer.
        if (!isFirstRun) {
          try {
            await sendDiscordAlert(DISCORD_WEBHOOK_URL, item, searchText);
            console.log(`Alerte envoyee: [${searchText}] ${item.title}`);
          } catch (err) {
            console.error("Erreur envoi Discord:", err.message);
          }
          // petite pause pour eviter le rate-limit Discord
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (isFirstRun) {
        console.log(
          `Initialisation "${searchText}": ${items.length} annonces existantes ignorees.`
        );
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 403 || status === 429) {
        console.error(
          `Bloque par Vinted (code ${status}) sur "${searchText}". Verifie VINTED_COOKIE dans le .env, voir README.`
        );
      } else {
        console.error(`Erreur recherche "${searchText}":`, err.message);
      }
    }
  }

  saveSeenIds(seenIds);
  isFirstRun = false;
}

console.log(
  `Bot demarre. Surveille ${searches.length} recherche(s) toutes les ${intervalMs / 1000}s sur ${VINTED_DOMAIN}.`
);

checkOnce();
setInterval(checkOnce, intervalMs);
