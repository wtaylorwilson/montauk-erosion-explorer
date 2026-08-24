/* Illustrated Change tab — USGS HWL sparklines + sourced volumes. No Three.js. */
(function () {
  "use strict";

  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const ORDER = ["ditch_plains", "ocean_beaches", "lighthouse", "soundview", "harbor_jetties"];

  let data = null;
  let opts = {};
  let selectedId = "ditch_plains";
  let year = 2000;
  let locator = null;
  let locLayers = [];
  let shown = false;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function siteById(id) {
    return (data.sites || []).find(function (s) { return s.id === id; });
  }

  function nearestPoint(series, y) {
    if (!series || !series.length) return null;
    return series.reduce(function (best, p) {
      return Math.abs(p.year - y) < Math.abs(best.year - y) ? p : best;
    });
  }

  function yDomain() {
    let lo = 0, hi = 0;
    (data.sites || []).forEach(function (s) {
      (s.series || []).forEach(function (p) {
        if (p.m < lo) lo = p.m;
        if (p.m > hi) hi = p.m;
      });
    });
    const pad = Math.max(8, (hi - lo) * 0.08);
    return { lo: lo - pad, hi: hi + pad };
  }

  function sparkSvg(site, domain) {
    const series = site.series || [];
    const w = 320, h = 96, l = 36, r = 10, t = 8, b = 20;
    const iw = w - l - r, ih = h - t - b;
    const years = (data.sliderYears || []).slice();
    const x0 = years[0] || 1830, x1 = years[years.length - 1] || 2021;
    const x = function (yr) { return l + ((yr - x0) / (x1 - x0)) * iw; };
    const y = function (m) { return t + ((domain.hi - m) / (domain.hi - domain.lo)) * ih; };
    const y0 = y(0);
    const play = nearestPoint(series, year);

    let surveyed = "";
    let modeled = "";
    let held = "";
    series.forEach(function (p, i) {
      const next = series[i + 1];
      if (!next) return;
      const seg = "M" + x(p.year).toFixed(1) + " " + y(p.m).toFixed(1) +
        " L" + x(next.year).toFixed(1) + " " + y(next.m).toFixed(1);
      if (p.status === "held" || next.status === "held") held += seg;
      else if (p.status === "modeled" || next.status === "modeled") modeled += seg;
      else surveyed += seg;
    });

    const dots = series.filter(function (p) { return p.status === "surveyed"; }).map(function (p) {
      return '<circle class="ch-dot" cx="' + x(p.year).toFixed(1) + '" cy="' + y(p.m).toFixed(1) + '" r="2.2" />';
    }).join("");

    const playX = play ? x(play.year) : x(year);
    const playY = play ? y(play.m) : y0;
    const playLbl = play
      ? (play.m > 0 ? "+" : "") + play.m.toFixed(0) + " m"
      : "";

    return (
      '<svg class="ch-spark" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' +
      escapeHtml(site.name) + ' shoreline position relative to 2000">' +
      '<line class="ch-zero" x1="' + l + '" y1="' + y0.toFixed(1) + '" x2="' + (w - r) + '" y2="' + y0.toFixed(1) + '" />' +
      '<text class="ch-axis" x="4" y="' + (y0 + 3).toFixed(1) + '">2000</text>' +
      '<text class="ch-axis" x="4" y="' + (t + 8) + '">+' + Math.round(domain.hi) + " m</text>" +
      '<text class="ch-axis" x="4" y="' + (h - 6) + '">' + Math.round(domain.lo) + " m</text>" +
      '<path class="ch-line is-surveyed" d="' + surveyed + '" />' +
      '<path class="ch-line is-modeled" d="' + modeled + '" />' +
      '<path class="ch-line is-held" d="' + held + '" />' +
      dots +
      '<line class="ch-play" x1="' + playX.toFixed(1) + '" y1="' + t + '" x2="' + playX.toFixed(1) + '" y2="' + (h - b) + '" />' +
      (play ? '<circle class="ch-now" cx="' + playX.toFixed(1) + '" cy="' + playY.toFixed(1) + '" r="3.4" />' : "") +
      (play ? '<text class="ch-now-lbl" x="' + Math.min(w - 44, playX + 5).toFixed(1) + '" y="' + Math.max(t + 10, playY - 6).toFixed(1) + '">' + playLbl + "</text>" : "") +
      '<text class="ch-year" x="' + l + '" y="' + (h - 4) + '">' + x0 + "</text>" +
      '<text class="ch-year" x="' + (w - r - 22) + '" y="' + (h - 4) + '">' + x1 + "</text>" +
      "</svg>"
    );
  }

  function chipsHtml(site) {
    return (site.keyNumbers || []).map(function (n) {
      return '<span class="ch-chip"><b>' + escapeHtml(n.label) + "</b> " +
        escapeHtml(n.value) + (n.unit ? " " + escapeHtml(n.unit) : "") + "</span>";
    }).join("");
  }

  function siteCard(site, domain) {
    const on = site.id === selectedId ? " is-on" : "";
    const hwl = site.hasHwl && site.series && site.series.length;
    const play = nearestPoint(site.series, year);
    const statusNote = play && play.status === "modeled"
      ? data.modeledCaption
      : play && play.status === "held"
        ? data.heldCaption
        : "";
    const extra = [];
    if (site.id === "ocean_beaches" && hwl) {
      extra.push("At the Kirk Park pin the 1870 HWL sits landward of 2000. The −0.11 m/yr figure is the Montauk south-shore box median, not this pin.");
    }
    if (site.id === "ditch_plains" && hwl) {
      extra.push("1871 is modeled from the USGS HWL trend between the 1870 and 1892 surveys. The step down to the 2000 line is the surveyed change.");
    }
    if (site.carpNote) extra.push(site.carpNote);
    if (site.hwlNote) extra.push(site.hwlNote);

    let body = "";
    if (hwl) {
      body += sparkSvg(site, domain);
      body += '<p class="ch-caption">' + escapeHtml(data.y) + "</p>";
      if (statusNote) body += '<p class="ch-caption is-model">' + escapeHtml(statusNote) + "</p>";
    } else {
      body += '<div class="ch-empty-line"><p>No USGS high-water-line series.</p></div>';
      if (site.quote) {
        body += '<blockquote class="ch-quote"><p>' + escapeHtml(site.quote.text) + "</p><footer>" +
          escapeHtml(site.quote.attribution) + " — " + escapeHtml(site.quote.note) + "</footer></blockquote>";
      }
    }
    extra.forEach(function (note) {
      body += '<p class="ch-note">' + escapeHtml(note) + "</p>";
    });

    return (
      '<button type="button" class="ch-site' + on + '" data-site="' + site.id + '">' +
      '<header class="ch-site-head">' +
      '<p class="ch-kicker">' + escapeHtml((site.shore || "") + " · " + (site.waterbody || "")) + "</p>" +
      "<h3>" + escapeHtml(site.name) + "</h3>" +
      '<div class="ch-chips">' + chipsHtml(site) + "</div>" +
      "</header>" + body + "</button>"
    );
  }

  function volumeHtml() {
    const vols = data.volumes || [];
    const groups = [
      { title: "Ditch Plains dune", ids: ["ditch_remnant_2020", "ditch_remnant_2024", "ditch_rebuild"] },
      { title: "Downtown FIMP", ids: ["downtown_fimp"] },
      { title: "Soundview placement", ids: ["soundview_2025"] },
    ];
    const by = {};
    vols.forEach(function (v) { by[v.id] = v; });
    return groups.map(function (g) {
      const rows = g.ids.map(function (id) { return by[id]; }).filter(Boolean);
      const max = Math.max.apply(null, rows.map(function (v) { return v.cy; })) || 1;
      const bars = rows.map(function (v) {
        const pct = Math.max(3, (v.cy / max) * 100);
        const num = (v.approx ? "~" : "") + v.cy.toLocaleString("en-US") + " cy";
        return (
          '<div class="ch-bar" data-site="' + v.siteId + '">' +
          '<div class="ch-bar-row"><span>' + escapeHtml(v.label) + "</span><strong>" + num + "</strong></div>" +
          '<i style="width:' + pct.toFixed(1) + '%"></i>' +
          '<p class="ch-caption">' + escapeHtml(v.source) + "</p></div>"
        );
      }).join("");
      return '<div class="ch-vol-group"><h3>' + escapeHtml(g.title) + "</h3>" + bars + "</div>";
    }).join("");
  }

  function ensureShell() {
    const root = $("#change-view");
    if (!root || root.querySelector(".change-inner")) return;
    root.innerHTML =
      '<div class="change-inner">' +
      '<p class="ch-kicker">Change · USGS high-water line</p>' +
      "<h2>How far the water has come in</h2>" +
      '<p class="ch-dek" id="change-dek"></p>' +
      '<section class="ch-locator-wrap">' +
      '<div class="ch-locator-head"><h3 id="change-loc-title"></h3>' +
      '<p class="ch-caption" id="change-loc-status"></p></div>' +
      '<div id="change-locator" class="ch-locator" role="application" aria-label="Site locator with USGS high-water lines"></div>' +
      '<p class="ch-caption" id="change-locator-note"></p>' +
      "</section>" +
      '<section class="ch-multiples" id="change-multiples" aria-label="Site shoreline charts"></section>' +
      '<section class="ch-volumes" id="change-volumes"></section>' +
      '<p class="ch-footer" id="change-footer"></p>' +
      "</div>";
  }

  function render() {
    const root = $("#change-view");
    if (!root || !data) return;
    ensureShell();
    const domain = yDomain();
    const sites = ORDER.map(siteById).filter(Boolean);
    const locSite = siteById(selectedId) || sites[0];
    const play = nearestPoint(locSite && locSite.series, year);
    const locNote = locSite && locSite.locator
      ? locSite.locator.lostNote
      : (locSite && locSite.hwlNote) || "";

    $("#change-dek").innerHTML =
      "Meters of shoreline at each south / Point pin, relative to the <strong>2000 USGS high-water line</strong> (seaward +, landward −). " +
      "Solid ticks are surveyed HWL years. Dashed decades are modeled. 2001–2021 are held at 2000. " +
      "This is not a lidar-change map and not a 3D mesh. " +
      escapeHtml(data.same1830_1870 || "");
    $("#change-loc-title").textContent = locSite ? locSite.name : "";
    $("#change-loc-status").textContent = play
      ? (play.year + " · " + play.status + " · " + (play.m >= 0 ? "+" : "") + play.m.toFixed(1) + " m vs 2000")
      : (locSite && !locSite.hasHwl ? "No USGS HWL at this pin" : "");
    $("#change-locator-note").textContent = locNote || "";
    $("#change-multiples").innerHTML = sites.map(function (s) { return siteCard(s, domain); }).join("");
    $("#change-volumes").innerHTML =
      '<p class="ch-kicker">Sourced fill</p><h2>Cubic yards, not modeled widths</h2>' +
      '<p class="ch-dek">Only numbers printed in <code>sites.json</code>. Ditch remnant collapse, then the 20,000 cy rebuild. Downtown FIMP. Soundview 2025 placement. No invented harbor width.</p>' +
      volumeHtml();
    $("#change-footer").textContent = (data.credit || "") + " " + (data.lidarNote || "") +
      " This page does not claim lidar change. CARP rates stay in the notes — they are ft/yr from a different method and period than USGS LRR.";

    root.querySelectorAll(".ch-site").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pickSite(btn.dataset.site, true);
      });
    });
    root.querySelectorAll(".ch-bar").forEach(function (el) {
      el.addEventListener("click", function () {
        if (el.dataset.site) pickSite(el.dataset.site, true);
      });
    });
    mountLocator();
  }

  function pickSite(id, bubble) {
    if (!siteById(id)) return;
    selectedId = id;
    if (bubble && opts.onSite) opts.onSite(id);
    render();
  }

  function clearLocator() {
    locLayers.forEach(function (ly) {
      if (locator && locator.hasLayer(ly)) locator.removeLayer(ly);
    });
    locLayers = [];
  }

  function lostForYear(loc) {
    if (!loc) return [];
    const key = String(year);
    if (year >= 2000) return loc.lost || [];
    if (loc.lostByYear && loc.lostByYear[key] && loc.lostByYear[key].length) return loc.lostByYear[key];
    return loc.lost || [];
  }

  function mountLocator() {
    const el = $("#change-locator");
    if (!el || !window.L) return;
    const site = siteById(selectedId);
    if (!site) return;
    if (!locator) {
      locator = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(ESRI, {
        attribution: "Esri · USGS OFR 2010-1119",
        maxZoom: 19,
      }).addTo(locator);
      L.control.scale({ metric: true, imperial: true, position: "bottomleft" }).addTo(locator);
    } else {
      locator.invalidateSize();
    }
    clearLocator();
    locator.setView([site.lat, site.lng], 16);
    const pin = L.circleMarker([site.lat, site.lng], {
      radius: 6, color: "#1a140c", weight: 1.5, fillColor: "#f3ead8", fillOpacity: 1,
    }).addTo(locator);
    locLayers.push(pin);

    const loc = site.locator;
    if (!loc) return;

    const lost = lostForYear(loc);
    const lostStyle = {
      color: "#8c2f16",
      weight: 0.6,
      fillColor: "#c45a32",
      fillOpacity: year >= 2000 ? 0.55 : 0.38,
      className: "ch-lost-fill",
    };
    (lost || []).forEach(function (ring) {
      if (!ring || ring.length < 4) return;
      const poly = L.polygon(ring.map(function (c) { return [c[1], c[0]]; }), lostStyle).addTo(locator);
      locLayers.push(poly);
    });

    function addLine(coords, cls, dash) {
      if (!coords || coords.length < 2) return;
      const line = L.polyline(coords.map(function (c) { return [c[1], c[0]]; }), {
        color: cls === "now" ? "#f4ead6" : cls === "early" ? "#f0d08a" : "#e7eef2",
        weight: cls === "now" ? 3 : 2.5,
        dashArray: dash || null,
        opacity: 1,
      }).addTo(locator);
      locLayers.push(line);
    }

    addLine(loc.early, "early", loc.earlyStatus === "modeled" ? "6 5" : null);
    addLine(loc.y2000, "y2000", null);
    const rec = loc.lines && loc.lines[String(year)];
    if (rec && rec.line && year !== loc.earlyYear && year !== 2000) {
      addLine(rec.line, "now", rec.status === "surveyed" ? null : "5 4");
    }
    const all = [].concat(loc.early || [], loc.y2000 || []);
    if (all.length) {
      locator.fitBounds(L.latLngBounds(all.map(function (c) { return [c[1], c[0]]; })), { padding: [18, 18], maxZoom: 17 });
    }
  }

  function yearLabel() {
    const site = siteById(selectedId);
    const play = nearestPoint(site && site.series, year);
    if (!play) {
      if (site && !site.hasHwl) return "No USGS HWL on the north shore";
      return "USGS HWL";
    }
    if (play.status === "modeled") return data.modeledCaption;
    if (play.status === "held") return data.heldCaption;
    return "USGS surveyed high-water line";
  }

  async function init(options) {
    opts = options || {};
    try {
      const res = await fetch("data/change.json");
      data = await res.json();
    } catch (err) {
      data = { sites: [], volumes: [], sliderYears: [1870, 2000], modeledCaption: "Modeled from USGS HWL trend. Not a surveyed shoreline.", heldCaption: "Held at 2000 — no later Montauk HWL in OFR 2010-1119. Not a surveyed shoreline." };
    }
    if (opts.getYear) year = opts.getYear() || year;
    if (opts.selectedId) selectedId = opts.selectedId;
  }

  function show() {
    shown = true;
    const el = $("#change-view");
    if (el) el.hidden = false;
    render();
    if (locator) setTimeout(function () { locator.invalidateSize(); }, 80);
  }

  function hide() {
    shown = false;
    const el = $("#change-view");
    if (el) el.hidden = true;
  }

  function setYear(y) {
    year = Number(y) || year;
    if (shown) render();
  }

  function selectSite(id) {
    if (!siteById(id)) return;
    selectedId = id;
    if (shown) render();
  }

  function sliderYears() {
    return (data && data.sliderYears) ? data.sliderYears.slice() : [1870, 1892, 1938, 1962, 2000, 2021];
  }

  window.MontaukChange = {
    init: init,
    show: show,
    hide: hide,
    setYear: setYear,
    selectSite: selectSite,
    sliderYears: sliderYears,
    yearLabel: yearLabel,
  };
})();
