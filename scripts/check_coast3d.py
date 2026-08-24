#!/usr/bin/env python3
"""Locked 3D placement: five pins, twelve planes, no gallery extras, no raw Block_140."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FIRST12 = [
    ("nara_lighthouse_1928_18-AA-89-27.jpg", "lighthouse", "aerial"),
    ("dvids_1968_eroded_cliffs.jpg", "lighthouse", "aerial"),
    ("dvids_2023_aerial_revetment.jpg", "lighthouse", "aerial"),
    ("commons_ditch_plains_1883_association-cobble-bluff.jpg", "ditch_plains", "ground"),
    ("loc_ditch_plains_1955_beach-width-bluffs.jpg", "ditch_plains", "ground"),
    ("usgs_2012_ditch.jpg", "ditch_plains", "aerial"),
    ("usgs_ds858_2012_1105_134804d.jpg", "ocean_beaches", "aerial"),
    ("commons_ocean_beaches_2026_downtown-aerial.jpg", "ocean_beaches", "aerial"),
    ("commons_soundview_2006_culloden-point-bluff.jpg", "soundview", "ground"),
    ("commons_soundview_2022_soundview-shore.jpg", "soundview", "ground"),
    ("commons_harbor_jetties_2017_south-jetty.jpg", "harbor_jetties", "ground"),
    ("commons_harbor_jetties_2021_lake-montauk-inlet.jpg", "harbor_jetties", "aerial"),
]

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


def main() -> int:
    sites = {s["id"]: s for s in json.loads((ROOT / "data" / "sites.json").read_text())["sites"]}
    cfg = json.loads((ROOT / "data" / "coast3d.json").read_text())
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

    planes = cfg["planes"]
    if len(planes) != 12:
        errors.append(f"expected 12 planes, got {len(planes)}")
    for spec, (fname, site_id, kind) in zip(planes, FIRST12):
        if spec["file"].split("/")[-1] != fname:
            errors.append(f"plane order {spec['file']} != {fname}")
        if spec["siteId"] != site_id:
            errors.append(f"{fname} site {spec['siteId']} != {site_id}")
        if spec.get("kind") != kind:
            errors.append(f"{fname} kind {spec.get('kind')} != {kind}")
        if not (ROOT / spec["file"]).is_file():
            errors.append(f"missing {spec['file']}")
        if "dvids_lighthouse_1968" in spec["file"]:
            errors.append("duplicate 1968 dvids used")

    names = [p["file"].split("/")[-1] for p in planes]
    for blocked in BLOCKED:
        if blocked in names:
            errors.append(f"blocked file planted: {blocked}")
    if any("ceha" in p["file"].lower() for p in planes):
        errors.append("CEHA sheet planted as a 3D plane")
    if any("moran" in p["file"].lower() for p in planes):
        errors.append("1909 Moran planted as a 3D plane")

    gps_planes = [p for p in planes if p.get("lat") is not None]
    if len(gps_planes) != 1 or gps_planes[0]["lat"] != 41.035025 or gps_planes[0]["lng"] != -71.9478:
        errors.append("only the 2026 downtown aerial may carry photo GPS")

    if any(pl["siteId"] == "soundview" and "usgs" in pl["file"] for pl in planes):
        errors.append("no USGS frames on Soundview")

    photo_index = {}
    for site in sites.values():
        for photo in site.get("photos") or []:
            src = (photo.get("src") or "").split("/")[-1]
            if src:
                photo_index[src] = photo
    for fname, _site_id, _kind in FIRST12:
        photo = photo_index.get(fname)
        if not photo:
            errors.append(f"{fname} missing from sites.json photos")
        elif photo.get("year") is None:
            errors.append(f"{fname} is year-null — must not be a 3D plane")

    ditch1883 = next(p for p in planes if p["file"].endswith("association-cobble-bluff.jpg"))
    if ditch1883.get("look") != 168 or ditch1883.get("tilt") != 0:
        errors.append("1883 Ditch must be vertical with normal toward the water (168)")
    frissell = next(p for p in planes if p["file"].endswith("beach-width-bluffs.jpg"))
    if frissell.get("look") != 112 or frissell.get("kind") != "ground":
        errors.append("1955 Frissell must be a ground plane along-shore ESE (112)")
    jetty2017 = next(p for p in planes if p["file"].endswith("south-jetty.jpg"))
    if jetty2017.get("look") != 8 or jetty2017.get("tilt") != 0:
        errors.append("2017 south-jetty looks NORTH (8) at the inlet")
    inlet2021 = next(p for p in planes if p["file"].endswith("lake-montauk-inlet.jpg"))
    if inlet2021.get("look") != 180 or inlet2021.get("kind") != "aerial" or inlet2021.get("altM", 0) < 40:
        errors.append("2021 inlet is an elevated card looking south from over the Sound")
    nara = next(p for p in planes if "nara_lighthouse_1928" in p["file"])
    if nara.get("kind") != "aerial" or not (320 <= nara.get("look", 0) <= 350) or nara.get("altM", 0) < 40:
        errors.append("1928 NARA is an elevated card from the ocean looking NNW")
    downtown2012 = next(p for p in planes if "134804d" in p["file"])
    if downtown2012.get("siteId") != "ocean_beaches" or downtown2012.get("kind") != "aerial":
        errors.append("2012 downtown must be 134804d at Kirk Park, aerial")

    if "LOCKED_PLANES" not in js:
        errors.append("js/coast3d.js must hard-allowlist LOCKED_PLANES")
    for fname, _site_id, _kind in FIRST12:
        if fname not in js:
            errors.append(f"JS allowlist missing {fname}")
    if re.search(r"if\s*\(\s*rec\.year\s*==\s*null\s*\)\s*return\s*true", js):
        errors.append("year-null cards must not stay visible")
    if "return false" not in js.split("function cardVisible")[1][:400]:
        errors.append("cardVisible must reject year-null")
    if "site.gallery" in js or "site.photos || []" in js and "LOCKED_PLANES.forEach" not in js:
        errors.append("3D must not iterate the site gallery to plant planes")
    if "LOCKED_PLANES.forEach" not in js:
        errors.append("collectCards must iterate LOCKED_PLANES, not cfg.planes")

    terrain_id = (cfg.get("terrain") or {}).get("primary", {}).get("id")
    if terrain_id != "mapterhorn":
        errors.append("Mapterhorn Terrarium must be the key-free interim primary terrain")

    print(f"pins 5 planes {len(planes)} allowlist {len(FIRST12)}")
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
