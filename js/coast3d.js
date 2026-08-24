/* 3D coast — year-worlds. Terrain is always 2014. Never hang CEHA, Moran, or a gallery dump. */
(function (global) {
  "use strict";

  var PATH_DWELL_MS = 2800;
  var INLAND_DWELL_MS = 2000;
  var WAYBACK_TMPL =
    "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{releaseNum}/{z}/{y}/{x}";
  var NYS_TMPL =
    "https://orthos.its.ny.gov/arcgis/rest/services/wms/{YEAR}/MapServer/tile/{z}/{y}/{x}";
  var NYS_YEARS = [2001, 2004, 2007, 2013, 2016, 2020, 2023];
  var NO_MODE_A = { 1938: 1, 1976: 1, 1984: 1, 1996: 1, 2012: 1, 2018: 1 };
  var PIN_SITES = ["ditch_plains", "soundview", "harbor_jetties", "ocean_beaches", "lighthouse"];
  var RELIEF_NOTE = "Relief 2014 NGS / Mapterhorn (visual only — not a change surface)";
  var HWL_ANCHORS = [1830, 1870, 1892, 1933, 1938, 1962, 1979, 1983, 1988, 2000];
  var HWL_DECADES = [1871, 1881, 1891, 1901, 1911, 1921, 1931, 1941, 1951, 1961, 1971, 1981, 1991, 2001, 2011, 2021];
  var HWL_NORTH_YEARS = { 1933: 1, 2000: 1 };
  var HWL_HINT_SURVEY = "Custom coast from USGS high-water line + 2014 elevation. Not a 10-year surveyed model.";
  var HWL_HINT_MODEL = "Modeled from USGS high-water-line trend. Not a surveyed shoreline.";
  var HWL_HINT_HELD = "Held at the 2000 USGS high-water line — no later Montauk HWL in OFR 2010-1119. Not a surveyed shoreline.";

  var WATER_LOOK = {
    soundview: 0,
    harbor_jetties: 8,
    ocean_beaches: 180,
    ditch_plains: 168,
    lighthouse: 125
  };
  var CAPTION_GPS = "commons_ocean_beaches_2026_downtown-aerial.jpg";

  /* Original twelve — stills appear only in their own year. */
  var LOCKED_PLANES = [
    { file: "nara_lighthouse_1928_18-AA-89-27.jpg", siteId: "lighthouse", kind: "aerial", look: 338, altM: 52, tilt: 42 },
    { file: "dvids_1968_eroded_cliffs.jpg", siteId: "lighthouse", kind: "aerial", look: 125, altM: 56, tilt: 40 },
    { file: "dvids_2023_aerial_revetment.jpg", siteId: "lighthouse", kind: "aerial", look: 125, altM: 64, tilt: 58 },
    { file: "commons_ditch_plains_1883_association-cobble-bluff.jpg", siteId: "ditch_plains", kind: "ground", look: 168, altM: 8, tilt: 0 },
    { file: "loc_ditch_plains_1955_beach-width-bluffs.jpg", siteId: "ditch_plains", kind: "ground", look: 112, altM: 8, tilt: 0 },
    { file: "usgs_2012_ditch.jpg", siteId: "ditch_plains", kind: "oblique", look: 180, altM: 58, tilt: 38 },
    { file: "usgs_ds858_2012_1105_134804d.jpg", siteId: "ocean_beaches", kind: "oblique", look: 180, altM: 58, tilt: 38 },
    { file: "commons_ocean_beaches_2026_downtown-aerial.jpg", siteId: "ocean_beaches", kind: "aerial", look: 180, altM: 52, tilt: 58, lat: 41.035025, lng: -71.9478 },
    { file: "commons_soundview_2006_culloden-point-bluff.jpg", siteId: "soundview", kind: "ground", look: 270, altM: 8, tilt: 0 },
    { file: "commons_soundview_2022_soundview-shore.jpg", siteId: "soundview", kind: "ground", look: 0, altM: 8, tilt: 0 },
    { file: "commons_harbor_jetties_2017_south-jetty.jpg", siteId: "harbor_jetties", kind: "ground", look: 8, altM: 8, tilt: 0 },
    { file: "commons_harbor_jetties_2021_lake-montauk-inlet.jpg", siteId: "harbor_jetties", kind: "aerial", look: 180, altM: 52, tilt: 48 }
  ];

  /* Hard allowlist. JSON may tune hang numbers; it cannot add extras. */
  var YEAR_WORLDS = [
    { file: "loc_1871_montauk_light.jpg", siteId: "lighthouse", kind: "ground", mode: "C", look: 125, altM: 8, tilt: 0 },
    { file: "commons_ditch_plains_1883_association-cobble-bluff.jpg", siteId: "ditch_plains", kind: "ground", mode: "C", look: 168, altM: 8, tilt: 0 },
    { file: "loc_1900_ditch_plain_lss.jpg", siteId: "ditch_plains", kind: "ground", mode: "C", look: 168, altM: 8, tilt: 0 },
    { file: "loc_1919_montauk_point_light.jpg", siteId: "lighthouse", kind: "ground", mode: "C", look: 125, altM: 8, tilt: 0 },
    { file: "nara_lighthouse_1928_18-AA-89-27.jpg", siteId: "lighthouse", kind: "aerial", mode: "C", look: 338, altM: 52, tilt: 42 },
    { file: "nara_lighthouse_1937_18-AA-89-24.jpg", siteId: "lighthouse", kind: "aerial", mode: "C", look: 125, altM: 48, tilt: 36 },
    { file: "usace_1938_fort_pond.jpg", siteId: "harbor_jetties", kind: "drape", mode: "B", look: 180, altM: 16, tilt: 82 },
    { file: "usace_1938_lake_montauk.jpg", siteId: "harbor_jetties", kind: "drape", mode: "B", look: 8, altM: 16, tilt: 82 },
    { file: "usace_1938_montauk_beach.jpg", siteId: "ocean_beaches", kind: "drape", mode: "B", look: 180, altM: 16, tilt: 82 },
    { file: "usace_1938_montauk_point.jpg", siteId: "lighthouse", kind: "drape", mode: "B", look: 125, altM: 16, tilt: 82 },
    { file: "usace_1941_fort_pond_bay.jpg", siteId: "soundview", kind: "drape", mode: "B", look: 0, altM: 16, tilt: 82 },
    { file: "usace_1941_lake_montauk.jpg", siteId: "harbor_jetties", kind: "drape", mode: "B", look: 8, altM: 16, tilt: 82 },
    { file: "usace_1941_montauk_park.jpg", siteId: "lighthouse", kind: "drape", mode: "B", look: 125, altM: 16, tilt: 82 },
    { file: "usace_1941_montauk_pt.jpg", siteId: "lighthouse", kind: "drape", mode: "B", look: 125, altM: 16, tilt: 82 },
    { file: "loc_ditch_plains_1955_beach-width-bluffs.jpg", siteId: "ditch_plains", kind: "ground", mode: "C", look: 112, altM: 8, tilt: 0 },
    { file: "usace_1962_camp_hero.jpg", siteId: "lighthouse", kind: "drape", mode: "B", look: 125, altM: 16, tilt: 82 },
    { file: "usace_1962_ditch_plains_055.jpg", siteId: "ditch_plains", kind: "drape", mode: "B", look: 168, altM: 16, tilt: 82 },
    { file: "usace_1962_ditch_plains_057.jpg", siteId: "ditch_plains", kind: "drape", mode: "B", look: 168, altM: 16, tilt: 82 },
    { file: "usace_1962_fort_pond.jpg", siteId: "harbor_jetties", kind: "drape", mode: "B", look: 180, altM: 16, tilt: 82 },
    { file: "usace_1962_lake_montauk.jpg", siteId: "harbor_jetties", kind: "drape", mode: "B", look: 8, altM: 16, tilt: 82 },
    { file: "usace_1962_montauk_beach_051.jpg", siteId: "ocean_beaches", kind: "drape", mode: "B", look: 180, altM: 16, tilt: 82 },
    { file: "usace_1962_montauk_point.jpg", siteId: "lighthouse", kind: "drape", mode: "B", look: 125, altM: 16, tilt: 82 },
    { file: "soundview_suffolk_1962_northshore.jpg", siteId: "soundview", kind: "drape", mode: "B", look: 0, altM: 16, tilt: 82 },
    { file: "dvids_1968_eroded_cliffs.jpg", siteId: "lighthouse", kind: "aerial", mode: "C", look: 125, altM: 56, tilt: 40 },
    { file: "1976-harbor-wide.jpg", siteId: "soundview", kind: "aerial", mode: "B", look: 0, altM: 48, tilt: 52 },
    { file: "1976-harbor-jetties.jpg", siteId: "harbor_jetties", kind: "aerial", mode: "B", look: 8, altM: 48, tilt: 50 },
    { file: "soundview_suffolk_1978_northshore.jpg", siteId: "soundview", kind: "drape", mode: "B", look: 0, altM: 16, tilt: 82 },
    { file: "1984-harbor.jpg", siteId: "harbor_jetties", kind: "aerial", mode: "B", look: 8, altM: 48, tilt: 50 },
    { file: "soundview_suffolk_1984_northshore.jpg", siteId: "soundview", kind: "drape", mode: "B", look: 0, altM: 16, tilt: 82 },
    { file: "commons_uscg_1997_montauk_light.jpg", siteId: "lighthouse", kind: "ground", mode: "C", look: 125, altM: 8, tilt: 0 },
    { file: "commons_soundview_2006_culloden-point-bluff.jpg", siteId: "soundview", kind: "ground", mode: "C", look: 270, altM: 8, tilt: 0 },
    { file: "commons_2006_montauk_point_light.jpg", siteId: "lighthouse", kind: "ground", mode: "C", look: 125, altM: 8, tilt: 0 },
    { file: "usgs_2012_ditch.jpg", siteId: "ditch_plains", kind: "oblique", mode: "B", look: 180, altM: 58, tilt: 38 },
    { file: "usgs_ds858_2012_1105_134804d.jpg", siteId: "ocean_beaches", kind: "oblique", mode: "B", look: 180, altM: 58, tilt: 38 },
    { file: "usgs_2012_point.jpg", siteId: "lighthouse", kind: "oblique", mode: "B", look: 125, altM: 58, tilt: 38 },
    { file: "usgs_2012_camp_hero.jpg", siteId: "lighthouse", kind: "oblique", mode: "B", look: 180, altM: 58, tilt: 38 },
    { file: "usgs_ds958_2014_ditch_plains.jpg", siteId: "ditch_plains", kind: "oblique", mode: "B", look: 180, altM: 56, tilt: 38 },
    { file: "usgs_ds958_2014_ocean_beaches.jpg", siteId: "ocean_beaches", kind: "oblique", mode: "B", look: 180, altM: 56, tilt: 38 },
    { file: "usgs_ds958_2014_lighthouse.jpg", siteId: "lighthouse", kind: "oblique", mode: "B", look: 125, altM: 56, tilt: 38 },
    { file: "usgs_ds995_2015_1008_171048d.jpg", siteId: "ditch_plains", kind: "oblique", mode: "B", look: 180, altM: 56, tilt: 38 },
    { file: "usgs_ds995_2015_1008_170945d.jpg", siteId: "ocean_beaches", kind: "oblique", mode: "B", look: 180, altM: 56, tilt: 38 },
    { file: "usgs_ds1030_2016_ditch_plains.jpg", siteId: "ditch_plains", kind: "oblique", mode: "B", look: 180, altM: 56, tilt: 38 },
    { file: "usgs_ds1030_2016_ocean_beaches.jpg", siteId: "ocean_beaches", kind: "oblique", mode: "B", look: 180, altM: 56, tilt: 38 },
    { file: "usgs_ds1030_2016_lighthouse.jpg", siteId: "lighthouse", kind: "oblique", mode: "B", look: 125, altM: 56, tilt: 38 },
    { file: "commons_harbor_jetties_2017_south-jetty.jpg", siteId: "harbor_jetties", kind: "ground", mode: "A", look: 8, altM: 8, tilt: 0 },
    { file: "commons_harbor_jetties_2021_lake-montauk-inlet.jpg", siteId: "harbor_jetties", kind: "aerial", mode: "A", look: 180, altM: 52, tilt: 48 },
    { file: "commons_soundview_2022_soundview-shore.jpg", siteId: "soundview", kind: "ground", mode: "A", look: 0, altM: 8, tilt: 0 },
    { file: "dvids_2023_aerial_revetment.jpg", siteId: "lighthouse", kind: "aerial", mode: "A", look: 125, altM: 64, tilt: 58 },
    { file: "commons_ocean_beaches_2026_downtown-aerial.jpg", siteId: "ocean_beaches", kind: "aerial", mode: "C", look: 180, altM: 52, tilt: 58, lat: 41.035025, lng: -71.9478 }
  ];

  var BLOCKED_FILES = {
    "usgs_2012_beach.jpg": 1,
    "usace_1941_hither_hills_l20_5.jpg": 1,
    "loc_ocean_beaches_1919_hither_hills.jpg": 1,
    "dvids_lighthouse_1968_eroded_cliffs.jpg": 1,
    "library_1909_great_pond_moran.jpg": 1,
    "commons_1909_great_pond.jpg": 1,
    "commons_logan_soundview.jpg": 1,
    "usgs_ds958_2014_camp_hero.jpg": 1,
    "usace_1962_montauk_beach.jpg": 1
  };

  var api = {
    init: init,
    show: show,
    hide: hide,
    resize: resize,
    flyToSite: flyToSite,
    setYear: setYear,
    playPath: playPath,
    overview: overview,
    isVisible: function () { return visible; },
    photoCount: function () { return cards.length; },
    sliderYears: sliderYears,
    yearLabel: yearLabel,
    modeForYear: modeForYear,
    hwlStatus: hwlStatus
  };

  var opts = {};
  var cfg = null;
  var imageryDoc = null;
  var sites = [];
  var map = null;
  var ready = false;
  var visible = false;
  var year = 2016;
  var cards = [];
  var sitePins = [];
  var pathToken = 0;
  var pathPlaying = false;
  var orbit = { on: false, lastX: 0, lastY: 0, pointerId: null };
  var selectedId = null;
  var pendingFly = null;
  var terrainErrors = 0;
  var planeLayer = null;
  var hwlDoc = null;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function basename(p) {
    return String(p || "").split("/").pop();
  }

  function destPoint(lat, lng, bearingDeg, meters) {
    var R = 6371000;
    var d = meters / R;
    var br = bearingDeg * Math.PI / 180;
    var p1 = lat * Math.PI / 180;
    var l1 = lng * Math.PI / 180;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
    var l2 = l1 + Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2)
    );
    return { lat: p2 * 180 / Math.PI, lng: ((l2 * 180 / Math.PI + 540) % 360) - 180 };
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function tryFetch(url) {
    try {
      var res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function findSitePhoto(siteList, file) {
    var name = basename(file);
    var i, j, site, photos;
    for (i = 0; i < siteList.length; i++) {
      site = siteList[i];
      photos = site.photos || [];
      for (j = 0; j < photos.length; j++) {
        if (photos[j] && photos[j].src && basename(photos[j].src) === name) {
          return { site: site, photo: photos[j] };
        }
      }
    }
    return null;
  }

  function isBlockedSrc(src) {
    var name = basename(src);
    if (!name) return true;
    if (BLOCKED_FILES[name]) return true;
    if (/ceha/i.test(src) || /ceha/i.test(name)) return true;
    if (/moran/i.test(name)) return true;
    if (/great_pond/i.test(name)) return true;
    if (/dvids_lighthouse_1968/.test(name)) return true;
    return false;
  }

  function jsonPlaneByFile() {
    var out = {};
    var planes = (cfg && cfg.planes) || [];
    planes.forEach(function (spec) {
      var name = basename(spec && spec.file);
      if (!name || isBlockedSrc(spec.file)) return;
      out[name] = spec;
    });
    return out;
  }

  function collectCards(siteList) {
    var pins = (cfg && cfg.pins) || {};
    var extras = jsonPlaneByFile();
    var out = [];
    YEAR_WORLDS.forEach(function (locked) {
      if (isBlockedSrc(locked.file)) return;
      var spec = extras[locked.file] || {};
      var found = findSitePhoto(siteList, locked.file);
      if (!found || !found.photo) return;
      if (isBlockedSrc(found.photo.src)) return;
      if (found.photo.kind === "ceha") return;
      if (found.photo.year == null || found.photo.year === "") return;
      var yearNum = Number(found.photo.year);
      if (!isFinite(yearNum)) return;
      if (spec.siteId && spec.siteId !== locked.siteId) return;
      if (PIN_SITES.indexOf(locked.siteId) < 0) return;
      var pin = pins[locked.siteId] || {};
      var kind = locked.kind;
      var look = locked.look != null ? locked.look : (WATER_LOOK[locked.siteId] != null ? WATER_LOOK[locked.siteId] : 180);
      if (spec.look != null && isFinite(Number(spec.look))) look = Number(spec.look);
      var altM = locked.altM;
      if (spec.altM != null && isFinite(Number(spec.altM))) altM = Number(spec.altM);
      var tilt = locked.tilt;
      if (spec.tilt != null && isFinite(Number(spec.tilt))) tilt = Number(spec.tilt);
      if (kind === "ground") {
        tilt = 0;
        if (!(altM > 0) || altM > 14) altM = 8;
      } else if (kind === "drape") {
        if (!(altM > 0) || altM > 28) altM = 16;
        if (!(tilt >= 70)) tilt = 82;
      } else if (kind === "oblique") {
        if (!(altM >= 40)) altM = 56;
      } else if (!(altM >= 40)) {
        altM = 52;
      }
      var captionGps = locked.file === CAPTION_GPS;
      var lat = pin.lat != null ? pin.lat : (found.site && found.site.lat);
      var lng = pin.lng != null ? pin.lng : (found.site && found.site.lng);
      if (captionGps) {
        if (locked.lat != null && locked.lng != null) {
          lat = locked.lat;
          lng = locked.lng;
        } else if (spec.lat != null && spec.lng != null) {
          lat = Number(spec.lat);
          lng = Number(spec.lng);
        }
      }
      if (lat == null || lng == null || !isFinite(Number(lat)) || !isFinite(Number(lng))) return;
      var host = siteList.find(function (s) { return s.id === locked.siteId; }) || found.site;
      out.push({
        spec: spec,
        siteId: locked.siteId,
        site: host,
        photo: found.photo,
        year: yearNum,
        lat: Number(lat),
        lng: Number(lng),
        kind: kind,
        mode: locked.mode || "B",
        altM: altM,
        look: look,
        tilt: tilt,
        gps: captionGps
      });
    });
    return out;
  }

  function waybackByYear() {
    var by = {};
    var list = (imageryDoc && (imageryDoc.wayback || imageryDoc.releases)) || [];
    list.forEach(function (r) {
      if (!r || r.year == null || r.releaseNum == null) return;
      by[Number(r.year)] = r;
    });
    return by;
  }

  function imagerySpecForYear(y) {
    y = Number(y);
    if (!isFinite(y) || NO_MODE_A[y]) return null;
    if (NYS_YEARS.indexOf(y) >= 0) {
      return {
        id: "nysdop-" + y,
        name: "NYSDOP " + y,
        tiles: [NYS_TMPL.replace("{YEAR}", String(y))],
        attribution: "NYS ITS Geospatial Services / NYSDOP " + y,
        maxzoom: 19
      };
    }
    if (y >= 2014 && y <= 2025) {
      var wb = waybackByYear()[y];
      if (!wb || wb.releaseNum == null) return null;
      return {
        id: "wayback-" + y,
        name: "Esri Wayback " + (wb.date || y),
        tiles: [WAYBACK_TMPL.replace("{releaseNum}", String(wb.releaseNum))],
        attribution: "Esri World Imagery Wayback " + (wb.date || y),
        maxzoom: 19
      };
    }
    return null;
  }

  function modeForYear(y) {
    y = Number(y);
    if (y === 1996) return "D";
    if (imagerySpecForYear(y)) return "A";
    if (cards.some(function (rec) { return rec.year === y && rec.mode === "B"; })) return "B";
    if (cards.some(function (rec) { return rec.year === y; })) return "C";
    return "D";
  }

  function hwlStatus(y) {
    y = Number(y);
    if (HWL_ANCHORS.indexOf(y) >= 0) return "surveyed";
    if (HWL_DECADES.indexOf(y) >= 0) return y > 2000 ? "held" : "modeled";
    return null;
  }

  function sliderYears() {
    var set = {};
    NYS_YEARS.forEach(function (y) { set[y] = 1; });
    Object.keys(waybackByYear()).forEach(function (y) {
      y = Number(y);
      if (y >= 2014 && y <= 2025 && y !== 2018 && !NO_MODE_A[y]) set[y] = 1;
    });
    cards.forEach(function (rec) { if (rec.year != null) set[rec.year] = 1; });
    HWL_ANCHORS.forEach(function (y) { set[y] = 1; });
    HWL_DECADES.forEach(function (y) { set[y] = 1; });
    set[1996] = 1;
    set[2014] = 1;
    set[2026] = 1;
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function yearLabel() {
    var spec = imagerySpecForYear(year);
    var mode = modeForYear(year);
    var hwl = hwlStatus(year);
    if (year === 1996) return "Deed only · relief 2014";
    if (year === 2014) return "2014 NOAA NGS DEM · not a HWL · " + (spec ? spec.name : "relief 2014");
    if (hwl === "surveyed") return "USGS surveyed high-water line · relief 2014";
    if (hwl === "modeled") return "Modeled from USGS HWL trend · not a survey";
    if (hwl === "held") return "Held at 2000 USGS HWL · not a survey";
    if (spec) return spec.name + " · relief 2014";
    if (mode === "B") return "Local frames only · relief 2014";
    if (mode === "C") return "Walk-into still · relief 2014";
    return "No dated ortho · relief 2014";
  }

  function cardVisible(rec) {
    if (!rec || rec.year == null || !isFinite(rec.year)) return false;
    return rec.year === year;
  }

  function yearCaption() {
    if (year >= 1960 && year <= 1979) {
      return "Soundview: Van Scoyoc recalled 100–200 ft of beach in the 1960s–70s; that sand is gone. Caption only — not a modeled width. No Soundview HWL this year.";
    }
    if (year === 2025 || year === 2026) {
      return "Ditch: 20,000 cy / +16 ft NAVD (Town 2025–26). Caption only — not a modeled volume.";
    }
    return "";
  }

  function updateChrome() {
    var shown = cards.filter(cardVisible);
    var mode = modeForYear(year);
    var hint = $("#coast3d-hint");
    var count = $("#coast3d-count");
    var cap = $("#coast3d-caption");
    var spec = imagerySpecForYear(year);
    var hwl = hwlStatus(year);
    if (hint) {
      if (year === 1996) {
        hint.textContent = "1996 is the lighthouse deed — tower unmoved. No 1996 ortho. " + RELIEF_NOTE + ".";
      } else if (hwl === "surveyed") {
        hint.textContent = HWL_HINT_SURVEY + " " + RELIEF_NOTE + ".";
      } else if (hwl === "held") {
        hint.textContent = HWL_HINT_HELD;
      } else if (hwl === "modeled") {
        hint.textContent = HWL_HINT_MODEL;
      } else if (year === 2014) {
        hint.textContent = "2014 is the measured NOAA NGS DEM year — not a high-water line. " + RELIEF_NOTE + ".";
      } else if (mode === "A") {
        hint.textContent = (spec ? spec.name : year) + " peninsula. " + RELIEF_NOTE + ". Tap a still for credit.";
      } else if (mode === "B") {
        hint.textContent = year + " local drapes at the reaches they show — not a peninsula mosaic. " + RELIEF_NOTE + ".";
      } else if (mode === "C") {
        hint.textContent = year + " walk-into still at the pin. No peninsula reconstruct. " + RELIEF_NOTE + ".";
      } else {
        hint.textContent = "No dated ortho for " + year + ". Uncovered land is 2014 hillshade, never today's satellite.";
      }
    }
    if (count) {
      var coastBits = [];
      if (hwl === "surveyed") coastBits.push("USGS surveyed HWL · south/Point");
      if (hwl === "modeled") coastBits.push("Modeled south/Point waterline");
      if (hwl === "held") coastBits.push("Held 2000 HWL · south/Point");
      if (HWL_NORTH_YEARS[year]) coastBits.push("north HWL only this year");
      if (year === 1871) coastBits.push("1871 walk-into still");
      if (!shown.length) {
        coastBits.push(mode === "A" ? "dated ortho" : "no still");
        count.textContent = coastBits.join(" · ");
      } else if (year === 1962) {
        count.textContent = "1962 patchwork · " + shown.length + " frames at the five sites · not a seamless 1962 peninsula";
      } else {
        count.textContent = (coastBits.length ? coastBits.join(" · ") + " · " : "") +
          shown.length + " still" + (shown.length === 1 ? "" : "s") + " from " + year + " only";
      }
    }
    if (cap) {
      var text = yearCaption();
      cap.hidden = !text;
      cap.textContent = text;
    }
    var view = $("#coast3d-view");
    if (view) {
      view.classList.toggle("is-walkin", mode === "C");
      view.classList.toggle("is-drape-only", mode === "B" && !spec);
      view.classList.toggle("is-mode-a", !!spec);
      view.classList.toggle("is-hwl", !!hwl);
    }
  }

  function updateCardStates() {
    var shown = 0;
    cards.forEach(function (rec) {
      var on = cardVisible(rec);
      if (on) shown += 1;
      if (rec.mesh) rec.mesh.visible = on;
      if (rec.group) rec.group.visible = on;
    });
    updateChrome();
    if (map) map.triggerRepaint();
    return shown;
  }

  function lookFor(site) {
    var look = (cfg && cfg.look && cfg.look[site.id]) || {};
    var pin = (cfg && cfg.pins && cfg.pins[site.id]) || {};
    return {
      bearing: look.bearing != null ? look.bearing : (pin.look != null ? pin.look : (WATER_LOOK[site.id] != null ? WATER_LOOK[site.id] : 180)),
      pitch: look.pitch != null ? look.pitch : 60,
      zoom: look.zoom != null ? look.zoom : 15.4,
      inlandM: look.inlandM != null ? look.inlandM : 320
    };
  }

  function walkInRec(site) {
    if (!site) return null;
    return cards.filter(function (rec) {
      return rec.siteId === site.id && rec.year === year && rec.mode === "C";
    })[0] || null;
  }

  function cameraForSite(site) {
    var look = lookFor(site);
    var bearing = look.bearing;
    var pitch = look.pitch;
    var zoom = look.zoom;
    var inlandM = look.inlandM;
    var rec = walkInRec(site);
    if (rec) {
      if (rec.look != null) bearing = rec.look;
      if (rec.kind === "ground") {
        inlandM = 108;
        zoom = 16.4;
        pitch = 70;
      } else {
        inlandM = 210;
        zoom = 15.85;
        pitch = 64;
      }
    }
    var inlandBr = (bearing + 180) % 360;
    var cam = destPoint(site.lat, site.lng, inlandBr, inlandM);
    return {
      center: [cam.lng, cam.lat],
      zoom: zoom,
      pitch: pitch,
      bearing: bearing,
      duration: 2200,
      essential: true
    };
  }

  function inlandCamera(fromSite, toSite, northM) {
    var lat = (fromSite.lat + toSite.lat) / 2;
    var lng = (fromSite.lng + toSite.lng) / 2;
    var p = destPoint(lat, lng, 0, northM || 900);
    return {
      center: [p.lng, p.lat],
      zoom: 13.7,
      pitch: 55,
      bearing: 180,
      duration: 2000,
      essential: true
    };
  }

  function overviewCenter() {
    var pins = (cfg && cfg.pins) || {};
    var ids = Object.keys(pins);
    if (!ids.length) return [-71.92, 41.05];
    var lat = 0, lng = 0;
    ids.forEach(function (id) { lat += pins[id].lat; lng += pins[id].lng; });
    return [lng / ids.length, lat / ids.length];
  }

  function demSource(terrainSrc, withAttr) {
    var src = {
      type: "raster-dem",
      tiles: terrainSrc.tiles,
      encoding: terrainSrc.encoding || "terrarium",
      tileSize: terrainSrc.tileSize || 256,
      minzoom: terrainSrc.minzoom || 0,
      maxzoom: terrainSrc.maxzoom || 15
    };
    if (withAttr && terrainSrc.attribution) src.attribution = terrainSrc.attribution;
    if (terrainSrc.bounds) src.bounds = terrainSrc.bounds;
    return src;
  }

  function styleSpec(terrainSrc) {
    return {
      version: 8,
      sources: {
        terrain: demSource(terrainSrc, true),
        hillshadeDem: demSource(terrainSrc, false)
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#08141d" } },
        {
          id: "hills",
          type: "hillshade",
          source: "hillshadeDem",
          paint: {
            "hillshade-exaggeration": 0.52,
            "hillshade-shadow-color": "#101820",
            "hillshade-highlight-color": "#8a9aa4",
            "hillshade-illumination-direction": 315
          }
        }
      ],
      terrain: { source: "terrain", exaggeration: (cfg.terrain && cfg.terrain.exaggeration) || 2.6 },
      sky: {
        "sky-color": "#0a1a28",
        "horizon-color": "#6d8290",
        "fog-color": "#4e6270",
        "sky-horizon-blend": 0.55,
        "horizon-fog-blend": 0.7,
        "fog-ground-blend": 0.42,
        "atmosphere-blend": 0.4
      }
    };
  }

  function applyYearImagery() {
    if (!map || !ready) return;
    var spec = imagerySpecForYear(year);
    if (map.getLayer("imagery")) map.removeLayer("imagery");
    if (map.getSource("imagery")) map.removeSource("imagery");
    if (spec) {
      map.addSource("imagery", {
        type: "raster",
        tiles: spec.tiles,
        tileSize: 256,
        attribution: spec.attribution + " · " + RELIEF_NOTE,
        maxzoom: spec.maxzoom || 19
      });
      map.addLayer({
        id: "imagery",
        type: "raster",
        source: "imagery",
        paint: { "raster-opacity": 1, "raster-fade-duration": 0 }
      }, map.getLayer("hills") ? "hills" : undefined);
    }
    if (map.getLayer("hills")) {
      var tint = eraTint(spec);
      map.setPaintProperty("hills", "hillshade-exaggeration", tint.exag);
      map.setPaintProperty("hills", "hillshade-highlight-color", tint.highlight);
      map.setPaintProperty("hills", "hillshade-shadow-color", tint.shadow);
    }
    applyHwlLayers();
  }

  function eraTint(spec) {
    if (spec) return { exag: 0.3, highlight: "#f3ead6", shadow: "#101820" };
    if (year <= 1900) return { exag: 0.62, highlight: "#d4b896", shadow: "#2a1e14" };
    if (year <= 1945) return { exag: 0.58, highlight: "#b7c2c8", shadow: "#182028" };
    if (year <= 1975) return { exag: 0.56, highlight: "#c8c4a4", shadow: "#1c2418" };
    if (year <= 2000) return { exag: 0.54, highlight: "#c0c8b8", shadow: "#182018" };
    return { exag: 0.58, highlight: "#7d8d96", shadow: "#101820" };
  }

  function emptyFC() {
    return { type: "FeatureCollection", features: [] };
  }

  function hwlFeatures(kind, reach) {
    if (!hwlDoc || !hwlDoc.features) return [];
    return hwlDoc.features.filter(function (f) {
      var p = f.properties || {};
      if (p.year !== year || p.kind !== kind) return false;
      if (reach && p.reach !== reach) return false;
      if (kind === "hwl" && p.reach === "north") return false;
      return true;
    });
  }

  function addHwlLayers() {
    if (!map || map.getSource("hwl-water")) return;
    ["hwl-water", "hwl-lost", "hwl-gained", "hwl-line", "hwl-north"].forEach(function (id) {
      map.addSource(id, { type: "geojson", data: emptyFC() });
    });
    map.addLayer({
      id: "hwl-water",
      type: "fill",
      source: "hwl-water",
      paint: { "fill-color": "#0b3d55", "fill-opacity": 0.46 }
    });
    map.addLayer({
      id: "hwl-lost",
      type: "fill",
      source: "hwl-lost",
      paint: { "fill-color": "#c23b22", "fill-opacity": 0.34 }
    });
    map.addLayer({
      id: "hwl-gained",
      type: "fill",
      source: "hwl-gained",
      paint: { "fill-color": "#3d9a86", "fill-opacity": 0.3 }
    });
    map.addLayer({
      id: "hwl-beach",
      type: "line",
      source: "hwl-line",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#e2c49a",
        "line-width": 7.5,
        "line-opacity": 0.55,
        "line-blur": 0.6
      }
    });
    map.addLayer({
      id: "hwl-line",
      type: "line",
      source: "hwl-line",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#f6efe2",
        "line-width": 2.4,
        "line-opacity": 0.96
      }
    });
    map.addLayer({
      id: "hwl-north",
      type: "line",
      source: "hwl-north",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#7ec8ff",
        "line-width": 2.2,
        "line-dasharray": [1.2, 1.4],
        "line-opacity": 0.95
      }
    });
  }

  function applyHwlLayers() {
    if (!map || !ready || !map.getSource("hwl-water")) return;
    var hwl = hwlStatus(year);
    var show = !!hwl;
    var north = show && HWL_NORTH_YEARS[year] ? hwlDoc && hwlDoc.features.filter(function (f) {
      var p = f.properties || {};
      return p.year === year && p.kind === "hwl" && p.reach === "north";
    }) : [];
    map.getSource("hwl-water").setData({ type: "FeatureCollection", features: show ? hwlFeatures("water") : [] });
    map.getSource("hwl-lost").setData({ type: "FeatureCollection", features: show ? hwlFeatures("lost") : [] });
    map.getSource("hwl-gained").setData({ type: "FeatureCollection", features: show ? hwlFeatures("gained") : [] });
    map.getSource("hwl-line").setData({ type: "FeatureCollection", features: show ? hwlFeatures("hwl") : [] });
    map.getSource("hwl-north").setData({ type: "FeatureCollection", features: north || [] });
    if (map) map.triggerRepaint();
  }

  function makePinEl(site, i) {
    var wrap = document.createElement("button");
    wrap.type = "button";
    wrap.className = "coast3d-pin" + (site.shore === "north" ? " north" : site.shore === "east" ? " east" : "");
    wrap.dataset.site = site.id;
    wrap.innerHTML = "<i><span>" + (i + 1) + "</span></i><em>" + escapeHtml(site.shortName || site.name) + "</em>";
    wrap.setAttribute("aria-label", site.shortName || site.name);
    wrap.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    wrap.addEventListener("click", function (e) {
      e.stopPropagation();
      selectedId = site.id;
      flyToSite(site);
      if (opts.onSite) opts.onSite(site.id, { fly: false, sheet: false });
      var latest = cards
        .filter(function (rec) { return rec.siteId === site.id && cardVisible(rec); })
        .sort(function (a, b) { return (b.year || 0) - (a.year || 0); })[0];
      if (latest) openCard(latest);
    });
    return wrap;
  }

  function addSitePins() {
    var pins = (cfg && cfg.pins) || {};
    PIN_SITES.forEach(function (id, i) {
      var site = sites.find(function (s) { return s.id === id; });
      var pin = pins[id];
      if (!site || !pin) return;
      var el = makePinEl(site, i);
      var marker = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport"
      }).setLngLat([pin.lng, pin.lat]).addTo(map);
      sitePins.push({ site: site, el: el, marker: marker });
    });
  }

  function loadPlaneTexture(rec, done) {
    var img = new Image();
    img.onload = function () {
      var tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
      tex.needsUpdate = true;
      done(tex);
    };
    img.onerror = function () { done(null); };
    img.src = rec.photo.src;
  }

  function placeGroup(group, rec) {
    var mc = maplibregl.MercatorCoordinate.fromLngLat([rec.lng, rec.lat], rec.altM);
    var s = mc.meterInMercatorCoordinateUnits();
    var T = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z);
    var S = new THREE.Matrix4().makeScale(s, -s, s);
    var Rx = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    var Ry = new THREE.Matrix4().makeRotationY(((rec.look || 0) - 180) * Math.PI / 180);
    var Rtilt = new THREE.Matrix4().makeRotationX((rec.tilt || 0) * Math.PI / 180);
    group.matrixAutoUpdate = false;
    group.matrix.copy(T).multiply(S).multiply(Rx).multiply(Ry).multiply(Rtilt);
  }

  function planeSize(rec) {
    if (rec.kind === "drape") return { w: 420, h: 320 };
    if (rec.kind === "oblique") return { w: 260, h: 170 };
    if (rec.kind === "aerial") {
      return rec.mode === "C" ? { w: 230, h: 155 } : { w: 280, h: 180 };
    }
    return rec.mode === "C" ? { w: 220, h: 145 } : { w: 130, h: 86 };
  }

  function addPlaneMesh(scene, rec) {
    var size = planeSize(rec);
    var geom = new THREE.PlaneGeometry(size.w, size.h);
    var mat = new THREE.MeshBasicMaterial({
      color: 0x163044,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.98,
      depthWrite: true
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.userData.rec = rec;
    var group = new THREE.Group();
    group.add(mesh);
    placeGroup(group, rec);
    scene.add(group);
    rec.mesh = mesh;
    rec.group = group;
    loadPlaneTexture(rec, function (tex) {
      if (!tex) return;
      mesh.material.map = tex;
      mesh.material.color.set(0xffffff);
      mesh.material.needsUpdate = true;
      if (map) map.triggerRepaint();
    });
  }

  function addPlaneLayer() {
    if (typeof THREE === "undefined" || !map) return;
    planeLayer = {
      id: "photo-planes",
      type: "custom",
      renderingMode: "3d",
      onAdd: function (mapInst, gl) {
        this.map = mapInst;
        this.camera = new THREE.PerspectiveCamera();
        this.scene = new THREE.Scene();
        this.raycaster = new THREE.Raycaster();
        this.renderer = new THREE.WebGLRenderer({
          canvas: mapInst.getCanvas(),
          context: gl,
          antialias: true
        });
        this.renderer.autoClear = false;
        cards.forEach(function (rec) { addPlaneMesh(this.scene, rec); }, this);
        updateCardStates();
      },
      render: function (gl, args) {
        var raw = args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix
          ? args.defaultProjectionData.mainMatrix
          : args;
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(raw);
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
        this.camera.matrixWorld.identity();
        this.camera.matrixWorldInverse.identity();
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        this.map.triggerRepaint();
      }
    };
    map.addLayer(planeLayer);
  }

  function metersBetween(aLat, aLng, bLat, bLng) {
    var R = 6371000;
    var dLat = (bLat - aLat) * Math.PI / 180;
    var dLng = (bLng - aLng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function hitPlanes(point) {
    if (!map) return null;
    if (planeLayer && planeLayer.raycaster && planeLayer.camera) {
      var canvas = map.getCanvas();
      var ndc = new THREE.Vector2(
        (point.x / canvas.clientWidth) * 2 - 1,
        -(point.y / canvas.clientHeight) * 2 + 1
      );
      planeLayer.raycaster.setFromCamera(ndc, planeLayer.camera);
      var hits = planeLayer.raycaster.intersectObjects(planeLayer.scene.children, true);
      var i, rec;
      for (i = 0; i < hits.length; i++) {
        rec = hits[i].object && hits[i].object.userData && hits[i].object.userData.rec;
        if (rec && cardVisible(rec)) return rec;
      }
    }
    var ll = map.unproject(point);
    var best = null;
    var bestD = 1e9;
    cards.forEach(function (rec) {
      if (!cardVisible(rec)) return;
      var d = metersBetween(ll.lat, ll.lng, rec.lat, rec.lng);
      var limit = rec.kind === "drape" ? 220 : rec.kind === "ground" ? 80 : 140;
      if (d <= limit && d < bestD) {
        best = rec;
        bestD = d;
      }
    });
    return best;
  }

  function openCard(rec) {
    if (!rec) return;
    if (PIN_SITES.indexOf(rec.siteId) >= 0) {
      selectedId = rec.siteId;
      if (opts.onSite) opts.onSite(rec.siteId, { fly: false, sheet: false });
    }
    if (opts.onPhoto) opts.onPhoto(rec.photo, rec.site);
  }

  function bindOrbit() {
    var canvas = map.getCanvas();
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest && e.target.closest(".coast3d-pin, .coast3d-chrome")) return;
      var rect = canvas.getBoundingClientRect();
      if (hitPlanes({ x: e.clientX - rect.left, y: e.clientY - rect.top })) return;
      orbit.on = true;
      orbit.pointerId = e.pointerId;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!orbit.on || (orbit.pointerId != null && e.pointerId !== orbit.pointerId)) return;
      var dx = e.clientX - orbit.lastX;
      var dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      map.setBearing(map.getBearing() - dx * 0.32);
      map.setPitch(Math.max(18, Math.min(78, map.getPitch() - dy * 0.22)));
    });
    function endOrbit(e) {
      if (orbit.pointerId != null && e.pointerId !== orbit.pointerId) return;
      orbit.on = false;
      orbit.pointerId = null;
    }
    canvas.addEventListener("pointerup", endOrbit);
    canvas.addEventListener("pointercancel", endOrbit);
  }

  function bindChrome() {
    document.querySelectorAll("[data-coast3d-path]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-coast3d-path");
        if (id === "overview") overview();
        else playPath(id);
      });
    });
  }

  function tryFallbackTerrain() {
    var fb = cfg && cfg.terrain && cfg.terrain.fallback;
    if (!map || !fb || !map.getSource("terrain")) return;
    try {
      map.setTerrain(null);
      if (map.getLayer("hills")) map.removeLayer("hills");
      if (map.getSource("terrain")) map.removeSource("terrain");
      if (map.getSource("hillshadeDem")) map.removeSource("hillshadeDem");
      map.addSource("terrain", {
        type: "raster-dem",
        tiles: fb.tiles,
        encoding: fb.encoding || "terrarium",
        tileSize: fb.tileSize || 256,
        maxzoom: fb.maxzoom || 15,
        attribution: (fb.attribution || "2014 NOAA NGS") + " · " + RELIEF_NOTE
      });
      map.addSource("hillshadeDem", {
        type: "raster-dem",
        tiles: fb.tiles,
        encoding: fb.encoding || "terrarium",
        tileSize: fb.tileSize || 256,
        maxzoom: fb.maxzoom || 15
      });
      map.addLayer({
        id: "hills",
        type: "hillshade",
        source: "hillshadeDem",
        paint: {
          "hillshade-exaggeration": imagerySpecForYear(year) ? 0.3 : 0.58,
          "hillshade-shadow-color": "#101820",
          "hillshade-highlight-color": "#8a9aa4"
        }
      });
      map.setTerrain({ source: "terrain", exaggeration: 2.6 });
      ["hwl-water", "hwl-lost", "hwl-gained", "hwl-beach", "hwl-line", "hwl-north"].forEach(function (id) {
        if (map.getLayer(id)) map.moveLayer(id);
      });
    } catch (e) {
      try { map.setTerrain(null); } catch (err) { /* ignore */ }
    }
  }

  function createMap() {
    var el = $("#coast3d");
    if (!el || typeof maplibregl === "undefined") return;
    var terrain = (cfg.terrain && cfg.terrain.primary) || {
      tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
      encoding: "terrarium",
      tileSize: 512
    };
    var ov = cfg.overview || {};
    map = new maplibregl.Map({
      container: el,
      style: styleSpec(terrain),
      center: overviewCenter(),
      zoom: ov.zoom || 12.35,
      pitch: ov.pitch || 52,
      bearing: ov.bearing || 72,
      maxPitch: 80,
      minZoom: 11,
      maxZoom: 17.5,
      maxBounds: [[-72.00, 41.015], [-71.82, 41.10]],
      attributionControl: true,
      hash: false,
      canvasContextAttributes: { antialias: true }
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.dragPan.disable();
    map.dragRotate.disable();
    map.touchPitch.enable();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(function () { resize(); }).observe(el);
    }
    map.on("error", function (e) {
      var id = e && e.sourceId;
      if (id !== "terrain" && id !== "hillshadeDem") return;
      terrainErrors += 1;
      if (terrainErrors === 12) tryFallbackTerrain();
    });
    map.on("load", function () {
      ready = true;
      addHwlLayers();
      applyYearImagery();
      addSitePins();
      addPlaneLayer();
      bindOrbit();
      try { map.resize(); } catch (e) { /* ignore */ }
      if (pendingFly) {
        var site = pendingFly;
        pendingFly = null;
        flyToSite(site);
      }
      if (opts.onReady) opts.onReady();
    });
    map.on("click", function (e) {
      var hit = hitPlanes(e.point);
      if (hit) openCard(hit);
    });
    map.on("move", function () {
      if (!visible) return;
      var c = map.getCenter();
      var ll = $("#cursor-ll");
      if (ll) {
        var lat = Math.abs(c.lat).toFixed(4);
        var lng = Math.abs(c.lng).toFixed(4);
        ll.textContent = lat + "°" + (c.lat >= 0 ? "N" : "S") + "  " + lng + "°" + (c.lng >= 0 ? "E" : "W");
      }
    });
  }

  function maybeFlyWalkIn() {
    if (!visible || pathPlaying) return;
    if (modeForYear(year) !== "C") return;
    var rec = cards.filter(function (c) { return c.year === year && c.mode === "C" && PIN_SITES.indexOf(c.siteId) >= 0; })[0];
    if (!rec) return;
    var site = sites.find(function (s) { return s.id === rec.siteId; });
    if (site) flyToSite(site);
  }

  async function init(options) {
    opts = options || {};
    sites = opts.sites || [];
    year = typeof opts.getYear === "function" ? opts.getYear() : (opts.year || year);
    cfg = await tryFetch("data/coast3d.json") || {};
    imageryDoc = opts.imagery || (await tryFetch("data/imagery.json")) || {};
    if (!imageryDoc.wayback) {
      var wbDoc = await tryFetch("data/wayback.json");
      if (wbDoc) imageryDoc.wayback = wbDoc.releases || wbDoc.wayback || [];
    }
    cards = collectCards(sites);
    hwlDoc = await tryFetch("data/usgs_hwl_worlds.geojson");
    bindChrome();
    var fail = $("#coast3d");
    if (typeof maplibregl === "undefined" && fail) {
      fail.innerHTML = "<p class='lede' style='padding:24px'>MapLibre failed to load. The 2D map still works.</p>";
    }
  }

  function show() {
    visible = true;
    var view = $("#coast3d-view");
    if (view) view.hidden = false;
    if (!map) createMap();
    else {
      requestAnimationFrame(function () {
        try { map.resize(); } catch (e) { /* ignore */ }
      });
    }
    applyYearImagery();
    updateCardStates();
  }

  function hide() {
    visible = false;
    pathPlaying = false;
    pathToken += 1;
    var view = $("#coast3d-view");
    if (view) view.hidden = true;
  }

  function resize() {
    if (map && visible) {
      try { map.resize(); } catch (e) { /* ignore */ }
    }
  }

  function flyToSite(site) {
    if (!site || PIN_SITES.indexOf(site.id) < 0) return;
    selectedId = site.id;
    sitePins.forEach(function (p) {
      p.el.classList.toggle("is-on", p.site.id === site.id);
    });
    if (!map || !ready) {
      pendingFly = site;
      return;
    }
    map.easeTo(cameraForSite(site));
  }

  function setYear(y) {
    var next = Number(y);
    var changed = next !== year;
    year = next;
    applyYearImagery();
    var shown = updateCardStates();
    if (changed) maybeFlyWalkIn();
    return shown;
  }

  function overview() {
    pathToken += 1;
    pathPlaying = false;
    selectedId = null;
    sitePins.forEach(function (p) { p.el.classList.remove("is-on"); });
    if (!map) return;
    var ov = cfg.overview || {};
    map.easeTo({
      center: overviewCenter(),
      zoom: ov.zoom || 12.35,
      pitch: ov.pitch || 52,
      bearing: ov.bearing || 72,
      duration: 1800,
      essential: true
    });
  }

  function yearForSites(siteIds) {
    var here = cards.filter(function (rec) { return siteIds.indexOf(rec.siteId) >= 0; });
    if (here.some(function (rec) { return rec.year === year; })) return year;
    var years = [];
    here.forEach(function (rec) {
      if (years.indexOf(rec.year) < 0) years.push(rec.year);
    });
    if (!years.length) return year;
    return years.reduce(function (best, y) {
      return Math.abs(y - year) < Math.abs(best - year) ? y : best;
    });
  }

  function pathSiteIds(path) {
    var ids = [];
    (path.stops || []).forEach(function (stop) {
      if (typeof stop === "string") ids.push(stop);
      else if (stop && stop.siteId) ids.push(stop.siteId);
    });
    return ids;
  }

  async function playPath(id) {
    var paths = (cfg && cfg.paths) || [];
    var path = paths.find(function (p) { return p.id === id; });
    if (!path) return;
    var token = ++pathToken;
    pathPlaying = true;
    var nextYear = yearForSites(pathSiteIds(path));
    if (nextYear !== year) {
      year = nextYear;
      applyYearImagery();
      updateCardStates();
      if (opts.onYear) opts.onYear(nextYear);
    }
    var i, stop, site, fromSite, toSite;
    for (i = 0; i < path.stops.length; i++) {
      if (token !== pathToken) {
        pathPlaying = false;
        return;
      }
      stop = path.stops[i];
      if (typeof stop === "string") stop = { siteId: stop };
      if (stop.via === "inland") {
        fromSite = sites.find(function (s) { return s.id === stop.from; });
        toSite = sites.find(function (s) { return s.id === stop.to; });
        if (map && fromSite && toSite) map.easeTo(inlandCamera(fromSite, toSite, stop.northM));
        await wait(INLAND_DWELL_MS);
        continue;
      }
      site = sites.find(function (s) { return s.id === stop.siteId; });
      if (!site) continue;
      flyToSite(site);
      if (opts.onSite) opts.onSite(site.id, { fly: false, sheet: false });
      await wait(PATH_DWELL_MS);
    }
    if (token === pathToken) pathPlaying = false;
  }

  api._helpers = {
    destPoint: destPoint,
    collectCards: collectCards,
    basename: basename,
    lockedPlanes: LOCKED_PLANES,
    yearWorlds: YEAR_WORLDS,
    isBlockedSrc: isBlockedSrc,
    cardVisible: cardVisible,
    imagerySpecForYear: imagerySpecForYear,
    modeForYear: modeForYear,
    hwlStatus: hwlStatus,
    hwlAnchors: HWL_ANCHORS,
    hwlDecades: HWL_DECADES,
    nysYears: NYS_YEARS,
    noModeA: NO_MODE_A
  };

  global.MontaukCoast3D = api;
})(window);
