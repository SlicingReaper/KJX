import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';
import { GLOBE_GROUPS, findGlobe, ROUTES } from './globes.js';

window.CESIUM_BASE_URL = CESIUM_BASE_URL;

// ───────────────────────── constants ─────────────────────────
// Palette follows the terminal-cyan widget scheme.
const CATS = {
  ship: { label: 'Ships', one: 'Ship', color: '#3ef0ff' },
  submarine: { label: 'Submarines', one: 'Submarine', color: '#8b6dff' },
  aircraft: { label: 'Aircraft', one: 'Aircraft', color: '#ffb84d' },
  spacecraft: { label: 'Spacecraft', one: 'Spacecraft', color: '#eaf6ff' },
  treasure: { label: 'Treasure & hoards', one: 'Treasure / hoard', color: '#ffd84f' },
  city: { label: 'Sunken & lost cities', one: 'Sunken / lost city', color: '#3dff7f' },
  vehicle: { label: 'Cars, trains & tanks', one: 'Land vehicle', color: '#ff5f6d' },
};
const SOURCES = {
  curated: { label: 'KJX curated files', color: '#3ef0ff' },
  wikidata: { label: 'Wikidata', color: '#1f8fff' },
  noaa: { label: 'NOAA nautical charts', color: '#8ec9ff' },
  osm: { label: 'OpenStreetMap', color: '#7fdbff' },
};
const VERACITY = {
  confirmed: { label: 'Confirmed', color: '#3dff7f' },
  disputed: { label: 'Disputed', color: '#ffd84f' },
  legend: { label: 'Legend', color: '#b388ff' },
  myth: { label: 'Myth', color: '#ff5ad9' },
};
const STATUS = {
  found: { label: 'Found', color: '#3dff7f' },
  salvaged: { label: 'Salvaged', color: '#1f8fff' },
  partial: { label: 'Partly found', color: '#ffb84d' },
  lost: { label: 'Still lost', color: '#ff5f6d' },
};
function areaColor(e) {
  if (e.veracity === 'myth') return '#ff5ad9';
  if (e.veracity === 'legend') return '#b388ff';
  if (e.veracity === 'disputed') return '#ffd84f';
  if (e.status === 'lost') return '#ff5f6d';
  if (e.status === 'partial') return '#ffb84d';
  return '#3dff7f';
}
const AREA_LEGEND = [
  ['#3dff7f', 'Confirmed · found / salvaged'],
  ['#ffb84d', 'Confirmed · partly found'],
  ['#ff5f6d', 'Confirmed · still lost'],
  ['#ffd84f', 'Disputed'],
  ['#b388ff', 'Legend'],
  ['#ff5ad9', 'Myth'],
];
const ERAS = [
  ['All time', -15000, 2026],
  ['Ancient', -15000, 499],
  ['Medieval', 500, 1491],
  ['Age of Sail', 1492, 1850],
  ['1851–1913', 1851, 1913],
  ['WWI', 1914, 1918],
  ['WWII', 1939, 1945],
  ['Modern', 1946, 2026],
];
const DEFAULT_FILTERS = () => ({
  cats: new Set(Object.keys(CATS)),
  veracity: new Set(Object.keys(VERACITY)),
  status: new Set(Object.keys(STATUS)),
  treasure: 'all',
  sources: new Set(Object.keys(SOURCES)),
  yearMin: -15000,
  yearMax: 2026,
  undated: true,
  text: '',
  syncHistory: false,
  hasImage: false,
  namedOnly: false,
});
const PRESETS = [
  { id: 'all', name: 'Everything', hint: 'clear all filters', apply: () => ({}) },
  { id: 'unfound', name: '★ Unfound treasure', hint: 'treasure, still lost', apply: () => ({ treasure: 'yes', status: new Set(['lost', 'partial']) }) },
  { id: 'myths', name: 'Myths & legends', hint: 'unproven stories', apply: () => ({ veracity: new Set(['myth', 'legend', 'disputed']) }) },
  { id: 'missing-air', name: 'Missing aircraft', hint: 'never found', apply: () => ({ cats: new Set(['aircraft']), status: new Set(['lost', 'partial']) }) },
  { id: 'sail', name: 'Age of Sail ships', hint: '1492 – 1850', apply: () => ({ cats: new Set(['ship']), yearMin: 1492, yearMax: 1850, undated: false }) },
  { id: 'ww2', name: 'World War II', hint: '1939 – 1945', apply: () => ({ yearMin: 1939, yearMax: 1945, undated: false }) },
  { id: 'subs', name: 'Submarines', hint: 'all eras', apply: () => ({ cats: new Set(['submarine']) }) },
  { id: 'vehicles', name: 'Cars, trains & tanks', hint: 'land vehicles', apply: () => ({ cats: new Set(['vehicle']) }) },
  { id: 'named', name: 'Named wrecks only', hint: 'hide unnamed charted', apply: () => ({ namedOnly: true }) },
  { id: 'curated', name: 'Curated files', hint: 'full KJX detail', apply: () => ({ sources: new Set(['curated']) }) },
];

// ───────────────────────── state ─────────────────────────
const state = {
  globe: 'esri-imagery',
  modisDate: isoDaysAgo(3),
  paleoModel: 'MERDITH2021',
  overlays: { labels: true, grid: false, routes: false, oceanRef: false },
  filters: DEFAULT_FILTERS(),
  preset: 'all',
  open: new Set(['g0', 'presets', 'type', 'truth', 'status']),
  selected: null,
};
let entries = [];
let historyYear = null;
let deepTime = false;
let facetCounts = { cats: {}, veracity: {}, status: {}, sources: {} };

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}
const $ = (s, el = document) => el.querySelector(s);
// Case- and accent-insensitive matching: "san jose" finds "San José", "senora" finds "Señora".
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtYear = (y) => (y === undefined || y === null || y === '' ? '' : (y = String(y)).startsWith('-') ? `${y.slice(1).split('-')[0]} BC` : y);
const num = (n) => (n ?? 0).toLocaleString('en-US');
function fmtDate(d) {
  if (d === undefined || d === null) return '';
  const s = String(d);
  if (s.startsWith('-')) return fmtYear(s);
  const m = /^(\d{1,4})-(\d\d)(?:-(\d\d))?$/.exec(s);
  if (!m) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[3] ? +m[3] + ' ' : ''}${months[+m[2] - 1]} ${m[1]}`;
}
const BRACKETS = '<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>';
document.querySelectorAll('.term').forEach((el) => el.insertAdjacentHTML('afterbegin', BRACKETS));

// ───────────────────────── viewer ─────────────────────────
const viewer = new Cesium.Viewer('globe', {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
});
const scene = viewer.scene;
const camera = viewer.camera;
const OCEAN = Cesium.Color.fromCssColorString('#0b2236');
scene.globe.baseColor = OCEAN;
scene.fog.enabled = false;
scene.screenSpaceCameraController.minimumZoomDistance = 150;
scene.screenSpaceCameraController.maximumZoomDistance = 4e7;
const HOME = Cesium.Cartesian3.fromDegrees(-30, 25, 2.2e7);
camera.setView({ destination: HOME });

// Markers live in one PointPrimitiveCollection per 10°×10° map cell. Each frame we only decide which
// *cells* face the camera (a few hundred cheap sphere tests) and hide whole cells behind the Earth —
// no per-marker work while you spin the globe, and the far side isn't drawn at all.
const markerRoot = scene.primitives.add(new Cesium.PrimitiveCollection());
const cells = new Map();
const historyLabels = scene.primitives.add(new Cesium.LabelCollection());
let baseLayers = [];
let overlayLayers = {};
let vectorSource = null;
let routeEntities = [];
let areaEntities = [];
scene.msaaSamples = 1; // points are anti-aliased in their shader; MSAA only costs frame time here
scene.globe.tileCacheSize = 1000; // keep more imagery tiles around so spinning back doesn't re-fetch
scene.globe.preloadSiblings = true;

// ───────────────────────── input tracking ─────────────────────────
let lastInput = performance.now();
const touch = () => {
  lastInput = performance.now();
  if (autoSpin) stopSpin();
};
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, touch, { passive: true, capture: true });

// ───────────────────────── camera: re-centre after zooming out ─────────────────────────
// After flying into a wreck the camera is tilted. When *you* zoom back out past ~2,500 km it eases
// back to looking straight down, north up, so the Earth sits centred. It only runs for 1.5 s after
// your last input — it never moves the camera on its own.
let flying = false;
const screenCenter = new Cesium.Cartesian2();
scene.preRender.addEventListener(() => {
  if (flying || autoSpin || performance.now() - lastInput > 1500) return;
  const h = camera.positionCartographic.height;
  if (h < 2.5e6) return;
  const dPitch = -Cesium.Math.PI_OVER_TWO - camera.pitch;
  if (Math.abs(dPitch) < 0.01) return; // already looking straight down (heading is meaningless there)
  const dHead = Cesium.Math.negativePiToPi(-camera.heading);
  screenCenter.x = scene.canvas.clientWidth / 2;
  screenCenter.y = scene.canvas.clientHeight / 2;
  const target = camera.pickEllipsoid(screenCenter) || Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(camera.positionWC, new Cesium.Cartesian3());
  if (!target) return;
  const range = Cesium.Cartesian3.distance(camera.positionWC, target);
  const k = Math.min(0.35, 0.08 + ((h - 2.5e6) / 6e6) * 0.3);
  const pitch = Math.max(-Cesium.Math.PI_OVER_TWO + 1e-4, camera.pitch + dPitch * k);
  camera.lookAt(target, new Cesium.HeadingPitchRange(camera.heading + dHead * k, pitch, range));
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  lastInput = performance.now() - 1000; // keep easing a little longer once started
});

// ───────────────────────── idle spin ─────────────────────────
// Only at the home view (whole globe, nothing selected) after 5 minutes without any input.
const IDLE_MS = 5 * 60 * 1000;
let autoSpin = false;
function stopSpin() {
  autoSpin = false;
}
scene.preRender.addEventListener((_, time) => {
  if (!autoSpin) {
    if (performance.now() - lastInput < IDLE_MS || state.selected || flying) return;
    if (camera.positionCartographic.height < 1.5e7) return;
    autoSpin = true;
  }
  camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0006); // ~1 revolution / 3 min at 60 fps
});

// ───────────────────────── cell culling ─────────────────────────
const earth = new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, Cesium.Ellipsoid.WGS84.minimumRadius);
const lastCam = new Cesium.Cartesian3();
let cullDirty = true;
function cull() {
  const pos = camera.positionWC;
  if (!cullDirty && Cesium.Cartesian3.equalsEpsilon(pos, lastCam, 0, 1)) return;
  Cesium.Cartesian3.clone(pos, lastCam);
  cullDirty = false;
  const occ = new Cesium.Occluder(earth, pos);
  for (const c of cells.values()) c.coll.show = c.visible > 0 && occ.isBoundingSphereVisible(c.sphere);
}
scene.preRender.addEventListener(cull);
camera.moveStart.addEventListener(() => ($('#tooltip').hidden = true));

// ───────────────────────── HUD ─────────────────────────
let hudTimer = 0;
const hudSpans = [];
scene.postRender.addEventListener(() => {
  const now = performance.now();
  if (now - hudTimer < 150) return;
  hudTimer = now;
  if (!hudSpans.length) {
    $('#hud').insertAdjacentHTML('beforeend', '<span>LAT <b></b></span><span>LON <b></b></span><span>ALT <b></b></span><button class="credits" title="Map data credits">ⓘ</button>');
    $('#hud .credits').addEventListener('click', () => document.querySelector('.cesium-credit-expand-link')?.click());
    hudSpans.push(...$('#hud').querySelectorAll('span b'));
  }
  const c = camera.positionCartographic;
  const alt = c.height / 1000;
  hudSpans[0].textContent = Cesium.Math.toDegrees(c.latitude).toFixed(2);
  hudSpans[1].textContent = Cesium.Math.toDegrees(c.longitude).toFixed(2);
  hudSpans[2].textContent = `${alt >= 100 ? num(Math.round(alt)) : alt.toFixed(1)} KM`;
});

// ───────────────────────── globes ─────────────────────────
function tileProvider(g) {
  const url = typeof g.url === 'function' ? g.url(state.modisDate) : g.url;
  return new Cesium.UrlTemplateImageryProvider({ url, maximumLevel: g.max ?? 18, credit: new Cesium.Credit(g.credit || '') });
}

async function setGlobe(id) {
  const g = findGlobe(id);
  if (!g) return;
  state.globe = id;
  for (const l of baseLayers) viewer.imageryLayers.remove(l, true);
  baseLayers = [];
  if (vectorSource) {
    viewer.dataSources.remove(vectorSource, true);
    vectorSource = null;
  }
  historyLabels.removeAll();
  historyYear = null;
  deepTime = false;
  scene.globe.baseColor = OCEAN;

  const addBase = (provider, tint, index = 0) => {
    const layer = viewer.imageryLayers.addImageryProvider(provider, index);
    if (tint) Object.assign(layer, tint);
    baseLayers.push(layer);
  };
  renderGlobes();
  if (g.kind === 'tiles') {
    addBase(tileProvider(g), g.tint);
    if (g.overlay) addBase(new Cesium.UrlTemplateImageryProvider({ url: g.overlay, maximumLevel: 13 }), null, 1);
  } else if (g.kind === 'wms') {
    addBase(new Cesium.WebMapServiceImageryProvider({ url: g.url, layers: g.layers, parameters: { format: 'image/jpeg', transparent: false }, credit: new Cesium.Credit(g.credit) }));
  } else if (g.kind === 'history') {
    historyYear = g.year;
    addBase(new Cesium.UrlTemplateImageryProvider({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', maximumLevel: 13, credit: new Cesium.Credit('Esri') }), { saturation: 0.3, brightness: 1.05, hue: 0.06 });
    await loadHistory(g);
  } else if (g.kind === 'paleo') {
    deepTime = true;
    await loadPaleo(g);
  }
  orderOverlays();
  markerRoot.show = !deepTime;
  applyFilters();
}

const histUrl = (g) => `https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/${g.file}`;
const paleoUrl = (model, ma) => `https://gws.gplates.org/reconstruct/coastlines/?time=${ma}&model=${model}&avoid_map_boundary`;
const paleoModel = () => GLOBE_GROUPS.find((x) => x.models).models.find((m) => m.id === state.paleoModel);
// Non-blocking message in the loading strip (instead of a modal alert).
function notify(msg) {
  const l = $('#loading');
  l.textContent = '! ' + msg.toUpperCase();
  l.classList.remove('done');
  l.style.background = 'rgba(2,6,13,0.7)';
  l.style.color = 'var(--amber)';
  clearTimeout(notify.t);
  notify.t = setTimeout(() => { l.classList.add('done'); l.style.color = ''; }, 4500);
}
const hashColor = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Cesium.Color.fromHsl((h % 360) / 360, 0.55, 0.55, 0.42);
};

async function loadHistory(g) {
  setBusy(`> LOADING THE WORLD IN ${g.name.toUpperCase()}_`);
  try {
    const url = histUrl(g);
    const ds = await Cesium.GeoJsonDataSource.load(url, { stroke: Cesium.Color.fromCssColorString('#3a2a14'), strokeWidth: 1, fill: Cesium.Color.TRANSPARENT });
    if (state.globe !== g.id) return;
    const best = new Map();
    for (const ent of ds.entities.values) {
      const name = ent.properties?.NAME?.getValue() || ent.properties?.SUBJECTO?.getValue();
      if (!ent.polygon) continue;
      ent.polygon.material = name ? hashColor(name) : Cesium.Color.TRANSPARENT;
      ent.polygon.outline = false;
      if (!name) continue;
      const sphere = Cesium.BoundingSphere.fromPoints(ent.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions);
      const prev = best.get(name);
      if (!prev || sphere.radius > prev.radius) best.set(name, sphere);
    }
    vectorSource = ds;
    await viewer.dataSources.add(ds);
    for (const [name, sphere] of best) {
      if (sphere.radius < 60000) continue;
      historyLabels.add({
        position: Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(sphere.center) || sphere.center,
        text: name,
        font: `${sphere.radius > 1.2e6 ? 15 : 12}px Georgia, serif`,
        fillColor: Cesium.Color.fromCssColorString('#2b1d0e'),
        outlineColor: Cesium.Color.fromCssColorString('#f4ead5'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, sphere.radius * 18),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      });
    }
  } catch (err) {
    console.error(err);
    notify(navigator.onLine ? 'Could not load this historical map — try again in a moment.' : 'You are offline and this historical map is not stored yet (download the offline pack while online).');
  } finally {
    setBusy(null);
  }
}

async function loadPaleo(g) {
  setBusy(`> REWINDING PLATE TECTONICS ${g.ma} MILLION YEARS_`);
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#1d4f7a');
  try {
    const url = paleoUrl(state.paleoModel, g.ma);
    const ds = await Cesium.GeoJsonDataSource.load(url, { fill: Cesium.Color.fromCssColorString('#c9b27c'), stroke: Cesium.Color.fromCssColorString('#7a6338'), strokeWidth: 1 });
    if (state.globe !== g.id) return;
    for (const ent of ds.entities.values) if (ent.polygon) ent.polygon.outline = false;
    vectorSource = ds;
    await viewer.dataSources.add(ds);
  } catch (err) {
    console.error(err);
    notify(navigator.onLine ? 'The GPlates service did not answer — try again in a moment, or pick another plate model.' : 'You are offline and this deep-time map is not stored yet (download the offline pack while online).');
  } finally {
    setBusy(null);
  }
}

function setOverlay(key, on) {
  state.overlays[key] = on;
  if (overlayLayers[key]) {
    viewer.imageryLayers.remove(overlayLayers[key], true);
    delete overlayLayers[key];
  }
  if (key === 'routes') {
    for (const e of routeEntities) viewer.entities.remove(e);
    routeEntities = [];
    if (on)
      for (const r of ROUTES)
        routeEntities.push(
          viewer.entities.add({
            name: r.name,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(r.pts.flat()),
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(r.color).withAlpha(0.85), dashLength: 18 }),
              arcType: Cesium.ArcType.GEODESIC,
            },
          }),
        );
    return;
  }
  if (!on) return;
  const tile = (url, max) => new Cesium.UrlTemplateImageryProvider({ url, maximumLevel: max, credit: new Cesium.Credit('Esri') });
  if (key === 'labels') overlayLayers.labels = viewer.imageryLayers.addImageryProvider(tile('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', 19));
  if (key === 'grid') overlayLayers.grid = viewer.imageryLayers.addImageryProvider(new Cesium.GridImageryProvider({ color: Cesium.Color.fromCssColorString('#3ef0ff').withAlpha(0.3), glowColor: Cesium.Color.TRANSPARENT, cells: 2 }));
  if (key === 'oceanRef') overlayLayers.oceanRef = viewer.imageryLayers.addImageryProvider(tile('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}', 13));
}
function orderOverlays() {
  const g = findGlobe(state.globe);
  const hasOwnLabels = g.overlay || g.kind === 'history' || g.labels === false || ['natgeo', 'osm', 'osm-de', 'topo', 'physical', 'antique'].includes(g.id);
  for (const key of ['oceanRef', 'grid', 'labels']) {
    const want = state.overlays[key] && !(deepTime && key !== 'grid') && !(key === 'labels' && hasOwnLabels);
    if (overlayLayers[key]) {
      viewer.imageryLayers.remove(overlayLayers[key], true);
      delete overlayLayers[key];
    }
    if (want) {
      setOverlay(key, true);
    }
  }
}

// ───────────────────────── data & points ─────────────────────────
async function loadData() {
  const res = await fetch('data/kjx.json');
  entries = await res.json();
  const ring = Cesium.Color.fromCssColorString('#ffd84f');
  const colors = {};
  const scaler = new Cesium.NearFarScalar(1.5e5, 1.4, 3e7, 0.6);
  const nearOnly = new Cesium.DistanceDisplayCondition(0, 4e6);
  entries.forEach((e, i) => {
    e._i = i;
    // the data file omits default values to stay small
    e.veracity ??= 'confirmed';
    e.status ??= 'found';
    e.treasure ??= false;
    e.radiusKm ??= 0.2;
    e.source ??= 'wikidata';
    if (e.image) e.image = e.image.replace(/\?width=\d+/, '?width=500');
    const cat = CATS[e.category] || CATS.ship;
    const curated = e.source === 'curated';
    const ck = Math.floor((e.lat + 90) / 10) * 36 + Math.floor((e.lon + 180) / 10);
    let cell = cells.get(ck);
    if (!cell) {
      cell = { coll: markerRoot.add(new Cesium.PointPrimitiveCollection()), positions: [], visible: 0 };
      cells.set(ck, cell);
    }
    e._cell = cell;
    const pos = Cesium.Cartesian3.fromDegrees(e.lon, e.lat, 0);
    cell.positions.push(pos);
    const ckey = cat.color + (curated ? 1 : 0.75);
    const unnamed = e.name.startsWith('Charted') || e.name.startsWith('Unnamed');
    // Flat, crisp dots: no dark outline; only a thin gold ring marks treasure.
    e._point = cell.coll.add({
      position: pos,
      color: (colors[ckey] ??= Cesium.Color.fromCssColorString(cat.color).withAlpha(curated ? 1 : 0.75)),
      pixelSize: curated ? 7 : unnamed ? 3 : 4,
      outlineColor: ring,
      outlineWidth: e.treasure && e.category !== 'treasure' ? 1.5 : 0,
      scaleByDistance: scaler,
      // unnamed charted wrecks only appear once you zoom in (keeps the whole-globe view fast & readable)
      distanceDisplayCondition: unnamed ? nearOnly : undefined,
      id: { kjx: i },
    });
    e._search = fold([e.name, e.type, e.country, e.summary, e.operator, e.aircraft].filter(Boolean).join(' '));
  });
  for (const c of cells.values()) {
    // pad the sphere so markers right at the horizon don't pop
    c.sphere = Cesium.BoundingSphere.fromPoints(c.positions);
    c.sphere.radius += 20000;
    delete c.positions;
  }
}

// Returns which filter groups an entry fails: 0 = passes; bit 1 cats, 2 veracity, 4 status, 16 source, 8 anything else.
function failMask(e, f) {
  let m = 0;
  if (!f.cats.has(e.category)) m |= 1;
  if (!f.veracity.has(e.veracity)) m |= 2;
  if (!f.status.has(e.status)) m |= 4;
  if ((f.treasure === 'yes' && !e.treasure) || (f.treasure === 'no' && e.treasure)) return m | 8;
  if (!f.sources.has(e.source)) m |= 16;
  if (f.namedOnly && (e.name.startsWith('Charted') || e.name.startsWith('Unnamed'))) return m | 8;
  if (f.hasImage && !e.image && !e.wiki) return m | 8;
  const y = e.lostYear;
  if (y === undefined || y === null) {
    if (!f.undated) return m | 8;
  } else if (y < f.yearMin || y > f.yearMax) return m | 8;
  if (f.syncHistory && historyYear !== null && !(y !== undefined && y <= historyYear)) return m | 8;
  if (f.text && !e._search.includes(f.text)) return m | 8;
  return m;
}

function setVis(e, v) {
  e._vis = v;
  const show = v && e !== state.selected; // the selected entry is drawn by the selection marker instead
  if (e._point.show !== show) e._point.show = show;
  if (v) e._cell.visible++;
}
let visibleCount = 0;
function applyFilters() {
  const f = state.filters;
  visibleCount = 0;
  let treasure = 0;
  const fc = { cats: {}, veracity: {}, status: {}, sources: {} };
  for (const c of cells.values()) c.visible = 0;
  for (const e of entries) {
    const m = failMask(e, f);
    // Facet counts: how many you'd get by ticking that option, given all the *other* filters.
    if (m === 0 || m === 1) fc.cats[e.category] = (fc.cats[e.category] || 0) + 1;
    if (m === 0 || m === 2) fc.veracity[e.veracity] = (fc.veracity[e.veracity] || 0) + 1;
    if (m === 0 || m === 4) fc.status[e.status] = (fc.status[e.status] || 0) + 1;
    if (m === 0 || m === 16) fc.sources[e.source] = (fc.sources[e.source] || 0) + 1;
    setVis(e, (m === 0 || e === state.selected) && !deepTime);
    if (m === 0) {
      visibleCount++;
      if (e.treasure) treasure++;
    }
  }
  facetCounts = fc;
  cullDirty = true;
  $('#stats').innerHTML = deepTime
    ? `<span>DEEP TIME · MARKERS HIDDEN</span><span>${num(entries.length)} LOADED</span>`
    : `<span>SHOWING <b>${num(visibleCount)}</b> / ${num(entries.length)}</span><span class="gold">★ ${num(treasure)}</span>`;
  updateFilterCounts();
  renderList();
}

// ───────────────────────── selection ─────────────────────────
function clearArea() {
  for (const e of areaEntities) viewer.entities.remove(e);
  areaEntities = [];
}

function select(e, fly = true) {
  const prev = state.selected;
  state.selected = e;
  if (prev && prev !== e) {
    // give the previous selection its normal marker back (if it still passes the filters)
    const keep = failMask(prev, state.filters) === 0 && !deepTime;
    prev._vis = keep;
    prev._point.show = keep;
  }
  if (e && !deepTime) {
    if (!e._vis) e._cell.visible++;
    e._vis = true;
    // the selection marker replaces the normal dot — showing both made a "duplicate"
    e._point.show = false;
  }
  cullDirty = true;
  $('#tooltip').hidden = true;
  clearArea();
  if (!e) {
    $('#detail').hidden = true;
    return;
  }
  const r = Math.max((e.radiusKm || 1) * 1000, 120);
  const center = Cesium.Cartesian3.fromDegrees(e.lon, e.lat);
  const color = Cesium.Color.fromCssColorString(areaColor(e));
  // Concentric rings: most likely in the middle, fading towards the edge of the estimated area.
  [1, 0.66, 0.33].forEach((f, k) => {
    areaEntities.push(
      viewer.entities.add({
        position: center,
        ellipse: {
          semiMajorAxis: r * f,
          semiMinorAxis: r * f,
          height: 2, // all rings at the same level (different heights look off-centre when the camera is tilted)
          material: color.withAlpha(0.1 + k * 0.08),
          outline: true,
          outlineColor: color.withAlpha(k === 0 ? 0.95 : 0.45),
        },
      }),
    );
  });
  areaEntities.push(
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat, 0),
      point: { pixelSize: 10, color, outlineColor: Cesium.Color.fromCssColorString('#04101c'), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: e.name.toUpperCase(),
        font: '600 12px "SF Mono", Menlo, monospace',
        fillColor: Cesium.Color.fromCssColorString('#cfefff'),
        outlineColor: Cesium.Color.fromCssColorString('#04101c'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );
  if (fly) {
    flying = true;
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, r), {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-62), Math.max(r * 3.4, 2500)),
      duration: 2.2,
      complete: () => (flying = false),
      cancel: () => (flying = false),
    });
  }
  renderDetail(e);
}

const wikiCache = new Map();
function wikiSummary(title) {
  if (!wikiCache.has(title))
    wikiCache.set(
      title,
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  return wikiCache.get(title);
}

function factRows(e) {
  const rows = [
    ['Category', CATS[e.category]?.one],
    ['Type', e.type],
    ['Myth / confirmed', VERACITY[e.veracity]?.label],
    ['Status', STATUS[e.status]?.label],
    ['Treasure', e.treasure ? 'Yes' : 'No'],
    ['Built / made', fmtYear(e.built)],
    ['Lost', fmtDate(e.lost)],
    ['Discovered', fmtYear(e.discovered)],
    ['Found by', e.discoveredBy],
    ['Deaths', e.deaths !== undefined ? num(e.deaths) : ''],
    ['Depth', e.depthM ? `${num(e.depthM)} m` : ''],
    ['Length', e.lengthM ? `${e.lengthM} m` : ''],
    ['Tonnage', e.tonnage ? `${num(e.tonnage)} t` : ''],
    ['Flag / country', e.country],
    ['Operator', e.operator],
    ['Vehicle', e.aircraft],
    ['Position', `${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`],
    ['Search radius', `${e.radiusKm >= 10 ? Math.round(e.radiusKm) : e.radiusKm} km`],
    ['Wikidata', e.wikidata],
    ['Data source', SOURCES[e.source]?.label],
  ];
  return rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
}

async function renderDetail(e) {
  const panel = $('#detail');
  panel.hidden = false;
  $('.scroll', panel).scrollTop = 0;
  $('#dsrc').textContent = ({ curated: 'CURATED', wikidata: 'WIKIDATA', noaa: 'NOAA CHART', osm: 'OPENSTREETMAP' }[e.source] || 'DATA') + ` · #${String(e._i).padStart(6, '0')}`;
  const cat = CATS[e.category] || CATS.ship;
  const ver = VERACITY[e.veracity];
  const badge = (txt, color) => `<span class="badge" style="color:${color};border-color:${color}88;background:${color}14">${esc(txt)}</span>`;
  const body = $('.detail-body', panel);
  body.innerHTML = `
    <div class="img-slot">${e.image ? `<img class="detail-img" src="${esc(e.image)}" alt="" onerror="this.remove()">` : ''}</div>
    <div class="detail-inner">
      <h2>${esc(e.name)}</h2>
      <div class="sub">${esc([e.type, e.country].filter(Boolean).join(' · '))}</div>
      <div class="badges">
        ${badge(cat.one, cat.color)}
        ${badge(ver?.label || e.veracity, ver?.color || '#ccc')}
        ${badge(STATUS[e.status]?.label || e.status, areaColor(e))}
        ${e.treasure ? badge('★ Treasure', '#ffd84f') : ''}
        ${e.lostYear !== undefined ? badge(fmtYear(e.lostYear), '#5d7a99') : ''}
      </div>
      ${e.value ? `<div class="value">$ ${esc(e.value)}</div>` : ''}
      <div class="desc"><p>${esc(e.summary || '')}</p><div class="wiki-extract"></div></div>
      ${e.locNote ? `<div class="locnote">› ${esc(e.locNote)}</div>` : ''}
      ${e.note ? `<div class="value" style="color:var(--dim);border-color:rgba(93,122,153,.5);background:rgba(93,122,153,.08)">⚠ DATA NOTE — ${esc(e.note)}</div>` : ''}
      <table class="facts">${factRows(e).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="links">
        ${e.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(e.wiki)}" target="_blank">WIKIPEDIA ↗</a>` : ''}
        ${e.wikidata ? `<a href="https://www.wikidata.org/wiki/${e.wikidata}" target="_blank">WIKIDATA ↗</a>` : ''}
        <a href="https://www.google.com/maps/@${e.lat},${e.lon},12z/data=!3m1!1e3" target="_blank">GOOGLE MAPS ↗</a>
        <a href="#" data-copy="${e.lat}, ${e.lon}">COPY COORDS</a>
      </div>
    </div>`;
  if (!e.wiki) return;
  const s = await wikiSummary(e.wiki);
  if (state.selected !== e || !s) return;
  // 500 px thumbnail: a standard Wikimedia size, and the one the offline pack stores
  const img = s.thumbnail?.source ? s.thumbnail.source.replace(/\/\d+px-([^/?]+)(\?.*)?$/, '/500px-$1') : s.originalimage?.source;
  if (img && !e.image) $('.img-slot', body).innerHTML = `<img class="detail-img" src="${esc(img)}" alt="" onerror="this.remove()">`;
  if (s.extract && s.extract.length > (e.summary || '').length * 0.8) {
    $('.wiki-extract', body).innerHTML = `<p style="color:#8fa9c0">${esc(s.extract)}</p><p class="dim" style="font-size:9px;letter-spacing:1.5px">— SOURCE: WIKIPEDIA</p>`;
  }
}

// ───────────────────────── UI helpers ─────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
function section(id, n, title, body, meta = '', metaOn = false) {
  const open = state.open.has(id);
  return `<div class="sec ${open ? 'open' : ''}" data-sec="${id}">
    <div class="sh" data-toggle="${id}"><span class="ar">${open ? '▾' : '▸'}</span><span class="n">${n}//</span>${esc(title.toUpperCase())}<span class="meta ${metaOn ? 'on' : ''}">${meta}</span></div>
    <div class="sb">${body}</div></div>`;
}
function optRow({ group, value, label, color, on, count, radio }) {
  return `<label class="opt ${on ? 'on' : ''} ${radio ? 'radio' : ''}" style="color:${color || 'var(--c)'}">
    <input type="checkbox" data-set="${group}" value="${value}" ${on ? 'checked' : ''}><span class="box"></span>
    <span class="lbl">${esc(label.toUpperCase())}</span><span class="lead"></span>${count !== undefined ? `<span class="cnt" data-cnt="${group}:${value}">${num(count)}</span>` : ''}</label>`;
}

// ───────────────────────── panel: globes ─────────────────────────
function renderGlobes() {
  const pane = $('[data-pane="globes"]');
  const tooOld = (g) => g.kind === 'paleo' && g.ma > paleoModel().maxMa;
  const item = (g) =>
    `<button class="gitem ${state.globe === g.id ? 'active' : ''} ${tooOld(g) ? 'disabled' : ''}" data-globe="${g.id}" ${tooOld(g) ? `title="Older than this plate model covers — pick another model"` : ''}>${esc(g.name)}${tooOld(g) ? '<span class="offtag">BEYOND MODEL</span>' : g.offline && window.kjxOffline ? `<span class="offtag" data-avail="${g.id}" title="Included in the offline pack — download it in the OFFLINE tab">⬇${g.kind === 'history' ? '' : ' PACK'}</span>` : ''}</button>`;
  let html = GLOBE_GROUPS.map((grp, gi) => {
    const id = 'g' + gi;
    const isHistory = grp.items[0].kind === 'history';
    const active = grp.items.find((g) => g.id === state.globe);
    let extra = '';
    if (grp.items.some((g) => g.dated)) extra = `<div class="row"><label>MODIS DAY</label><input type="date" id="modis-date" min="2000-03-01" max="${isoDaysAgo(1)}" value="${state.modisDate}"></div>`;
    if (grp.models) extra = `<div class="row"><label>PLATE MODEL</label><select id="paleo-model">${grp.models.map((m) => `<option value="${m.id}" ${m.id === state.paleoModel ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>`;
    const body = `${grp.note ? `<p class="note">${esc(grp.note)}</p>` : ''}${extra}<div class="${isHistory ? 'hgrid' : ''}">${grp.items.map(item).join('')}</div>`;
    return section(id, pad2(gi + 1), grp.title, body, active ? '● ACTIVE' : `${grp.items.length}`, !!active);
  }).join('');
  const tog = (k, t) => optRow({ group: 'overlay', value: k, label: t, on: state.overlays[k] });
  html += section('overlays', pad2(GLOBE_GROUPS.length + 1), 'Overlays', [tog('labels', 'Place names'), tog('oceanRef', 'Ocean names & depths'), tog('grid', 'Lat / lon grid'), tog('routes', 'Treasure-fleet routes')].join(''), Object.values(state.overlays).filter(Boolean).length + ' ON');
  html += section(
    'key',
    pad2(GLOBE_GROUPS.length + 2),
    'Map key',
    `<p class="note">Estimated area when you select something:</p>${AREA_LEGEND.map(([c, t]) => `<div class="legend-row"><span class="sw" style="border-color:${c};background:${c}22"></span>${esc(t.toUpperCase())}</div>`).join('')}
     <p class="note" style="margin-top:12px">Markers:</p>${Object.values(CATS).map((c) => `<div class="legend-row"><span class="dt" style="background:${c.color};box-shadow:0 0 6px ${c.color}"></span>${esc(c.label.toUpperCase())}</div>`).join('')}
     <div class="legend-row"><span class="dt" style="border:1.5px solid #ffd84f"></span>GOLD RING = TREASURE ON BOARD</div>
     <p class="note" style="margin-top:8px">Big dots are curated files with full detail. Small dots come from Wikidata, NOAA charts and OpenStreetMap; the smallest are unnamed charted wrecks.</p>`,
  );
  pane.innerHTML = html;
  markAvailability();
}
// Replace "⬇ PACK" with "✓ OFFLINE" for items that are actually stored on this Mac.
async function markAvailability() {
  if (!window.kjxOffline) return;
  const tags = [...document.querySelectorAll('[data-avail]')];
  const urlFor = (id) => {
    const g = findGlobe(id);
    if (g.kind === 'history') return histUrl(g);
    if (g.kind === 'paleo') return paleoUrl(state.paleoModel, g.ma);
    return null;
  };
  const st = offStatus || (await window.kjxOffline.status());
  const urls = tags.map((t) => urlFor(t.dataset.avail));
  const res = await window.kjxOffline.has(urls.map((u) => u || 'about:blank'));
  tags.forEach((t, i) => {
    const g = findGlobe(t.dataset.avail);
    const ok = urls[i] ? !!res[i] : st.pack.finished; // tile globes: complete once the pack is finished
    if (!ok) return;
    t.textContent = g.kind === 'history' ? '✓' : '✓ OFFLINE';
    t.title = 'Stored on this Mac — works without internet';
    t.style.color = 'var(--green)';
    t.style.borderColor = 'rgba(61,255,127,.45)';
  });
}

// ───────────────────────── panel: filters ─────────────────────────
function activeFilterCount() {
  const f = state.filters, d = DEFAULT_FILTERS();
  let n = 0;
  for (const k of ['cats', 'veracity', 'status', 'sources']) if (f[k].size !== d[k].size) n++;
  for (const k of ['treasure', 'undated', 'text', 'syncHistory', 'hasImage', 'namedOnly']) if (f[k] !== d[k]) n++;
  if (f.yearMin !== d.yearMin || f.yearMax !== d.yearMax) n++;
  return n;
}
function renderFilters() {
  const f = state.filters;
  const groupBody = (group, defs) =>
    `<div class="allnone"><button data-all="${group}">ALL</button><button data-none="${group}">NONE</button></div>` +
    Object.entries(defs).map(([k, d]) => optRow({ group, value: k, label: d.label, color: d.color, on: f[group].has(k), count: facetCounts[group]?.[k] || 0 })).join('');
  const sel = (group, defs) => (f[group].size === Object.keys(defs).length ? 'ALL' : `${f[group].size}/${Object.keys(defs).length}`);
  const segBtns = (key, opts) => `<div class="seg">${opts.map(([v, t]) => `<button data-seg="${key}" data-v="${v}" class="${f[key] === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const era = ERAS.find(([, a, b]) => a === f.yearMin && b === f.yearMax);
  const n = activeFilterCount();

  $('[data-pane="filters"]').innerHTML = `
    <div class="field"><span>›</span><input type="search" id="search" placeholder="SEARCH NAME, TYPE, COUNTRY…" value="${esc(f.textRaw ?? f.text)}" spellcheck="false" autocomplete="off"></div>
    <div class="statusline"><span>${n ? `<span class="act">${n} FILTER${n > 1 ? 'S' : ''} ACTIVE</span>` : 'NO FILTERS · SHOWING ALL'}</span><button id="reset-filters" ${n ? '' : 'disabled'}>RESET</button></div>
    ${section('presets', '01', 'Quick views', `<div class="chips">${PRESETS.map((p) => `<button class="chip preset ${state.preset === p.id ? 'on' : ''}" data-preset="${p.id}">${esc(p.name.toUpperCase())}<small>${esc(p.hint)}</small></button>`).join('')}</div>`, state.preset !== 'all' ? '● ' + PRESETS.find((p) => p.id === state.preset)?.name.toUpperCase() : '', state.preset !== 'all')}
    ${section('type', '02', 'What', groupBody('cats', CATS), sel('cats', CATS), f.cats.size !== Object.keys(CATS).length)}
    ${section('truth', '03', 'Myth or confirmed', groupBody('veracity', VERACITY), sel('veracity', VERACITY), f.veracity.size !== 4)}
    ${section('status', '04', 'Lost or found', groupBody('status', STATUS), sel('status', STATUS), f.status.size !== 4)}
    ${section('treasure', '05', 'Treasure', `<p class="note">Valuables on board: gold, silver, coins, jewels, cargo.</p>${segBtns('treasure', [['all', 'ALL'], ['yes', '★ ONLY'], ['no', 'NONE']])}`, f.treasure === 'all' ? 'ALL' : f.treasure === 'yes' ? '★ ONLY' : 'NO ★', f.treasure !== 'all')}
    ${section(
      'time',
      '06',
      'When lost',
      `<div class="chips">${ERAS.map(([t, a, b]) => `<button class="chip ${era && era[0] === t ? 'on' : ''}" data-range="${a},${b}">${esc(t.toUpperCase())}</button>`).join('')}</div>
       <div class="row"><label>FROM YEAR</label><input type="number" data-num="yearMin" value="${f.yearMin}" step="50"></div>
       <div class="row"><label>TO YEAR</label><input type="number" data-num="yearMax" value="${f.yearMax}" step="10"></div>
       <p class="note">Negative years are BC.</p>
       ${optRow({ group: 'bool', value: 'undated', label: 'Include unknown dates', on: f.undated })}
       ${optRow({ group: 'bool', value: 'syncHistory', label: 'Match history globe year', on: f.syncHistory })}`,
      era ? era[0].toUpperCase() : `${fmtYear(f.yearMin)}–${fmtYear(f.yearMax)}`,
      !(era && era[0] === 'All time'),
    )}
    ${section('data', '07', 'Data source', `${groupBody('sources', SOURCES)}<div style="height:6px"></div>${optRow({ group: 'bool', value: 'namedOnly', label: 'Hide unnamed charted wrecks', on: f.namedOnly })}${optRow({ group: 'bool', value: 'hasImage', label: 'Has picture / article', on: f.hasImage })}`, sel('sources', SOURCES), f.sources.size !== 4 || f.hasImage || f.namedOnly)}`;
}
function updateFilterCounts() {
  document.querySelectorAll('[data-cnt]').forEach((el) => {
    const [g, v] = el.dataset.cnt.split(':');
    el.textContent = num(facetCounts[g]?.[v] || 0);
  });
}
function filtersChanged(rerender = true) {
  applyFilters();
  if (rerender) {
    const pane = $('[data-pane="filters"]');
    const top = pane.scrollTop;
    renderFilters();
    pane.scrollTop = top;
  }
}

// ───────────────────────── panel: index & myths ─────────────────────────
const dot = (e) => `<span class="dt" style="background:${(CATS[e.category] || CATS.ship).color};${e.treasure ? 'box-shadow:0 0 0 1.5px #ffd84f' : ''}"></span>`;
function renderList() {
  const pane = $('[data-pane="list"]');
  if (!pane.classList.contains('active')) return;
  // The search box is created once and never re-rendered, so typing (spaces included) is never disturbed.
  if (!$('#list-search')) pane.innerHTML = `<div class="field"><span>›</span><input type="search" id="list-search" placeholder="SEARCH VISIBLE ENTRIES…" spellcheck="false" autocomplete="off"></div><div id="list-results"></div>`;
  const q = fold($('#list-search').value).trim();
  const matches = entries.filter((e) => failMask(e, state.filters) === 0 && (!q || e._search.includes(q)));
  matches.sort((a, b) => (b.source === 'curated') - (a.source === 'curated') || (b.treasure === true) - (a.treasure === true) || a.name.localeCompare(b.name));
  $('#list-results').innerHTML = `
    <div class="statusline"><span>${num(matches.length)} RESULTS${matches.length > 400 ? ' · FIRST 400' : ''}</span><span>CURATED + ★ FIRST</span></div>
    <div>${matches
      .slice(0, 400)
      .map((e) => `<div class="list-item" data-pick="${e._i}">${dot(e)}<div class="t"><b>${e.treasure ? '<span class="gold">★</span> ' : ''}${esc(e.name)}</b><small>${esc([e.type, e.country].filter(Boolean).join(' · ') || e.summary || '')}</small></div><span class="yr">${esc(fmtYear(e.lostYear))}</span></div>`)
      .join('')}</div>`;
}

function renderMyths() {
  const groups = [
    ['myth', 'Myths', 'No historical evidence: sunken continents, ghost ships, phantom islands.'],
    ['legend', 'Legends', 'Rooted in real history, but the treasure or place is unproven.'],
    ['disputed', 'Disputed & rumoured', 'Real events with contested claims about cargo or identity.'],
  ];
  $('[data-pane="myths"]').innerHTML =
    `<p class="note">Every myth, legend and rumour in the index. Select one to fly to its supposed location.</p>` +
    groups
      .map(([k, title, note]) => {
        const items = entries.filter((e) => e.veracity === k).sort((a, b) => (b.treasure === true) - (a.treasure === true) || a.name.localeCompare(b.name));
        const c = VERACITY[k].color;
        return `<div class="mhead" style="color:${c};text-shadow:0 0 6px ${c}">${title.toUpperCase()} · ${items.length}</div><p class="note">${note}</p>
          ${items.map((e) => `<div class="myth-card" style="border-left-color:${c}" data-pick="${e._i}"><b>${e.treasure ? '<span class="gold">★</span> ' : ''}${esc(e.name)}</b><small>${esc([CATS[e.category]?.one, STATUS[e.status]?.label, e.value].filter(Boolean).join(' · '))}</small><p>${esc(e.summary || '')}</p></div>`).join('')}`;
      })
      .join('');
}

// ───────────────────────── events ─────────────────────────
function setBusy(msg) {
  const l = $('#loading');
  if (msg) {
    l.textContent = msg;
    l.classList.remove('done');
    l.style.background = 'rgba(2,6,13,0.7)';
  } else l.classList.add('done');
}

document.addEventListener('click', (ev) => {
  const o = ev.target.closest('[data-off]');
  if (o && window.kjxOffline) {
    offlineAction(o.dataset.off);
    return;
  }
  const t = ev.target.closest('[data-tab],[data-globe],[data-pick],[data-seg],[data-range],[data-zoom],[data-copy],[data-toggle],[data-preset],[data-all],[data-none],#reset-filters,#detail .close');
  if (!t) return;
  const f = state.filters;
  if (t.dataset.tab) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === t));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t.dataset.tab));
    if (t.dataset.tab === 'list') renderList();
    if (t.dataset.tab === 'offline') renderOffline();
  } else if (t.dataset.toggle) {
    const id = t.dataset.toggle;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    const sec = t.closest('.sec');
    sec.classList.toggle('open');
    $('.ar', sec).textContent = sec.classList.contains('open') ? '▾' : '▸';
  } else if (t.dataset.globe) {
    const g = findGlobe(t.dataset.globe);
    if (g.kind === 'paleo' && g.ma > paleoModel().maxMa) notify(`${paleoModel().name.split(' ·')[0]} only goes back ${paleoModel().maxMa} million years — pick another plate model above.`);
    else setGlobe(t.dataset.globe);
  } else if (t.dataset.pick) select(entries[+t.dataset.pick]);
  else if (t.dataset.preset) {
    const p = PRESETS.find((x) => x.id === t.dataset.preset);
    state.filters = { ...DEFAULT_FILTERS(), ...p.apply() };
    state.preset = p.id;
    filtersChanged();
  } else if (t.dataset.all || t.dataset.none) {
    const g = t.dataset.all || t.dataset.none;
    const defs = { cats: CATS, veracity: VERACITY, status: STATUS, sources: SOURCES }[g];
    f[g] = new Set(t.dataset.all ? Object.keys(defs) : []);
    state.preset = '';
    filtersChanged();
  } else if (t.dataset.seg) {
    f[t.dataset.seg] = t.dataset.v;
    state.preset = '';
    filtersChanged();
  } else if (t.dataset.range) {
    const [a, b] = t.dataset.range.split(',').map(Number);
    Object.assign(f, { yearMin: a, yearMax: b });
    state.preset = '';
    filtersChanged();
  } else if (t.dataset.zoom) zoom(t.dataset.zoom);
  else if (t.dataset.copy) {
    ev.preventDefault();
    navigator.clipboard?.writeText(t.dataset.copy);
    t.textContent = 'COPIED ✓';
  } else if (t.id === 'reset-filters') {
    state.filters = DEFAULT_FILTERS();
    state.preset = 'all';
    filtersChanged();
  } else if (t.classList.contains('close')) select(null);
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  const f = state.filters;
  if (t.dataset.set === 'overlay') {
    setOverlay(t.value, t.checked);
    orderOverlays();
    renderGlobes();
  } else if (t.dataset.set === 'bool') {
    f[t.value] = t.checked;
    state.preset = '';
    filtersChanged();
  } else if (t.dataset.set) {
    t.checked ? f[t.dataset.set].add(t.value) : f[t.dataset.set].delete(t.value);
    state.preset = '';
    filtersChanged();
  } else if (t.dataset.num) {
    f[t.dataset.num] = Number(t.value);
    state.preset = '';
    filtersChanged();
  } else if (t.id === 'modis-date') {
    state.modisDate = t.value;
    setGlobe('modis');
  } else if (t.id === 'paleo-model') {
    state.paleoModel = t.value;
    const cur = findGlobe(state.globe);
    if (cur?.kind === 'paleo') {
      if (cur.ma > paleoModel().maxMa) {
        const fallback = [...GLOBE_GROUPS.find((x) => x.models).items].reverse().find((x) => x.ma <= paleoModel().maxMa);
        notify(`This model only goes back ${paleoModel().maxMa} million years — showing ${fallback.ma} Ma instead.`);
        setGlobe(fallback.id);
      } else setGlobe(state.globe);
    } else renderGlobes();
  }
});

let searchTimer;
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'search') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.textRaw = ev.target.value;
      state.filters.text = fold(ev.target.value).trim();
      state.preset = '';
      applyFilters();
      const sl = $('.statusline span');
      const n = activeFilterCount();
      if (sl) sl.innerHTML = n ? `<span class="act">${n} FILTER${n > 1 ? 'S' : ''} ACTIVE</span>` : 'NO FILTERS · SHOWING ALL';
      $('#reset-filters').disabled = !n;
    }, 200);
  } else if (ev.target.id === 'list-search') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 150);
  }
});

function zoom(kind) {
  const h = camera.positionCartographic.height;
  if (kind === 'in') camera.zoomIn(h * 0.5);
  if (kind === 'out') camera.zoomOut(h * 1.0);
  if (kind === 'home') {
    flying = true;
    camera.flyTo({ destination: HOME, duration: 1.5, complete: () => (flying = false), cancel: () => (flying = false) });
  }
  if (kind === 'panel') togglePanel();
  if (kind === 'north') camera.flyTo({ destination: camera.position.clone(), orientation: { heading: 0, pitch: camera.pitch, roll: 0 }, duration: 0.8 });
}
document.addEventListener('keydown', (ev) => {
  if (ev.target.matches('input,select,textarea')) return;
  if (ev.key === 'Escape') select(null);
  if (ev.key === '+' || ev.key === '=') zoom('in');
  if (ev.key === '-') zoom('out');
  if (ev.key === 'h' || ev.key === 'H') zoom('home');
  if (ev.key === 'n' || ev.key === 'N') zoom('north');
  if (ev.key === 'p' || ev.key === 'P') togglePanel();
});

const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
scene.canvas.addEventListener('mouseleave', () => ($('#tooltip').hidden = true));
const pickEntry = (pos) => {
  const picked = scene.pick(pos);
  return picked && picked.id && picked.id.kjx !== undefined ? entries[picked.id.kjx] : null;
};
handler.setInputAction((ev) => {
  const e = pickEntry(ev.position);
  if (e) select(e);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

let hoverPending = null;
handler.setInputAction((ev) => {
  if (hoverPending) return;
  hoverPending = requestAnimationFrame(() => {
    hoverPending = null;
    const e = pickEntry(ev.endPosition);
    const tip = $('#tooltip');
    if (!e) {
      tip.hidden = true;
      scene.canvas.style.cursor = '';
      return;
    }
    scene.canvas.style.cursor = 'pointer';
    tip.hidden = false;
    tip.innerHTML = `${BRACKETS}<b>${e.treasure ? '<span class="gold">★</span> ' : ''}${esc(e.name)}</b><small>${esc([e.type, fmtYear(e.lostYear), VERACITY[e.veracity]?.label].filter(Boolean).join(' · ').toUpperCase())}</small>`;
    tip.style.left = ev.endPosition.x + 14 + 'px';
    tip.style.top = ev.endPosition.y + 14 + 'px';
  });
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// ───────────────────────── offline mode ─────────────────────────
const GB = 1024 ** 3;
const fmtBytes = (b) => (b >= GB ? (b / GB).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(0) + ' MB');
let offStatus = null;
let areaEstimate = null;
function viewBox() {
  const r = camera.computeViewRectangle();
  if (!r) return null;
  const d = Cesium.Math.toDegrees;
  return [d(r.west), d(r.south), d(r.east), d(r.north)].map((v) => +v.toFixed(4));
}
async function offlineAction(a) {
  const api = window.kjxOffline;
  if (a === 'start') await api.startPack();
  if (a === 'pause') await api.pausePack();
  if (a === 'clear' && confirm('Delete all cached tiles and pictures you browsed? (The offline pack stays.)')) await api.clearCache();
  if (a === 'estimate') {
    const box = viewBox();
    areaEstimate = box ? { box, ...(await api.estimateArea(box)) } : null;
    renderOffline();
  }
  if (a === 'area' && areaEstimate) await api.downloadArea(areaEstimate.box);
  if (a === 'cancel-area') await api.cancelArea();
}
function renderOffline() {
  const pane = $('[data-pane="offline"]');
  if (!pane.classList.contains('active')) return;
  if (!window.kjxOffline) {
    pane.innerHTML = '<p class="note">Offline mode is part of the desktop app (KJX.app). In the browser version, everything loads live.</p>';
    return;
  }
  const s = offStatus;
  if (!s) return void (pane.innerHTML = '<p class="note">Reading storage…</p>');
  const used = s.packBytes + s.cacheBytes;
  const pct = (b) => Math.min(100, (b / s.cap) * 100).toFixed(2) + '%';
  const p = s.pack, a = s.area;
  const ppct = p.total ? (p.done / p.total) * 100 : p.finished ? 100 : 0;
  pane.innerHTML = `
    <div class="statusline"><span>STATUS: <span id="netstate2" class="${navigator.onLine ? 'glow' : 'act'}">${navigator.onLine ? '● ONLINE' : '○ OFFLINE'}</span></span><span>CAP ${fmtBytes(s.cap)}</span></div>
    <div class="meter"><i class="pk" style="width:${pct(s.packBytes)}"></i><i class="ch" style="width:${pct(s.cacheBytes)}"></i></div>
    <div class="mrow"><span><span class="glow">■</span> OFFLINE PACK</span><b>${fmtBytes(s.packBytes)} · ${num(s.packFiles)} files</b></div>
    <div class="mrow"><span style="color:var(--blue)">■ BROWSING CACHE</span><b>${fmtBytes(s.cacheBytes)} · ${num(s.cacheFiles)} files</b></div>
    <div class="mrow"><span>FREE OF 5 GB</span><b>${fmtBytes(Math.max(0, s.cap - used))}</b></div>
    <p class="note" style="margin-top:8px">Hard limit 5 GB. When it fills up, the least-recently-viewed cached tiles and pictures are deleted first. The offline pack is never deleted.</p>
    ${section('offpack', '01', 'Offline pack', `
      <p class="note">Works with no internet: all ${num(entries.length)} records, Wikipedia text + one photo per entry, all 55 history-border maps, deep-time coastlines (12 ages × 4 models), NASA Blue Marble and GEBCO ocean-floor maps down to zoom 8. About 2.7 GB; the download resumes where it stopped.</p>
      <div class="mrow"><span>${esc((p.running ? '▶ ' : '') + (p.phase === 'idle' ? '' : p.phase || '').toUpperCase())}</span><b>${p.total ? `${num(p.done)} / ${num(p.total)}` : p.finished ? 'COMPLETE ✓' : s.packFiles ? 'PARTLY DOWNLOADED' : 'NOT STARTED'}</b></div>
      <div class="prog"><i style="width:${ppct.toFixed(1)}%"></i></div>
      ${p.failed ? `<div class="mrow"><span>SKIPPED (unavailable)</span><b>${num(p.failed)}</b></div>` : ''}
      ${p.error ? `<p class="note" style="color:var(--red)">${esc(p.error)}</p>` : ''}
      <div class="btnrow">${p.running ? '<button class="tbtn red" data-off="pause">PAUSE</button>' : `<button class="tbtn" data-off="start">${p.finished ? 'CHECK FOR GAPS' : p.done || s.packFiles ? 'RESUME DOWNLOAD' : 'DOWNLOAD PACK'}</button>`}</div>`, p.finished ? '✓ READY' : p.running ? '▶ ' + Math.round(ppct) + '%' : '', p.running)}
    ${section('offarea', '02', 'Download this area', `
      <p class="note">High-resolution ocean-floor tiles for what's on screen right now: GEBCO zoom 9–11 everywhere, plus EMODnet zoom 9–12 in European waters. Counts toward the 5 GB cap. Zoom to a region first.</p>
      ${areaEstimate ? `<div class="mrow"><span>AREA</span><b>${areaEstimate.box.map((v) => v.toFixed(1)).join(', ')}</b></div><div class="mrow"><span>ESTIMATE</span><b>${num(areaEstimate.tiles)} tiles ≈ ${fmtBytes(areaEstimate.bytes)}</b></div>${areaEstimate.tiles > 60000 ? '<p class="note" style="color:var(--amber)">Very large area — zoom in further, or this could fill most of your 5 GB.</p>' : ''}` : ''}
      ${a.total ? `<div class="mrow"><span>${a.running ? '▶ DOWNLOADING' : 'LAST AREA'}</span><b>${num(a.done)} / ${num(a.total)}</b></div><div class="prog"><i style="width:${((a.done / a.total) * 100).toFixed(1)}%"></i></div>` : ''}
      ${a.error ? `<p class="note" style="color:var(--red)">${esc(a.error)}</p>` : ''}
      <div class="btnrow"><button class="tbtn" data-off="estimate">MEASURE VIEW</button>${a.running ? '<button class="tbtn red" data-off="cancel-area">STOP</button>' : `<button class="tbtn" data-off="area" ${areaEstimate && areaEstimate.tiles > 0 ? '' : 'disabled'}>DOWNLOAD</button>`}</div>`, a.running ? '▶ ' + Math.round((a.done / Math.max(1, a.total)) * 100) + '%' : '', a.running)}
    ${section('offcache', '03', 'Browsing cache', `
      <p class="note">Map tiles from NASA, GEBCO and EMODnet, Wikipedia text and photos, history and deep-time maps you've viewed are kept automatically. Esri and OpenStreetMap maps aren't stored (their terms don't allow it), so they need internet.</p>
      <div class="btnrow"><button class="tbtn red" data-off="clear" ${s.cacheFiles ? '' : 'disabled'}>CLEAR CACHE</button></div>`, fmtBytes(s.cacheBytes))}`;
}
function updateNetState() {
  const on = navigator.onLine;
  $('#online').innerHTML = `<span class="blink ${on ? 'glow' : ''}" style="${on ? '' : 'color:var(--amber)'}">●</span> <span class="dim">${num(entries.length)} RECORDS · </span><span id="netstate" class="${on ? 'glow' : 'off'}">${on ? 'ONLINE' : 'OFFLINE'}</span>`;
  // Offline and on a globe that needs the internet → fall back to Blue Marble (in the offline pack).
  if (!on && !findGlobe(state.globe)?.offline) setGlobe('blue-marble');
  renderOffline();
}
window.addEventListener('online', updateNetState);
window.addEventListener('offline', updateNetState);
if (window.kjxOffline) {
  window.kjxOffline.onUpdate((s) => {
    offStatus = s;
    renderOffline();
  });
  window.kjxOffline.status().then((s) => ((offStatus = s), renderOffline()));
}

// ───────────────────────── window chrome ─────────────────────────
function togglePanel(force) {
  const hide = force ?? !document.body.classList.contains('nopanel');
  document.body.classList.toggle('nopanel', hide);
  const b = $('#panel-toggle');
  b.textContent = hide ? '⇤' : '⇥';
  b.title = hide ? 'Show sidebar (P)' : 'Hide sidebar for a clean view (P)';
  try { localStorage.setItem('kjx.nopanel', hide ? '1' : ''); } catch {}
}
try { if (localStorage.getItem('kjx.nopanel')) togglePanel(true); } catch {}

// Top bar: only in the desktop app and only when windowed. The main process watches the real cursor
// and tells us when to show it (reach the top edge) and hide it (move away).
if (window.kjxApp) {
  document.body.classList.add('desktop');
  window.kjxApp.onTopBar((v) => document.body.classList.toggle('topbar-on', v));
  const setFs = (fs) => document.body.classList.toggle('fullscreen', fs);
  window.kjxApp.onFullscreen(setFs);
  window.kjxApp.isFullscreen().then(setFs);
}

// ───────────────────────── boot ─────────────────────────
renderGlobes();
await setGlobe(state.globe);
await loadData();
applyFilters();
renderFilters();
renderMyths();
updateNetState();
setBusy(null);
window.kjx = { viewer, entries, state, select, setGlobe };
