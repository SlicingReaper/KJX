// Merges the hand-curated entries with the Wikidata bulk pull into public/data/kjx.json.
// Curated entries win on conflicts; Wikidata fills in missing fields (image, tonnage, ...).
import { readFile, writeFile } from 'node:fs/promises';
import treasureShips from './curated/treasure-ships.mjs';
import famous from './curated/famous-wrecks.mjs';
import aircraft from './curated/aircraft.mjs';
import lostTreasure from './curated/lost-treasure.mjs';
import myths from './curated/myths.mjs';

const curated = [...treasureShips, ...famous, ...aircraft, ...lostTreasure, ...myths].map((e) => ({ ...e, source: 'curated' }));

let wikidata = [];
try {
  wikidata = JSON.parse(await readFile(new URL('../public/data/wikidata.json', import.meta.url), 'utf8'));
} catch {
  console.warn('No wikidata.json yet — run `npm run data:wikidata` first. Building curated-only.');
}

const ids = new Set();
for (const e of curated) {
  if (ids.has(e.id)) throw new Error('duplicate curated id ' + e.id);
  ids.add(e.id);
  for (const k of ['name', 'category', 'veracity', 'status', 'lat', 'lon', 'radiusKm']) {
    if (e[k] === undefined) throw new Error(`${e.id} missing ${k}`);
  }
}

const norm = (s) => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const byWiki = new Map();
for (const e of curated) if (e.wiki) byWiki.set(norm(e.wiki), e);

const out = [...curated];
let merged = 0;
for (const w of wikidata) {
  let match = w.wiki && byWiki.get(norm(w.wiki));
  if (!match) {
    // Same name (ignoring prefixes like RMS/HMS/SS) within ~100 km → same wreck.
    const strip = (s) => norm(s).replace(/^(rms|hms|hmhs|uss|ss|sms|mv|ms|ins|kri|ara|hmas|the|wreck of the|wreck of) /, '');
    const wn = strip(w.name);
    match = curated.find((c) => Math.abs(c.lat - w.lat) < 1 && Math.abs(c.lon - w.lon) < 1 && wn.length > 3 && strip(c.name) === wn);
  }
  // Only merge if the Wikidata item is near the curated one (some curated entries share an article, e.g. a fleet).
  if (match && Math.abs(match.lat - w.lat) < 3 && Math.abs(match.lon - w.lon) < 3) {
    for (const [k, v] of Object.entries(w)) {
      if (['id', 'source', 'veracity', 'status', 'category', 'radiusKm', 'treasure', 'lat', 'lon', 'summary', 'name'].includes(k)) continue;
      if (match[k] === undefined) match[k] = v;
    }
    match.wikidata = w.wikidata;
    merged++;
    continue;
  }
  out.push(w);
}

for (const e of out) {
  if (e.lostYear === undefined && e.lost !== undefined) e.lostYear = parseInt(String(e.lost), 10);
  if (Number.isNaN(e.lostYear)) delete e.lostYear;
}

await writeFile(new URL('../public/data/kjx.json', import.meta.url), JSON.stringify(out));
const count = (k) => out.reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
console.log(`curated ${curated.length} · wikidata ${wikidata.length} · merged ${merged} · total ${out.length}`);
console.log('categories', count('category'));
console.log('veracity', count('veracity'));
console.log('treasure', out.filter((e) => e.treasure).length);
