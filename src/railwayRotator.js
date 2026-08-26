import axios from "axios";
import fs from "fs";
import path from "path";

const { RAILWAY_API_TOKEN, RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT_ID, RAILWAY_SKIP_REGIONS } =
  process.env;

const GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";

// Les 4 regions actuellement disponibles chez Railway (aout 2026).
const ALL_REGIONS = [
  "us-west2",
  "us-east4-eqdc4a",
  "europe-west4-drams3a",
  "asia-southeast1-eqsg3a",
];

// On exclut celles deja connues comme flaguees (variable optionnelle,
// separee par des virgules, ex: "us-west2,europe-west4-drams3a").
const skipSet = new Set(
  (RAILWAY_SKIP_REGIONS || "").split(",").map((r) => r.trim()).filter(Boolean)
);
const REGIONS = ALL_REGIONS.filter((r) => !skipSet.has(r));

if (REGIONS.length === 0) {
  console.error(
    "RAILWAY_SKIP_REGIONS exclut toutes les regions disponibles ! Retire au moins une region de la liste."
  );
}

const STATE_PATH = path.resolve("./data/region_state.json");

function loadCurrentRegionIndex() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    const { index } = JSON.parse(raw);
    return Number.isInteger(index) ? index : 0;
  } catch {
    return 0;
  }
}

function saveCurrentRegionIndex(index) {
  try {
    const dir = path.dirname(STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify({ index }), "utf-8");
  } catch (err) {
    console.error("Impossible de sauvegarder l'index de region:", err.message);
  }
}

async function callRailwayAPI(query, variables) {
  const response = await axios.post(
    GRAPHQL_URL,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
  if (response.data.errors) {
    throw new Error(JSON.stringify(response.data.errors));
  }
  return response.data.data;
}

/**
 * Change la region du service vers la prochaine de la liste (rotation), puis
 * declenche un redeploiement pour appliquer le changement. Le processus
 * actuel va etre tue par Railway pendant la migration -> c'est normal et
 * attendu, pas la peine de continuer l'execution apres cet appel.
 * A utiliser en dernier recours, apres plusieurs echecs consecutifs.
 */
export async function rotateRailwayRegion() {
  if (REGIONS.length === 0) {
    console.error("Rotation impossible: aucune region disponible (toutes exclues via RAILWAY_SKIP_REGIONS).");
    return false;
  }

  if (!RAILWAY_API_TOKEN || !RAILWAY_SERVICE_ID || !RAILWAY_ENVIRONMENT_ID) {
    console.error(
      "Rotation de region impossible: RAILWAY_API_TOKEN, RAILWAY_SERVICE_ID ou RAILWAY_ENVIRONMENT_ID manquant."
    );
    return false;
  }

  const currentIndex = loadCurrentRegionIndex();
  const nextIndex = (currentIndex + 1) % REGIONS.length;
  const nextRegion = REGIONS[nextIndex];

  console.warn(`Rotation de region Railway: passage a "${nextRegion}"...`);

  try {
    await callRailwayAPI(
      `mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
      }`,
      {
        serviceId: RAILWAY_SERVICE_ID,
        environmentId: RAILWAY_ENVIRONMENT_ID,
        input: { region: nextRegion },
      }
    );

    await callRailwayAPI(
      `mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
      }`,
      {
        serviceId: RAILWAY_SERVICE_ID,
        environmentId: RAILWAY_ENVIRONMENT_ID,
      }
    );

    saveCurrentRegionIndex(nextIndex);
    console.warn(`Redeploiement declenche sur "${nextRegion}". Le processus va redemarrer.`);
    return true;
  } catch (err) {
    console.error("Erreur lors de la rotation de region Railway:", err.message);
    return false;
  }
}
