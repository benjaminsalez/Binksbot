import "dotenv/config";
import { searchVinted } from "./vinted.js";
import { sendDiscordAlert } from "./discord.js";
import { loadSeenIds, saveSeenIds } from "./storage.js";
import { checkIfGoodDeal } from "./dealChecker.js";
import { rotateRailwayRegion } from "./railwayRotator.js";

const {
  VINTED_DOMAIN = "vinted.fr",
  PRICE_MIN: GLOBAL_PRICE_MIN,
  PRICE_MAX: GLOBAL_PRICE_MAX,
  POLL_INTERVAL_SECONDS = "45",
  VINTED_COOKIE,
  DISCORD_GIFS,
  DEAL_DEBUG,
} = process.env;

const dealDebugEnabled = DEAL_DEBUG === "true";

// Liste de GIFs decoratifs (optionnel). Separer plusieurs liens par des virgules.
const gifUrls = (DISCORD_GIFS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function pickRandomGif() {
  if (gifUrls.length === 0) return undefined;
  return gifUrls[Math.floor(Math.random() * gifUrls.length)];
}

// Parse une entree combinant plusieurs options facultatives:
//  mot-cle              -> recherche simple
//  mot-cle:min-max      -> fourchette de prix
//  mot-cle!excl1,excl2  -> mots a exclure du titre
//  mot-cle#3002         -> restreindre a une categorie Vinted (catalog_id)
//  mot-cle$30           -> mode "bonne affaire": n'alerte que si le prix est
//                          au moins 30% sous la cote Cardmarket estimee
// Combinable dans n'importe quel ordre, ex: "pokemon emeraude#3002!carte:10-50"
function parseSearchEntry(entry) {
  let remainder = entry.trim();
  let excludeWords = [];
  let catalogId;
  let dealThreshold;

  const dollarMatch = remainder.match(/\$(\d+)/);
  if (dollarMatch) {
    dealThreshold = Number(dollarMatch[1]);
    remainder = remainder.replace(dollarMatch[0], "").trim();
  }

  const catalogMatch = remainder.match(/#(\d+)/);
  if (catalogMatch) {
    catalogId = catalogMatch[1];
    remainder = remainder.replace(catalogMatch[0], "").trim();
  }

  const bangIndex = remainder.indexOf("!");
  if (bangIndex !== -1) {
    const excludeRaw = remainder.slice(bangIndex + 1);
    excludeWords = excludeRaw
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    remainder = remainder.slice(0, bangIndex).trim();
  }

  const lastColon = remainder.lastIndexOf(":");
  if (lastColon === -1) {
    return {
      searchText: remainder.trim(),
      priceMin: GLOBAL_PRICE_MIN || undefined,
      priceMax: GLOBAL_PRICE_MAX || undefined,
      excludeWords,
      catalogId,
      dealThreshold,
    };
  }

  const keyword = remainder.slice(0, lastColon).trim();
  const range = remainder.slice(lastColon + 1).trim();
  const [minRaw, maxRaw] = range.split("-");

  return {
    searchText: keyword,
    priceMin: minRaw ? minRaw.trim() : GLOBAL_PRICE_MIN || undefined,
    priceMax: maxRaw ? maxRaw.trim() : GLOBAL_PRICE_MAX || undefined,
    excludeWords,
    catalogId,
    dealThreshold,
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

// Le Set d'IDs vus est partage, chaque entree est prefixee par le groupe ET la recherche
// exacte, pour qu'une meme annonce puisse alerter plusieurs salons si elle correspond
// a plusieurs groupes differents, et pour que chaque recherche ait sa propre
// initialisation silencieuse (independante des autres recherches deja en place).
let seenIds = loadSeenIds();

async function checkOnce() {
  let blockedDetected = false;
  const activeCookie = VINTED_COOKIE;

  for (const group of groups) {
    for (const { searchText, priceMin, priceMax, excludeWords, catalogId, dealThreshold } of group.searches) {
      const priceLabel =
        priceMin || priceMax ? ` (${priceMin || "0"}-${priceMax || "∞"}€)` : "";
      const label = `${searchText}${priceLabel}`;
      // Le dedoublonnage des annonces se fait par SALON (group.label) uniquement,
      // pour qu'une meme annonce qui matche plusieurs mots-cles du meme salon
      // ne soit alertee qu'une seule fois.
      const itemSeenKey = (id) => `${group.label}::item::${id}`;
      // L'initialisation silencieuse, elle, reste par recherche individuelle,
      // pour qu'ajouter un nouveau mot-cle dans un salon existant n'alerte pas
      // sur les annonces deja presentes pour ce nouveau mot-cle.
      const initMarker = `${group.label}::search::${searchText}::__init__`;
      const isSearchFirstRun = !seenIds.has(initMarker);

      try {
        const rawItems = await searchVinted({
          domain: VINTED_DOMAIN,
          searchText,
          priceMin,
          priceMax,
          catalogId,
          cookie: activeCookie,
        });

        const items =
          excludeWords && excludeWords.length > 0
            ? rawItems.filter((item) => {
                const titleLower = (item.title || "").toLowerCase();
                return !excludeWords.some((w) => titleLower.includes(w));
              })
            : rawItems;

        const newItems = items.filter((item) => !seenIds.has(itemSeenKey(item.id)));

        let analyzedCount = 0;
        let dealsFoundCount = 0;

        for (const item of newItems) {
          seenIds.add(itemSeenKey(item.id));
          if (!isSearchFirstRun) {
            let dealInfo = null;
            if (dealThreshold) {
              analyzedCount++;
              const result = await checkIfGoodDeal(item, dealThreshold);

              if (dealDebugEnabled) {
                console.log(`[DEBUG ${group.label}]`, JSON.stringify(result));
              }

              if (!result.isDeal) continue; // pas une bonne affaire confirmee -> on ignore silencieusement
              dealInfo = result;
              dealsFoundCount++;
            }

            try {
              await sendDiscordAlert(group.webhookUrl, item, label, pickRandomGif(), dealInfo);
              const dealSuffix = dealInfo ? ` [BONNE AFFAIRE -${dealInfo.discountPercent}%]` : "";
              console.log(`Alerte envoyee [${group.label}]: [${label}] ${item.title}${dealSuffix}`);
            } catch (err) {
              console.error(`Erreur envoi Discord [${group.label}]:`, err.message);
            }
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        if (dealThreshold && analyzedCount > 0) {
          console.log(
            `[${group.label}] "${label}": ${analyzedCount} nouvelle(s) annonce(s) analysee(s), ${dealsFoundCount} bonne(s) affaire(s) trouvee(s).`
          );
        }

        if (isSearchFirstRun) {
          seenIds.add(initMarker);
          console.log(
            `Initialisation [${group.label}] "${label}": ${items.length} annonces existantes ignorees.`
          );
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 403 || status === 429 || status === 401) {
          blockedDetected = true;
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
  return blockedDetected;
}

const totalSearches = groups.reduce((sum, g) => sum + g.searches.length, 0);
console.log(
  `Bot demarre. ${groups.length} salon(s), ${totalSearches} recherche(s) au total, toutes les ${intervalMs / 1000}s sur ${VINTED_DOMAIN}.`
);

// Pause progressive: si Vinted bloque plusieurs fois de suite, on espace les
// tentatives (double a chaque echec) jusqu'a un plafond de 15 minutes, puis on
// revient a l'intervalle normal des que ca repasse. Evite de marteler Vinted
// pendant un blocage et reduit le risque d'aggraver la detection.
const MAX_BACKOFF_MS = 15 * 60 * 1000;
// Apres ce nombre d'echecs consecutifs, on tente une rotation de region
// Railway (nouvelle IP) plutot que d'attendre indefiniment sur la meme IP
// probablement flaguee. Necessite RAILWAY_API_TOKEN/SERVICE_ID/ENVIRONMENT_ID.
const ROTATE_AFTER_N_FAILURES = 4;
let consecutiveBlocks = 0;

async function loop() {
  let blocked = false;
  try {
    blocked = await checkOnce();
  } catch (err) {
    // Filet de securite ultime: quoi qu'il arrive, le bot ne doit jamais
    // planter completement, juste logger et continuer au cycle suivant.
    console.error("Erreur inattendue dans checkOnce, le bot continue:", err.message);
  }

  if (blocked) {
    consecutiveBlocks += 1;

    if (consecutiveBlocks === ROTATE_AFTER_N_FAILURES) {
      console.warn(
        `${ROTATE_AFTER_N_FAILURES} echecs consecutifs, tentative de rotation de region Railway...`
      );
      const rotated = await rotateRailwayRegion();
      if (rotated) {
        // Le processus va etre tue par Railway pendant la migration, pas la
        // peine de programmer un prochain cycle.
        return;
      }
      // Si la rotation echoue (cle manquante, erreur API), on continue avec
      // le backoff normal plutot que de rester bloque silencieusement.
    }

    const backoffMs = Math.min(intervalMs * 2 ** consecutiveBlocks, MAX_BACKOFF_MS);
    console.warn(
      `Blocage detecte, pause de ${Math.round(backoffMs / 1000)}s avant la prochaine tentative (echec n°${consecutiveBlocks}).`
    );
    setTimeout(loop, backoffMs);
  } else {
    if (consecutiveBlocks > 0) {
      console.log("Blocage resolu, retour a l'intervalle normal.");
    }
    consecutiveBlocks = 0;
    setTimeout(loop, intervalMs);
  }
}

loop();
