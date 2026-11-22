/* ============================================================
   شبکه‌ساز: شهر متصل — CityMap
   Vanilla JS + Canvas 2D map renderer.
   World: 1600 x 1200 world units. No build step.
   Reads sim state defensively; only assumes:
     state.nodes[]  {id,x,y,type,status,direction,angle,...}
     state.links[]  {id,from,to,medium,status,usage,capacity,...}
     state.districts[] runtime (id, demand, revenue, qos, ...)
     GAME_DATA.districts/buildings/installPoints/equipment (global, optional)
   ============================================================ */
'use strict';

(function (global) {
  var WORLD_W = 1600, WORLD_H = 1200;

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
    if (k === 'cell') return 220;
    if (k === 'fwa') return 170;
    if (k === 'wifi') return 90;
    if (k === 'ptp') return 60;
    return 0;
  }
  function congestion(l) {
    var c = Number(l.capacity) || 0, u = Number(l.usage) || 0;
    if (c <= 0) return 0;
    return clamp(u / c, 0, 2);
  }
  function nodeById(state, id) {
    if (!state || !state.nodes) return null;
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
  var ROADS_V = [120, 320, 520, 720, 920, 1120, 1320, 1480];
  var ROADS_H = [110, 280, 450, 620, 790, 960, 1110];
  var RIVER = [ // gentle S-curve, top -> bottom
    { x: 1080, y: -20 }, { x: 1040, y: 180 }, { x: 1100, y: 400 },
    { x: 1050, y: 620 }, { x: 1110, y: 850 }, { x: 1060, y: 1040 }, { x: 1100, y: 1220 }
  ];
  var BRIDGES = [280, 620, 960]; // y positions where horizontal roads cross river

  /* landmark Persian labels + icon glyphs (shapes drawn, glyph is fallback text) */
  var LANDMARKS = {
    bazaar:     { fa: 'بازار',         icon: '⌂' },
    market:     { fa: 'بازار',         icon: '⌂' },
    university: { fa: 'دانشگاه',       icon: '🎓' },
    hospital:   { fa: 'بیمارستان',     icon: '✚' },
    station:    { fa: 'ایستگاه قطار',  icon: '🚆' },
    train:      { fa: 'ایستگاه قطار',  icon: '🚆' },
    stadium:    { fa: 'ورزشگاه',       icon: '⚽' }
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
    return out;
  }
  function getBuildings() {
    if (state && state.buildings && state.buildings.length) return state.buildings;
    return (global.GAME_DATA && global.GAME_DATA.buildings) || [];
  }
  function getInstallPoints() {
    if (state && state.installPoints && state.installPoints.length) return state.installPoints;
    return (global.GAME_DATA && global.GAME_DATA.installPoints) || [];
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
  function pointCovered(x, y, srcs) {
    for (var i = 0; i < srcs.length; i++) {
      var s = srcs[i];
      if (dist(x, y, s.node.x, s.node.y) <= s.r) return true;
    }
    return false;
  }

  /* ============================================================
     DRAW
     ============================================================ */
  function draw() {
    if (!ctx) return;
    // smooth camera
    cam.x = lerp(cam.x, camT.x, 0.25);
    cam.y = lerp(cam.y, camT.y, 0.25);
    cam.z = lerp(cam.z, camT.z, 0.25);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    // backdrop outside world
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    drawGround();
    drawRoadsAndRiver();
    drawDistricts();
    var srcs = coverageSources();
    if (layers.qos) drawQosTint();
    drawCoverage(srcs);
    drawDeadZones(srcs);
    if (layers.demand) drawDemandHeat();
    drawBuildings();
    drawInstallPoints();
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
    // subtle park blocks (deterministic pseudo-random greens)
    ctx.fillStyle = 'rgba(46,90,60,0.35)';
    var seed = 42;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var i = 0; i < 26; i++) {
      var x = rnd() * (WORLD_W - 120), y = rnd() * (WORLD_H - 90), w = 40 + rnd() * 90, h = 30 + rnd() * 60;
      ctx.fillRect(x, y, w, h);
    }
    // world border
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2 / cam.z;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  }

  function drawRoadsAndRiver() {
    // river (under roads' bridges, over ground)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(RIVER[0].x, RIVER[0].y);
    for (var i = 1; i < RIVER.length - 1; i++) {
      var mx = (RIVER[i].x + RIVER[i + 1].x) / 2, my = (RIVER[i].y + RIVER[i + 1].y) / 2;
      ctx.quadraticCurveTo(RIVER[i].x, RIVER[i].y, mx, my);
    }
    ctx.lineTo(RIVER[RIVER.length - 1].x, RIVER[RIVER.length - 1].y);
    ctx.strokeStyle = '#1f4e79'; ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = '#2e6ea8'; ctx.lineWidth = 34; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,210,255,0.5)'; ctx.lineWidth = 4;
    ctx.setLineDash([14, 22]); ctx.lineDashOffset = -animT * 20; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // roads
    ctx.save();
    ctx.lineCap = 'butt';
    var j;
    ctx.strokeStyle = '#2c3542'; ctx.lineWidth = 16;
    ctx.beginPath();
    for (j = 0; j < ROADS_V.length; j++) { ctx.moveTo(ROADS_V[j], 0); ctx.lineTo(ROADS_V[j], WORLD_H); }
    for (j = 0; j < ROADS_H.length; j++) { ctx.moveTo(0, ROADS_H[j]); ctx.lineTo(WORLD_W, ROADS_H[j]); }
    ctx.stroke();
    // center dashes
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    for (j = 0; j < ROADS_V.length; j++) { ctx.moveTo(ROADS_V[j], 0); ctx.lineTo(ROADS_V[j], WORLD_H); }
    for (j = 0; j < ROADS_H.length; j++) { ctx.moveTo(0, ROADS_H[j]); ctx.lineTo(WORLD_W, ROADS_H[j]); }
    ctx.stroke();
    ctx.setLineDash([]);
    // intersections
    ctx.fillStyle = '#333e4e';
    for (var a = 0; a < ROADS_V.length; a++) for (var b = 0; b < ROADS_H.length; b++) {
      ctx.fillRect(ROADS_V[a] - 9, ROADS_H[b] - 9, 18, 18);
    }
    // bridges over river
    for (var q = 0; q < BRIDGES.length; q++) {
      var by = BRIDGES[q], bx = riverXatY(by);
      ctx.fillStyle = '#3d4a5e';
      ctx.fillRect(bx - 34, by - 11, 68, 22);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx - 34, by - 11); ctx.lineTo(bx + 34, by - 11);
      ctx.moveTo(bx - 34, by + 11); ctx.lineTo(bx + 34, by + 11); ctx.stroke();
    }
    ctx.restore();
  }
  function riverXatY(y) {
    for (var i = 0; i < RIVER.length - 1; i++) {
      var a = RIVER[i], b = RIVER[i + 1];
      if (y >= a.y && y <= b.y) { var t = (y - a.y) / Math.max(1, (b.y - a.y)); return a.x + (b.x - a.x) * t; }
    }
    return RIVER[RIVER.length - 1].x;
  }

  var DISTRICT_TINTS = ['rgba(99,102,241,0.13)', 'rgba(16,185,129,0.13)', 'rgba(245,158,11,0.13)', 'rgba(236,72,153,0.12)', 'rgba(14,165,233,0.13)', 'rgba(168,85,247,0.13)', 'rgba(34,197,94,0.12)', 'rgba(249,115,22,0.12)'];
  function drawDistricts() {
    var ds = getDistricts();
    ctx.save();
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i], c = districtCenter(d), r = districtRadius(d);
      ctx.fillStyle = d.color || DISTRICT_TINTS[i % DISTRICT_TINTS.length];
      ctx.beginPath();
      if (typeof d.w === 'number') ctx.rect(d.x, d.y, d.w, d.h || d.w);
      else ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.2 / cam.z; ctx.stroke();
      // Persian label
      ctx.font = 'bold ' + Math.max(13, 15 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      var label = String(d.name || d.id || '');
      var tw = ctx.measureText(label).width;
      ctx.fillRect(c.x - tw / 2 - 7, c.y - 11, tw + 14, 22);
      ctx.fillStyle = 'rgba(240,244,255,0.95)';
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

  function drawDeadZones(srcs) {
    var ds = getDistricts();
    ctx.save();
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];
      if (!(Number(d.demand) > 0)) continue;
      var c = districtCenter(d), r = districtRadius(d);
      // sample center + ring points; dead if center uncovered
      if (pointCovered(c.x, c.y, srcs)) continue;
      ctx.save();
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.92, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = 'rgba(239,68,68,0.10)';
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.45)'; ctx.lineWidth = 1.3 / cam.z;
      ctx.beginPath();
      var step = 22;
      for (var x = c.x - r * 2; x < c.x + r * 2; x += step) {
        ctx.moveTo(x, c.y - r); ctx.lineTo(x + r, c.y + r);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(239,68,68,0.7)'; ctx.lineWidth = 1.6 / cam.z;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold ' + Math.max(11, 12 / Math.sqrt(cam.z)) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fca5a5';
      ctx.fillText('منطقهٔ مرده', c.x, c.y + 24);
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
    // sort by height so tall drawn last (on top)
    var sorted = bs.slice().sort(function (a, b) { return (a.height || 1) - (b.height || 1); });
    for (var i = 0; i < sorted.length; i++) {
      var b = sorted[i];
      var w = b.w || 26, h = b.h || 20, ht = clamp(Number(b.height) || 1, 1, 12);
      var shade = clamp(0.35 + ht * 0.05, 0.35, 0.85);
      var lm = b.landmark || (b.type && LANDMARKS[String(b.type).toLowerCase()] ? b.type : null);
      // shadow (taller = longer)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + ht * 1.6, b.y + ht * 2.2, w, h);
      // body: taller = darker
      var v = Math.round(90 - shade * 45);
      ctx.fillStyle = lm ? '#7c5a2e' : 'rgb(' + v + ',' + (v + 8) + ',' + (v + 20) + ')';
      ctx.fillRect(b.x, b.y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1 / cam.z;
      ctx.strokeRect(b.x, b.y, w, h);
      // roof highlight
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x, b.y, w, Math.min(5, h * 0.25));
      if (lm) drawLandmark(b, String(lm).toLowerCase(), w, h);
      if (selected && selected.kind === 'building' && selected.id === b.id) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.4 / cam.z;
        ctx.strokeRect(b.x - 3, b.y - 3, w + 6, h + 6);
      }
    }
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
      lmAt('bazaar', 'bazaar', 560, 780);
      lmAt('university', 'university', 340, 330);
      lmAt('hospital', 'hospital', 1160, 390);
      lmAt('station', 'station', 800, 1080);
      lmAt('stadium', 'stadium', 1300, 250);
    }
    ctx.restore();
  }

  function drawLandmark(b, key, w, h) {
    var info = LANDMARKS[key] || { fa: b.nameFa || b.name || key, icon: '★' };
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

  function drawInstallPoints() {
    var pts = getInstallPoints();
    ctx.save();
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var occupied = p.occupied === true || p.used === true || (p.nodeId != null);
      var pulse = 0.5 + 0.5 * Math.sin(animT * 3 + i);
      ctx.strokeStyle = occupied ? 'rgba(148,163,184,0.5)' : 'rgba(250,204,21,' + (0.55 + 0.4 * pulse).toFixed(2) + ')';
      ctx.fillStyle = occupied ? 'rgba(148,163,184,0.15)' : 'rgba(250,204,21,0.18)';
      ctx.lineWidth = 1.6 / cam.z;
      ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y);
      ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y + 6); ctx.stroke();
      if (selected && selected.kind === 'install' && selected.id === p.id) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.4 / cam.z;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.stroke();
      }
    }
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
  function satellitePos() { return { x: 1450, y: 120 }; }

  function drawLinks() {
    var links = (state && state.links) || [];
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var a = endPoint(state, l.from != null ? l.from : l.a);
      var b = endPoint(state, l.to != null ? l.to : l.b);
      if (!a || !b) continue;
      var med = linkMedium(l.medium || l.type);
      if (!layerAllowsLink(med, l)) continue;
      var st = LINK_STYLES[med] || LINK_STYLES.ethernet;
      var cg = congestion(l);
      var col = st.color;
      if (cg > 0.85) col = '#ef4444';
      else if (cg > 0.65) col = '#f59e0b';
      if (isFailed(l) && layers.failures) col = '#ef4444';
      var w = st.width;
      if (layers.traffic) w = 1.2 + clamp(cg, 0, 1) * 5;
      ctx.strokeStyle = col;
      ctx.lineWidth = w / Math.sqrt(cam.z);
      ctx.setLineDash(st.dash.map(function (v) { return v / Math.sqrt(cam.z); }));
      if (layers.traffic) ctx.lineDashOffset = -animT * 30;

      var isSel = selected && selected.kind === 'link' && selected.id === l.id;
      var inPath = highlightPath.length && (highlightPath.indexOf(a.id) >= 0 && highlightPath.indexOf(b.id) >= 0);
      if (isSel || inPath) { ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10; }
      else ctx.shadowBlur = 0;

      ctx.beginPath();
      if (st.arc) {
        // satellite: arc up to satellite icon position (midpoint lifted)
        var sp = satellitePos();
        var mx = (a.x + sp.x) / 2, my = Math.min(a.y, sp.y) - 120;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, sp.x, sp.y);
        ctx.stroke();
        ctx.beginPath();
        var mx2 = (b.x + sp.x) / 2, my2 = Math.min(b.y, sp.y) - 120;
        ctx.moveTo(sp.x, sp.y);
        ctx.quadraticCurveTo(mx2, my2, b.x, b.y);
        ctx.stroke();
      } else {
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (st.arrow) drawArrow(a.x, a.y, b.x, b.y, col);
      }
      ctx.setLineDash([]); ctx.shadowBlur = 0;
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
  function drawNodes() {
    var nodes = (state && state.nodes) || [];
    ctx.save();
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = nodeKind(n.type);
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

      // inner glyph
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.font = 'bold ' + Math.round(r * 1.1) + 'px Tahoma, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var glyph = k === 'cell' ? '▲' : k === 'wifi' ? 'W' : k === 'fwa' ? 'F' : k === 'core' ? 'C' : k === 'router' ? 'R' : k === 'switch' ? 'S' : k === 'satellite' ? '✦' : k === 'customer' ? '⌂' : '●';
      ctx.fillText(glyph, n.x, n.y + 1);

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
    var pts = getInstallPoints();
    for (i = pts.length - 1; i >= 0; i--) {
      if (dist(wx, wy, pts[i].x, pts[i].y) <= tolNode) return { kind: 'install', id: pts[i].id };
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
    dpr = clamp(global.devicePixelRatio || 1, 1, 2.5);
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

    setState: function (s) { state = s || state; },
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
