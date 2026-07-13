// globe.js — interactive 3D footprint globe (Canvas 2D), per PRD §5.
//
// Three layers, replaced (not stacked):
//   1. Globe   — draggable/auto-rotating sphere, amber pulse markers on visited countries.
//   2. Country — real ADM1 boundaries; visited regions highlighted; drillable ones glow.
//   3. City    — real ADM2 boundaries within a province; visited cities highlighted.
//
// Geo data lives in /static/geo/ and is lazy-loaded per layer (zero network until
// the user drills in). Visited places come from /api/footprints (live from the DB).
(function () {
  "use strict";

  var canvas = document.getElementById("globe-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  // ---- theme colors (mirror crt.css tokens) ----
  var C = {
    ocean1: "#0e2a1a", ocean2: "#061309",
    land: "#123a24", landLine: "#1f5c3a",
    border: "#2a6b45", rim: "rgba(74,222,128,0.55)",
    green: "#4ade80", amber: "#fbbf24", text: "#c8f5d3", muted: "#5a7d63",
    visited: "rgba(74,222,128,0.42)", visitedLine: "#4ade80",
    drill: "rgba(251,191,36,0.16)", drillLine: "#fbbf24",
    region: "rgba(30,60,40,0.55)", regionLine: "#2a6b45",
  };

  // ---- province-name -> drill-file key mapping (admin stores localized names) ----
  // China uses adcode; JP/MY files are keyed by English ADM1 name (spaces -> _).
  var CN_ADCODE = {
    "北京市": "110000", "湖南省": "430000", "广东省": "440000",
    "浙江省": "330000", "四川省": "510000", "江苏省": "320000",
  };

  // ============================================================
  // State
  // ============================================================
  var state = {
    layer: "globe",      // globe | country | city
    country: null,       // {code,name}
    province: null,      // {name,key}
    footprints: [],      // grouped [{code,name,provinces:[{name,cities:[]}]}]
    rot: { x: -0.35, y: 0 },   // x=tilt, y=spin
    spin: 0.0016,        // auto-rotation speed
    dragging: false,
    lastPt: null,
    vel: { x: 0, y: 0 },
    raf: null,
    regionData: null,    // loaded country/city geojson-ish {view,regions}
    hover: null,
  };

  var world = null;      // world.json
  var R;                 // sphere radius (set on resize)
  var CX, CY;            // canvas center

  // ============================================================
  // Sizing (PRD §3.4: min(innerWidth-40, 440))
  // ============================================================
  function resize() {
    var size = Math.min(window.innerWidth - 40, 440);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = size * 0.42;
    CX = size / 2;
    CY = size / 2;
  }

  // ============================================================
  // Sphere projection: lon/lat -> rotated 3D -> screen.
  // Returns {x,y,visible} where visible=false means back-facing (culled).
  // ============================================================
  function project(lon, lat) {
    var la = (lat * Math.PI) / 180;
    var lo = (lon * Math.PI) / 180;
    // Unit sphere point.
    var x = Math.cos(la) * Math.sin(lo);
    var y = Math.sin(la);
    var z = Math.cos(la) * Math.cos(lo);
    // Rotate around Y (spin), then X (tilt).
    var cosy = Math.cos(state.rot.y), siny = Math.sin(state.rot.y);
    var x1 = x * cosy - z * siny;
    var z1 = x * siny + z * cosy;
    var cosx = Math.cos(state.rot.x), sinx = Math.sin(state.rot.x);
    var y2 = y * cosx - z1 * sinx;
    var z2 = y * sinx + z1 * cosx;
    return { x: CX + x1 * R, y: CY - y2 * R, visible: z2 > 0, z: z2 };
  }

  // ============================================================
  // Layer 1 — the globe
  // ============================================================
  function drawGlobe() {
    var size = R / 0.42;
    ctx.clearRect(0, 0, size, size);

    // Ocean sphere with radial shading (near-bright -> far-dark).
    var grad = ctx.createRadialGradient(CX - R * 0.3, CY - R * 0.3, R * 0.1, CX, CY, R);
    grad.addColorStop(0, C.ocean1);
    grad.addColorStop(1, C.ocean2);
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowing rim.
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = C.rim;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = C.green;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();

    // Clip to sphere for land/borders.
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.clip();

    drawRings(world.land, C.land, C.landLine, 0.6, true);
    drawRings(world.borders, null, C.border, 0.4, false);

    ctx.restore();

    // Amber pulse markers for visited countries.
    var t = Date.now() / 600;
    state.footprints.forEach(function (fp) {
      var meta = world.countries[fp.code];
      if (!meta) return;
      var p = project(meta.c[0], meta.c[1]);
      if (!p.visible) return;
      var pulse = 4 + Math.sin(t) * 1.6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse + 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251,191,36,0.18)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = C.amber;
      ctx.shadowColor = C.amber;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
      // Country code label.
      ctx.fillStyle = C.amber;
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillText(fp.code, p.x + pulse + 4, p.y + 3);
    });
  }

  // Draw an array of rings [[ [lon,lat], ... ], ...] on the sphere with back-face
  // culling: break the path whenever a vertex rotates behind the globe.
  function drawRings(rings, fill, stroke, lw, doFill) {
    if (!rings) return;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      ctx.beginPath();
      var penDown = false;
      for (var i = 0; i < ring.length; i++) {
        var p = project(ring[i][0], ring[i][1]);
        if (!p.visible) { penDown = false; continue; }
        if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true; }
        else ctx.lineTo(p.x, p.y);
      }
      if (doFill && fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }
  }

  // Hit-test: which visited country marker (if any) is near screen point.
  function pickCountry(mx, my) {
    var best = null, bestD = 16 * 16;
    state.footprints.forEach(function (fp) {
      var meta = world.countries[fp.code];
      if (!meta) return;
      var p = project(meta.c[0], meta.c[1]);
      if (!p.visible) return;
      var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
      if (d < bestD) { bestD = d; best = fp; }
    });
    return best;
  }

  // ============================================================
  // Layers 2 & 3 — flat region maps (country / city)
  // ============================================================
  function drawRegions() {
    var data = state.regionData;
    var size = R / 0.42;
    ctx.clearRect(0, 0, size, size);
    if (!data) {
      ctx.fillStyle = C.muted;
      ctx.font = "13px 'IBM Plex Mono', monospace";
      ctx.fillText("loading…", CX - 30, CY);
      return;
    }
    var vw = data.view[0], vh = data.view[1];
    var pad = 16;
    var scale = Math.min((size - pad * 2) / vw, (size - pad * 2) / vh);
    var ox = (size - vw * scale) / 2, oy = (size - vh * scale) / 2;
    var tx = function (x) { return ox + x * scale; };
    var ty = function (y) { return oy + y * scale; };

    var visitedSet = currentVisitedSet();

    data.regions.forEach(function (reg) {
      var visited = visitedSet.has(reg.name);
      var fill = visited ? C.visited : (reg.drill ? C.drill : C.region);
      var line = visited ? C.visitedLine : (reg.drill ? C.drillLine : C.regionLine);
      var isHover = state.hover === reg.name;
      ctx.save();
      reg.polys.forEach(function (poly) {
        ctx.beginPath();
        for (var i = 0; i < poly.length; i++) {
          var X = tx(poly[i][0]), Y = ty(poly[i][1]);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = reg.drill || visited ? 1.1 : 0.6;
        ctx.strokeStyle = line;
        if (reg.drill || visited || isHover) { ctx.shadowColor = line; ctx.shadowBlur = isHover ? 12 : 6; }
        ctx.stroke();
      });
      ctx.restore();
    });

    // Hover label.
    if (state.hover) {
      ctx.fillStyle = C.text;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText(state.hover, 12, size - 12);
    }
  }

  // Set of visited region names for the current layer.
  function currentVisitedSet() {
    var set = new Set();
    if (state.layer === "country" && state.country) {
      var fp = state.footprints.find(function (f) { return f.code === state.country.code; });
      if (fp) fp.provinces.forEach(function (p) { set.add(p.name); });
    } else if (state.layer === "city" && state.country && state.province) {
      var fp2 = state.footprints.find(function (f) { return f.code === state.country.code; });
      if (fp2) {
        var prov = fp2.provinces.find(function (p) { return p.name === state.province.name; });
        if (prov) prov.cities.forEach(function (c) { set.add(c); });
      }
    }
    return set;
  }

  // Region hit-test via point-in-polygon in viewBox space.
  function pickRegion(mx, my) {
    var data = state.regionData;
    if (!data) return null;
    var size = R / 0.42, vw = data.view[0], vh = data.view[1], pad = 16;
    var scale = Math.min((size - pad * 2) / vw, (size - pad * 2) / vh);
    var ox = (size - vw * scale) / 2, oy = (size - vh * scale) / 2;
    var px = (mx - ox) / scale, py = (my - oy) / scale;
    for (var r = 0; r < data.regions.length; r++) {
      var reg = data.regions[r];
      for (var q = 0; q < reg.polys.length; q++) {
        if (pointInPoly([px, py], reg.polys[q])) return reg;
      }
    }
    return null;
  }
  function pointInPoly(pt, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ============================================================
  // Data loading
  // ============================================================
  function loadJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + url);
      return r.json();
    });
  }

  function provinceKey(countryCode, provinceName) {
    if (countryCode === "CN") return CN_ADCODE[provinceName] || null;
    return provinceName.replace(/\s+/g, "_"); // JP/MY use English ADM1 name
  }

  // ============================================================
  // Navigation between layers
  // ============================================================
  function goGlobe() {
    state.layer = "globe";
    state.country = null;
    state.province = null;
    state.regionData = null;
    updateChrome();
    startLoop();
    scrollToTop();
  }

  function goCountry(fp) {
    state.layer = "country";
    state.country = { code: fp.code, name: fp.name || fp.code };
    state.province = null;
    state.regionData = null;
    state.hover = null;
    updateChrome();
    stopLoop();
    drawRegions();
    loadJSON("/static/geo/regions/" + fp.code + ".json")
      .then(function (d) { state.regionData = d; drawRegions(); })
      .catch(function () { renderError("该国家版图数据缺失"); });
    scrollToTop();
  }

  function goCity(reg) {
    if (!reg.drill) return;
    var key = provinceKey(state.country.code, reg.name);
    if (!key) return;
    state.layer = "city";
    state.province = { name: reg.name, key: key };
    state.regionData = null;
    state.hover = null;
    updateChrome();
    drawRegions();
    loadJSON("/static/geo/regions/" + state.country.code + "/" + key + ".json")
      .then(function (d) { state.regionData = d; drawRegions(); })
      .catch(function () { renderError("该地区城市数据缺失"); });
    scrollToTop();
  }

  function renderError(msg) {
    var size = R / 0.42;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = C.muted;
    ctx.font = "13px 'IBM Plex Mono', monospace";
    ctx.fillText(msg, CX - ctx.measureText(msg).width / 2, CY);
  }

  function scrollToTop() {
    var sec = document.getElementById("footprint");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Breadcrumb + back button chrome.
  function updateChrome() {
    var bc = document.getElementById("globe-breadcrumb");
    var back = document.getElementById("globe-cd-up");
    var stats = document.getElementById("globe-stats");
    var parts = ['<a data-nav="globe">~/globe</a>'];
    if (state.country) parts.push('<a data-nav="country">' + esc(state.country.code) + "</a>");
    if (state.province) parts.push('<span>' + esc(state.province.name) + "</span>");
    if (bc) {
      bc.innerHTML = parts.join('<span class="sep">/</span>');
      bc.querySelectorAll("[data-nav]").forEach(function (a) {
        a.addEventListener("click", function () {
          if (a.getAttribute("data-nav") === "globe") goGlobe();
          else if (a.getAttribute("data-nav") === "country") goCountry(currentCountryFp());
        });
      });
    }
    if (back) {
      back.style.display = state.layer === "globe" ? "none" : "inline";
      back.onclick = function () {
        if (state.layer === "city") goCountry(currentCountryFp());
        else goGlobe();
      };
    }
    if (stats) {
      if (state.layer === "globe") {
        var nCountry = state.footprints.length;
        var nCity = 0;
        state.footprints.forEach(function (f) { f.provinces.forEach(function (p) { nCity += p.cities.length; }); });
        stats.textContent = nCountry ? "去过 " + nCountry + " 国 · " + nCity + " 城" : "";
      } else stats.textContent = "";
    }
  }
  function currentCountryFp() {
    return state.footprints.find(function (f) { return f.code === state.country.code; }) ||
      { code: state.country.code, name: state.country.name, provinces: [] };
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); }

  // ============================================================
  // Animation loop (globe only)
  // ============================================================
  function startLoop() {
    if (state.raf) return;
    var step = function () {
      if (state.layer !== "globe") { state.raf = null; return; }
      if (!state.dragging) {
        state.rot.y += state.spin + state.vel.y;
        state.rot.x += state.vel.x;
        state.rot.x = Math.max(-1.2, Math.min(1.2, state.rot.x));
        state.vel.x *= 0.94; state.vel.y *= 0.94; // inertia decay
      }
      drawGlobe();
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  }
  function stopLoop() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
  }

  // Pause the loop when the globe scrolls out of view (PRD §5.2).
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (state.layer !== "globe") return;
        if (e.isIntersecting) startLoop(); else stopLoop();
      });
    }, { threshold: 0.05 });
    io.observe(canvas);
  }

  // ============================================================
  // Input: drag to rotate (globe) / click to drill / hover (regions)
  // ============================================================
  function pointer(e) {
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  var downPt = null, moved = false;
  function onDown(e) {
    downPt = pointer(e);
    moved = false;
    if (state.layer === "globe") {
      state.dragging = true;
      state.lastPt = downPt;
      state.vel = { x: 0, y: 0 };
    }
  }
  function onMove(e) {
    var p = pointer(e);
    if (downPt && (Math.abs(p.x - downPt.x) > 3 || Math.abs(p.y - downPt.y) > 3)) moved = true;
    if (state.layer === "globe" && state.dragging && state.lastPt) {
      var dx = p.x - state.lastPt.x, dy = p.y - state.lastPt.y;
      state.rot.y += dx * 0.006;
      state.rot.x += dy * 0.006;
      state.rot.x = Math.max(-1.2, Math.min(1.2, state.rot.x));
      state.vel = { x: dy * 0.0009, y: dx * 0.0009 };
      state.lastPt = p;
      e.preventDefault();
    } else if (state.layer !== "globe") {
      var reg = pickRegion(p.x, p.y);
      var name = reg ? reg.name : null;
      if (name !== state.hover) {
        state.hover = name;
        canvas.style.cursor = reg && reg.drill && state.layer === "country" ? "pointer" : "default";
        drawRegions();
      }
    }
  }
  function onUp(e) {
    state.dragging = false;
    if (moved) { downPt = null; return; }
    // Treat as a click.
    var p = downPt || pointer(e);
    downPt = null;
    if (state.layer === "globe") {
      var fp = pickCountry(p.x, p.y);
      if (fp) goCountry(fp);
    } else if (state.layer === "country") {
      var reg = pickRegion(p.x, p.y);
      if (reg && reg.drill) goCity(reg);
    }
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", function (e) { if (state.dragging || state.layer !== "globe") onMove(e); });
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("touchstart", onDown, { passive: true });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  canvas.addEventListener("touchend", onUp);

  // ============================================================
  // Boot
  // ============================================================
  window.addEventListener("resize", function () {
    resize();
    if (state.layer === "globe") drawGlobe(); else drawRegions();
  });

  resize();
  Promise.all([
    loadJSON("/static/geo/world.json"),
    loadJSON("/api/footprints").catch(function () { return []; }),
  ]).then(function (res) {
    world = res[0];
    state.footprints = res[1] || [];
    updateChrome();
    startLoop();
  }).catch(function (err) {
    renderError("地球数据加载失败");
    console.error(err);
  });
})();
