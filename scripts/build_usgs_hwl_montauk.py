#!/usr/bin/env python3
"""Clip USGS OFR 2010-1119 LongIsland_shorelines to Montauk and build
south/Point decade interpolations for the 3D tab.

Surveyed GeoJSON is only features whose geometry intersects the Montauk bbox.
1891 and 1991 exist elsewhere on Long Island and are never planted here.

North-shore HWL is copied only for 1933 (t5079) and 2000 (lidar stub at the
Point). Those two segments are never interpolated. Soundview / harbor get
no invented waterline.

Decade years on the south/Point reach are linear in time along official
OFR 2010-1119 LongIsland_LT transects. After 2000 the line is held and
labeled held — not a later survey.
"""
from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

import shapefile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC_URL = "https://pubs.usgs.gov/of/2010/1119/data/LongIsland_shorelines.zip"
TMP = Path("/tmp/usgs_hwl")
ZIP_PATH = TMP / "LongIsland_shorelines.zip"
SHP = TMP / "LongIsland_shorelines"

# User-confirmed Montauk bbox.
WEST, SOUTH, EAST, NORTH = -72.05, 41.00, -71.84, 41.10

ANCHORS = [1830, 1870, 1892, 1933, 1938, 1962, 1979, 1983, 1988, 2000]
DECADE_YEARS = [1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021]
NORTH_YEARS = {1933, 2000}

# North of the peninsula west of the Point tip — Soundview / harbor / north
# face east of the inlet. Point wrap (lng > -71.87) stays south_point.
NORTH_LAT = 41.068
POINT_LNG = -71.870


def r6(v: float) -> float:
    return round(float(v), 6)


def dest_download() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    if not (SHP.with_suffix(".shp")).exists():
        print("download", SRC_URL)
        urlretrieve(SRC_URL, ZIP_PATH)
        with zipfile.ZipFile(ZIP_PATH) as zf:
            zf.extractall(TMP)


def in_bbox(lng: float, lat: float) -> bool:
    return WEST <= lng <= EAST and SOUTH <= lat <= NORTH


def clip_ring(pts: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    """Keep in-bbox runs; include a bbox-edge hit when a segment crosses."""
    if len(pts) < 2:
        return []
    runs: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ain, bin_ = in_bbox(*a), in_bbox(*b)
        if ain:
            if not cur:
                cur.append(a)
            cur.append(b if bin_ else _edge_hit(a, b))
            if not bin_:
                if len(cur) >= 2:
                    runs.append(cur)
                cur = []
        elif bin_:
            cur = [_edge_hit(b, a), b]
        else:
            if cur and len(cur) >= 2:
                runs.append(cur)
            cur = []
    if cur and len(cur) >= 2:
        runs.append(cur)
    return runs


def _edge_hit(inside: tuple[float, float], outside: tuple[float, float]) -> tuple[float, float]:
    x1, y1 = inside
    x2, y2 = outside
    hits = []
    if x2 != x1:
        for xedge in (WEST, EAST):
            t = (xedge - x1) / (x2 - x1)
            if 0 <= t <= 1:
                y = y1 + t * (y2 - y1)
                if SOUTH <= y <= NORTH:
                    hits.append((t, (xedge, y)))
    if y2 != y1:
        for yedge in (SOUTH, NORTH):
            t = (yedge - y1) / (y2 - y1)
            if 0 <= t <= 1:
                x = x1 + t * (x2 - x1)
                if WEST <= x <= EAST:
                    hits.append((t, (x, yedge)))
    if not hits:
        return inside
    hits.sort()
    return hits[0][1]


def classify_pt(lng: float, lat: float) -> str:
    if lng > POINT_LNG:
        return "point"
    if lat >= NORTH_LAT:
        return "north"
    return "south"


def feature_reach(pts: list[tuple[float, float]]) -> str:
    n = sum(1 for p in pts if classify_pt(*p) == "north")
    if n >= max(3, int(0.6 * len(pts))):
        return "north"
    # 2000 lidar stub sits on the north face of the Point (lng > -71.87).
    if pts and min(p[1] for p in pts) >= 41.071 and max(p[0] for p in pts) > POINT_LNG:
        return "north"
    return "south_point"


def load_surveyed() -> list[dict]:
    reader = shapefile.Reader(str(SHP))
    out = []
    for rec, shp in zip(reader.iterRecords(), reader.iterShapes()):
        props = rec.as_dict()
        year = int(props["Year_"])
        raw = [(float(x), float(y)) for x, y in shp.points]
        if not any(in_bbox(x, y) for x, y in raw) and not (
            shp.bbox[2] >= WEST and shp.bbox[0] <= EAST and shp.bbox[3] >= SOUTH and shp.bbox[1] <= NORTH
        ):
            continue
        for run in clip_ring(raw):
            if len(run) < 2:
                continue
            reach = feature_reach(run)
            out.append({
                "year": year,
                "date": props.get("Date_") or "",
                "source": props.get("Source") or "",
                "uncy": props.get("Uncy"),
                "routeId": props.get("RouteID"),
                "defaultD": props.get("Default_D"),
                "reach": reach,
                "coords": [(r6(x), r6(y)) for x, y in run],
            })
    return out


def write_montauk(surveyed: list[dict]) -> None:
    years = sorted({f["year"] for f in surveyed})
    if years != ANCHORS:
        raise SystemExit(f"Montauk HWL years {years} != {ANCHORS}")
    north_years = sorted({f["year"] for f in surveyed if f["reach"] == "north"})
    # 1892 wrap around the Point is south_point (same T-sheet). Only detached
    # north features should remain tagged north.
    feats = []
    for i, f in enumerate(surveyed):
        feats.append({
            "type": "Feature",
            "id": i,
            "properties": {
                "Year_": f["year"],
                "Date_": f["date"],
                "Source": f["source"],
                "Uncy": f["uncy"],
                "RouteID": f["routeId"],
                "Default_D": f["defaultD"],
                "reach": f["reach"],
            },
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in f["coords"]]},
        })
    doc = {
        "type": "FeatureCollection",
        "name": "usgs_hwl_montauk",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "properties": {
            "source": "USGS OFR 2010-1119 Himmelstoss et al. 2010, LongIsland_shorelines.shp",
            "credit": "Himmelstoss, E.A., Kratzmann, M.G., Hapke, C., Thieler, E.R., and List, J., 2010, National Assessment of Shoreline Change: A GIS Compilation of Vector Shorelines and Associated Shoreline Change Data for the New England and Mid-Atlantic Coasts: U.S. Geological Survey Open-File Report 2010-1119.",
            "url": "https://pubs.usgs.gov/of/2010/1119/",
            "note": "Only features intersecting Montauk bbox. Year_ values are the on-disk USGS years. 1891 and 1991 exist elsewhere on Long Island and are omitted. North-shore HWL is present only for 1933 (t5079) and 2000 (lidar Point stub). South-shore / Point lines are NY Sea Grant, 1892 T-sheets t2053/t2106, and 2000 lidar.",
            "bbox": [WEST, SOUTH, EAST, NORTH],
            "years": years,
            "northYears": north_years,
            "extracted": "2026-08-24",
            "n_features": len(feats),
        },
        "features": feats,
    }
    path = DATA / "usgs_hwl_montauk.geojson"
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print("wrote", path, "bytes", path.stat().st_size, "features", len(feats), "years", years, "northYears", north_years)


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


def line_hits(coords: list[tuple[float, float]], transects: list[dict]) -> dict[int, tuple[float, float]]:
    hits = {}
    for tr in transects:
        found = None
        for i in range(len(coords) - 1):
            pt = seg_intersect(tr["a"], tr["b"], coords[i], coords[i + 1])
            if pt:
                found = pt
                break
        if found:
            hits[tr["id"]] = found
    return hits


def merge_south(surveyed: list[dict], year: int) -> list[tuple[float, float]]:
    parts = [f["coords"] for f in surveyed if f["year"] == year and f["reach"] == "south_point"]
    if not parts:
        return []
    parts_sorted = sorted(parts, key=lambda p: sum(c[0] for c in p) / len(p))
    out = []
    for part in parts_sorted:
        run = list(part)
        if run[0][0] > run[-1][0]:
            run = list(reversed(run))
        if out and hypot(run[0], out[-1]) > hypot(run[-1], out[-1]):
            run = list(reversed(run))
        if out and hypot(run[0], out[-1]) < 1e-5:
            run = run[1:]
        out.extend(run)
    return out


def hypot(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def lerp(a, b, t: float):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def neighbors(year: int) -> tuple[int | None, int | None]:
    earlier = [y for y in ANCHORS if y < year]
    later = [y for y in ANCHORS if y > year]
    return (earlier[-1] if earlier else None, later[0] if later else None)


def connect_hits(transects: list[dict], hits: dict[int, tuple[float, float]]) -> list[list[list[float]]]:
    ordered = [tr for tr in transects if tr["id"] in hits]
    if len(ordered) < 2:
        return []
    lines = []
    cur = [list(map(r6, hits[ordered[0]["id"]]))]
    for prev, tr in zip(ordered, ordered[1:]):
        # gap if transect ids jump a lot with no hit — still connect sequential hits
        cur.append(list(map(r6, hits[tr["id"]])))
        if tr["order"] - prev["order"] > 8:
            if len(cur) >= 2:
                lines.append(cur)
            cur = [list(map(r6, hits[tr["id"]]))]
    if len(cur) >= 2:
        lines.append(cur)
    return lines


def water_poly(line: list[list[float]]) -> list[list[list[float]]]:
    if len(line) < 2:
        return []
    # Close seaward (south, then east of the Point). Do not close a north loop.
    ocean_s = 40.992
    west = [line[0][0], ocean_s]
    east = [max(line[-1][0], -71.845), ocean_s]
    ring = [c[:] for c in line] + [east, west, line[0][:]]
    return [ring]


def quads(transects, hits_a, hits_b, t_thresh=1e-8):
    lost, gained = [], []
    ordered = [tr for tr in transects if tr["id"] in hits_a and tr["id"] in hits_b]
    for left, right in zip(ordered, ordered[1:]):
        if right["order"] - left["order"] > 8:
            continue
        a1, a2 = hits_a[left["id"]], hits_a[right["id"]]
        b1, b2 = hits_b[left["id"]], hits_b[right["id"]]
        # Inland is toward transect b (second vertex). Compare distance from seaward a.
        def inland_amt(pt, tr):
            return (pt[0] - tr["a"][0]) * (tr["b"][0] - tr["a"][0]) + (pt[1] - tr["a"][1]) * (tr["b"][1] - tr["a"][1])

        da = inland_amt(b1, left) - inland_amt(a1, left)
        db = inland_amt(b2, right) - inland_amt(a2, right)
        mean = (da + db) / 2
        if abs(mean) < t_thresh:
            continue
        ring = [list(map(r6, a1)), list(map(r6, a2)), list(map(r6, b2)), list(map(r6, b1)), list(map(r6, a1))]
        if mean > 0:
            lost.append([ring])  # later/current more inland = lost beach
        else:
            gained.append([ring])
    return lost, gained


def feat(kind, year, status, geom_type, coords, **extra):
    props = {"kind": kind, "year": year, "status": status, "reach": extra.pop("reach", "south_point")}
    props.update({k: v for k, v in extra.items() if v is not None})
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": geom_type, "coordinates": coords},
    }


def build_worlds(surveyed: list[dict]) -> None:
    transects = load_transects()
    south_lines = {y: merge_south(surveyed, y) for y in ANCHORS}
    hits = {y: line_hits(south_lines[y], transects) for y in ANCHORS if south_lines[y]}
    features = []

    for f in surveyed:
        status = "surveyed"
        features.append(feat(
            "hwl", f["year"], status, "LineString", [list(p) for p in f["coords"]],
            reach=f["reach"], Source=f["source"], Date_=f["date"], Year_=f["year"],
            credit="USGS OFR 2010-1119 Himmelstoss et al. 2010",
        ))

    for y in ANCHORS:
        line = south_lines.get(y) or []
        if len(line) >= 2:
            features.append(feat("water", y, "surveyed", "Polygon", water_poly([list(p) for p in line])))
        prev = neighbors(y)[0]
        if prev and prev in hits and y in hits:
            lost, gained = quads(transects, hits[prev], hits[y])
            if lost:
                features.append(feat("lost", y, "surveyed", "MultiPolygon", lost, vs=prev))
            if gained:
                features.append(feat("gained", y, "surveyed", "MultiPolygon", gained, vs=prev))

    for y in DECADE_YEARS:
        earlier, later = neighbors(y)
        if earlier and later and earlier in hits and later in hits:
            t = (y - earlier) / (later - earlier)
            common = [tr for tr in transects if tr["id"] in hits[earlier] and tr["id"] in hits[later]]
            interp = {tr["id"]: lerp(hits[earlier][tr["id"]], hits[later][tr["id"]], t) for tr in common}
            lines = connect_hits(transects, interp)
            status = "modeled"
            note = f"Linear in time between USGS HWL {earlier} and {later} along OFR 2010-1119 LT transects. Not a surveyed shoreline."
            hold = None
        elif earlier and earlier in hits:
            interp = dict(hits[earlier])
            lines = connect_hits(transects, interp)
            status = "held"
            note = f"Held at USGS HWL {earlier} — no later Montauk HWL in OFR 2010-1119. Not a surveyed {y} shoreline."
            hold = earlier
            later = None
            t = None
        else:
            continue
        for line in lines:
            features.append(feat(
                "hwl", y, status, "LineString", line,
                fromYear=earlier, toYear=later, holdYear=hold,
                note=note, credit="Modeled from USGS high-water-line trend. Not a surveyed shoreline.",
            ))
            features.append(feat("water", y, status, "Polygon", water_poly(line), holdYear=hold, fromYear=earlier, toYear=later))
        if status == "modeled" and earlier in hits:
            lost, gained = quads(transects, hits[earlier], interp)
            if lost:
                features.append(feat("lost", y, "modeled", "MultiPolygon", lost, vs=earlier))
            if gained:
                features.append(feat("gained", y, "modeled", "MultiPolygon", gained, vs=earlier))

    # 2014 is DEM year — no HWL feature on purpose.
    doc = {
        "type": "FeatureCollection",
        "name": "usgs_hwl_worlds",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "properties": {
            "source": "USGS OFR 2010-1119 Himmelstoss et al. 2010",
            "credit": "Himmelstoss et al. 2010. Reconstruction uses sourced HWL + 2014 NOAA NGS relief. Not a surveyed historic DEM.",
            "anchors": ANCHORS,
            "decadeYears": DECADE_YEARS,
            "northYears": sorted(NORTH_YEARS),
            "demYear": 2014,
            "note": "South/Point decade lines are interpolated or held. North HWL only in 1933 and 2000. No Soundview/harbor invented waterline. No peninsula loop.",
        },
        "features": features,
    }
    path = DATA / "usgs_hwl_worlds.geojson"
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    kinds = {}
    for f in features:
        k = (f["properties"]["kind"], f["properties"]["status"], f["properties"]["year"])
        kinds[k] = kinds.get(k, 0) + 1
    print("wrote", path, "bytes", path.stat().st_size, "features", len(features))
    modeled_years = sorted({f["properties"]["year"] for f in features if f["properties"]["status"] in ("modeled", "held") and f["properties"]["kind"] == "hwl"})
    print("modeled/held years", modeled_years)


def main() -> int:
    dest_download()
    surveyed = load_surveyed()
    write_montauk(surveyed)
    build_worlds(surveyed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
