import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';
import { GLOBE_GROUPS, findGlobe, ROUTES } from './globes.js';

window.CESIUM_BASE_URL = CESIUM_BASE_URL;

// ───────────────────────── constants ─────────────────────────
const CATS = {
  ship: { label: 'Ships', one: 'Ship', color: '#4fc3f7' },
  submarine: { label: 'Submarines', one: 'Submarine', color: '#9c7bff' },
  aircraft: { label: 'Aircraft', one: 'Aircraft', color: '#ff7a45' },
  spacecraft: { label: 'Spacecraft', one: 'Spacecraft', color: '#e0e6ee' },
  treasure: { label: 'Treasure & hoards', one: 'Treasure / hoard', color: '#f5c542' },
  city: { label: 'Sunken & lost cities', one: 'Sunken / lost city', color: '#5ad17a' },
};
const VERACITY = {
  confirmed: { label: 'Confirmed', color: '#3ddc84' },
  disputed: { label: 'Disputed', color: '#ffd23f' },
  legend: { label: 'Legend', color: '#b388ff' },
  myth: { label: 'Myth', color: '#ff6bcb' },
};
const STATUS = {
  found: { label: 'Found' },
  salvaged: { label: 'Salvaged' },
  partial: { label: 'Partly found' },
  lost: { label: 'Still lost' },
};
// Colour of the estimated-area overlay when something is selected.
function areaColor(e) {
  if (e.veracity === 'myth') return '#ff6bcb';
  if (e.veracity === 'legend') return '#b388ff';
  if (e.veracity === 'disputed') return '#ffd23f';
  if (e.status === 'lost') return '#ff5a4f';
  if (e.status === 'partial') return '#ff9f43';
  return '#3ddc84';
}
const AREA_LEGEND = [
  ['#3ddc84', 'Confirmed & found / salvaged'],
  ['#ff9f43', 'Confirmed, partly found'],
  ['#ff5a4f', 'Confirmed, still lost'],
  ['#ffd23f', 'Disputed'],
  ['#b388ff', 'Legend'],
  ['#ff6bcb', 'Myth'],
];

// ───────────────────────── state ─────────────────────────
const state = {
  globe: 'esri-imagery',
  modisDate: isoDaysAgo(3),
  paleoModel: 'MULLER2019',
  overlays: { labels: true, grid: false, routes: false, oceanRef: false },
  filters: {
    cats: new Set(Object.keys(CATS)),
    veracity: new Set(Object.keys(VERACITY)),
    status: new Set(Object.keys(STATUS)),
    treasure: 'all',
    source: 'all',
    yearMin: -15000,
    yearMax: 2026,
    undated: true,
    text: '',
    syncHistory: false,
    hasImage: false,
  },
  selected: null,
};
let entries = [];
let historyYear = null;
let deepTime = false;

function isoDaysAgo(n) {
  const d = new Date(Date.now() - n * 864e5);
  return d.toISOString().slice(0, 10);
}
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtYear = (y) => (y === undefined || y === null || y === '' ? '' : (y = String(y)).startsWith('-') ? `${y.slice(1).split('-')[0]} BC` : y);
function fmtDate(d) {
  if (d === undefined || d === null) return '';
  const s = String(d);
  if (s.startsWith('-')) return fmtYear(s);
  const m = /^(\d{1,4})-(\d\d)(?:-(\d\d))?$/.exec(s);
  if (!m) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${m[3] ? +m[3] + ' ' : ''}${months[+m[2] - 1]} ${m[1]}`;
}

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
  requestRenderMode: false,
});
const scene = viewer.scene;
scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b2236');
scene.globe.enableLighting = false;
scene.fog.enabled = false;
scene.skyAtmosphere.show = true;
scene.screenSpaceCameraController.minimumZoomDistance = 150;
scene.screenSpaceCameraController.maximumZoomDistance = 4e7;
viewer.cesiumWidget.creditContainer.style.display = 'block';
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-30, 25, 2.2e7) });

const points = scene.primitives.add(new Cesium.PointPrimitiveCollection());
const historyLabels = scene.primitives.add(new Cesium.LabelCollection());
let baseLayers = [];
let overlayLayers = {};
let vectorSource = null;
let routeEntities = [];
let areaEntities = [];

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

  const addBase = (provider, tint, index = 0) => {
    const layer = viewer.imageryLayers.addImageryProvider(provider, index);
    if (tint) Object.assign(layer, tint);
    baseLayers.push(layer);
    return layer;
  };

  if (g.kind === 'tiles') {
    addBase(tileProvider(g), g.tint);
    if (g.overlay) addBase(new Cesium.UrlTemplateImageryProvider({ url: g.overlay, maximumLevel: 13 }), null, 1);
  } else if (g.kind === 'wms') {
    addBase(new Cesium.WebMapServiceImageryProvider({ url: g.url, layers: g.layers, parameters: { format: 'image/jpeg', transparent: false }, credit: new Cesium.Credit(g.credit) }));
  } else if (g.kind === 'history') {
    historyYear = g.year;
    // Muted relief underneath, tinted like an old atlas.
    addBase(new Cesium.UrlTemplateImageryProvider({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', maximumLevel: 13, credit: new Cesium.Credit('Esri') }), { saturation: 0.3, brightness: 1.05, hue: 0.06 });
    await loadHistory(g);
  } else if (g.kind === 'paleo') {
    deepTime = true;
    await loadPaleo(g);
  }
  orderOverlays();
  applyFilters();
  renderGlobes();
}

const hashColor = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Cesium.Color.fromHsl((h % 360) / 360, 0.55, 0.55, 0.42);
};

async function loadHistory(g) {
  setBusy(`Loading the world in ${g.name}…`);
  try {
    const url = `https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/${g.file}`;
    const ds = await Cesium.GeoJsonDataSource.load(url, { stroke: Cesium.Color.fromCssColorString('#3a2a14'), strokeWidth: 1, fill: Cesium.Color.TRANSPARENT });
    if (state.globe !== g.id) return;
    const best = new Map();
    for (const ent of ds.entities.values) {
      const name = ent.properties?.NAME?.getValue() || ent.properties?.SUBJECTO?.getValue();
      if (!ent.polygon) continue;
      ent.polygon.material = name ? hashColor(name) : Cesium.Color.TRANSPARENT;
      ent.polygon.outline = false;
      if (!name) continue;
      const positions = ent.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
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
    alert('Could not load historical map — are you online?');
  } finally {
    setBusy(null);
  }
}

async function loadPaleo(g) {
  setBusy(`Rewinding plate tectonics to ${g.ma} million years ago…`);
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#1d4f7a');
  try {
    const model = GLOBE_GROUPS.find((x) => x.models).models.find((m) => m.id === state.paleoModel);
    const ma = Math.min(g.ma, model.maxMa);
    const url = `https://gws.gplates.org/reconstruct/coastlines/?time=${ma}&model=${state.paleoModel}&avoid_map_boundary`;
    const ds = await Cesium.GeoJsonDataSource.load(url, { fill: Cesium.Color.fromCssColorString('#c9b27c'), stroke: Cesium.Color.fromCssColorString('#7a6338'), strokeWidth: 1 });
    if (state.globe !== g.id) return;
    for (const ent of ds.entities.values) if (ent.polygon) ent.polygon.outline = false;
    vectorSource = ds;
    await viewer.dataSources.add(ds);
  } catch (err) {
    console.error(err);
    alert('Could not reach the GPlates web service — are you online?');
  } finally {
    setBusy(null);
  }
}
function restoreBaseColor() {
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b2236');
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
              width: 2.5,
              material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(r.color).withAlpha(0.85), dashLength: 18 }),
              arcType: Cesium.ArcType.GEODESIC,
            },
          }),
        );
    return;
  }
  if (!on) return;
  if (key === 'labels') overlayLayers.labels = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maximumLevel: 19, credit: new Cesium.Credit('Esri') }));
  if (key === 'grid') overlayLayers.grid = viewer.imageryLayers.addImageryProvider(new Cesium.GridImageryProvider({ color: Cesium.Color.WHITE.withAlpha(0.25), glowColor: Cesium.Color.TRANSPARENT, cells: 2 }));
  if (key === 'oceanRef') overlayLayers.oceanRef = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}', maximumLevel: 13, credit: new Cesium.Credit('Esri') }));
}
function orderOverlays() {
  if (!deepTime) restoreBaseColor();
  // Labels/grid stay on top of whichever base is active; labels hidden in deep time and on labelled bases.
  const g = findGlobe(state.globe);
  for (const key of ['oceanRef', 'grid', 'labels']) {
    const want = state.overlays[key] && !(deepTime && key !== 'grid') && !(key === 'labels' && (g.overlay || g.kind === 'history' || g.labels === false || ['natgeo','osm','osm-de','topo','physical'].includes(g.id)));
    if (overlayLayers[key]) {
      viewer.imageryLayers.remove(overlayLayers[key], true);
      delete overlayLayers[key];
    }
    if (want) {
      const keep = state.overlays[key];
      setOverlay(key, true);
      state.overlays[key] = keep;
    }
  }
}

// ───────────────────────── data & points ─────────────────────────
async function loadData() {
  const res = await fetch('data/kjx.json');
  entries = await res.json();
  entries.forEach((e, i) => {
    e._i = i;
    const cat = CATS[e.category] || CATS.ship;
    const curated = e.source === 'curated';
    e._point = points.add({
      position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat, 30),
      color: Cesium.Color.fromCssColorString(cat.color).withAlpha(e.veracity === 'myth' || e.veracity === 'legend' ? 0.75 : curated ? 1 : 0.8),
      pixelSize: curated ? 9 : 5,
      outlineColor: e.treasure ? Cesium.Color.fromCssColorString('#f5c542') : Cesium.Color.fromCssColorString('#04101c').withAlpha(0.8),
      outlineWidth: e.treasure ? 2.5 : 1,
      scaleByDistance: new Cesium.NearFarScalar(2e5, 1.5, 2e7, curated ? 0.85 : 0.6),
      id: { kjx: i },
    });
    e._search = [e.name, e.type, e.country, e.summary, e.operator, e.aircraft].filter(Boolean).join(' ').toLowerCase();
  });
}

function passes(e, f, ignoreText = false) {
  if (!f.cats.has(e.category)) return false;
  if (!f.veracity.has(e.veracity)) return false;
  if (!f.status.has(e.status)) return false;
  if (f.treasure === 'yes' && !e.treasure) return false;
  if (f.treasure === 'no' && e.treasure) return false;
  if (f.source === 'curated' && e.source !== 'curated') return false;
  if (f.hasImage && !e.image && !e.wiki) return false;
  const y = e.lostYear;
  if (y === undefined || y === null) {
    if (!f.undated) return false;
  } else if (y < f.yearMin || y > f.yearMax) return false;
  if (f.syncHistory && historyYear !== null && !(y !== undefined && y <= historyYear)) return false;
  if (!ignoreText && f.text && !e._search.includes(f.text)) return false;
  return true;
}

let visibleCount = 0;
function applyFilters() {
  const f = state.filters;
  visibleCount = 0;
  let treasure = 0;
  for (const e of entries) {
    const show = !deepTime && passes(e, f);
    e._point.show = show;
    if (show) {
      visibleCount++;
      if (e.treasure) treasure++;
    }
  }
  $('#stats').textContent = deepTime
    ? `Deep time view — ${entries.length.toLocaleString()} markers hidden`
    : `Showing ${visibleCount.toLocaleString()} of ${entries.length.toLocaleString()} · ${treasure.toLocaleString()} with treasure`;
  renderList();
}

// ───────────────────────── selection ─────────────────────────
function clearArea() {
  for (const e of areaEntities) viewer.entities.remove(e);
  areaEntities = [];
}

function select(e, fly = true) {
  state.selected = e;
  clearArea();
  if (!e) {
    $('#detail').hidden = true;
    return;
  }
  const r = Math.max((e.radiusKm || 1) * 1000, 120);
  const center = Cesium.Cartesian3.fromDegrees(e.lon, e.lat);
  const color = Cesium.Color.fromCssColorString(areaColor(e));
  // Concentric rings: most likely in the middle, fading towards the edge of the estimated area.
  const rings = [1, 0.66, 0.33];
  rings.forEach((f, k) => {
    areaEntities.push(
      viewer.entities.add({
        position: center,
        ellipse: {
          semiMajorAxis: r * f,
          semiMinorAxis: r * f,
          height: 20 + k * 10,
          material: color.withAlpha(0.12 + k * 0.08),
          outline: true,
          outlineColor: color.withAlpha(k === 0 ? 0.95 : 0.5),
          outlineWidth: 2,
        },
      }),
    );
  });
  areaEntities.push(
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat, 40),
      point: { pixelSize: 12, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: e.name,
        font: '600 14px -apple-system, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }),
  );
  if (fly) {
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, r), {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-62), Math.max(r * 3.4, 2500)),
      duration: 2.2,
    });
  }
  renderDetail(e);
}

const wikiCache = new Map();
async function wikiSummary(title) {
  if (wikiCache.has(title)) return wikiCache.get(title);
  const p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  wikiCache.set(title, p);
  return p;
}

function factRows(e) {
  const rows = [
    ['Category', CATS[e.category]?.one || e.category],
    ['Type', e.type],
    ['Myth or confirmed', VERACITY[e.veracity]?.label],
    ['Status', STATUS[e.status]?.label],
    ['Treasure / valuables', e.treasure ? 'Yes' : 'No'],
    ['Built / made', fmtYear(e.built)],
    ['Sank / crashed / lost', fmtDate(e.lost)],
    ['Discovered', fmtYear(e.discovered)],
    ['Discovered by', e.discoveredBy],
    ['Deaths', e.deaths?.toLocaleString()],
    ['Depth', e.depthM ? `${e.depthM.toLocaleString()} m` : ''],
    ['Length', e.lengthM ? `${e.lengthM} m` : ''],
    ['Tonnage', e.tonnage ? `${e.tonnage.toLocaleString()} t` : ''],
    ['Flag / country', e.country],
    ['Operator', e.operator],
    ['Vehicle', e.aircraft],
    ['Estimated position', `${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`],
    ['Search radius', `${e.radiusKm >= 10 ? Math.round(e.radiusKm) : e.radiusKm} km`],
    ['Data source', e.source === 'curated' ? 'KJX curated' : 'Wikidata'],
    ['Wikidata ID', e.wikidata],
  ];
  return rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
}

async function renderDetail(e) {
  const panel = $('#detail');
  panel.hidden = false;
  panel.scrollTop = 0;
  const cat = CATS[e.category] || CATS.ship;
  const ver = VERACITY[e.veracity];
  const badge = (txt, color) => `<span class="badge" style="color:${color};background:${color}22">${esc(txt)}</span>`;
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
        ${e.treasure ? badge('★ Treasure', '#f5c542') : ''}
        ${e.lostYear !== undefined ? badge(fmtYear(e.lostYear), '#9fb4c8') : ''}
      </div>
      ${e.value ? `<div class="value">💰 ${esc(e.value)}</div>` : ''}
      <div class="desc"><p>${esc(e.summary || '')}</p><div class="wiki-extract"></div></div>
      ${e.locNote ? `<div class="locnote">📍 ${esc(e.locNote)}</div>` : ''}
      <table class="facts">${factRows(e).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="links">
        ${e.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(e.wiki)}" target="_blank">Wikipedia ↗</a>` : ''}
        ${e.wikidata ? `<a href="https://www.wikidata.org/wiki/${e.wikidata}" target="_blank">Wikidata ↗</a>` : ''}
        <a href="https://www.google.com/maps/@${e.lat},${e.lon},12z/data=!3m1!1e3" target="_blank">Google Maps ↗</a>
        <a href="#" data-copy="${e.lat}, ${e.lon}">Copy coordinates</a>
      </div>
    </div>`;
  if (!e.wiki) return;
  const s = await wikiSummary(e.wiki);
  if (state.selected !== e || !s) return;
  const img = s.originalimage?.source || s.thumbnail?.source;
  if (img && !e.image) $('.img-slot', body).innerHTML = `<img class="detail-img" src="${esc(img)}" alt="" onerror="this.remove()">`;
  if (s.extract && s.extract.length > (e.summary || '').length * 0.8) {
    $('.wiki-extract', body).innerHTML = `<p style="color:#b8c6d6">${esc(s.extract)}</p><p style="color:#6f859b;font-size:11px">— Wikipedia</p>`;
  }
}

// ───────────────────────── panel: globes ─────────────────────────
function renderGlobes() {
  const pane = $('[data-pane="globes"]');
  const openState = [...pane.querySelectorAll('details')].map((d) => d.open);
  const item = (g) => `<button class="globe-item ${state.globe === g.id ? 'active' : ''}" data-globe="${g.id}">${esc(g.name)}</button>`;
  pane.innerHTML =
    GLOBE_GROUPS.map((grp, gi) => {
      const isHistory = grp.items[0].kind === 'history';
      const isPaleo = grp.items[0].kind === 'paleo';
      const hasActive = grp.items.some((g) => g.id === state.globe);
      const open = openState.length ? openState[gi] || hasActive : gi === 0 || hasActive;
      let extra = '';
      if (grp.items.some((g) => g.dated))
        extra = `<div class="row"><label>MODIS day</label><input type="date" id="modis-date" min="2000-03-01" max="${isoDaysAgo(1)}" value="${state.modisDate}"></div>`;
      if (isPaleo)
        extra = `<div class="row"><label>Plate model</label><select id="paleo-model">${grp.models.map((m) => `<option value="${m.id}" ${m.id === state.paleoModel ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>`;
      return `<details class="group" ${open ? 'open' : ''}><summary>${esc(grp.title)}</summary>
        ${grp.note ? `<p class="note">${esc(grp.note)}</p>` : ''}${extra}
        <div class="${isHistory ? 'history-grid' : 'globe-list'}">${grp.items.map(item).join('')}</div></details>`;
    }).join('') +
    `<h3>Overlays</h3>
    <label class="toggle"><input type="checkbox" data-overlay="labels" ${state.overlays.labels ? 'checked' : ''}> Place names</label>
    <label class="toggle"><input type="checkbox" data-overlay="oceanRef" ${state.overlays.oceanRef ? 'checked' : ''}> Ocean names & depths (Esri)</label>
    <label class="toggle"><input type="checkbox" data-overlay="grid" ${state.overlays.grid ? 'checked' : ''}> Lat / lon grid</label>
    <label class="toggle"><input type="checkbox" data-overlay="routes" ${state.overlays.routes ? 'checked' : ''}> Historic treasure-fleet routes</label>
    <h3>Estimated-area colours</h3>
    ${AREA_LEGEND.map(([c, t]) => `<div class="legend-row"><span class="sw" style="border-color:${c};background:${c}33"></span>${t}</div>`).join('')}
    <h3>Markers</h3>
    ${Object.values(CATS).map((c) => `<div class="legend-row"><span class="sw" style="border-radius:50%;width:12px;border-color:${c.color};background:${c.color}"></span>${c.label}</div>`).join('')}
    <div class="legend-row"><span class="sw" style="border-radius:50%;width:12px;border-color:#f5c542;background:transparent"></span>Gold ring = treasure / valuables</div>
    <p class="note" style="margin-top:8px">Big dots are KJX-curated entries with full details; small dots come from Wikidata.</p>`;
}

// ───────────────────────── panel: filters ─────────────────────────
function chipGroup(key, defs) {
  return `<div class="chips">${Object.entries(defs)
    .map(([k, d]) => `<label class="chip ${state.filters[key].has(k) ? 'on' : ''}" style="color:${d.color || '#cfe0f0'}"><input type="checkbox" data-set="${key}" value="${k}" ${state.filters[key].has(k) ? 'checked' : ''}>${d.color ? `<span class="dot" style="background:${d.color}"></span>` : ''}<span style="color:var(--text)">${d.label}</span></label>`)
    .join('')}</div>`;
}
function seg(key, opts) {
  return `<div class="seg">${opts.map(([v, t]) => `<button data-seg="${key}" data-v="${v}" class="${state.filters[key] === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
}
function renderFilters() {
  const f = state.filters;
  $('[data-pane="filters"]').innerHTML = `
    <h3>Search</h3>
    <input type="search" id="search" placeholder="Name, type, country…" value="${esc(f.text)}">
    <h3>What</h3>${chipGroup('cats', CATS)}
    <h3>Myth or confirmed</h3>${chipGroup('veracity', VERACITY)}
    <h3>Lost or found</h3>${chipGroup('status', STATUS)}
    <h3>Treasure / valuables</h3>${seg('treasure', [['all', 'All'], ['yes', '★ Treasure only'], ['no', 'No treasure']])}
    <h3>When was it lost</h3>
    <div class="row"><label>From year</label><input type="number" data-num="yearMin" value="${f.yearMin}" step="50"></div>
    <div class="row"><label>To year</label><input type="number" data-num="yearMax" value="${f.yearMax}" step="10"></div>
    <div class="chips" style="margin:6px 0">
      ${[[-15000, 2026, 'All time'], [-15000, 499, 'Ancient'], [500, 1491, 'Medieval'], [1492, 1800, 'Age of Sail'], [1801, 1913, '1800s'], [1914, 1918, 'WWI'], [1939, 1945, 'WWII'], [1946, 2026, 'Modern']].map(([a, b, t]) => `<button class="chip on" style="color:#cfe0f0" data-range="${a},${b}">${t}</button>`).join('')}
    </div>
    <label class="toggle"><input type="checkbox" data-bool="undated" ${f.undated ? 'checked' : ''}> Include entries with unknown date</label>
    <label class="toggle"><input type="checkbox" data-bool="syncHistory" ${f.syncHistory ? 'checked' : ''}> On history globes, only show what was lost by then</label>
    <h3>Data</h3>${seg('source', [['all', 'Everything'], ['curated', 'Curated only']])}
    <label class="toggle"><input type="checkbox" data-bool="hasImage" ${f.hasImage ? 'checked' : ''}> Only entries with a picture / article</label>
    <div class="row" style="margin-top:16px"><button class="btn" id="reset-filters">Reset all filters</button></div>`;
}

// ───────────────────────── panel: list & myths ─────────────────────────
const dot = (e) => `<span class="dot" style="background:${(CATS[e.category] || CATS.ship).color};${e.treasure ? 'box-shadow:0 0 0 2px #f5c542' : ''}"></span>`;
function renderList() {
  const pane = $('[data-pane="list"]');
  if (!pane.classList.contains('active')) return;
  const q = $('#list-search')?.value?.toLowerCase().trim() ?? '';
  const matches = entries.filter((e) => e._point.show && (!q || e._search.includes(q)));
  matches.sort((a, b) => (b.source === 'curated') - (a.source === 'curated') || (b.treasure === true) - (a.treasure === true) || a.name.localeCompare(b.name));
  const shown = matches.slice(0, 400);
  const keepFocus = document.activeElement?.id === 'list-search';
  pane.innerHTML = `<input type="search" id="list-search" placeholder="Search the visible entries…" value="${esc(q)}">
    <p class="note" style="margin:8px 0">${matches.length.toLocaleString()} match the current filters${matches.length > 400 ? ' — showing the first 400' : ''}. Curated and treasure first.</p>
    <div class="list">${shown
      .map((e) => `<div class="list-item" data-pick="${e._i}">${dot(e)}<div class="t"><b>${e.treasure ? '<span class="gold">★</span> ' : ''}${esc(e.name)}</b><small>${esc([e.type, e.country].filter(Boolean).join(' · ') || e.summary || '')}</small></div><span class="yr">${esc(fmtYear(e.lostYear))}</span></div>`)
      .join('')}</div>`;
  if (keepFocus) {
    const inp = $('#list-search');
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

function renderMyths() {
  const pane = $('[data-pane="myths"]');
  const groups = [
    ['myth', 'Myths', 'Stories with no historical evidence — sunken continents, ghost ships, phantom islands.'],
    ['legend', 'Legends', 'Rooted in real history, but the treasure or place has never been proven.'],
    ['disputed', 'Disputed & rumoured', 'Real events with contested claims — rumoured cargo, contested identifications.'],
  ];
  pane.innerHTML =
    `<p class="note">Everything that is a myth, legend or rumour lives here. Click one to fly to its supposed location.</p>` +
    groups
      .map(([k, title, note]) => {
        const items = entries.filter((e) => e.veracity === k).sort((a, b) => (b.treasure === true) - (a.treasure === true) || a.name.localeCompare(b.name));
        return `<h3 style="color:${VERACITY[k].color}">${title} · ${items.length}</h3><p class="note">${note}</p>
          ${items.map((e) => `<div class="myth-card" data-pick="${e._i}"><b>${e.treasure ? '<span class="gold">★</span> ' : ''}${esc(e.name)}</b><small style="color:var(--muted)">${esc([CATS[e.category]?.one, STATUS[e.status]?.label, e.value].filter(Boolean).join(' · '))}</small><p>${esc(e.summary || '')}</p></div>`).join('')}`;
      })
      .join('');
}

// ───────────────────────── events ─────────────────────────
function setBusy(msg) {
  const l = $('#loading');
  if (msg) {
    l.textContent = msg;
    l.classList.remove('done');
    l.style.background = 'rgba(10,20,32,0.6)';
  } else l.classList.add('done');
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-tab],[data-globe],[data-pick],[data-seg],[data-range],[data-zoom],[data-copy],#reset-filters,#detail .close');
  if (!t) return;
  if (t.dataset.tab) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === t));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t.dataset.tab));
    if (t.dataset.tab === 'list') renderList();
  } else if (t.dataset.globe) setGlobe(t.dataset.globe);
  else if (t.dataset.pick) {
    const e = entries[+t.dataset.pick];
    if (!e._point.show && !deepTime) {
      // Make sure the selected entry is visible even if filtered out.
      e._point.show = true;
    }
    select(e);
  } else if (t.dataset.seg) {
    state.filters[t.dataset.seg] = t.dataset.v;
    renderFilters();
    applyFilters();
  } else if (t.dataset.range) {
    const [a, b] = t.dataset.range.split(',').map(Number);
    Object.assign(state.filters, { yearMin: a, yearMax: b });
    renderFilters();
    applyFilters();
  } else if (t.dataset.zoom) zoom(t.dataset.zoom);
  else if (t.dataset.copy) {
    ev.preventDefault();
    navigator.clipboard?.writeText(t.dataset.copy);
    t.textContent = 'Copied ✓';
  } else if (t.id === 'reset-filters') {
    Object.assign(state.filters, { cats: new Set(Object.keys(CATS)), veracity: new Set(Object.keys(VERACITY)), status: new Set(Object.keys(STATUS)), treasure: 'all', source: 'all', yearMin: -15000, yearMax: 2026, undated: true, text: '', syncHistory: false, hasImage: false });
    renderFilters();
    applyFilters();
  } else if (t.classList.contains('close')) select(null);
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.set) {
    const s = state.filters[t.dataset.set];
    t.checked ? s.add(t.value) : s.delete(t.value);
    t.closest('.chip').classList.toggle('on', t.checked);
    applyFilters();
  } else if (t.dataset.bool) {
    state.filters[t.dataset.bool] = t.checked;
    applyFilters();
  } else if (t.dataset.num) {
    state.filters[t.dataset.num] = Number(t.value);
    applyFilters();
  } else if (t.dataset.overlay) {
    setOverlay(t.dataset.overlay, t.checked);
    orderOverlays();
  } else if (t.id === 'modis-date') {
    state.modisDate = t.value;
    setGlobe('modis');
  } else if (t.id === 'paleo-model') {
    state.paleoModel = t.value;
    if (findGlobe(state.globe)?.kind === 'paleo') setGlobe(state.globe);
  }
});

let searchTimer;
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'search') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.text = ev.target.value.toLowerCase().trim();
      applyFilters();
    }, 200);
  } else if (ev.target.id === 'list-search') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 150);
  }
});

function zoom(kind) {
  const cam = viewer.camera;
  const h = cam.positionCartographic.height;
  if (kind === 'in') cam.zoomIn(h * 0.5);
  if (kind === 'out') cam.zoomOut(h * 1.0);
  if (kind === 'home') cam.flyTo({ destination: Cesium.Cartesian3.fromDegrees(-30, 25, 2.2e7), duration: 1.5 });
  if (kind === 'north') cam.flyTo({ destination: cam.position.clone(), orientation: { heading: 0, pitch: cam.pitch, roll: 0 }, duration: 0.8 });
}
document.addEventListener('keydown', (ev) => {
  if (ev.target.matches('input,select,textarea')) return;
  if (ev.key === 'Escape') select(null);
  if (ev.key === '+' || ev.key === '=') zoom('in');
  if (ev.key === '-') zoom('out');
  if (ev.key === 'h' || ev.key === 'H') zoom('home');
  if (ev.key === 'n' || ev.key === 'N') zoom('north');
});

const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
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
    tip.innerHTML = `<b>${e.treasure ? '<span class="gold">★</span> ' : ''}${esc(e.name)}</b><small>${esc([e.type, fmtYear(e.lostYear), VERACITY[e.veracity]?.label].filter(Boolean).join(' · '))}</small>`;
    tip.style.left = ev.endPosition.x + 14 + 'px';
    tip.style.top = ev.endPosition.y + 14 + 'px';
  });
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// ───────────────────────── boot ─────────────────────────
renderGlobes();
renderFilters();
await setGlobe(state.globe);
setOverlay('labels', true);
await loadData();
applyFilters();
renderMyths();
setBusy(null);
window.kjx = { viewer, entries, state, select, setGlobe };
