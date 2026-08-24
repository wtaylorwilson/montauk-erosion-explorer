/* Immersive 3D coast — MapLibre terrain, no API key. Photos stay at sourced coords. */
(function (global) {
  "use strict";

  var FAR_ZOOM = 13.35;
  var PATH_DWELL_MS = 2800;

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
    photoCount: function () { return cards.length; }
  };

  var opts = {};
  var cfg = null;
  var sites = [];
  var map = null;
  var ready = false;
  var visible = false;
  var year = 2026;
  var cards = [];
  var sitePins = [];
  var pathToken = 0;
  var orbit = { on: false, lastX: 0, lastY: 0, pointerId: null };
  var selectedId = null;
  var pendingFly = null;
  var terrainErrors = 0;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function parseCaptionGps(text) {
    if (!text) return null;
    var m = String(text).match(/GPS\s+(-?\d+(?:\.\d+)?)\s*,\s*([−–-])?\s*(-?\d+(?:\.\d+)?)/i);
    if (!m) return null;
    var lat = parseFloat(m[1]);
    var lng = parseFloat(m[3]);
    if (m[2] && lng > 0) lng = -lng;
    if (!(lat >= 40.95 && lat <= 41.2 && lng >= -72.15 && lng <= -71.75)) return null;
    return { lat: lat, lng: lng };
  }

  function photoLngLat(photo, site) {
    if (photo && photo.lat != null && (photo.lng != null || photo.lon != null)) {
      return { lat: Number(photo.lat), lng: Number(photo.lng != null ? photo.lng : photo.lon), sourced: true };
    }
    var gps = parseCaptionGps(photo && photo.caption);
    if (gps) return { lat: gps.lat, lng: gps.lng, sourced: true };
    return { lat: site.lat, lng: site.lng, sourced: false };
  }

  function alongBearing(site) {
    if (site.shore === "north") return 90;
    if (site.shore === "east") return 10;
    return 90;
  }

  function seawardBearing(site) {
    var look = (cfg && cfg.look && cfg.look[site.id]) || {};
    return look.bearing != null ? look.bearing : (site.shore === "north" ? 0 : site.shore === "east" ? 125 : 180);
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

  function collectCards(siteList) {
    var out = [];
    siteList.forEach(function (site) {
      var photos = (site.photos || []).filter(function (p) { return p && p.src; });
      var shared = [];
      photos.forEach(function (photo, i) {
        var ll = photoLngLat(photo, site);
        var rec = {
          siteId: site.id,
          site: site,
          photo: photo,
          index: i,
          year: photo.year == null ? null : Number(photo.year),
          lat: ll.lat,
          lng: ll.lng,
          gps: ll.sourced,
          cap: (photo.year ? photo.year + " · " : "") + (photo.caption || "") + (photo.credit ? " · " + photo.credit : "")
        };
        if (ll.sourced) out.push(rec);
        else shared.push(rec);
      });
      var n = shared.length;
      var mid = (n - 1) / 2;
      var along = alongBearing(site);
      var sea = seawardBearing(site);
      var step = n > 12 ? 15 : 20;
      shared.forEach(function (rec, i) {
        var alongM = (i - mid) * step;
        var seaM = 16 + (i % 2) * 20;
        var a = destPoint(site.lat, site.lng, along, alongM);
        var b = destPoint(a.lat, a.lng, sea, seaM);
        rec.lat = b.lat;
        rec.lng = b.lng;
        out.push(rec);
      });
    });
    return out;
  }

  function cardVisible(rec) {
    if (rec.year == null) return true;
    return rec.year <= year;
  }

  function cardNow(rec) {
    if (rec.year == null) return false;
    return Math.abs(rec.year - year) <= 4;
  }

  function updateCardStates() {
    var shown = 0;
    var now = 0;
    cards.forEach(function (rec) {
      var on = cardVisible(rec);
      if (on) shown += 1;
      if (on && cardNow(rec)) now += 1;
      if (rec.el) {
        rec.el.hidden = !on;
        rec.el.classList.toggle("is-now", on && cardNow(rec));
        rec.el.classList.toggle("is-dim", on && !cardNow(rec) && rec.siteId !== selectedId);
        rec.el.classList.toggle("is-site", rec.siteId === selectedId);
      }
      if (rec.marker) rec.marker.getElement().style.display = on ? "" : "none";
    });
    var count = $("#coast3d-count");
    if (count) {
      count.textContent = shown + " stills at or before " + year + (now ? " · " + now + " near this year" : "");
    }
    return shown;
  }

  function setFarClass(zoom) {
    var view = $("#coast3d-view");
    if (!view) return;
    view.classList.toggle("is-far", zoom < FAR_ZOOM);
  }

  function lookFor(site) {
    var look = (cfg && cfg.look && cfg.look[site.id]) || {};
    return {
      bearing: look.bearing != null ? look.bearing : seawardBearing(site),
      pitch: look.pitch != null ? look.pitch : 60,
      zoom: look.zoom != null ? look.zoom : 15.4,
      inlandM: look.inlandM != null ? look.inlandM : 380
    };
  }

  function cameraForSite(site) {
    var look = lookFor(site);
    var inlandBr = (look.bearing + 180) % 360;
    var cam = destPoint(site.lat, site.lng, inlandBr, look.inlandM);
    return {
      center: [cam.lng, cam.lat],
      zoom: look.zoom,
      pitch: look.pitch,
      bearing: look.bearing,
      duration: 2200,
      essential: true
    };
  }

  function overviewCenter() {
    if (!sites.length) return [-71.92, 41.05];
    var lat = 0, lng = 0;
    sites.forEach(function (s) { lat += s.lat; lng += s.lng; });
    return [lng / sites.length, lat / sites.length];
  }

  function styleSpec(terrainSrc) {
    var img = (cfg && cfg.imagery) || {
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Esri World Imagery",
      maxzoom: 19
    };
    var hill = (cfg && cfg.hillshade) || {
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Esri World Hillshade",
      maxzoom: 16
    };
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        imagery: {
          type: "raster",
          tiles: img.tiles,
          tileSize: 256,
          attribution: img.attribution,
          maxzoom: img.maxzoom || 19
        },
        hillshadeRaster: {
          type: "raster",
          tiles: hill.tiles,
          tileSize: 256,
          attribution: hill.attribution,
          maxzoom: hill.maxzoom || 16
        },
        terrain: {
          type: "raster-dem",
          tiles: terrainSrc.tiles,
          encoding: terrainSrc.encoding || "terrarium",
          tileSize: terrainSrc.tileSize || 256,
          maxzoom: terrainSrc.maxzoom || 15,
          attribution: terrainSrc.attribution
        },
        hillshadeDem: {
          type: "raster-dem",
          tiles: terrainSrc.tiles,
          encoding: terrainSrc.encoding || "terrarium",
          tileSize: terrainSrc.tileSize || 256,
          maxzoom: terrainSrc.maxzoom || 15
        }
      },
      layers: [
        { id: "imagery", type: "raster", source: "imagery" },
        {
          id: "hillshade-soft",
          type: "raster",
          source: "hillshadeRaster",
          paint: { "raster-opacity": 0.32, "raster-contrast": 0.08 }
        },
        {
          id: "hills",
          type: "hillshade",
          source: "hillshadeDem",
          paint: {
            "hillshade-exaggeration": 0.42,
            "hillshade-shadow-color": "#142018",
            "hillshade-highlight-color": "#f3ead6",
            "hillshade-illumination-direction": 315
          }
        }
      ],
      terrain: { source: "terrain", exaggeration: (cfg.terrain && cfg.terrain.exaggeration) || 4.2 },
      sky: {
        "sky-color": "#0a1a28",
        "horizon-color": "#8aa7b8",
        "fog-color": "#6d8796",
        "sky-horizon-blend": 0.55,
        "horizon-fog-blend": 0.7,
        "fog-ground-blend": 0.35,
        "atmosphere-blend": 0.45
      }
    };
  }

  function makePhotoEl(rec) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "photo-plane";
    btn.dataset.site = rec.siteId;
    var yearTxt = rec.year != null ? String(rec.year) : "undated";
    btn.setAttribute("aria-label", yearTxt + " · " + (rec.photo.caption || rec.site.shortName));
    btn.innerHTML =
      '<img alt="" src="' + escapeHtml(rec.photo.src) + '" loading="lazy" />' +
      '<span class="photo-plane-year">' + escapeHtml(yearTxt) + "</span>" +
      '<span class="photo-plane-cap">' + escapeHtml(rec.photo.caption || rec.photo.credit || "") + "</span>";
    btn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openCard(rec);
    });
    return btn;
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
      updateCardStates();
      flyToSite(site);
      if (opts.onSite) opts.onSite(site.id, { fly: false, sheet: false });
    });
    return wrap;
  }

  function addMarkers() {
    cards.forEach(function (rec) {
      rec.el = makePhotoEl(rec);
      rec.marker = new maplibregl.Marker({
        element: rec.el,
        anchor: "bottom",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport"
      }).setLngLat([rec.lng, rec.lat]).addTo(map);
    });
    sites.forEach(function (site, i) {
      var el = makePinEl(site, i);
      var marker = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport"
      }).setLngLat([site.lng, site.lat]).addTo(map);
      sitePins.push({ site: site, el: el, marker: marker });
    });
    updateCardStates();
  }

  function bindOrbit() {
    var canvas = map.getCanvas();
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest && e.target.closest(".photo-plane, .coast3d-pin, .coast3d-chrome")) return;
      try {
        var rect = canvas.getBoundingClientRect();
        if (nearestCardAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, 56)) return;
      } catch (err) { /* ignore */ }
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

  function nearestCardAt(point, maxDist) {
    if (!map || !point) return null;
    var best = null;
    var bestD = maxDist;
    cards.forEach(function (rec) {
      if (!cardVisible(rec)) return;
      var p = map.project([rec.lng, rec.lat]);
      var dx = point.x - p.x;
      var dy = point.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (dy < 0 && dy > -100) d = Math.min(d, Math.abs(dx) + Math.abs(dy + 40) * 0.35);
      if (d < bestD) {
        bestD = d;
        best = rec;
      }
    });
    return best;
  }

  function openCard(rec) {
    if (!rec) return;
    selectedId = rec.siteId;
    updateCardStates();
    if (opts.onPhoto) opts.onPhoto(rec.photo, rec.site);
    if (opts.onSite) opts.onSite(rec.siteId, { fly: false, sheet: false });
  }

  function tryFallbackTerrain() {
    var fb = cfg && cfg.terrain && cfg.terrain.fallback;
    if (!map || !fb || !map.getSource("terrain")) return;
    try {
      map.setTerrain(null);
      if (map.getSource("terrain")) map.removeSource("terrain");
      if (map.getSource("hillshadeDem")) {
        if (map.getLayer("hills")) map.removeLayer("hills");
        map.removeSource("hillshadeDem");
      }
      map.addSource("terrain", {
        type: "raster-dem",
        tiles: fb.tiles,
        encoding: fb.encoding || "terrarium",
        tileSize: fb.tileSize || 256,
        maxzoom: fb.maxzoom || 15,
        attribution: fb.attribution
      });
      map.addSource("hillshadeDem", {
        type: "raster-dem",
        tiles: fb.tiles,
        encoding: fb.encoding || "terrarium",
        tileSize: fb.tileSize || 256,
        maxzoom: fb.maxzoom || 15
      });
      if (!map.getLayer("hills")) {
        map.addLayer({
          id: "hills",
          type: "hillshade",
          source: "hillshadeDem",
          paint: {
            "hillshade-exaggeration": 0.5,
            "hillshade-shadow-color": "#142018",
            "hillshade-highlight-color": "#f3ead6"
          }
        });
      }
      map.setTerrain({ source: "terrain", exaggeration: 4.2 });
    } catch (e) {
      dropTerrain();
    }
  }

  function dropTerrain() {
    if (!map) return;
    try { map.setTerrain(null); } catch (e) { /* ignore */ }
    var note = $("#coast3d-hint");
    if (note && !note.dataset.terrainFail) {
      note.dataset.terrainFail = "1";
      note.textContent = "Terrain tiles unavailable — pitched coast with hillshade. Drag to orbit · tap a still.";
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
    var center = overviewCenter();
    map = new maplibregl.Map({
      container: el,
      style: styleSpec(terrain),
      center: center,
      zoom: ov.zoom || 12.35,
      pitch: ov.pitch || 52,
      bearing: ov.bearing || 72,
      maxPitch: 80,
      minZoom: 11,
      maxZoom: 17.5,
      maxBounds: [[-72.14, 40.96], [-71.76, 41.16]],
      attributionControl: true,
      hash: false
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
      if (terrainErrors === 8) tryFallbackTerrain();
    });
    map.on("load", function () {
      ready = true;
      addMarkers();
      bindOrbit();
      setFarClass(map.getZoom());
      try { map.resize(); } catch (e) { /* ignore */ }
      if (pendingFly) {
        var site = pendingFly;
        pendingFly = null;
        flyToSite(site);
      }
      if (opts.onReady) opts.onReady();
    });
    map.on("zoom", function () { setFarClass(map.getZoom()); });
    map.on("click", function (e) {
      var hit = nearestCardAt(e.point, 72);
      if (!hit) return;
      openCard(hit);
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

  async function init(options) {
    opts = options || {};
    sites = opts.sites || [];
    year = typeof opts.getYear === "function" ? opts.getYear() : (opts.year || year);
    cfg = await tryFetch("data/coast3d.json") || {};
    cards = collectCards(sites);
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
    updateCardStates();
  }

  function hide() {
    visible = false;
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
    if (!site) return;
    selectedId = site.id;
    updateCardStates();
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
    year = Number(y);
    return updateCardStates();
  }

  function overview() {
    pathToken += 1;
    selectedId = null;
    updateCardStates();
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

  async function playPath(id) {
    var paths = (cfg && cfg.paths) || [];
    var path = paths.find(function (p) { return p.id === id; });
    if (!path) return;
    var token = ++pathToken;
    for (var i = 0; i < path.stops.length; i++) {
      if (token !== pathToken) return;
      var site = sites.find(function (s) { return s.id === path.stops[i]; });
      if (!site) continue;
      flyToSite(site);
      if (opts.onSite) opts.onSite(site.id, { fly: false, sheet: false });
      await wait(PATH_DWELL_MS);
    }
  }

  api._helpers = {
    destPoint: destPoint,
    parseCaptionGps: parseCaptionGps,
    photoLngLat: photoLngLat,
    collectCards: collectCards
  };

  global.MontaukCoast3D = api;
})(window);
