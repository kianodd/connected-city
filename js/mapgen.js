// ============================================================
// شبکه‌ساز: شهر متصل — مولد نقشهٔ تصادفی با بذر (seed)
// MapGen.generate(seed) -> { districts, buildings, river, bridges, roads, parks, installPoints, hq }
// قطعی: بذر یکسان = نقشهٔ یکسان. در مرورگر global و در Node با require.
// ============================================================
(function (root) {
  'use strict';

  let DATA = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { DATA = require('./data.js'); } catch (e) { DATA = null; }
  }
  if (!DATA && typeof GAME_DATA !== 'undefined') DATA = GAME_DATA;
  if (!DATA && root && root.GAME_DATA) DATA = root.GAME_DATA;

  const WORLD_W = (DATA && DATA.world && DATA.world.width) || 3200;
  const WORLD_H = (DATA && DATA.world && DATA.world.height) || 2400;
  const RIVER_BAND = 64; // فاصلهٔ امن ساختمان از محور رودخانه (هم‌خوان با sim.js)
  const ROAD_MARGIN = 14;

  // الگوهای مناطق (همان شناسه‌ها/نوع‌ها/نام‌های نقشهٔ ثابت؛ جای و آمار با بذر تغییر می‌کند)
  const ARCHETYPES = [
    { id: 'center',      name: 'مرکز شهر',      type: 'commercial',  radius: 440, population: 18000, demandBase: 4200, priceSensitivity: 0.6,  potentialRevenue: 95000 },
    { id: 'bazaar',      name: 'بازار',          type: 'commercial',  radius: 320, population: 9000,  demandBase: 2600, priceSensitivity: 0.8,  potentialRevenue: 52000 },
    { id: 'university',  name: 'دانشگاه',        type: 'landmark',    radius: 370, population: 6500,  demandBase: 2400, priceSensitivity: 0.9,  potentialRevenue: 38000 },
    { id: 'hospital',    name: 'بیمارستان',      type: 'landmark',    radius: 300, population: 4200,  demandBase: 1800, priceSensitivity: 0.2,  potentialRevenue: 46000 },
    { id: 'industrial',  name: 'منطقه صنعتی',   type: 'industrial',  radius: 490, population: 3200,  demandBase: 3200, priceSensitivity: 0.3,  potentialRevenue: 88000 },
    { id: 'north',       name: 'حاشیه شمالی',   type: 'sparse',      radius: 480, population: 5200,  demandBase: 1100, priceSensitivity: 1.0,  potentialRevenue: 21000 },
    { id: 'residential', name: 'کوی مسکونی',    type: 'residential', radius: 450, population: 14500, demandBase: 3400, priceSensitivity: 0.7,  potentialRevenue: 61000 },
    { id: 'dense',       name: 'محله پرتراکم',  type: 'dense',       radius: 350, population: 16500, demandBase: 3900, priceSensitivity: 0.85, potentialRevenue: 72000 },
    { id: 'station',     name: 'ایستگاه قطار',   type: 'landmark',    radius: 300, population: 5000,  demandBase: 2100, priceSensitivity: 0.5,  potentialRevenue: 40000 },
    { id: 'stadium',     name: 'ورزشگاه',        type: 'landmark',    radius: 280, population: 3000,  demandBase: 1600, priceSensitivity: 0.6,  potentialRevenue: 35000 },
    { id: 'east_res',    name: 'کوی شرقی',       type: 'residential', radius: 380, population: 12000, demandBase: 3000, priceSensitivity: 0.7,  potentialRevenue: 55000 },
    { id: 'south_sparse',name: 'حاشیه جنوبی',   type: 'sparse',      radius: 380, population: 4200,  demandBase: 950,  priceSensitivity: 1.0,  potentialRevenue: 18000 },
    { id: 'west_town',   name: 'شهرک غربی',      type: 'residential', radius: 360, population: 10500, demandBase: 2700, priceSensitivity: 0.75, potentialRevenue: 50000 },
    { id: 'old_town',    name: 'بافت قدیم',      type: 'dense',       radius: 280, population: 13500, demandBase: 3300, priceSensitivity: 0.8,  potentialRevenue: 58000 },
    { id: 'uni_town',    name: 'شهرک دانشگاهی',  type: 'academic',    radius: 340, population: 8000,  demandBase: 2600, priceSensitivity: 0.85, potentialRevenue: 42000 },
    { id: 'medical',     name: 'مرکز درمانی',    type: 'medical',     radius: 300, population: 4500,  demandBase: 2000, priceSensitivity: 0.25, potentialRevenue: 50000 },
    { id: 'heavy_ind',   name: 'صنایع سنگین',    type: 'heavy_industrial', radius: 520, population: 2500, demandBase: 3800, priceSensitivity: 0.25, potentialRevenue: 98000 },
    { id: 'tourism',     name: 'منطقه گردشگری',  type: 'tourism',     radius: 380, population: 6000,  demandBase: 2800, priceSensitivity: 0.55, potentialRevenue: 64000 },
    { id: 'terminal',    name: 'پایانه مسافربری', type: 'transport',  radius: 320, population: 5500,  demandBase: 2400, priceSensitivity: 0.5,  potentialRevenue: 45000 },
    { id: 'old_bazaar',  name: 'بازار قدیمی',    type: 'commercial',  radius: 300, population: 11000, demandBase: 3100, priceSensitivity: 0.75, potentialRevenue: 56000 },
    { id: 'villa',       name: 'شهرک ویلایی',    type: 'villa',       radius: 420, population: 7000,  demandBase: 2200, priceSensitivity: 0.35, potentialRevenue: 68000 },
    { id: 'slum',        name: 'سکونتگاه حاشیه‌ای', type: 'slum',     radius: 400, population: 9000,  demandBase: 1200, priceSensitivity: 1.0,  potentialRevenue: 15000 },
    { id: 'govt',        name: 'شهرک اداری',     type: 'government',  radius: 340, population: 6000,  demandBase: 2500, priceSensitivity: 0.4,  potentialRevenue: 52000 },
    { id: 'sports',      name: 'مجموعه ورزشی',   type: 'landmark',    radius: 300, population: 3500,  demandBase: 1700, priceSensitivity: 0.6,  potentialRevenue: 36000 },
    { id: 'techpark',    name: 'پارک فناوری',    type: 'commercial',  radius: 360, population: 5000,  demandBase: 3600, priceSensitivity: 0.35, potentialRevenue: 82000 },
    { id: 'garden_city', name: 'باغ‌شهر',        type: 'residential', radius: 430, population: 9000,  demandBase: 2400, priceSensitivity: 0.65, potentialRevenue: 48000 },
    { id: 'port',        name: 'بندر خشک',       type: 'industrial',  radius: 460, population: 2800,  demandBase: 2900, priceSensitivity: 0.3,  potentialRevenue: 76000 },
  ];

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let x = Math.imul(t ^ (t >>> 15), t | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function roadLines(max, step, offset) {
    const out = [];
    for (let v = offset; v < max; v += step) out.push(v);
    return out;
  }
  function riverXAtY(river, y) {
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i], b = river[i + 1];
      if (y >= a.y && y <= b.y) { const t = (y - a.y) / Math.max(1, b.y - a.y); return a.x + (b.x - a.x) * t; }
    }
    return river[river.length - 1].x;
  }
  function rectHitsRoad(x, y, w, h, roads) {
    for (const lx of roads.v) if (x - ROAD_MARGIN < lx && lx < x + w + ROAD_MARGIN) return true;
    for (const ly of roads.h) if (y - ROAD_MARGIN < ly && ly < y + h + ROAD_MARGIN) return true;
    return false;
  }
  function rectHitsRiver(x, y, w, h, river) {
    const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]];
    for (const p of pts) if (Math.abs(p[0] - riverXAtY(river, p[1])) < RIVER_BAND) return true;
    return false;
  }
  function rectOverlaps(x, y, w, h, buildings) {
    const G = 3;
    for (const b of buildings) {
      if (x < b.x + (b.w || 26) + G && x + w + G > b.x && y < b.y + (b.h || 20) + G && y + h + G > b.y) return true;
    }
    return false;
  }

  function generate(seed) {
    const rnd = mulberry32((seed == null ? 42 : seed) >>> 0);
    const R = (a, b) => a + rnd() * (b - a);

    // ---------- HQ ----------
    const hq = { x: Math.round(R(WORLD_W * 0.42, WORLD_W * 0.58) / 20) * 20, y: Math.round(R(WORLD_H * 0.42, WORLD_H * 0.58) / 20) * 20 };

    // ---------- رودخانه ----------
    let riverBase = R(WORLD_W * 0.60, WORLD_W * 0.72);
    const river = [];
    let rx = riverBase;
    const riverStep = (WORLD_H + 80) / 6;
    for (let i = 0; i < 7; i++) {
      const y = -40 + i * riverStep;
      if (i > 0) rx = clamp(rx + R(-260, 260), WORLD_W * 0.48, WORLD_W * 0.83);
      river.push({ x: Math.round(rx), y: Math.round(y) });
    }
    // رودخانه نباید از روی HQ رد شود
    const rxAtHq = riverXAtY(river, hq.y);
    if (Math.abs(rxAtHq - hq.x) < 480) {
      const shift = (rxAtHq >= hq.x ? 1 : -1) * (480 - Math.abs(rxAtHq - hq.x));
      river.forEach((p) => { p.x = Math.round(clamp(p.x + shift, WORLD_W * 0.45, WORLD_W * 0.85)); });
    }

    // ---------- شبکهٔ خیابان‌ها ----------
    const offset = [120, 160, 200, 240, 280][Math.floor(rnd() * 5)];
    const roads = {
      v: roadLines(WORLD_W, 200, offset),
      h: roadLines(WORLD_H, 200, offset),
      av: roadLines(WORLD_W, 400, offset),
      ah: roadLines(WORLD_H, 400, offset),
    };
    // پل‌ها: چهار بلوار افقی پخش‌شده در ارتفاع شهر
    const bridgeCands = roads.ah.filter((y) => y > 300 && y < WORLD_H - 300);
    const bridges = [0.15, 0.38, 0.62, 0.85].map((f) => bridgeCands[Math.min(bridgeCands.length - 1, Math.floor(f * bridgeCands.length))]);

    // ---------- مناطق (بدون هم‌پوشانی: فاصلهٔ مراکز ≥ مجموع شعاع‌ها + حاشیه) ----------
    const DISTRICT_GAP = 40;
    const districts = [];
    function clearOfDistricts(x, y, radius) {
      for (const d of districts) {
        if (Math.hypot(x - d.x, y - d.y) < radius + d.radius + DISTRICT_GAP) return false;
      }
      return true;
    }
    function placeDistrict(arch, fixedPos) {
      let radius = Math.round(arch.radius * R(0.85, 1.15));
      let pos = fixedPos || null;
      if (pos) {
        // موقعیت ثابت (مرکز/حاشیه شمالی): اگر با منطقهٔ قبلی هم‌پوشانی دارد، در همان جهت بیرون رانده شود
        for (const d of districts) {
          const need = radius + d.radius + DISTRICT_GAP;
          const dd = Math.hypot(pos.x - d.x, pos.y - d.y);
          if (dd < need) {
            const ang = Math.atan2(pos.y - d.y, pos.x - d.x);
            pos = {
              x: Math.round(clamp(d.x + Math.cos(ang) * need, 220, WORLD_W - 220)),
              y: Math.round(clamp(d.y + Math.sin(ang) * need, 220, WORLD_H - 220)),
            };
          }
        }
        // مرکز منطقه داخل رودخانه نباشد
        const rxp = riverXAtY(river, pos.y);
        if (Math.abs(pos.x - rxp) < 170) pos.x = Math.round(clamp(pos.x + (pos.x >= rxp ? 170 : -170), 220, WORLD_W - 220));
      } else {
        for (let attempt = 0; attempt < 1200 && !pos; attempt++) {
          if (attempt > 0 && attempt % 200 === 0) radius = Math.max(170, Math.round(radius * 0.9));
          const x = Math.round(R(radius * 0.55, WORLD_W - radius * 0.55));
          const y = Math.round(R(radius * 0.55, WORLD_H - radius * 0.55));
          if (Math.abs(x - riverXAtY(river, y)) < 130) continue; // مرکز منطقه داخل رودخانه نباشد
          if (clearOfDistricts(x, y, radius)) pos = { x, y };
        }
        if (!pos) {
          // آخرین راه: اسکن شبکه‌ای با کمترین شعاع
          radius = 170;
          scan: for (let gy = 300; gy < WORLD_H - 300; gy += 110) {
            for (let gx = 300; gx < WORLD_W - 300; gx += 110) {
              if (Math.abs(gx - riverXAtY(river, gy)) < 130) continue;
              if (clearOfDistricts(gx, gy, radius)) { pos = { x: gx, y: gy }; break scan; }
            }
          }
        }
        if (!pos) pos = { x: Math.round(R(300, WORLD_W - 300)), y: Math.round(R(300, WORLD_H - 300)) };
      }
      const d = {
        id: arch.id, name: arch.name, type: arch.type,
        x: pos.x, y: pos.y, radius,
        population: Math.round(arch.population * R(0.85, 1.15)),
        demandBase: Math.round(arch.demandBase * R(0.85, 1.15)),
        priceSensitivity: Math.round(clamp(arch.priceSensitivity + R(-0.1, 0.1), 0.1, 1) * 100) / 100,
        potentialRevenue: Math.round(arch.potentialRevenue * R(0.85, 1.15)),
      };
      districts.push(d);
      return d;
    }
    const byId = {};
    ARCHETYPES.forEach((a) => { byId[a.id] = a; });
    placeDistrict(byId.center, { x: hq.x, y: hq.y }); // مرکز شهر روی HQ
    // حاشیه شمالی: نزدیک HQ تا آموزش و اولین سرویس همیشه ممکن باشد
    // (فاصله به‌اندازه‌ای است که با مرکز شهر هم‌پوشانی نداشته باشد؛ در صورت نیاز بیرون رانده می‌شود)
    const northAng = -Math.PI / 2 + R(-0.6, 0.6);
    const northDist = R(1120, 1350);
    placeDistrict(byId.north, {
      x: Math.round(clamp(hq.x + Math.cos(northAng) * northDist, 320, WORLD_W - 320)),
      y: Math.round(clamp(hq.y + Math.sin(northAng) * northDist, 320, WORLD_H - 320)),
    });
    ARCHETYPES.forEach((a) => { if (a.id !== 'center' && a.id !== 'north') placeDistrict(a); });

    // ---------- ساختمان‌ها ----------
    const bTypes = (DATA && DATA.buildingTypes) || ['residential', 'commercial', 'office', 'industrial'];
    const palettes = (DATA && DATA.buildingColors) || {
      residential: ['#5b6b82', '#64748b', '#55677d', '#6b7a90', '#5f7186'],
      commercial: ['#7a6a4f', '#8a7a5c', '#6e5f45', '#837257'],
      office: ['#4f6a7a', '#557a8a', '#47626f', '#5d7f8f'],
      industrial: ['#6b5a4a', '#75624f', '#5f5044', '#6f5d4c'],
    };
    const buildings = [];
    let bIdx = 0;
    districts.forEach((d) => {
      const count = (d.type === 'dense' || d.type === 'commercial' || d.type === 'slum') ? 16
        : d.type === 'sparse' ? 7
        : d.type === 'villa' ? 8
        : (d.type === 'landmark' || d.type === 'medical' || d.type === 'transport') ? 10 : 12;
      // خوشهٔ برج‌ها در مناطق متراکم/تجاری/اداری
      const cluster = (d.type === 'dense' || d.type === 'commercial' || d.type === 'government')
        ? { x: d.x + R(-0.35, 0.35) * d.radius, y: d.y + R(-0.35, 0.35) * d.radius } : null;
      for (let i = 0; i < count; i++) {
        let placed = null;
        for (let attempt = 0; attempt < 60 && !placed; attempt++) {
          const w = 26 + Math.floor(rnd() * 42);
          const h = 26 + Math.floor(rnd() * 42);
          const ang = rnd() * Math.PI * 2;
          const rr = Math.sqrt(rnd()) * d.radius * 0.82;
          const x = Math.round(d.x + Math.cos(ang) * rr - w / 2);
          const y = Math.round(d.y + Math.sin(ang) * rr - h / 2);
          if (x < 10 || y < 10 || x + w > WORLD_W - 10 || y + h > WORLD_H - 10) continue;
          if (rectHitsRoad(x, y, w, h, roads)) continue;
          if (rectHitsRiver(x, y, w, h, river)) continue;
          if (rectOverlaps(x, y, w, h, buildings)) continue;
          placed = { x, y, w, h };
        }
        if (!placed) continue;
        bIdx++;
        const inCluster = cluster && Math.hypot(placed.x + placed.w / 2 - cluster.x, placed.y + placed.h / 2 - cluster.y) < 170;
        const tall = (d.type === 'dense' || d.type === 'commercial' || d.type === 'government' || d.type === 'academic') && rnd() > (inCluster ? 0.25 : 0.55);
        const height = tall ? 10 + Math.floor(rnd() * 18) : 2 + Math.floor(rnd() * 7);
        const bType = (d.type === 'industrial' || d.type === 'heavy_industrial') ? 'industrial' : bTypes[Math.floor(rnd() * 3)];
        const palette = palettes[bType] || palettes.residential;
        buildings.push({
          id: 'b' + bIdx,
          districtId: d.id,
          x: placed.x, y: placed.y, w: placed.w, h: placed.h,
          height,
          type: bType,
          color: palette[Math.floor(rnd() * palette.length)],
          name: height >= 15 ? 'برج ' + d.name + ' ' + i : undefined,
        });
      }
    });

    // ---------- ساختمان‌های پراکندهٔ خارج از مناطق (روستایی/حاشیه‌ای، تراکم کم) ----------
    const OUTSIDE_COUNT = 130;
    for (let i = 0; i < OUTSIDE_COUNT; i++) {
      let placed = null;
      for (let attempt = 0; attempt < 40 && !placed; attempt++) {
        const w = 22 + Math.floor(rnd() * 30);
        const h = 22 + Math.floor(rnd() * 30);
        const x = Math.round(R(20, WORLD_W - w - 20));
        const y = Math.round(R(20, WORLD_H - h - 20));
        const cx = x + w / 2, cy = y + h / 2;
        // بیرون از همهٔ مناطق (با حاشیه)
        if (districts.some((d) => Math.hypot(cx - d.x, cy - d.y) < d.radius + 30)) continue;
        if (rectHitsRoad(x, y, w, h, roads)) continue;
        if (rectHitsRiver(x, y, w, h, river)) continue;
        if (rectOverlaps(x, y, w, h, buildings)) continue;
        placed = { x, y, w, h };
      }
      if (!placed) continue;
      bIdx++;
      const bType = rnd() < 0.7 ? 'residential' : (rnd() < 0.5 ? 'industrial' : 'commercial');
      const palette = palettes[bType] || palettes.residential;
      buildings.push({
        id: 'b' + bIdx,
        districtId: null, // خارج از مناطق
        x: placed.x, y: placed.y, w: placed.w, h: placed.h,
        height: 1 + Math.floor(rnd() * 4),
        type: bType,
        color: palette[Math.floor(rnd() * palette.length)],
      });
    }

    // ---------- پارک‌ها ----------
    const parks = [];
    for (let i = 0; i < 160; i++) {
      const w = 60 + rnd() * 150, h = 45 + rnd() * 100;
      const x = rnd() * (WORLD_W - 200), y = rnd() * (WORLD_H - 160);
      if (Math.abs(x + w / 2 - riverXAtY(river, y + h / 2)) < 90) continue;
      parks.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
    for (let i = 0; i < 5; i++) {
      parks.push({ x: Math.round(R(200, WORLD_W - 600)), y: Math.round(R(200, WORLD_H - 500)), w: Math.round(R(280, 380)), h: Math.round(R(180, 260)) });
    }

    // ---------- نقاط نصب (داده؛ HQ از اینجا خوانده می‌شود) ----------
    const installPoints = [{ id: 'ip_hq', x: hq.x, y: hq.y, kind: 'datacenter', name: 'مرکز دادهٔ مرکزی (HQ)' }];
    districts.forEach((d, i) => {
      if (d.id === 'center') return;
      const kind = d.type === 'landmark' ? 'equipment_room' : (i % 2 ? 'rooftop' : 'tower');
      installPoints.push({ id: 'ip_' + d.id, x: d.x, y: d.y, kind, name: 'نقطه نصب ' + d.name });
    });

    return { districts, buildings, river, bridges, roads, parks, installPoints, hq };
  }

  const MapGen = { generate, ARCHETYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = MapGen;
  if (root) root.MapGen = MapGen;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
