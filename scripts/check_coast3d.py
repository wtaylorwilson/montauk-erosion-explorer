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
    ("usgs_2012_beach.jpg", "ocean_beaches"),
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

    if any(p["siteId"] == "soundview" and p.get("kind") == "usgs-oblique" for p in planes):
        errors.append("no USGS oblique on Soundview")

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
