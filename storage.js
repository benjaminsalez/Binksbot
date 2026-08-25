import fs from "fs";
import path from "path";

const STORE_PATH = path.resolve("./data/seen.json");
const MAX_ENTRIES = 5000;

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  let arr = Array.from(seenSet);
  if (arr.length > MAX_ENTRIES) {
    arr = arr.slice(arr.length - MAX_ENTRIES);
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(arr), "utf-8");
}
