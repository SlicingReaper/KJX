# KJX

A treasure-hunting globe for macOS: every mapped shipwreck, plane crash, sunken submarine, lost spacecraft, buried hoard, sunken city and treasure legend I could find, shown on a 3D globe with their estimated locations.

![icon](build/icon.png)

## What's in it

- **Every wreck I could find, from five sources:**
  - **KJX curated** (~440 entries): treasure galleons, famous wrecks, crashes, sunken cars and trains, lost hoards, and 245 myths, legends and rumours, all with full detail. Myths with thin evidence carry a ⚠ data note.
  - **Wikidata** (~34,500): shipwrecks, aviation and railway accidents, maritime disasters, scuttled and capsized ships, wreck dive sites, treasure hoards, sunken and lost cities, phantom islands and mythical places.
  - **NOAA nautical charts** (~9,300 after removing duplicates): every charted wreck in US waters.
  - **OpenStreetMap:** mapped wrecks worldwide (`historic=wreck`, `seamark:type=wreck`, `historic=aircraft_wreck`).
  - Points within ~200 m of a higher-ranked source are treated as duplicates and skipped.
- **Categories:** ships · submarines · aircraft · spacecraft · treasure and hoards · sunken and lost cities · cars, trains and tanks.
- **Each entry has:** myth / legend / disputed / confirmed · found / partly found / salvaged / still lost · treasure and its value · build year · date lost · date and finder of the discovery · deaths · depth · size · flag · operator · coordinates · search radius · description · picture (live from Wikipedia).
- **Selecting an entry** flies the camera to it and draws the estimated area as colour-coded rings.
- **Globes:** 80+ to choose from. Satellite, ocean floor and bathymetry; NASA (Blue Marble, night lights, daily MODIS since 2000); map styles; world borders for 55 eras; plate-tectonic coastlines from 20 to 750 million years ago.
- **Filters:** quick-view presets, then collapsible sections (type, myth vs. confirmed, lost vs. found, treasure, time, data source). Every option shows a live count.
- **Positions:** curated wreck positions are cross-checked against Wikipedia coordinates (`npm run data:verify`). Corrections are saved in `scripts/curated/coord-fixes.json`; entries marked `fixedPos` are never changed.
- **Look:** the terminal-cyan style from the STUDY//TERM widgets.
- **Offline mode (desktop app), hard 5 GB cap:**
  - **Pack** (OFFLINE tab → DOWNLOAD PACK, about 2.7 GB, resumable): the data, Wikipedia text plus one photo per entry, all 55 history-border maps, deep-time coastlines (12 ages × 4 models), NASA Blue Marble and GEBCO relief down to zoom 8.
  - **Browsing cache:** whatever you view from open sources (NASA, GEBCO, EMODnet, Wikipedia/Wikimedia, history and paleo maps) is saved to disk automatically. Esri and OSM tiles are not stored, because their terms don't allow it.
  - **Download this area:** GEBCO zoom 9–11 plus EMODnet zoom 9–12 for the current view.
  - **Cap:** pack + cache never exceed 5 GB. The least-recently-used cache files are evicted first (area downloads after normal browsing); the pack is never evicted.
  - **Offline:** if the connection drops, the globe switches to Blue Marble.
  - Implementation: `electron/offline.cjs` (storage in `~/Library/Application Support/KJX/offline`).

## Run it

You need **Node.js 22.12 or newer** (the current LTS from [nodejs.org](https://nodejs.org) is fine; Node 26 works too) on a Mac.

```bash
git clone https://github.com/SlicingReaper/KJX.git
cd KJX
npm install
npm run app        # opens the desktop app (on macOS as a renamed "KJX" dev copy, so the Dock says KJX, not Electron)
```

Other commands:

```bash
npm run dev        # browser version at http://localhost:5199
npm run package    # builds dist-app/mac-<arch>/KJX.app; drag it into /Applications
```

**If `npm run app` says "Electron failed to install correctly":** this happens with older copies of this repo on Node 26, whose npm skips install scripts unless they're approved. Update and reinstall:

```bash
git pull && rm -rf node_modules && npm install && npm run app
```

The repo now lists the approved scripts in `package.json` → `allowScripts` (electron, esbuild, fsevents), and `npm run app` checks your Node version and fetches Electron's app files if they're missing.

## Update the data

```bash
npm run data          # re-pulls every source (Wikidata, NOAA, OSM), verifies positions, merges
npm run data:wikidata # just Wikidata (~10 min)
npm run data:noaa     # just NOAA charted wrecks (~1 min)
npm run data:osm      # just OpenStreetMap (slow; public Overpass servers are often busy, so it retries)
npm run data:verify   # cross-check curated positions against Wikipedia
npm run data:build    # only re-merge (after editing scripts/curated/*.mjs)
```

Curated entries live in `scripts/curated/`, one file per theme (treasure ships, famous wrecks, aircraft, lost treasure, myths). To add one, copy an existing entry, change the fields, and run `npm run data:build`.

## Notes

- You need an internet connection: map tiles, historical borders, paleo coastlines and Wikipedia pictures all load live.
- Locations are best public estimates. Some, like the San José, are state secrets. Wikidata entries are only as accurate as Wikidata.
- Built with CesiumJS, Vite and Electron. Data and maps come from Wikidata, Wikipedia, Esri, NASA GIBS, GEBCO, EMODnet, OpenStreetMap, OpenTopoMap, [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0) and the GPlates Web Service.

## Licence

All rights reserved. See [LICENSE](LICENSE). The code is public to view, but not to copy or reuse without permission.
