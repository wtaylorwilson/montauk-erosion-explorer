#!/usr/bin/env python3
"""Sanity-check 3D coast inputs: photo files exist, GPS parse stays in Montauk."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GPS_RE = re.compile(r"GPS\s+(-?\d+(?:\.\d+)?)\s*,\s*([−–-])?\s*(-?\d+(?:\.\d+)?)", re.I)


def parse_caption_gps(text: str | None):
    if not text:
        return None
    m = GPS_RE.search(text)
    if not m:
        return None
    lat = float(m.group(1))
    lng = float(m.group(3))
    if m.group(2) and lng > 0:
        lng = -lng
    if not (40.95 <= lat <= 41.2 and -72.15 <= lng <= -71.75):
        return None
    return lat, lng


def main() -> int:
    sites = json.loads((ROOT / "data" / "sites.json").read_text())["sites"]
    cfg = json.loads((ROOT / "data" / "coast3d.json").read_text())
    missing = []
    placed = 0
    gps_n = 0
    for site in sites:
        assert site.get("lat") and site.get("lng"), site["id"]
        for photo in site.get("photos") or []:
            src = photo.get("src")
            if not src:
                continue
            placed += 1
            path = ROOT / src
            if not path.is_file():
                missing.append(src)
            if parse_caption_gps(photo.get("caption")):
                gps_n += 1
    stops = []
    for path in cfg["paths"]:
        stops.extend(path["stops"])
    ids = {s["id"] for s in sites}
    unknown = [s for s in stops if s not in ids]
    print(f"sites {len(sites)} photos_with_src {placed} caption_gps {gps_n}")
    print(f"path_stops {stops}")
    if missing:
        print("MISSING", *missing, sep="\n")
        return 1
    if unknown:
        print("UNKNOWN_STOPS", unknown)
        return 1
    sample = parse_caption_gps("Downtown strand. GPS 41.035025, −71.9478.")
    assert sample == (41.035025, -71.9478), sample
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
