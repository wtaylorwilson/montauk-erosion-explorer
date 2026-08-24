#!/usr/bin/env python3
"""Build compact year-coast polylines for the 3D carved-mesh layer.

Does not invent a historic DEM. Inland relief stays 2014. Each year stores
the USGS (or modeled) south/Point HWL and the matching 2000 HWL sample along
the official OFR 2010-1119 LongIsland_LT transects. 2000 is the 2014
waterline proxy — there is no 2014 HWL survey.

North-shore vertices are copied only for 1933 and 2000. No Soundview /
harbor loop is interpolated.

Output is small JSON (shared transect ids + packed lng/lat), not a second DEM.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

ANCHORS = [1830, 1870, 1892, 1933, 1938, 1962, 1979, 1983, 1988, 2000]
DECADE_YEARS = [1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021]
NORTH_YEARS = {1933, 2000}
REF_YEAR = 2000


def r6(v: float) -> float:
    return round(float(v), 6)


def hypot_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371000.0
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    s = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(s), math.sqrt(1 - s))


def seg_intersect(a1, a2, b1, b2):
    x1, y1 = a1
    x2, y2 = a2
    x3, y3 = b1
    x4, y4 = b2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-18:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
    if t < -1e-9 or t > 1 + 1e-9 or u < -1e-9 or u > 1 + 1e-9:
        return None
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def inland_amt(pt, tr) -> float:
    ax, ay = tr["a"]
    bx, by = tr["b"]
    return (pt[0] - ax) * (bx - ax) + (pt[1] - ay) * (by - ay)


def load_transects() -> list[dict]:
    doc = json.loads((DATA / "usgs_lt_montauk.geojson").read_text())
    rows = []
    for feat in doc["features"]:
        coords = feat["geometry"]["coordinates"]
        if len(coords) < 2:
            continue
        p = feat.get("properties") or {}
        rows.append({
            "id": p.get("TRANSECTID") or p.get("OBJECTID"),
            "order": p.get("TRANSORDER") or p.get("OBJECTID") or 0,
            "a": (float(coords[0][0]), float(coords[0][1])),
            "b": (float(coords[-1][0]), float(coords[-1][1])),
        })
    rows.sort(key=lambda t: t["order"])
    return rows


def load_hwl_lines() -> tuple[dict[int, list[list[tuple[float, float]]]], dict[int, list[list[tuple[float, float]]]]]:
    doc = json.loads((DATA / "usgs_hwl_worlds.geojson").read_text())
    south: dict[int, list[list[tuple[float, float]]]] = {}
    north: dict[int, list[list[tuple[float, float]]]] = {}
    status = {}
    for feat in doc["features"]:
        p = feat.get("properties") or {}
        if p.get("kind") != "hwl":
            continue
        year = int(p["year"])
        status[year] = p.get("status") or ("surveyed" if year in ANCHORS else "modeled")
        coords = feat["geometry"]["coordinates"]
        line = [tuple(c[:2]) for c in coords]
        if p.get("reach") == "north":
            north.setdefault(year, []).append(line)
        else:
            south.setdefault(year, []).append(line)
    return south, north, status


def line_hits(lines: list[list[tuple[float, float]]], transects: list[dict]) -> dict[int, tuple[float, float]]:
    hits = {}
    for tr in transects:
        found = None
        for coords in lines:
            for i in range(len(coords) - 1):
                pt = seg_intersect(tr["a"], tr["b"], coords[i], coords[i + 1])
                if pt:
                    found = pt
                    break
            if found:
                break
        if found:
            hits[tr["id"]] = found
    return hits


def pack_xy(pts: list[tuple[float, float]]) -> list[float]:
    out = []
    for x, y in pts:
        out.append(r6(x))
        out.append(r6(y))
    return out


def main() -> int:
    transects = load_transects()
    south, north, status = load_hwl_lines()
    years = sorted(set(ANCHORS) | set(DECADE_YEARS) | set(south))
    hits = {y: line_hits(south[y], transects) for y in years if y in south}
    if REF_YEAR not in hits:
        raise SystemExit("missing 2000 south HWL — cannot build 2014 waterline proxy")
    ref = hits[REF_YEAR]
    canonical = [tr for tr in transects if tr["id"] in ref]
    if len(canonical) < 80:
        raise SystemExit(f"too few 2000 transect hits: {len(canonical)}")

    year_out = {}
    for y in years:
        yh = hits.get(y) or {}
        hwl_pts = []
        ref_pts = []
        sea_w = []
        for tr in canonical:
            r = ref[tr["id"]]
            h = yh.get(tr["id"], r)
            hwl_pts.append(h)
            ref_pts.append(r)
            # + seaward of 2000 (historic beach to build); − landward (cut)
            sign = 1.0 if inland_amt(h, tr) < inland_amt(r, tr) else -1.0
            sea_w.append(round(hypot_m(h, r) * sign, 1))
        st = status.get(y)
        if y > 2000:
            st = "held"
        elif y in ANCHORS:
            st = "surveyed"
        elif st not in ("surveyed", "modeled", "held"):
            st = "modeled"
        year_out[str(y)] = {
            "status": st,
            "hwl": pack_xy(hwl_pts),
            "ref": pack_xy(ref_pts),
            "w": sea_w,
        }

    north_out = {}
    for y in sorted(NORTH_YEARS):
        lines = north.get(y) or []
        packed = [pack_xy(line) for line in lines if len(line) >= 2]
        if packed:
            north_out[str(y)] = packed

    # Sanity: Ditch (lng -71.925 to -71.910) 1871 terrace must beat 2000.
    def ditch_mean(year: int) -> float:
        row = year_out[str(year)]
        xs = row["ref"][0::2]
        ws = row["w"]
        vals = [w for x, w in zip(xs, ws) if -71.925 <= x <= -71.910]
        return sum(vals) / len(vals) if vals else 0.0

    d1871 = ditch_mean(1871)
    d2000 = ditch_mean(2000)
    d1962 = ditch_mean(1962)
    if d1871 < 15:
        raise SystemExit(f"1871 Ditch terrace too thin ({d1871:.1f} m) — refuse to ship a paint-on-globe")
    if abs(d2000) > 2:
        raise SystemExit(f"2000 Ditch should be the waterline proxy, got {d2000:.1f} m")

    doc = {
        "version": 1,
        "name": "coast_meshes",
        "refYear": REF_YEAR,
        "demYear": 2014,
        "exaggeration": 2.6,
        "sandZ": [1.2, 2.0],
        "tillZ": [4.0, 12.0],
        "modernBeachM": 12.0,
        "ids": [tr["id"] for tr in canonical],
        "sea": pack_xy([tr["a"] for tr in canonical]),
        "land": pack_xy([tr["b"] for tr in canonical]),
        "years": year_out,
        "north": north_out,
        "properties": {
            "source": "USGS OFR 2010-1119 Himmelstoss et al. 2010",
            "credit": "South/Point carved coasts from sourced HWL vs the 2000 USGS HWL (2014 waterline proxy). Inland relief is 2014 NOAA NGS / Mapterhorn — visual only, not a change surface. Not a surveyed historic DEM.",
            "anchors": ANCHORS,
            "decadeYears": DECADE_YEARS,
            "northYears": sorted(NORTH_YEARS),
            "note": "North HWL only in 1933 and 2000. No Soundview/harbor invented waterline. No peninsula loop. 2001–2021 held at 2000.",
            "ditchWidthM": {"1871": round(d1871, 1), "1962": round(d1962, 1), "2000": round(d2000, 1)},
        },
    }
    path = DATA / "coast_meshes.json"
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(
        "wrote", path, "bytes", path.stat().st_size,
        "transects", len(canonical), "years", len(year_out),
        "ditch1871", round(d1871, 1), "ditch1962", round(d1962, 1), "ditch2000", round(d2000, 1),
        "north", sorted(north_out),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
