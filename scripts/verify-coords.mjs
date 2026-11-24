// Cross-checks curated positions against the coordinates on each entry's Wikipedia article.
// Only for confirmed, located wrecks (found / salvaged / partly found, small search radius):
// for legends and lost things the article's pin is usually somewhere else (a museum, a palace…).
// Writes scripts/curated/coord-fixes.json, which build-data.mjs applies. Run: npm run data:verify
import { writeFile } from 'node:fs/promises';
import treasureShips from './curated/treasure-ships.mjs';
import famous from './curated/famous-wrecks.mjs';
import aircraft from './curated/aircraft.mjs';
import lostTreasure from './curated/lost-treasure.mjs';
import myths from './curated/myths.mjs';
import vehicles from './curated/vehicles.mjs';
import myths2 from './curated/myths-2.mjs';

const all = [...treasureShips, ...famous, ...aircraft, ...lostTreasure, ...myths, ...vehicles, ...myths2];
const cands = all.filter((e) => e.wiki && e.veracity === 'confirmed' && e.status !== 'lost' && e.radiusKm <= 5 && !e.fixedPos);
const km = (a, b, c, d) => {
  const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

const fixes = {};
for (let i = 0; i < cands.length; i += 50) {
  const batch = cands.slice(i, i + 50);
  const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&redirects=1&format=json&formatversion=2&titles=' + encodeURIComponent(batch.map((e) => e.wiki.replace(/_/g, ' ')).join('|'));
  const d = await (await fetch(url, { headers: { 'User-Agent': 'KJX-builder/0.1' } })).json();
  const norm = new Map((d.query.normalized || []).map((n) => [n.from, n.to]));
  const redir = new Map((d.query.redirects || []).map((n) => [n.from, n.to]));
  const coords = new Map(d.query.pages.filter((p) => p.coordinates).map((p) => [p.title, p.coordinates[0]]));
  for (const e of batch) {
    let t = e.wiki.replace(/_/g, ' ');
    t = norm.get(t) || t;
    t = redir.get(t) || t;
    const c = coords.get(t);
    if (!c) continue;
    const dist = km(e.lat, e.lon, c.lat, c.lon);
    if (dist > 1 && dist < 400) {
      fixes[e.id] = { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), was: [e.lat, e.lon], movedKm: +dist.toFixed(1) };
      console.log(`${e.id.padEnd(32)} moved ${dist.toFixed(1).padStart(6)} km`);
    } else if (dist >= 400) console.log(`${e.id.padEnd(32)} SKIPPED (article pin ${dist.toFixed(0)} km away — probably not the wreck site)`);
  }
}
await writeFile(new URL('./curated/coord-fixes.json', import.meta.url), JSON.stringify(fixes, null, 2) + '\n');
console.log(`checked ${cands.length}, corrected ${Object.keys(fixes).length}`);
