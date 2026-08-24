/* 3D coast — year-worlds. Inland relief is always 2014. The carved
   coast (sand terrace / cut / till face / water plane) is what changes.
   Never hang CEHA, Moran, or a gallery dump. */
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
  var HWL_HINT_SURVEY = "USGS surveyed high-water line — 2014 relief is cut at this HWL (sand terrace / lost land / till face). Not a historic DEM.";
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
  var coastMeshes = null;
  var coastGroups = [];
  var waterGroup = null;
  var lastCoastTick = 0;
  var lastCoastYear = null;

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
    if (year === 2014) return "2014 NOAA NGS DEM · not a HWL · carved coast held at 2000";
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
        hint.textContent = (spec ? spec.name : year) + " inland drape. Waterline is the carved 2000-held HWL mesh. " + RELIEF_NOTE + ".";
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
      var dw = ditchTerraceM();
      if (hwl === "surveyed") coastBits.push("USGS surveyed HWL · south/Point");
      if (hwl === "modeled") coastBits.push("Modeled south/Point waterline");
      if (hwl === "held") coastBits.push("Held 2000 HWL · south/Point");
      if (dw != null && hwl) {
        coastBits.push(dw >= 8
          ? "Ditch terrace ~" + Math.round(dw) + " m seaward of 2014"
          : "Ditch terrace gone · land ends at HWL");
      }
      if (HWL_NORTH_YEARS[year]) coastBits.push("north HWL only this year");
      if (year === 1871) coastBits.push("1871 walk-into still");
      if (!shown.length) {
        coastBits.push(mode === "A" ? "dated ortho" : "no still");
        count.textContent = coastBits.join(" · ");
      } else if (year === 1962) {
        count.textContent = (coastBits.length ? coastBits.join(" · ") + " · " : "") +
          "1962 patchwork · " + shown.length + " frames at the five sites · not a seamless 1962 peninsula";
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
      view.classList.toggle("is-era-cyano", !spec && year <= 1900);
      view.classList.toggle("is-era-bw", !spec && year > 1900 && year <= 1965);
      view.classList.toggle("is-era-muted", !spec && year > 1965 && year <= 1995);
      view.classList.toggle("is-era-natural", !!spec || year >= 2000);
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
    var bearing = look.bearing != null ? look.bearing : (pin.look != null ? pin.look : (WATER_LOOK[site.id] != null ? WATER_LOOK[site.id] : 180));
    var pitch = look.pitch != null ? look.pitch : 60;
    var zoom = look.zoom != null ? look.zoom : 15.4;
    var inlandM = look.inlandM != null ? look.inlandM : 100;
    /* Beach look is locked in JS so a stale coast3d.json cannot sit 165–320 m inland. */
    if (site.id === "ditch_plains") {
      bearing = 168;
      pitch = 70;
      zoom = 16.9;
      inlandM = 90;
    } else if (site.id === "lighthouse") {
      if (pitch < 68) pitch = 70;
      if (inlandM > 110) inlandM = 105;
      if (zoom < 16.5) zoom = 16.7;
    }
    return { bearing: bearing, pitch: pitch, zoom: zoom, inlandM: inlandM };
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
    var aim = site;
    if (site.id === "ditch_plains" || site.id === "lighthouse") {
      aim = destPoint(site.lat, site.lng, bearing, 24);
    }
    var cam = destPoint(aim.lat, aim.lng, inlandBr, inlandM);
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
    applyCoastMeshes();
  }

  function eraTint(spec) {
    if (spec) return { exag: 0.28, highlight: "#f3ead6", shadow: "#101820" };
    if (year <= 1900) return { exag: 0.64, highlight: "#c9a56a", shadow: "#2a1a10" };
    if (year <= 1965) return { exag: 0.6, highlight: "#c8c8c4", shadow: "#161616" };
    if (year <= 1995) return { exag: 0.56, highlight: "#c4b896", shadow: "#1a2018" };
    return { exag: 0.52, highlight: "#8a9aa4", shadow: "#101820" };
  }

  function terrainExag() {
    return (cfg && cfg.terrain && cfg.terrain.exaggeration) || 2.6;
  }

  function altZ(m) {
    return Number(m) * terrainExag();
  }

  function xyAt(packed, i) {
    return [packed[i * 2], packed[i * 2 + 1]];
  }

  function toward(from, to, meters) {
    var d = metersBetween(from[1], from[0], to[1], to[0]);
    if (!(d > 0.4)) return [from[0], from[1]];
    var t = meters / d;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  }

  function tooFar(a, b) {
    return metersBetween(a[1], a[0], b[1], b[0]) > 380;
  }

  function mercatorVtx(lng, lat, altM) {
    var mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altM);
    return [mc.x, mc.y, mc.z];
  }

  function tillHeight(lng) {
    if (lng < -71.93) return 5.2;
    if (lng < -71.88) return 7.5;
    return 10.8;
  }

  function eraCoastColors() {
    if (year <= 1900) {
      return {
        sand: [0.90, 0.74, 0.46],
        till: [0.50, 0.32, 0.18],
        cobble: [0.42, 0.32, 0.24],
        cut: [0.14, 0.36, 0.44],
        water: [0.20, 0.48, 0.56]
      };
    }
    if (year <= 1965) {
      return {
        sand: [0.72, 0.72, 0.68],
        till: [0.36, 0.33, 0.29],
        cobble: [0.42, 0.40, 0.36],
        cut: [0.26, 0.30, 0.34],
        water: [0.30, 0.34, 0.38]
      };
    }
    if (year <= 1995) {
      return {
        sand: [0.76, 0.68, 0.48],
        till: [0.42, 0.32, 0.22],
        cobble: [0.40, 0.34, 0.26],
        cut: [0.14, 0.34, 0.40],
        water: [0.18, 0.36, 0.42]
      };
    }
    return {
      sand: [0.86, 0.76, 0.54],
      till: [0.54, 0.36, 0.22],
      cobble: [0.50, 0.40, 0.30],
      cut: [0.08, 0.30, 0.40],
      water: [0.06, 0.28, 0.38]
    };
  }

  function meshYearKeys() {
    if (!coastMeshes || !coastMeshes.years) return [];
    return Object.keys(coastMeshes.years).map(Number).sort(function (a, b) { return a - b; });
  }

  function lerpPacked(a, b, t) {
    var out = new Array(a.length);
    var i;
    for (i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
  }

  function coastSpecForYear(y) {
    y = Number(y);
    /* 1996 is Mode D (lighthouse deed). Do not lerp 1991→2000. */
    if (y === 1996) return null;
    if (!coastMeshes || !coastMeshes.years) return null;
    if (y > 2000 && coastMeshes.years["2000"]) {
      var held = coastMeshes.years["2000"];
      return { status: "held", hwl: held.hwl, ref: held.ref, w: held.w.slice(), zCut: held.zCut, year: y };
    }
    if (coastMeshes.years[String(y)]) {
      var row = coastMeshes.years[String(y)];
      return { status: row.status, hwl: row.hwl, ref: row.ref, w: row.w, zCut: row.zCut, year: y };
    }
    var keys = meshYearKeys();
    var earlier = null;
    var later = null;
    var i;
    for (i = 0; i < keys.length; i++) {
      if (keys[i] <= y) earlier = keys[i];
      if (keys[i] >= y && later == null) later = keys[i];
    }
    if (earlier == null) earlier = later;
    if (later == null) later = earlier;
    if (earlier == null) return null;
    var A = coastMeshes.years[String(earlier)];
    if (earlier === later) {
      return { status: A.status, hwl: A.hwl, ref: A.ref, w: A.w, zCut: A.zCut, year: y };
    }
    var t = (y - earlier) / (later - earlier);
    var B = coastMeshes.years[String(later)];
    var w = [];
    var zCut = [];
    for (i = 0; i < A.w.length; i++) w.push(A.w[i] + (B.w[i] - A.w[i]) * t);
    if (A.zCut && B.zCut) {
      for (i = 0; i < A.zCut.length; i++) zCut.push(A.zCut[i] + (B.zCut[i] - A.zCut[i]) * t);
    }
    return {
      status: "modeled",
      hwl: lerpPacked(A.hwl, B.hwl, t),
      ref: A.ref,
      w: w,
      zCut: zCut.length ? zCut : A.zCut,
      year: y
    };
  }

  function ditchTerraceM() {
    var spec = coastSpecForYear(year);
    if (!spec || !spec.w) return null;
    var sum = 0;
    var n = 0;
    var i;
    for (i = 0; i < spec.w.length; i++) {
      if (spec.ref[i * 2] >= -71.925 && spec.ref[i * 2] <= -71.910) {
        sum += spec.w[i];
        n += 1;
      }
    }
    return n ? sum / n : null;
  }

  function faceShade(a, b, c) {
    var ux = b[0] - a[0];
    var uy = b[1] - a[1];
    var uz = b[2] - a[2];
    var vx = c[0] - a[0];
    var vy = c[1] - a[1];
    var vz = c[2] - a[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    var d = (nx * -0.32 + ny * 0.52 + nz * 0.78) / len;
    return 0.52 + 0.48 * Math.max(0, d);
  }

  function pushTri(pos, col, a, b, c, rgb) {
    var s = faceShade(a, b, c);
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    col.push(rgb[0] * s, rgb[1] * s, rgb[2] * s, rgb[0] * s, rgb[1] * s, rgb[2] * s, rgb[0] * s, rgb[1] * s, rgb[2] * s);
  }

  function pushQuad(pos, col, a, b, c, d, rgb) {
    pushTri(pos, col, a, b, c, rgb);
    pushTri(pos, col, a, c, d, rgb);
  }

  function pushTriFlat(pos, col, a, b, c, rgb) {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
  }

  function pushQuadFlat(pos, col, a, b, c, d, rgb) {
    pushTriFlat(pos, col, a, b, c, rgb);
    pushTriFlat(pos, col, a, c, d, rgb);
  }

  function makeColorMesh(pos, col, opacity) {
    if (pos.length < 9) return null;
    var geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    var mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: opacity < 0.99,
      opacity: opacity,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.userData.coast = true;
    mesh.userData.baseOp = opacity;
    return mesh;
  }

  function disposeGroup(group) {
    if (!group) return;
    group.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  /* 2000 is the 2014 waterline proxy. Held years share that line. No tan. */
  function skipSandMesh() {
    return year === 2000 || year > 2000;
  }

  /* Ditch / downtown / Point only. Lost/gained beach = this year's HWL
     minus the 2000/ref waterline, clipped ~250 m along-shore of the pin.
     One extruded solid per site-year. Not a transect loft. Not a guessed box. */
  var BEACH_SITES = [
    { id: "ditch_plains", lat: 41.03948, lng: -71.91701 },
    { id: "ocean_beaches", lat: 41.0315, lng: -71.946 },
    { id: "lighthouse", lat: 41.07099, lng: -71.85709, southOnly: true }
  ];
  var BEACH_ALONG_M = 125;

  function alongTrackM(packed, n) {
    var along = [0];
    var i;
    for (i = 1; i < n; i++) {
      along.push(along[i - 1] + metersBetween(
        packed[i * 2 + 1], packed[i * 2],
        packed[(i - 1) * 2 + 1], packed[(i - 1) * 2]
      ));
    }
    return along;
  }

  function siteOnSouth(site, spec, i) {
    if (!site.southOnly) return true;
    return spec.hwl[i * 2 + 1] <= site.lat + 0.0004;
  }

  /* Contiguous HWL/ref span near the pin. Endpoints shared so the two
     closing segments are straight vertical rectangles when extruded. */
  function siteBeachSpan(spec, site) {
    if (!spec || !spec.w || !spec.ref || !spec.hwl) return null;
    var n = spec.w.length;
    var along = alongTrackM(spec.ref, n);
    var i0 = 0;
    var best = 1e9;
    var i;
    var d;
    for (i = 0; i < n; i++) {
      if (!siteOnSouth(site, spec, i)) continue;
      d = metersBetween(site.lat, site.lng, spec.ref[i * 2 + 1], spec.ref[i * 2]);
      if (d < best) {
        best = d;
        i0 = i;
      }
    }
    if (!(best < 400)) return null;
    var lo = i0;
    var hi = i0;
    while (lo > 0 && along[i0] - along[lo - 1] <= BEACH_ALONG_M && siteOnSouth(site, spec, lo - 1)) lo -= 1;
    while (hi < n - 1 && along[hi + 1] - along[i0] <= BEACH_ALONG_M && siteOnSouth(site, spec, hi + 1)) hi += 1;
    if (hi - lo < 1) return null;
    var sum = 0;
    for (i = lo; i <= hi; i++) sum += spec.w[i];
    var mean = sum / (hi - lo + 1);
    if (!(mean >= 8)) return null;
    return { lo: lo, hi: hi, mean: mean };
  }

  function beachRing(spec, lo, hi) {
    var ring = [];
    var i;
    for (i = lo; i <= hi; i++) ring.push([spec.hwl[i * 2], spec.hwl[i * 2 + 1]]);
    for (i = hi; i >= lo; i--) ring.push([spec.ref[i * 2], spec.ref[i * 2 + 1]]);
    return ring;
  }

  function ringArea(ring) {
    var a = 0;
    var i;
    var n = ring.length;
    var j;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
    }
    return a / 2;
  }

  function pointInTri(p, a, b, c) {
    var denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denom) < 1e-18) return false;
    var t1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / denom;
    var t2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / denom;
    var t3 = 1 - t1 - t2;
    return t1 >= -1e-12 && t2 >= -1e-12 && t3 >= -1e-12;
  }

  function triangulateRing(ring) {
    var pts = ring.slice();
    if (pts.length < 3) return [];
    if (ringArea(pts) < 0) pts.reverse();
    var idx = [];
    var i;
    for (i = 0; i < pts.length; i++) idx.push(i);
    var faces = [];
    var guard = 0;
    var k;
    var ear;
    var ia;
    var ib;
    var ic;
    var t;
    var ok;
    var cross;
    while (idx.length > 3 && guard < 400) {
      guard += 1;
      ear = -1;
      for (k = 0; k < idx.length; k++) {
        ia = idx[(k - 1 + idx.length) % idx.length];
        ib = idx[k];
        ic = idx[(k + 1) % idx.length];
        cross = (pts[ib][0] - pts[ia][0]) * (pts[ic][1] - pts[ia][1]) -
          (pts[ic][0] - pts[ia][0]) * (pts[ib][1] - pts[ia][1]);
        if (cross <= 0) continue;
        ok = true;
        for (t = 0; t < idx.length; t++) {
          if (idx[t] === ia || idx[t] === ib || idx[t] === ic) continue;
          if (pointInTri(pts[idx[t]], pts[ia], pts[ib], pts[ic])) {
            ok = false;
            break;
          }
        }
        if (ok) {
          ear = k;
          break;
        }
      }
      if (ear < 0) break;
      ia = idx[(ear - 1 + idx.length) % idx.length];
      ib = idx[ear];
      ic = idx[(ear + 1) % idx.length];
      faces.push([pts[ia], pts[ib], pts[ic]]);
      idx.splice(ear, 1);
    }
    if (idx.length === 3) faces.push([pts[idx[0]], pts[idx[1]], pts[idx[2]]]);
    return faces;
  }

  function pushExtrudedSolid(pos, col, rgb, ring, zTop, zBot) {
    var pts = ring.slice();
    if (ringArea(pts) < 0) pts.reverse();
    var faces = triangulateRing(pts);
    var f;
    var a;
    var b;
    var c;
    var i;
    var j;
    for (f = 0; f < faces.length; f++) {
      a = faces[f][0];
      b = faces[f][1];
      c = faces[f][2];
      pushTri(pos, col,
        mercatorVtx(a[0], a[1], zTop),
        mercatorVtx(b[0], b[1], zTop),
        mercatorVtx(c[0], c[1], zTop),
        rgb);
      pushTri(pos, col,
        mercatorVtx(a[0], a[1], zBot),
        mercatorVtx(c[0], c[1], zBot),
        mercatorVtx(b[0], b[1], zBot),
        rgb);
    }
    for (i = 0; i < pts.length; i++) {
      j = (i + 1) % pts.length;
      pushQuad(pos, col,
        mercatorVtx(pts[i][0], pts[i][1], zTop),
        mercatorVtx(pts[j][0], pts[j][1], zTop),
        mercatorVtx(pts[j][0], pts[j][1], zBot),
        mercatorVtx(pts[i][0], pts[i][1], zBot),
        rgb);
    }
  }

  function addBeachSolids(group, spec, colors) {
    var zTop = altZ(3.3);
    var zBot = altZ(0.8);
    BEACH_SITES.forEach(function (site) {
      var span = siteBeachSpan(spec, site);
      if (!span) return;
      var pos = [];
      var col = [];
      pushExtrudedSolid(pos, col, colors.sand, beachRing(spec, span.lo, span.hi), zTop, zBot);
      var mesh = makeColorMesh(pos, col, 1);
      if (mesh) {
        mesh.userData.beachSolid = site.id;
        group.add(mesh);
      }
    });
  }

  function hwlLatNear(spec, lng, windowDeg) {
    if (!spec || !spec.hwl) return null;
    var n = spec.hwl.length / 2;
    var best = null;
    var bestD = 1e9;
    var i;
    var d;
    for (i = 0; i < n; i++) {
      d = Math.abs(spec.hwl[i * 2] - lng);
      if (d < bestD && d <= windowDeg) {
        bestD = d;
        best = spec.hwl[i * 2 + 1];
      }
    }
    return best;
  }

  function zCutNear(spec, lng, windowDeg) {
    if (!spec || !spec.zCut || !spec.hwl) return 0.6;
    var n = spec.w ? spec.w.length : spec.zCut.length;
    var mx = 0.6;
    var i;
    for (i = 0; i < n; i++) {
      if (Math.abs(spec.hwl[i * 2] - lng) <= windowDeg) {
        if (spec.zCut[i] > mx) mx = spec.zCut[i];
      }
    }
    return mx;
  }

  function coverZMeters(spec) {
    var mx = zCutNear(spec, -71.917, 0.04);
    var i;
    if (spec && spec.zCut) {
      for (i = 0; i < spec.zCut.length; i++) {
        if (spec.zCut[i] > mx) mx = spec.zCut[i];
      }
    }
    /* Constant lid above 2014 DEM seaward of the HWL. Stops at the HWL so it
       does not flood the sand deck. Not a transect strip. */
    return Math.max(8.5, mx + 4);
  }

  function pushBboxQuad(pos, col, west, south, east, north, z, rgb) {
    var cols = 8;
    var rows = 6;
    var c;
    var r;
    var x0;
    var x1;
    var y0;
    var y1;
    for (r = 0; r < rows; r++) {
      y0 = south + (north - south) * (r / rows);
      y1 = south + (north - south) * ((r + 1) / rows);
      for (c = 0; c < cols; c++) {
        x0 = west + (east - west) * (c / cols);
        x1 = west + (east - west) * ((c + 1) / cols);
        pushQuadFlat(pos, col,
          mercatorVtx(x0, y0, z),
          mercatorVtx(x1, y0, z),
          mercatorVtx(x1, y1, z),
          mercatorVtx(x0, y1, z),
          rgb);
      }
    }
  }

  /* Hide 2014 land/hillshade seaward of this year's HWL. Not a historic DEM.
     SOLID bbox planes — never a transect triangle strip (those fan into shards). */
  function addSolidWaterPlanes(group, spec, colors) {
    var zM = coverZMeters(spec);
    var z = altZ(zM);
    var ditchLat = hwlLatNear(spec, -71.917, 0.02) || 41.03897;
    var pointLat = hwlLatNear(spec, -71.857, 0.025) || 41.069;
    var southNorth = ditchLat - 0.00002;
    var pointNorth = pointLat - 0.00002;
    var pos = [];
    var col = [];
    var waterRgb = [
      colors.water[0] * 0.62 + 0.10,
      colors.water[1] * 0.62 + 0.18,
      colors.water[2] * 0.62 + 0.24
    ];
    /* South ocean — full west–east bbox, north edge just seaward of the Ditch HWL. */
    pushBboxQuad(pos, col, -72.02, 40.978, -71.818, southNorth, z, waterRgb);
    /* Point south/east ocean — second solid quad, not a harbor / Soundview loop. */
    pushBboxQuad(pos, col, -71.878, 40.978, -71.818, pointNorth, z, waterRgb);
    /* North sound — north of the 2014 north shore. Jetties stay 2014 DEM. */
    pushBboxQuad(pos, col, -72.00, 41.080, -71.845, 41.118, z, waterRgb);
    var mesh = makeColorMesh(pos, col, 1);
    if (mesh) {
      mesh.userData.waterPlane = true;
      mesh.userData.baseOp = 1;
      group.add(mesh);
    }
    return zM;
  }

  function buildCoastGroup(spec) {
    var group = new THREE.Group();
    group.userData.coast = true;
    group.userData.fade = 0;
    if (!spec || !map) return group;
    var colors = eraCoastColors();
    addSolidWaterPlanes(group, spec, colors);
    if (skipSandMesh()) return group;
    addBeachSolids(group, spec, colors);
    return group;
  }

  function hideCoastMeshes() {
    clearCoastMeshes();
    if (waterGroup) {
      if (planeLayer && planeLayer.scene) planeLayer.scene.remove(waterGroup);
      disposeGroup(waterGroup);
      waterGroup = null;
    }
  }

  function clearCoastMeshes() {
    while (coastGroups.length) {
      var g = coastGroups.pop();
      if (planeLayer && planeLayer.scene) planeLayer.scene.remove(g);
      disposeGroup(g);
    }
    lastCoastTick = 0;
  }

  function applyCoastMeshes() {
    if (!planeLayer || !planeLayer.scene || !coastMeshes) return;
    /* Mode D deed: year === 1996. Unconditional — hide/clear every coast mesh. */
    if (year === 1996) {
      if (lastCoastYear === year && !coastGroups.length) return;
      hideCoastMeshes();
      lastCoastYear = year;
      if (map) map.triggerRepaint();
      return;
    }
    if (lastCoastYear === year && coastGroups.length) return;
    lastCoastYear = year;
    /* 2000 / held: drop any previous tan immediately. Do not fade it out. */
    if (skipSandMesh()) {
      while (coastGroups.length) {
        var prev = coastGroups.pop();
        if (planeLayer.scene) planeLayer.scene.remove(prev);
        disposeGroup(prev);
      }
    }
    if (waterGroup) {
      if (planeLayer.scene) planeLayer.scene.remove(waterGroup);
      disposeGroup(waterGroup);
      waterGroup = null;
    }
    var spec = coastSpecForYear(year);
    var built = buildCoastGroup(spec);
    built.userData.fade = 0;
    planeLayer.scene.add(built);
    coastGroups.push(built);
    while (coastGroups.length > 2) {
      var old = coastGroups.shift();
      planeLayer.scene.remove(old);
      disposeGroup(old);
    }
    if (map) map.triggerRepaint();
  }

  function tickCoastFade() {
    if (!coastGroups.length) return;
    var now = typeof performance !== "undefined" ? performance.now() : Date.now();
    var dt = lastCoastTick ? Math.min(50, now - lastCoastTick) : 16;
    lastCoastTick = now;
    var i;
    for (i = 0; i < coastGroups.length; i++) {
      var g = coastGroups[i];
      var last = i === coastGroups.length - 1;
      g.userData.fade = Math.min(1, (g.userData.fade || 0) + dt / 380);
      var op = last ? g.userData.fade : 1 - g.userData.fade;
      g.traverse(function (obj) {
        if (!obj.material) return;
        if (obj.userData && obj.userData.waterPlane) {
          obj.material.transparent = false;
          obj.material.opacity = 1;
          return;
        }
        obj.material.transparent = true;
        obj.material.opacity = (obj.userData.baseOp == null ? 1 : obj.userData.baseOp) * Math.max(0, op);
      });
    }
    if (coastGroups.length > 1 && coastGroups[coastGroups.length - 1].userData.fade >= 1) {
      var dead = coastGroups.shift();
      if (planeLayer && planeLayer.scene) planeLayer.scene.remove(dead);
      disposeGroup(dead);
    }
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
        applyCoastMeshes();
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
        tickCoastFade();
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
        if (hits[i].object && hits[i].object.userData && hits[i].object.userData.coast) continue;
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
      applyYearImagery();
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
    var ditchCam = cameraForSite(ditchSite());
    map = new maplibregl.Map({
      container: el,
      style: styleSpec(terrain),
      center: ditchCam.center,
      zoom: ditchCam.zoom,
      pitch: ditchCam.pitch,
      bearing: ditchCam.bearing,
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
      applyYearImagery();
      addSitePins();
      addPlaneLayer();
      bindOrbit();
      try { map.resize(); } catch (e) { /* ignore */ }
      if (pendingFly) {
        var site = pendingFly;
        pendingFly = null;
        flyToSite(site);
      } else if (!selectedId) {
        flyToSite(ditchSite());
      }
      if (opts.onReady) opts.onReady();
      map.once("idle", function () {
        if (!visible || pathPlaying) return;
        if (!selectedId || selectedId === "ditch_plains") flyToSite(ditchSite());
      });
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

  function ditchSite() {
    var pin = (cfg && cfg.pins && cfg.pins.ditch_plains) || {};
    return sites.find(function (s) { return s.id === "ditch_plains"; }) || {
      id: "ditch_plains",
      lat: pin.lat != null ? pin.lat : 41.03948,
      lng: pin.lng != null ? pin.lng : -71.91701
    };
  }

  function maybeFlyWalkIn() {
    if (!visible || pathPlaying) return;
    if (hwlStatus(year)) return;
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
    coastMeshes = await tryFetch("data/coast_meshes.json");
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
    if (!selectedId && !pendingFly && ready) flyToSite(ditchSite());
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
    coastSpecForYear: coastSpecForYear,
    ditchTerraceM: ditchTerraceM,
    nysYears: NYS_YEARS,
    noModeA: NO_MODE_A,
    skipSandMesh: skipSandMesh,
    lookAtDitchEast: function () {
      if (!map) return;
      var east = destPoint(41.03948, -71.91701, 78, 150);
      map.jumpTo({
        center: [east.lng, east.lat],
        zoom: 17.3,
        pitch: 68,
        bearing: 258,
        duration: 0
      });
    },
    siteBeachSpan: siteBeachSpan,
    debugCoast: function () {
      var meshes = [];
      coastGroups.forEach(function (g) {
        g.traverse(function (obj) {
          if (!obj.geometry || !obj.geometry.attributes || !obj.geometry.attributes.position) return;
          meshes.push({
            water: !!obj.userData.waterPlane,
            beach: obj.userData.beachSolid || null,
            verts: obj.geometry.attributes.position.count
          });
        });
      });
      return { year: year, skipSand: skipSandMesh(), groups: coastGroups.length, meshes: meshes };
    }
  };

  global.MontaukCoast3D = api;
})(window);
