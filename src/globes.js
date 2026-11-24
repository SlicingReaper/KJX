// Every globe style KJX can show. `kind` decides how it is rendered:
//   tiles      – an XYZ tile URL template
//   wms        – a WMS endpoint
//   history    – modern muted base + historical political borders for a given year (GeoJSON)
//   paleo      – plain ocean + reconstructed coastlines from GPlates for a given age (millions of years)
// `tint` applies colour adjustments to the imagery (for "antique"/"sonar" styles).

const esri = (svc) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
// GEBCO as Web-Mercator WMS tiles, so the same tile always has the same address (the offline pack relies on it).
const gebco = (layer) =>
  `https://wms.gebco.net/mapserv?service=WMS&version=1.1.1&request=GetMap&layers=${layer}&styles=&srs=EPSG:3857&bbox={westProjected},{southProjected},{eastProjected},{northProjected}&width=256&height=256&format=image/jpeg`;
const gibs = (layer, date, level, ext) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;

export const GLOBE_GROUPS = [
  {
    title: 'Today — satellite & ocean',
    items: [
      { id: 'esri-imagery', name: 'Satellite (Esri World Imagery)', kind: 'tiles', url: esri('World_Imagery'), max: 19, credit: 'Esri, Maxar, Earthstar Geographics', labels: true },
      { id: 'esri-ocean', name: 'Ocean floor (Esri Ocean Basemap)', kind: 'tiles', url: esri('Ocean/World_Ocean_Base'), max: 13, credit: 'Esri, GEBCO, NOAA, Garmin', overlay: esri('Ocean/World_Ocean_Reference') },
      { id: 'gebco', name: 'Bathymetry — GEBCO global grid', kind: 'tiles', url: gebco('GEBCO_LATEST'), max: 13, credit: 'GEBCO Compilation Group' },
      { id: 'gebco-relief', name: 'Bathymetry — GEBCO colour relief', kind: 'tiles', url: gebco('GEBCO_LATEST_2'), max: 13, credit: 'GEBCO Compilation Group', offline: 'pack' },
      { id: 'emodnet', name: 'Bathymetry — EMODnet (Europe, high-res)', kind: 'tiles', url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png', max: 12, credit: 'EMODnet Bathymetry Consortium' },
      { id: 'sonar', name: 'Sonar sweep (styled ocean floor)', kind: 'tiles', url: esri('Ocean/World_Ocean_Base'), max: 13, credit: 'Esri, GEBCO', tint: { hue: 0.35, saturation: 1.6, brightness: 0.75, contrast: 1.4, gamma: 0.8 } },
    ],
  },
  {
    title: 'NASA — Earth from orbit',
    items: [
      { id: 'blue-marble', name: 'Blue Marble Next Generation (2004)', kind: 'tiles', url: gibs('BlueMarble_NextGeneration', '2004-08-01', 8, 'jpeg'), max: 8, credit: 'NASA Earth Observatory', offline: 'pack' },
      { id: 'blue-marble-bathy', name: 'Blue Marble with bathymetry', kind: 'tiles', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', max: 8, credit: 'NASA Earth Observatory' },
      { id: 'black-marble', name: 'Black Marble — Earth at night', kind: 'tiles', url: gibs('VIIRS_Black_Marble', '2016-01-01', 8, 'png'), max: 8, credit: 'NASA Black Marble' },
      { id: 'modis', name: 'MODIS true colour — pick a day (2000→today)', kind: 'tiles', dated: true, url: (date) => gibs('MODIS_Terra_CorrectedReflectance_TrueColor', date, 9, 'jpg'), max: 9, credit: 'NASA GIBS / MODIS Terra' },
    ],
  },
  {
    title: 'Maps & charts',
    items: [
      { id: 'natgeo', name: 'National Geographic style', kind: 'tiles', url: esri('NatGeo_World_Map'), max: 16, credit: 'Esri, National Geographic' },
      { id: 'physical', name: 'Physical world', kind: 'tiles', url: esri('World_Physical_Map'), max: 8, credit: 'Esri, US NPS' },
      { id: 'relief', name: 'Shaded relief', kind: 'tiles', url: esri('World_Shaded_Relief'), max: 13, credit: 'Esri' },
      { id: 'topo', name: 'OpenTopoMap', kind: 'tiles', url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', max: 17, credit: 'OpenTopoMap (CC-BY-SA), OpenStreetMap' },
      { id: 'osm', name: 'OpenStreetMap', kind: 'tiles', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, credit: '© OpenStreetMap contributors' },
      { id: 'streets', name: 'Streets (Esri)', kind: 'tiles', url: esri('World_Street_Map'), max: 19, credit: 'Esri, HERE, Garmin, OpenStreetMap', labels: false },
      { id: 'topo-esri', name: 'Topographic (Esri)', kind: 'tiles', url: esri('World_Topo_Map'), max: 19, credit: 'Esri, HERE, Garmin, USGS', labels: false },
      { id: 'dark', name: 'Midnight (dark canvas)', kind: 'tiles', url: esri('Canvas/World_Dark_Gray_Base'), max: 16, credit: 'Esri, HERE, Garmin', overlay: esri('Canvas/World_Dark_Gray_Reference') },
      { id: 'light', name: 'Paper (light canvas)', kind: 'tiles', url: esri('Canvas/World_Light_Gray_Base'), max: 16, credit: 'Esri, HERE, Garmin' },
      { id: 'nightvision', name: 'Night vision (green)', kind: 'tiles', url: esri('World_Imagery'), max: 19, credit: 'Esri, Maxar', tint: { hue: 0.28, saturation: 0.2, brightness: 1.2, contrast: 1.5, gamma: 0.9 } },
      { id: 'antique', name: 'Antique sea chart (sepia)', kind: 'tiles', url: esri('NatGeo_World_Map'), max: 16, credit: 'Esri, National Geographic', tint: { hue: 0.08, saturation: 0.35, brightness: 0.95, contrast: 1.1, gamma: 1.15 } },
      { id: 'ink', name: 'Ink (high-contrast mono)', kind: 'tiles', url: esri('Canvas/World_Light_Gray_Base'), max: 16, credit: 'Esri', tint: { saturation: 0, contrast: 2.2, brightness: 0.9, gamma: 1.6 } },
      { id: 'osm-de', name: 'OpenStreetMap (German style)', kind: 'tiles', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', max: 18, credit: '© OpenStreetMap contributors' },
    ],
  },
  {
    title: 'History — the world in…',
    note: 'Historical borders from the historical-basemaps project. Tip: turn on "only show what was lost by then".',
    items: [
      ['bc123000', -123000, '123,000 BC — Ice Age'], ['bc10000', -10000, '10,000 BC — end of the Ice Age'], ['bc8000', -8000, '8,000 BC'],
      ['bc5000', -5000, '5,000 BC'], ['bc4000', -4000, '4,000 BC'], ['bc3000', -3000, '3,000 BC'], ['bc2000', -2000, '2,000 BC — Bronze Age'],
      ['bc1500', -1500, '1,500 BC'], ['bc1000', -1000, '1,000 BC'], ['bc700', -700, '700 BC'], ['bc500', -500, '500 BC'], ['bc400', -400, '400 BC'],
      ['bc323', -323, '323 BC — death of Alexander'], ['bc300', -300, '300 BC'], ['bc200', -200, '200 BC'], ['bc100', -100, '100 BC'], ['bc1', -1, '1 BC'],
      ['100', 100, 'AD 100 — Roman Empire'], ['200', 200, 'AD 200'], ['300', 300, 'AD 300'], ['400', 400, 'AD 400'], ['500', 500, 'AD 500'], ['600', 600, 'AD 600'],
      ['700', 700, 'AD 700'], ['800', 800, 'AD 800'], ['900', 900, 'AD 900'], ['1000', 1000, 'AD 1000 — Vikings'], ['1100', 1100, '1100'], ['1200', 1200, '1200'],
      ['1279', 1279, '1279 — Mongol Empire'], ['1300', 1300, '1300'], ['1400', 1400, '1400'], ['1492', 1492, '1492 — Columbus'], ['1500', 1500, '1500'],
      ['1530', 1530, '1530'], ['1600', 1600, '1600 — Age of Sail'], ['1650', 1650, '1650'], ['1700', 1700, '1700 — Golden Age of Piracy'], ['1715', 1715, '1715'],
      ['1783', 1783, '1783'], ['1800', 1800, '1800'], ['1815', 1815, '1815 — after Napoleon'], ['1880', 1880, '1880'], ['1900', 1900, '1900'],
      ['1914', 1914, '1914 — World War I'], ['1920', 1920, '1920'], ['1930', 1930, '1930'], ['1938', 1938, '1938 — eve of World War II'], ['1945', 1945, '1945'],
      ['1960', 1960, '1960 — Cold War'], ['1994', 1994, '1994'], ['2000', 2000, '2000'], ['2010', 2010, '2010'],
    ].map(([file, year, name]) => ({ id: 'hist-' + file, name, kind: 'history', year, file: `world_${file}.geojson`, credit: 'historical-basemaps (A. Ourednik), GPL-3.0', offline: 'pack' })),
  },
  {
    title: 'Deep time — Earth millions of years ago',
    note: 'Coastlines reconstructed with GPlates plate-tectonic models. Wreck markers are hidden in deep time.',
    items: [
      [20, 'Miocene'], [50, 'Eocene'], [66, 'End of the dinosaurs (K–Pg)'], [100, 'Mid-Cretaceous'], [150, 'Late Jurassic'],
      [200, 'Pangaea breaks up'], [250, 'Pangaea (Permian–Triassic)'], [300, 'Carboniferous'], [400, 'Devonian'], [500, 'Cambrian'], [600, 'Ediacaran'], [750, 'Rodinia (Cryogenian)'],
    ].map(([ma, era]) => ({ id: 'paleo-' + ma, name: `${ma} million years ago — ${era}`, kind: 'paleo', ma, credit: 'GPlates Web Service', offline: 'pack' })),
    // Valid age ranges as reported by the GPlates Web Service (Nov 2026). Ages beyond a model are greyed out.
    models: [
      { id: 'MERDITH2021', name: 'Merdith et al. 2021 · 0–1000 Ma', maxMa: 1000 },
      { id: 'MULLER2022', name: 'Müller et al. 2022 · 0–1000 Ma', maxMa: 1000 },
      { id: 'PALEOMAP', name: 'Scotese PALEOMAP · 0–750 Ma', maxMa: 750 },
      { id: 'SCOTESE2016', name: 'Scotese 2016 · 0–750 Ma', maxMa: 750 },
      { id: 'TorsvikCocks2017', name: 'Torsvik & Cocks 2017 · 0–540 Ma', maxMa: 540 },
      { id: 'GOLONKA', name: 'Golonka · 0–540 Ma', maxMa: 540 },
      { id: 'ZAHIROVIC2022', name: 'Zahirovic et al. 2022 · 0–410 Ma', maxMa: 410 },
      { id: 'MATTHEWS2016_pmag_ref', name: 'Matthews et al. 2016 · 0–410 Ma', maxMa: 410 },
      { id: 'MULLER2019', name: 'Müller et al. 2019 · 0–250 Ma', maxMa: 250 },
      { id: 'SETON2012', name: 'Seton et al. 2012 · 0–200 Ma', maxMa: 200 },
    ],
  },
];

export const ALL_GLOBES = GLOBE_GROUPS.flatMap((g) => g.items);
export const findGlobe = (id) => ALL_GLOBES.find((g) => g.id === id);

// Historic trade routes overlay — rough great-circle waypoints (lon, lat).
export const ROUTES = [
  { name: 'Spanish treasure fleet (Flota de Indias) — outbound', color: '#f5c542', pts: [[-6.3, 36.6], [-15.4, 28.1], [-61.0, 15.5], [-75.5, 10.4], [-79.6, 9.5]] },
  { name: 'Spanish treasure fleet — homeward via Havana & Florida Strait', color: '#f5c542', pts: [[-79.6, 9.5], [-75.5, 10.4], [-82.4, 23.1], [-80.0, 25.5], [-79.5, 30], [-65, 37], [-27, 38.7], [-9.5, 37.5], [-6.3, 36.6]] },
  { name: 'Manila galleon route', color: '#ff8c42', pts: [[-99.9, 16.8], [-140, 13], [-170, 13], [144.7, 13.4], [124, 12.5], [120.9, 14.6], [140, 35], [180, 40], [-140, 40], [-124, 36], [-110, 23], [-99.9, 16.8]] },
  { name: 'Portuguese Carreira da Índia', color: '#4fc3f7', pts: [[-9.2, 38.7], [-17, 15], [-30, 0], [-25, -25], [18.4, -34.4], [40, -15], [55, -5], [73.8, 15.5]] },
  { name: 'VOC route to Batavia (Brouwer Route)', color: '#ff6b6b', pts: [[4.9, 52.4], [-5, 48], [-20, 10], [-25, -20], [18.4, -33.9], [60, -39], [100, -38], [113, -28], [106.8, -6.1]] },
];
