// KJX offline engine (Electron main process).
//
//   • Intercepts every https request the app makes. Anything in the offline PACK or the CACHE is
//     served from disk; otherwise it goes to the network, and responses from open data sources
//     (NASA, GEBCO, EMODnet, Wikipedia/Wikimedia, historical-basemaps, GPlates) are saved to the cache.
//     Esri/OSM tiles are *not* stored by us (their terms don't allow bulk offline caching) — they
//     only get Chromium's normal short-lived HTTP cache.
//   • Hard cap: pack + cache never exceed 5 GB. When something new would cross it, the least-recently-
//     used cache files go first (user "download this area" files after ordinary browsing). The pack is
//     never evicted; if the pack alone would hit the cap, its download stops.
//   • The pack: data text + one photo per entry, all history-border files, paleo coastlines
//     (12 ages × 4 models), NASA Blue Marble z0–8 and GEBCO colour relief z0–8.
const { app, net, session } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const CAP = Number(process.env.KJX_CAP_BYTES) || 5 * 1024 ** 3; // env override is for tests only
const ROOT = path.join(app.getPath('userData'), 'offline');
const DIRS = { pack: path.join(ROOT, 'pack'), cache: path.join(ROOT, 'cache') };
const IDX = { pack: path.join(ROOT, 'pack-index.json'), cache: path.join(ROOT, 'cache-index.json') };
const UA = 'KJX/0.1 (personal desktop app)';

// Hosts whose responses we keep on disk (open data). Everything else just passes through.
const CACHEABLE = new Set(['gibs.earthdata.nasa.gov', 'wms.gebco.net', 'tiles.emodnet-bathymetry.eu', 'en.wikipedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org', 'commons.wikimedia.org', 'raw.githubusercontent.com', 'gws.gplates.org']);

let pack = {}; // key -> { s: size, c: contentType }
let cache = {}; // key -> { s, c, t: lastUsed, p?: 1 (area download) }
let packBytes = 0, cacheBytes = 0;
const listeners = new Set();
let packJob = { running: false, phase: 'idle', done: 0, total: 0, failed: 0, error: null, finished: false };
let areaJob = { running: false, done: 0, total: 0, failed: 0, error: null };

function load() {
  fs.mkdirSync(DIRS.pack, { recursive: true });
  fs.mkdirSync(DIRS.cache, { recursive: true });
  for (const k of ['pack', 'cache']) {
    try {
      const v = JSON.parse(fs.readFileSync(IDX[k], 'utf8'));
      if (k === 'pack') pack = v.entries || {}, packJob.finished = !!v.finished;
      else cache = v;
    } catch {}
  }
  packBytes = Object.values(pack).reduce((n, e) => n + e.s, 0);
  cacheBytes = Object.values(cache).reduce((n, e) => n + e.s, 0);
}

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await fsp.writeFile(IDX.pack + '.tmp', JSON.stringify({ finished: packJob.finished, entries: pack }));
    await fsp.rename(IDX.pack + '.tmp', IDX.pack);
    await fsp.writeFile(IDX.cache + '.tmp', JSON.stringify(cache));
    await fsp.rename(IDX.cache + '.tmp', IDX.cache);
  }, 5000);
}

const hash = (key) => crypto.createHash('sha1').update(key).digest('hex');
const fileFor = (dir, key) => {
  const h = hash(key);
  return path.join(DIRS[dir], h.slice(0, 2), h);
};

// Same tile, same key — however the URL happened to be formatted.
const HALF = 20037508.342789244;
function canonicalKey(url) {
  let u;
  try { u = new URL(url); } catch { return url; }
  if (u.hostname === 'wms.gebco.net' && /getmap/i.test(u.searchParams.get('request') || '')) {
    const p = Object.fromEntries([...u.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
    const b = (p.bbox || '').split(',').map(Number);
    if (b.length === 4 && b.every(isFinite)) {
      const size = b[2] - b[0];
      const z = Math.round(Math.log2((2 * HALF) / size));
      const x = Math.round((b[0] + HALF) / size), y = Math.round((HALF - b[3]) / size);
      return `gebco:${p.layers}:${z}/${x}/${y}`;
    }
  }
  for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k);
  return u.toString();
}

function emit() {
  const s = status();
  for (const fn of listeners) fn(s);
}
let emitTimer = null;
const emitSoon = () => (emitTimer ??= setTimeout(() => ((emitTimer = null), emit()), 400));

function status() {
  return { cap: CAP, packBytes, cacheBytes, packFiles: Object.keys(pack).length, cacheFiles: Object.keys(cache).length, pack: { ...packJob }, area: { ...areaJob } };
}

// Make room for `bytes` more. Returns false if even an empty cache wouldn't make it fit.
async function ensureSpace(bytes) {
  if (packBytes + cacheBytes + bytes <= CAP) return true;
  if (packBytes + bytes > CAP) return false;
  const target = CAP - bytes - 64 * 1024 ** 2; // free a little extra so we don't evict on every write
  const order = Object.entries(cache).sort((a, b) => (a[1].p || 0) - (b[1].p || 0) || a[1].t - b[1].t);
  for (const [key, e] of order) {
    if (packBytes + cacheBytes <= target) break;
    delete cache[key];
    cacheBytes -= e.s;
    fsp.unlink(fileFor('cache', key)).catch(() => {});
  }
  saveSoon();
  return packBytes + cacheBytes + bytes <= CAP;
}

async function writeEntry(dir, key, buf, contentType, extra = {}) {
  if (!(await ensureSpace(buf.length))) return false;
  const f = fileFor(dir, key);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await fsp.writeFile(f, buf);
  if (dir === 'pack') {
    if (pack[key]) packBytes -= pack[key].s;
    pack[key] = { s: buf.length, c: contentType };
    packBytes += buf.length;
    if (cache[key]) { cacheBytes -= cache[key].s; delete cache[key]; fsp.unlink(fileFor('cache', key)).catch(() => {}); }
  } else {
    if (cache[key]) cacheBytes -= cache[key].s;
    cache[key] = { s: buf.length, c: contentType, t: Date.now(), ...extra };
    cacheBytes += buf.length;
  }
  saveSoon();
  emitSoon();
  return true;
}

function respond(buf, contentType) {
  return new Response(buf, { status: 200, headers: { 'content-type': contentType || 'application/octet-stream', 'access-control-allow-origin': '*', 'x-kjx-offline': '1' } });
}

async function fromDisk(key) {
  if (pack[key]) {
    try { return respond(await fsp.readFile(fileFor('pack', key)), pack[key].c); } catch { packBytes -= pack[key].s; delete pack[key]; }
  }
  if (cache[key]) {
    try {
      const buf = await fsp.readFile(fileFor('cache', key));
      cache[key].t = Date.now();
      saveSoon();
      return respond(buf, cache[key].c);
    } catch { cacheBytes -= cache[key].s; delete cache[key]; }
  }
  return null;
}

// Fetch from the network (bypassing our own handler) and optionally store.
async function fetchAndStore(url, dir, extra) {
  const r = await net.fetch(url, { bypassCustomProtocolHandlers: true, headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  if (/text\/html/.test(ct) && !/wikipedia/.test(url)) throw new Error('not data');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 20 * 1024 ** 2) return { buf, ct, stored: false };
  const stored = await writeEntry(dir, canonicalKey(url), buf, ct, extra);
  return { buf, ct, stored };
}

function install() {
  load();
  session.defaultSession.protocol.handle('https', async (req) => {
    if (req.method !== 'GET') return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const key = canonicalKey(req.url);
    const hit = await fromDisk(key);
    if (hit) return hit;
    let host = '';
    try { host = new URL(req.url).hostname; } catch {}
    if (!CACHEABLE.has(host)) {
      try { return await net.fetch(req, { bypassCustomProtocolHandlers: true }); } catch { return new Response('offline', { status: 504 }); }
    }
    try {
      const { buf, ct } = await fetchAndStore(req.url, 'cache');
      return respond(buf, ct);
    } catch (e) {
      return new Response('offline', { status: /HTTP (\d+)/.test(e.message) ? +RegExp.$1 : 504 });
    }
  });
}

// ───────────────────────── the offline pack ─────────────────────────
const HISTORY = ['bc123000', 'bc10000', 'bc8000', 'bc5000', 'bc4000', 'bc3000', 'bc2000', 'bc1500', 'bc1000', 'bc700', 'bc500', 'bc400', 'bc323', 'bc300', 'bc200', 'bc100', 'bc1', '100', '200', '300', '400', '500', '600', '700', '800', '900', '1000', '1100', '1200', '1279', '1300', '1400', '1492', '1500', '1530', '1600', '1650', '1700', '1715', '1783', '1800', '1815', '1880', '1900', '1914', '1920', '1930', '1938', '1945', '1960', '1994', '2000', '2010'];
const PALEO_AGES = [20, 50, 66, 100, 150, 200, 250, 300, 400, 500, 600, 750];
const PALEO_MODELS = { MERDITH2021: 1000, MULLER2022: 1000, PALEOMAP: 750, SCOTESE2016: 750, TorsvikCocks2017: 540, GOLONKA: 540, ZAHIROVIC2022: 410, MATTHEWS2016_pmag_ref: 410, MULLER2019: 250, SETON2012: 200 }; // valid ranges per GPlates
const paleoUrl = (model, ma) => `https://gws.gplates.org/reconstruct/coastlines/?time=${ma}&model=${model}&avoid_map_boundary`;
const BM = (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2004-08-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
const tileBounds = (z, x, y) => {
  const size = (2 * HALF) / 2 ** z;
  return [-HALF + x * size, HALF - (y + 1) * size, -HALF + (x + 1) * size, HALF - y * size];
};
const GEBCO = (layer, z, x, y) => `https://wms.gebco.net/mapserv?service=WMS&version=1.1.1&request=GetMap&layers=${layer}&styles=&srs=EPSG:3857&bbox=${tileBounds(z, x, y).join(',')}&width=256&height=256&format=image/jpeg`;
const EMOD = (z, x, y) => `https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/${z}/${x}/${y}.png`;
const thumb500 = (src) => (src ? src.replace(/\/\d+px-([^/?]+)(\?.*)?$/, '/500px-$1') : null);
const wikiUrl = (title) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;

function* tiles(z0, z1, fn) {
  for (let z = z0; z <= z1; z++) for (let y = 0; y < 2 ** z; y++) for (let x = 0; x < 2 ** z; x++) yield fn(z, x, y);
}

async function packPhases(dataFile) {
  const entries = JSON.parse(await fsp.readFile(dataFile, 'utf8'));
  const tileCount = (z0, z1) => [...Array(z1 - z0 + 1)].reduce((n, _, i) => n + 4 ** (z0 + i), 0);
  return [
    { name: 'History borders', total: HISTORY.length, conc: 3, jobs: () => HISTORY.map((f) => `https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_${f}.geojson`) },
    { name: 'Paleo coastlines', total: Object.values(PALEO_MODELS).reduce((n, max) => n + PALEO_AGES.filter((a) => a <= max).length, 0), conc: 2, jobs: () => Object.entries(PALEO_MODELS).flatMap(([m, max]) => PALEO_AGES.filter((a) => a <= max).map((a) => paleoUrl(m, a))) },
    { name: 'Wikipedia text & photos', total: entries.filter((e) => e.wiki).length, conc: 4, wiki: true, jobs: () => entries.filter((e) => e.wiki).map((e) => wikiUrl(e.wiki)) },
    { name: 'Entry photos', total: entries.filter((e) => e.image).length, conc: 4, jobs: () => entries.filter((e) => e.image).map((e) => e.image.replace(/\?width=\d+/, '?width=500')) },
    { name: 'NASA Blue Marble z0–8', total: tileCount(0, 8), conc: 8, jobs: () => tiles(0, 8, BM) },
    { name: 'GEBCO relief z0–8', total: tileCount(0, 8), conc: 4, jobs: () => tiles(0, 8, (z, x, y) => GEBCO('GEBCO_LATEST_2', z, x, y)) },
  ];
}

async function runPool(iter, conc, worker, shouldStop) {
  const it = iter[Symbol.iterator] ? iter[Symbol.iterator]() : iter;
  await Promise.all(
    [...Array(conc)].map(async () => {
      for (;;) {
        if (shouldStop()) return;
        const n = it.next();
        if (n.done) return;
        await worker(n.value);
      }
    }),
  );
}

async function startPack(dataFile) {
  if (packJob.running) return;
  Object.assign(packJob, { running: true, error: null, failed: 0 });
  emit();
  try {
    const phases = await packPhases(dataFile);
    packJob.total = phases.reduce((n, p) => n + p.total, 0);
    packJob.done = 0;
    for (const ph of phases) {
      packJob.phase = ph.name;
      emit();
      await runPool(ph.jobs(), ph.conc, async (url) => {
        const key = canonicalKey(url);
        if (!pack[key]) {
          try {
            const { buf, stored } = await fetchAndStore(url, 'pack');
            if (!stored && buf.length <= 20 * 1024 ** 2) throw Object.assign(new Error('cap'), { cap: true });
            if (ph.wiki) {
              // also keep the photo the app will show for this entry
              const s = JSON.parse(buf.toString('utf8'));
              const img = thumb500(s.thumbnail?.source);
              if (img && !pack[canonicalKey(img)]) await fetchAndStore(img, 'pack').catch(() => packJob.failed++);
            }
          } catch (e) {
            if (e.cap) throw e;
            packJob.failed++;
          }
        }
        packJob.done++;
        emitSoon();
      }, () => !packJob.running);
      if (!packJob.running) break;
    }
    if (packJob.running) packJob.finished = true;
  } catch (e) {
    packJob.error = e.cap ? `Stopped: the ${(CAP / 1024 ** 3).toFixed(CAP < 1024 ** 3 ? 2 : 0)} GB storage cap was reached.` : e.message;
  }
  packJob.running = false;
  packJob.phase = packJob.finished ? 'complete' : 'paused';
  saveSoon();
  emit();
}

function pausePack() {
  packJob.running = false;
  emit();
}

async function clearCache() {
  cache = {};
  cacheBytes = 0;
  await fsp.rm(DIRS.cache, { recursive: true, force: true });
  await fsp.mkdir(DIRS.cache, { recursive: true });
  saveSoon();
  emit();
}

// "Download this area": high-res open tiles for a lon/lat box (GEBCO z9–11 everywhere, EMODnet z9–12 in Europe).
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
function areaJobs([w, s, e, n]) {
  const out = [];
  const add = (z0, z1, fn, box) => {
    for (let z = z0; z <= z1; z++) {
      const x0 = lon2x(box[0], z), x1 = lon2x(box[2], z), y0 = lat2y(box[3], z), y1 = lat2y(box[1], z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(fn(z, x, y));
    }
  };
  add(9, 11, (z, x, y) => GEBCO('GEBCO_LATEST_2', z, x, y), [w, s, e, n]);
  const eu = [Math.max(w, -36), Math.max(s, 15), Math.min(e, 43), Math.min(n, 90)];
  if (eu[0] < eu[2] && eu[1] < eu[3]) add(9, 12, EMOD, eu);
  return out;
}
const estimateArea = (bbox) => {
  const n = areaJobs(bbox).length;
  return { tiles: n, bytes: n * 18 * 1024 };
};
async function downloadArea(bbox) {
  if (areaJob.running) return;
  const jobs = areaJobs(bbox).filter((u) => !pack[canonicalKey(u)] && !cache[canonicalKey(u)]);
  Object.assign(areaJob, { running: true, done: 0, total: jobs.length, failed: 0, error: null });
  emit();
  try {
    await runPool(jobs, 4, async (url) => {
      try {
        const { stored } = await fetchAndStore(url, 'cache', { p: 1 });
        if (!stored) throw Object.assign(new Error('cap'), { cap: true });
      } catch (e) {
        if (e.cap) throw e;
        areaJob.failed++;
      }
      areaJob.done++;
      emitSoon();
    }, () => !areaJob.running);
  } catch (e) {
    areaJob.error = e.cap ? `Stopped: the ${(CAP / 1024 ** 3).toFixed(CAP < 1024 ** 3 ? 2 : 0)} GB storage cap was reached.` : e.message;
  }
  areaJob.running = false;
  saveSoon();
  emit();
}

// Which of these URLs are stored on disk (pack or cache)?
const has = (urls) => urls.map((u) => { const k = canonicalKey(u); return pack[k] ? 'pack' : cache[k] ? 'cache' : null; });

module.exports = {
  has,
  install,
  status,
  startPack,
  pausePack,
  clearCache,
  estimateArea,
  downloadArea,
  cancelArea: () => ((areaJob.running = false), emit()),
  onUpdate: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  flush: async () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } await fsp.writeFile(IDX.pack, JSON.stringify({ finished: packJob.finished, entries: pack })); await fsp.writeFile(IDX.cache, JSON.stringify(cache)); },
};
