# Montauk Erosion Explorer

Self-contained map of five Montauk shoreline sites. Site copy comes from `research/sites.json`. Historical tiles are verified NYSDOP and Esri Wayback layers. Family aerials (1976 / 1984) sit on the harbor and Soundview galleries.

## Open

```bash
cd /workspace/montauk-erosion-explorer
python3 serve.py
```

Then open **http://127.0.0.1:8080/**

Or: `python3 -m http.server 8080` (local `data/` only; `/research` alias needs `serve.py`).

Entry file: `/workspace/montauk-erosion-explorer/index.html`

Deep links:

- `http://127.0.0.1:8080/#site=lighthouse&year=1996`
- `http://127.0.0.1:8080/#site=harbor_jetties&aerials=1`
- `http://127.0.0.1:8080/#site=ditch_plains&year=2013`
- `http://127.0.0.1:8080/#view=3d`
- `http://127.0.0.1:8080/#view=3d&site=lighthouse&year=2016`

## 3D coast

The **3D** tab is an added view (the Leaflet 2D map stays). No Mapbox, Cesium ion, or paid key.

- **Pins** (only these five, from `data/sites.json`): Soundview 41.0755, −71.948 (NORTH); harbor jetties 41.075, −71.9367 (NORTH / west jetty); downtown Kirk Park 41.0315, −71.946 (SOUTH — not Ditch); Ditch Plains 41.03948, −71.91701 (SOUTH/SSE); lighthouse 41.07099, −71.85709 (SOUTH/ESE Turtle Hill).
- **First twelve planes** are listed in `data/coast3d.json` and do not all hang as beach billboards. Ground: 1883 Ditch (inland at the till face), 1955 Frissell (along-shore ESE), 2006 Culloden (along-shore), 2022 Soundview (blue-roof + riprap, NORTH), 2017 south-jetty (looks NORTH at the inlet). Elevated cards: 1928 NARA (from the ocean looking NNW), 1968 cliffs (`dvids_1968_eroded_cliffs.jpg` only), 2023 revetment, 2012 Ditch `usgs_2012_ditch.jpg`, 2012 downtown `usgs_ds858_2012_1105_134804d.jpg` (motels / Fort Pond / Atlantic at the bottom — not `usgs_2012_beach.jpg`), 2026 downtown at caption GPS 41.035025, −71.9478, 2021 inlet (from over the Sound looking south). Other verticals and CEHA stay in the lightbox galleries.
- **Paths:** Soundview → west jetty, camera looks NORTH. Ditch → downtown Kirk Park → lighthouse, camera looks SOUTH/ESE. Downtown is west of Ditch; that hop is inland, not a continuous beach.
- **Terrain:** 10 m Terrarium crop of 2014 NOAA NGS Post-Sandy Block_140 (Digital Coast 4967) in `assets/terrain/2014-ngs`. The raw 121 MB GeoTIFF is not in this repo (`scripts/build_montauk_terrain.py` downloads it to `/tmp`). Fallback: Mapterhorn. Single-year surface — not a lidar-change map. 2020/2022 tiles are south-shore slivers and were not used.
- Year slider shows those twelve planes dated that year or earlier. Tap a plane for the existing lightbox / credit.
- 1996 at the lighthouse is a deed, not a move. Kirk Park is not snapped to Ditch or Hither Hills.
- Phone: one-finger orbit, pinch/scroll zoom, tap a plane. Mobile header/drawers are unchanged.

## Tiles that work over Montauk

**NYSDOP Suffolk** (HTTP tiles verified; HTTPS pattern is the documented one):

`http://orthos.its.ny.gov/arcgis/rest/services/wms/{YEAR}/MapServer/tile/{z}/{y}/{x}`

Years covering Montauk: **2001, 2004, 2007, 2013, 2016, 2020, 2023**.

**Esri World Imagery Wayback** (release list from Living Atlas `waybackconfig` / `esri_wayback_releases.json`):

`https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{releaseNum}/{z}/{y}/{x}`

One snapshot per year 2014–2025 is wired (latest release that year).

No tile for 1938 / 1976 / 1984 / 1996 / 2012 — those years highlight photos or events.

## Photos in the app

- Family collection, BJ Old Montauk aerials — 24 MAR 76 (two stitches) and Apr 1984 (harbor / Soundview)
- USACE 1938 verticals (Lake Montauk, Montauk Beach, Montauk Point)
- USGS DS 858 / 958 / 995 / 1030 obliques (2012, 2014, 2015, 2016) — south shore and Point only
- USACE 1938 and 1941 Beach Erosion Board verticals
- Library of Congress, DVIDS, Wikimedia Commons historic stills
- NYSDEC CEHA legal sheets (East Hampton 11–29 of 59). Pinned: sheet 13 ocean_beaches, 14 Ditch Plains, 22-N Soundview. Harbor and lighthouse points are not inside a sheet polygon.
- 27east / East Hampton Star dated events are link-only; news photos were not downloaded

## GIS overlays

Toggleable on the map (south-shore USGS rates are **not** for Soundview / Block Island Sound):

- Town of East Hampton Coastal Erosion Overlay Zones — `data/eh_ceha_zones.geojson` (ArcGIS layer 8, WGS84, Montauk bbox).
- Town shoreline (simplified for the web) — `data/eh_shoreline.geojson` (layer 17).
- USGS OFR 2010-1119 long-term LRR transects, Montauk bbox only — `data/usgs_lt_montauk.geojson` from `LongIsland_LT.shp`.

## Sourced rates (agency + period)

- USGS OFR 2010-1119 LRR site boxes (computed from the official shapefile, not published USGS site averages): Point/Turtle Cove −0.20 m/yr (−0.67 ft/yr); Ditch Plains −0.08 m/yr (−0.25 ft/yr); Downtown south −0.04 m/yr (−0.14 ft/yr); Montauk south shore −0.11 m/yr (−0.35 ft/yr). South shore / Point only.
- CARP (GZA) 1983–2016 Downtown & Ditch: 0.5–2.5 ft/yr (different method).
- Shadmoor bluff 1962–2023: 0.94 ft/yr.
- Downtown FIMP Feb 2024: 450,000 cy / 6,000 ft / 20 days (27east); later town/press totals 462–500k cy.
- Town 2024 Ditch dune: 2020 remnant 1,925 cy above MSL → Feb 2024 544 cy; rebuilt max 20,000 cy, crest +16 ft NAVD.
- Town CARP 2022 north shore (not USGS 2010-1119): Soundview 1–5 ft/yr (1983–2016); Culloden 1–2.5 ft/yr.
- Jetties 1926 (E 750 / W 981 ft); 2025 emergency 10,500 cy west of west jetty; ~150,000 cy toward Mermaid Beach; nearly 90,000 cy reported gone by Jan 2026.

1996 at the lighthouse is a **deed to the Montauk Historical Society**. The tower was not moved.

## Screenshots

- `/workspace/montauk-erosion-explorer/screenshots/overview.png`
- `/workspace/montauk-erosion-explorer/screenshots/harbor-aerials.png`

The 3D view is the `3D` tab on the live site (`#view=3d`).
