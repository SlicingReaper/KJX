// Pulls every mapped shipwreck, aviation accident, treasure hoard and sunken/lost
// city from Wikidata and writes them to public/data/wikidata.json in KJX's schema.
// Run: npm run data:wikidata   (takes a few minutes; queries are batched politely)
import { writeFile, mkdir } from 'node:fs/promises';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'KJX-builder/0.1 (personal treasure-map project)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'query=' + encodeURIComponent(query),
      });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      return (await res.json()).results.bindings;
    } catch (e) {
      console.warn('  retry', i + 1, e.message);
      await sleep(5000 * (i + 1));
    }
  }
  throw new Error('query failed');
}

// Each group: which Wikidata classes to pull, and how to classify the result.
const GROUPS = [
  { key: 'ship', where: '{ ?s wdt:P31/wdt:P279* wd:Q852190 } UNION { ?s wdt:P793 wd:Q906512 }' },
  { key: 'aircraft', where: '?s wdt:P31/wdt:P279* wd:Q744913 .' },
  { key: 'hoard', where: '{ ?s wdt:P31/wdt:P279* wd:Q164099 } UNION { ?s wdt:P31/wdt:P279* wd:Q4922985 }' },
  { key: 'sunken-city', where: '?s wdt:P31/wdt:P279* wd:Q20616831 .' },
  { key: 'lost-city', where: '?s wdt:P31/wdt:P279* wd:Q2974842 .' },
  // Extra classes (added later; fetch with --groups=scuttled,disaster,rail,reef,dive):
  { key: 'scuttled', cat: 'ship', where: 'VALUES ?ev { wd:Q1786766 wd:Q1522772 } ?s wdt:P793 ?ev .' },
  { key: 'disaster', cat: 'ship', where: '?s wdt:P31/wdt:P279* wd:Q2620513 .' },
  { key: 'rail', cat: 'vehicle', where: '?s wdt:P31/wdt:P279* wd:Q1078765 .' },
  { key: 'reef', cat: 'ship', where: '?s wdt:P31/wdt:P279* wd:Q985843 .' },
  { key: 'phantom', cat: 'city', myth: true, where: '?s wdt:P31/wdt:P279* wd:Q129264 .' },
  { key: 'mythplace', cat: 'city', myth: true, where: '?s wdt:P31/wdt:P279* wd:Q3238337 .' },
  { key: 'dive', cat: 'ship', where: '?s wdt:P31/wdt:P279* wd:Q2141554 .', keep: /wreck|ship|plane|aircraft|sunk|scuttl|tank|train|bus|car\b/i },
];
const argGroups = (process.argv.find((a) => a.startsWith('--groups=')) || '').slice(9).split(',').filter(Boolean);
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '--out=wikidata.json').slice(6);

const yearOf = (v) => {
  if (!v) return null;
  const m = /^(-?\d+)-(\d\d)-(\d\d)/.exec(v.value);
  return m ? parseInt(m[1], 10) : null;
};
const dateOf = (v) => {
  if (!v) return null;
  const m = /^(-?\d+)-(\d\d)-(\d\d)/.exec(v.value);
  if (!m) return null;
  // Wikidata pads year-precision dates as -01-01; keep only the year in that case.
  return m[2] === '01' && m[3] === '01' ? m[1].replace(/^(-?)0+/, '$1') : `${m[1]}-${m[2]}-${m[3]}`;
};
const num = (v) => (v ? Math.round(parseFloat(v.value)) : null);
const str = (v) => (v ? v.value : null);

const TREASURE_RE = /\b(treasure|gold|silver|bullion|coins?|specie|jewel|gems?|emerald|diamond|ivory|porcelain|valuable|hoard|doubloon|pieces of eight)\b/i;

async function listIds(group) {
  const rows = await sparql(`SELECT DISTINCT ?s ?c WHERE { ${group.where} ?s wdt:P625 ?c . }`);
  const out = new Map();
  for (const r of rows) {
    const id = r.s.value.split('/').pop();
    const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(r.c.value);
    if (!m || out.has(id)) continue;
    // Skip coordinates on other globes (Moon, Mars...)
    if (r.c.value.includes('<http') && !r.c.value.includes('Q2>')) continue;
    out.set(id, { lon: +m[1], lat: +m[2] });
  }
  return out;
}

async function details(ids) {
  const values = ids.map((i) => 'wd:' + i).join(' ');
  const q = `SELECT ?s
    (SAMPLE(?label) AS ?name) (SAMPLE(?desc) AS ?description) (SAMPLE(?img) AS ?image)
    (SAMPLE(?article) AS ?wiki) (SAMPLE(?built) AS ?built) (SAMPLE(?svc) AS ?svc)
    (SAMPLE(?lost) AS ?lost) (SAMPLE(?pit) AS ?pit) (SAMPLE(?end) AS ?end) (SAMPLE(?disc) AS ?disc)
    (SAMPLE(?deaths) AS ?deaths) (SAMPLE(?depth) AS ?depth) (SAMPLE(?len) AS ?len) (SAMPLE(?ton) AS ?ton)
    (GROUP_CONCAT(DISTINCT ?typeL; separator="|") AS ?types)
    (SAMPLE(?countryL) AS ?country) (SAMPLE(?opL) AS ?operator) (SAMPLE(?shipL) AS ?vessel)
    WHERE {
      VALUES ?s { ${values} }
      OPTIONAL { ?s rdfs:label ?label FILTER(lang(?label)="en") }
      OPTIONAL { ?s schema:description ?desc FILTER(lang(?desc)="en") }
      OPTIONAL { ?s wdt:P18 ?img }
      OPTIONAL { ?article schema:about ?s ; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?s wdt:P571 ?built }
      OPTIONAL { ?s wdt:P729 ?svc }
      OPTIONAL { ?s p:P793 ?ev . ?ev ps:P793 wd:Q906512 ; pq:P585 ?lost }
      OPTIONAL { ?s wdt:P585 ?pit }
      OPTIONAL { ?s wdt:P576 ?end }
      OPTIONAL { ?s wdt:P575 ?disc }
      OPTIONAL { ?s wdt:P1120 ?deaths }
      OPTIONAL { ?s wdt:P4511 ?depth }
      OPTIONAL { ?s wdt:P2043 ?len }
      OPTIONAL { ?s wdt:P1093 ?ton }
      OPTIONAL { ?s wdt:P31 ?type . ?type rdfs:label ?typeL FILTER(lang(?typeL)="en") }
      OPTIONAL { { ?s wdt:P8047 ?country } UNION { ?s wdt:P17 ?country } ?country rdfs:label ?countryL FILTER(lang(?countryL)="en") }
      OPTIONAL { ?s wdt:P137 ?op . ?op rdfs:label ?opL FILTER(lang(?opL)="en") }
      OPTIONAL { ?s wdt:P1314 ?ship . ?ship rdfs:label ?shipL FILTER(lang(?shipL)="en") }
    } GROUP BY ?s`;
  return sparql(q);
}

function toEntry(groupKey, id, pos, r) {
  const types = (str(r.types) || '').split('|').filter((t) => t && !/^(shipwreck|aviation accident)$/.test(t));
  const name = str(r.name) || id;
  const description = str(r.description) || '';
  const isSub = types.some((t) => /submarine|u-boat/i.test(t)) || /\b(submarine|U-boat)\b/i.test(description);
  const g = GROUPS.find((x) => x.key === groupKey);
  let category = g.cat || groupKey;
  if (category === 'ship' && isSub) category = 'submarine';
  if (groupKey === 'hoard') category = 'treasure';
  if (groupKey === 'sunken-city' || groupKey === 'lost-city') category = 'city';

  const lostDate = dateOf(r.lost) || dateOf(r.pit) || (groupKey === 'ship' ? dateOf(r.end) : null);
  const built = yearOf(r.built) ?? yearOf(r.svc);
  const treasure = groupKey === 'hoard' || TREASURE_RE.test(description);
  const status = groupKey === 'lost-city' || g.myth ? 'lost' : 'found';

  const e = {
    id: 'wd-' + id,
    name,
    category,
    veracity: g.myth ? 'myth' : 'confirmed',
    status,
    treasure,
    lat: +pos.lat.toFixed(5),
    lon: +pos.lon.toFixed(5),
    radiusKm: g.myth ? 60 : status === 'found' ? 0.5 : 25,
    type: types.slice(0, 3).join(', ') || null,
    built,
    lost: lostDate,
    lostYear: lostDate ? parseInt(lostDate, 10) : null,
    discovered: yearOf(r.disc),
    deaths: num(r.deaths),
    depthM: num(r.depth),
    lengthM: num(r.len),
    tonnage: num(r.ton),
    country: str(r.country),
    operator: str(r.operator),
    aircraft: str(r.vessel),
    summary: description,
    image: r.image ? r.image.value.replace(/^http:/, 'https:') + '?width=500' : null,
    wiki: r.wiki ? decodeURIComponent(r.wiki.value.split('/wiki/')[1]) : null,
    wikidata: id,
    source: 'wikidata',
  };
  for (const k of Object.keys(e)) if (e[k] === null || e[k] === '') delete e[k];
  return e;
}

const all = [];
const seen = new Set();
for (const g of GROUPS.filter((x) => (argGroups.length ? argGroups.includes(x.key) : !x.cat))) {
  console.log('listing', g.key);
  const ids = await listIds(g);
  const fresh = [...ids.keys()].filter((i) => !seen.has(i));
  console.log(`  ${ids.size} with coordinates, ${fresh.length} new`);
  const BATCH = 250;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const chunk = fresh.slice(i, i + BATCH);
    const rows = await details(chunk);
    for (const r of rows) {
      const id = r.s.value.split('/').pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = toEntry(g.key, id, ids.get(id), r);
      if (g.keep && !g.keep.test(`${entry.name} ${entry.summary || ''} ${entry.type || ''}`)) continue;
      if (g.key === 'rail' && !entry.type) entry.type = 'Railway accident';
      if (g.key === 'reef' || g.key === 'dive') entry.type = entry.type || 'Wreck dive site';
      all.push(entry);
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, fresh.length)}/${fresh.length}`);
    await sleep(400);
  }
  console.log();
}

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/' + OUT, import.meta.url), JSON.stringify(all));
console.log('wrote', all.length, 'entries');
