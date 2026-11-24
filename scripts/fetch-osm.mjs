// Pulls every wreck mapped in OpenStreetMap: ship wrecks (historic=wreck, seamark:type=wreck),
// aircraft wrecks (historic=aircraft_wreck), and vehicle wrecks (cars, tanks, trains, buses…).
// Uses small global tag-index queries against public Overpass mirrors, with long backoff.
// Writes public/data/osm.json. Run: npm run data:osm   (slow — 20–60 min depending on server load)
import { writeFile, readFile, mkdir } from 'node:fs/promises';

const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const UA = 'KJX-builder/0.1 (personal treasure-map project)';
const CACHE = new URL('../public/data/.osm-tiles.json', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cache = {};
try { cache = JSON.parse(await readFile(CACHE, 'utf8')); } catch {}

// Public Overpass mirrors cap queries at ~45 s, so we ask many small *global* questions that hit
// the tag index (fast) instead of scanning bounding boxes (slow).
const CATS = ['hull_showing', 'dangerous', 'non-dangerous', 'distributed_remains', 'hull_visible', 'mast_showing'];
const QUERIES = [
  ['aircraft', 'nwr["historic"="aircraft_wreck"]'],
  ['hist-node', 'node["historic"="wreck"]'],
  ['hist-way', 'way["historic"="wreck"]'],
  ['hist-rel', 'relation["historic"="wreck"]'],
  ...CATS.map((c) => ['seamark-' + c, `node["seamark:wreck:category"="${c}"]`]),
  ['seamark-way', 'way["seamark:type"="wreck"]'],
  ['seamark-uncat', 'node["seamark:type"="wreck"][!"seamark:wreck:category"]'],
];

async function overpass(sel) {
  const q = `[out:json][timeout:40];${sel};out center tags;`;
  for (let attempt = 0; attempt < 30; attempt++) {
    const ep = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      const txt = await r.text();
      if (!r.ok || !txt.startsWith('{')) throw new Error(`HTTP ${r.status}`);
      const d = JSON.parse(txt);
      if (d.remark && /runtime error|timed out|out of memory/i.test(d.remark)) throw new Error(d.remark.slice(0, 80));
      return d.elements;
    } catch (err) {
      const wait = Math.min(300000, 20000 * (1 + Math.floor(attempt / ENDPOINTS.length)));
      console.warn(`  ${sel.slice(0, 60)} @ ${new URL(ep).host}: ${err.message} — retry in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  return null;
}

for (const [key, sel] of QUERIES) {
  if (cache[key]) { console.log(`${key}: cached (${cache[key].length})`); continue; }
  const els = await overpass(sel);
  if (els) {
    cache[key] = els;
    await writeFile(CACHE, JSON.stringify(cache));
    console.log(`${key}: ${els.length}`);
  } else console.warn(`${key}: gave up`);
  await sleep(10000);
}

const CAR = /car|automobile|truck|lorry|bus|van|jeep|motorcycle|vehicle/i;
const TRAIN = /train|locomotive|railcar|railway|tram|wagon/i;
const TANK = /tank|armou?red|military vehicle|half-?track/i;
const PLANE = /aircraft|plane|airplane|aeroplane|helicopter|glider|bomber|fighter|airliner/i;
const SUB = /submarine|u-?boat/i;
const seen = new Set();
const out = [];
for (const els of Object.values(cache)) {
  for (const el of els) {
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const kind = [t['wreck:type'], t['historic:wreck_type'], t['seamark:wreck:category'], t.wreck, t.description].filter(Boolean).join(' ');
    let category = 'ship';
    if (t.historic === 'aircraft_wreck' || PLANE.test(t['wreck:type'] || '')) category = 'aircraft';
    else if (TANK.test(kind) || t.historic === 'tank') category = 'vehicle';
    else if (TRAIN.test(t['wreck:type'] || '') || CAR.test(t['wreck:type'] || '')) category = 'vehicle';
    else if (SUB.test(kind) || SUB.test(t.name || '')) category = 'submarine';
    const name = t.name || t['seamark:name'] || t['wreck:name'] || t['name:en'] || t['aircraft:type'] || t.model || '';
    const year = (s) => (s && /-?\d{3,4}/.exec(s) ? parseInt(/-?\d{3,4}/.exec(s)[0], 10) : undefined);
    const lost = t['wreck:date_sunk'] || t['date_crashed'] || t['wreck:date'] || t['start_date:wreck'] || t['crash_date'];
    const depth = parseFloat(t['wreck:depth'] || t.depth || t['seamark:wreck:depth'] || t['wreck:clearance']);
    const typeTxt = t['wreck:type'] || t['aircraft:type'] || t['aircraft:model'] || t.model || (category === 'aircraft' ? 'Aircraft wreck' : category === 'vehicle' ? 'Vehicle wreck' : 'Wreck');
    const summary = [
      t.description || t.inscription || t.note,
      t['wreck:cargo'] ? `Cargo: ${t['wreck:cargo']}.` : '',
      t['wreck:visible_at_low_tide'] === 'yes' ? 'Visible at low tide.' : '',
      t['seamark:wreck:category'] ? `Charted as ${t['seamark:wreck:category'].replace(/_/g, ' ')}.` : '',
      'Mapped in OpenStreetMap.',
    ].filter(Boolean).join(' ');
    const e = {
      id: 'osm-' + el.type[0] + el.id,
      name: name || (category === 'aircraft' ? 'Unnamed aircraft wreck' : category === 'vehicle' ? 'Unnamed vehicle wreck' : 'Unnamed wreck'),
      category,
      veracity: 'confirmed',
      status: 'found',
      treasure: false,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      radiusKm: 0.2,
      type: typeTxt.charAt(0).toUpperCase() + typeTxt.slice(1).replace(/_/g, ' '),
      built: year(t['wreck:date_built'] || t['start_date:built']),
      lost: lost || undefined,
      lostYear: year(lost),
      depthM: isFinite(depth) ? Math.round(depth) : undefined,
      lengthM: parseFloat(t['wreck:length']) || undefined,
      country: t['wreck:nationality'] || t['flag'] || undefined,
      summary,
      wiki: t.wikipedia && t.wikipedia.startsWith('en:') ? t.wikipedia.slice(3).replace(/ /g, '_') : undefined,
      wikidata: t.wikidata,
      source: 'osm',
    };
    for (const k of Object.keys(e)) if (e[k] === undefined || e[k] === '') delete e[k];
    out.push(e);
  }
}
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/osm.json', import.meta.url), JSON.stringify(out));
const by = out.reduce((m, e) => ((m[e.category] = (m[e.category] || 0) + 1), m), {});
console.log('wrote', out.length, 'OSM wrecks', by, '· named', out.filter((e) => !e.name.startsWith('Unnamed')).length);
