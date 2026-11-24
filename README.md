# KJX

A treasure-hunting globe for macOS: every mapped shipwreck, plane crash, sunken submarine, lost spacecraft, buried hoard, sunken city and treasure legend I could find, shown on a 3D globe with their estimated locations.

![icon](build/icon.png)

## What's in it

- **33,000+ entries.** About 300 are hand-curated with full details (treasure value, myth vs. confirmed, search radius, history). Over 33,000 more come from Wikidata: about 30,500 shipwrecks, 1,900 aviation accidents, 110 treasure hoards and 220 sunken or lost cities.
- **Each entry has:** myth / legend / disputed / confirmed · found / partly found / salvaged / still lost · treasure yes/no and estimated value · build year · date lost · date and finder of the discovery · deaths · depth · length · tonnage · flag · operator · coordinates · search radius · description · picture (pulled live from Wikipedia).
- **Selecting an entry** flies the camera to it and draws the estimated area as colour-coded rings (green = found, orange = partly found, red = still lost, yellow = disputed, purple = legend, pink = myth).
- **Right panel**
  - **Globes**, more than 80 to choose from:
    - Today: satellite, ocean-floor and bathymetry maps (GEBCO, EMODnet), sonar and night-vision styles.
    - NASA: Blue Marble, Black Marble (Earth at night), and MODIS true colour for any day since 2000.
    - Maps: NatGeo, topographic, OpenStreetMap, antique sepia sea chart, ink, dark and light styles.
    - History: world political borders for 55 eras, from 123,000 BC to 2010.
    - Deep time: plate-tectonic coastlines from 20 to 750 million years ago, with 4 different research models.
  - **Filters:** type, myth vs. confirmed, lost vs. found, treasure, year range with era presets, curated only, has a picture, text search. On history globes you can also show only wrecks that had already sunk by that year.
  - **Wrecks:** a searchable list of everything currently visible.
  - **Myths & Rumours:** a separate column for every myth, legend and rumour.
- **Overlays:** place names, ocean names and depths, lat/lon grid, historic treasure-fleet routes (Spanish Flota, Manila galleons, Portuguese Carreira, VOC).

## Run it

```bash
npm install
npm run dev        # browser version at http://localhost:5199
npm run app        # desktop window (Electron)
npm run package    # builds dist-app/mac-arm64/KJX.app
```

## Update the data

```bash
npm run data       # re-pulls everything from Wikidata (~10 min), then merges with the curated set
npm run data:build # only re-merge (after editing scripts/curated/*.mjs)
```

Curated entries live in `scripts/curated/`, one file per theme (treasure ships, famous wrecks, aircraft, lost treasure, myths). To add one, copy an existing entry, change the fields, and run `npm run data:build`.

## Notes

- You need an internet connection: map tiles, historical borders, paleo coastlines and Wikipedia pictures all load live.
- Locations are best public estimates. Some, like the San José, are state secrets. Wikidata entries are only as accurate as Wikidata.
- Built with CesiumJS, Vite and Electron. Data and maps come from Wikidata, Wikipedia, Esri, NASA GIBS, GEBCO, EMODnet, OpenStreetMap, OpenTopoMap, [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0) and the GPlates Web Service.
