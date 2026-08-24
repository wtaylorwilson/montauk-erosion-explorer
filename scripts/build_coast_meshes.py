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


def lnglat_to_tile(lng: float, lat: float, z: int) -> tuple[float, float]:
    n = 2.0 ** z
    x = (lng + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def _read_png_rgb(path: Path) -> list[list[tuple[int, int, int]]]:
    """Stdlib PNG reader for 8-bit RGB/RGBA tiles (no Pillow)."""
    import struct
    import zlib

    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a png")
    pos = 8
    width = height = 0
    bit_depth = 8
    color_type = 2
    idat = b""
    while pos + 8 <= len(raw):
        length = struct.unpack(">I", raw[pos:pos + 4])[0]
        ctype = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", data[:10])
        elif ctype == b"IDAT":
            idat += data
        elif ctype == b"IEND":
            break
    if bit_depth != 8 or color_type not in (2, 6) or not width:
        raise ValueError("unsupported png")
    bpp = 3 if color_type == 2 else 4
    rows = zlib.decompress(idat)
    stride = 1 + width * bpp
    out = []
    prev = bytes(width * bpp)
    i = 0
    for _y in range(height):
        filt = rows[i]
        scan = bytearray(rows[i + 1:i + stride])
        i += stride
        if filt == 1:
            for x in range(bpp, len(scan)):
                scan[x] = (scan[x] + scan[x - bpp]) & 255
        elif filt == 2:
            for x in range(len(scan)):
                scan[x] = (scan[x] + prev[x]) & 255
        elif filt == 3:
            for x in range(len(scan)):
                left = scan[x - bpp] if x >= bpp else 0
                scan[x] = (scan[x] + ((left + prev[x]) // 2)) & 255
        elif filt == 4:
            def paeth(a, b, c):
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                if pa <= pb and pa <= pc:
                    return a
                if pb <= pc:
                    return b
                return c
            for x in range(len(scan)):
                a = scan[x - bpp] if x >= bpp else 0
                scan[x] = (scan[x] + paeth(a, prev[x], prev[x - bpp] if x >= bpp else 0)) & 255
        prev = bytes(scan)
        row = []
        for x in range(width):
            o = x * bpp
            row.append((scan[o], scan[o + 1], scan[o + 2]))
        out.append(row)
    return out


class TerrariumSampler:
    """2014 NGS crop only — used to hide that year's land seaward of the HWL.
    Not a historic DEM and not written back as elevation tiles."""

    def __init__(self) -> None:
        self.root = ROOT / "assets" / "terrain" / "2014-ngs"
        self.cache: dict[Path, list] = {}

    def elev(self, lng: float, lat: float, z: int = 14) -> float | None:
        xf, yf = lnglat_to_tile(lng, lat, z)
        tx, ty = int(math.floor(xf)), int(math.floor(yf))
        path = self.root / str(z) / str(tx) / f"{ty}.png"
        if not path.is_file():
            return None
        if path not in self.cache:
            self.cache[path] = _read_png_rgb(path)
        img = self.cache[path]
        px = min(255, max(0, int((xf - tx) * 256)))
        py = min(255, max(0, int((yf - ty) * 256)))
        r, g, b = img[py][px]
        return r * 256.0 + g + b / 256.0 - 32768.0


def lerp_pt(a, b, t: float):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def z_cut_seaward(sampler: TerrariumSampler, hwl, sea, steps: int = 12) -> float:
    """Max 2014 elevation from this year's HWL out to the transect sea end."""
    zmax = 0.0
    for i in range(steps + 1):
        t = i / steps
        pt = lerp_pt(hwl, sea, t)
        z = sampler.elev(pt[0], pt[1])
        if z is not None:
            zmax = max(zmax, z)
    return round(max(0.0, zmax), 2)


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

    sampler = TerrariumSampler()
    year_out = {}
    for y in years:
        yh = hits.get(y) or {}
        hwl_pts = []
        ref_pts = []
        sea_w = []
        z_cut = []
        for tr in canonical:
            r = ref[tr["id"]]
            h = yh.get(tr["id"], r)
            hwl_pts.append(h)
            ref_pts.append(r)
            # + seaward of 2000 (historic beach to build); − landward (cut)
            sign = 1.0 if inland_amt(h, tr) < inland_amt(r, tr) else -1.0
            sea_w.append(round(hypot_m(h, r) * sign, 1))
            z_cut.append(z_cut_seaward(sampler, h, tr["a"]))
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
            "zCut": z_cut,
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
            "credit": "South/Point carved coasts from sourced HWL vs the 2000 USGS HWL (2014 waterline proxy). zCut is the 2014 NGS height seaward of that HWL so the hide mesh can cover 2014 land — not a historic DEM and not invented inland hills.",
            "anchors": ANCHORS,
            "decadeYears": DECADE_YEARS,
            "northYears": sorted(NORTH_YEARS),
            "note": "North HWL only in 1933 and 2000. No Soundview/harbor invented waterline. No peninsula loop. 2001–2021 held at 2000. 2014 relief is hidden seaward of each year's HWL.",
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
