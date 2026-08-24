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
- USGS DS 858, 5 Nov 2012 (Ditch, Point, Camp Hero/Turtle Cove, Montauk Beach)
- Library of Congress, Carol M. Highsmith (lighthouse)

## GIS overlays

Toggleable on the map (south-shore USGS rates are **not** for Soundview / Block Island Sound):

- Town of East Hampton Coastal Erosion Overlay Zones — `data/eh_ceha_zones.geojson` (ArcGIS layer 8, WGS84, Montauk bbox).
- Town shoreline (simplified for the web) — `data/eh_shoreline.geojson` (layer 17).
- USGS OFR 2010-1119 long-term LRR transects, Montauk bbox only — `data/usgs_lt_montauk.geojson` from `LongIsland_LT.shp`.

## Sourced rates (agency + period)

- USGS OFR 2010-1119 LRR site boxes (computed from the official shapefile, not published USGS site averages): Point/Turtle Cove −0.20 m/yr (−0.67 ft/yr); Ditch Plains −0.08 m/yr (−0.25 ft/yr); Downtown south −0.04 m/yr (−0.14 ft/yr); Montauk south shore −0.11 m/yr (−0.35 ft/yr). South shore / Point only.
- CARP (GZA) 1983–2016 Downtown & Ditch: 0.5–2.5 ft/yr (different method).
- Shadmoor bluff 1962–2023: 0.94 ft/yr.
- Downtown FIMP 2024 as-built ~500,000 cy.
- Jetties 1926 (E 750 / W 981 ft); 2025 deepening ~110,000 cy onto the west / Soundview beach.

1996 at the lighthouse is a **deed to the Montauk Historical Society**. The tower was not moved.

## Screenshots

- `/workspace/montauk-erosion-explorer/screenshots/overview.png`
- `/workspace/montauk-erosion-explorer/screenshots/harbor-aerials.png`
