#!/usr/bin/env python3
"""Sample USGS HWL position at south/Point site pins for the Change tab.

Y is meters relative to the 2000 high-water line at the nearest official
OFR 2010-1119 LT transect: seaward +, landward −. Soundview and harbor get
no invented HWL series.

Locator lines and the lost-sand polygon are clipped to the site pin
neighborhood on south/Point only.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

SOUTH_SITES = ("ditch_plains", "ocean_beaches", "lighthouse")
NORTH_SITES = ("soundview", "harbor_jetties")
LOCATOR_HALF_M = 650.0
LOST_NEIGHBORS = 8
R6 = 6


def r6(v: float) -> float:
    return round(float(v), R6)


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lng1, lat1 = a
    lng2, lat2 = b
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def meters_xy(origin: tuple[float, float], pt: tuple[float, float]) -> tuple[float, float]:
    lng0, lat0 = origin
    lng, lat = pt
    mx = haversine_m((lng0, lat0), (lng, lat0))
    my = haversine_m((lng0, lat0), (lng0, lat))
    if lng < lng0:
        mx = -mx
    if lat < lat0:
        my = -my
    return (mx, my)


def dist_point_seg(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    ax, ay = meters_xy(p, a)
    bx, by = meters_xy(p, b)
    vx, vy = bx - ax, by - ay
    den = vx * vx + vy * vy
    if den < 1e-9:
        return math.hypot(ax, ay)
    t = max(0.0, min(1.0, (-ax * vx - ay * vy) / den))
    return math.hypot(ax + t * vx, ay + t * vy)


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


def inland_m(pt: tuple[float, float], tr: dict) -> float:
    """Meters from seaward transect end toward inland end."""
    a, b = tr["a"], tr["b"]
    ax, ay = meters_xy(a, a)
    bx, by = meters_xy(a, b)
    px, py = meters_xy(a, pt)
    vx, vy = bx - ax, by - ay
    den = vx * vx + vy * vy
    if den < 1e-9:
        return 0.0
    t = (px * vx + py * vy) / den
    return t * math.hypot(vx, vy)


def load_json(name: str):
    return json.loads((DATA / name).read_text())


def load_transects() -> list[dict]:
    doc = load_json("usgs_lt_montauk.geojson")
    rows = []
    for feat in doc["features"]:
        coords = feat["geometry"]["coordinates"]
        if len(coords) < 2:
            continue
        p = feat.get("properties") or {}
        a = (float(coords[0][0]), float(coords[0][1]))
        b = (float(coords[-1][0]), float(coords[-1][1]))
        rows.append({
            "id": p.get("TRANSECTID") or p.get("OBJECTID"),
            "order": p.get("TRANSORDER") or p.get("OBJECTID") or 0,
            "lrr": p.get("LRR"),
            "a": a,
            "b": b,
        })
    rows.sort(key=lambda t: t["order"])
    return rows


def line_hit(coords: list[list[float]], tr: dict):
    for i in range(len(coords) - 1):
        pt = seg_intersect(tr["a"], tr["b"], tuple(coords[i]), tuple(coords[i + 1]))
        if pt:
            return pt
    return None


def clip_line(coords: list[list[float]], pin: tuple[float, float], half_m: float) -> list[list[float]]:
    kept = []
    for c in coords:
        if haversine_m(pin, (c[0], c[1])) <= half_m:
            kept.append([r6(c[0]), r6(c[1])])
    if len(kept) < 2:
        # fall back to nearest vertices
        ranked = sorted(coords, key=lambda c: haversine_m(pin, (c[0], c[1])))[:8]
        ranked.sort(key=lambda c: coords.index(c) if c in coords else 0)
        kept = [[r6(c[0]), r6(c[1])] for c in ranked]
    return kept


def key_numbers(site: dict) -> list[dict]:
    out = []
    for n in site.get("keyNumbers") or []:
        out.append({
            "label": n.get("label"),
            "value": n.get("value"),
            "unit": n.get("unit") or "",
            "note": n.get("note") or "",
            "status": n.get("status") or "sourced",
        })
    return out


def carp_note(site: dict) -> str | None:
    for n in site.get("keyNumbers") or []:
        label = (n.get("label") or "")
        if "CARP" in label:
            bits = [label]
            if n.get("value"):
                bits.append(f"{n['value']} {n.get('unit') or ''}".strip())
            if n.get("note"):
                bits.append(n["note"])
            return " · ".join(bits)
    return None


def van_scoyoc_quote(site: dict) -> dict | None:
    for n in site.get("keyNumbers") or []:
        if "1960s" in (n.get("label") or "") or "Van Scoyoc" in (n.get("note") or ""):
            return {
                "text": "Soundview Drive / Captain Kidd’s Path had 100–200 ft of beach in the 1960s–70s; “that sand is gone.”",
                "attribution": "Supervisor Peter Van Scoyoc, quoted in 27east 2022-04-28",
                "note": "Recollection, not a surveyed width. NORTH shore. Not a USGS HWL series.",
                "value": n.get("value"),
                "unit": n.get("unit"),
            }
    return None


def pick_transect(pin: tuple[float, float], transects: list[dict], hits2000: dict) -> dict:
    scored = []
    for tr in transects:
        if tr["id"] not in hits2000:
            continue
        d = dist_point_seg(pin, tr["a"], tr["b"])
        scored.append((d, tr))
    scored.sort(key=lambda x: x[0])
    if not scored:
        raise SystemExit(f"no 2000 HWL hit near {pin}")
    return scored[0][1]


def year_hits(worlds: dict) -> dict[int, dict]:
    """year -> {status, lines: [coords...]} for south/Point HWL only."""
    out: dict[int, dict] = {}
    for feat in worlds["features"]:
        p = feat.get("properties") or {}
        if p.get("kind") != "hwl":
            continue
        if p.get("reach") == "north":
            continue
        year = int(p.get("year") if p.get("year") is not None else p.get("Year_"))
        geom = feat.get("geometry") or {}
        if geom.get("type") != "LineString":
            continue
        rec = out.setdefault(year, {"status": p.get("status") or "surveyed", "lines": [], "note": p.get("note"), "credit": p.get("credit")})
        rec["lines"].append(geom["coordinates"])
        if p.get("status"):
            rec["status"] = p["status"]
    return out


def hit_year(tr: dict, year_rec: dict):
    for line in year_rec.get("lines") or []:
        pt = line_hit(line, tr)
        if pt:
            return pt
    return None


def neighborhood(transects: list[dict], center: dict, n: int) -> list[dict]:
    idx = next(i for i, t in enumerate(transects) if t["id"] == center["id"])
    return [t for t in transects[max(0, idx - n): idx + n + 1]]


def lost_polygon(transects: list[dict], hits_a: dict, hits_b: dict) -> list[list[list[float]]]:
    rings = []
    ordered = [tr for tr in transects if tr["id"] in hits_a and tr["id"] in hits_b]
    for left, right in zip(ordered, ordered[1:]):
        if abs(right["order"] - left["order"]) > 8:
            continue
        a1, a2 = hits_a[left["id"]], hits_a[right["id"]]
        b1, b2 = hits_b[left["id"]], hits_b[right["id"]]
        da = inland_m(b1, left) - inland_m(a1, left)
        db = inland_m(b2, right) - inland_m(a2, right)
        if (da + db) / 2 <= 0.4:
            continue  # later/current not inland of early = no lost sand
        ring = [
            [r6(a1[0]), r6(a1[1])],
            [r6(a2[0]), r6(a2[1])],
            [r6(b2[0]), r6(b2[1])],
            [r6(b1[0]), r6(b1[1])],
            [r6(a1[0]), r6(a1[1])],
        ]
        rings.append(ring)
    return rings


def nearest_line(year_rec: dict, pin: tuple[float, float]) -> list[list[float]]:
    best, best_d = [], 1e18
    for line in year_rec.get("lines") or []:
        if not line:
            continue
        d = min(haversine_m(pin, (c[0], c[1])) for c in line)
        if d < best_d:
            best, best_d = line, d
    return best


def chip(label, value, unit, source):
    return {"label": label, "value": value, "unit": unit, "source": source}


def build() -> dict:
    sites_doc = load_json("sites.json")
    sites = {s["id"]: s for s in sites_doc["sites"]}
    worlds = load_json("usgs_hwl_worlds.geojson")
    hwl = load_json("usgs_hwl_montauk.geojson")
    transects = load_transects()
    by_year = year_hits(worlds)

    if 2000 not in by_year:
        raise SystemExit("2000 HWL missing from usgs_hwl_worlds.geojson")

    hits2000 = {}
    for tr in transects:
        pt = hit_year(tr, by_year[2000])
        if pt:
            hits2000[tr["id"]] = pt

    out_sites = []
    for sid in ("ditch_plains", "ocean_beaches", "lighthouse", "soundview", "harbor_jetties"):
        site = sites[sid]
        pin = (site["lng"], site["lat"])
        row = {
            "id": sid,
            "name": site["shortName"],
            "longName": site["name"],
            "lat": site["lat"],
            "lng": site["lng"],
            "shore": site.get("shore"),
            "waterbody": site.get("waterbody"),
            "facing": site.get("facing"),
            "keyNumbers": key_numbers(site),
            "carpNote": carp_note(site),
            "hasHwl": sid in SOUTH_SITES,
            "series": [],
            "locator": None,
            "quote": van_scoyoc_quote(site) if sid == "soundview" else None,
        }
        if sid in NORTH_SITES:
            row["hwlNote"] = (
                "USGS OFR 2010-1119 has no Soundview / harbor high-water-line series. "
                "North HWL exists only as 1933 (t5079) and a 2000 lidar Point stub. "
                "No historic width is drawn here."
            )
            out_sites.append(row)
            continue

        tr = pick_transect(pin, transects, hits2000)
        ref = hits2000[tr["id"]]
        series = []
        for year in sorted(by_year):
            rec = by_year[year]
            pt = hit_year(tr, rec)
            if pt is None:
                # try immediate neighbors, still the same south/Point official transects
                idx = next(i for i, t in enumerate(transects) if t["id"] == tr["id"])
                for other in transects[max(0, idx - 2): idx + 3]:
                    if other["id"] == tr["id"]:
                        continue
                    cand = hit_year(other, rec)
                    if cand is None or other["id"] not in hits2000:
                        continue
                    # express relative to that neighbor's 2000 hit, then keep if close
                    m = inland_m(hits2000[other["id"]], other) - inland_m(cand, other)
                    pt = cand
                    series.append({
                        "year": year,
                        "m": round(m, 2),
                        "status": rec["status"],
                        "transectId": other["id"],
                    })
                    pt = None
                    break
                if pt is None:
                    continue
            m = inland_m(ref, tr) - inland_m(pt, tr)
            series.append({
                "year": year,
                "m": round(m, 2),
                "status": rec["status"],
                "transectId": tr["id"],
            })
        # 2000 is the datum. Held decades copy that line — snap to zero.
        for p in series:
            if p["year"] == 2000 or p["status"] == "held":
                p["m"] = 0.0
        series.sort(key=lambda p: (p["year"], 0 if p.get("transectId") == tr["id"] else 1))
        dedup = []
        seen = set()
        for p in series:
            if p["year"] in seen:
                continue
            seen.add(p["year"])
            dedup.append(p)
        row["series"] = dedup
        row["transectId"] = tr["id"]
        row["transectLrr"] = tr.get("lrr")

        early_year = 1870 if 1870 in by_year else 1871
        early_status = by_year[early_year]["status"]
        neigh = neighborhood(transects, tr, LOST_NEIGHBORS)
        hits_early = {t["id"]: hit_year(t, by_year[early_year]) for t in neigh}
        hits_early = {k: v for k, v in hits_early.items() if v}
        hits_now = {t["id"]: hits2000[t["id"]] for t in neigh if t["id"] in hits2000}
        if len(hits_early) < 3 and 1871 in by_year and early_year != 1871:
            early_year = 1871
            early_status = by_year[1871]["status"]
            hits_early = {t["id"]: hit_year(t, by_year[1871]) for t in neigh}
            hits_early = {k: v for k, v in hits_early.items() if v}

        line_early = clip_line(nearest_line(by_year[early_year], pin), pin, LOCATOR_HALF_M)
        line_2000 = clip_line(nearest_line(by_year[2000], pin), pin, LOCATOR_HALF_M)
        lost = lost_polygon(neigh, hits_early, hits_now)
        year_lines = {}
        lost_by_year = {}
        show_years = sorted(set(by_year) & {1830, 1870, 1871, 1892, 1933, 1938, 1962, 1979, 1983, 1988, 2000, 2001})
        for year in show_years:
            rec = by_year[year]
            year_lines[str(year)] = {
                "status": rec["status"],
                "line": clip_line(nearest_line(rec, pin), pin, LOCATOR_HALF_M),
            }
            if year < 2000:
                hits_y = {t["id"]: hit_year(t, rec) for t in neigh}
                hits_y = {k: v for k, v in hits_y.items() if v}
                lost_by_year[str(year)] = lost_polygon(neigh, hits_y, hits_now)
        row["locator"] = {
            "earlyYear": early_year,
            "earlyStatus": early_status,
            "early": line_early,
            "y2000": line_2000,
            "lost": lost,
            "lines": year_lines,
            "lostByYear": lost_by_year,
            "lostNote": (
                f"Filled sand is the area between the {early_year} "
                f"{'surveyed' if early_status == 'surveyed' else 'modeled'} HWL and the 2000 HWL "
                "along nearby USGS LT transects. South / Point only. "
                "No fill is drawn where the earlier line is landward of 2000."
            ),
        }
        out_sites.append(row)

    volumes = [
        {
            "id": "ditch_remnant_2020",
            "siteId": "ditch_plains",
            "label": "Ditch remnant 2020",
            "cy": 1925,
            "source": "Town 2024 Ditch dune memo: 1,925 cy above MSL (2020 remnant).",
        },
        {
            "id": "ditch_remnant_2024",
            "siteId": "ditch_plains",
            "label": "Ditch remnant Feb 2024",
            "cy": 544,
            "source": "Town 2024 Ditch dune memo: 544 cy above MSL by February 2024.",
        },
        {
            "id": "ditch_rebuild",
            "siteId": "ditch_plains",
            "label": "Ditch rebuilt dune",
            "cy": 20000,
            "source": "Town 2024 / 2025–26 as-built: maximum permitted fill 20,000 cy; crest +16 ft NAVD along ~2,200 ft.",
        },
        {
            "id": "downtown_fimp",
            "siteId": "ocean_beaches",
            "label": "Downtown FIMP 2024",
            "cy": 500000,
            "approx": True,
            "source": "USACE news: ~500,000 cy along 4,100 ft. Design docs said 450,000 cy along ~6,000 ft.",
        },
        {
            "id": "soundview_2025",
            "siteId": "soundview",
            "label": "Soundview 2025 placement",
            "cy": 110000,
            "approx": True,
            "source": "USACE Lake Montauk Harbor deepening: ~110,000 cy to the west / Soundview beach.",
        },
    ]

    surveyed = sorted({f["properties"]["Year_"] for f in hwl["features"]})
    modeled = sorted({y for y, rec in by_year.items() if rec["status"] == "modeled"})
    held = sorted({y for y, rec in by_year.items() if rec["status"] == "held"})

    doc = {
        "name": "montauk_change",
        "source": "USGS OFR 2010-1119 Himmelstoss et al. 2010; data/sites.json keyNumbers; data/usgs_hwl_worlds.geojson",
        "credit": "Himmelstoss, E.A., Kratzmann, M.G., Hapke, C., Thieler, E.R., and List, J., 2010, National Assessment of Shoreline Change: U.S. Geological Survey Open-File Report 2010-1119.",
        "url": "https://pubs.usgs.gov/of/2010/1119/",
        "y": "Shoreline position relative to the 2000 USGS high-water line at the site pin, meters. Seaward +, landward −.",
        "modeledCaption": "Modeled from USGS HWL trend. Not a surveyed shoreline.",
        "heldCaption": "Held at 2000 — no later Montauk HWL in OFR 2010-1119. Not a surveyed shoreline.",
        "lidarNote": "This page does not claim lidar change. 2000 is a USGS high-water line (lidar-derived HWL at the Point stub / south lidar). No DEM differencing.",
        "same1830_1870": "In OFR 2010-1119 for Montauk, the 1830 and 1870 NY Sea Grant high-water lines are the same geometry.",
        "surveyedYears": surveyed,
        "modeledYears": modeled,
        "heldYears": held,
        "sliderYears": sorted(set(surveyed) | set(modeled) | set(held)),
        "sites": out_sites,
        "volumes": volumes,
    }
    return doc


def main() -> int:
    doc = build()
    path = DATA / "change.json"
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print("wrote", path, "bytes", path.stat().st_size)
    for site in doc["sites"]:
        series = site.get("series") or []
        print(site["id"], "hwl", site["hasHwl"], "n", len(series), end=" ")
        if series:
            y1871 = next((p for p in series if p["year"] == 1871), None)
            y1870 = next((p for p in series if p["year"] == 1870), None)
            y2000 = next((p for p in series if p["year"] == 2000), None)
            print("1870", y1870, "1871", y1871, "2000", y2000, "transect", site.get("transectId"), "lrr", site.get("transectLrr"))
            print("  years", [(p["year"], p["m"], p["status"]) for p in series])
        else:
            print("quote", bool(site.get("quote")))
        loc = site.get("locator") or {}
        if loc:
            print("  locator early", loc.get("earlyYear"), "pts", len(loc.get("early") or []), "2000", len(loc.get("y2000") or []), "lost rings", len(loc.get("lost") or []))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
