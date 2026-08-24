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

The **3D** tab is an added view (the Leaflet 2D map stays). No Mapbox, Cesium ion, or paid key. This is **not** a seamless historic globe: terrain is always 2014, and a year only changes the color/world we actually have.

- **Pins** (only these five, from `data/sites.json`): Soundview 41.0755, −71.948 (NORTH); harbor jetties 41.075, −71.9367 (NORTH / west jetty); downtown Kirk Park 41.0315, −71.946 (SOUTH — not Ditch, not Hither Hills); Ditch Plains 41.03948, −71.91701 (SOUTH/SSE); lighthouse 41.07099, −71.85709 (SOUTH/ESE Turtle Hill).
- **Mode A — peninsula ortho** from the same sources as the 2D map. NYSDOP: 2001, 2004, 2007, 2013, 2016, 2020, 2023 (`https://orthos.its.ny.gov/arcgis/rest/services/wms/{YEAR}/MapServer/tile/{z}/{y}/{x}`). Esri Wayback: 2014–2025 except 2018 (`releaseNum` is null — skipped, not invented). If both exist (2016, 2020, 2023) use NYSDOP. No Mode A tile for 1938 / 1976 / 1984 / 1996 / 2012. Current Esri World Imagery is off whenever a year is selected. Uncovered land is dim 2014 hillshade.
- **Mode B — local drapes** at the reaches they show, not a globe. 1938 USACE: Fort Pond, Lake Montauk, Montauk Beach, Montauk Point (no 1938 Ditch, no Soundview street grid). 1941 USACE: Fort Pond Bay, Lake Montauk, Montauk Park, Montauk Point, Hither Hills L20-5 (Hither Hills is **not** Kirk Park). 1962: USACE Camp Hero, Ditch 055/057, Fort Pond, Lake Montauk, Montauk Beach 051, Montauk Point + Suffolk `soundview_suffolk_1962_northshore.jpg` — a **patchwork of the five sites**, not a seamless 1962 peninsula. 1976 family aerials: harbor / Soundview inlet only. 1978 Suffolk northshore: Soundview / Culloden only. 1984 family + Suffolk northshore: harbor + north box only. 2012 USGS DS 858: south shore + Point obliques only — **no USGS on Soundview**; downtown is `usgs_ds858_2012_1105_134804d.jpg`, never `usgs_2012_beach.jpg`. 2014–2016 add USGS south/Point obliques on top of Mode A (2014 `usgs_ds958_2014_camp_hero.jpg` is not assigned to Turtle Cove south). USGS frames stay obliques, not nadir tiles.
- **Mode C — walk-into-the-photo** when there are too few views to reconstruct a peninsula. Camera sits in the still at the pin: 1883 MET Association at Ditch (till face, SOUTH/SSE), 1955 Frissell `loc_ditch_plains_1955_beach-width-bluffs.jpg` (same pin, along-shore ESE), plus 1928 NARA, 1968 cliffs (`dvids_1968_eroded_cliffs.jpg` only), 1900 LSS, 1871, 1919 lighthouse, 1937, 1997, 2006 ground stills, and the 2026 downtown aerial. 1909 Moran / Great Pond stays out.
- **Mode D — not a world.** 1996 is a deed (tower not moved) — no 1996 ortho. CEHA, Moran/Great Pond, 1919 Hither Hills, `usgs_2012_beach.jpg`, and the 459 extra hunt-machine frames are not hung. No invented rates.
- The original twelve locked stills appear **only in their own year**. The PR5 gallery dump is not planted.
- **Paths / looks:** Ditch 168, downtown 180, lighthouse 125, Soundview 0, harbor 8. Soundview + harbor face NORTH. Ditch, Kirk Park, lighthouse face SOUTH/ESE. Starting a path sets the year to a still along that coast if the current year has none. Downtown is west of Ditch; that hop is inland, not a continuous beach.
- **Terrain:** Mapterhorn Terrarium (key-free interim). Optional local fallback: 10 m Terrarium crop of 2014 NOAA NGS Post-Sandy Block_140 in `assets/terrain/2014-ngs`. The raw 121 MB GeoTIFF is not in this repo. The UI says relief is 2014 when the ortho is another year. Do not invent a historic DEM.
- Year-null cards are never shown. Tap a still for the existing lightbox / credit.
- Phone: the shared year scrub stays in the dock (event pills stay off). One-finger orbit, pinch/scroll zoom. Mobile header/drawers are unchanged.

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
