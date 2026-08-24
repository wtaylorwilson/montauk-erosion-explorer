#!/usr/bin/env python3
"""Year-worlds 3D: Mode A/B/C/D, no current Esri globe, no gallery dump."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LOCKED12 = [
    ("nara_lighthouse_1928_18-AA-89-27.jpg", "lighthouse", "aerial"),
    ("dvids_1968_eroded_cliffs.jpg", "lighthouse", "aerial"),
    ("dvids_2023_aerial_revetment.jpg", "lighthouse", "aerial"),
    ("commons_ditch_plains_1883_association-cobble-bluff.jpg", "ditch_plains", "ground"),
    ("loc_ditch_plains_1955_beach-width-bluffs.jpg", "ditch_plains", "ground"),
    ("usgs_2012_ditch.jpg", "ditch_plains", "oblique"),
    ("usgs_ds858_2012_1105_134804d.jpg", "ocean_beaches", "oblique"),
    ("commons_ocean_beaches_2026_downtown-aerial.jpg", "ocean_beaches", "aerial"),
    ("commons_soundview_2006_culloden-point-bluff.jpg", "soundview", "ground"),
    ("commons_soundview_2022_soundview-shore.jpg", "soundview", "ground"),
    ("commons_harbor_jetties_2017_south-jetty.jpg", "harbor_jetties", "ground"),
    ("commons_harbor_jetties_2021_lake-montauk-inlet.jpg", "harbor_jetties", "aerial"),
]

MUST_WORLDS = [
    "usace_1938_fort_pond.jpg",
    "usace_1938_lake_montauk.jpg",
    "usace_1938_montauk_beach.jpg",
    "usace_1938_montauk_point.jpg",
    "usace_1941_fort_pond_bay.jpg",
    "usace_1941_lake_montauk.jpg",
    "usace_1941_montauk_park.jpg",
    "usace_1941_montauk_pt.jpg",
    "usace_1962_camp_hero.jpg",
    "usace_1962_ditch_plains_055.jpg",
    "usace_1962_ditch_plains_057.jpg",
    "usace_1962_fort_pond.jpg",
    "usace_1962_lake_montauk.jpg",
    "usace_1962_montauk_beach_051.jpg",
    "usace_1962_montauk_point.jpg",
    "soundview_suffolk_1962_northshore.jpg",
    "1976-harbor-wide.jpg",
    "1976-harbor-jetties.jpg",
    "soundview_suffolk_1978_northshore.jpg",
    "1984-harbor.jpg",
    "soundview_suffolk_1984_northshore.jpg",
    "usgs_2012_point.jpg",
    "usgs_ds958_2014_ditch_plains.jpg",
    "usgs_ds958_2014_lighthouse.jpg",
    "usgs_ds1030_2016_ditch_plains.jpg",
    "loc_1871_montauk_light.jpg",
    "loc_1900_ditch_plain_lss.jpg",
]

DUMP = {
    "commons_ditch_plains_1883_association-beach-bluffs.jpg",
    "commons_ditch_plains_1883_association-rocky-cliffs.jpg",
    "loc_1955_frissell_ditch_plains.jpg",
    "usace_1962_montauk_beach.jpg",
    "usgs_2012_beach.jpg",
    "usgs_ds858_2012_1105_134026d.jpg",
    "usgs_ds958_2014_camp_hero.jpg",
    "usgs_ds995_2015_1008_171456d.jpg",
    "dvids_lighthouse_1968_eroded_cliffs.jpg",
    "library_1909_great_pond_moran.jpg",
    "commons_1909_great_pond.jpg",
    "loc_ocean_beaches_1919_hither_hills.jpg",
    "usace_1941_hither_hills_l20_5.jpg",
    "usace_2024_03_08_downtown_240308-D-A1420-001.jpg",
    "usace_2024_03_08_downtown_240308-D-A1420-002.jpg",
    "ditch_plains_2024_drone_project_area_oct7.jpg",
}

PINS = {
    "soundview": (41.0755, -71.948),
    "harbor_jetties": (41.075, -71.9367),
    "ocean_beaches": (41.0315, -71.946),
    "ditch_plains": (41.03948, -71.91701),
    "lighthouse": (41.07099, -71.85709),
}

LOOKS = {
    "ditch_plains": 168,
    "ocean_beaches": 180,
    "lighthouse": 125,
    "soundview": 0,
    "harbor_jetties": 8,
}

BLOCKED = {
    "usgs_2012_beach.jpg",
    "loc_ocean_beaches_1919_hither_hills.jpg",
    "dvids_lighthouse_1968_eroded_cliffs.jpg",
    "library_1909_great_pond_moran.jpg",
    "commons_1909_great_pond.jpg",
}


def parse_worlds(js: str) -> list[dict]:
    block = js.split("var YEAR_WORLDS = [", 1)[1].split("\n  ];", 1)[0]
    rows = []
    for m in re.finditer(r"\{([^{}]+)\}", block):
        body = m.group(1)
        row = {}
        for key in ("file", "siteId", "kind", "mode"):
            km = re.search(rf'{key}:\s*"([^"]+)"', body)
            if km:
                row[key] = km.group(1)
        for key in ("look", "altM", "tilt", "lat", "lng"):
            km = re.search(rf"{key}:\s*(-?[0-9.]+)", body)
            if km:
                row[key] = float(km.group(1))
        if row.get("file"):
            rows.append(row)
    return rows


def main() -> int:
    sites = {s["id"]: s for s in json.loads((ROOT / "data" / "sites.json").read_text())["sites"]}
    cfg = json.loads((ROOT / "data" / "coast3d.json").read_text())
    img = json.loads((ROOT / "data" / "imagery.json").read_text())
    js = (ROOT / "js" / "coast3d.js").read_text()
    errors = []

    if (ROOT / "Block_140.tif").exists() or (ROOT / "assets" / "Block_140.tif").exists():
        errors.append("raw Block_140.tif must not be in the repo")

    for sid, (lat, lng) in PINS.items():
        pin = cfg["pins"][sid]
        site = sites[sid]
        if (pin["lat"], pin["lng"]) != (lat, lng):
            errors.append(f"pin mismatch {sid}")
        if (site["lat"], site["lng"]) != (lat, lng):
            errors.append(f"sites.json moved {sid}")
        if pin.get("look") != LOOKS[sid]:
            errors.append(f"pin look {sid} {pin.get('look')} != {LOOKS[sid]}")
        if cfg["look"][sid]["bearing"] != LOOKS[sid]:
            errors.append(f"camera look {sid} {cfg['look'][sid]['bearing']} != {LOOKS[sid]}")

    if "server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" in js:
        errors.append("3D must not load current Esri World Imagery")
    if cfg.get("imagery") and "World_Imagery/MapServer" in json.dumps(cfg.get("imagery")):
        errors.append("coast3d.json must not default to current Esri World Imagery")
    if "rec.year === year" not in js and "rec.year == year" not in js:
        errors.append("stills must show only in their own year")
    if "return rec.year <= year" in js:
        errors.append("must not accumulate stills from earlier years")
    if "YEAR_WORLDS.forEach" not in js:
        errors.append("collectCards must iterate YEAR_WORLDS, not the site gallery")
    if "site.photos || []" in js and "YEAR_WORLDS.forEach" not in js:
        errors.append("3D must not iterate the site gallery to plant planes")

    if "2018" not in js or "NO_MODE_A" not in js:
        errors.append("2018 Wayback (null releaseNum) must be skipped")
    if re.search(r"releaseNum:\s*\d+.*2018|2018.*releaseNum:\s*\d+", js):
        errors.append("do not invent a 2018 Wayback releaseNum")

    nys = {n["year"] for n in img.get("nys") or []}
    for y in (2001, 2004, 2007, 2013, 2016, 2020, 2023):
        if y not in nys:
            errors.append(f"imagery.json missing NYSDOP {y}")
        if f"wms/{y}/MapServer" not in js and "NYS_TMPL" not in js:
            errors.append("NYSDOP URL pattern missing from 3D")
    if "orthos.its.ny.gov/arcgis/rest/services/wms/{YEAR}/MapServer/tile/{z}/{y}/{x}" not in js:
        errors.append("3D NYSDOP tiles must reuse the 2D HTTPS pattern")

    worlds = parse_worlds(js)
    names = [w["file"] for w in worlds]
    if len(worlds) < 40:
        errors.append(f"expected year-world allowlist, got {len(worlds)}")

    for fname, site_id, kind in LOCKED12:
        if fname not in names:
            errors.append(f"locked-12 missing from YEAR_WORLDS: {fname}")
        row = next((w for w in worlds if w["file"] == fname), None)
        if row and row.get("siteId") != site_id:
            errors.append(f"{fname} site {row.get('siteId')} != {site_id}")
        if fname not in js:
            errors.append(f"JS missing {fname}")

    for fname in MUST_WORLDS:
        if fname not in names:
            errors.append(f"required year-world missing: {fname}")

    for dump in DUMP | BLOCKED:
        if dump in names:
            errors.append(f"blocked/dump planted: {dump}")

    if any("ceha" in n.lower() for n in names):
        errors.append("CEHA sheet planted as a 3D plane")
    if any("moran" in n.lower() or "great_pond" in n.lower() for n in names):
        errors.append("1909 Moran / Great Pond planted")
    if any(n.startswith("usgs") and w.get("siteId") == "soundview" for w, n in ((w, w["file"]) for w in worlds)):
        errors.append("no USGS frames on Soundview")

    ditch1938 = [w for w in worlds if w["file"].startswith("usace_1938") and w.get("siteId") == "ditch_plains"]
    if ditch1938:
        errors.append("no 1938 Ditch frame")

    if any(w.get("siteId") == "hither_hills" for w in worlds):
        errors.append("hither_hills is not a sixth explorer pin")
    if re.search(r"hither_hills:\s*180", js):
        errors.append("js/coast3d.js must not have a hither_hills look entry")
    if "41.021" in js or "-71.992" in js:
        errors.append("do not invent Hither Hills coords 41.021, -71.992")
    mode_b_gps = [w for w in worlds if w.get("mode") == "B" and ("lat" in w or "lng" in w)]
    if mode_b_gps:
        errors.append("Mode B frames must not carry guessed lat/lng: " + ", ".join(w["file"] for w in mode_b_gps))
    gps_any = [w for w in worlds if "lat" in w or "lng" in w]
    if any(w["file"] != "commons_ocean_beaches_2026_downtown-aerial.jpg" for w in gps_any):
        errors.append("only the 2026 downtown caption GPS may appear on a year-world")
    ditch1962 = [w for w in worlds if w["file"] in ("usace_1962_ditch_plains_055.jpg", "usace_1962_ditch_plains_057.jpg")]
    if len(ditch1962) != 2:
        errors.append("1962 Ditch 055 and 057 must both drape at the Ditch pin")
    elif any(w.get("lat") is not None or w.get("lng") is not None for w in ditch1962):
        errors.append("1962 Ditch 055/057 must share the sites.json Ditch pin — do not split them")

    camp2014 = next((w for w in worlds if w["file"] == "usgs_ds958_2014_camp_hero.jpg"), None)
    if camp2014:
        errors.append("usgs_ds958_2014_camp_hero.jpg must not be assigned (may be north-of-point)")

    downtown2012 = next((w for w in worlds if "134804d" in w["file"]), None)
    if not downtown2012 or downtown2012.get("siteId") != "ocean_beaches":
        errors.append("2012 downtown must be 134804d at Kirk Park")

    ditch1883 = next(w for w in worlds if w["file"].endswith("association-cobble-bluff.jpg"))
    if ditch1883.get("look") != 168 or ditch1883.get("kind") != "ground" or ditch1883.get("mode") != "C":
        errors.append("1883 Ditch must be Mode C vertical toward the water (168)")
    frissell = next(w for w in worlds if w["file"].endswith("beach-width-bluffs.jpg"))
    if frissell.get("look") != 112 or frissell.get("kind") != "ground" or frissell.get("mode") != "C":
        errors.append("1955 Frissell must be Mode C ground along-shore ESE (112)")

    gps_worlds = [w for w in worlds if w.get("lat") == 41.035025]
    if len(gps_worlds) != 1 or gps_worlds[0]["lng"] != -71.9478:
        errors.append("only the 2026 downtown aerial may carry photo GPS 41.035025, -71.9478")

    photo_index = {}
    for site in sites.values():
        for photo in site.get("photos") or []:
            src = (photo.get("src") or "").split("/")[-1]
            if src:
                photo_index[src] = photo
    for w in worlds:
        fname = w["file"]
        photo = photo_index.get(fname)
        if not photo:
            errors.append(f"{fname} missing from sites.json photos")
        elif photo.get("year") is None:
            errors.append(f"{fname} is year-null — must not be a 3D plane")
        path = None
        for folder in (ROOT / "assets" / "photos" / fname, ROOT / "assets" / "aerials" / fname):
            if folder.is_file():
                path = folder
                break
        if path is None:
            errors.append(f"missing asset {fname}")

    if "LOCKED_PLANES" not in js:
        errors.append("js/coast3d.js must keep LOCKED_PLANES")
    if re.search(r"if\s*\(\s*rec\.year\s*==\s*null\s*\)\s*return\s*true", js):
        errors.append("year-null cards must not stay visible")
    if "function cardVisible" in js and "return false" not in js.split("function cardVisible")[1][:400]:
        errors.append("cardVisible must reject year-null")

    terrain_id = (cfg.get("terrain") or {}).get("primary", {}).get("id")
    if terrain_id != "mapterhorn":
        errors.append("Mapterhorn Terrarium must be the key-free interim primary terrain")
    if "2014" not in ((cfg.get("terrain") or {}).get("fallback") or {}).get("id", ""):
        errors.append("2014 NGS Block_140 must remain the local terrain fallback")
    if "RELIEF_NOTE" not in js or "Relief 2014" not in js:
        errors.append("UI must say relief is 2014")

    hwl_path = ROOT / "data" / "usgs_hwl_montauk.geojson"
    worlds_path = ROOT / "data" / "usgs_hwl_worlds.geojson"
    if not hwl_path.is_file():
        errors.append("missing data/usgs_hwl_montauk.geojson")
    if not worlds_path.is_file():
        errors.append("missing data/usgs_hwl_worlds.geojson")
    if hwl_path.is_file() and worlds_path.is_file():
        hwl = json.loads(hwl_path.read_text())
        worlds_gj = json.loads(worlds_path.read_text())
        want = [1830, 1870, 1892, 1933, 1938, 1962, 1979, 1983, 1988, 2000]
        got = sorted({f["properties"]["Year_"] for f in hwl["features"]})
        if got != want:
            errors.append(f"Montauk HWL years {got} != {want}")
        if any(f["properties"]["Year_"] in (1891, 1991) for f in hwl["features"]):
            errors.append("do not plant Long Island 1891/1991 as Montauk HWL surveys")
        north_years = sorted({f["properties"]["Year_"] for f in hwl["features"] if f["properties"].get("reach") == "north"})
        if north_years != [1933, 2000]:
            errors.append(f"north HWL years {north_years} != [1933, 2000]")
        modeled_north = [
            f for f in worlds_gj["features"]
            if f["properties"].get("reach") == "north" and f["properties"].get("status") != "surveyed"
        ]
        if modeled_north:
            errors.append("do not interpolate a north-shore / Soundview / harbor waterline")
        if "Himmelstoss" not in json.dumps(hwl.get("properties") or {}):
            errors.append("usgs_hwl_montauk.geojson must credit Himmelstoss et al. 2010")
        cfg_hwl = cfg.get("hwl") or {}
        if cfg_hwl.get("anchors") != want:
            errors.append("coast3d.json hwl.anchors must match the ten Montauk HWL years")
        if 2014 in (cfg_hwl.get("anchors") or []):
            errors.append("2014 is DEM, not a HWL anchor")

    if "Modeled from USGS high-water-line trend" not in js:
        errors.append("interpolated years must use the modeled-not-surveyed hint")
    if "USGS surveyed high-water line" not in js:
        errors.append("anchor years must be labeled as USGS surveyed HWL")
    if "Held at 2000 USGS HWL · not a survey" not in js:
        errors.append("2001–2021 must be labeled held at 2000, not a survey")
    if "HWL_DECADES" not in js or "HWL_ANCHORS" not in js:
        errors.append("3D slider must include sourced HWL anchors and decade worlds")
    if re.search(r"surveyed shoreline of 1891|USGS shoreline 1891|T-sheet 1891", js):
        errors.append("do not call 1891 a Montauk survey")
    if "function applyHwlLayers" in js or 'id: "hwl-water"' in js:
        errors.append("painted HWL fill/line layers must not be the 3D coast — use carved meshes")
    if "function applyCoastMeshes" not in js or "function buildCoastGroup" not in js:
        errors.append("3D must build a carved coast mesh (water / terrace / till)")
    apply_m = re.search(r"function applyCoastMeshes\(\) \{([\s\S]*?)\n  function ", js)
    apply_body = apply_m.group(1) if apply_m else ""
    if not re.search(r"if \(year === 1996\)", apply_body):
        errors.append("applyCoastMeshes must unconditionally no-op when year === 1996")
    if "hwlStatus" in apply_body:
        errors.append("1996 no-op must be unconditional — no nested hwlStatus check")
    if "hideCoastMeshes" not in apply_body and "clearCoastMeshes" not in apply_body:
        errors.append("1996 Mode D must hide/clear every coast mesh, not lerp a waterline")
    if "addSolidWaterPlanes" not in js or "pushBboxQuad" not in js or "pushQuadFlat" not in js:
        errors.append("water must be solid flat-shaded bbox planes, not a transect triangle strip")
    if "function skipSandMesh" not in js:
        errors.append("2000 / held years must skip all sand solids")
    if "function addBeachSolids" not in js or "function triangulateRing" not in js:
        errors.append("sand must be an extruded HWL-minus-2000 polygon, not a transect loft")
    if "function siteBeachSpan" not in js or "function beachRing" not in js:
        errors.append("each site solid is historic HWL minus the 2000/ref waterline, clipped near the pin")
    if "function sandRunsForSpec" in js or "function addSiteSandBoxes" in js or "SAND_BOX_SITES" in js:
        errors.append("delete the transect strip builder and the guessed site boxes")
    if "function pushRectPrism" in js or "function pushSandBox" in js:
        errors.append("do not loft HWL/ref pairs or invent a rectangular site box")
    if "function northRibbonMeshes" in js:
        errors.append("no north-shore / Soundview sand ribbon")
    beach_block = js.split("var BEACH_SITES = [", 1)[1].split("];", 1)[0] if "var BEACH_SITES = [" in js else ""
    if "soundview" in beach_block or "harbor_jetties" in beach_block:
        errors.append("no Soundview/harbor sand solid")
    if "mean >= 8" not in js:
        errors.append("skip a site solid when mean seaward width is under 8 m")
    if "w0 > 5 || w1 > 5" in js:
        errors.append("do not OR-gate terrace width — that tapers the east end into slivers")
    if re.search(r"toward\(h0,\s*s0,\s*920\)", js):
        errors.append("do not build hide/water as transect fans — those become shards")
    ditch_look = (cfg.get("look") or {}).get("ditch_plains") or {}
    if not (80 <= float(ditch_look.get("inlandM") or 0) <= 120):
        errors.append("Ditch camera must sit 80–120 m inland on the beach")
    if not (68 <= float(ditch_look.get("pitch") or 0) <= 72):
        errors.append("Ditch pitch must be ~68–72 so the terrace reads as a platform")
    if abs(float(ditch_look.get("bearing") or 0) - 168) > 2:
        errors.append("Ditch bearing must stay ~168 (looking south)")
    spec_m = re.search(r"function coastSpecForYear\(y\) \{([\s\S]*?)\n  function ", js)
    spec_body = spec_m.group(1) if spec_m else ""
    if not re.search(r"y === 1996", spec_body) or not re.search(r"return null", spec_body[:280]):
        errors.append("coastSpecForYear(1996) must return null, not a 1991–2000 lerp")
    for skip_y in (1883, 1955, 1968):
        if re.search(rf"\b{skip_y}\b", apply_body) or re.search(rf"\b{skip_y}\b", spec_body[:280]):
            errors.append(f"do not special-case {skip_y} — silent lerp is watch, not this fix")
    if "tillHeight" not in js:
        errors.append("carved coast must include a till face")
    if "zCut" not in js or "Hide 2014 land" not in js:
        errors.append("2014 relief seaward of the HWL must be hidden by a mesh, not left showing")
    if "is-era-cyano" not in js:
        errors.append("pre-ortho years need a period grade, not Esri World Imagery")
    if "server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" in js:
        errors.append("3D must not load current Esri World Imagery")

    mesh_path = ROOT / "data" / "coast_meshes.json"
    if not mesh_path.is_file():
        errors.append("missing data/coast_meshes.json")
    elif mesh_path.stat().st_size > 2_000_000:
        errors.append("coast_meshes.json is too large for GitHub Pages")
    else:
        meshes = json.loads(mesh_path.read_text())
        want_years = {1871, 1892, 1933, 1938, 1962, 1979, 2000, 2021}
        got_years = {int(y) for y in (meshes.get("years") or {})}
        missing = sorted(want_years - got_years)
        if missing:
            errors.append(f"coast_meshes.json missing years {missing}")
        sample = (meshes.get("years") or {}).get("1871") or {}
        if "zCut" not in sample:
            errors.append("coast_meshes.json must store 2014 zCut so seaward land can be hidden")
        north = sorted(int(y) for y in (meshes.get("north") or {}))
        if north != [1933, 2000]:
            errors.append(f"mesh north years {north} != [1933, 2000]")
        extra_north = [y for y in (meshes.get("north") or {}) if int(y) not in (1933, 2000)]
        if extra_north:
            errors.append("north mesh only in 1933 and 2000")
        ditch = ((meshes.get("properties") or {}).get("ditchWidthM") or {})
        if float(ditch.get("1871") or 0) < 15:
            errors.append("1871 Ditch terrace must be a wide seaward beach, not a painted line")
        w2000 = ditch.get("2000")
        if w2000 is None or abs(float(w2000)) > 2:
            errors.append("2000 Ditch terrace must be gone (2000 is the 2014 waterline proxy)")
        if (meshes.get("properties") or {}).get("northYears") != [1933, 2000]:
            errors.append("do not invent north-shore mesh years")
        if "Soundview" in json.dumps(meshes.get("north") or {}) and "harbor" in json.dumps(meshes).lower():
            errors.append("do not invent a Soundview harbor loop mesh")

    print(f"pins 5 worlds {len(worlds)} locked12 {len(LOCKED12)}")
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
