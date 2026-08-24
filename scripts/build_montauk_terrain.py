#!/usr/bin/env python3
"""Crop NOAA 2014 NGS Post-Sandy Block_140 (Digital Coast 4967) to Montauk
and write Terrarium PNG tiles for GitHub Pages.

Does not commit the raw ~121 MB GeoTIFF. Downloads it to /tmp only.
This is a single-year elevation surface — not a lidar-change product.
"""
from __future__ import annotations

import math
import os
import sys
import urllib.request
from pathlib import Path

from osgeo import gdal, osr
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "terrain" / "2014-ngs"
SRC_URL = (
    "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/"
    "dem/Post_Sandy_DEM_2014_4967/Block_140.tif"
)
RAW = Path("/tmp/Block_140.tif")
CROP = Path("/tmp/montauk_2014_ngs_10m.tif")

# Covers the five sourced pins with a small margin. Not a new shoreline.
WEST, SOUTH, EAST, NORTH = -71.965, 41.022, -71.845, 41.088
ZMIN, ZMAX = 11, 14
RES_M = 10.0


def download() -> None:
    if RAW.exists() and RAW.stat().st_size > 100_000_000:
        print("raw present", RAW, RAW.stat().st_size)
        return
    print("download", SRC_URL)
    urllib.request.urlretrieve(SRC_URL, RAW)
    print("saved", RAW, RAW.stat().st_size)


def crop() -> None:
    gdal.UseExceptions()
    print("crop + 10 m Web Mercator")
    gdal.Warp(
        str(CROP),
        str(RAW),
        format="GTiff",
        dstSRS="EPSG:3857",
        outputBounds=[WEST, SOUTH, EAST, NORTH],
        outputBoundsSRS="EPSG:4326",
        xRes=RES_M,
        yRes=RES_M,
        resampleAlg="average",
        dstNodata=-32768,
        creationOptions=["TILED=YES", "COMPRESS=LZW"],
    )
    info = gdal.Info(str(CROP), format="json")
    print("crop", info.get("size"), "bytes", CROP.stat().st_size)


def mercator_tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2.0 ** z
    lon_left = x / n * 360.0 - 180.0
    lon_right = (x + 1) / n * 360.0 - 180.0

    def lat(ty: float) -> float:
        rad = math.atan(math.sinh(math.pi * (1 - 2 * ty / n)))
        return math.degrees(rad)

    lat_top = lat(y)
    lat_bot = lat(y + 1)
    return lon_left, lat_bot, lon_right, lat_top


def lnglat_to_tile(lng: float, lat: float, z: int) -> tuple[int, int]:
    n = 2.0 ** z
    x = int((lng + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def encode_terrarium(elev: np.ndarray) -> Image.Image:
    z = np.array(elev, dtype=np.float32)
    z[~np.isfinite(z)] = 0.0
    z[z < -1000] = 0.0  # Block_140 nodata is -32768; treat as sea level, not a hole
    v = np.clip(z, -32767, 32767) + 32768.0
    r = np.floor(v / 256.0)
    g = np.floor(v - r * 256.0)
    b = np.floor((v - r * 256.0 - g) * 256.0)
    rgb = np.dstack([r, g, b]).astype(np.uint8)
    return Image.fromarray(rgb, mode="RGB")


def write_tiles() -> int:
    gdal.UseExceptions()
    src = gdal.Open(str(CROP))
    n = 0
    for z in range(ZMIN, ZMAX + 1):
        x0, y1 = lnglat_to_tile(WEST, SOUTH, z)
        x1, y0 = lnglat_to_tile(EAST, NORTH, z)
        xmin, xmax = min(x0, x1), max(x0, x1)
        ymin, ymax = min(y0, y1), max(y0, y1)
        for x in range(xmin, xmax + 1):
            for y in range(ymin, ymax + 1):
                west, south, east, north = mercator_tile_bounds(z, x, y)
                mem = gdal.Warp(
                    "",
                    src,
                    format="MEM",
                    dstSRS="EPSG:3857",
                    outputBounds=[west, south, east, north],
                    outputBoundsSRS="EPSG:4326",
                    width=256,
                    height=256,
                    resampleAlg="bilinear",
                    dstNodata=float("nan"),
                )
                band = mem.GetRasterBand(1)
                arr = band.ReadAsArray().astype(np.float32)
                if not np.isfinite(arr).any():
                    continue
                img = encode_terrarium(arr)
                dest = OUT / str(z) / str(x)
                dest.mkdir(parents=True, exist_ok=True)
                img.save(dest / f"{y}.png", optimize=True)
                n += 1
    print("tiles", n, "in", OUT)
    return n


def main() -> int:
    os.environ.setdefault("GDAL_PAM_ENABLED", "NO")
    download()
    crop()
    write_tiles()
    print("ok — do not add Block_140.tif to the repo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
