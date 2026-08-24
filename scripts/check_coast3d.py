#!/usr/bin/env python3
"""Locked 3D placement: five pins, twelve planes, no raw Block_140."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FIRST12 = [
    ("nara_lighthouse_1928_18-AA-89-27.jpg", "lighthouse"),
    ("dvids_1968_eroded_cliffs.jpg", "lighthouse"),
    ("dvids_2023_aerial_revetment.jpg", "lighthouse"),
    ("commons_ditch_plains_1883_association-cobble-bluff.jpg", "ditch_plains"),
    ("loc_ditch_plains_1955_beach-width-bluffs.jpg", "ditch_plains"),
    ("usgs_2012_ditch.jpg", "ditch_plains"),
    ("usgs_ds858_2012_1105_134804d.jpg", "ocean_beaches"),
    ("commons_ocean_beaches_2026_downtown-aerial.jpg", "ocean_beaches"),
    ("commons_soundview_2006_culloden-point-bluff.jpg", "soundview"),
    ("commons_soundview_2022_soundview-shore.jpg", "soundview"),
    ("commons_harbor_jetties_2017_south-jetty.jpg", "harbor_jetties"),
    ("commons_harbor_jetties_2021_lake-montauk-inlet.jpg", "harbor_jetties"),
]

PINS = {
    "soundview": (41.0755, -71.948),
    "harbor_jetties": (41.075, -71.9367),
    "ocean_beaches": (41.0315, -71.946),
    "ditch_plains": (41.03948, -71.91701),
    "lighthouse": (41.07099, -71.85709),
}


def main() -> int:
    sites = {s["id"]: s for s in json.loads((ROOT / "data" / "sites.json").read_text())["sites"]}
    cfg = json.loads((ROOT / "data" / "coast3d.json").read_text())
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

    planes = cfg["planes"]
    if len(planes) != 12:
        errors.append(f"expected 12 planes, got {len(planes)}")
    for spec, (fname, site_id) in zip(planes, FIRST12):
        if spec["file"].split("/")[-1] != fname:
            errors.append(f"plane order {spec['file']} != {fname}")
        if spec["siteId"] != site_id:
            errors.append(f"{fname} site {spec['siteId']} != {site_id}")
        if not (ROOT / spec["file"]).is_file():
            errors.append(f"missing {spec['file']}")
        if "dvids_lighthouse_1968" in spec["file"]:
            errors.append("duplicate 1968 dvids used")

    gps_planes = [p for p in planes if p.get("lat") is not None]
    if len(gps_planes) != 1 or gps_planes[0]["lat"] != 41.035025 or gps_planes[0]["lng"] != -71.9478:
        errors.append("only the 2026 downtown aerial may carry photo GPS")

    if any("usgs_2012_beach" in p["file"] for p in planes):
        errors.append("usgs_2012_beach.jpg is the till-bluff house reach — not Kirk Park")
    if any(pl["siteId"] == "soundview" and pl.get("kind") in ("usgs-oblique", "aerial") and "usgs" in pl["file"] for pl in planes):
        errors.append("no USGS oblique on Soundview")

    ground = {
        "commons_ditch_plains_1883_association-cobble-bluff.jpg",
        "loc_ditch_plains_1955_beach-width-bluffs.jpg",
        "commons_soundview_2006_culloden-point-bluff.jpg",
        "commons_soundview_2022_soundview-shore.jpg",
        "commons_harbor_jetties_2017_south-jetty.jpg",
    }
    aerial = {
        "nara_lighthouse_1928_18-AA-89-27.jpg",
        "dvids_1968_eroded_cliffs.jpg",
        "dvids_2023_aerial_revetment.jpg",
        "usgs_2012_ditch.jpg",
        "usgs_ds858_2012_1105_134804d.jpg",
        "commons_ocean_beaches_2026_downtown-aerial.jpg",
        "commons_harbor_jetties_2021_lake-montauk-inlet.jpg",
    }
    for p in planes:
        name = p["file"].split("/")[-1]
        if name in ground and p.get("kind") != "ground":
            errors.append(f"{name} must hang as ground")
        if name in aerial and p.get("kind") != "aerial":
            errors.append(f"{name} must hang as aerial")
    ditch1883 = next(p for p in planes if p["file"].endswith("association-cobble-bluff.jpg"))
    if ditch1883.get("look") != 0:
        errors.append("1883 Ditch must look inland (north) at the till face")
    jetty2017 = next(p for p in planes if p["file"].endswith("south-jetty.jpg"))
    if jetty2017.get("look") != 0:
        errors.append("2017 south-jetty looks NORTH at the inlet")
    inlet2021 = next(p for p in planes if p["file"].endswith("lake-montauk-inlet.jpg"))
    if inlet2021.get("look") != 180 or inlet2021.get("kind") != "aerial":
        errors.append("2021 inlet is an elevated card looking south from over the Sound")
    nara = next(p for p in planes if "nara_lighthouse_1928" in p["file"])
    if nara.get("kind") != "aerial" or not (320 <= nara.get("look", 0) <= 350):
        errors.append("1928 NARA is from the ocean looking NNW")

    tiles = list((ROOT / "assets" / "terrain" / "2014-ngs").rglob("*.png"))
    if len(tiles) < 20:
        errors.append(f"terrain tiles missing ({len(tiles)})")

    print(f"pins 5 planes {len(planes)} terrain_tiles {len(tiles)}")
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
