/* ============================================================
   شبکه‌ساز: شهر متصل — CityMap
   Vanilla JS + Canvas 2D map renderer.
   World size comes from GAME_DATA.world (3200 x 2400). No build step.
   Rendering: static city layer (ground/roads/districts/buildings) is
   cached on an offscreen canvas and blitted with offset while panning;
   only dynamic elements (coverage, links, nodes, pulses) redraw per frame.
   Reads sim state defensively; only assumes:
     state.nodes[]  {id,x,y,type,status,direction,angle,...}
     state.links[]  {id,from,to,medium,status,usage,capacity,...}
     state.districts[] runtime (id, demand, revenue, qos, ...)
     GAME_DATA.districts/buildings/installPoints/equipment (global, optional)
   ============================================================ */
'use strict';

(function (global) {
  var WORLD_W = (global.GAME_DATA && global.GAME_DATA.world && global.GAME_DATA.world.width) || 3200;
  var WORLD_H = (global.GAME_DATA && global.GAME_DATA.world && global.GAME_DATA.world.height) || 2400;

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  function isActive(n) { return n && (n.status === 'active' || n.status === 'online' || n.status === 'ok' || n.status === 'up'); }
  function isFailed(n) { return n && (n.status === 'failed' || n.status === 'down' || n.status === 'error' || n.status === 'fault'); }
  function isBuilding(n) { return n && (n.status === 'building' || n.status === 'constructing' || n.status === 'installing' || n.status === 'pending'); }
  function isConnected(n) {
    if (!n) return false;
    if (n.connected === false) return false;
    if (n.connected === true) return true;
    if (n.status === 'unconnected' || n.status === 'isolated') return false;
    return true; // default: assume connected unless flagged
  }
  function nodeKind(t) {
    t = String(t || '').toLowerCase();
    if (t.indexOf('cell') >= 0 || t.indexOf('bs') >= 0 || t.indexOf('mast') >= 0 || t.indexOf('tower') >= 0 || t.indexOf('bts') >= 0 || t.indexOf('antenna') >= 0) return 'cell';
    if (t.indexOf('fwa') >= 0 || t.indexOf('fixed') >= 0) return 'fwa';
    if (t.indexOf('wifi') >= 0 || t.indexOf('wi-fi') >= 0 || t.indexOf('ap') >= 0 || t.indexOf('hotspot') >= 0) return 'wifi';
    if (t.indexOf('sat') >= 0) return 'satellite';
    if (t.indexOf('core') >= 0) return 'core';
    if (t.indexOf('router') >= 0) return 'router';
    if (t.indexOf('switch') >= 0 || t.indexOf('agg') >= 0) return 'switch';
    if (t.indexOf('ptp') >= 0 || t.indexOf('relay') >= 0) return 'ptp';
    if (t.indexOf('customer') >= 0 || t.indexOf('cpe') >= 0 || t.indexOf('home') >= 0) return 'customer';
    if (t.indexOf('gateway') >= 0 || t.indexOf('pop') >= 0) return 'gateway';
    return 'generic';
  }
  function linkMedium(m) {
    m = String(m || '').toLowerCase();
    if (m.indexOf('fiber') >= 0 || m.indexOf('fibre') >= 0 || m.indexOf('optic') >= 0) return 'fiber';
    if (m.indexOf('copper') >= 0 || m.indexOf('dsl') >= 0 || m.indexOf('adsl') >= 0 || m.indexOf('vdsl') >= 0) return 'copper';
    if (m.indexOf('ptp') >= 0 || m.indexOf('wireless') >= 0 || m.indexOf('microwave') >= 0) return 'ptp';
    if (m.indexOf('sat') >= 0) return 'satellite';
    if (m.indexOf('eth') >= 0 || m.indexOf('lan') >= 0) return 'ethernet';
    return 'ethernet';
  }
  function coverageRadius(node) {
    if (typeof node.radius === 'number' && node.radius > 0) return node.radius;
    if (typeof node.coverage === 'number' && node.coverage > 0) return node.coverage;
    var k = nodeKind(node.type);
    if (k === 'cell') return 290;
    if (k === 'fwa') return 255;
    if (k === 'wifi') return 90;
    if (k === 'ptp') return 60;
    return 0;
  }
  function congestion(l) {
    var c = Number(l.capacity) || 0, u = Number(l.usage) || 0;
    if (c <= 0) return 0;
    return clamp(u / c, 0, 2);
  }
  /* cached id -> node map (rebuilt when the nodes array identity/length changes) */
  var _nodeMap = null, _nodeMapSrc = null, _nodeMapLen = -1;
  function nodeMapOf(st) {
    var ns = (st && st.nodes) || [];
    if (_nodeMapSrc !== ns || _nodeMapLen !== ns.length) {
      _nodeMap = {};
      for (var i = 0; i < ns.length; i++) _nodeMap[ns[i].id] = ns[i];
      _nodeMapSrc = ns; _nodeMapLen = ns.length;
    }
    return _nodeMap;
  }
  function nodeById(state, id) {
    if (!state || !state.nodes) return null;
    var m = nodeMapOf(state);
    if (m[id]) return m[id];
    for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) return state.nodes[i];
    return null;
  }
  function endPoint(state, ref) {
    // link endpoints may be ids or {x,y} or node objects
    if (ref == null) return null;
    if (typeof ref === 'object') {
      if (typeof ref.x === 'number') return ref;
      if (ref.id != null) return nodeById(state, ref.id);
      return null;
    }
    return nodeById(state, ref);
  }

  /* ---------- static scenery (roads + river), deterministic ---------- */
  /* avenues every 400, side streets every 200 (avenues are a subset) */
  function roadLines(max, step, offset) {
    var out = [];
    for (var v = offset; v < max; v += step) out.push(v);
    return out;
  }
  var AVENUES_V = roadLines(WORLD_W, 400, 200);
  var AVENUES_H = roadLines(WORLD_H, 400, 200);
  var ROADS_V = roadLines(WORLD_W, 200, 200);
  var ROADS_H = roadLines(WORLD_H, 200, 200);
  var RIVER = (global.GAME_DATA && global.GAME_DATA.river) || [ // gentle S-curve, top -> bottom (scaled to the bigger world)
    { x: 2160, y: -40 }, { x: 2080, y: 360 }, { x: 2200, y: 800 },
    { x: 2100, y: 1240 }, { x: 2220, y: 1700 }, { x: 2120, y: 2080 }, { x: 2200, y: 2440 }
  ];
  var BRIDGES = [600, 1000, 1800]; // y positions (avenues) where roads cross the river
  var RIVER_BAND = 46; // river half-width (32) + margin: roads stop at the banks
  /* Sample the actually-drawn quadratic river curve so road clipping and
     bridge positions follow the visible water, not the raw polyline. */
  function buildRiverSamples(riverPts) {
    var out = [{ x: riverPts[0].x, y: riverPts[0].y }];
    var cx = riverPts[0].x, cy = riverPts[0].y;
    function quad(x0, y0, qx, qy, x1, y1) {
      var steps = 24;
      for (var s = 1; s <= steps; s++) {
        var t = s / steps, u = 1 - t;
        out.push({ x: u * u * x0 + 2 * u * t * qx + t * t * x1, y: u * u * y0 + 2 * u * t * qy + t * t * y1 });
      }
    }
    for (var i = 1; i < riverPts.length - 1; i++) {
      var mx = (riverPts[i].x + riverPts[i + 1].x) / 2, my = (riverPts[i].y + riverPts[i + 1].y) / 2;
      quad(cx, cy, riverPts[i].x, riverPts[i].y, mx, my);
      cx = mx; cy = my;
    }
    var last = riverPts[riverPts.length - 1];
    for (var s2 = 1; s2 <= 8; s2++) out.push({ x: cx + (last.x - cx) * s2 / 8, y: cy + (last.y - cy) * s2 / 8 });
    return out;
  }
  var RIVER_SAMPLES = buildRiverSamples(RIVER);
  /* Generated maps (state.map from MapGen) override the fixed scenery. */
  function applyMapData() {
    var m = state && state.map;
    if (!m) return;
    if (m.river && m.river.length > 1) { RIVER = m.river; RIVER_SAMPLES = buildRiverSamples(RIVER); }
    if (m.bridges && m.bridges.length) BRIDGES = m.bridges;
    if (m.roads) {
      if (m.roads.v) ROADS_V = m.roads.v;
      if (m.roads.h) ROADS_H = m.roads.h;
      if (m.roads.av) AVENUES_V = m.roads.av;
      if (m.roads.ah) AVENUES_H = m.roads.ah;
    }
    _vSegCache = {};
    staticCam = null; // force static-layer re-render with the new scenery
  }
  function riverXatY(y) {
    var pts = RIVER_SAMPLES;
    if (y <= pts[0].y) return pts[0].x;
    for (var i = 1; i < pts.length; i++) {
      if (y <= pts[i].y) {
        var a = pts[i - 1], b = pts[i];
        var t = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return a.x + (b.x - a.x) * t;
      }
    }
    return pts[pts.length - 1].x;
  }
  /* Road segments that stay on land: horizontal roads stop at the riverbanks
     (bridge avenues cross), vertical roads are cut where they enter the band. */
  function hRoadSegs(y) {
    if (BRIDGES.indexOf(y) >= 0) return [[0, WORLD_W]];
    var rx = riverXatY(y);
    return [[0, rx - RIVER_BAND], [rx + RIVER_BAND, WORLD_W]];
  }
  var _vSegCache = {};
  function vRoadSegs(x) {
    if (_vSegCache[x]) return _vSegCache[x];
    var segs = [], start = 0, inside = false, pts = RIVER_SAMPLES;
    function crossingY(i) {
      if (i <= 0) return pts[0].y;
      var a = pts[i - 1], b = pts[i];
      var da = Math.abs(a.x - x) - RIVER_BAND, db = Math.abs(b.x - x) - RIVER_BAND;
      var t = (db - da) !== 0 ? (0 - da) / (db - da) : 0;
      return a.y + (b.y - a.y) * Math.max(0, Math.min(1, t));
    }
    for (var i = 0; i < pts.length; i++) {
      var ins = Math.abs(pts[i].x - x) < RIVER_BAND;
      if (ins && !inside) { var py = crossingY(i); if (py > start) segs.push([start, py]); inside = true; }
      else if (!ins && inside) { start = crossingY(i); inside = false; }
    }
    if (!inside && start < WORLD_H) segs.push([start, WORLD_H]);
    _vSegCache[x] = segs;
    return segs;
  }

  /* landmark Persian labels (icons are drawn as vector shapes in drawLandmark) */
  var LANDMARKS = {
    bazaar:     { fa: 'بازار' },
    market:     { fa: 'بازار' },
    university: { fa: 'دانشگاه' },
    hospital:   { fa: 'بیمارستان' },
    station:    { fa: 'ایستگاه قطار' },
    train:      { fa: 'ایستگاه قطار' },
    stadium:    { fa: 'ورزشگاه' }
  };

  /* ---------- module state ---------- */
  var canvas = null, ctx = null, state = null;
  var cb = { onSelect: null, onPlace: null };
  var dpr = 1, viewW = 0, viewH = 0;
  var cam = { x: WORLD_W / 2, y: WORLD_H / 2, z: 0.6 };       // current (smoothed)
  var camT = { x: WORLD_W / 2, y: WORLD_H / 2, z: 0.6 };      // target
  var selected = null;          // {kind,id}
  var highlightPath = [];       // array of node ids (upstream/downstream)
  var placementMode = false;
  var hover = null;             // {kind,id}
  var mouseWorld = { x: 0, y: 0 };
  var rafId = null, lastTs = 0, animT = 0;
  var dragging = false, dragMoved = false, lastPX = 0, lastPY = 0;
  var downX = 0, downY = 0, pinched = false; // tap-vs-drag discrimination + pinch safety
  var pointers = {};            // pointerId -> {x,y}
  var pinchDist = 0, pinchMid = null;
  var layers = {
    cellular: true, fiber: true, copper: true, fwa: true, satellite: true,
    demand: false, traffic: false, failures: true, revenue: false, qos: false
  };

  /* ---------- perf: frame cache, viewport culling, static layer ---------- */
  var _frame = 0;
  var _distCache = null, _distCacheFrame = -1;
  var _sortedBuildings = null, _sortedSrc = null;
  var cullRect = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
  function visibleRect(m) {
    var hw = viewW / 2 / cam.z, hh = viewH / 2 / cam.z;
    return { x0: cam.x - hw - m, y0: cam.y - hh - m, x1: cam.x + hw + m, y1: cam.y + hh + m };
  }
  function inRect(x, y, r) { return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; }
  function circleInRect(x, y, rad, r) { return x + rad >= r.x0 && x - rad <= r.x1 && y + rad >= r.y0 && y - rad <= r.y1; }
  function segInRect(x1, y1, x2, y2, r) {
    return Math.max(x1, x2) >= r.x0 && Math.min(x1, x2) <= r.x1 && Math.max(y1, y2) >= r.y0 && Math.min(y1, y2) <= r.y1;
  }
  var STATIC_MARGIN = 320; // css px of pre-rendered margin around the viewport
  var staticCanvas = null, staticCtx = null, staticCam = null, staticViewW = 0, staticViewH = 0;
  var _staticBldLen = -1; // buildings count baked into the static layer (city growth invalidates it)
  var _prevCamZ = 0, _lastZoomChangeTs = 0;
  var canStatic = typeof document !== 'undefined' && !!document.createElement;

  /* ---------- coordinate transforms ---------- */
  function worldToScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.z + viewW / 2, y: (wy - cam.y) * cam.z + viewH / 2 };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - viewW / 2) / cam.z + cam.x, y: (sy - viewH / 2) / cam.z + cam.y };
  }
  function fitCamera() {
    if (!viewW || !viewH) return;
    var z;
    if (viewH > viewW) z = Math.max(viewW / WORLD_W, viewH / WORLD_H); // portrait: fill the viewport, crop the sides
    else z = Math.min(viewW / WORLD_W, viewH / WORLD_H) * 0.98;        // landscape/desktop: whole world visible
    camT.z = clamp(z, 0.15, 3); camT.x = WORLD_W / 2; camT.y = WORLD_H / 2;
    cam.x = camT.x; cam.y = camT.y; cam.z = camT.z;
  }

  /* ---------- data accessors (defensive) ---------- */
  function getDistricts() {
    if (_distCache && _distCacheFrame === _frame) return _distCache;
    var gd = (global.GAME_DATA && global.GAME_DATA.districts) || [];
    var rt = (state && state.districts) || [];
    var map = {};
    var i, d;
    for (i = 0; i < gd.length; i++) { d = gd[i]; map[d.id] = { id: d.id, name: d.nameFa || d.name || d.id, x: d.x, y: d.y, w: d.w, h: d.h, radius: d.radius, color: d.color, demand: d.demand || d.demandBase || 0, revenue: 0, qos: null }; }
    for (i = 0; i < rt.length; i++) {
      d = rt[i];
      if (!map[d.id]) map[d.id] = { id: d.id, name: d.nameFa || d.name || d.id, x: d.x, y: d.y, w: d.w, h: d.h, radius: d.radius, color: d.color };
      if (typeof d.demand === 'number') map[d.id].demand = d.demand;
      else if (typeof d.demandBase === 'number') map[d.id].demand = d.demandBase;
      if (typeof d.revenue === 'number') map[d.id].revenue = d.revenue;
      if (typeof d.qos === 'number') map[d.id].qos = d.qos;
      if (typeof d.satisfaction === 'number' && map[d.id].qos == null) map[d.id].qos = d.satisfaction;
    }
    var out = []; for (var k in map) out.push(map[k]);
    _distCache = out; _distCacheFrame = _frame;
    return out;
  }
  function getBuildings() {
    if (state && state.buildings && state.buildings.length) return state.buildings;
    return (global.GAME_DATA && global.GAME_DATA.buildings) || [];
  }
  var _sortedLen = -1;
  function sortedBuildings() {
    var bs = getBuildings();
    if (_sortedSrc !== bs || _sortedLen !== bs.length) {
      _sortedSrc = bs; _sortedLen = bs.length;
      _sortedBuildings = bs.slice().sort(function (a, b) { return (a.height || 1) - (b.height || 1); });
    }
    return _sortedBuildings;
  }
  function districtCenter(d) {
    if (typeof d.x === 'number' && typeof d.y === 'number') {
      if (typeof d.w === 'number') return { x: d.x + d.w / 2, y: d.y + (d.h || d.w) / 2 };
      return { x: d.x, y: d.y };
    }
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
  }
  function districtRadius(d) {
    if (typeof d.radius === 'number') return d.radius;
    if (typeof d.w === 'number') return Math.max(d.w, d.h || d.w) / 2;
    return 150;
  }

  /* ---------- coverage / dead zones ---------- */
  function coverageSources() {
    var out = [], nodes = (state && state.nodes) || [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = nodeKind(n.type), r = coverageRadius(n);
      if (r <= 0) continue;
      if (!(k === 'cell' || k === 'fwa' || k === 'wifi')) continue;
      if (!isActive(n) || !isConnected(n)) continue;
      if (k === 'cell' && !layers.cellular) continue;
      if (k === 'fwa' && !layers.fwa) continue;
      out.push({ node: n, kind: k, r: r });
    }
    return out;
  }

  /* ============================================================
     DRAW — static city layer is cached offscreen and blitted;
     only dynamic elements are redrawn every frame.
     ============================================================ */
  function drawStaticScene() {
    drawGround();
    drawRoadsAndRiver();
    drawBuildings();
    drawDistrictLabels(); // after buildings: district names stay on top
  }
  function ensureStatic(force) {
    if (!canStatic) return;
    var need = force || !staticCanvas || !staticCam || staticViewW !== viewW || staticViewH !== viewH ||
      Math.abs(cam.x - staticCam.x) * cam.z > STATIC_MARGIN * 0.6 ||
      Math.abs(cam.y - staticCam.y) * cam.z > STATIC_MARGIN * 0.6;
    if (!need) return;
    var w = viewW + STATIC_MARGIN * 2, h = viewH + STATIC_MARGIN * 2;
    if (!staticCanvas) { staticCanvas = document.createElement('canvas'); staticCtx = staticCanvas.getContext('2d'); }
    staticCanvas.width = Math.round(w * dpr);
    staticCanvas.height = Math.round(h * dpr);
    var savedCtx = ctx, savedSel = selected, savedCull = cullRect;
    ctx = staticCtx; selected = null; // selection outlines are dynamic, never baked in
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    cullRect = visibleRect(STATIC_MARGIN / cam.z + 200);
    drawStaticScene();
    ctx.restore();
    ctx = savedCtx; selected = savedSel; cullRect = savedCull;
    _staticBldLen = getBuildings().length;
    staticCam = { x: cam.x, y: cam.y, z: cam.z };
    staticViewW = viewW; staticViewH = viewH;
  }

  function draw() {
    if (!ctx) return;
    _frame++;
    // smooth camera
    cam.x = lerp(cam.x, camT.x, 0.25);
    cam.y = lerp(cam.y, camT.y, 0.25);
    cam.z = lerp(cam.z, camT.z, 0.25);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    // backdrop outside world
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, viewW, viewH);

    if (canStatic) {
      // city growth: new buildings must appear without waiting for a camera move
      if (getBuildings().length !== _staticBldLen) ensureStatic(true);
      // zoom handling: blit the cached layer scaled during a zoom gesture (cheap),
      // re-render crisply once the zoom settles or jumps too far.
      if (cam.z !== _prevCamZ) { _prevCamZ = cam.z; _lastZoomChangeTs = Date.now(); }
      if (staticCanvas && staticCam) {
        var s0 = cam.z / staticCam.z;
        if (s0 > 1.35 || s0 < 0.7) ensureStatic(true);
        else if (s0 !== 1 && Date.now() - _lastZoomChangeTs > 150) ensureStatic(true);
        else ensureStatic(false);
      } else ensureStatic(false);
      if (staticCanvas && staticCam) {
        var s = cam.z / staticCam.z;
        var sw = (viewW + STATIC_MARGIN * 2) * s, sh = (viewH + STATIC_MARGIN * 2) * s;
        var dx = (staticCam.x - cam.x) * cam.z + viewW / 2 - (viewW / 2 + STATIC_MARGIN) * s;
        var dy = (staticCam.y - cam.y) * cam.z + viewH / 2 - (viewH / 2 + STATIC_MARGIN) * s;
        ctx.drawImage(staticCanvas, dx, dy, sw, sh);
      }
    }

    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    cullRect = visibleRect(140);

    if (!canStatic) drawStaticScene(); // fallback: no offscreen canvas available
    drawRiverFlow();
    var srcs = coverageSources();
    if (layers.qos) drawQosTint();
    drawCoverage(srcs);
    if (layers.demand) drawDemandHeat();
    drawBuildingSelection();
    drawLinks();
    drawNodes();
    drawHighlights();
    if (layers.revenue) drawRevenue();
    if (placementMode) drawPlacementGhost();

    ctx.restore();

    drawHud();
  }

  function drawGround() {
    // base
    ctx.fillStyle = '#1b2330';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // park blocks + tree clusters (generated map provides parks; else deterministic fallback)
    var seed = (state && state.mapSeed) || 42;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    var parks = (state && state.map && state.map.parks) || null;
    if (!parks) {
      parks = [];
      for (var i = 0; i < 70; i++) {
        parks.push({ x: rnd() * (WORLD_W - 200), y: rnd() * (WORLD_H - 160), w: 60 + rnd() * 150, h: 45 + rnd() * 100 });
      }
      // a few large named-style parks
      parks.push({ x: 1780, y: 880, w: 330, h: 220 });
      parks.push({ x: 420, y: 1450, w: 280, h: 200 });
      parks.push({ x: 2380, y: 1950, w: 360, h: 240 });
    }
    ctx.fillStyle = 'rgba(46,90,60,0.35)';
    for (var p = 0; p < parks.length; p++) {
      var pk = parks[p];
      if (!segInRect(pk.x, pk.y, pk.x + pk.w, pk.y + pk.h, cullRect)) continue;
      ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    }
    // trees: small darker circles scattered inside parks (one batched path)
    ctx.fillStyle = 'rgba(34,80,48,0.55)';
    ctx.beginPath();
    for (var q = 0; q < parks.length; q++) {
      var pp = parks[q];
      if (!segInRect(pp.x, pp.y, pp.x + pp.w, pp.y + pp.h, cullRect)) continue;
      var trees = 3 + Math.floor(rnd() * 6);
      for (var t = 0; t < trees; t++) {
        var tx = pp.x + 8 + rnd() * Math.max(10, pp.w - 16), ty = pp.y + 8 + rnd() * Math.max(10, pp.h - 16);
        var tr = 4 + rnd() * 4;
        ctx.moveTo(tx + tr, ty);
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    // world border
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2 / cam.z;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  }

  function riverPath() {
    ctx.beginPath();
    ctx.moveTo(RIVER[0].x, RIVER[0].y);
    for (var i = 1; i < RIVER.length - 1; i++) {
      var mx = (RIVER[i].x + RIVER[i + 1].x) / 2, my = (RIVER[i].y + RIVER[i + 1].y) / 2;
      ctx.quadraticCurveTo(RIVER[i].x, RIVER[i].y, mx, my);
    }
    ctx.lineTo(RIVER[RIVER.length - 1].x, RIVER[RIVER.length - 1].y);
  }
  function drawRiverFlow() {
    // animated flow dashes (cheap: one path, drawn dynamically over the static river)
    ctx.save();
    riverPath();
    ctx.strokeStyle = 'rgba(160,210,255,0.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.setLineDash([14, 22]); ctx.lineDashOffset = -animT * 20; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawRoadsAndRiver() {
    // river (under roads' bridges, over ground)
    ctx.save();
    riverPath();
    ctx.strokeStyle = '#1f4e79'; ctx.lineWidth = 64; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = '#2e6ea8'; ctx.lineWidth = 48; ctx.stroke();
    ctx.restore();

    // roads: side streets first (narrow), then avenues (wide) with center dashes.
    // Roads stop at the riverbanks; only bridge avenues cross the water.
    ctx.save();
    ctx.lineCap = 'butt';
    var j, k, segs;
    function pathSegs(lines, vertical) {
      for (var q = 0; q < lines.length; q++) {
        var v = lines[q];
        if (vertical) {
          if (v < cullRect.x0 || v > cullRect.x1) continue;
          segs = vRoadSegs(v);
          for (k = 0; k < segs.length; k++) { ctx.moveTo(v, segs[k][0]); ctx.lineTo(v, segs[k][1]); }
        } else {
          if (v < cullRect.y0 || v > cullRect.y1) continue;
          segs = hRoadSegs(v);
          for (k = 0; k < segs.length; k++) { ctx.moveTo(segs[k][0], v); ctx.lineTo(segs[k][1], v); }
        }
      }
    }
    ctx.strokeStyle = '#262f3c'; ctx.lineWidth = 11;
    ctx.beginPath();
    pathSegs(ROADS_V, true); pathSegs(ROADS_H, false);
    ctx.stroke();
    ctx.strokeStyle = '#2e3847'; ctx.lineWidth = 22;
    ctx.beginPath();
    pathSegs(AVENUES_V, true); pathSegs(AVENUES_H, false);
    ctx.stroke();
    // center dashes on avenues
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    pathSegs(AVENUES_V, true); pathSegs(AVENUES_H, false);
    ctx.stroke();
    ctx.setLineDash([]);
    // intersections (one batched path; none inside the river except at bridges)
    ctx.fillStyle = '#333e4e';
    ctx.beginPath();
    for (var a = 0; a < ROADS_V.length; a++) for (var b = 0; b < ROADS_H.length; b++) {
      if (!inRect(ROADS_V[a], ROADS_H[b], cullRect)) continue;
      if (BRIDGES.indexOf(ROADS_H[b]) < 0 && Math.abs(riverXatY(ROADS_H[b]) - ROADS_V[a]) < RIVER_BAND) continue;
      var big = (AVENUES_V.indexOf(ROADS_V[a]) >= 0 && AVENUES_H.indexOf(ROADS_H[b]) >= 0);
      var s = big ? 13 : 7;
      ctx.rect(ROADS_V[a] - s, ROADS_H[b] - s, s * 2, s * 2);
    }
    ctx.fill();
    // bridges over river
    for (var q = 0; q < BRIDGES.length; q++) {
      var by = BRIDGES[q], bx = riverXatY(by);
      if (!inRect(bx, by, cullRect)) continue;
      ctx.fillStyle = '#3d4a5e';
      ctx.fillRect(bx - 46, by - 14, 92, 28);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx - 46, by - 14); ctx.lineTo(bx + 46, by - 14);
      ctx.moveTo(bx - 46, by + 14); ctx.lineTo(bx + 46, by + 14); ctx.stroke();
    }
    ctx.restore();
  }

  /* District NAMES only (no zoning circles). Drawn AFTER buildings in the
     static scene so building/landmark labels never cover them. */
  function drawDistrictLabels() {
    var ds = getDistricts();
    ctx.save();
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i], c = districtCenter(d), r = districtRadius(d);
      if (!circleInRect(c.x, c.y, r, cullRect)) continue;
      ctx.font = 'bold ' + Math.max(14, 17 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var label = String(d.name || d.id || '');
      var tw = ctx.measureText(label).width;
      // dark halo plate keeps the name readable over any building
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      ctx.fillRect(c.x - tw / 2 - 8, c.y - 12, tw + 16, 24);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1 / cam.z;
      ctx.strokeRect(c.x - tw / 2 - 8, c.y - 12, tw + 16, 24);
      ctx.fillStyle = 'rgba(240,244,255,0.97)';
      ctx.fillText(label, c.x, c.y);
    }
    ctx.restore();
  }

  function drawQosTint() {
    var ds = getDistricts();
    ctx.save();
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i]; if (d.qos == null) continue;
      var q = clamp(Number(d.qos) > 1 ? Number(d.qos) / 100 : Number(d.qos), 0, 1);
      var c = districtCenter(d), r = districtRadius(d);
      // green good -> red bad
      var col = q > 0.66 ? 'rgba(34,197,94,0.20)' : (q > 0.4 ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.24)');
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCoverage(srcs) {
    ctx.save();
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i], n = s.node;
      if (!circleInRect(n.x, n.y, s.r, cullRect)) continue;
      var fill, stroke;
      if (s.kind === 'cell') { fill = 'rgba(56,189,248,0.14)'; stroke = 'rgba(56,189,248,0.55)'; }
      else if (s.kind === 'fwa') { fill = 'rgba(52,211,153,0.13)'; stroke = 'rgba(52,211,153,0.55)'; }
      else { fill = 'rgba(192,132,252,0.14)'; stroke = 'rgba(192,132,252,0.55)'; }
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4 / cam.z;
      ctx.beginPath();
      var dir = (typeof n.direction === 'number') ? n.direction : null;
      var ang = (typeof n.angle === 'number') ? n.angle : null;
      if (s.kind === 'cell' && dir != null && ang != null && ang < 360) {
        // sector wedge; direction in degrees, 0 = north, clockwise
        var dirRad = (dir - 90) * Math.PI / 180;
        var half = (ang / 2) * Math.PI / 180;
        ctx.moveTo(n.x, n.y);
        ctx.arc(n.x, n.y, s.r, dirRad - half, dirRad + half);
        ctx.closePath();
      } else {
        ctx.arc(n.x, n.y, s.r, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawDemandHeat() {
    var ds = getDistricts();
    var maxD = 1, i;
    for (i = 0; i < ds.length; i++) maxD = Math.max(maxD, Number(ds[i].demand) || 0);
    ctx.save();
    for (i = 0; i < ds.length; i++) {
      var d = ds[i], dv = Number(d.demand) || 0;
      if (dv <= 0) continue;
      var c = districtCenter(d), r = districtRadius(d);
      var t = clamp(dv / maxD, 0, 1);
      var grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      grad.addColorStop(0, 'rgba(239,68,68,' + (0.55 * t).toFixed(2) + ')');
      grad.addColorStop(0.55, 'rgba(245,158,11,' + (0.35 * t).toFixed(2) + ')');
      grad.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold ' + Math.max(11, 12 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText('تقاضا: ' + Math.round(dv), c.x, c.y - 20);
    }
    ctx.restore();
  }

  function drawBuildings() {
    var bs = getBuildings();
    ctx.save();
    // pre-sorted by height so tall drawn last (on top); sorted once, not per frame
    var sorted = sortedBuildings();
    // all shadows in one batched path first (taller = longer shadow)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    for (var si = 0; si < sorted.length; si++) {
      var sb = sorted[si], sw2 = sb.w || 26, sh2 = sb.h || 20;
      if (sb.x + sw2 < cullRect.x0 || sb.x > cullRect.x1 || sb.y + sh2 < cullRect.y0 || sb.y > cullRect.y1) continue;
      var sht = clamp(Number(sb.height) || 1, 1, 12);
      ctx.rect(sb.x + sht * 1.6, sb.y + sht * 2.2, sw2, sh2);
    }
    ctx.fill();
    // bodies batched by fill color (per-building color when provided, else taller = darker shade)
    var byColor = {}, colorOrder = [], landmarks = [];
    for (var i = 0; i < sorted.length; i++) {
      var b = sorted[i];
      var w = b.w || 26, h = b.h || 20, ht = clamp(Number(b.height) || 1, 1, 12);
      if (b.x + w < cullRect.x0 || b.x > cullRect.x1 || b.y + h < cullRect.y0 || b.y > cullRect.y1) continue;
      var lm = b.landmark || (b.type && LANDMARKS[String(b.type).toLowerCase()] ? b.type : null);
      var col;
      if (lm) col = '#7c5a2e';
      else if (b.color) col = b.color;
      else {
        var shade = clamp(0.35 + ht * 0.05, 0.35, 0.85);
        var v = Math.round(90 - shade * 45);
        col = 'rgb(' + v + ',' + (v + 8) + ',' + (v + 20) + ')';
      }
      if (!byColor[col]) { byColor[col] = []; colorOrder.push(col); }
      byColor[col].push(b);
      if (lm) landmarks.push({ b: b, key: String(lm).toLowerCase(), w: w, h: h });
    }
    for (var ci = 0; ci < colorOrder.length; ci++) {
      ctx.fillStyle = colorOrder[ci];
      ctx.beginPath();
      var group = byColor[colorOrder[ci]];
      for (var gi = 0; gi < group.length; gi++) ctx.rect(group[gi].x, group[gi].y, group[gi].w || 26, group[gi].h || 20);
      ctx.fill();
    }
    // outlines + roof highlights + tall-building roof edges, each one batched path
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1 / cam.z;
    ctx.beginPath();
    for (var oi = 0; oi < sorted.length; oi++) {
      var ob = sorted[oi], ow = ob.w || 26, oh = ob.h || 20;
      if (ob.x + ow < cullRect.x0 || ob.x > cullRect.x1 || ob.y + oh < cullRect.y0 || ob.y > cullRect.y1) continue;
      ctx.rect(ob.x, ob.y, ow, oh);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    for (var ri = 0; ri < sorted.length; ri++) {
      var rb = sorted[ri], rw = rb.w || 26, rh = rb.h || 20;
      if (rb.x + rw < cullRect.x0 || rb.x > cullRect.x1 || rb.y + rh < cullRect.y0 || rb.y > cullRect.y1) continue;
      ctx.rect(rb.x, rb.y, rw, Math.min(5, rh * 0.25));
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    for (var ti = 0; ti < sorted.length; ti++) {
      var tb = sorted[ti], tw = tb.w || 26, th = tb.h || 20;
      if (clamp(Number(tb.height) || 1, 1, 12) < 10) continue;
      if (tb.x + tw < cullRect.x0 || tb.x > cullRect.x1 || tb.y + th < cullRect.y0 || tb.y > cullRect.y1) continue;
      ctx.rect(tb.x, tb.y, tw, 3);
    }
    ctx.fill();
    for (var li = 0; li < landmarks.length; li++) drawLandmark(landmarks[li].b, landmarks[li].key, landmarks[li].w, landmarks[li].h);
    // synthesized landmarks if data provides none: بازار، دانشگاه، بیمارستان (district centers) + ایستگاه قطار، ورزشگاه (fixed)
    var hasLm = false;
    for (var q = 0; q < bs.length; q++) if (bs[q].landmark) { hasLm = true; break; }
    if (!hasLm) {
      var ds = getDistricts();
      var lmAt = function (id, key, fx, fy) {
        var c = null;
        for (var t = 0; t < ds.length; t++) if (ds[t].id === id) { c = districtCenter(ds[t]); break; }
        if (!c) c = { x: fx, y: fy };
        var fake = { x: c.x - 26, y: c.y - 20, w: 52, h: 40, nameFa: (LANDMARKS[key] || {}).fa };
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(fake.x + 6, fake.y + 8, fake.w, fake.h);
        ctx.fillStyle = '#7c5a2e'; ctx.fillRect(fake.x, fake.y, fake.w, fake.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(fake.x, fake.y, fake.w, fake.h);
        drawLandmark(fake, key, fake.w, fake.h);
      };
      lmAt('bazaar', 'bazaar', 1120, 1560);
      lmAt('university', 'university', 680, 660);
      lmAt('hospital', 'hospital', 2320, 780);
      lmAt('station', 'station', 1600, 2180);
      lmAt('stadium', 'stadium', 2650, 420);
    }
    ctx.restore();
  }

  function drawBuildingSelection() {
    if (!selected || selected.kind !== 'building') return;
    var bs = getBuildings();
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].id === selected.id) {
        var b = bs[i], w = b.w || 26, h = b.h || 20;
        ctx.save();
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.4 / cam.z;
        ctx.strokeRect(b.x - 3, b.y - 3, w + 6, h + 6);
        ctx.restore();
        return;
      }
    }
  }

  function drawLandmark(b, key, w, h) {
    var info = LANDMARKS[key] || { fa: b.nameFa || b.name || key };
    var cx = b.x + w / 2, cy = b.y + h / 2;
    ctx.save();
    // icon-ish shape per landmark
    ctx.fillStyle = '#fde68a'; ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.8;
    if (key === 'hospital') {
      ctx.fillRect(cx - 2.5, cy - 8, 5, 16); ctx.fillRect(cx - 8, cy - 2.5, 16, 5);
    } else if (key === 'stadium') {
      ctx.beginPath(); ctx.ellipse(cx, cy, 12, 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, 5, 3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (key === 'station' || key === 'train') {
      ctx.fillRect(cx - 10, cy - 5, 20, 9);
      ctx.beginPath(); ctx.arc(cx - 6, cy + 6, 2.4, 0, Math.PI * 2); ctx.arc(cx + 6, cy + 6, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'university') {
      ctx.beginPath(); ctx.moveTo(cx - 11, cy); ctx.lineTo(cx, cy - 6); ctx.lineTo(cx + 11, cy); ctx.lineTo(cx, cy + 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + 6, cy + 2); ctx.lineTo(cx + 6, cy + 8); ctx.stroke();
    } else { // bazaar: dome + arch
      ctx.beginPath(); ctx.arc(cx, cy + 3, 8, Math.PI, 0); ctx.fill();
      ctx.fillRect(cx - 9, cy + 3, 18, 5);
    }
    ctx.font = 'bold ' + Math.max(11, 12 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var label = b.nameFa || info.fa;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    var tw = ctx.measureText(label).width;
    ctx.fillRect(cx - tw / 2 - 5, b.y + h + 3, tw + 10, 18);
    ctx.fillStyle = '#fde68a';
    ctx.fillText(label, cx, b.y + h + 5);
    ctx.restore();
  }

  /* link style table: color + dash pattern (never color alone) */
  var LINK_STYLES = {
    fiber:     { color: '#22d3ee', dash: [],        width: 3.2 },
    copper:    { color: '#fb923c', dash: [9, 6],    width: 2.6 },
    ptp:       { color: '#a78bfa', dash: [2, 5],    width: 1.8, arrow: true },
    satellite: { color: '#e879f9', dash: [3, 7],    width: 2.0, arc: true },
    ethernet:  { color: '#9ca3af', dash: [12, 4, 3, 4], width: 2.2 }
  };
  function layerAllowsLink(med, l) {
    if (med === 'fiber' && !layers.fiber) return false;
    if (med === 'copper' && !layers.copper) return false;
    if (med === 'satellite' && !layers.satellite) return false;
    if (med === 'ptp' && !(layers.fwa || layers.cellular)) return false;
    return true;
  }
  function satellitePos() { return { x: WORLD_W - 220, y: 220 }; }

  function linkPath(a, b, st) {
    ctx.beginPath();
    if (st.arc) {
      // satellite: arc up to satellite icon position (midpoint lifted)
      var sp = satellitePos();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + sp.x) / 2, Math.min(a.y, sp.y) - 120, sp.x, sp.y);
      ctx.moveTo(sp.x, sp.y);
      ctx.quadraticCurveTo((b.x + sp.x) / 2, Math.min(b.y, sp.y) - 120, b.x, b.y);
    } else {
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
  }

  function drawLinks() {
    var links = (state && state.links) || [];
    ctx.save();
    ctx.lineCap = 'round';
    var sqrtZ = Math.sqrt(cam.z);
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var a = endPoint(state, l.from != null ? l.from : l.a);
      var b = endPoint(state, l.to != null ? l.to : l.b);
      if (!a || !b) continue;
      var med = linkMedium(l.medium || l.type);
      if (!layerAllowsLink(med, l)) continue;
      var st = LINK_STYLES[med] || LINK_STYLES.ethernet;
      if (!segInRect(a.x, a.y, b.x, b.y, cullRect) && !(st.arc && inRect(satellitePos().x, satellitePos().y, cullRect))) continue;
      var cg = congestion(l);
      var col = st.color;
      if (cg > 0.85) col = '#ef4444';
      else if (cg > 0.65) col = '#f59e0b';
      if (isFailed(l) && layers.failures) col = '#ef4444';
      var w = st.width;
      if (layers.traffic) w = 1.2 + clamp(cg, 0, 1) * 5;

      var isSel = selected && selected.kind === 'link' && selected.id === l.id;
      var inPath = highlightPath.length && (highlightPath.indexOf(a.id) >= 0 && highlightPath.indexOf(b.id) >= 0);
      if (isSel || inPath) {
        // highlight glow as a wide translucent underlay (shadowBlur is far too slow per frame)
        ctx.strokeStyle = 'rgba(251,191,36,0.35)';
        ctx.lineWidth = (w * 2.4 + 3) / sqrtZ;
        ctx.setLineDash([]);
        linkPath(a, b, st); ctx.stroke();
      }

      ctx.strokeStyle = col;
      ctx.lineWidth = w / sqrtZ;
      ctx.setLineDash(st.dash.map(function (v) { return v / sqrtZ; }));
      if (layers.traffic) ctx.lineDashOffset = -animT * 30;
      linkPath(a, b, st); ctx.stroke();
      if (st.arrow) drawArrow(a.x, a.y, b.x, b.y, col);
      ctx.setLineDash([]);
      // failed link mark
      if (isFailed(l) && layers.failures) {
        var mx3 = (a.x + b.x) / 2, my3 = (a.y + b.y) / 2;
        drawX(mx3, my3, 7, '#ef4444');
      }
    }
    ctx.restore();
    drawSatelliteIcon();
  }
  function drawArrow(x1, y1, x2, y2, col) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, s = 9;
    ctx.save();
    ctx.fillStyle = col; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(ang) * s, my + Math.sin(ang) * s);
    ctx.lineTo(mx + Math.cos(ang + 2.5) * s * 0.7, my + Math.sin(ang + 2.5) * s * 0.7);
    ctx.lineTo(mx + Math.cos(ang - 2.5) * s * 0.7, my + Math.sin(ang - 2.5) * s * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawSatelliteIcon() {
    var links = (state && state.links) || [];
    var has = false;
    for (var i = 0; i < links.length; i++) if (linkMedium(links[i].medium || links[i].type) === 'satellite') { has = true; break; }
    if (!has || !layers.satellite) return;
    var sp = satellitePos();
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.fillStyle = '#e879f9';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#f0abfc';
    ctx.fillRect(-24, -4, 15, 8); ctx.fillRect(9, -4, 15, 8);
    ctx.strokeStyle = 'rgba(232,121,249,0.7)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(animT * 2) * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 12px Vazirmatn, Tahoma, sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#f0abfc';
    ctx.fillText('ماهواره', 0, 46);
    ctx.restore();
  }

  function drawX(x, y, s, col) {
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 2.4 / Math.sqrt(cam.z); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
    ctx.stroke();
    ctx.restore();
  }

  var NODE_COLORS = {
    cell: '#38bdf8', fwa: '#34d399', wifi: '#c084fc', satellite: '#e879f9',
    core: '#facc15', router: '#60a5fa', switch: '#2dd4bf', ptp: '#a78bfa',
    customer: '#fda4af', gateway: '#fbbf24', generic: '#cbd5e1'
  };
  /* small vector mark inside a node body, per kind (no emoji/text glyphs) */
  function drawNodeMark(k, x, y, r) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = Math.max(1.2, r * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var u = r * 0.52; // mark half-size
    ctx.beginPath();
    if (k === 'cell') { // mast with signal arcs
      ctx.moveTo(x, y + u); ctx.lineTo(x, y - u * 0.4);
      ctx.moveTo(x - u * 0.5, y + u); ctx.lineTo(x + u * 0.5, y + u);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - u * 0.55, u * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - u * 0.55, u * 0.55, -2.4, -0.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - u * 0.55, u * 0.9, -2.4, -0.7); ctx.stroke();
    } else if (k === 'wifi') { // fan arcs over a dot
      ctx.beginPath(); ctx.arc(x, y + u * 0.55, u * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + u * 0.55, u * 0.55, -2.5, -0.65); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + u * 0.55, u * 0.95, -2.5, -0.65); ctx.stroke();
    } else if (k === 'fwa') { // panel antenna: stem + tilted panel
      ctx.moveTo(x, y + u); ctx.lineTo(x, y - u * 0.2);
      ctx.moveTo(x - u * 0.45, y + u); ctx.lineTo(x + u * 0.45, y + u);
      ctx.stroke();
      ctx.beginPath(); ctx.rect(x - u * 0.55, y - u * 0.95, u * 1.1, u * 0.7); ctx.stroke();
    } else if (k === 'core' || k === 'gateway') { // inner hexagon
      for (var s3 = 0; s3 < 6; s3++) {
        var aa = s3 * Math.PI / 3 + Math.PI / 6;
        var px = x + Math.cos(aa) * u, py = y + Math.sin(aa) * u;
        if (s3 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, u * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'router') { // two opposing arrows
      ctx.moveTo(x - u, y - u * 0.35); ctx.lineTo(x + u * 0.7, y - u * 0.35);
      ctx.moveTo(x + u * 0.35, y - u * 0.7); ctx.lineTo(x + u * 0.75, y - u * 0.35); ctx.lineTo(x + u * 0.35, y);
      ctx.moveTo(x + u, y + u * 0.35); ctx.lineTo(x - u * 0.7, y + u * 0.35);
      ctx.moveTo(x - u * 0.35, y); ctx.lineTo(x - u * 0.75, y + u * 0.35); ctx.lineTo(x - u * 0.35, y + u * 0.7);
      ctx.stroke();
    } else if (k === 'switch') { // port grid
      var g = u * 0.42;
      ctx.rect(x - g - u * 0.18, y - g - u * 0.18, g, g); ctx.rect(x + u * 0.18, y - g - u * 0.18, g, g);
      ctx.rect(x - g - u * 0.18, y + u * 0.18, g, g); ctx.rect(x + u * 0.18, y + u * 0.18, g, g);
      ctx.stroke();
    } else if (k === 'satellite') { // dish: bowl arc + feed dot
      ctx.beginPath(); ctx.arc(x, y - u * 0.35, u * 0.85, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + u * 0.5); ctx.lineTo(x, y + u); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - u * 0.35, u * 0.18, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'customer') { // house
      ctx.moveTo(x - u * 0.8, y - u * 0.1); ctx.lineTo(x, y - u * 0.85); ctx.lineTo(x + u * 0.8, y - u * 0.1);
      ctx.moveTo(x - u * 0.55, y - u * 0.1); ctx.lineTo(x - u * 0.55, y + u * 0.75); ctx.lineTo(x + u * 0.55, y + u * 0.75); ctx.lineTo(x + u * 0.55, y - u * 0.1);
      ctx.stroke();
    } else { // generic: dot
      ctx.beginPath(); ctx.arc(x, y, u * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawNodes() {
    var nodes = (state && state.nodes) || [];
    ctx.save();
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = nodeKind(n.type);
      if (!inRect(n.x, n.y, cullRect)) continue;
      var col = NODE_COLORS[k] || NODE_COLORS.generic;
      var conn = isConnected(n), failed = isFailed(n), bld = isBuilding(n);
      if (!conn) col = '#6b7280';
      var r = (k === 'core' || k === 'gateway') ? 13 : 10;

      // building pulse (amber)
      if (bld) {
        var pr = r + 6 + Math.sin(animT * 4) * 4;
        ctx.strokeStyle = 'rgba(245,158,11,0.85)'; ctx.lineWidth = 2 / Math.sqrt(cam.z);
        ctx.beginPath(); ctx.arc(n.x, n.y, pr, 0, Math.PI * 2); ctx.stroke();
      }
      // selection / hover ring
      if (selected && selected.kind === 'node' && selected.id === n.id) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.6 / Math.sqrt(cam.z);
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2); ctx.stroke();
      } else if (hover && hover.kind === 'node' && hover.id === n.id) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.8 / Math.sqrt(cam.z);
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }

      // body shape per kind (distinct silhouettes, not color alone)
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.4 / Math.sqrt(cam.z);
      ctx.beginPath();
      if (k === 'cell') { // triangle mast
        ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x - r * 0.85, n.y + r * 0.8); ctx.lineTo(n.x + r * 0.85, n.y + r * 0.8); ctx.closePath();
      } else if (k === 'core' || k === 'gateway') { // hexagon
        for (var s2 = 0; s2 < 6; s2++) {
          var aa = s2 * Math.PI / 3 + Math.PI / 6;
          var px = n.x + Math.cos(aa) * r, py = n.y + Math.sin(aa) * r;
          if (s2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (k === 'router' || k === 'switch') { // square
        ctx.rect(n.x - r * 0.85, n.y - r * 0.85, r * 1.7, r * 1.7);
      } else if (k === 'wifi') { // diamond
        ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath();
      } else if (k === 'satellite') { // star-ish cross
        ctx.rect(n.x - r * 0.5, n.y - r * 0.5, r, r);
      } else { // circle: fwa, ptp, customer, generic
        ctx.arc(n.x, n.y, r * 0.9, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();

      // inner vector mark per kind (canvas paths, no text glyphs)
      drawNodeMark(k, n.x, n.y, r);

      // direction tick for cell sectors
      if (k === 'cell' && typeof n.direction === 'number') {
        var dr = (n.direction - 90) * Math.PI / 180;
        ctx.strokeStyle = col; ctx.lineWidth = 2 / Math.sqrt(cam.z);
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(n.x + Math.cos(dr) * (r + 8), n.y + Math.sin(dr) * (r + 8));
        ctx.stroke();
      }

      // failed X
      if (failed && layers.failures) drawX(n.x, n.y, r + 4, '#ef4444');

      // unconnected badge
      if (!conn) {
        ctx.font = 'bold ' + Math.max(10, 11 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
        var txt = 'متصل نیست';
        var tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(31,41,55,0.92)';
        ctx.strokeStyle = 'rgba(156,163,175,0.8)'; ctx.lineWidth = 1 / Math.sqrt(cam.z);
        var bx = n.x - tw / 2 - 6, by = n.y - r - 24;
        ctx.fillRect(bx, by, tw + 12, 17); ctx.strokeRect(bx, by, tw + 12, 17);
        ctx.fillStyle = '#d1d5db'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, n.x, by + 9);
      }
      // label (name if present)
      var lbl = n.nameFa || n.name;
      if (lbl && cam.z > 0.45) {
        ctx.font = Math.max(10, 11 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
        ctx.fillStyle = 'rgba(235,240,250,0.9)'; ctx.textBaseline = 'top';
        ctx.fillText(String(lbl), n.x, n.y + r + 3);
      }
    }
    ctx.restore();
  }

  function drawHighlights() {
    if (!highlightPath.length) return;
    var nodes = (state && state.nodes) || [];
    ctx.save();
    ctx.strokeStyle = 'rgba(251,191,36,0.9)';
    ctx.lineWidth = 2.4 / Math.sqrt(cam.z);
    ctx.setLineDash([7, 5]); ctx.lineDashOffset = -animT * 24;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < highlightPath.length; i++) {
      var n = null;
      for (var j = 0; j < nodes.length; j++) if (nodes[j].id === highlightPath[i]) { n = nodes[j]; break; }
      if (!n) continue;
      if (!started) { ctx.moveTo(n.x, n.y); started = true; } else ctx.lineTo(n.x, n.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // endpoint markers
    ctx.fillStyle = '#fbbf24';
    for (var k2 = 0; k2 < highlightPath.length; k2++) {
      var nn = null;
      for (var m = 0; m < nodes.length; m++) if (nodes[m].id === highlightPath[k2]) { nn = nodes[m]; break; }
      if (nn) { ctx.beginPath(); ctx.arc(nn.x, nn.y, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawRevenue() {
    var ds = getDistricts();
    var maxR = 1, i;
    for (i = 0; i < ds.length; i++) maxR = Math.max(maxR, Number(ds[i].revenue) || 0);
    ctx.save();
    for (i = 0; i < ds.length; i++) {
      var d = ds[i], rv = Number(d.revenue) || 0;
      if (rv <= 0) continue;
      var c = districtCenter(d);
      var r = 9 + clamp(rv / maxR, 0, 1) * 16;
      ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(c.x, c.y - 34, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#713f12';
      ctx.font = 'bold ' + Math.round(r * 1.15) + 'px Tahoma, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('﷼', c.x, c.y - 34);
      ctx.font = 'bold ' + Math.max(10, 11 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textBaseline = 'top';
      ctx.fillText(String(Math.round(rv)), c.x, c.y - 34 + r + 3);
    }
    ctx.restore();
  }

  function drawPlacementGhost() {
    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.9)'; ctx.lineWidth = 1.6 / Math.sqrt(cam.z);
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(mouseWorld.x, mouseWorld.y, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mouseWorld.x - 18, mouseWorld.y); ctx.lineTo(mouseWorld.x + 18, mouseWorld.y);
    ctx.moveTo(mouseWorld.x, mouseWorld.y - 18); ctx.lineTo(mouseWorld.x, mouseWorld.y + 18);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    // legend (screen space, bottom-left) — small, Persian; compact on narrow screens
    ctx.save();
    var small = viewW < 600;
    ctx.font = (small ? '10px' : '12px') + ' Vazirmatn, Tahoma, sans-serif';
    var items = [
      ['#22d3ee', 'فیبر نوری'], ['#fb923c', 'مسی (DSL)'], ['#a78bfa', 'نقطه‌به‌نقطه'],
      ['#e879f9', 'ماهواره'], ['#9ca3af', 'اترنت'], ['#ef4444', 'ازدحام/خرابی']
    ];
    var bw = small ? 118 : 150, rowH = small ? 15 : 18, bh = items.length * rowH + 12;
    ctx.fillStyle = 'rgba(10,14,22,0.72)';
    ctx.fillRect(10, viewH - bh - 10, bw, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(10, viewH - bh - 10, bw, bh);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var i = 0; i < items.length; i++) {
      var y = viewH - bh - 10 + 12 + i * rowH;
      ctx.fillStyle = items[i][0];
      ctx.fillRect(10 + bw - 26, y - 2, 16, 4);
      ctx.fillStyle = 'rgba(235,240,250,0.92)';
      ctx.fillText(items[i][1], 10 + bw - 34, y);
    }
    // scale / zoom hint top-left
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(235,240,250,0.65)';
    ctx.font = '11px Vazirmatn, Tahoma, sans-serif';
    ctx.fillText('زوم: ' + Math.round(cam.z * 100) + '٪', 12, 16);
    ctx.restore();
  }

  /* ============================================================
     HIT TESTING
     ============================================================ */
  function pointSegDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    return dist(px, py, x1 + t * dx, y1 + t * dy);
  }
  function hitTest(wx, wy) {
    var i;
    var touch = viewW > 0 && viewW < 900; // finger-friendly tolerances on small screens
    var tolNode = touch ? Math.max(16, 24 / cam.z) : 16;
    var tolLink = touch ? Math.max(7, 12 / cam.z) : 7;
    var nodes = (state && state.nodes) || [];
    for (i = nodes.length - 1; i >= 0; i--) {
      if (dist(wx, wy, nodes[i].x, nodes[i].y) <= tolNode) return { kind: 'node', id: nodes[i].id };
    }
    var links = (state && state.links) || [];
    for (i = links.length - 1; i >= 0; i--) {
      var a = endPoint(state, links[i].from != null ? links[i].from : links[i].a);
      var b = endPoint(state, links[i].to != null ? links[i].to : links[i].b);
      if (!a || !b) continue;
      if (pointSegDist(wx, wy, a.x, a.y, b.x, b.y) <= tolLink) return { kind: 'link', id: links[i].id };
    }
    var bs = getBuildings();
    for (i = bs.length - 1; i >= 0; i--) {
      var bb = bs[i], w = bb.w || 26, h = bb.h || 20;
      if (wx >= bb.x && wx <= bb.x + w && wy >= bb.y && wy <= bb.y + h) return { kind: 'building', id: bb.id };
    }
    var ds = getDistricts();
    for (i = ds.length - 1; i >= 0; i--) {
      var d = ds[i];
      if (typeof d.w === 'number') {
        if (wx >= d.x && wx <= d.x + d.w && wy >= d.y && wy <= d.y + (d.h || d.w)) return { kind: 'district', id: d.id };
      } else {
        var c = districtCenter(d);
        if (dist(wx, wy, c.x, c.y) <= districtRadius(d)) return { kind: 'district', id: d.id };
      }
    }
    return null;
  }

  /* ============================================================
     INPUT
     ============================================================ */
  function eventPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onPointerDown(e) {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    var p = eventPos(e);
    pointers[e.pointerId] = p;
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      pinchDist = dist(p1.x, p1.y, p2.x, p2.y);
      pinchMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      dragging = false;
      pinched = true;
    } else {
      dragging = true; dragMoved = false; lastPX = p.x; lastPY = p.y;
      downX = p.x; downY = p.y;
      if (ids.length === 1) pinched = false;
    }
  }
  function onPointerMove(e) {
    var p = eventPos(e);
    var w = screenToWorld(p.x, p.y);
    mouseWorld = w;
    if (pointers[e.pointerId]) pointers[e.pointerId] = p;
    var ids = Object.keys(pointers);
    if (ids.length === 2 && pinchMid) {
      var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
      var nd = dist(p1.x, p1.y, p2.x, p2.y);
      var mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      if (pinchDist > 0) {
        var before = screenToWorld(mid.x, mid.y);
        camT.z = clamp(camT.z * (nd / pinchDist), 0.15, 3.5);
        cam.z = camT.z; // snap z for stable pinch anchor math
        var after = screenToWorld(mid.x, mid.y);
        camT.x += (before.x - after.x); camT.y += (before.y - after.y);
        cam.x = camT.x; cam.y = camT.y;
      }
      // pan by mid movement
      camT.x -= (mid.x - pinchMid.x) / camT.z;
      camT.y -= (mid.y - pinchMid.y) / camT.z;
      cam.x = camT.x; cam.y = camT.y;
      pinchDist = nd; pinchMid = mid;
      return;
    }
    if (dragging) {
      var dx = p.x - lastPX, dy = p.y - lastPY;
      if (dist(p.x, p.y, downX, downY) > 6) dragMoved = true; // cumulative movement from touch-down
      camT.x -= dx / camT.z; camT.y -= dy / camT.z;
      cam.x = camT.x; cam.y = camT.y;
      lastPX = p.x; lastPY = p.y;
      canvas.style.cursor = 'grabbing';
      return;
    }
    // hover
    var hit = hitTest(w.x, w.y);
    hover = hit;
    canvas.style.cursor = placementMode ? 'crosshair' : (hit ? 'pointer' : 'grab');
  }
  function onPointerUp(e) {
    var p = eventPos(e);
    var wasDrag = dragMoved;
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) { pinchDist = 0; pinchMid = null; }
    dragging = false;
    canvas.style.cursor = placementMode ? 'crosshair' : 'grab';
    if (wasDrag || pinched) { // it was a pan/pinch, not a tap
      if (Object.keys(pointers).length === 0) { pinched = false; dragMoved = false; }
      return;
    }
    var w = screenToWorld(p.x, p.y);
    if (placementMode) {
      if (cb.onPlace) cb.onPlace(Math.round(w.x), Math.round(w.y));
      return;
    }
    var hit = hitTest(w.x, w.y);
    selected = hit;
    if (cb.onSelect) cb.onSelect(hit ? hit.kind : null, hit ? hit.id : null);
  }
  function onWheel(e) {
    e.preventDefault();
    var p = eventPos(e);
    var before = screenToWorld(p.x, p.y);
    var factor = e.deltaY < 0 ? 1.12 : 0.89;
    camT.z = clamp(camT.z * factor, 0.15, 3.5);
    cam.z = camT.z;
    var after = screenToWorld(p.x, p.y);
    camT.x += (before.x - after.x); camT.y += (before.y - after.y);
    cam.x = camT.x; cam.y = camT.y;
  }
  function onDblClick(e) {
    var p = eventPos(e);
    var w = screenToWorld(p.x, p.y);
    camT.x = w.x; camT.y = w.y;
    camT.z = clamp(camT.z * 1.4, 0.15, 3.5);
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  function resize() {
    if (!canvas) return;
    dpr = clamp(global.devicePixelRatio || 1, 1, 2); // cap at 2: higher DPR oversizes the canvas and costs fill rate
    var r = canvas.getBoundingClientRect();
    viewW = Math.max(50, Math.round(r.width));
    viewH = Math.max(50, Math.round(r.height));
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
  }
  function onOrientation() { setTimeout(resize, 60); setTimeout(resize, 300); }
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    animT += Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    draw();
    rafId = global.requestAnimationFrame(loop);
  }

  var CityMap = {
    WORLD_W: WORLD_W,
    WORLD_H: WORLD_H,
    layers: layers,
    camera: cam,

    init: function (canvasEl, initialState, callbacks) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      state = initialState || {};
      applyMapData();
      if (callbacks) { cb.onSelect = callbacks.onSelect || null; cb.onPlace = callbacks.onPlace || null; }
      resize();
      fitCamera();
      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'grab';
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('dblclick', onDblClick);
      global.addEventListener('resize', resize);
      global.addEventListener('orientationchange', onOrientation);
      if (rafId) cancelAnimationFrame(rafId);
      lastTs = 0;
      rafId = global.requestAnimationFrame(loop);
      return CityMap;
    },

    setState: function (s) { state = s || state; staticCam = null; _distCache = null; applyMapData(); },
    getState: function () { return state; },

    setLayers: function (obj) {
      if (!obj) return;
      for (var k in layers) if (typeof obj[k] === 'boolean') layers[k] = obj[k];
    },
    toggleLayer: function (name) { if (name in layers) layers[name] = !layers[name]; return layers[name]; },

    setSelected: function (kind, id) { selected = kind ? { kind: kind, id: id } : null; },
    getSelected: function () { return selected; },
    setHighlightPath: function (ids) { highlightPath = Array.isArray(ids) ? ids.slice() : []; },
    clearHighlight: function () { highlightPath = []; },

    setPlacementMode: function (on) {
      placementMode = !!on;
      if (canvas) canvas.style.cursor = placementMode ? 'crosshair' : 'grab';
    },
    isPlacementMode: function () { return placementMode; },

    hitTest: function (sx, sy) {
      // accepts screen coords (CSS px relative to canvas)
      var w = screenToWorld(sx, sy);
      return hitTest(w.x, w.y);
    },
    hitTestWorld: function (wx, wy) { return hitTest(wx, wy); },
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,

    panTo: function (wx, wy) { camT.x = wx; camT.y = wy; },
    zoomTo: function (z) { camT.z = clamp(z, 0.15, 3.5); },
    zoomBy: function (f) { camT.z = clamp(camT.z * f, 0.15, 3.5); },
    fit: fitCamera,
    resize: resize,
    draw: draw,

    destroy: function () {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('dblclick', onDblClick);
      }
      global.removeEventListener('resize', resize);
      global.removeEventListener('orientationchange', onOrientation);
    }
  };

  global.CityMap = CityMap;
  if (typeof module !== 'undefined' && module.exports) module.exports = CityMap;
})(typeof window !== 'undefined' ? window : this);
