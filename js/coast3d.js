/* 3D coast — five locked pins, twelve planes, no extra markers. */
(function (global) {
  "use strict";

  var PATH_DWELL_MS = 2800;
  var INLAND_DWELL_MS = 2000;

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
  var planeLayer = null;

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

  function collectCards(siteList) {
    var planes = (cfg && cfg.planes) || [];
    var pins = (cfg && cfg.pins) || {};
    var out = [];
    planes.forEach(function (spec) {
      var found = findSitePhoto(siteList, spec.file);
      if (!found) return;
      if (spec.siteId && found.site.id !== spec.siteId) return;
      var pin = pins[spec.siteId] || pins[found.site.id] || {};
      var lat = spec.lat != null ? Number(spec.lat) : Number(pin.lat != null ? pin.lat : found.site.lat);
      var lng = spec.lng != null ? Number(spec.lng) : Number(pin.lng != null ? pin.lng : found.site.lng);
      var look = spec.look != null ? spec.look : (pin.look != null ? pin.look : 180);
      out.push({
        spec: spec,
        siteId: spec.siteId || found.site.id,
        site: found.site,
        photo: found.photo,
        year: found.photo.year == null ? null : Number(found.photo.year),
        lat: lat,
        lng: lng,
        kind: spec.kind || "ground",
        altM: spec.altM != null ? spec.altM : 10,
        look: look,
        tilt: spec.tilt || 0,
        gps: spec.lat != null && spec.lng != null
      });
    });
    return out;
  }

  function cardVisible(rec) {
    if (rec.year == null) return true;
    return rec.year <= year;
  }

  function updateCardStates() {
    var shown = 0;
    cards.forEach(function (rec) {
      var on = cardVisible(rec);
      if (on) shown += 1;
      if (rec.mesh) rec.mesh.visible = on;
    });
    var count = $("#coast3d-count");
    if (count) {
      count.textContent = shown + " of " + cards.length + " planes at or before " + year;
    }
    if (map) map.triggerRepaint();
    return shown;
  }

  function lookFor(site) {
    var look = (cfg && cfg.look && cfg.look[site.id]) || {};
    var pin = (cfg && cfg.pins && cfg.pins[site.id]) || {};
    return {
      bearing: look.bearing != null ? look.bearing : (pin.look != null ? pin.look : 180),
      pitch: look.pitch != null ? look.pitch : 60,
      zoom: look.zoom != null ? look.zoom : 15.4,
      inlandM: look.inlandM != null ? look.inlandM : 320
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
          minzoom: terrainSrc.minzoom || 0,
          maxzoom: terrainSrc.maxzoom || 15,
          attribution: terrainSrc.attribution
        },
        hillshadeDem: {
          type: "raster-dem",
          tiles: terrainSrc.tiles,
          encoding: terrainSrc.encoding || "terrarium",
          tileSize: terrainSrc.tileSize || 256,
          minzoom: terrainSrc.minzoom || 0,
          maxzoom: terrainSrc.maxzoom || 15
        }
      },
      layers: [
        { id: "imagery", type: "raster", source: "imagery" },
        {
          id: "hillshade-soft",
          type: "raster",
          source: "hillshadeRaster",
          paint: { "raster-opacity": 0.28, "raster-contrast": 0.06 }
        },
        {
          id: "hills",
          type: "hillshade",
          source: "hillshadeDem",
          paint: {
            "hillshade-exaggeration": 0.38,
            "hillshade-shadow-color": "#142018",
            "hillshade-highlight-color": "#f3ead6",
            "hillshade-illumination-direction": 315
          }
        }
      ],
      terrain: { source: "terrain", exaggeration: (cfg.terrain && cfg.terrain.exaggeration) || 2.6 },
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
    });
    return wrap;
  }

  function addSitePins() {
    var order = ["ditch_plains", "soundview", "harbor_jetties", "ocean_beaches", "lighthouse"];
    var pins = (cfg && cfg.pins) || {};
    order.forEach(function (id, i) {
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
      var c = document.createElement("canvas");
      c.width = 1024;
      c.height = 768;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#0c1d2e";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, 1024, 640);
      ctx.fillStyle = "#e2c49a";
      ctx.font = "600 40px Outfit, sans-serif";
      ctx.fillText(rec.year != null ? String(rec.year) : "", 28, 698);
      ctx.fillStyle = "#9aafb8";
      ctx.font = "28px Outfit, sans-serif";
      var cap = rec.photo.caption || rec.photo.credit || "";
      ctx.fillText(cap.length > 64 ? cap.slice(0, 63) + "…" : cap, 28, 740);
      var tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
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
    if (rec.kind === "usgs-oblique") return { w: 34, h: 24 };
    if (rec.kind === "aerial") return { w: 30, h: 21 };
    return { w: 18, h: 13 };
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
        this.camera = new THREE.Camera();
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

  function hitPlanes(point) {
    if (!planeLayer || !planeLayer.raycaster || !map) return null;
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
    return null;
  }

  function openCard(rec) {
    if (!rec) return;
    selectedId = rec.siteId;
    if (opts.onPhoto) opts.onPhoto(rec.photo, rec.site);
    if (opts.onSite) opts.onSite(rec.siteId, { fly: false, sheet: false });
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
        attribution: fb.attribution
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
          "hillshade-exaggeration": 0.4,
          "hillshade-shadow-color": "#142018",
          "hillshade-highlight-color": "#f3ead6"
        }
      });
      map.setTerrain({ source: "terrain", exaggeration: 2.6 });
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
    var i, stop, site, fromSite, toSite;
    for (i = 0; i < path.stops.length; i++) {
      if (token !== pathToken) return;
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
  }

  api._helpers = {
    destPoint: destPoint,
    collectCards: collectCards,
    basename: basename
  };

  global.MontaukCoast3D = api;
})(window);
