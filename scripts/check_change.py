#!/usr/bin/env python3
"""Change tab: sourced USGS HWL sparklines, no invented north-shore widths."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PINS = {
    "soundview": (41.0755, -71.948),
    "harbor_jetties": (41.075, -71.9367),
    "ocean_beaches": (41.0315, -71.946),
    "ditch_plains": (41.03948, -71.91701),
    "lighthouse": (41.07099, -71.85709),
}

WANT_NUMBERS = {
    "ditch_plains": [
        ("USGS LRR (site box)", "−0.08", "m/yr"),
        ("2020 remnant → Feb 2024", "1,925 → 544", "cy"),
        ("Rebuilt dune", "20,000", "cy"),
    ],
    "ocean_beaches": [
        ("USGS LRR (south shore)", "−0.11", "m/yr"),
        ("FIMP 2024 as-built", "~500,000", "cy"),
    ],
    "lighthouse": [
        ("USGS LRR (site box)", "−0.20", "m/yr"),
        ("Original setback", "~300", "ft"),
    ],
    "soundview": [
        ("2025 placement", "~110,000", "cy"),
        ("1960s–70s beach", "100–200", "ft"),
    ],
}


def kn(site, label):
    for n in site.get("keyNumbers") or []:
        if n.get("label") == label:
            return n
    return None


def main() -> int:
    errors = []
    sites = {s["id"]: s for s in json.loads((ROOT / "data" / "sites.json").read_text())["sites"]}
    change_path = ROOT / "data" / "change.json"
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "css" / "app.css").read_text()
    app = (ROOT / "js" / "app.js").read_text()
    js = (ROOT / "js" / "change.js").read_text() if (ROOT / "js" / "change.js").is_file() else ""

    if not change_path.is_file():
        errors.append("missing data/change.json")
        print("FAIL")
        print("\n".join(errors))
        return 1
    doc = json.loads(change_path.read_text())
    by = {s["id"]: s for s in doc.get("sites") or []}

    if "data-view=\"change\"" not in html:
        errors.append("Change tab (data-view=change) missing from index.html")
    if "id=\"change-view\"" not in html:
        errors.append("change-view pane missing")
    if "js/change.js" not in html:
        errors.append("index.html must load js/change.js")
    if re.search(r"\bTHREE\b|three\.min\.js|from ['\"]three['\"]", js):
        errors.append("Change view must not use Three.js")
    if "Modeled from USGS HWL trend. Not a surveyed shoreline." not in (doc.get("modeledCaption") or "") and \
       "Modeled from USGS HWL trend. Not a surveyed shoreline." not in js:
        errors.append("modeled-not-surveyed caption missing")
    if "Held at 2000" not in (doc.get("heldCaption") or "") and "held at 2000" not in js.lower():
        errors.append("held-at-2000 label missing")
    if "lidar change" in js.lower() and "does not claim lidar" not in js.lower() and "not lidar" not in js.lower():
        errors.append("do not claim lidar change")
    if "MontaukChange" not in app:
        errors.append("app.js must wire MontaukChange")
    if "view === \"change\"" not in app and "view !== \"change\"" not in app:
        errors.append("app.js setView must know the change tab")

    for sid, (lat, lng) in PINS.items():
        site = sites[sid]
        if (site["lat"], site["lng"]) != (lat, lng):
            errors.append(f"sites.json moved {sid}")
        row = by.get(sid)
        if not row:
            errors.append(f"change.json missing {sid}")
            continue
        if (row.get("lat"), row.get("lng")) != (lat, lng):
            errors.append(f"change.json pin moved {sid}")

    ditch = by.get("ditch_plains") or {}
    series = {p["year"]: p for p in ditch.get("series") or []}
    if 1871 not in series or series[1871]["m"] <= 0:
        errors.append("Ditch 1871 must be seaward of 2000 (positive meters)")
    if 2000 not in series or series[2000]["m"] != 0:
        errors.append("Ditch 2000 must be the zero datum")
    if series.get(1871, {}).get("status") != "modeled":
        errors.append("Ditch 1871 must be modeled")
    if series.get(2000, {}).get("status") != "surveyed":
        errors.append("Ditch 2000 must be surveyed")
    for y in (2001, 2011, 2021):
        if y in series and (series[y]["m"] != 0 or series[y]["status"] != "held"):
            errors.append(f"Ditch {y} must be held at 2000 (0 m)")

    loc_ditch = ditch.get("locator") or {}
    if not loc_ditch.get("lost"):
        errors.append("Ditch locator must include a lost-sand polygon")
    loc_pt = (by.get("lighthouse") or {}).get("locator") or {}
    if not loc_pt.get("lost"):
        errors.append("Point locator must include a lost-sand polygon")

    for sid in ("soundview", "harbor_jetties"):
        row = by.get(sid) or {}
        if row.get("series"):
            errors.append(f"{sid} must not have an invented HWL series")
        if row.get("hasHwl"):
            errors.append(f"{sid} hasHwl must be false")
        loc = row.get("locator")
        if loc and (loc.get("lost") or loc.get("early") or loc.get("y2000")):
            errors.append(f"{sid} must not draw a lost-land / historic HWL polygon")

    quote = (by.get("soundview") or {}).get("quote") or {}
    if "100–200" not in (quote.get("text") or "") and "100-200" not in (quote.get("text") or ""):
        errors.append("Soundview must carry the Van Scoyoc 100–200 ft quote")
    if "surveyed" in (quote.get("note") or "").lower() and "not a surveyed" not in (quote.get("note") or "").lower():
        errors.append("Van Scoyoc quote must be labeled not a surveyed width")

    for sid, nums in WANT_NUMBERS.items():
        site = sites[sid]
        row = by.get(sid) or {}
        for label, value, unit in nums:
            src = kn(site, label)
            got = kn(row, label)
            if not src:
                errors.append(f"sites.json missing {sid} {label}")
                continue
            if src.get("value") != value or (src.get("unit") or "") != unit:
                errors.append(f"sites.json {sid} {label} is {src.get('value')} {src.get('unit')}, expected {value} {unit}")
            if not got or got.get("value") != src.get("value") or (got.get("unit") or "") != (src.get("unit") or ""):
                errors.append(f"change.json {sid} {label} must copy sites.json")

    vols = {v["id"]: v for v in doc.get("volumes") or []}
    want_vol = {
        "ditch_remnant_2020": 1925,
        "ditch_remnant_2024": 544,
        "ditch_rebuild": 20000,
        "downtown_fimp": 500000,
        "soundview_2025": 110000,
    }
    for vid, cy in want_vol.items():
        if not vols.get(vid) or vols[vid].get("cy") != cy:
            errors.append(f"volume {vid} must be {cy} cy")
        if vols.get(vid) and not vols[vid].get("source"):
            errors.append(f"volume {vid} needs a source caption")

    if "CARP" in js and "m/yr" in js:
        if re.search(r"CARP[^\n]{0,80}m/yr", js):
            errors.append("do not mix CARP ft/yr into the USGS m/yr line")
    if "carpNote" not in json.dumps(doc):
        errors.append("CARP belongs as a note, copied from sites.json")

    if "selectSite" not in js and "onSite" not in js:
        errors.append("clicking a site chart must select that site")

    if ".change-view" not in css:
        errors.append("css/app.css missing Change view styles")

    print(f"change sites {len(by)} ditch1871={series.get(1871, {}).get('m')} ditch2000={series.get(2000, {}).get('m')}")
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
