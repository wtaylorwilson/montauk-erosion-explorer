/* Montauk Erosion Explorer — prefers /research JSON, falls back to ./data */
(function () {
  "use strict";

  const CENTER = [41.04, -71.94];
  const FOCUS = ["ditch_plains", "soundview", "harbor_jetties", "ocean_beaches", "lighthouse"];
  const WAYBACK_TMPL =
    "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{releaseNum}/{z}/{y}/{x}";

  const SHORE_META = {
    ditch_plains: { shore: "south", waterbody: "Atlantic Ocean", setting: "Till/cobble headland beach" },
    soundview: { shore: "north", waterbody: "Fort Pond Bay / Block Island Sound", setting: "Sound-side residential shore" },
    harbor_jetties: { shore: "north", waterbody: "Block Island Sound / Lake Montauk", setting: "Federal navigation inlet" },
    ocean_beaches: { shore: "south", waterbody: "Atlantic Ocean", setting: "Downtown / Kirk Park oceanfront" },
    lighthouse: { shore: "east", waterbody: "Atlantic Ocean / Turtle Cove", setting: "Turtle Hill bluff and light" },
  };

  const ZONE_COLORS = { 1: "#5ee0c8", 2: "#f0c14b", 3: "#e67a3a", 4: "#d94b4b" };

  const state = {
    sites: [],
    imagery: null,
    studies: { studies: [], caveats: [] },
    events: { events: [] },
    yearIndex: 0,
    years: [],
    selectedId: null,
    view: "map",
    compare: false,
    layerPref: "auto",
    dataOrigin: {},
    storyOpen: false,
  };

  let map, baseLayers, markers = {}, overlayLayers = {};
  let histLayer = null;
  let compareLeft = null;
  let compareRight = null;
  let drag = false;

  const $ = (sel, root) => (root || document).querySelector(sel);

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function tryFetch(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function loadFirst(paths, name) {
    for (const p of paths) {
      const data = await tryFetch(p);
      if (data) {
        if (name) state.dataOrigin[name] = p;
        return data;
      }
    }
    if (name) state.dataOrigin[name] = "missing";
    return null;
  }

  function isNormalizedSite(s) {
    return s && s.story && (s.lng != null || s.lon != null) && Array.isArray(s.photos);
  }

  function normalizeSite(raw, photoDonor) {
    const id = raw.id;
    const meta = SHORE_META[id] || {};
    const photos = (photoDonor && photoDonor.photos) || raw.photos || [];
    const keys = (photoDonor && photoDonor.keyNumbers) || raw.keyNumbers || [];
    if (isNormalizedSite(raw) && raw.lng != null) {
      return Object.assign({}, raw, { photos: photos.length ? photos : raw.photos, keyNumbers: keys.length ? keys : raw.keyNumbers });
    }
    return {
      id: id,
      name: raw.name,
      shortName: raw.shortName || raw.short_name || raw.name,
      lat: raw.lat,
      lng: raw.lng != null ? raw.lng : raw.lon,
      zoom: raw.zoom || 16,
      shore: raw.shore || meta.shore || "south",
      waterbody: raw.waterbody || meta.waterbody || raw.shoreline_facing || "",
      setting: raw.setting || meta.setting || "",
      facing: raw.facing || raw.shoreline_facing,
      story: raw.story || raw.narrative || "",
      storyStatus: raw.storyStatus || "sourced",
      timeline: (raw.timeline || []).map(function (t) {
        return {
          year: t.year,
          title: t.title,
          text: t.text || t.detail || "",
          status: t.status || "sourced",
          sourceUrl: t.sourceUrl || t.source_url,
        };
      }),
      photos: photos,
      keyNumbers: keys,
      related: raw.related || raw.related_place_names || [],
    };
  }

  function mergeSites(research, local) {
    const localBy = {};
    (local && local.sites ? local.sites : []).forEach(function (s) { localBy[s.id] = s; });
    const src = (research && research.sites) || (local && local.sites) || [];
    return src
      .filter(function (s) { return FOCUS.indexOf(s.id) >= 0; })
      .map(function (s) { return normalizeSite(s, localBy[s.id]); });
  }

  function normalizeStudies(research, local) {
    if (research && (research.sources || research.studies)) {
      const list = research.studies || (research.sources || []).map(function (s) {
        return {
          id: s.id,
          title: s.title,
          authors: s.authors_agency || s.authors,
          year: s.year,
          url: s.url,
          note: s.takeaway || "",
          siteIds: s.sites || [],
        };
      });
      return { studies: list, caveats: research.caveats || [], rates: research.usgs_site_box_rates };
    }
    return local || { studies: [], caveats: [] };
  }

  function yearlyWayback(releasesDoc, fallback) {
    if (fallback && fallback.wayback && fallback.wayback.length) return fallback.wayback;
    const list = (releasesDoc && (releasesDoc.releases || releasesDoc.wayback)) || [];
    const by = {};
    list.forEach(function (r) {
      const date = r.date || r.release_date || r.releaseDateLabel || "";
      const year = r.year || (date ? parseInt(date.slice(0, 4), 10) : null);
      const num = r.releaseNum || r.release_num;
      if (!year || !num) return;
      if (!by[year] || date > (by[year].date || "")) {
        by[year] = { year: year, date: date, releaseNum: num, verified: true };
      }
    });
    return Object.keys(by).map(Number).sort().filter(function (y) { return y >= 2014 && y <= 2025; }).map(function (y) { return by[y]; });
  }

  function waybackUrl(releaseNum) {
    return WAYBACK_TMPL.replace("{releaseNum}", String(releaseNum));
  }

  function tileLayerFrom(spec, extra) {
    return L.tileLayer(spec.url, Object.assign({
      maxZoom: spec.maxZoom || 19,
      attribution: spec.attribution || "",
    }, extra || {}));
  }

  function nysLayer(spec) {
    const httpsUrl = spec.url;
    const httpUrl = spec.httpFallback || spec.url.replace("https://", "http://");
    const layer = L.tileLayer(httpUrl, {
      maxZoom: 19,
      attribution: "NYS ITS Geospatial Services / NYSDOP " + spec.year,
    });
    // Prefer HTTP (verified over Montauk). Keep HTTPS as documented pattern via error swap if needed.
    layer._httpsUrl = httpsUrl;
    return layer;
  }

  function findYearEntry(year) {
    const img = state.imagery;
    const wb = (img.wayback || []).find(function (w) { return w.year === year; });
    const nys = (img.nys || []).find(function (n) { return n.year === year && n.verified !== false; });
    return { wb: wb, nys: nys };
  }

  function layerForYear(year, pref) {
    const img = state.imagery;
    const pair = findYearEntry(year);
    if (pref === "current") return tileLayerFrom(img.basemaps.find(function (b) { return b.id === "esri-world-imagery"; }));
    if (pref === "osm") return tileLayerFrom(img.basemaps.find(function (b) { return b.id === "osm"; }));
    if (pref === "wayback" && pair.wb) {
      return L.tileLayer(waybackUrl(pair.wb.releaseNum), { maxZoom: 19, attribution: "Esri World Imagery Wayback " + pair.wb.date });
    }
    if (pref === "nys" && pair.nys) return nysLayer(pair.nys);
    if (pair.nys) return nysLayer(pair.nys);
    if (pair.wb) {
      return L.tileLayer(waybackUrl(pair.wb.releaseNum), { maxZoom: 19, attribution: "Esri World Imagery Wayback " + pair.wb.date });
    }
    return null;
  }

  function sourceLabel(year, pref) {
    const pair = findYearEntry(year);
    if (pref === "current") return "Esri World Imagery (current)";
    if (pref === "osm") return "OpenStreetMap";
    if (pref === "wayback") return pair.wb ? "Esri Wayback " + pair.wb.date : "No Wayback layer this year";
    if (pref === "nys") return pair.nys ? "NYSDOP " + pair.nys.year : "No NYSDOP Suffolk year";
    if (pair.nys) return "NYSDOP " + pair.nys.year + " (auto)";
    if (pair.wb) return "Esri Wayback " + pair.wb.date + " (auto)";
    if (year === 1976 || year === 1984) return "BJ Old Montauk aerials — open 1976 vs 1984";
    if (year === 1938) return "USACE 1938 verticals in the site gallery";
    if (year === 2012) return "USGS DS 858 Sandy obliques in the site gallery";
    return "No verified historical tile for this year";
  }

  function currentYear() {
    return state.years[state.yearIndex];
  }

  function nearestTileYear(year) {
    const avail = [];
    (state.imagery.nys || []).forEach(function (n) { avail.push(n.year); });
    (state.imagery.wayback || []).forEach(function (w) { avail.push(w.year); });
    if (!avail.length) return null;
    return avail.reduce(function (best, y) { return Math.abs(y - year) < Math.abs(best - year) ? y : best; });
  }

  function dockSourceNote(year, pref) {
    const base = sourceLabel(year, pref);
    if (layerForYear(year, pref)) return base;
    const near = nearestTileYear(year);
    if (year === 1976 || year === 1984) return base;
    if (near) return base + " · nearest tile " + near;
    return base;
  }

  function setHistLayer() {
    const year = currentYear();
    const pref = state.layerPref;
    const banner = $("#year-banner");
    if (state.compare) { banner.hidden = true; return; }
    if (histLayer) { map.removeLayer(histLayer); histLayer = null; }
    const layer = layerForYear(year, pref);
    $("#year-source").textContent = dockSourceNote(year, pref);
    if (layer) {
      histLayer = layer.addTo(map);
      banner.hidden = true;
    } else {
      histLayer = tileLayerFrom(state.imagery.basemaps.find(function (b) { return b.id === "esri-world-imagery"; })).addTo(map);
      if (isPhoneLayout()) {
        banner.hidden = true;
        return;
      }
      const near = nearestTileYear(year);
      banner.hidden = false;
      let extra = "";
      if (year === 1976 || year === 1984) extra = " Use 1976 vs 1984 for the harbor / Soundview family aerials.";
      else if (year === 1938) extra = " Open a site gallery for the USACE 1938 verticals.";
      else if (year === 2012) extra = " Open a site gallery for USGS Sandy (5 Nov 2012) obliques.";
      else extra = " NYSDOP Suffolk years: 2001, 2004, 2007, 2013, 2016, 2020, 2023. Wayback starts 2014.";
      banner.textContent = "No tile layer for " + year + ". Showing current Esri imagery. Nearest verified tile year: " + (near || "none") + "." + extra;
    }
  }

  function destroyCompare() {
    if (compareLeft) { map.removeLayer(compareLeft); compareLeft = null; }
    if (compareRight) { map.removeLayer(compareRight); compareRight = null; }
    const div = document.querySelector("#map > .compare-divider");
    if (div) div.remove();
    map.off("move resize", resyncClip);
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);
  }

  function dividerEl() { return document.querySelector("#map > .compare-divider"); }

  function setClip(x) {
    const pane = map.getPane("compareRight");
    if (!pane) return;
    const size = map.getSize();
    const xClamped = Math.max(8, Math.min(size.x - 8, x));
    pane.style.clip = "rect(0px, " + size.x + "px, " + size.y + "px, " + xClamped + "px)";
    const d = dividerEl();
    if (d) d.style.left = xClamped + "px";
  }

  function resyncClip() {
    const d = dividerEl();
    if (d) setClip(parseFloat(d.style.left) || map.getSize().x / 2);
  }

  function onDrag(ev) {
    if (!drag) return;
    const rect = map.getContainer().getBoundingClientRect();
    setClip(ev.clientX - rect.left);
  }
  function stopDrag() { drag = false; }

  function enableCompare() {
    destroyCompare();
    if (histLayer) { map.removeLayer(histLayer); histLayer = null; }
    const leftYear = Number($("#compare-left").value);
    const rightYear = Number($("#compare-right").value);
    compareLeft = layerForYear(leftYear, "auto") || layerForYear(leftYear, "current");
    compareRight = layerForYear(rightYear, "auto") || layerForYear(rightYear, "current");
    if (!compareLeft || !compareRight) return;
    if (!map.getPane("compareRight")) {
      map.createPane("compareRight");
      map.getPane("compareRight").style.zIndex = 350;
    }
    compareRight.options.pane = "compareRight";
    compareLeft.addTo(map);
    compareRight.addTo(map);
    const d = document.createElement("div");
    d.className = "compare-divider";
    map.getContainer().appendChild(d);
    d.addEventListener("mousedown", function (e) { e.preventDefault(); drag = true; });
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    map.on("move resize", resyncClip);
    setClip(map.getSize().x / 2);
    $("#year-source").textContent = "Compare tiles " + leftYear + " | " + rightYear;
  }

  function populateCompareSelects() {
    const years = [];
    (state.imagery.nys || []).forEach(function (n) { years.push(n.year); });
    (state.imagery.wayback || []).forEach(function (w) { if (years.indexOf(w.year) < 0) years.push(w.year); });
    years.sort(function (a, b) { return a - b; });
    const left = $("#compare-left");
    const right = $("#compare-right");
    left.innerHTML = "";
    right.innerHTML = "";
    years.forEach(function (y) {
      left.appendChild(new Option(String(y), y));
      right.appendChild(new Option(String(y), y));
    });
    left.value = String(years[0] || 2001);
    right.value = String(years[years.length - 1] || 2023);
  }

  function shoreBadge(site) {
    const cls = site.shore === "north" ? "north" : site.shore === "east" ? "east" : "south";
    const label = site.shore === "north" ? "North / Sound" : site.shore === "east" ? "Point / ESE" : "South / Atlantic";
    return '<span class="badge ' + cls + '">' + label + "</span>";
  }

  function renderList() {
    const ol = $("#site-list");
    ol.innerHTML = "";
    state.sites.forEach(function (site, i) {
      const li = document.createElement("li");
      li.innerHTML =
        '<button class="site-card' + (state.selectedId === site.id ? " is-active" : "") +
        '" data-id="' + site.id + '" type="button">' +
        '<span class="site-num">' + (i + 1) + "</span>" +
        "<div><h3>" + escapeHtml(site.shortName || site.name) + "</h3><p>" +
        escapeHtml(site.setting) + "</p></div>" + shoreBadge(site) + "</button>";
      ol.appendChild(li);
    });
    ol.querySelectorAll(".site-card").forEach(function (btn) {
      btn.addEventListener("click", function () { selectSite(btn.dataset.id, true); });
    });
  }

  function openLightbox(src, cap) {
    $("#lb-img").src = src;
    $("#lb-img").alt = cap;
    $("#lb-cap").textContent = cap;
    $("#lightbox").hidden = false;
  }

  function renderDetail(site) {
    const y = currentYear();
    const nums = (site.keyNumbers || []).map(function (n) {
      const unknown = n.status === "unknown" ? '<span class="key-unknown">research in progress</span>' : "";
      return '<div class="num"><span class="k">' + escapeHtml(n.label) +
        '</span><span class="v">' + escapeHtml(n.value) +
        '</span> <span class="u">' + escapeHtml(n.unit || "") + "</span>" +
        unknown + '<span class="n">' + escapeHtml(n.note || "") + "</span></div>";
    }).join("");

    const timeline = (site.timeline || []).map(function (ev) {
      const on = Math.abs(ev.year - y) <= 2 ? " on" : "";
      const link = ev.sourceUrl ? ' <a href="' + escapeHtml(ev.sourceUrl) + '" target="_blank" rel="noopener">source</a>' : "";
      const tag = ev.status === "placeholder" ? '<div class="placeholder-tag">Placeholder — not yet sourced</div>' : "";
      return '<li class="' + on + '"><div class="y">' + ev.year + "</div><h4>" +
        escapeHtml(ev.title) + "</h4><p>" + escapeHtml(ev.text) + link + "</p>" + tag + "</li>";
    }).join("");

    const photos = (site.photos || []).map(function (p, i) {
      if (!p.src) return '<div class="photo-slot">Photo slot · not yet archived</div>';
      const cap = (p.year ? p.year + " · " : "") + (p.caption || "") + (p.credit ? " · " + p.credit : "");
      return '<figure class="photo-slot" data-i="' + i + '"><img alt="' + escapeHtml(p.caption || "") +
        '" src="' + escapeHtml(p.src) + '" /><figcaption class="photo-cap">' + escapeHtml(cap) + "</figcaption></figure>";
    }).join("");

    const chip = site.storyStatus === "sourced"
      ? '<div class="status-chip">From research/sites.json</div>'
      : '<div class="status-chip">Conservative copy · citations pending</div>';

    const related = (site.related || []).length
      ? '<p class="related">' + site.related.map(function (r) { return "<span>" + escapeHtml(r) + "</span>"; }).join(" ") + "</p>"
      : "";

    const clamp = !state.storyOpen ? " clamp" : "";
    const more = site.story && site.story.length > 400
      ? '<button class="text-btn more-btn" id="btn-more" type="button">' + (state.storyOpen ? "Show less" : "Read full site history") + "</button>"
      : "";

    const photoCompareBtn = (site.id === "harbor_jetties" || site.id === "soundview")
      ? '<button class="ghost" id="btn-site-ac" type="button" style="margin:8px 0">1976 vs 1984 aerials</button>'
      : "";

    $("#site-detail").innerHTML =
      chip + "<h2>" + escapeHtml(site.shortName || site.name) + "</h2>" +
      "<p class='lede'>" + escapeHtml(site.waterbody) + " · " + escapeHtml(site.facing || site.setting) + "</p>" +
      '<p class="story' + clamp + '">' + escapeHtml(site.story) + "</p>" + more +
      '<div class="nums">' + nums + "</div>" + photoCompareBtn +
      "<h3 class='panel-kicker'>Photographs</h3>" +
      '<div class="photos">' + (photos || '<p class="lede">No photographs attached.</p>') + "</div>" +
      "<h3 class='panel-kicker'>Timeline</h3>" +
      (timeline ? '<ol class="timeline">' + timeline + "</ol>" : '<p class="lede">No timeline entered.</p>') +
      related;

    const moreBtn = $("#btn-more");
    if (moreBtn) {
      moreBtn.addEventListener("click", function () {
        state.storyOpen = !state.storyOpen;
        renderDetail(site);
      });
    }
    const ac = $("#btn-site-ac");
    if (ac) ac.addEventListener("click", showAerialCompare);
    $("#site-detail").querySelectorAll(".photo-slot[data-i]").forEach(function (fig) {
      fig.addEventListener("click", function () {
        const p = site.photos[Number(fig.dataset.i)];
        openLightbox(p.src, (p.caption || "") + (p.credit ? " — " + p.credit : ""));
      });
    });
  }

  function selectSite(id, fly, extra) {
    const site = state.sites.find(function (s) { return s.id === id; });
    if (!site) return;
    var openSheet = true;
    if (extra === false) {
      openSheet = false;
      extra = {};
    } else {
      extra = extra || {};
      if (extra.sheet === false) openSheet = false;
    }
    state.selectedId = id;
    state.storyOpen = false;
    $("#panel-list").hidden = true;
    $("#panel-detail").hidden = false;
    renderDetail(site);
    renderList();
    Object.keys(markers).forEach(function (k) {
      const el = markers[k].getElement();
      if (!el) return;
      const pin = el.querySelector(".marker-pin");
      if (pin) pin.classList.toggle("is-on", k === id);
    });
    if (fly) {
      if (state.view === "coast3d" && window.MontaukCoast3D) {
        window.MontaukCoast3D.flyToSite(site);
      } else if (map) {
        map.flyTo([site.lat, site.lng], site.zoom || 16, { duration: 1.05 });
        if (markers[id]) markers[id].openPopup();
      }
    }
    if (openSheet && isPhoneLayout() && state.view !== "coast3d") openSitesSheet();
    highlightEvents();
  }

  function showList() {
    state.selectedId = null;
    $("#panel-list").hidden = false;
    $("#panel-detail").hidden = true;
    renderList();
    highlightEvents();
  }

  function highlightEvents() {
    const y = currentYear();
    const wrap = $("#event-pills");
    wrap.innerHTML = "";
    if (isPhoneLayout()) return;
    (state.events.events || []).forEach(function (ev) {
      const near = Math.abs(ev.year - y) <= 3;
      const span = document.createElement("button");
      span.type = "button";
      span.className = "pill" + (near ? " on" : "") + (ev.status === "placeholder" ? " placeholder" : "");
      span.textContent = ev.year + " · " + ev.title;
      if (ev.sourceUrl) {
        span.title = ev.sourceUrl;
        span.dataset.href = ev.sourceUrl;
      }
      span.addEventListener("click", function (e) {
        if (e.altKey && ev.sourceUrl) { window.open(ev.sourceUrl, "_blank", "noopener"); return; }
        const idx = state.years.indexOf(ev.year);
        if (idx >= 0) { state.yearIndex = idx; $("#year-slider").value = String(idx); onYearChange(); }
        if (ev.siteId) selectSite(ev.siteId, true);
      });
      span.addEventListener("dblclick", function () {
        if (ev.sourceUrl) window.open(ev.sourceUrl, "_blank", "noopener");
      });
      wrap.appendChild(span);
    });
    if (state.selectedId) {
      const site = state.sites.find(function (s) { return s.id === state.selectedId; });
      if (site) renderDetail(site);
    }
  }

  function syncYearSliderTo(year) {
    const idx = state.years.indexOf(year);
    if (idx < 0) return;
    state.yearIndex = idx;
    $("#year-slider").value = String(idx);
    $("#year-label").textContent = String(year);
    $("#year-source").textContent = window.MontaukCoast3D ? window.MontaukCoast3D.yearLabel() : "";
    highlightEvents();
  }

  function coast3dYearLabel() {
    if (!window.MontaukCoast3D) return "";
    window.MontaukCoast3D.setYear(currentYear());
    return window.MontaukCoast3D.yearLabel();
  }

  function rebuildYearsForView() {
    buildYearSlider(currentYear());
    onYearChange();
  }

  function onYearChange() {
    const y = currentYear();
    $("#year-label").textContent = String(y);
    $("#year-slider").value = String(state.yearIndex);
    if (state.view === "coast3d") {
      $("#year-source").textContent = coast3dYearLabel();
    } else if (state.compare) enableCompare();
    else setHistLayer();
    highlightEvents();
    if ((y === 1976 || y === 1984) && !state.compare) {
      /* keep map up; user can open photo compare */
    }
  }

  function siteIcon(site, i) {
    const cls = site.shore === "north" ? " north" : "";
    return L.divIcon({
      className: "montauk-marker",
      html: '<div class="marker-pin' + cls + '"><span>' + (i + 1) + "</span></div>",
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -24],
    });
  }

  function addMarkers() {
    state.sites.forEach(function (site, i) {
      const m = L.marker([site.lat, site.lng], { icon: siteIcon(site, i), title: site.name })
        .addTo(map)
        .bindPopup("<strong>" + escapeHtml(site.shortName || site.name) + "</strong><br>" + escapeHtml(site.waterbody));
      m.on("click", function () { selectSite(site.id, true); });
      markers[site.id] = m;
    });
  }

  function renderStudies() {
    const box = $("#studies-list");
    const caveats = $("#studies-caveats");
    const origin = state.dataOrigin["studies.json"] || "—";
    $("#studies-intro").innerHTML =
      "Origin: <code>" + escapeHtml(origin) + "</code>. Rates below are labeled by agency and period. USGS site-box LRR values were computed from OFR 2010-1119 shapefiles for this compilation — not official USGS published site averages.";
    caveats.innerHTML = (state.studies.caveats || []).map(function (c) {
      return '<p class="caveat">' + escapeHtml(c) + "</p>";
    }).join("");
    const studies = state.studies.studies || [];
    if (!studies.length) {
      box.innerHTML = '<div class="empty-study"><p>No studies loaded. Serve with <code>python3 serve.py</code> so <code>/research/studies.json</code> is visible.</p></div>';
      return;
    }
    box.innerHTML = studies.map(function (s) {
      const link = s.url ? '<p><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.url) + "</a></p>" : "";
      return '<article class="study-card"><h3>' + escapeHtml(s.title || "Untitled") + "</h3><p>" +
        escapeHtml([s.authors, s.year].filter(Boolean).join(" · ")) + "</p><p>" +
        escapeHtml(s.note || "") + "</p>" + link + "</article>";
    }).join("");
  }

  function zoneColor(zone) {
    const z = Number(zone);
    return ZONE_COLORS[z] || "#9aafb8";
  }

  function lrrColor(lrr) {
    if (lrr == null || isNaN(lrr)) return "#9aafb8";
    const t = Math.max(0, Math.min(1, (Number(lrr) + 0.5) / 1.0));
    const stops = [
      [0.00, [194, 59, 34]],
      [0.28, [224, 122, 74]],
      [0.50, [226, 196, 154]],
      [0.78, [126, 208, 192]],
      [1.00, [47, 143, 134]],
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const u = (t - a[0]) / (b[0] - a[0] || 1);
    const rgb = a[1].map(function (c, i) { return Math.round(c + (b[1][i] - c) * u); });
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  function toggleOverlay(id, on) {
    const layer = overlayLayers[id];
    if (!layer || !map) return;
    if (on) {
      if (!map.hasLayer(layer)) layer.addTo(map);
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }

  async function addGisOverlays() {
    const ceha = await tryFetch("data/eh_ceha_zones.geojson");
    const usgs = await tryFetch("data/usgs_lt_montauk.geojson");
    const shore = await tryFetch("data/eh_shoreline.geojson");
    const cusp = await tryFetch("data/cusp_montauk.geojson");
    const west = await tryFetch("data/usace_nsmf_lake_montauk_western_beach.geojson");
    const ny1934 = await tryFetch("data/ny1934c.geojson");

    if (ceha && ceha.features && ceha.features.length) {
      overlayLayers.ceha = L.geoJSON(ceha, {
        style: function (feat) {
          return {
            color: zoneColor(feat.properties && feat.properties.Zone),
            weight: 3.2,
            opacity: 0.92,
            lineCap: "round",
            lineJoin: "round",
          };
        },
        onEachFeature: function (feat, layer) {
          const z = feat.properties && feat.properties.Zone;
          layer.bindPopup("<strong>Coastal Erosion Overlay Zone " + escapeHtml(z) + "</strong><br>Town of East Hampton GIS");
        },
      });
    }

    if (usgs && usgs.features && usgs.features.length) {
      overlayLayers.usgs = L.geoJSON(usgs, {
        style: function (feat) {
          const lrr = feat.properties && feat.properties.LRR;
          return {
            color: lrrColor(lrr),
            weight: 2.6,
            opacity: 0.95,
            lineCap: "butt",
          };
        },
        onEachFeature: function (feat, layer) {
          const p = feat.properties || {};
          const lrr = p.LRR;
          const ft = (lrr == null) ? "—" : (lrr * 3.28084).toFixed(2);
          const lrrTxt = (lrr == null) ? "—" : Number(lrr).toFixed(2);
          const dir = lrr == null ? "" : (lrr < 0 ? "eroding" : lrr > 0 ? "accreting" : "near zero");
          layer.bindPopup(
            "<strong>USGS long-term LRR</strong> " + lrrTxt + " m/yr (" + ft + " ft/yr)" +
            (dir ? " · " + dir : "") +
            "<br>Transect " + escapeHtml(p.TRANSECTID || p.OBJECTID || "") +
            "<br>South shore / Point only — USGS OFR 2010-1119. Not a Soundview rate."
          );
        },
      });
    }

    if (shore && shore.features && shore.features.length) {
      overlayLayers.shore = L.geoJSON(shore, {
        style: { color: "#d7f3ec", weight: 1.4, opacity: 0.7, dashArray: "3 6" },
      });
    }

    if (cusp && cusp.features && cusp.features.length) {
      overlayLayers.cusp = L.geoJSON(cusp, {
        style: { color: "#7ec8ff", weight: 2, opacity: 0.88 },
        onEachFeature: function (feat, layer) {
          const p = feat.properties || {};
          layer.bindPopup(
            "<strong>NOAA CUSP shoreline</strong><br>" +
            escapeHtml(p.SRC_DATE || p.SOURCE || "2014 NGS") +
            "<br>NOAA Digital Coast / NGS"
          );
        },
      });
    }

    if (west && west.features && west.features.length) {
      overlayLayers.west = L.geoJSON(west, {
        style: { color: "#c9a227", weight: 2, opacity: 0.95, fillColor: "#e6c35c", fillOpacity: 0.28 },
        onEachFeature: function (feat, layer) {
          layer.bindPopup("<strong>USACE Lake Montauk Western Beach</strong><br>NSMF placement polygon — west of the inlet (Soundview side).");
        },
      });
    }

    if (ny1934 && ny1934.features && ny1934.features.length) {
      overlayLayers.ny1934 = L.geoJSON(ny1934, {
        style: { color: "#f4b183", weight: 2.4, opacity: 0.92 },
        onEachFeature: function (feat, layer) {
          const p = feat.properties || {};
          layer.bindPopup(
            "<strong>NOAA NY1934C shoreline</strong> (1 Jun 1934)<br>" +
            escapeHtml(p.ATTRIBUTE || "Mean High Water") +
            "<br>Covers Soundview / harbor. Official east bound is west of Ditch and the Point."
          );
        },
      });
    }

    const overlays = {};
    if (overlayLayers.ceha) overlays["E. Hampton CEHA zones"] = overlayLayers.ceha;
    if (overlayLayers.usgs) overlays["USGS LT rates (south shore)"] = overlayLayers.usgs;
    if (overlayLayers.shore) overlays["Town shoreline"] = overlayLayers.shore;
    if (overlayLayers.cusp) overlays["NOAA CUSP 2014"] = overlayLayers.cusp;
    if (overlayLayers.west) overlays["USACE western beach placement"] = overlayLayers.west;
    if (overlayLayers.ny1934) overlays["NOAA 1934 shoreline"] = overlayLayers.ny1934;
    L.control.layers(baseLayers, overlays, { position: "topright", collapsed: true }).addTo(map);

    if (overlayLayers.ceha && $("#tog-ceha").checked) overlayLayers.ceha.addTo(map);
    if (overlayLayers.usgs && $("#tog-usgs").checked) overlayLayers.usgs.addTo(map);
    if (overlayLayers.shore && $("#tog-shore").checked) overlayLayers.shore.addTo(map);

    ["ceha", "usgs", "shore", "cusp", "west", "ny1934"].forEach(function (id) {
      const el = $("#tog-" + id);
      if (!el) return;
      if (!overlayLayers[id]) {
        el.disabled = true;
        el.checked = false;
        return;
      }
      el.addEventListener("change", function () { toggleOverlay(id, el.checked); });
    });

    function syncToggle(layer, id, on) {
      if (overlayLayers[id] !== layer) return;
      const el = $("#tog-" + id);
      if (el) el.checked = on;
    }
    map.on("overlayadd", function (e) {
      ["ceha", "usgs", "shore", "cusp", "west", "ny1934"].forEach(function (id) { syncToggle(e.layer, id, true); });
    });
    map.on("overlayremove", function (e) {
      ["ceha", "usgs", "shore", "cusp", "west", "ny1934"].forEach(function (id) { syncToggle(e.layer, id, false); });
    });

    const loaded = [];
    if (overlayLayers.ceha) loaded.push("CEHA " + ceha.features.length);
    if (overlayLayers.usgs) loaded.push("USGS LT " + usgs.features.length);
    if (overlayLayers.shore) loaded.push("shoreline");
    if (overlayLayers.cusp) loaded.push("CUSP " + cusp.features.length);
    if (overlayLayers.west) loaded.push("western beach");
    if (overlayLayers.ny1934) loaded.push("NY1934C");
    state.dataOrigin.overlays = loaded.join(", ") || "none";
  }

  function initRateStrip() {
    document.querySelectorAll(".rate-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-site");
        const z = Number(btn.getAttribute("data-zoom"));
        if (z && map) map.flyTo(CENTER, z, { duration: 1.0 });
        else if (id) selectSite(id, true);
      });
    });
  }

  function initMap() {
    map = L.map("map", { center: CENTER, zoom: 13, zoomControl: true });
    const esri = state.imagery.basemaps.find(function (b) { return b.id === "esri-world-imagery"; });
    const osm = state.imagery.basemaps.find(function (b) { return b.id === "osm"; });
    baseLayers = { "Esri World Imagery": tileLayerFrom(esri), OpenStreetMap: tileLayerFrom(osm) };
    baseLayers["Esri World Imagery"].addTo(map);
    L.control.scale({ metric: true, imperial: true, position: "bottomleft" }).addTo(map);
    map.on("mousemove", function (e) {
      const lat = Math.abs(e.latlng.lat).toFixed(4);
      const lng = Math.abs(e.latlng.lng).toFixed(4);
      $("#cursor-ll").textContent = lat + "°" + (e.latlng.lat >= 0 ? "N" : "S") + "  " + lng + "°" + (e.latlng.lng >= 0 ? "E" : "W");
    });
    addMarkers();
    setHistLayer();
  }

  function nearestYearInList(year, years) {
    if (!years || !years.length) return null;
    return years.reduce(function (best, y) {
      return Math.abs(y - year) < Math.abs(best - year) ? y : best;
    });
  }

  function yearsForLayout() {
    if (state.view === "coast3d" && window.MontaukCoast3D && window.MontaukCoast3D.sliderYears) {
      return window.MontaukCoast3D.sliderYears();
    }
    const all = (state.imagery && state.imagery.sliderYears) || [];
    if (!isPhoneLayout()) return all.slice();
    return all.filter(function (y) { return !!layerForYear(y, "auto"); });
  }

  function sameYearList(a, b) {
    return a && b && a.length === b.length && a.every(function (y, i) { return y === b[i]; });
  }

  let sliderBound = false;
  function buildYearSlider(preferredYear) {
    const years = yearsForLayout();
    state.years = years;
    const slider = $("#year-slider");
    slider.min = 0;
    slider.max = String(Math.max(0, years.length - 1));
    let idx = years.indexOf(preferredYear);
    if (idx < 0) {
      const near = nearestYearInList(preferredYear, years) || nearestTileYear(preferredYear);
      idx = years.indexOf(near);
    }
    if (idx < 0) idx = years.indexOf(2016);
    if (idx < 0) idx = Math.max(0, years.length - 1);
    state.yearIndex = idx;
    slider.value = String(state.yearIndex);
    $("#year-label").textContent = String(currentYear());
    const ticks = $("#year-ticks");
    ticks.innerHTML = "";
    const tickMarks = state.view === "coast3d"
      ? [1871, 1892, 1938, 1962, 1996, 2000, 2014, 2023, years[years.length - 1]]
      : [years[0], 1976, 1996, 2004, 2012, 2016, 2024, years[years.length - 1]];
    tickMarks
      .filter(function (y, i, a) { return y != null && a.indexOf(y) === i && years.indexOf(y) >= 0; })
      .forEach(function (y) {
        const s = document.createElement("span");
        s.textContent = y;
        ticks.appendChild(s);
      });
    if (!sliderBound) {
      slider.addEventListener("input", function () {
        state.yearIndex = Number(slider.value);
        onYearChange();
      });
      sliderBound = true;
    }
  }

  function initSlider() {
    buildYearSlider(2016);
    window.addEventListener("resize", function () {
      const next = yearsForLayout();
      if (sameYearList(next, state.years)) return;
      buildYearSlider(currentYear());
      onYearChange();
    });
  }

  let acDrag = false;
  function setAerialClip(x) {
    const frame = $("#ac-frame");
    const clip = $("#ac-right-clip");
    const div = $("#ac-divider");
    const w = frame.clientWidth;
    const xClamped = Math.max(8, Math.min(w - 8, x));
    clip.style.clipPath = "inset(0 0 0 " + xClamped + "px)";
    div.style.left = xClamped + "px";
  }

  function showAerialCompare() {
    const box = $("#aerial-compare");
    $("#ac-left").src = "assets/aerials/1976-harbor-wide.jpg";
    $("#ac-right").src = "assets/aerials/1984-harbor.jpg";
    box.hidden = false;
    document.body.classList.add("ac-open");
    requestAnimationFrame(function () { setAerialClip(box.querySelector(".ac-frame").clientWidth / 2); });
    if (!state.selectedId || (state.selectedId !== "harbor_jetties" && state.selectedId !== "soundview")) {
      selectSite("harbor_jetties", true, false);
    }
    closeSheets();
  }

  function hideAerialCompare() {
    $("#aerial-compare").hidden = true;
    document.body.classList.remove("ac-open");
  }

  function initAerialCompare() {
    const div = $("#ac-divider");
    const frame = $("#ac-frame");
    div.addEventListener("mousedown", function (e) { e.preventDefault(); acDrag = true; });
    window.addEventListener("mousemove", function (e) {
      if (!acDrag) return;
      const r = frame.getBoundingClientRect();
      setAerialClip(e.clientX - r.left);
    });
    window.addEventListener("mouseup", function () { acDrag = false; });
    $("#ac-close").addEventListener("click", hideAerialCompare);
    $("#btn-photo-compare").addEventListener("click", function () {
      if ($("#aerial-compare").hidden) {
        closeSheets();
        showAerialCompare();
      } else hideAerialCompare();
    });
  }


  function initCehaViewer() {
    const grid = $("#ceha-grid");
    const sheets = (state.cehaSheets && state.cehaSheets.sheets) || [];
    grid.innerHTML = sheets.map(function (s, i) {
      const assigned = s.siteId ? " is-assigned" : "";
      const cap = (s.caption || s.label || "") + " · NYSDEC";
      return '<button type="button" class="ceha-card' + assigned + '" data-i="' + i + '">' +
        '<img src="' + escapeHtml(s.file) + '" alt="' + escapeHtml(cap) + '" />' +
        "<p>" + escapeHtml(cap) + (s.siteId ? " · pinned" : "") + "</p></button>";
    }).join("");
    grid.querySelectorAll(".ceha-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const s = sheets[Number(btn.dataset.i)];
        if (!s) return;
        openLightbox(s.file, (s.caption || s.label) + " — NYSDEC CEHA legal map");
        if (s.siteId) selectSite(s.siteId, true);
      });
    });
    function show() { closeSheets(); $("#ceha-viewer").hidden = false; }
    function hide() { $("#ceha-viewer").hidden = true; }
    $("#btn-ceha").addEventListener("click", function () {
      if ($("#ceha-viewer").hidden) show();
      else hide();
    });
    $("#ceha-close").addEventListener("click", hide);
  }


  function isPhoneLayout() {
    return window.matchMedia("(max-width: 900px), (max-height: 520px)").matches;
  }

  function refreshMapSize() {
    if (map) setTimeout(function () { map.invalidateSize(); }, 240);
  }

  function placeChromeTools() {
    const tools = $("#chrome-tools");
    const home = $("#top-meta");
    const slot = $("#sheet-tools-slot");
    const layer = $("#dock-source");
    const dock = document.querySelector("#app > .dock");
    const layerSlot = $("#sheet-layer-slot");
    if (tools && home && slot) {
      if (isPhoneLayout()) {
        if (tools.parentNode !== slot) slot.appendChild(tools);
      } else if (tools.parentNode !== home) {
        home.appendChild(tools);
      }
    }
    if (layer && dock && layerSlot) {
      if (isPhoneLayout()) {
        if (layer.parentNode !== layerSlot) layerSlot.appendChild(layer);
      } else if (layer.parentNode !== dock) {
        dock.appendChild(layer);
      }
    }
  }

  function closeSheets() {
    var panel = $("#panel");
    var gis = $("#gis-panel");
    var scrim = $("#sheet-scrim");
    var sitesBtn = $("#btn-sites");
    var overlaysBtn = $("#btn-overlays");
    if (panel) panel.classList.remove("is-open");
    if (gis) gis.classList.remove("is-open");
    if (sitesBtn) sitesBtn.setAttribute("aria-expanded", "false");
    if (overlaysBtn) overlaysBtn.setAttribute("aria-expanded", "false");
    if (scrim) {
      scrim.hidden = true;
      scrim.classList.remove("is-on");
    }
    refreshMapSize();
  }

  function openSitesSheet() {
    if (!isPhoneLayout()) return;
    var gis = $("#gis-panel");
    var overlaysBtn = $("#btn-overlays");
    if (gis) gis.classList.remove("is-open");
    if (overlaysBtn) overlaysBtn.setAttribute("aria-expanded", "false");
    $("#panel").classList.add("is-open");
    $("#btn-sites").setAttribute("aria-expanded", "true");
    var scrim = $("#sheet-scrim");
    scrim.hidden = false;
    scrim.classList.add("is-on");
    refreshMapSize();
  }

  function openOverlaysSheet() {
    if (!isPhoneLayout()) return;
    $("#panel").classList.remove("is-open");
    $("#btn-sites").setAttribute("aria-expanded", "false");
    $("#gis-panel").classList.add("is-open");
    $("#btn-overlays").setAttribute("aria-expanded", "true");
    var scrim = $("#sheet-scrim");
    scrim.hidden = false;
    scrim.classList.add("is-on");
    refreshMapSize();
  }

  function initDrawers() {
    var sitesBtn = $("#btn-sites");
    var overlaysBtn = $("#btn-overlays");
    var scrim = $("#sheet-scrim");
    var sheetClose = $("#btn-sheet-close");
    var gisClose = $("#btn-gis-close");
    if (sitesBtn) {
      sitesBtn.addEventListener("click", function () {
        if ($("#panel").classList.contains("is-open")) closeSheets();
        else openSitesSheet();
      });
    }
    if (overlaysBtn) {
      overlaysBtn.addEventListener("click", function () {
        if ($("#gis-panel").classList.contains("is-open")) closeSheets();
        else openOverlaysSheet();
      });
    }
    if (scrim) scrim.addEventListener("click", closeSheets);
    if (sheetClose) sheetClose.addEventListener("click", closeSheets);
    if (gisClose) gisClose.addEventListener("click", closeSheets);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSheets();
    });
    window.addEventListener("resize", function () {
      placeChromeTools();
      if (!isPhoneLayout()) closeSheets();
      if (state.view === "coast3d" && window.MontaukCoast3D) window.MontaukCoast3D.resize();
    });
    placeChromeTools();
  }

  function setView(view) {
    if (!view) return;
    if (view === "3d") view = "coast3d";
    state.view = view;
    document.querySelectorAll(".tab").forEach(function (t) {
      const on = t.dataset.view === view;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#app").classList.toggle("is-coast3d", view === "coast3d");
    $("#studies-view").hidden = view !== "studies";
    if ($("#coast3d-view")) $("#coast3d-view").hidden = view !== "coast3d";
    if (view === "studies" || view === "coast3d") closeSheets();
    if (view === "coast3d") {
      hideAerialCompare();
      $("#compare-bar").hidden = true;
      $("#year-banner").hidden = true;
      rebuildYearsForView();
      if (window.MontaukCoast3D) {
        window.MontaukCoast3D.show();
        $("#year-source").textContent = coast3dYearLabel();
        const site = state.sites.find(function (s) { return s.id === (state.selectedId || "ditch_plains"); });
        if (site) window.MontaukCoast3D.flyToSite(site);
      }
    } else {
      if (window.MontaukCoast3D) window.MontaukCoast3D.hide();
      rebuildYearsForView();
      $("#compare-bar").hidden = !state.compare;
      if (view === "map") {
        refreshMapSize();
        if (state.compare) enableCompare();
        else setHistLayer();
      }
    }
  }

  function initChrome() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setView(tab.dataset.view);
      });
    });
    initDrawers();
    $("#btn-back").addEventListener("click", showList);
    $("#btn-compare").addEventListener("click", function () {
      state.compare = !state.compare;
      this.setAttribute("aria-pressed", state.compare ? "true" : "false");
      $("#compare-bar").hidden = !state.compare;
      if (state.compare) { closeSheets(); hideAerialCompare(); enableCompare(); }
      else { destroyCompare(); setHistLayer(); }
    });
    $("#compare-left").addEventListener("change", function () { if (state.compare) enableCompare(); });
    $("#compare-right").addEventListener("change", function () { if (state.compare) enableCompare(); });
    $("#layer-source").addEventListener("change", function () {
      state.layerPref = this.value;
      if (state.compare) enableCompare();
      else setHistLayer();
    });
    $("#lb-close").addEventListener("click", function () { $("#lightbox").hidden = true; });
    $("#lightbox").addEventListener("click", function (e) {
      if (e.target.id === "lightbox") $("#lightbox").hidden = true;
    });
  }

  function applyHash() {
    const hash = (location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash.includes("=") ? hash : "");
    const viewFromHash = params.get("view");
    if (viewFromHash === "3d" || viewFromHash === "coast3d") setView("coast3d");
    const y = Number(params.get("year"));
    if (y) {
      let idx = state.years.indexOf(y);
      if (idx < 0) {
        const near = nearestYearInList(y, state.years);
        idx = state.years.indexOf(near);
      }
      if (idx >= 0) {
        state.yearIndex = idx;
        onYearChange();
      }
    }
    const siteFromHash = params.get("site") || (hash && FOCUS.indexOf(hash) >= 0 ? hash : "");
    if (siteFromHash) selectSite(siteFromHash, true);
    if (params.get("compare") === "1" && !state.compare) $("#btn-compare").click();
    if (params.get("aerials") === "1" && $("#aerial-compare").hidden) showAerialCompare();
  }

  async function boot() {
    const researchSites = await loadFirst(["/research/sites.json", "../montauk-erosion/research/sites.json"], "research-sites");
    const localSites = await loadFirst(["data/sites.json"], "sites.json");
    const researchImagery = await loadFirst(["/research/imagery.json", "../montauk-erosion/research/imagery.json"], "research-imagery");
    const localImagery = await loadFirst(["data/imagery.json"], "imagery.json");
    const researchStudies = await loadFirst(["/research/studies.json", "../montauk-erosion/research/studies.json"], "studies.json");
    const localStudies = await loadFirst(["data/studies.json"]);
    const waybackDoc = await loadFirst(["/research/esri_wayback_releases.json", "data/wayback.json"], "wayback");
    const events = await loadFirst(["data/events.json"], "events.json");
    const cehaSheets = await loadFirst(["data/ceha-sheets.json"], "ceha-sheets.json");
    state.cehaSheets = cehaSheets || { sheets: [] };

    if (!localImagery || !localImagery.basemaps) {
      document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif'>Could not load data/imagery.json. Run python3 serve.py in this folder.</p>";
      return;
    }

    state.sites = mergeSites(researchSites, localSites);
    state.imagery = localImagery;
    state.imagery.wayback = yearlyWayback(waybackDoc, localImagery);
    if (researchImagery && researchImagery.leaflet_tiles && researchImagery.leaflet_tiles.nys_ortho_xyz) {
      const yrs = researchImagery.leaflet_tiles.nys_ortho_xyz.years_covering_montauk_suffolk || [];
      if (yrs.length) {
        state.imagery.nys = yrs.map(function (y) {
          const year = parseInt(y, 10);
          return {
            year: year,
            name: "NYSDOP " + year,
            url: "https://orthos.its.ny.gov/arcgis/rest/services/wms/" + year + "/MapServer/tile/{z}/{y}/{x}",
            httpFallback: "http://orthos.its.ny.gov/arcgis/rest/services/wms/" + year + "/MapServer/tile/{z}/{y}/{x}",
            verified: true,
          };
        });
      }
    }
    state.studies = normalizeStudies(researchStudies, localStudies);
    state.events = events || { events: [] };

    if (!state.sites.length) {
      document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif'>No sites loaded.</p>";
      return;
    }

    initChrome();
    initSlider();
    populateCompareSelects();
    renderList();
    renderStudies();
    initMap();
    if (window.MontaukCoast3D) {
      await window.MontaukCoast3D.init({
        sites: state.sites,
        imagery: state.imagery,
        getYear: currentYear,
        onPhoto: function (photo) {
          openLightbox(photo.src, (photo.caption || "") + (photo.credit ? " — " + photo.credit : ""));
        },
        onSite: function (id, extra) {
          selectSite(id, extra && extra.fly === true, extra);
        },
        onYear: function (y) {
          syncYearSliderTo(y);
        },
        onReady: function () {
          if (state.view !== "coast3d") return;
          const site = state.sites.find(function (s) { return s.id === (state.selectedId || "ditch_plains"); });
          if (site) window.MontaukCoast3D.flyToSite(site);
        }
      });
    }
    await addGisOverlays();
    initRateStrip();
    initAerialCompare();
    initCehaViewer();
    highlightEvents();
    $("#year-source").textContent = dockSourceNote(currentYear(), state.layerPref);
    applyHash();
    window.addEventListener("hashchange", applyHash);
  }

  boot();
})();
