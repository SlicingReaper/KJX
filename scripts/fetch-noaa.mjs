// Pulls every charted wreck from NOAA's Electronic Navigational Charts (ENC Direct) —
// US coastal waters, Great Lakes, Puerto Rico, Hawaii, Alaska, Pacific territories.
// Writes public/data/noaa.json. Run: npm run data:noaa
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://gis.charttools.noaa.gov/arcgis/rest/services/encdirect';
const LAYERS = [
  ['enc_harbour', 36, 'Harbour chart'],
  ['enc_approach', 39, 'Approach chart'],
  ['enc_coastal', 33, 'Coastal chart'],
  ['enc_general', 29, 'General chart'],
  ['enc_overview', 24, 'Overview chart'],
];
const FIELDS = 'OBJNAM,CATWRK,VALSOU,WATLEV,INFORM,SORDAT,SORIND,EXPSOU,QUASOU,HEIGHT';
const WATLEV = { 1: 'partly submerged at high water', 2: 'always dry', 3: 'always under water', 4: 'covers and uncovers', 5: 'awash', 6: 'subject to flooding', 7: 'floating' };

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('  retry', e.message);
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw new Error('failed ' + url);
}

const out = [];
const grid = new Map(); // ~100 m dedupe across chart scales
for (const [svc, id, scale] of LAYERS) {
  let offset = 0;
  for (;;) {
    const url = `${BASE}/${svc}/MapServer/${id}/query?where=1%3D1&outFields=${FIELDS}&outSR=4326&resultOffset=${offset}&resultRecordCount=1000&orderByFields=OBJECTID&f=json`;
    const d = await get(url);
    const feats = d.features || [];
    for (const f of feats) {
      const a = f.attributes, g = f.geometry;
      if (!g || !isFinite(g.x) || !isFinite(g.y)) continue;
      const key = `${Math.round(g.y * 1000)},${Math.round(g.x * 1000)}`;
      const name = a.OBJNAM && a.OBJNAM.trim();
      const prev = grid.get(key);
      if (prev) {
        if (name && prev.name.startsWith('Charted wreck')) prev.name = name;
        continue;
      }
      const cat = (a.CATWRK || '').replace(/\s*\(test\)/, '');
      const sordat = a.SORDAT && /^\d{8}$/.test(a.SORDAT) ? `${a.SORDAT.slice(0, 4)}-${a.SORDAT.slice(4, 6)}-${a.SORDAT.slice(6, 8)}` : null;
      const bits = [
        cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Wreck',
        WATLEV[a.WATLEV] ? `(${WATLEV[a.WATLEV]})` : '',
        a.VALSOU != null ? `· least depth ${a.VALSOU} m` : '',
        `· from the NOAA ${scale.toLowerCase()}`,
        sordat ? `· surveyed ${sordat}` : '',
      ];
      const e = {
        id: `noaa-${svc}-${a.OBJECTID ?? out.length}`,
        name: name || 'Charted wreck',
        category: 'ship',
        veracity: 'confirmed',
        status: 'found',
        treasure: false,
        lat: +g.y.toFixed(5),
        lon: +g.x.toFixed(5),
        radiusKm: 0.2,
        type: cat || 'Charted wreck',
        depthM: a.VALSOU != null ? Math.round(a.VALSOU) : undefined,
        summary: bits.filter(Boolean).join(' ') + (a.INFORM ? `. Note: ${a.INFORM}` : '.'),
        source: 'noaa',
      };
      for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
      grid.set(key, e);
      out.push(e);
    }
    process.stdout.write(`\r${svc}: ${offset + feats.length}`);
    if (!d.exceededTransferLimit && feats.length < 1000) break;
    offset += feats.length;
  }
  console.log();
}
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/noaa.json', import.meta.url), JSON.stringify(out));
console.log('wrote', out.length, 'NOAA wrecks,', out.filter((e) => e.name !== 'Charted wreck').length, 'named');
