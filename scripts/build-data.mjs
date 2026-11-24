// Merges every source into public/data/kjx.json:
//   curated (scripts/curated/*.mjs) > Wikidata > Wikidata extras > NOAA charts > OpenStreetMap
// Higher sources win; lower-source points within ~200 m of an existing entry are treated as duplicates.
import { readFile, writeFile } from 'node:fs/promises';
import treasureShips from './curated/treasure-ships.mjs';
import famous from './curated/famous-wrecks.mjs';
import aircraft from './curated/aircraft.mjs';
import lostTreasure from './curated/lost-treasure.mjs';
import myths from './curated/myths.mjs';
import vehicles from './curated/vehicles.mjs';
import myths2 from './curated/myths-2.mjs';

const load = async (file) => {
  try {
    return JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
  } catch {
    console.warn('  (missing ' + file + ' — skipped)');
    return file.endsWith('.json') && file.includes('fixes') ? {} : [];
  }
};

const fixes = await load('./curated/coord-fixes.json');
const curated = [...treasureShips, ...famous, ...aircraft, ...lostTreasure, ...myths, ...vehicles, ...myths2].map((e) => {
  const f = fixes[e.id];
  return { ...e, ...(f && !e.fixedPos ? { lat: f.lat, lon: f.lon } : {}), source: 'curated' };
});
const ids = new Set();
for (const e of curated) {
  if (ids.has(e.id)) throw new Error('duplicate curated id ' + e.id);
  ids.add(e.id);
  for (const k of ['name', 'category', 'veracity', 'status', 'lat', 'lon', 'radiusKm']) if (e[k] === undefined) throw new Error(`${e.id} missing ${k}`);
}

const wikidata = [...(await load('../public/data/wikidata.json')), ...(await load('../public/data/wikidata-extra.json')), ...(await load('../public/data/wikidata-myths.json'))];
const noaa = await load('../public/data/noaa.json');
const osm = await load('../public/data/osm.json');

const norm = (s) => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const strip = (s) => norm(s).replace(/^(rms|hms|hmhs|uss|ss|sms|mv|ms|ins|kri|ara|hmas|the|wreck of the|wreck of) /, '');

const out = [...curated];
const byWiki = new Map(curated.filter((e) => e.wiki).map((e) => [norm(e.wiki), e]));
const wdIds = new Set();

// spatial hash for ~200 m duplicate detection
const CELL = 0.002;
const grid = new Map();
const key = (lat, lon) => `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`;
const addGrid = (e) => {
  const k = key(e.lat, e.lon);
  (grid.get(k) || grid.set(k, []).get(k)).push(e);
};
const near = (e) => {
  const a = Math.floor(e.lat / CELL), b = Math.floor(e.lon / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const hit = grid.get(`${a + i},${b + j}`);
    if (hit) return hit[0];
  }
  return null;
};
curated.forEach(addGrid);

// Wikidata: merge into curated when it's the same article / same name nearby, otherwise add.
let merged = 0;
for (const w of wikidata) {
  if (wdIds.has(w.wikidata)) continue;
  wdIds.add(w.wikidata);
  let match = w.wiki && byWiki.get(norm(w.wiki));
  if (match && !(Math.abs(match.lat - w.lat) < 3 && Math.abs(match.lon - w.lon) < 3)) match = null;
  if (!match) {
    const wn = strip(w.name);
    match = curated.find((c) => Math.abs(c.lat - w.lat) < 1 && Math.abs(c.lon - w.lon) < 1 && wn.length > 3 && strip(c.name) === wn);
  }
  if (match) {
    for (const [k, v] of Object.entries(w)) {
      if (['id', 'source', 'veracity', 'status', 'category', 'radiusKm', 'treasure', 'lat', 'lon', 'summary', 'name'].includes(k)) continue;
      if (match[k] === undefined) match[k] = v;
    }
    match.wikidata = w.wikidata;
    merged++;
    continue;
  }
  out.push(w);
  addGrid(w);
}

// NOAA + OSM: skip anything that duplicates an existing point (or an existing Wikidata item).
let dupes = 0, named = 0;
for (const src of [noaa, osm]) {
  for (const e of src) {
    if (e.wikidata && wdIds.has(e.wikidata)) { dupes++; continue; }
    const hit = near(e);
    if (hit) {
      // A charted unnamed wreck next to a named one adds nothing; a name for an unnamed one does.
      if (/^(Charted|Unnamed)/.test(hit.name) && !/^(Charted|Unnamed)/.test(e.name) && hit.source !== 'curated') { hit.name = e.name; named++; }
      dupes++;
      continue;
    }
    out.push(e);
    addGrid(e);
  }
}

// Compact output: drop default values (the app fills them back in).
for (const e of out) {
  if (e.image) e.image = e.image.replace(/\?width=\d+/, '?width=500'); // Wikimedia only serves standard thumbnail widths
  if (e.lostYear === undefined && e.lost !== undefined) e.lostYear = parseInt(String(e.lost), 10);
  if (Number.isNaN(e.lostYear)) delete e.lostYear;
  if (e.veracity === 'confirmed') delete e.veracity;
  if (e.status === 'found') delete e.status;
  if (e.treasure === false) delete e.treasure;
  if (e.radiusKm === 0.2 && e.source !== 'curated') delete e.radiusKm;
}

await writeFile(new URL('../public/data/kjx.json', import.meta.url), JSON.stringify(out));
const count = (k, def) => out.reduce((m, e) => ((m[e[k] ?? def] = (m[e[k] ?? def] || 0) + 1), m), {});
console.log(`curated ${curated.length} (${Object.keys(fixes).length} positions corrected) · wikidata ${wikidata.length} (merged ${merged}) · noaa ${noaa.length} · osm ${osm.length} · duplicates skipped ${dupes} (${named} gave names)`);
console.log('TOTAL', out.length);
console.log('categories', count('category'));
console.log('sources', count('source'));
console.log('veracity', count('veracity', 'confirmed'));
