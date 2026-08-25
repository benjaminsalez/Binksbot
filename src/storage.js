import fs from "fs";
import path from "path";

const STORE_PATH = path.resolve("./data/seen.json");
const MAX_ENTRIES = 5000;

function ensureDir() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error("Impossible de creer le dossier data/:", err.message);
  }
}

export function loadSeenIds() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) return new Set();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function saveSeenIds(seenSet) {
  ensureDir();
  try {
    let arr = Array.from(seenSet);
    if (arr.length > MAX_ENTRIES) {
      arr = arr.slice(arr.length - MAX_ENTRIES);
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(arr), "utf-8");
  } catch (err) {
    // On ne fait JAMAIS planter le bot pour une erreur de sauvegarde:
    // au pire on reperdra un peu de memoire au prochain redemarrage,
    // mais le bot doit continuer a tourner.
    console.error("Impossible de sauvegarder seen.json:", err.message);
  }
}
