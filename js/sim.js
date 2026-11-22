// ============================================================
// شبکه‌ساز: شهر متصل — هستهٔ شبیه‌سازی (بدون DOM)
// در مرورگر: global GameSim | در Node: module.exports
// ============================================================
(function (root) {
  'use strict';

  // ---------- بارگذاری داده‌ها (مرورگر: global GAME_DATA، نود: require) ----------
  let DATA = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { DATA = require('./data.js'); } catch (e) { DATA = null; }
  }
  if (!DATA && typeof GAME_DATA !== 'undefined') DATA = GAME_DATA;
  if (!DATA && root && root.GAME_DATA) DATA = root.GAME_DATA;

  // ---------- مولد نقشه (اختیاری؛ اگر نبود نقشهٔ ثابت DATA استفاده می‌شود) ----------
  let MapGen = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { MapGen = require('./mapgen.js'); } catch (e) { MapGen = null; }
  }
  if (!MapGen && root && root.MapGen) MapGen = root.MapGen;

  // ---------- ابزار ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

  function getEq(eqId) {
    if (!DATA) return null;
    const e = DATA.equipment;
    if (!e) return null;
    if (e[eqId] && e[eqId].id === eqId) return e[eqId];
    if (Array.isArray(e)) return e.find((x) => x.id === eqId) || null;
    return e[eqId] || null;
  }
  function getTech(techId) {
    if (!DATA) return null;
    const t = DATA.techs;
    if (!t) return null;
    if (t[techId] && t[techId].id === techId) return t[techId];
    if (Array.isArray(t)) return t.find((x) => x.id === techId) || null;
    return t[techId] || null;
  }

  // RNG قطعی (mulberry32) — وضعیت در state.rngState نگه داشته می‌شود
  function rand(state) {
    let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // جریان RNG جدا برای ویژگی‌های جدید (آب‌وهوا، افراد، قرارداد، ماهواره) تا توالی
  // تصادفی سازوکارهای قدیمی (خرابی، رشد شهر، رویدادها) و تست‌های موجود دست‌نخورده بماند
  function rand2(state) {
    if (state.rngState2 == null) state.rngState2 = ((state.seed || 42) ^ 0x9e3779b9) >>> 0;
    let t = (state.rngState2 = (state.rngState2 + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const ACCESS_TYPES = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g', 'fwa_ap', 'wifi_ap', 'ftth', 'sat_terminal_leo', 'sat_terminal_geo'];

  // گره دسترسی: انواع کلاسیک + هر تجهیز کاتالوگ با دستهٔ access/antenna و فیلد tech
  function isAccessNode(n) {
    if (!n) return false;
    if (ACCESS_TYPES.includes(n.type)) return true;
    const eq = getEq(n.type);
    return !!(eq && eq.tech && (eq.category === 'access' || eq.category === 'antenna'));
  }
  // دستهٔ تجهیز گره (برای اثرات برق/ابزار)
  function nodeCategory(n) {
    const eq = n ? getEq(n.type) : null;
    return eq ? eq.category : null;
  }

  // ---------- تقاضا به تفکیک فناوری ----------
  const TECH_KEYS = ['fiber', 'cellular', 'fwa', 'wifi', 'satellite'];
  // ---------- مدل تقاضا: فقط مشترک ترافیک می‌سازد ----------
  // بدون اشتراک هیچ سرویسی نیست: پوشش به‌تنهایی به کسی اینترنت نمی‌دهد و غیرمشترکان
  // هیچ ظرفیتی مصرف نمی‌کنند. ترافیک هر منطقه = مشترکان × سرعت بسته × ضریب هم‌زمانی
  // (مالتی‌پلکس آماری: در عمل فقط حدود ۲٪ از سقف بسته به‌صورت میانگینِ ساعت شلوغ
  // مصرف می‌شود؛ یعنی هر مشترک خانگی با بستهٔ ۵۰ مگابیت حدود ۱ مگابیت میانگین بار دارد
  // — نسبت اشتراک‌فروشی ۵۰:۱ که در شبکه‌های واقعی هم رایج است).
  // جمعیت فقط «بازار قابل‌دسترس» است که رشد مشترک از آن تغذیه می‌شود، نه بار شبکه.
  const CONCURRENCY = 0.02;
  function districtPackage(state, d) {
    const cust = (state.customers || []).find((c) => c.districtId === d.id);
    return (state.packages || []).find((p) => p.id === (cust ? cust.packageId : 'home')) || null;
  }
  function packageSpeed(pkg) { return pkg ? (pkg.speedMbps || pkg.speed || 50) : 50; }
  // ترافیک میانگینِ یک مشترک (Mbps) در ساعت شلوغ، با ضریب مصرف منطقه
  function perSubTraffic(state, d, timeFactor) {
    const pkg = districtPackage(state, d);
    return packageSpeed(pkg) * CONCURRENCY * (timeFactor == null ? 1 : timeFactor) * (d.usageMult || 1);
  }
  function techOfNode(type) {
    if (type === 'ftth') return 'fiber';
    if (type && type.indexOf('cell_') === 0) return 'cellular';
    if (type === 'fwa_ap') return 'fwa';
    if (type === 'wifi_ap') return 'wifi';
    if (type && type.indexOf('sat_terminal') === 0) return 'satellite';
    const eq = getEq(type);
    return (eq && eq.tech) || null;
  }
  // ---------- ساعت، فصل، آب‌وهوا (ویژگی‌های ۴۵ و ۴۶) ----------
  // ساعت پیش‌فرض بازی ۱۰ است و منحنی تقاضا در ساعت‌های ۹ تا ۱۱ برابر ۱٫۰ است؛
  // پس بدون دخالت UI، تقاضا دقیقاً مثل قبل می‌ماند.
  function demandFactorAtHour(hour) {
    const curve = DATA && DATA.hourDemandCurve;
    if (!Array.isArray(curve) || curve.length < 24) return 1;
    const h = (((hour == null ? 10 : hour) % 24) + 24) % 24;
    const i = Math.floor(h), f = h - i;
    const a = curve[i], b = curve[(i + 1) % 24];
    if (a == null || b == null) return 1;
    return a * (1 - f) + b * f;
  }
  function clockTick(state, dtHours) {
    const cur = state.hour == null ? 10 : state.hour;
    const total = cur + (dtHours || 0);
    // عبور از نیمه‌شب = یک روز کامل؛ حلقهٔ اصلی بازی به‌ازای هر نیمه‌شب یک tick روزانه می‌زند
    // تا شمارندهٔ «روز» دقیقاً با ساعت هم‌گام بماند (قبلاً روز ساعت ۱۰ عوض می‌شد)
    const wraps = Math.floor(total / 24);
    if (wraps > 0) state.pendingDays = (state.pendingDays || 0) + wraps;
    state.hour = (((total % 24) + 24) % 24);
    return state.hour;
  }
  // میانگین ضریب تقاضا در کل ۲۴ ساعت — برای محاسبهٔ روزانهٔ اقتصاد (tick) تا درآمد
  // به ساعتِ لحظهٔ tick وابسته نباشد؛ نمایش لحظه‌ای (تست سرعت/هیت‌مپ) از ضریب ساعتی استفاده می‌کند
  function dailyAvgDemandFactor() {
    const curve = DATA && DATA.hourDemandCurve;
    if (!Array.isArray(curve) || curve.length < 24) return 1;
    let sum = 0;
    for (let i = 0; i < 24; i++) sum += (curve[i] == null ? 1 : curve[i]);
    return sum / 24;
  }
  const FALLBACK_SEASON = { id: 'spring', name: 'بهار', demandFactor: 1, weather: { clear: 1, rain: 0, storm: 0, snow: 0 } };
  function seasonOf(state) {
    const seasons = DATA && DATA.seasons;
    if (!Array.isArray(seasons) || !seasons.length) return FALLBACK_SEASON;
    const idx = Math.floor(((state.day || 1) - 1) / 90) % 4;
    return seasons[idx] || seasons[0] || FALLBACK_SEASON;
  }
  function weatherKindCfg(kind) {
    const kinds = DATA && DATA.weatherKinds;
    return (kinds && kinds[kind]) || null;
  }
  function isMmWaveNode(n) {
    const eq = n ? getEq(n.type) : null;
    const name = (eq && eq.name) || (n && n.name) || '';
    return name.indexOf('mmWave') >= 0 || name.indexOf('۲۶ گیگاهرتز') >= 0;
  }
  // ضریب ظرفیت گره بر اساس آب‌وهوای جاری: بی‌سیم و mmWave و ماهواره افت می‌کنند، فیبر نه
  function nodeWeatherFactor(state, n) {
    if (!n || !state.weather) return 1;
    const cfg = weatherKindCfg(state.weather.kind);
    if (!cfg) return 1;
    if (isMmWaveNode(n)) return cfg.mmwaveFactor != null ? cfg.mmwaveFactor : 1;
    const tech = techOfNode(n.type);
    if (tech === 'fiber') return 1;
    if (tech === 'satellite') return cfg.satFactor != null ? cfg.satFactor : 1;
    if (tech === 'cellular' || tech === 'fwa' || tech === 'wifi') return cfg.wirelessFactor != null ? cfg.wirelessFactor : 1;
    return 1;
  }
  function rollWeather(state) {
    if (!state.weather) state.weather = { kind: 'clear', untilDay: 1 };
    if (state.day < state.weather.untilDay) return;
    // بدون پیکربندی آب‌وهوا در داده‌ها، هوا همیشه صاف می‌ماند (و RNG مصرف نمی‌شود)
    if (!(DATA && (DATA.weatherKinds || DATA.seasons))) { state.weather.untilDay = Math.floor(state.day) + 1; return; }
    const season = seasonOf(state);
    const probs = (season && season.weather) || { clear: 1 };
    const kinds = ['clear', 'rain', 'storm', 'snow'];
    let r = rand2(state), picked = 'clear';
    for (const k of kinds) { const p = probs[k] || 0; if (r < p) { picked = k; break; } r -= p; }
    const prev = state.weather.kind;
    state.weather.kind = picked;
    state.weather.untilDay = Math.floor(state.day) + 1 + Math.floor(rand2(state) * 3); // ۱ تا ۳ روز
    if (picked !== prev && picked !== 'clear') {
      const cfg = weatherKindCfg(picked);
      log(state, 'آب‌وهوا تغییر کرد: ' + ((cfg && cfg.name) || picked) + ' — کیفیت لینک‌های بی‌سیم افت می‌کند.', 'warn');
    }
  }

  // ---------- گوهٔ سکتوری آنتن (ویژگی ۲۲) ----------
  // قرارداد جهت: درجه، ۰ = شرق (محور +x)، مثبت = پادساعتگرد در مختصات جهان.
  // چون محور y در نقشه رو به پایین است، زاویهٔ نقطه با atan2(-dy, dx) گرفته می‌شود
  // تا با قرارداد رسم map.js (بردار جهت = (cos θ, -sin θ)) دقیقاً یکی باشد.
  // گره با angle>=360 همه‌جهته است.
  function inWedge(node, x, y) {
    if (!node) return false;
    const angle = node.angle == null ? 360 : node.angle;
    if (angle >= 360) return true;
    const dx = x - node.x, dy = y - node.y;
    if (Math.hypot(dx, dy) < 1) return true;
    const dir = node.direction || 0;
    const ang = Math.atan2(-dy, dx) * 180 / Math.PI;
    const diff = (((ang - dir) + 540) % 360) - 180;
    return Math.abs(diff) <= angle / 2;
  }

  // ---------- کانال فرکانسی و تداخل (ویژگی ۲۱) ----------
  // کانال‌ها ۱-مبنا هستند (۱..count) تا با برچسب‌های DATA.channelSets جور باشند.
  function channelCountFor(node) {
    const sets = DATA && DATA.channelSets;
    if (!sets || !node) return 0;
    const tech = techOfNode(node.type);
    return (tech && sets[tech] && sets[tech].count) || 0;
  }
  function interferenceFor(state, node, channel, includeBuilding) {
    if (!node || channel == null) return 0;
    const tech = techOfNode(node.type);
    if (!tech) return 0;
    let sum = 0;
    for (const m of (state.nodes || [])) {
      if (m === node || m.id === node.id) continue;
      if (!isAccessNode(m)) continue;
      // در جریان ترافیک فقط گره‌های قابل‌استفاده؛ هنگام انتخاب کانال، گره‌های در حال ساخت هم شمرده می‌شوند
      if (!isUsableNode(m) && !(includeBuilding && (m.status === 'building' || m.status === 'repairing'))) continue;
      if (techOfNode(m.type) !== tech || m.channel !== channel) continue;
      const denom = (node.radius || 0) + (m.radius || 0);
      if (denom <= 0) continue;
      sum += Math.max(0, 1 - dist(node.x, node.y, m.x, m.y) / denom);
    }
    return clamp(sum, 0, 1);
  }
  function leastInterferedChannel(state, node) {
    const count = channelCountFor(node);
    if (!count) return null;
    let best = 1, bestVal = Infinity;
    for (let ch = 1; ch <= count; ch++) {
      const v = interferenceFor(state, node, ch, true);
      if (v < bestVal) { bestVal = v; best = ch; }
    }
    return best;
  }

  // ---------- دید مستقیم (LoS) و تأخیر مسیر ----------
  // شمار ساختمان‌هایی که مرکزشان نزدیک پاره‌خط (ax,ay)-(bx,by) است (با پیش‌فیلتر جعبهٔ مرزی)
  function segNearBuildings(state, ax, ay, bx, by, minHeight) {
    const bs = state.buildings || (DATA && DATA.buildings) || [];
    const minX = Math.min(ax, bx) - 45, maxX = Math.max(ax, bx) + 45;
    const minY = Math.min(ay, by) - 45, maxY = Math.max(ay, by) + 45;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let count = 0;
    for (const b of bs) {
      if ((b.height || 0) < minHeight) continue;
      const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
      const tt = clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1);
      if (dist(cx, cy, ax + tt * dx, ay + tt * dy) < 45) count++;
    }
    return count;
  }
  // مدل سیگنال: ارتفاع ساختمان فقط دید لینک نقطه‌به‌نقطه (PtP) را مخدوش می‌کند؛
  // ساختمان‌ها روی سیگنال سلولار هیچ اثری ندارند؛ برای FWA/وای‌فای هر ساختمانِ سر راه
  // فقط ۴٪ از قدرت سیگنال کم می‌کند (سقف مجموع: ‎−۳۰٪). فیبر و ماهواره هم از ساختمان اثر نمی‌گیرند.
  function buildingAttenuation(state, ax, ay, bx, by) {
    return Math.max(0.70, 1 - 0.04 * segNearBuildings(state, ax, ay, bx, by, 0));
  }
  function ptpLosFactor(state, a, b) {
    if (!a || !b) return 1;
    return segNearBuildings(state, a.x, a.y, b.x, b.y, 10) > 0 ? 0.35 : 1;
  }
  function wirelessAttFactor(state, tech, ax, ay, bx, by) {
    if (tech === 'fiber' || tech === 'satellite' || tech === 'cellular') return 1;
    return buildingAttenuation(state, ax, ay, bx, by);
  }
  const TECH_LATENCY_BASE = { fiber: 5, cellular: 30, fwa: 25, wifi: 10, satellite: 45 };
  function techLatencyBase(tech, node) {
    if (tech === 'satellite') {
      const eq = node ? getEq(node.type) : null;
      const isGeo = node && (node.type === 'sat_terminal_geo' || ((eq && eq.name) || '').indexOf('GEO') >= 0);
      return isGeo ? 600 : 45;
    }
    return TECH_LATENCY_BASE[tech] || 20;
  }
  function pathLatency(state, nodeId) {
    const path = bfsPath(state, nodeId);
    if (!path) return 0;
    let sum = 0;
    for (const id of path) { const l = linkById(state, id); if (l) sum += l.latency || 0; }
    return sum;
  }

  // ---------- صورت فلکی ماهواره‌های اختصاصی (ویژگی ۲۹) ----------
  // مدل ساده و سازگار: ظرفیت صورت فلکی بین لینک‌های ماهواره‌ای تقسیم می‌شود و به
  // ظرفیت مؤثر هر لینک ماهواره‌ای اضافه می‌شود (در ازدحام computeFlow و تست سرعت)؛
  // هزینهٔ ماهانهٔ پایانه‌ها هم وقتی صورت فلکی فعال است به ۳۰٪ می‌رسد.
  function constellationCapacity(state) {
    return (state.satellites || []).filter((s) => s.status === 'active').reduce((sum, s) => sum + (s.capacity || 0), 0);
  }
  function constellationBonusPerLink(state) {
    const cap = constellationCapacity(state);
    if (cap <= 0) return 0;
    const satLinks = (state.links || []).filter((l) => l.medium === 'satellite' && isUsableLink(l)).length;
    return cap / Math.max(1, satLinks);
  }

  // ---------- کمپین‌های تبلیغاتی (ویژگی ۱۴) ----------
  function campaignMultFor(state, districtId) {
    let mult = 1;
    for (const c of (state.campaigns || [])) {
      if (!c.active || !(c.districtIds || []).includes(districtId)) continue;
      const type = (DATA.campaignTypes || []).find((t) => t.id === c.typeId);
      if (type && type.growthMult) mult = Math.max(mult, type.growthMult);
    }
    return mult;
  }

  // سهم تقاضای هر فناوری از تقاضای کل منطقه + بخش سرویس‌گرفته با ظرفیت همان فناوری
  function computeTechDemand(d, servers, congestionFactor, fiberRatio) {
    const split = (DATA.techDemandSplit && DATA.techDemandSplit[d.type]) || DATA.techDemandSplitDefault || {};
    const techCap = { fiber: 0, cellular: 0, fwa: 0, wifi: 0, satellite: 0 };
    for (const srv of (servers || [])) { const t = techOfNode(srv.type); if (t) techCap[t] += (srv._effCap != null ? srv._effCap : srv.capacity) || 0; }
    // فیبر دستی است: فقط به نسبت ساختمان‌های دارای انشعاب فعال سرویس می‌دهد
    if (fiberRatio != null) techCap.fiber *= fiberRatio;
    const demand = d.demand != null ? d.demand : 0;
    const cf = congestionFactor == null ? 1 : congestionFactor;
    const out = {};
    for (const t of TECH_KEYS) {
      const td = demand * (split[t] || 0);
      out[t] = { demand: Math.round(td), served: Math.round(Math.min(td, techCap[t]) * cf) };
    }
    return out;
  }

  // ---------- تست سرعت در یک نقطه از نقشه، به تفکیک فناوری ----------
  // سرعت مؤثر = گلوگاه مسیر (ظرفیت گره و لینک‌ها) × افت فاصله × افت دید × افت ازدحام
  // ---------- اثرات کارکنان ----------
  // نرخ‌های پایه با صفر کارمند برای شبکهٔ کوچک کاملاً قابل بازی‌اند؛
  // کمبود نیرو فقط وقتی شبکه بزرگ می‌شود واقعاً گلوگیر می‌شود (نسبت نیرو به نیاز).
  function staffEffects(state) {
    const staff = state.staff || [];
    const count = (role) => staff.filter((s) => s.role === role).length;
    const techs = count('technician'), engs = count('engineer'), sups = count('support'), sales = count('sales');
    const nodeCount = (state.nodes || []).filter((n) => n.type !== 'core_router' && n.type !== 'internet_gateway').length;
    const linkCount = (state.links || []).length;
    const totalSubs = (state.districts || []).reduce((s, d) => s + (d.subscribers || 0), 0) + ((state.scattered && state.scattered.subscribers) || 0);
    const servedDistricts = (state.districts || []).filter((d) => d.connected).length;
    const reqTechs = Math.max(1, Math.ceil(nodeCount / 8));
    const reqEngs = Math.max(1, Math.ceil(linkCount / 10));
    const reqSups = Math.max(1, Math.ceil(totalSubs / 1500));
    const reqSales = Math.max(1, Math.ceil(servedDistricts / 4));
    const ratio = (c, r) => (r > 0 ? c / r : 1);
    // ابزارهای اندازه‌گیری و تست فعال: ساخت و تعمیر را سریع‌تر می‌کنند
    const toolCount = (state.nodes || []).filter((n) => nodeCategory(n) === 'tools' && isUsableNode(n)).length;
    const buildSpeed = clamp((0.6 + 0.4 * Math.min(1, ratio(techs, reqTechs)) + 0.1 * Math.max(0, techs - reqTechs)) * (1 + Math.min(0.3, 0.03 * toolCount)), 0.6, 2.6);
    const repairSpeed = clamp((0.3 + 0.7 * Math.min(1, ratio(techs, reqTechs)) + 0.15 * Math.max(0, techs - reqTechs)) * (1 + Math.min(0.5, 0.06 * toolCount)), 0.3, 3.2);
    const capMult = clamp(0.88 + 0.12 * Math.min(1, ratio(engs, reqEngs)) + 0.04 * Math.max(0, engs - reqEngs), 0.88, 1.35);
    const supR = Math.min(1, ratio(sups, reqSups));
    const satDecayRate = 0.25 * (1 - 0.45 * supR);
    const satRecoveryRate = 0.25 * (1 + 0.8 * supR);
    const churnKeepUnserved = 1 - 0.03 * (1 - 0.6 * supR);
    const churnKeepLowQos = 1 - 0.04 * (1 - 0.6 * supR);
    const growthMult = clamp(1 + 0.5 * Math.min(1, ratio(sales, reqSales)) + 0.05 * Math.max(0, sales - reqSales), 1, 2.0);
    return {
      techs, engs, sups, sales, reqTechs, reqEngs, reqSups, reqSales,
      nodeCount, linkCount, totalSubs, servedDistricts,
      buildSpeed, repairSpeed, capMult, satDecayRate, satRecoveryRate,
      churnKeepUnserved, churnKeepLowQos, growthMult,
      monthlySalaryTotal: staff.reduce((s, m) => s + (m.salary || 0), 0),
    };
  }

  // سرعت تجمیعی مؤثر در یک نقطه: بهترین سرعت قابل‌دستیابی بین فناوری‌ها (برای لایهٔ «سرعت اتصال»)
  function aggregateSpeedAt(state, x, y) {
    const r = speedTestAt(state, x, y);
    let m = 0;
    for (const t of TECH_KEYS) if (r[t] && r[t].speed > m) m = r[t].speed;
    return m;
  }

  function speedTestAt(state, x, y) {
    const fx = staffEffects(state);
    const satBonus = constellationBonusPerLink(state);
    const out = {};
    const bAt = buildingAtPoint(state, x, y);
    for (const t of TECH_KEYS) {
      // فیبر دستی است: ساختمان بدون انشعاب فعال سرعت فیبر ندارد؛ با انشعاب، سرعت از گره منبع انشعاب می‌آید
      let fiberSrc = null;
      if (t === 'fiber' && bAt) {
        const st = buildingFiberStatus(state, bAt.id);
        if (st.status !== 'active') {
          out[t] = { speed: 0, nodeId: st.nodeId, nodeName: st.nodeName, reason: 'no_fiber_drop', latency: null };
          continue;
        }
        fiberSrc = nodeById(state, st.nodeId);
      }
      const covering = fiberSrc ? [fiberSrc] : state.nodes.filter((n) =>
        techOfNode(n.type) === t && isUsableNode(n) && dist(x, y, n.x, n.y) <= (n.radius || 0) && inWedge(n, x, y));
      if (!covering.length) { out[t] = { speed: 0, nodeId: null, nodeName: null, reason: 'no_coverage', latency: null }; continue; }
      const connected = covering.filter((n) => n.connected);
      if (!connected.length) {
        const n0 = covering[0];
        out[t] = { speed: 0, nodeId: n0.id, nodeName: n0.name, reason: 'unconnected', latency: null };
        continue;
      }
      let best = null;
      for (const n of connected) {
        const path = bfsPath(state, n.id);
        if (!path) continue;
        let bottleneck = (n.capacity || 0) * nodeWeatherFactor(state, n) * (1 - 0.5 * interferenceFor(state, n, n.channel));
        let congFactor = 1;
        let latencySum = 0;
        for (const id of path) {
          const l = linkById(state, id);
          if (!l) continue;
          latencySum += l.latency || 0;
          const effCap = (l.capacity || 0) * fx.capMult * (l.medium === 'ptp' ? ptpLosFactor(state, nodeById(state, l.from), nodeById(state, l.to)) : 1) + (l.medium === 'satellite' ? satBonus : 0);
          bottleneck = Math.min(bottleneck, effCap);
          if (effCap > 0 && (l.usage || 0) > effCap) congFactor = Math.min(congFactor, effCap / l.usage);
        }
        const d = dist(x, y, n.x, n.y);
        const distFactor = 1 - 0.5 * clamp(d / Math.max(1, n.radius || 1), 0, 1);
        const attFactor = wirelessAttFactor(state, t, n.x, n.y, x, y);
        const speed = Math.round(bottleneck * distFactor * attFactor * congFactor);
        const latency = latencySum + techLatencyBase(t, n);
        if (!best || speed > best.speed) best = { speed, nodeId: n.id, nodeName: n.name, attFactor, congFactor, distFactor, latency };
      }
      if (!best) { out[t] = { speed: 0, nodeId: connected[0].id, nodeName: connected[0].name, reason: 'no_path', latency: null }; continue; }
      let reason = null;
      if (best.congFactor < 0.7) reason = 'congestion';
      else if (best.attFactor <= 0.85) reason = 'los';
      else if (best.distFactor < 0.65) reason = 'distance';
      out[t] = { speed: best.speed, nodeId: best.nodeId, nodeName: best.nodeName, reason, latency: best.latency };
    }
    return out;
  }

  // ---------- سیگنال در یک نقطه (ویژگی ۲۳) ----------
  function signalAt(state, x, y) {
    let best = null;
    for (const n of (state.nodes || [])) {
      if (!isAccessNode(n) || !isUsableNode(n)) continue;
      const radius = n.radius || 0;
      if (radius <= 0) continue;
      const d = dist(x, y, n.x, n.y);
      if (d > radius || !inWedge(n, x, y)) continue;
      const base = 1 - d / radius;
      const attFactor = wirelessAttFactor(state, techOfNode(n.type), n.x, n.y, x, y);
      const signal = base * attFactor * (1 - 0.5 * interferenceFor(state, n, n.channel)) * nodeWeatherFactor(state, n);
      if (!best || signal > best.signal) best = { signal, tech: techOfNode(n.type), nodeId: n.id };
    }
    if (!best) return { signal: 0, tech: null, nodeId: null };
    return { signal: clamp(best.signal, 0, 1), tech: best.tech, nodeId: best.nodeId };
  }

  // ---------- پیشنهاد مکان نصب (ویژگی ۲۴) ----------
  function suggestPlacements(state, eqId) {
    const eq = getEq(eqId);
    if (!eq) return [];
    const radius = eq.radius || 0;
    if (radius <= 0) return [];
    const W = (DATA.world && DATA.world.width) || 7200;
    const H = (DATA.world && DATA.world.height) || 5400;
    // ساختمان‌های پراکندهٔ بدون پوشش فعلی
    const accessNodes = (state.nodes || []).filter((n) => isAccessNode(n) && n.connected && isUsableNode(n));
    const uncovered = (state.buildings || []).filter((b) => !b.districtId).filter((b) => {
      const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
      return !accessNodes.some((n) => dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy));
    });
    const results = [];
    for (let gx = 150; gx < W; gx += 300) {
      for (let gy = 150; gy < H; gy += 300) {
        if (!isValidPlacement(state, gx, gy).ok) continue;
        let score = 0, subCap = 0;
        for (const d of (state.districts || [])) {
          if ((d.qos || 0) >= 0.5 && (d.subscribers || 0) >= Math.floor((d.population || 0) * 0.35)) continue;
          // بازارِ هنوز مشترک‌نشدهٔ منطقه (ترافیک بالقوه اگر همه مشترک شوند)
          const maxSubsD = Math.floor((d.population || 0) * 0.35);
          const unservedSubs = Math.max(0, maxSubsD - (d.subscribers || 0));
          const unserved = unservedSubs * perSubTraffic(state, d, 1);
          const dd = dist(gx, gy, d.x, d.y);
          if (dd < radius + d.radius * 0.6) {
            score += unserved * Math.max(0, 1 - dd / (radius + d.radius));
            subCap += unservedSubs;
          }
        }
        let uncoveredHere = 0;
        const perSubHome = packageSpeed((state.packages || []).find((p) => p.id === 'home')) * CONCURRENCY;
        for (const b of uncovered) {
          const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
          if (dist(gx, gy, cx, cy) <= radius) { score += 6 * perSubHome; uncoveredHere++; }
        }
        if (score <= 0) continue;
        subCap += uncoveredHere * 6;
        const expectedSubs = Math.min(Math.round(score / Math.max(perSubHome, 0.0001) * 0.5), Math.max(0, subCap));
        results.push({ x: gx, y: gy, expectedSubs, expectedCoverage: Math.round(score), cost: eq.cost });
      }
    }
    results.sort((a, b) => b.expectedSubs - a.expectedSubs);
    return results.slice(0, 5);
  }
  const CELL_TECH = { cell_2g: '2g', cell_3g: '3g', cell_4g: '4g', cell_5g: '5g' };

  function log(state, msg, kind) {
    state.log.push({ day: Math.floor(state.day), msg, kind: kind || 'info' });
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  }

  function nodeById(state, id) { return state.nodes.find((n) => n.id === id) || null; }
  function linkById(state, id) { return state.links.find((l) => l.id === id) || null; }
  // نام فارسی رسانهٔ لینک برای پیام‌های کاربر
  function mediumFa(medium) {
    const info = DATA && DATA.linkMedia && DATA.linkMedia[medium];
    return (info && info.name) || 'ارتباطی';
  }

  function isUsableNode(n) { return n && (n.status === 'active' || n.status === 'unconnected'); }
  function isUsableLink(l) { return l && (l.status === 'active' || l.status === 'congested'); }

  // ---------- ساخت بازی جدید ----------
  function newGame(seed) {
    const s = (seed === undefined || seed === null) ? 42 : (seed >>> 0);
    // نقشهٔ تصادفی با بذر؛ در نبود مولد، نقشهٔ ثابت DATA
    const gen = (MapGen && MapGen.generate) ? MapGen.generate(s) : null;
    const genDistricts = gen ? gen.districts : (DATA.districts || []);
    const genBuildings = gen ? gen.buildings : (DATA.buildings || []);
    const genInstallPoints = gen ? gen.installPoints : (DATA.installPoints || []);
    const hq = (gen && gen.hq) || genInstallPoints.find((p) => p.id === 'ip_hq') || { x: 1600, y: 1200 };

    const state = {
      version: 1,
      seed: s,
      rngState: s >>> 0,
      rngState2: (s ^ 0x9e3779b9) >>> 0,
      cash: 30000,
      debt: 0,
      day: 1,
      speed: 1,
      paused: false,
      nodes: [],
      links: [],
      districts: [],
      customers: [],
      staff: [],
      techsUnlocked: [],
      inventory: {},
      packages: JSON.parse(JSON.stringify(DATA.packageList || DATA.packages || [])),
      missions: JSON.parse(JSON.stringify(DATA.missions || [])).map((m) => ({ ...m, done: false, progress: 0 })),
      tutorialStep: 0,
      log: [],
      problems: [],
      settings: { autoFailover: true },
      failoverActive: false,
      counters: { node: 0, link: 0, staff: 0, problem: 0, building: genBuildings.length, individual: 0, contract: 0, campaign: 0, satellite: 0, built: 0, contractsDone: 0, campaignsRun: 0, profitMonths: 0, fiberDrop: 0 },
      // ساعت روز (۰ تا ۲۴) و آب‌وهوای جاری
      hour: 10,
      pendingDays: 0,
      weather: { kind: 'clear', untilDay: 1 },
      // دستاوردها، مشترکان فردی، قراردادهای سازمانی، کمپین‌ها، ماهواره‌های اختصاصی، تاریخچه
      achievements: {},
      newAchievements: [],
      individuals: [],
      contracts: [],
      contractOffers: [],
      campaigns: [],
      satellites: [],
      fiberDrops: [],
      history: [],
      lastMonthDay: 1,
      monthRevenue: 0,
      lastMonthlyProfit: 0,
      totalRevenue: 0,
      totalCosts: 0,
      lastFlow: null,
      // فیلدهای کمکی برای UI
      finance: { incomePerDay: 0, expensePerDay: 0 },
      incomePerDay: 0,
      expensePerDay: 0,
      satisfaction: 0,
      completedMissions: [],
      missionsDone: 0,
      loan: 0,
      isNewGame: true,
      buildings: genBuildings.slice(),
      installPoints: genInstallPoints,
      mapSeed: s,
      map: gen ? { river: gen.river, bridges: gen.bridges, roads: gen.roads, parks: gen.parks } : null,
      // ساختمان‌های پراکندهٔ خارج از مناطق: تقاضا/مشترک تجمیعی (هر جای نقشه به‌جز رودخانه)
      scattered: { subscribers: 0, demand: 0, servedDemand: 0, qos: 0, satisfaction: 0, revenue: 0, potentialSubs: 0, buildingCount: 0, coveredCount: 0 },
    };

    // مناطق runtime
    const growthCfg = DATA.growth || {};
    const capMult = growthCfg.capMultiplier || {};
    state.districts = genDistricts.map((d) => ({
      id: d.id, name: d.name, type: d.type, x: d.x, y: d.y, radius: d.radius, baseRadius: d.radius,
      buildingCap: Math.max(1, Math.round(genBuildings.filter((b) => b.districtId === d.id).length * (capMult[d.type] || 1.5))),
      population: d.population, demandBase: d.demandBase, usageMult: 1,
      priceSensitivity: d.priceSensitivity, potentialRevenue: d.potentialRevenue,
      demand: 0, servedDemand: 0, subscribers: 0,
      qos: 0, potentialQos: 0, satisfaction: 0, revenue: 0, complaints: 0, connected: false,
      avgLatency: 0, perSubMbps: 0, _qosAcc: 0, _qosDays: 0,
    }));
    state.districts.forEach((d) => { d.techDemand = computeTechDemand(d, [], 1); });
    // گروه مشتری هر منطقه
    state.customers = state.districts.map((d) => ({
      id: 'cust_' + d.id, districtId: d.id,
      packageId: (d.type === 'industrial' || d.type === 'heavy_industrial') ? 'enterprise'
        : (['commercial', 'government', 'medical', 'academic'].includes(d.type) ? 'business' : 'home'),
      count: 0, servingNodeId: null,
    }));

    // HQ: روتر هسته + دروازه اینترنت، از ابتدا فعال و متصل
    const coreEq = getEq('core_router');
    const gwEq = getEq('internet_gateway');
    const core = {
      id: 'n' + (++state.counters.node), type: 'core_router', name: coreEq ? coreEq.name : 'روتر هسته',
      x: hq.x, y: hq.y, status: 'active', health: 100,
      capacity: coreEq ? coreEq.capacity : 40000, radius: 0,
      tech: null, direction: 0, angle: 360, power: 1,
      buildTimer: 0, usage: 0, connected: true, channel: null, interference: 0,
    };
    const gw = {
      id: 'n' + (++state.counters.node), type: 'internet_gateway', name: gwEq ? gwEq.name : 'دروازه اینترنت',
      x: hq.x + 140, y: hq.y, status: 'active', health: 100,
      capacity: gwEq ? gwEq.capacity : 40000, radius: 0,
      tech: null, direction: 0, angle: 360, power: 1,
      buildTimer: 0, usage: 0, connected: true, channel: null, interference: 0,
    };
    state.nodes.push(core, gw);

    // شروع بدون هیچ کارمندی: نرخ‌های پایهٔ صفرکارمند برای شبکهٔ کوچک قابل بازی‌اند؛
    // استخدام با بزرگ‌شدن شبکه لازم می‌شود (به‌خواست کاربر، ۲۰۲۶-۱۱-۲۲)
    state.links.push({
      id: 'l' + (++state.counters.link), from: core.id, to: gw.id,
      medium: 'fiber', capacity: 10000, latency: 2,
      status: 'active', isBackup: false, usage: 0,
    });

    log(state, 'شرکت مخابراتی شما تأسیس شد. هسته و دروازه اینترنت در مرکز داده فعال‌اند.', 'info');
    return state;
  }

  // ---------- آزاد بودن تجهیزات ----------
  function isUnlocked(state, eqId) {
    const eq = getEq(eqId);
    if (!eq) return false;
    if (!eq.unlock) return true;
    return (state.techsUnlocked || []).includes(eq.unlock);
  }

  // ---------- ساخت گره ----------
  function buildNode(state, eqId, x, y, opts) {
    opts = opts || {};
    const eq = getEq(eqId);
    if (!eq) { log(state, 'تجهیز ناشناخته است.', 'error'); return null; }
    if (!isUnlocked(state, eqId)) {
      log(state, 'فناوری لازم برای «' + eq.name + '» هنوز باز نشده است.', 'error');
      return null;
    }
    if (state.cash < eq.cost) {
      log(state, 'بودجه کافی برای «' + eq.name + '» نیست.', 'error');
      return null;
    }
    state.cash -= eq.cost;
    state.totalCosts += eq.cost;
    state.counters.built = (state.counters.built || 0) + 1;
    const node = {
      id: 'n' + (++state.counters.node),
      type: eqId,
      name: eq.name,
      x: x, y: y,
      status: 'building',
      health: 100,
      capacity: eq.capacity || 0,
      radius: eq.radius || 0,
      level: 1,
      baseCapacity: eq.capacity || 0,
      baseRadius: eq.radius || 0,
      tech: CELL_TECH[eqId] || null,
      direction: opts.direction !== undefined ? opts.direction : 0,
      angle: (DATA.beamwidthByEq && DATA.beamwidthByEq[eqId]) || (opts.angle !== undefined ? opts.angle : 360),
      power: opts.power !== undefined ? opts.power : 1,
      buildTimer: eq.buildDays || 1,
      usage: 0,
      connected: false,
      installPointId: opts.installPointId || null,
      channel: null,
      interference: 0,
    };
    // کانال فرکانسی: برای فناوری‌های بی‌سیم، کم‌تداخل‌ترین کانال انتخاب می‌شود
    if (channelCountFor(node) > 0) node.channel = leastInterferedChannel(state, node);
    state.nodes.push(node);
    log(state, 'ساخت «' + eq.name + '» آغاز شد (' + (Math.round(node.buildTimer * 100) / 100) + ' روز).', 'build');
    return node;
  }

  // ---------- اتصال دو گره با لینک ----------
  function connect(state, fromId, toId, medium, opts) {
    opts = opts || {};
    const a = nodeById(state, fromId);
    const b = nodeById(state, toId);
    if (!a || !b) { log(state, 'اتصال ناموفق: گره مبدأ یا مقصد وجود ندارد.', 'error'); return null; }
    if (fromId === toId) { log(state, 'اتصال گره به خودش ممکن نیست.', 'error'); return null; }
    medium = medium || 'fiber';
    const mediaInfo = (DATA.linkMedia && DATA.linkMedia[medium]) || { capacity: 1000, latency: 5 };

    if (medium === 'satellite') {
      const isTerm = (n) => n.type === 'sat_terminal_leo' || n.type === 'sat_terminal_geo';
      const isGw = (n) => n.type === 'sat_gateway';
      const ok = (isTerm(a) && isGw(b)) || (isTerm(b) && isGw(a));
      if (!ok) {
        log(state, 'لینک ماهواره‌ای فقط بین پایانه ماهواره‌ای و دروازه زمینی ممکن است.', 'error');
        return null;
      }
    }

    if (medium === 'ptp') {
      const maxRange = mediaInfo.maxRange || 1800;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > maxRange) {
        log(state, 'لینک نقطه‌به‌نقطه از حداکثر برد بیشتر است؛ فاصلهٔ دو گره ' + Math.round(d) + ' واحد و حداکثر برد ' + maxRange + ' واحد است. یک گره واسط نزدیک‌تر انتخاب کن یا از فیبر استفاده کن.', 'error');
        return null;
      }
    }

    // لینک تکراری (همان دو گره + همان رسانه) مجاز نیست
    const dup = (state.links || []).some((l) => l.medium === medium &&
      ((l.from === fromId && l.to === toId) || (l.from === toId && l.to === fromId)));
    if (dup) {
      log(state, 'این دو گره قبلاً با همین رسانه به هم وصل شده‌اند.', 'error');
      return null;
    }

    const link = {
      id: 'l' + (++state.counters.link),
      from: fromId, to: toId, medium,
      capacity: opts.capacity !== undefined ? opts.capacity : mediaInfo.capacity,
      latency: opts.latency !== undefined ? opts.latency : mediaInfo.latency,
      status: 'active',
      isBackup: !!opts.isBackup,
      usage: 0,
    };
    state.links.push(link);
    log(state, 'لینک ' + mediumFa(medium) + ' بین «' + (a.name || 'گره') + '» و «' + (b.name || 'گره') + '» برقرار شد.', 'build');
    refreshConnectivity(state); // وضعیت اتصال به هسته فوراً تازه شود، نه در تیک روزانهٔ بعدی
    return link;
  }

  // ---------- قطع اتصال لینک ----------
  function linksOfNode(state, nodeId) {
    return (state.links || []).filter((l) => l.from === nodeId || l.to === nodeId);
  }
  function connectedSetExcluding(state, excludeLinkId) {
    const set = new Set();
    const gateways = state.nodes.filter((n) => n.type === 'internet_gateway' && isUsableNode(n));
    const q = gateways.map((g) => g.id);
    q.forEach((id) => set.add(id));
    while (q.length) {
      const cur = q.shift();
      for (const l of state.links) {
        if (l.id === excludeLinkId) continue;
        if (!isUsableLink(l)) continue;
        if (l.isBackup && !state.failoverActive) continue;
        let nxt = null;
        if (l.from === cur) nxt = l.to; else if (l.to === cur) nxt = l.from; else continue;
        if (set.has(nxt)) continue;
        const nn = nodeById(state, nxt);
        if (!nn || !isUsableNode(nn)) continue;
        set.add(nxt); q.push(nxt);
      }
    }
    return set;
  }
  function linkDisconnectImpact(state, linkId) {
    const before = connectedSetExcluding(state, null);
    const after = connectedSetExcluding(state, linkId);
    const orphans = [...before].filter((id) => !after.has(id))
      .map((id) => nodeById(state, id)).filter(Boolean);
    return { orphanCount: orphans.length, orphanNames: orphans.slice(0, 3).map((n) => n.name || n.type) };
  }
  function disconnectLink(state, linkId) {
    const l = linkById(state, linkId);
    if (!l) return { ok: false, error: 'لینک پیدا نشد.' };
    const a = nodeById(state, l.from), b = nodeById(state, l.to);
    state.links = state.links.filter((x) => x.id !== linkId);
    log(state, 'اتصال ' + mediumFa(l.medium) + ' بین «' + ((a && a.name) || 'گره') + '» و «' + ((b && b.name) || 'گره') + '» قطع شد.', 'build');
    refreshConnectivity(state); // وضعیت اتصال گره‌های پایین‌دست فوراً تازه شود
    return { ok: true };
  }

  // ---------- ردیابی مسیر تا دروازه اینترنت (BFS) ----------
  function bfsPath(state, startId, opts) {
    opts = opts || {};
    const excludeCut = opts.excludeCut !== false;
    const start = nodeById(state, startId);
    if (!start) return null;
    if (start.type === 'internet_gateway') return [start.id];
    const visited = new Map(); // nodeId -> {prevNode, linkId}
    const queue = [start.id];
    visited.set(start.id, null);
    while (queue.length) {
      const cur = queue.shift();
      const curNode = nodeById(state, cur);
      if (curNode && curNode.type === 'internet_gateway') {
        // بازسازی مسیر: [node, link, node, link, ...]
        const path = [];
        let c = cur;
        while (c) {
          path.unshift(c);
          const info = visited.get(c);
          if (info) { path.unshift(info.linkId); c = info.prev; } else break;
        }
        return path;
      }
      for (const l of state.links) {
        if (excludeCut && !isUsableLink(l)) continue;
        // لینک پشتیبان فقط وقتی فیل‌اور فعال است (یا جست‌وجوی مسیر جایگزین) ترافیک می‌گیرد
        if (l.isBackup && !state.failoverActive && !opts.allowBackup) continue;
        let nxt = null;
        if (l.from === cur) nxt = l.to;
        else if (l.to === cur) nxt = l.from;
        else continue;
        if (visited.has(nxt)) continue;
        const nn = nodeById(state, nxt);
        if (!nn || nn.status === 'failed' || nn.status === 'building') continue;
        visited.set(nxt, { prev: cur, linkId: l.id });
        queue.push(nxt);
      }
    }
    return null;
  }

  function servingNodeForDistrict(state, district) {
    let best = null, bestScore = -1;
    for (const n of state.nodes) {
      if (!isAccessNode(n)) continue;
      if (!isUsableNode(n)) continue;
      if (!inWedge(n, district.x, district.y)) continue;
      const d = dist(district.x, district.y, n.x, n.y);
      const reach = (n.radius || 0) + district.radius * 0.6;
      if (d > reach) continue;
      // ساختمان‌های بلند بین گره و مرکز منطقه دید FWA/وای‌فای را می‌بندند (سلولار از ساختمان اثر نمی‌گیرد)
      let blocked = false;
      if (n.type !== 'ftth' && techOfNode(n.type) !== 'cellular') {
        for (const b of (state.buildings || DATA.buildings || [])) {
          if (b.height < 10) continue;
          // فاصله ساختمان از پاره‌خط گره تا مرکز منطقه
          const t = clamp(((b.x - n.x) * (district.x - n.x) + (b.y - n.y) * (district.y - n.y)) /
            (Math.pow(district.x - n.x, 2) + Math.pow(district.y - n.y, 2) || 1), 0, 1);
          const px = n.x + t * (district.x - n.x), py = n.y + t * (district.y - n.y);
          if (dist(b.x, b.y, px, py) < 45) { blocked = true; break; }
        }
      }
      const score = (n.capacity || 0) * (blocked ? 0.35 : 1) / (1 + d / 400);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best;
  }

  function tracePath(state, customerIdOrNodeId) {
    // گره مستقیم؟
    if (nodeById(state, customerIdOrNodeId)) return bfsPath(state, customerIdOrNodeId);
    // مشتری؟
    const cust = (state.customers || []).find((c) => c.id === customerIdOrNodeId);
    if (cust) {
      const district = state.districts.find((d) => d.id === cust.districtId);
      const srv = cust.servingNodeId ? nodeById(state, cust.servingNodeId)
        : (district ? servingNodeForDistrict(state, district) : null);
      if (!srv) return null;
      return bfsPath(state, srv.id);
    }
    // شناسه منطقه؟
    const district = state.districts.find((d) => d.id === customerIdOrNodeId);
    if (district) {
      const srv = servingNodeForDistrict(state, district);
      if (!srv) return null;
      return bfsPath(state, srv.id);
    }
    return null;
  }

  function traceSatellitePath(state, terminalId) {
    const term = nodeById(state, terminalId);
    if (!term || (term.type !== 'sat_terminal_leo' && term.type !== 'sat_terminal_geo')) return null;
    // لینک ماهواره‌ای به دروازه زمینی
    let gwNode = null, satLink = null;
    for (const l of state.links) {
      if (l.medium !== 'satellite' || !isUsableLink(l)) continue;
      let other = null;
      if (l.from === terminalId) other = l.to;
      else if (l.to === terminalId) other = l.from;
      else continue;
      const on = nodeById(state, other);
      if (on && on.type === 'sat_gateway') { gwNode = on; satLink = l; break; }
    }
    if (!gwNode) return null;
    const rest = bfsPath(state, gwNode.id);
    if (!rest) return null;
    return [term.id, satLink.id, 'satellite_network', ...rest];
  }

  // ---------- محاسبه جریان ترافیک ----------
  function computeFlow(state, opts) {
    // noDailyEffects: فقط وضعیت اتصال و جریان لحظه‌ای تازه می‌شود؛ رشد/ریزش مشترک و رضایت (اثرات روزانه) دست نمی‌خورد
    const noDaily = !!(opts && opts.noDailyEffects);
    // صفر کردن مصرف‌ها
    state.links.forEach((l) => { l.usage = 0; if (l.status === 'congested') l.status = 'active'; });
    state.nodes.forEach((n) => { n.usage = 0; });

    // گره‌های متصل به دروازه اینترنت (BFS از همه دروازه‌ها)
    const connectedSet = new Set();
    const gateways = state.nodes.filter((n) => n.type === 'internet_gateway' && isUsableNode(n));
    const q = gateways.map((g) => g.id);
    q.forEach((id) => connectedSet.add(id));
    while (q.length) {
      const cur = q.shift();
      for (const l of state.links) {
        if (!isUsableLink(l)) continue;
        if (l.isBackup && !state.failoverActive) continue;
        let nxt = null;
        if (l.from === cur) nxt = l.to; else if (l.to === cur) nxt = l.from; else continue;
        if (connectedSet.has(nxt)) continue;
        const nn = nodeById(state, nxt);
        if (!nn || !isUsableNode(nn)) continue;
        connectedSet.add(nxt); q.push(nxt);
      }
    }
    state.nodes.forEach((n) => {
      n.connected = connectedSet.has(n.id);
      if (n.status === 'active' && !n.connected) n.status = 'unconnected';
      else if (n.status === 'unconnected' && n.connected) n.status = 'active';
    });

    const fx = staffEffects(state);

    // تداخل کانال و ظرفیت مؤثر هر گره دسترسی (تداخل × آب‌وهوا)
    for (const n of state.nodes) {
      if (isAccessNode(n) && isUsableNode(n)) {
        n.interference = interferenceFor(state, n, n.channel);
        n._effCap = (n.capacity || 0) * nodeWeatherFactor(state, n) * (1 - 0.5 * n.interference);
      } else {
        n._effCap = n.capacity || 0;
      }
    }
    const satBonus = constellationBonusPerLink(state);
    // ضریب تقاضای فصل و ساعت روز (در ساعت ۱۰ و بهار = ۱٫۰)
    // در محاسبهٔ روزانه (tick) میانگین ۲۴ساعته به‌کار می‌رود تا اقتصاد به ساعت لحظهٔ tick حساس نباشد
    const hourFactor = (opts && opts.dailyAvg) ? dailyAvgDemandFactor() : demandFactorAtHour(state.hour);
    const demandTimeFactor = ((seasonOf(state).demandFactor) || 1) * hourFactor;

    // ترتیب اولویت هنگام failover: اضطراری (بیمارستان) و سازمانی/صنعتی اول
    const priority = (d) => (d.id === 'hospital' || d.type === 'medical' ? 0
      : (['industrial', 'heavy_industrial', 'commercial', 'government'].includes(d.type) ? 1 : 2));
    const ordered = state.districts.slice().sort((a, b) => priority(a) - priority(b));

    let totalRevenue = 0, qosSum = 0, servedDistricts = 0;
    let joinsToday = 0, leavesToday = 0;

    for (const d of ordered) {
      // تقاضا فقط از مشترکان می‌آید: مشترک × سرعت بسته × ضریب هم‌زمانی × ضریب زمانی
      // (بدون مشترک، تقاضا و ترافیک صفر است؛ جمعیت فقط بازار قابل‌دسترس است)
      const pkg = districtPackage(state, d);
      const perSub = perSubTraffic(state, d, demandTimeFactor);
      d.demand = d.subscribers * perSub;
      // گره‌های دسترسی متصلِ پوشش‌دهنده (مرکز منطقه باید داخل گوهٔ آنتن باشد)
      const servers = state.nodes.filter((n) =>
        isAccessNode(n) && n.connected && isUsableNode(n) &&
        dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + d.radius * 0.6 && inWedge(n, d.x, d.y));
      const cust = (state.customers || []).find((c) => c.districtId === d.id);
      if (!servers.length) {
        d.servedDemand = 0; d.qos = 0; d.potentialQos = 0; d.connected = false;
        d.avgLatency = 0; d.perSubMbps = 0;
        if (!noDaily && d.subscribers > 0) { d._qosAcc = (d._qosAcc || 0) + d.qos; d._qosDays = (d._qosDays || 0) + 1; }
        d.techDemand = computeTechDemand(d, [], 1, 0);
        if (cust) cust.servingNodeId = null;
        if (!noDaily) {
          const subsBeforeChurn = d.subscribers;
          d.subscribers = Math.max(0, Math.floor(d.subscribers * fx.churnKeepUnserved));
          leavesToday += subsBeforeChurn - d.subscribers;
          // بدون سرویس رضایت منطقه به سمت صفر می‌رود (جمعیت بدون اینترنت ناراضی است)؛ پشتیبانی افت را کند می‌کند
          d.satisfaction = clamp(d.satisfaction + (0 - d.satisfaction) * fx.satDecayRate, 0, 100);
        }
        d.revenue = 0;
        continue;
      }
      d.everServed = true;
      if (cust) cust.servingNodeId = servers[0].id;
      // ظرفیت رزروشدهٔ قراردادهای سازمانی فعال از ظرفیت دسترسی کم می‌شود
      const reserved = (state.contracts || [])
        .filter((c) => c.status === 'active' && c.districtId === d.id)
        .reduce((s, c) => s + (c.speed || 0), 0);
      // فیبر دستی: ظرفیت گره‌های فیبر فقط به نسبت ساختمان‌های منطقه که انشعاب فعال دارند حساب می‌شود
      const fiberRatio = districtFiberRatio(state, d);
      const capOf = (n) => {
        const c = n._effCap != null ? n._effCap : n.capacity || 0;
        return techOfNode(n.type) === 'fiber' ? c * fiberRatio : c;
      };
      const accessCap = Math.max(0, servers.reduce((s, n) => s + capOf(n), 0) - reserved);
      let served = Math.min(d.demand, accessCap);

      // انتشار روی مسیرها و محاسبه ازدحام
      let remaining = served;
      for (const srv of servers) {
        if (remaining <= 0) break;
        const share = Math.min(remaining, capOf(srv));
        const path = bfsPath(state, srv.id);
        if (!path) continue;
        srv.usage += share;
        for (const id of path) {
          const l = linkById(state, id);
          if (l) l.usage += share;
        }
        remaining -= share;
      }
      // گلوگاه لینک‌ها: اگر مصرف > ظرفیت مؤثر (با ضریب مهندسان شبکه و پاداش صورت فلکی)، کیفیت افت می‌کند
      let congestionFactor = 1;
      for (const l of state.links) {
        const effCap = l.capacity * fx.capMult * (l.medium === 'ptp' ? ptpLosFactor(state, nodeById(state, l.from), nodeById(state, l.to)) : 1) + (l.medium === 'satellite' ? satBonus : 0);
        if (l.usage > effCap && effCap > 0) {
          l.status = 'congested';
          congestionFactor = Math.min(congestionFactor, effCap / l.usage);
        }
      }
      if (state.failoverActive && priority(d) === 2) congestionFactor *= 0.6; // throttling عادی‌ها
      served = served * congestionFactor;

      d.servedDemand = Math.round(served);
      d.techDemand = computeTechDemand(d, servers, congestionFactor, fiberRatio);
      // کیفیت تجربه‌شدهٔ مشترکان فعلی (بدون مشترک = ۰؛ سرویسی در کار نیست)
      d.qos = d.demand > 0 ? clamp(served / d.demand, 0, 1) : 0;
      // کیفیت بالقوه برای مشترکِ بعدی (مبنای رشد): ظرفیت آزاد نسبت به ترافیک یک مشترک تازه
      d.potentialQos = clamp((accessCap * congestionFactor) / Math.max(d.demand, perSub, 0.0001), 0, 1);
      d.connected = true; // زیرساخت متصلِ پوشش‌دهنده وجود دارد (مشترک داشتن جدا سنجیده می‌شود)
      // میانگین کیفیت ماه فقط از روزهای دارای مشترک حساب می‌شود (بدون مشترک، کیفیتی تجربه نشده است)
      if (!noDaily && d.subscribers > 0) { d._qosAcc = (d._qosAcc || 0) + d.qos; d._qosDays = (d._qosDays || 0) + 1; }
      qosSum += d.qos; servedDistricts++;

      // مشترکان: رشد بر اساس کیفیت بالقوه (سرویسی که مشترک تازه می‌گیرد)، ریزش فقط با کیفیت تجربه‌شدهٔ خیلی بد
      const maxSubs = Math.floor(d.population * 0.35);
      const subsBefore = d.subscribers;
      if (!noDaily) {
        if (d.potentialQos >= 0.12) d.subscribers = Math.min(maxSubs, d.subscribers + Math.max(1, Math.ceil(d.population * 0.004 * d.potentialQos * fx.growthMult * campaignMultFor(state, d.id))));
        else if (d.qos < 0.05) d.subscribers = Math.max(0, Math.floor(d.subscribers * fx.churnKeepLowQos));
        // نسبت‌دادن تقریبی مشترکان جدید به کمپین‌های فعالِ هدف‌گرفتهٔ این منطقه
        const gained = d.subscribers - subsBefore;
        if (gained > 0) {
          joinsToday += gained;
          for (const c of (state.campaigns || [])) {
            if (c.active && (c.districtIds || []).includes(d.id)) c.newSubs = (c.newSubs || 0) + gained;
          }
        } else if (gained < 0) leavesToday += -gained;
      }
      if (cust) cust.count = d.subscribers;

      // بستهٔ منطقه: قیمت برای درآمد، سرعت برای رضایت (نسبت به انتظار نوع منطقه)
      const pkgSpeed = packageSpeed(pkg);
      const expectedSpeed = (d.type === 'industrial' || d.type === 'heavy_industrial') ? 1000
        : (['commercial', 'government', 'medical', 'academic'].includes(d.type) ? 200 : 50);
      const speedFactor = clamp(pkgSpeed / expectedSpeed, 0.5, 1.1);

      // تأخیر و سرعت سرانه برای بسته‌های گیمینگ/استریمینگ (ویژگی ۱۶)
      const firstSrv = servers[0];
      d.avgLatency = Math.round(pathLatency(state, firstSrv.id) + techLatencyBase(techOfNode(firstSrv.type), firstSrv));
      d.perSubMbps = d.subscribers > 0 ? Math.round((served / d.subscribers) * 10) / 10 : pkgSpeed;
      let kindFactor = 1;
      if (pkg && pkg.kind === 'gaming') kindFactor = clamp(80 / Math.max(1, d.avgLatency), 0.3, 1.1);
      else if (pkg && pkg.kind === 'streaming') kindFactor = clamp(d.perSubMbps / (pkgSpeed * 0.5), 0.4, 1.1);

      // رضایت به سمت کیفیت حرکت می‌کند؛ پشتیبانی بازگشت را سریع‌تر و افت را کندتر می‌کند
      // رضایت = کیفیت تجربه‌شدهٔ مشترکان × نفوذ اشتراک (مشترک/سقف مشترک): منطقهٔ بی‌مشترک
      // رضایت صفر دارد و شبکهٔ چندمشترکی هرگز «۱۰۰٪» خوانده نمی‌شود؛ غیرمشترکانِ تحت پوشش
      // خنثی‌اند (شکایت/ریزش ندارند) ولی شاخص رضایت فقط سهمِ خوش‌سرویس بازار را نشان می‌دهد.
      const penetration = maxSubs > 0 ? d.subscribers / maxSubs : 0;
      const target = clamp(d.qos * 100 * speedFactor * kindFactor * penetration, 0, 100);
      const satRate = target >= d.satisfaction ? fx.satRecoveryRate : fx.satDecayRate;
      if (!noDaily) d.satisfaction = clamp(d.satisfaction + (target - d.satisfaction) * satRate, 0, 100);
      d.complaints = d.qos < 0.4 && d.subscribers > 0 ? Math.ceil(d.subscribers * 0.05) : 0;

      // درآمد ماهانه: مشترک × قیمت بسته × ضریب رضایت
      const price = pkg ? pkg.price : 120;
      d.revenue = Math.round(d.subscribers * price * (0.4 + 0.6 * (d.satisfaction / 100)));
      totalRevenue += d.revenue;
    }

    // ---------- ساختمان‌های پراکندهٔ خارج از مناطق ----------
    // هر جای نقشه به‌جز رودخانه (ساختمان‌ها هرگز در رودخانه ساخته نمی‌شوند) می‌تواند مشترک بگیرد:
    // ساختمانِ زیر پوشش یک گره دسترسیِ متصل، با همان قواعد ظرفیت/کیفیت مناطق.
    if (!state.scattered) state.scattered = { subscribers: 0, demand: 0, servedDemand: 0, qos: 0, satisfaction: 0, revenue: 0, potentialSubs: 0, buildingCount: 0, coveredCount: 0 };
    const sc = state.scattered;
    const outsideBuildings = (state.buildings || []).filter((b) => !b.districtId);
    sc.buildingCount = outsideBuildings.length;
    sc.potentialSubs = outsideBuildings.length * 6; // میانگین خانوار هر ساختمان پراکنده
    // ترافیک پراکنده‌ها هم فقط از مشترکان می‌آید (بستهٔ خانگی × ضریب هم‌زمانی)
    const homePkg0 = (state.packages || []).find((p) => p.id === 'home');
    const scPerSub = packageSpeed(homePkg0) * CONCURRENCY * demandTimeFactor;
    sc.demand = Math.round(sc.subscribers * scPerSub);
    const accessNodes = state.nodes.filter((n) => isAccessNode(n) && n.connected && isUsableNode(n));
    let coveredCount = 0;
    const coveringCaps = new Map();
    const activeDrops = activeFiberDropSet(state);
    for (const b of outsideBuildings) {
      const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
      for (const n of accessNodes) {
        if (dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy)) {
          // فیبر دستی است: ساختمان پراکنده بدون انشعاب فعال از گره فیبر سرویس نمی‌گیرد
          if (techOfNode(n.type) === 'fiber' && !activeDrops.has(b.id)) continue;
          coveredCount++; coveringCaps.set(n.id, n._effCap != null ? n._effCap : n.capacity || 0); break;
        }
      }
    }
    sc.coveredCount = coveredCount;
    const capSum = Array.from(coveringCaps.values()).reduce((a, b) => a + b, 0);
    sc.servedDemand = Math.round(Math.min(sc.demand, capSum));
    // کیفیت تجربه‌شدهٔ مشترکان پراکنده (بدون مشترک = ۰)
    sc.qos = sc.demand > 0 ? clamp(sc.servedDemand / sc.demand, 0, 1) : 0;
    // کیفیت بالقوه برای مشترک تازهٔ پراکنده (مبنای رشد؛ فقط ساختمان‌های تحت پوشش مشترک می‌گیرند)
    sc.potentialQos = coveredCount > 0 ? clamp(capSum / Math.max(sc.demand, scPerSub, 0.0001), 0, 1) : 0;
    const potentialCovered = coveredCount * 6;
    if (!noDaily) {
      const scBefore = sc.subscribers;
      if (sc.potentialQos >= 0.12) sc.subscribers = Math.min(potentialCovered, sc.subscribers + Math.max(1, Math.ceil(potentialCovered * 0.01 * sc.potentialQos * fx.growthMult)));
      else if (sc.qos < 0.05) sc.subscribers = Math.max(0, Math.floor(sc.subscribers * fx.churnKeepLowQos));
      const scGained = sc.subscribers - scBefore;
      if (scGained > 0) joinsToday += scGained; else if (scGained < 0) leavesToday += -scGained;
    }
    // رضایت پراکنده‌ها: کیفیت تجربه‌شده × نفوذ اشتراک در کل ساختمان‌های پراکنده
    const scTarget = sc.qos * 100 * (sc.potentialSubs > 0 ? sc.subscribers / sc.potentialSubs : 0);
    const scRate = scTarget >= sc.satisfaction ? fx.satRecoveryRate : fx.satDecayRate;
    if (!noDaily) sc.satisfaction = clamp(sc.satisfaction + (scTarget - sc.satisfaction) * scRate, 0, 100);
    const homePkg = (state.packages || []).find((p) => p.id === 'home');
    sc.revenue = Math.round(sc.subscribers * (homePkg ? homePkg.price : 120) * (0.4 + 0.6 * (sc.satisfaction / 100)));
    totalRevenue += sc.revenue;

    const summary = {
      monthlyRevenue: totalRevenue,
      avgQoS: state.districts.length ? qosSum / state.districts.length : 0,
      servedDistricts,
      totalSubscribers: state.districts.reduce((s, d) => s + d.subscribers, 0) + sc.subscribers,
      joins: joinsToday,
      leaves: leavesToday,
      congestedLinks: state.links.filter((l) => l.status === 'congested').length,
    };
    state.lastFlow = summary;
    // فیلدهای کمکی UI: رضایت کلی (میانگین وزن‌دار با جمعیت؛ مناطق بدون سرویس ~۰؛ پراکنده‌ها با وزن جمعیت تقریبی)
    const scatteredPop = sc.potentialSubs * 3;
    const totalPop = state.districts.reduce((s, d) => s + (d.population || 0), 0) + scatteredPop;
    state.satisfaction = totalPop > 0
      ? Math.round((state.districts.reduce((s, d) => s + d.satisfaction * (d.population || 0), 0) + sc.satisfaction * scatteredPop) / totalPop) : 0;
    let monthlyCosts = 0;
    const hasConstellation = constellationCapacity(state) > 0;
    for (const n of state.nodes) {
      const eq = getEq(n.type);
      if (!eq || n.status === 'building') continue;
      // با صورت فلکی اختصاصی، اشتراک پایانه‌های ماهواره‌ای ارزان‌تر می‌شود (۳۰٪)
      const isSatTerm = n.type === 'sat_terminal_leo' || n.type === 'sat_terminal_geo';
      monthlyCosts += (eq.monthlyCost || 0) * (isSatTerm && hasConstellation ? 0.3 : 1);
    }
    for (const s of (state.satellites || [])) if (s.status === 'active') monthlyCosts += s.monthlyCost || 0;
    for (const st of state.staff) monthlyCosts += st.salary || 0;
    state.incomePerDay = Math.round(totalRevenue / 30);
    state.expensePerDay = Math.round(monthlyCosts / 30);
    state.finance = { incomePerDay: state.incomePerDay, expensePerDay: state.expensePerDay, monthlyRevenue: totalRevenue, monthlyCosts };
    return summary;
  }

  // تازه‌سازی فوری وضعیت اتصال و جریان بعد از هر تغییر توپولوژی (اتصال/حذف/جابه‌جایی/ارتقا):
  // بدون اثرات روزانه (رشد/ریزش مشترک و رضایت) تا کلیک‌های بازیکن اقتصاد روزانه را جلو نیندازد.
  function refreshConnectivity(state) {
    computeFlow(state, { dailyAvg: true, noDailyEffects: true });
    state.problems = buildProblems(state);
    return state.lastFlow;
  }

  // ---------- انشعاب فیبر دستی ساختمان‌ها ----------
  // ساختمان فقط با انشعاب دستی به منبع فیبر (FTTH/تجمیع/هستهٔ متصل) از فیبر سرویس می‌گیرد؛
  // فناوری‌های بی‌سیم همچنان پوشش‌محور و خودکارند.
  function fiberDropFor(state, buildingId) {
    return (state.fiberDrops || []).find((x) => x.buildingId === buildingId) || null;
  }
  function activeFiberDropSet(state) {
    return new Set((state.fiberDrops || []).filter((x) => x.status === 'active').map((x) => x.buildingId));
  }
  function districtFiberRatio(state, d) {
    const bs = (state.buildings || []).filter((b) => b.districtId === d.id);
    if (!bs.length) return 1;
    const active = activeFiberDropSet(state);
    return bs.filter((b) => active.has(b.id)).length / bs.length;
  }
  function buildingFiberStatus(state, buildingId) {
    const fd = fiberDropFor(state, buildingId);
    if (!fd) return { status: 'none', nodeId: null, nodeName: null };
    const n = nodeById(state, fd.nodeId);
    return { status: fd.status, nodeId: fd.nodeId, nodeName: n ? n.name : null };
  }
  function fiberSourceNodes(state) {
    return (state.nodes || []).filter((n) =>
      (n.type === 'ftth' || n.type === 'aggregation' || n.type === 'core_router') && n.connected && isUsableNode(n));
  }
  function connectBuildingFiber(state, buildingId, nodeId) {
    const b = (state.buildings || []).find((x) => x.id === buildingId);
    if (!b) return { ok: false, error: 'ساختمان پیدا نشد.' };
    if (fiberDropFor(state, buildingId)) return { ok: false, error: 'این ساختمان قبلاً به فیبر وصل شده است.' };
    const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
    let src = nodeId ? nodeById(state, nodeId) : null;
    if (nodeId && !(src && src.connected && isUsableNode(src) && ['ftth', 'aggregation', 'core_router'].includes(src.type))) {
      return { ok: false, error: 'این گره منبع فیبر معتبر نیست؛ یک گره FTTH/تجمیع/هستهٔ متصل به شبکه انتخاب کنید.' };
    }
    if (!src) {
      let bd = Infinity;
      for (const n of fiberSourceNodes(state)) {
        const dd = dist(cx, cy, n.x, n.y);
        if (dd < bd) { bd = dd; src = n; }
      }
    }
    if (!src) return { ok: false, error: 'منبع فیبر متصل (FTTH/تجمیع/هسته) در دسترس نیست؛ اول یک گره فیبر بسازید و به شبکه وصل کنید.' };
    const dd = dist(cx, cy, src.x, src.y);
    const cost = 600 + Math.round(dd * 1.2);
    const workDays = 1 + Math.floor(dd / 400);
    if (state.cash < cost) return { ok: false, error: 'بودجه کافی برای اتصال فیبر نیست. هزینه: ' + cost };
    state.cash -= cost;
    state.totalCosts = (state.totalCosts || 0) + cost;
    if (!Array.isArray(state.fiberDrops)) state.fiberDrops = [];
    if (state.counters.fiberDrop == null) state.counters.fiberDrop = 0;
    const drop = { id: 'fd' + (++state.counters.fiberDrop), buildingId, nodeId: src.id, status: 'building', work: workDays };
    state.fiberDrops.push(drop);
    log(state, 'اتصال فیبر ساختمان به «' + (src.name || 'منبع فیبر') + '» شروع شد (' + workDays + ' روز).', 'build');
    refreshConnectivity(state);
    return { ok: true, cost, days: workDays, nodeId: src.id, nodeName: src.name };
  }
  function disconnectBuildingFiber(state, buildingId) {
    const before = (state.fiberDrops || []).length;
    state.fiberDrops = (state.fiberDrops || []).filter((x) => x.buildingId !== buildingId);
    if (state.fiberDrops.length === before) return { ok: false, error: 'این ساختمان انشعاب فیبر ندارد.' };
    log(state, 'انشعاب فیبر ساختمان قطع شد.', 'build');
    refreshConnectivity(state);
    return { ok: true };
  }
  function buildingAtPoint(state, x, y) {
    return (state.buildings || []).find((b) => x >= b.x && x <= b.x + (b.w || 26) && y >= b.y && y <= b.y + (b.h || 20)) || null;
  }

  // ---------- failover ----------
  function failover(state) {
    if (!state.settings || !state.settings.autoFailover) return false;
    const cutLinks = state.links.filter((l) => l.status === 'cut');
    if (!cutLinks.length) { state.failoverActive = false; return false; }
    let rerouted = false;
    for (const cut of cutLinks) {
      // لینک پشتیبان سالم که یکی از دو سرِ لینک قطع را پوشش دهد یا مسیر جایگزین بسازد
      const backup = state.links.find((l) => l.isBackup && isUsableLink(l) &&
        (l.from === cut.from || l.to === cut.from || l.from === cut.to || l.to === cut.to));
      const altPath = bfsPath(state, cut.from, { allowBackup: true }) || bfsPath(state, cut.to, { allowBackup: true });
      if (backup || altPath) {
        if (backup) backup.status = 'active';
        rerouted = true;
        log(state, 'یک لینک ' + mediumFa(cut.medium) + ' قطع است؛ ترافیک از مسیر پشتیبان عبور می‌کند (اولویت با سازمانی و اضطراری).', 'warn');
      }
    }
    state.failoverActive = rerouted;
    if (rerouted) computeFlow(state);
    return rerouted;
  }

  // ---------- تولید مشکلات (علت + گزینه رفع برای UI) ----------
  const PROBLEM_TITLES = {
    no_coverage: 'نبود پوشش',
    unconnected: 'گره متصل‌نشده',
    congestion: 'کمبود ظرفیت',
    failed_node: 'خرابی گره',
    link_cut: 'قطع لینک',
  };
  function buildProblems(state) {
    const problems = [];
    const add = (cause, ref, fixOptions) => {
      problems.push({ id: 'p' + (++state.counters.problem), cause, title: PROBLEM_TITLES[cause] || 'مشکل', ...ref, fixOptions });
    };
    for (const d of state.districts) {
      if (d.qos >= 0.5) continue;
      const servers = state.nodes.filter((n) => isAccessNode(n) &&
        dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + d.radius * 0.6);
      const anyConnected = servers.some((n) => n.connected);
      if (!servers.length) {
        add('no_coverage', { districtId: d.id, message: 'منطقه «' + d.name + '» پوشش ندارد.' }, [
          { action: 'build_access', label: 'ساخت دکل/آنتن در منطقه', equipment: ['cell_3g', 'fwa_ap', 'wifi_ap'] },
          { action: 'build_satellite', label: 'استفاده از پایانه ماهواره‌ای', equipment: ['sat_terminal_leo'] },
        ]);
      } else if (!anyConnected) {
        const srv = servers[0];
        add('unconnected', { districtId: d.id, nodeId: srv.id, message: 'گره دسترسی «' + d.name + '» به هسته وصل نیست.' }, [
          { action: 'connect', label: 'اتصال گره به شبکه (فیبر/PTP)', nodeId: srv.id, medium: ['fiber', 'ptp'] },
          { action: 'repair', label: 'بررسی و تعمیر گره', nodeId: srv.id },
        ]);
      } else {
        add('congestion', { districtId: d.id, message: 'ظرفیت در «' + d.name + '» کم است و کیفیت پایین آمده.' }, [
          { action: 'upgrade', label: 'ارتقای گره دسترسی', districtId: d.id },
          { action: 'build_access', label: 'افزودن گره دسترسی دیگر', districtId: d.id },
          { action: 'upgrade_link', label: 'ارتقای لینک‌های پرمصرف', districtId: d.id },
        ]);
      }
    }
    for (const n of state.nodes) {
      if (n.status === 'failed') {
        add('failed_node', { nodeId: n.id, message: 'گره «' + (n.name || 'نامشخص') + '» خراب شده است.' }, [
          { action: 'repair', label: 'تعمیر گره', nodeId: n.id },
          { action: 'replace', label: 'جایگزینی گره', nodeId: n.id },
        ]);
      }
    }
    for (const l of state.links) {
      if (l.status === 'cut') {
        add('link_cut', { linkId: l.id, message: 'یک لینک ' + mediumFa(l.medium) + ' قطع شده است.' }, [
          { action: 'repair_link', label: 'تعمیر لینک', linkId: l.id },
          { action: 'failover', label: 'فعال‌سازی مسیر پشتیبان', linkId: l.id },
          { action: 'build_backup', label: 'ساخت لینک پشتیبان', linkId: l.id },
        ]);
      }
    }
    return problems;
  }

  // ---------- رویدادها ----------
  function rollEvents(state, dtDays) {
    const fired = [];
    for (const ev of (DATA.events || [])) {
      if (rand(state) > (ev.probability || 0) * dtDays) continue;
      const fx = ev.effect || {};
      let detail = '';
      if (fx.action === 'cut') {
        const isHQn = (id) => { const n = nodeById(state, id); return n && (n.type === 'core_router' || n.type === 'internet_gateway'); };
        const cands = state.links.filter((l) => l.status === 'active' && l.medium === 'fiber' && !(isHQn(l.from) && isHQn(l.to)));
        if (cands.length) { const l = cands[Math.floor(rand(state) * cands.length)]; l.status = 'cut'; detail = 'یک لینک ' + mediumFa(l.medium) + ' قطع شد.'; }
      } else if (fx.action === 'fail') {
        const cands = state.nodes.filter((n) => n.status === 'active' && n.type !== 'internet_gateway' && n.type !== 'core_router');
        if (cands.length) { const n = cands[Math.floor(rand(state) * cands.length)]; n.status = 'failed'; n.health = 0; detail = 'گره «' + (n.name || 'نامشخص') + '» از کار افتاد.'; }
      } else if (fx.action === 'degrade') {
        state.links.filter((l) => l.medium === 'ptp').forEach((l) => { l.capacity = Math.max(50, Math.floor(l.capacity * 0.6)); });
        detail = 'ظرفیت لینک‌های بی‌سیم کم شد.';
      } else if (fx.action === 'demand_up') {
        const d = state.districts[Math.floor(rand(state) * state.districts.length)];
        if (d) { d.usageMult = Math.min(3, (d.usageMult || 1) * (fx.factor || 1.3)); detail = 'مصرف مشترکان «' + d.name + '» بالا رفت.'; }
      } else if (fx.action === 'population_up') {
        const d = state.districts[Math.floor(rand(state) * state.districts.length)];
        if (d) { d.population = Math.round(d.population * (fx.factor || 1.05)); detail = 'جمعیت «' + d.name + '» بیشتر شد.'; }
      } else if (fx.action === 'add' && fx.target === 'cash') {
        state.cash += fx.amount || 0; detail = (fx.amount || 0) + ' واحد به بودجه اضافه شد.';
      } else if (fx.action === 'satisfaction_down') {
        const d = state.districts[Math.floor(rand(state) * state.districts.length)];
        if (d) { d.satisfaction = clamp(d.satisfaction - (fx.amount || 5), 0, 100); detail = 'رضایت «' + d.name + '» افت کرد.'; }
      }
      fired.push({ id: ev.id, name: ev.name, type: ev.type, description: ev.description, detail, day: Math.floor(state.day) });
      log(state, ev.name + ': ' + ev.description + (detail ? ' ' + detail : ''), 'event');
    }
    return fired;
  }

  // ---------- آموزش و مأموریت‌ها ----------
  function updateTutorial(state) {
    const hasAccess = state.nodes.some((n) => isAccessNode(n));
    const hasConnectedAccess = state.nodes.some((n) => isAccessNode(n) && n.connected);
    const anyServed = state.districts.some((d) => d.qos >= 0.5);
    const hasTech = (state.techsUnlocked || []).length > 0;
    const hasStaff = (state.staff || []).length > 0;
    let step = 0;
    if (hasAccess) step = 1;
    if (hasConnectedAccess) step = 2;
    if (anyServed) step = 3;
    if (hasTech) step = 4;
    if (hasStaff) step = 5;
    if (step > state.tutorialStep) {
      state.tutorialStep = step;
      log(state, 'مرحله آموزش ' + step + ' کامل شد.', 'tutorial');
    }
  }

  function checkMissions(state) {
    const totalSubs = state.districts.reduce((s, d) => s + d.subscribers, 0) + ((state.scattered && state.scattered.subscribers) || 0);
    for (const m of state.missions) {
      if (m.done) continue;
      const g = m.goal || {};
      let ok = false;
      if (g.type === 'build_access') ok = state.nodes.filter((n) => isAccessNode(n)).length >= (g.count || 1);
      else if (g.type === 'connect_access') ok = state.nodes.filter((n) => isAccessNode(n) && n.connected).length >= (g.count || 1);
      else if (g.type === 'district_qos') ok = state.districts.filter((d) => d.qos >= (g.qos || 0.5)).length >= (g.count || 1);
      else if (g.type === 'subscribers') ok = totalSubs >= (g.count || 0);
      else if (g.type === 'unlock_tech') ok = (state.techsUnlocked || []).length >= (g.count || 1);
      else if (g.type === 'satellite_path') ok = state.nodes.some((n) => (n.type === 'sat_terminal_leo' || n.type === 'sat_terminal_geo') && traceSatellitePath(state, n.id));
      else if (g.type === 'monthly_profit') ok = state.lastMonthlyProfit > 0;
      if (ok) {
        m.done = true; m.progress = 1;
        state.cash += m.reward || 0;
        if (!state.completedMissions.includes(m.id)) state.completedMissions.push(m.id);
        state.missionsDone = state.completedMissions.length;
        log(state, 'مأموریت «' + m.name + '» کامل شد. جایزه: ' + (m.reward || 0), 'mission');
      }
    }
  }

  // ---------- تیک اصلی ----------
  // ---------- رشد تدریجی شهر ----------
  // هندسهٔ خیابان‌ها و رودخانه برای جای‌گذاری ساختمان جدید (هم‌خوان با رندر map.js):
  // خیابان‌ها روی خطوط مضرب ۲۰۰ (از ۲۰۰) و رودخانه با پاره‌خط DATA.river.
  const RIVER_BAND = 64; // نیم‌پهنای رودخانه + انحراف منحنی + حاشیهٔ امن
  function riverXAtY(state, y) {
    const pts = (state && state.map && state.map.river) || (DATA && DATA.river) || [];
    if (!pts.length) return -1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y >= a.y && y <= b.y) { const t = (y - a.y) / Math.max(1, b.y - a.y); return a.x + (b.x - a.x) * t; }
    }
    return pts[pts.length - 1].x;
  }
  function rectHitsRoad(state, x, y, w, h) {
    const M = 14; // فاصلهٔ امن از محور خیابان (نیم‌پهنای بلوار ۱۱ + حاشیه)
    const roads = state && state.map && state.map.roads;
    if (roads && roads.v && roads.h) {
      for (const lx of roads.v) if (x - M < lx && lx < x + w + M) return true;
      for (const ly of roads.h) if (y - M < ly && ly < y + h + M) return true;
      return false;
    }
    const W = (DATA.world && DATA.world.width) || 3200;
    const H = (DATA.world && DATA.world.height) || 2400;
    for (let lx = 200; lx < W; lx += 200) if (x - M < lx && lx < x + w + M) return true;
    for (let ly = 200; ly < H; ly += 200) if (y - M < ly && ly < y + h + M) return true;
    return false;
  }
  function rectHitsRiver(state, x, y, w, h) {
    const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]];
    for (const p of pts) if (Math.abs(p[0] - riverXAtY(state, p[1])) < RIVER_BAND) return true;
    return false;
  }
  function rectOverlaps(x, y, w, h, buildings, nodes) {
    const G = 3;
    for (const b of buildings) {
      if (x < b.x + (b.w || 26) + G && x + w + G > b.x && y < b.y + (b.h || 20) + G && y + h + G > b.y) return true;
    }
    for (const n of nodes) {
      if (n.x > x - 20 && n.x < x + w + 20 && n.y > y - 20 && n.y < y + h + 20) return true;
    }
    return false;
  }

  function growCity(state, dtDays) {
    if (!state.buildings) state.buildings = (DATA.buildings || []).slice();
    const rates = (DATA.growth && DATA.growth.rate) || {};
    const counts = {};
    for (const b of state.buildings) counts[b.districtId] = (counts[b.districtId] || 0) + 1;
    const W = (DATA.world && DATA.world.width) || 3200;
    const H = (DATA.world && DATA.world.height) || 2400;
    const bTypes = DATA.buildingTypes || ['residential', 'commercial', 'office', 'industrial'];
    const palettes = DATA.buildingColors || {};
    for (const d of state.districts) {
      const cap = d.buildingCap || 0;
      if (!cap || (counts[d.id] || 0) >= cap) continue;
      const p = Math.min(1, (rates[d.type] != null ? rates[d.type] : 0.07) * dtDays);
      if (rand(state) >= p) continue;
      // تلاش برای یافتن جای مناسب داخل منطقه (نه روی خیابان، نه در رودخانه، نه روی ساختمان/گره دیگر)
      // تلاش‌های پایانی: شعاع بزرگ‌تر و ساختمان کوچک‌تر تا مناطق تنگ هم به سقف برسند
      for (let attempt = 0; attempt < 80; attempt++) {
        const small = attempt >= 50;
        const w = 26 + Math.floor(rand(state) * (small ? 16 : 42));
        const h = 26 + Math.floor(rand(state) * (small ? 16 : 42));
        const ang = rand(state) * Math.PI * 2;
        const rr = Math.sqrt(rand(state)) * d.radius * (attempt >= 30 ? 0.92 : 0.85);
        const x = Math.round(d.x + Math.cos(ang) * rr - w / 2);
        const y = Math.round(d.y + Math.sin(ang) * rr - h / 2);
        if (x < 10 || y < 10 || x + w > W - 10 || y + h > H - 10) continue;
        if (rectHitsRoad(state, x, y, w, h)) continue;
        if (rectHitsRiver(state, x, y, w, h)) continue;
        if (rectOverlaps(x, y, w, h, state.buildings, state.nodes)) continue;
        const tall = (d.type === 'dense' || d.type === 'commercial') && rand(state) > 0.45;
        const height = tall ? 10 + Math.floor(rand(state) * 18) : 2 + Math.floor(rand(state) * 7);
        const bType = d.type === 'industrial' ? 'industrial' : bTypes[Math.floor(rand(state) * 3)];
        const palette = palettes[bType] || palettes.residential || ['#5b6b82'];
        state.counters.building = (state.counters.building || state.buildings.length) + 1;
        state.buildings.push({
          id: 'b' + state.counters.building,
          districtId: d.id,
          x, y, w, h, height,
          type: bType,
          color: palette[Math.floor(rand(state) * palette.length)],
          name: height >= 15 ? 'برج ' + d.name + ' ' + ((counts[d.id] || 0) + 1) : undefined,
        });
        counts[d.id] = (counts[d.id] || 0) + 1;
        // ساختمان جدید یعنی جمعیت و مصرف بالقوهٔ بیشتر (تدریجی و متناسب)
        d.population = Math.round(d.population * 1.02);
        d.usageMult = Math.min(2, (d.usageMult || 1) * 1.02);
        log(state, 'ساختمان جدیدی در «' + d.name + '» ساخته شد؛ جمعیت و تقاضای منطقه بیشتر شد.', 'info');
        break;
      }
    }

    // ساختمان‌های پراکندهٔ خارج از مناطق هم به‌تدریج زیاد می‌شوند (تا سقف کل)
    const outsideCap = (DATA.growth && DATA.growth.outsideCap) || 320;
    const outsideRate = (DATA.growth && DATA.growth.outsideRate) || 0.3;
    const outsideCount = state.buildings.filter((b) => !b.districtId).length;
    if (outsideCount < outsideCap && rand(state) < Math.min(1, outsideRate * dtDays)) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const w = 22 + Math.floor(rand(state) * 30);
        const h = 22 + Math.floor(rand(state) * 30);
        const x = Math.round(10 + rand(state) * (W - w - 20));
        const y = Math.round(10 + rand(state) * (H - h - 20));
        const cx = x + w / 2, cy = y + h / 2;
        if (state.districts.some((d) => dist(cx, cy, d.x, d.y) < d.radius + 30)) continue;
        if (rectHitsRoad(state, x, y, w, h)) continue;
        if (rectHitsRiver(state, x, y, w, h)) continue;
        if (rectOverlaps(x, y, w, h, state.buildings, state.nodes)) continue;
        const bType = rand(state) < 0.7 ? 'residential' : (rand(state) < 0.5 ? 'industrial' : 'commercial');
        const palette = palettes[bType] || palettes.residential || ['#5b6b82'];
        state.counters.building = (state.counters.building || state.buildings.length) + 1;
        state.buildings.push({
          id: 'b' + state.counters.building,
          districtId: null,
          x, y, w, h,
          height: 1 + Math.floor(rand(state) * 4),
          type: bType,
          color: palette[Math.floor(rand(state) * palette.length)],
        });
        break;
      }
    }
  }

  // ---------- اندازهٔ پویای مناطق + ادغام ----------
  // شعاع هر منطقه با تعداد مشترکانش کم‌وزیاد می‌شود (۰٫۷× تا ۱٫۶× شعاع پایه، تدریجی).
  // رشد هرگز از مرز همسایه رد نمی‌شود (بدون هم‌پوشانی)؛ اگر دو منطقهٔ مجاور هر دو پرمشترک
  // باشند و شعاع مطلوبشان به هم برسد، در هم ادغام می‌شوند (منطقهٔ بزرگ‌تر/مرکز شهر می‌ماند).
  const DISTRICT_GAP = 40;
  function desiredRadius(d) {
    const base = d.baseRadius || d.radius || 300;
    const maxSubs = Math.max(1, (d.population || 1) * 0.35);
    const ratio = clamp((d.subscribers || 0) / maxSubs, 0, 1);
    return base * (0.7 + 0.9 * ratio);
  }
  function capRadiusByNeighbors(state, d, target) {
    for (const o of state.districts) {
      if (o === d) continue;
      const dd = dist(d.x, d.y, o.x, o.y);
      target = Math.min(target, Math.max(120, dd - o.radius - DISTRICT_GAP));
    }
    return target;
  }
  function mergeDistricts(state, a, b) {
    // بازمانده: «مرکز شهر» همیشه می‌ماند؛ وگرنه منطقهٔ پرجمعیت‌تر (نامش هم می‌ماند)
    let keep = a, drop = b;
    if (b.id === 'center' || (a.id !== 'center' && b.population > a.population)) { keep = b; drop = a; }
    const keepPop = keep.population || 0, dropPop = drop.population || 0;
    const totalPop = Math.max(1, keepPop + dropPop);
    keep.x = Math.round((keep.x * keepPop + drop.x * dropPop) / totalPop);
    keep.y = Math.round((keep.y * keepPop + drop.y * dropPop) / totalPop);
    keep.radius = Math.round(Math.sqrt(Math.pow(keep.radius || 0, 2) + Math.pow(drop.radius || 0, 2))); // حفظ مساحت
    keep.baseRadius = Math.round(Math.sqrt(Math.pow(keep.baseRadius || keep.radius, 2) + Math.pow(drop.baseRadius || drop.radius, 2)));
    keep.population = totalPop;
    keep.usageMult = ((keep.usageMult || 1) * keepPop + (drop.usageMult || 1) * dropPop) / Math.max(1, totalPop);
    keep.subscribers = (keep.subscribers || 0) + (drop.subscribers || 0);
    keep.potentialRevenue = (keep.potentialRevenue || 0) + (drop.potentialRevenue || 0);
    keep.buildingCap = (keep.buildingCap || 0) + (drop.buildingCap || 0);
    keep.satisfaction = Math.round(((keep.satisfaction || 0) * keepPop + (drop.satisfaction || 0) * dropPop) / totalPop);
    keep.everServed = keep.everServed || drop.everServed;
    for (const bl of (state.buildings || [])) if (bl.districtId === drop.id) bl.districtId = keep.id;
    const keepCust = (state.customers || []).find((c) => c.districtId === keep.id);
    const dropCust = (state.customers || []).find((c) => c.districtId === drop.id);
    if (keepCust && dropCust) keepCust.count = (keepCust.count || 0) + (dropCust.count || 0);
    state.customers = (state.customers || []).filter((c) => c.districtId !== drop.id);
    state.districts = state.districts.filter((d) => d.id !== drop.id);
    // شعاع ادغام‌شده فوراً با همسایه‌ها محدود شود تا هم‌پوشانی نماند
    keep.radius = Math.round(capRadiusByNeighbors(state, keep, keep.radius));
    log(state, 'دو منطقهٔ «' + keep.name + '» و «' + drop.name + '» با رشد مشترکان به هم پیوستند و یکی شدند.', 'event');
    return keep;
  }
  function updateDistrictSizes(state, dtDays) {
    const ds = state.districts || [];
    for (const d of ds) {
      if (!d.baseRadius) d.baseRadius = d.radius;
      const target = capRadiusByNeighbors(state, d, desiredRadius(d));
      const step = Math.max(1, d.radius * 0.03 * dtDays);
      if (d.radius < target) d.radius = Math.min(target, d.radius + step);
      else if (d.radius > target) d.radius = Math.max(target, d.radius - step);
      d.radius = Math.round(d.radius);
    }
    // ادغام: هر دو پرمشترک و شعاع مطلوبشان به هم می‌رسد (حداکثر یک ادغام در هر تیک)
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i], b = ds[j];
        const ratioA = (a.subscribers || 0) / Math.max(1, (a.population || 1) * 0.35);
        const ratioB = (b.subscribers || 0) / Math.max(1, (b.population || 1) * 0.35);
        if (ratioA < 0.55 || ratioB < 0.55) continue;
        const dd = dist(a.x, a.y, b.x, b.y);
        if (desiredRadius(a) + desiredRadius(b) + DISTRICT_GAP > dd) {
          mergeDistricts(state, a, b);
          return;
        }
      }
    }
  }

  // ---------- تنظیم کانال و جهت آنتن (ویژگی‌های ۲۱ و ۲۲) ----------
  function setNodeChannel(state, nodeId, channel) {
    const n = nodeById(state, nodeId);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    const count = channelCountFor(n);
    if (!count) return { ok: false, error: 'این گره کانال فرکانسی ندارد.' };
    if (!Number.isInteger(channel) || channel < 1 || channel > count) {
      return { ok: false, error: 'کانال باید بین ۱ تا ' + count + ' باشد.' };
    }
    n.channel = channel;
    log(state, 'کانال «' + (n.name || 'گره') + '» روی کانال ' + channel + ' تنظیم شد.', 'info');
    return { ok: true, channel };
  }
  function autoChannel(state, nodeId) {
    const n = nodeById(state, nodeId);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    const count = channelCountFor(n);
    if (!count) return { ok: false, error: 'این گره کانال فرکانسی ندارد.' };
    const ch = leastInterferedChannel(state, n);
    n.channel = ch;
    log(state, 'کانال «' + (n.name || 'گره') + '» به‌صورت خودکار روی کانال ' + ch + ' تنظیم شد.', 'info');
    return { ok: true, channel: ch };
  }
  function setNodeDirection(state, nodeId, directionDeg, angleDeg) {
    const n = nodeById(state, nodeId);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    if (directionDeg != null && !isNaN(directionDeg)) n.direction = ((directionDeg % 360) + 360) % 360;
    if (angleDeg != null && !isNaN(angleDeg)) n.angle = clamp(angleDeg, 1, 360);
    log(state, 'جهت آنتن «' + (n.name || 'گره') + '» تنظیم شد (جهت ' + Math.round(n.direction || 0) + ' درجه، پهنای پرتو ' + Math.round(n.angle || 360) + ' درجه).', 'info');
    return { ok: true, direction: n.direction, angle: n.angle };
  }

  // ---------- مشترکان فردی (ویژگی ۱۱) ----------
  // نمونهٔ نمایشی از مشترکان؛ درآمدشان جدا حساب نمی‌شود (درآمد منطقه‌ای شاملشان است).
  const INDIVIDUAL_CAP = 2000; // سقف کل مشترکان فردی (نمونهٔ قابل‌مشاهده از مجموع مشترکان)
  const INDIVIDUAL_PER_SUBS = 20; // به‌ازای هر ۲۰ مشترک تجمیعی، یک مشترک فردی در نمونه
  const INDIVIDUAL_DISTRICT_CAP = 300; // سقف نمونه در هر منطقه
  const INDIVIDUAL_NEEDS = [10, 25, 50, 100, 200];
  const INDIVIDUAL_NEED_WEIGHTS = [0.35, 0.3, 0.2, 0.1, 0.05];
  // نمونهٔ فردیِ مشترکان: در هر منطقه متناسب با مشترکان تجمیعی همان منطقه رشد می‌کند
  // (هر ۲۰ مشترک تجمیعی ≈ یک نفر در نمونه، تا سقف منطقه و سقف کل). هر نفر به یک
  // ساختمان مشخص از همان منطقه وصل است؛ ساختمان‌های تازه‌ساخته هم می‌توانند نفر بگیرند.
  function individualTargetFor(subs) {
    return Math.min(INDIVIDUAL_DISTRICT_CAP, Math.round((subs || 0) / INDIVIDUAL_PER_SUBS));
  }
  function spawnIndividuals(state, dtDays) {
    if (!state.individuals) state.individuals = [];
    if (state.individuals.length >= INDIVIDUAL_CAP) return;
    const buildings = state.buildings || [];
    if (!buildings.length) return;
    const firstNames = (DATA && DATA.firstNames) || [];
    const lastNames = (DATA && DATA.lastNames) || [];
    const byDistrict = new Map();
    for (const b of buildings) {
      const key = b.districtId || '__scattered__';
      if (!byDistrict.has(key)) byDistrict.set(key, []);
      byDistrict.get(key).push(b);
    }
    const countIn = (key) => state.individuals.filter((p) => (p.districtId || '__scattered__') === key).length;
    const spawnOne = (b) => {
      let r = rand2(state), needMbps = INDIVIDUAL_NEEDS[0];
      for (let i = 0; i < INDIVIDUAL_NEEDS.length; i++) { if (r < INDIVIDUAL_NEED_WEIGHTS[i]) { needMbps = INDIVIDUAL_NEEDS[i]; break; } r -= INDIVIDUAL_NEED_WEIGHTS[i]; }
      const fn = firstNames.length ? firstNames[Math.floor(rand2(state) * firstNames.length)] : 'مشترک';
      const ln = lastNames.length ? lastNames[Math.floor(rand2(state) * lastNames.length)] : '';
      state.individuals.push({
        id: 'ind' + (++state.counters.individual),
        name: (fn + ' ' + ln).trim(),
        needMbps,
        priceSensitivity: Math.round((0.5 + rand2(state)) * 100) / 100,
        prefTech: TECH_KEYS[Math.floor(rand2(state) * TECH_KEYS.length)],
        districtId: b.districtId || null,
        buildingId: b.id,
        status: 'candidate',
        joinedDay: null,
        satisfaction: 0,
      });
    };
    const groups = (state.districts || []).map((d) => ({ key: d.id, subs: d.subscribers || 0 }));
    groups.push({ key: '__scattered__', subs: (state.scattered && state.scattered.subscribers) || 0 });
    for (const g of groups) {
      if (state.individuals.length >= INDIVIDUAL_CAP) break;
      const target = individualTargetFor(g.subs);
      const have = countIn(g.key);
      if (have >= target) continue;
      const pool = byDistrict.get(g.key) || [];
      if (!pool.length) continue;
      let toSpawn = Math.min(target - have, Math.max(1, Math.round(6 * dtDays)), INDIVIDUAL_CAP - state.individuals.length);
      while (toSpawn-- > 0) spawnOne(pool[Math.floor(rand2(state) * pool.length)]);
    }
  }
  function districtPackagePrice(state, districtId) {
    const cust = (state.customers || []).find((c) => c.districtId === districtId);
    const pkg = (state.packages || []).find((p) => p.id === (cust ? cust.packageId : 'home'));
    return pkg ? pkg.price : 120;
  }
  function evaluateIndividuals(state) {
    for (const ind of (state.individuals || [])) {
      const d = ind.districtId ? (state.districts || []).find((x) => x.id === ind.districtId) : null;
      // کیفیت تجربه‌شده (رضایت/ریزش) و کیفیت بالقوه (پیوستن) جدا سنجیده می‌شوند
      const qos = d ? (d.qos || 0) : ((state.scattered && state.scattered.qos) || 0);
      const potentialQos = d ? (d.potentialQos != null ? d.potentialQos : qos)
        : ((state.scattered && state.scattered.potentialQos != null) ? state.scattered.potentialQos : qos);
      if (ind.status !== 'subscribed') {
        // پیوستن عمدتاً تابع کیفیت بالقوهٔ سرویس است (مثل مدل تجمیعی مشترکان منطقه)؛ قیمت فقط احتمال روزانه را کم‌وزیاد می‌کند،
        // نه اینکه در مناطق با بستهٔ گران تقریباً همه را برای همیشه بیرون نگه دارد و لیست با آمار منطقه ناسازگار شود.
        if (potentialQos >= 0.3) {
          const price = districtPackagePrice(state, ind.districtId);
          const willingness = ind.needMbps * 3 / Math.max(0.1, ind.priceSensitivity);
          const affordP = clamp((willingness * 2) / Math.max(1, price), 0.1, 1);
          if (rand2(state) < affordP) {
            ind.status = 'subscribed';
            ind.joinedDay = Math.floor(state.day);
            ind.satisfaction = Math.round(qos * 100);
          }
        }
      } else {
        ind.satisfaction = clamp(ind.satisfaction + (qos * 100 - ind.satisfaction) * 0.3, 0, 100);
        if (qos < 0.1 && rand2(state) < 0.3) {
          ind.status = 'unsubscribed';
          ind.satisfaction = Math.round(ind.satisfaction);
        }
      }
    }
  }

  // ---------- قراردادهای سازمانی (ویژگی ۱۲) ----------
  function maybeGenerateContractOffer(state, dtDays) {
    if (!state.contractOffers) state.contractOffers = [];
    // پیشنهادهای منقضی حذف شوند
    state.contractOffers = state.contractOffers.filter((o) => state.day <= o.expiresDay);
    if (state.contractOffers.length >= 3) return;
    const served = (state.districts || []).filter((d) => d.connected);
    if (!served.length) return;
    if (rand2(state) >= 0.05 * dtDays) return;
    const templates = (DATA && DATA.enterpriseTemplates) || [];
    const matching = [];
    for (const t of templates) {
      const ds = served.filter((d) => (t.districtTypes || []).includes(d.type));
      if (ds.length) matching.push({ t, ds });
    }
    if (!matching.length) return;
    const pick = matching[Math.floor(rand2(state) * matching.length)];
    const d = pick.ds[Math.floor(rand2(state) * pick.ds.length)];
    const t = pick.t;
    state.contractOffers.push({
      id: 'co' + (++state.counters.contract),
      templateId: t.id, orgName: t.orgName, districtId: d.id,
      wantSpeed: t.wantSpeed, wantSla: t.wantSla, wantPrice: t.wantPrice, months: t.months,
      expiresDay: Math.floor(state.day) + 30,
    });
    log(state, 'پیشنهاد قرارداد سازمانی از «' + t.orgName + '» برای منطقهٔ «' + d.name + '» رسید.', 'info');
  }
  function negotiateContract(state, offerId, terms) {
    terms = terms || {};
    const idx = (state.contractOffers || []).findIndex((o) => o.id === offerId);
    if (idx < 0) return { status: 'rejected', error: 'پیشنهاد پیدا نشد.' };
    const offer = state.contractOffers[idx];
    const speed = terms.speed != null ? terms.speed : offer.wantSpeed;
    const sla = terms.sla != null ? terms.sla : offer.wantSla;
    const price = terms.price != null ? terms.price : offer.wantPrice;
    const months = terms.months != null ? terms.months : offer.months;
    const score = 0.35 * clamp(speed / Math.max(1, offer.wantSpeed), 0, 1.2) / 1.2
      + 0.3 * clamp(sla / Math.max(1, offer.wantSla), 0, 1.1) / 1.1
      + 0.35 * clamp(offer.wantPrice / Math.max(1, price), 0, 1.3) / 1.3;
    if (score >= 0.72) {
      state.contractOffers.splice(idx, 1);
      const contract = {
        id: 'ct' + (++state.counters.contract),
        orgName: offer.orgName, districtId: offer.districtId,
        speed, sla, priceMonthly: price, monthsLeft: months,
        startDay: Math.floor(state.day), breaches: 0, status: 'active',
      };
      if (!state.contracts) state.contracts = [];
      state.contracts.push(contract);
      log(state, 'قرارداد سازمانی با «' + offer.orgName + '» بسته شد (سرعت ' + speed + ' مگابیت، ماهانه ' + price + ').', 'finance');
      return { status: 'accepted', contract };
    }
    if (score >= 0.45) {
      const counterTerms = {
        speed: Math.round((speed + offer.wantSpeed) / 2),
        sla: Math.round((sla + offer.wantSla) / 2),
        price: Math.round(price * 0.35 + offer.wantPrice * 0.65), // میانه با وزن بیشتر به سمت سازمان
        months,
      };
      return { status: 'counter', counterTerms };
    }
    state.contractOffers.splice(idx, 1);
    log(state, '«' + offer.orgName + '» پیشنهاد قرارداد را رد کرد.', 'warn');
    return { status: 'rejected' };
  }

  // ---------- کمپین‌های تبلیغاتی (ویژگی ۱۴) ----------
  function startCampaign(state, typeId, districtIds, days) {
    const type = ((DATA && DATA.campaignTypes) || []).find((t) => t.id === typeId);
    if (!type) return { ok: false, error: 'نوع کمپین نامعتبر است.' };
    if (!Array.isArray(districtIds) || !districtIds.length) return { ok: false, error: 'حداقل یک منطقه انتخاب کن.' };
    const valid = districtIds.filter((id) => (state.districts || []).some((d) => d.id === id));
    if (!valid.length) return { ok: false, error: 'منطقهٔ معتبری انتخاب نشده است.' };
    if (!(days >= 1)) return { ok: false, error: 'مدت کمپین باید حداقل یک روز باشد.' };
    if (state.cash < type.costPerDay) return { ok: false, error: 'بودجه کافی برای شروع کمپین نیست (هزینهٔ روز اول: ' + type.costPerDay + ').' };
    const campaign = {
      id: 'cp' + (++state.counters.campaign),
      typeId, districtIds: valid.slice(),
      startDay: Math.floor(state.day), endDay: Math.floor(state.day) + Math.floor(days),
      days: Math.floor(days), spent: 0, newSubs: 0, active: true,
    };
    if (!state.campaigns) state.campaigns = [];
    state.campaigns.push(campaign);
    state.counters.campaignsRun = (state.counters.campaignsRun || 0) + 1;
    log(state, 'کمپین «' + type.name + '» در ' + valid.length + ' منطقه برای ' + campaign.days + ' روز شروع شد.', 'info');
    return { ok: true, campaign };
  }
  function stopCampaign(state, id) {
    const c = (state.campaigns || []).find((x) => x.id === id);
    if (!c) return { ok: false, error: 'کمپین پیدا نشد.' };
    c.active = false;
    log(state, 'کمپین متوقف شد.', 'info');
    return { ok: true, campaign: c };
  }
  function tickCampaigns(state, dtDays) {
    for (const c of (state.campaigns || [])) {
      if (!c.active) continue;
      if (state.day > c.endDay) { c.active = false; log(state, 'کمپین تبلیغاتی به پایان رسید.', 'info'); continue; }
      const type = ((DATA && DATA.campaignTypes) || []).find((t) => t.id === c.typeId);
      if (!type) { c.active = false; continue; }
      const cost = Math.round(type.costPerDay * dtDays);
      if (state.cash < cost) {
        c.active = false;
        log(state, 'کمپین «' + type.name + '» به‌خاطر کمبود بودجه زودتر تمام شد.', 'warn');
        continue;
      }
      state.cash -= cost;
      state.totalCosts += cost;
      c.spent = (c.spent || 0) + cost;
    }
  }

  // ---------- ماهواره‌های اختصاصی (ویژگی ۲۹) ----------
  function launchSatellite(state, kind) {
    const cfg = DATA && DATA.satelliteLaunch && DATA.satelliteLaunch[kind];
    if (!cfg) return { ok: false, error: 'نوع ماهواره نامعتبر است.' };
    if (!(state.techsUnlocked || []).includes('own_satellite')) {
      return { ok: false, error: 'فناوری «ماهواره اختصاصی» هنوز باز نشده است.' };
    }
    if (state.cash < cfg.cost) return { ok: false, error: 'بودجه کافی برای پرتاب ماهواره نیست (هزینه: ' + cfg.cost + ').' };
    state.cash -= cfg.cost;
    state.totalCosts += cfg.cost;
    const n = (state.counters.satellite = (state.counters.satellite || 0) + 1);
    const sat = {
      id: 'sat' + n, kind, name: cfg.name + ' ' + n,
      status: 'launching', launchTimer: cfg.buildDays,
      capacity: cfg.capacity, lifetimeDays: cfg.lifetimeDays,
      ageDays: 0, health: 100, monthlyCost: cfg.monthlyCost,
    };
    if (!state.satellites) state.satellites = [];
    state.satellites.push(sat);
    log(state, 'پرتاب ماهوارهٔ «' + sat.name + '» آغاز شد (' + cfg.buildDays + ' روز تا قرارگیری در مدار).', 'build');
    return { ok: true, satellite: sat };
  }
  function tickSatellites(state, dtDays) {
    for (const s of (state.satellites || [])) {
      if (s.status === 'launching') {
        s.launchTimer -= dtDays;
        if (s.launchTimer <= 0) {
          s.launchTimer = 0; s.status = 'active';
          log(state, 'ماهوارهٔ «' + s.name + '» در مدار قرار گرفت.', 'build');
        }
      } else if (s.status === 'active') {
        s.ageDays = (s.ageDays || 0) + dtDays;
        s.health = clamp((s.health == null ? 100 : s.health) - 0.004 * dtDays, 0, 100);
        if (rand2(state) < 0.0001 * dtDays) {
          s.status = 'failed'; s.health = 0;
          log(state, 'ماهوارهٔ «' + s.name + '» دچار خرابی شد و از مدار خارج شد.', 'error');
        } else if (s.ageDays >= s.lifetimeDays) {
          s.status = 'deorbited';
          log(state, 'ماهوارهٔ «' + s.name + '» به پایان عمرش رسید و از مدار خارج شد.', 'warn');
        }
      }
    }
  }

  // ---------- دستاوردها (ویژگی ۶) ----------
  function achievementMetrics(state) {
    const lf = state.lastFlow || {};
    const totalSubs = lf.totalSubscribers != null ? lf.totalSubscribers
      : (state.districts || []).reduce((s, d) => s + (d.subscribers || 0), 0) + ((state.scattered && state.scattered.subscribers) || 0);
    const servedDistricts = lf.servedDistricts != null ? lf.servedDistricts
      : (state.districts || []).filter((d) => d.connected).length;
    const counters = state.counters || {};
    return {
      subscribers: totalSubs,
      cash: state.cash || 0,
      totalRevenue: state.totalRevenue || 0,
      monthlyRevenue: lf.monthlyRevenue != null ? lf.monthlyRevenue : (state.monthRevenue || 0),
      servedDistricts,
      coveragePct: (state.districts || []).length ? Math.round(100 * servedDistricts / state.districts.length) : 0,
      nodes: (state.nodes || []).length,
      fiberLinks: (state.links || []).filter((l) => l.medium === 'fiber').length,
      satellitePath: (state.nodes || []).some((n) => (n.type === 'sat_terminal_leo' || n.type === 'sat_terminal_geo') && traceSatellitePath(state, n.id)) ? 1 : 0,
      satellitesLaunched: counters.satellite || 0,
      contractsDone: counters.contractsDone || 0,
      campaignsRun: counters.campaignsRun || 0,
      satisfaction: state.satisfaction || 0,
      days: Math.floor(state.day || 1),
      techs: (state.techsUnlocked || []).length,
      staff: (state.staff || []).length,
      individualSubs: (state.individuals || []).filter((i) => i.status === 'subscribed').length,
      profitMonths: counters.profitMonths || 0,
    };
  }
  function checkAchievements(state) {
    const defs = (DATA && DATA.achievements) || [];
    if (!state.achievements) state.achievements = {};
    if (!state.newAchievements) state.newAchievements = [];
    if (!defs.length) return [];
    const metrics = achievementMetrics(state);
    const unlockedNow = [];
    for (const def of defs) {
      if (state.achievements[def.id] != null) continue;
      if ((metrics[def.metric] || 0) >= def.target) {
        state.achievements[def.id] = Math.floor(state.day);
        state.newAchievements.push(def);
        unlockedNow.push(def);
        log(state, 'دستاورد باز شد: «' + def.name + '»', 'mission');
      }
    }
    return unlockedNow;
  }
  function achievementProgress(state) {
    const defs = (DATA && DATA.achievements) || [];
    const metrics = achievementMetrics(state);
    return defs.map((def) => ({
      id: def.id,
      current: metrics[def.metric] || 0,
      target: def.target,
      unlocked: !!(state.achievements && state.achievements[def.id] != null),
    }));
  }

  // ---------- تاریخچهٔ روزانه (ویژگی ۴۸) ----------
  function pushHistory(state) {
    if (!state.history) state.history = [];
    const day = Math.floor(state.day);
    const last = state.history[state.history.length - 1];
    if (last && last.day === day) return;
    const lf = state.lastFlow || {};
    const servedDistricts = lf.servedDistricts != null ? lf.servedDistricts
      : (state.districts || []).filter((d) => d.connected).length;
    const byTech = { fiber: 0, cellular: 0, fwa: 0, wifi: 0, satellite: 0 };
    for (const d of (state.districts || [])) {
      const td = d.techDemand || {};
      const totalServed = TECH_KEYS.reduce((s, t) => s + ((td[t] && td[t].served) || 0), 0);
      for (const t of TECH_KEYS) {
        byTech[t] += Math.round((d.subscribers || 0) * (((td[t] && td[t].served) || 0) / Math.max(1, totalServed)));
      }
    }
    state.history.push({
      day,
      cash: state.cash,
      revenue: state.incomePerDay || 0,
      subs: lf.totalSubscribers || 0,
      joins: lf.joins || 0,
      leaves: lf.leaves || 0,
      sat: state.satisfaction || 0,
      cov: (state.districts || []).length ? Math.round(100 * servedDistricts / state.districts.length) : 0,
      byTech,
    });
    if (state.history.length > 400) state.history.splice(0, state.history.length - 400);
  }

  function tick(state, dtDays) {
    dtDays = (dtDays === undefined || dtDays === null) ? 1 : dtDays;
    if (state.paused) return { events: [], problems: state.problems || [] };
    state.day += dtDays;

    // تایمر ساخت و تعمیر (سرعتشان به تکنسین‌های میدانی بستگی دارد)
    const fxTick = staffEffects(state);
    for (const n of state.nodes) {
      if (n.status === 'building') {
        n.buildTimer -= dtDays * fxTick.buildSpeed;
        if (n.buildTimer <= 0) {
          n.buildTimer = 0; n.status = 'active';
          log(state, 'ساخت «' + (n.name || 'گره') + '» تمام شد؛ برای سرویس باید به شبکه وصل شود.', 'build');
        }
      } else if (n.status === 'repairing') {
        n.repairWork = (n.repairWork || 0) - dtDays * fxTick.repairSpeed;
        if (n.repairWork <= 0) {
          n.repairWork = 0; n.status = 'active'; n.health = n.repairHealth || 85;
          log(state, 'تعمیر «' + (n.name || 'گره') + '» تمام شد و به شبکه برگشت.', 'repair');
        }
      } else if (n.status === 'upgrading') {
        n.upgradeWork = (n.upgradeWork || 0) - dtDays * fxTick.buildSpeed;
        if (n.upgradeWork <= 0) {
          n.upgradeWork = 0;
          n.level = clamp((n.level || 1) + 1, 1, MAX_LEVEL);
          applyNodeLevel(n);
          n.status = n._preUpgradeStatus || 'active';
          delete n._preUpgradeStatus;
          log(state, 'ارتقای «' + (n.name || 'گره') + '» به سطح ' + n.level + ' تمام شد؛ ظرفیت جدید: ' + n.capacity + ' Mbps.', 'build');
        }
      }
    }
    for (const l of state.links) {
      if (l.status === 'repairing') {
        l.repairWork = (l.repairWork || 0) - dtDays * fxTick.repairSpeed;
        if (l.repairWork <= 0) {
          l.repairWork = 0; l.status = 'active';
          log(state, 'تعمیر لینک ' + mediumFa(l.medium) + ' تمام شد.', 'repair');
        }
      }
    }
    // انشعاب‌های فیبر در حال نصب (سرعت تکنسین‌ها)
    for (const fd of (state.fiberDrops || [])) {
      if (fd.status === 'building') {
        fd.work = (fd.work || 0) - dtDays * fxTick.buildSpeed;
        if (fd.work <= 0) {
          fd.work = 0; fd.status = 'active';
          log(state, 'انشعاب فیبر یک ساختمان فعال شد.', 'build');
        }
      }
    }

    // خرابی‌های تصادفی کوچک (هسته و دروازه در مرکز داده محافظت‌شده‌اند)
    // سامانه‌های برق (دستهٔ power) از گره‌های نزدیک محافظت می‌کنند: خرابی کمتر، فرسودگی کندتر
    const isHQ = (n) => n && (n.type === 'core_router' || n.type === 'internet_gateway');
    const powerNodes = state.nodes.filter((n) => nodeCategory(n) === 'power' && isUsableNode(n));
    const isProtected = (n) => powerNodes.some((p) => p.id !== n.id && dist(n.x, n.y, p.x, p.y) <= (p.radius || 0));
    for (const n of state.nodes) {
      if (isHQ(n)) continue;
      const prot = isProtected(n);
      if (n.status === 'active' && rand(state) < 0.0004 * dtDays * (prot ? 0.3 : 1)) {
        n.status = 'failed'; n.health = 0;
        log(state, 'گره «' + (n.name || 'نامشخص') + '» خراب شد.', 'error');
      } else if (n.status === 'active') {
        n.health = clamp(n.health - 0.02 * dtDays * (prot ? 0.5 : 1), 10, 100);
      }
    }
    for (const l of state.links) {
      if (isHQ(nodeById(state, l.from)) && isHQ(nodeById(state, l.to))) continue;
      if (l.status === 'active' && rand(state) < 0.0002 * dtDays) {
        l.status = 'cut';
        log(state, 'یک لینک ' + mediumFa(l.medium) + ' قطع شد.', 'error');
      }
    }

    // آب‌وهوا: قرعه‌کشی دوره‌ای + خرابی تصادفی در طوفان
    rollWeather(state);
    if (state.weather && state.weather.kind === 'storm' && rand2(state) < 0.002 * dtDays) {
      const wireless = state.nodes.filter((n) => isAccessNode(n) && isUsableNode(n) && ['cellular', 'fwa', 'wifi'].includes(techOfNode(n.type)));
      if (wireless.length) {
        const victim = wireless[Math.floor(rand2(state) * wireless.length)];
        victim.status = 'failed'; victim.health = 0;
        log(state, 'طوفان به گره «' + (victim.name || 'نامشخص') + '» آسیب زد و از کار افتاد.', 'error');
      }
    }

    // کمپین‌ها (هزینهٔ روزانه و انقضا) و ماهواره‌ها قبل از جریان ترافیک
    tickCampaigns(state, dtDays);
    tickSatellites(state, dtDays);

    // رویدادها + failover خودکار
    const events = rollEvents(state, dtDays);
    if (state.links.some((l) => l.status === 'cut')) failover(state);

    // جریان ترافیک (روزانه: با میانگین ضریب تقاضای ۲۴ ساعت)
    computeFlow(state, { dailyAvg: true });

    // مشترکان فردی، پیشنهاد قرارداد سازمانی و تاریخچهٔ روزانه
    spawnIndividuals(state, dtDays);
    evaluateIndividuals(state);
    maybeGenerateContractOffer(state, dtDays);
    pushHistory(state);

    // درآمد فروش اینترنت: هر روز به‌صورت روزانه به نقدینگی اضافه می‌شود (نه فقط پایان ماه)
    const dailyRevenue = Math.round(((state.lastFlow && state.lastFlow.monthlyRevenue) || 0) / 30 * dtDays);
    if (dailyRevenue > 0) {
      state.cash += dailyRevenue;
      state.totalRevenue += dailyRevenue;
      state.monthRevenue = (state.monthRevenue || 0) + dailyRevenue;
    }

    // رشد تدریجی شهر: ساختمان‌های جدید در مناطق
    growCity(state, dtDays);

    // اندازهٔ پویای مناطق بر اساس مشترکان + ادغام مناطق مجاور پرمشترک
    updateDistrictSizes(state, dtDays);

    // حساب ماهانه (هر ۳۰ روز): فقط هزینه‌ها کسر می‌شوند؛ درآمد روزانه قبلاً واریز شده است
    if (state.day - state.lastMonthDay >= 30) {
      state.lastMonthDay += 30;
      let revenue = state.monthRevenue || 0;
      state.monthRevenue = 0;
      let costs = 0;
      const hasConstellation = constellationCapacity(state) > 0;
      for (const n of state.nodes) {
        if (n.status === 'building') continue;
        const eq = getEq(n.type);
        if (!eq) continue;
        const isSatTerm = n.type === 'sat_terminal_leo' || n.type === 'sat_terminal_geo';
        costs += (eq.monthlyCost || 0) * (isSatTerm && hasConstellation ? 0.3 : 1);
      }
      for (const s of (state.satellites || [])) if (s.status === 'active') costs += s.monthlyCost || 0;
      for (const st of state.staff) costs += st.salary || 0;

      // قراردادهای سازمانی: واریز ماهانه + جریمهٔ نقض SLA بر اساس میانگین کیفیت ماه
      for (const c of (state.contracts || [])) {
        if (c.status !== 'active') continue;
        state.cash += c.priceMonthly || 0;
        state.totalRevenue += c.priceMonthly || 0;
        revenue += c.priceMonthly || 0;
        const d = (state.districts || []).find((x) => x.id === c.districtId);
        const avgQos = d && d._qosDays ? (d._qosAcc / d._qosDays) * 100 : 100;
        if (avgQos < (c.sla || 0)) {
          const penalty = Math.round((c.priceMonthly || 0) * 0.3);
          state.cash -= penalty;
          c.breaches = (c.breaches || 0) + 1;
          if (d) d.satisfaction = clamp(d.satisfaction - 5, 0, 100);
          log(state, 'قرارداد «' + c.orgName + '»: کیفیت ماه (' + Math.round(avgQos) + '٪) از SLA (' + c.sla + '٪) کمتر بود؛ جریمه ' + penalty + '.', 'warn');
        }
        c.monthsLeft = (c.monthsLeft || 0) - 1;
        if (c.monthsLeft <= 0) {
          c.status = 'expired';
          state.counters.contractsDone = (state.counters.contractsDone || 0) + 1;
          log(state, 'قرارداد «' + c.orgName + '» به پایان رسید.', 'finance');
        }
      }
      for (const d of (state.districts || [])) { d._qosAcc = 0; d._qosDays = 0; }

      state.cash -= costs;
      state.totalCosts += costs;
      state.lastMonthlyProfit = revenue - costs;
      if (state.lastMonthlyProfit > 0) state.counters.profitMonths = (state.counters.profitMonths || 0) + 1;
      if (state.cash < 0) { state.debt += -state.cash; state.cash = 0; }
      state.loan = state.debt;
      log(state, 'پایان ماه: درآمد ' + revenue + '، هزینه ' + costs + '، سود ' + (revenue - costs) + '.', 'finance');
    }

    updateTutorial(state);
    checkMissions(state);
    checkAchievements(state);
    state.problems = buildProblems(state);
    return { events, problems: state.problems };
  }

  // ---------- باز کردن فناوری ----------
  function unlockTech(state, techId) {
    const tech = getTech(techId);
    if (!tech) return false;
    if ((state.techsUnlocked || []).includes(techId)) return false;
    const reqs = tech.requires || [];
    if (!reqs.every((r) => state.techsUnlocked.includes(r))) {
      log(state, 'پیش‌نیاز فناوری «' + tech.name + '» کامل نیست.', 'error');
      return false;
    }
    if (state.cash < (tech.cost || 0)) {
      log(state, 'بودجه کافی برای تحقیق «' + tech.name + '» نیست.', 'error');
      return false;
    }
    state.cash -= tech.cost || 0;
    state.techsUnlocked.push(techId);
    log(state, 'فناوری «' + tech.name + '» باز شد.', 'tech');
    return true;
  }

  // ---------- عملیات کمکی برای UI ----------
  function demolishNode(state, id) {
    const n = nodeById(state, id);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    const eq = getEq(n.type);
    const refund = eq ? Math.round(eq.cost * 0.5) : 0; // بازپرداخت ۵۰٪ هزینهٔ ساخت
    state.nodes = state.nodes.filter((x) => x.id !== id);
    state.links = state.links.filter((l) => l.from !== id && l.to !== id);
    state.fiberDrops = (state.fiberDrops || []).filter((x) => x.nodeId !== id);
    state.cash += refund;
    log(state, 'گره «' + (n.name || 'نامشخص') + '» حذف شد. بازگشت: ' + refund, 'build');
    refreshConnectivity(state);
    return { ok: true, refund };
  }

  // مکان معتبر برای نصب/جابه‌جایی: داخل نقشه، بیرون رودخانه و بیرون ساختمان‌ها
  function isValidPlacement(state, x, y) {
    const W = (DATA.world && DATA.world.width) || 7200;
    const H = (DATA.world && DATA.world.height) || 5400;
    if (x < 20 || y < 20 || x > W - 20 || y > H - 20) return { ok: false, error: 'این نقطه بیرون از نقشه است.' };
    const river = state.map && state.map.river;
    if (river && river.length > 1) {
      for (let i = 0; i < river.length - 1; i++) {
        const a = river[i], b = river[i + 1];
        const tt = clamp(((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1), 0, 1);
        if (dist(x, y, a.x + tt * (b.x - a.x), a.y + tt * (b.y - a.y)) < 35) return { ok: false, error: 'نمی‌توان روی رودخانه دستگاه نصب کرد.' };
      }
    }
    for (const b of (state.buildings || [])) {
      if (x >= b.x - 4 && x <= b.x + (b.w || 26) + 4 && y >= b.y - 4 && y <= b.y + (b.h || 20) + 4) {
        return { ok: false, error: 'این نقطه روی یک ساختمان است.' };
      }
    }
    return { ok: true };
  }

  // جابه‌جایی گره: هزینه ۱۰٪ هزینهٔ ساخت + توقف سرویس به اندازهٔ ۳۰٪ زمان ساخت (لینک‌ها حفظ می‌شوند)
  function moveNode(state, id, x, y) {
    const n = nodeById(state, id);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    if (n.status === 'building') return { ok: false, error: 'این گره در حال ساخت است و فعلاً قابل جابه‌جایی نیست.' };
    if (n.status === 'repairing') return { ok: false, error: 'این گره در حال تعمیر است و فعلاً قابل جابه‌جایی نیست.' };
    const valid = isValidPlacement(state, x, y);
    if (!valid.ok) return valid;
    const eq = getEq(n.type);
    const cost = Math.max(500, Math.round((eq ? eq.cost : 5000) * 0.1));
    if (state.cash < cost) return { ok: false, error: 'بودجه کافی برای جابه‌جایی نیست. هزینه: ' + cost };
    state.cash -= cost;
    state.totalCosts += cost;
    n.x = Math.round(x); n.y = Math.round(y);
    n.status = 'building';
    n.buildTimer = Math.max(1, Math.round((eq ? eq.buildDays || 1 : 1) * 0.3));
    n.connected = false;
    log(state, 'جابه‌جایی «' + (n.name || 'گره') + '» شروع شد؛ تا پایان نصب مجدد سرویس نمی‌دهد.', 'build');
    refreshConnectivity(state);
    return { ok: true, cost, days: n.buildTimer };
  }

  // ---------- ارتقای گره‌ها (افزایش پهنای باند) ----------
  // سطح ۱ تا ۵؛ هر سطح ظرفیت را ×۱٫۵ می‌کند و شعاع گره‌های دسترسی را ۸٪ بیشتر.
  // هزینهٔ ارتقا = ۰٫۶ × هزینهٔ پایه × سطح فعلی؛ زمان = نصف زمان ساخت × سطح (با سرعت تکنسین‌ها).
  // گره در طول ارتقا آفلاین است (وضعیت upgrading).
  const MAX_LEVEL = 5;
  function levelCapacity(base, level) { return Math.round((base || 0) * Math.pow(1.5, (level || 1) - 1)); }
  function levelRadius(base, level) { return Math.round((base || 0) * (1 + 0.08 * ((level || 1) - 1))); }
  function applyNodeLevel(n) {
    if (!n) return;
    const lvl = clamp(n.level || 1, 1, MAX_LEVEL);
    n.level = lvl;
    if (n.baseCapacity != null) n.capacity = levelCapacity(n.baseCapacity, lvl);
    if (n.baseRadius != null && n.baseRadius > 0) n.radius = levelRadius(n.baseRadius, lvl);
  }
  function upgradeInfo(state, nodeId) {
    const n = nodeById(state, nodeId);
    if (!n) return null;
    const eq = getEq(n.type);
    if (!eq) return null;
    const lvl = n.level || 1;
    if (lvl >= MAX_LEVEL) return { node: n, level: lvl, maxLevel: MAX_LEVEL, maxed: true };
    const cost = Math.round((eq.cost || 0) * 0.6 * lvl);
    const workDays = Math.max(1, Math.round((eq.buildDays || 1) * 0.5 * lvl));
    return {
      node: n, level: lvl, maxLevel: MAX_LEVEL, maxed: false, cost, workDays,
      nextCapacity: levelCapacity(n.baseCapacity != null ? n.baseCapacity : (eq.capacity || 0), lvl + 1),
      nextRadius: levelRadius(n.baseRadius != null ? n.baseRadius : (eq.radius || 0), lvl + 1),
      canAfford: (state.cash || 0) >= cost,
      busy: n.status === 'building' || n.status === 'repairing' || n.status === 'upgrading',
    };
  }
  function upgradeNode(state, nodeId) {
    const info = upgradeInfo(state, nodeId);
    if (!info) return { ok: false, error: 'گره پیدا نشد.' };
    const n = info.node;
    if (info.maxed) return { ok: false, error: 'این گره به حداکثر سطح ارتقا رسیده است.' };
    if (info.busy) return { ok: false, error: 'گره در حال ساخت/تعمیر/ارتقاست و فعلاً قابل ارتقا نیست.' };
    if (!info.canAfford) return { ok: false, error: 'بودجه کافی برای ارتقا نیست.' };
    state.cash -= info.cost;
    state.totalCosts = (state.totalCosts || 0) + info.cost;
    n._preUpgradeStatus = n.status;
    n.status = 'upgrading';
    n.upgradeWork = info.workDays;
    log(state, 'ارتقای «' + (n.name || 'گره') + '» به سطح ' + (info.level + 1) + ' شروع شد؛ تا پایان ارتقا آفلاین است.', 'build');
    refreshConnectivity(state);
    return { ok: true, cost: info.cost, days: info.workDays, level: info.level + 1 };
  }

  function hireStaff(state, roleId) {
    const role = (DATA.staffRoles || []).find((r) => r.id === roleId);
    if (!role) return { ok: false, error: 'نقش نامعتبر است.' };
    const member = {
      id: 's' + (++state.counters.staff), role: role.id,
      name: role.name, salary: role.salary, skill: role.skill,
    };
    state.staff.push(member);
    log(state, '«' + role.name + '» استخدام شد.', 'staff');
    return { ok: true, staff: member };
  }

  function fireStaff(state, roleId) {
    const idx = (state.staff || []).map((s) => s.role).lastIndexOf(roleId);
    if (idx < 0) return { ok: false, error: 'کسی با این نقش استخدام نشده است.' };
    const member = state.staff.splice(idx, 1)[0];
    log(state, '«' + (member.name || roleId) + '» اخراج شد.', 'staff');
    return { ok: true, staff: member };
  }

  function updatePackage(state, pkgId, changes) {
    changes = changes || {};
    const pkg = (state.packages || []).find((p) => p.id === pkgId);
    if (!pkg) return { ok: false, error: 'بسته پیدا نشد.' };
    if (changes.speed !== undefined) pkg.speedMbps = changes.speed;
    if (changes.speedMbps !== undefined) pkg.speedMbps = changes.speedMbps;
    if (changes.price !== undefined) pkg.price = changes.price;
    if (changes.name !== undefined) pkg.name = changes.name;
    log(state, 'بسته «' + pkg.name + '» به‌روزرسانی شد.', 'finance');
    return { ok: true, package: pkg };
  }

  function nearestCoreNode(state, fromNode) {
    let best = null, bestD = Infinity;
    for (const n of state.nodes) {
      if (n.id === fromNode.id) continue;
      if (!['core_router', 'aggregation', 'router', 'switch'].includes(n.type)) continue;
      if (n.status === 'failed' || n.status === 'building') continue;
      const d = dist(fromNode.x, fromNode.y, n.x, n.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  function applyFix(state, prob, fix) {
    if (!prob || !fix || !fix.action) return { ok: false, error: 'گزینه رفع نامعتبر است.' };
    const fail = (error) => ({ ok: false, error });
    switch (fix.action) {
      case 'repair': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        if (n.status === 'repairing') return fail('این گره در حال تعمیر است.');
        const eq = getEq(n.type);
        const cost = eq ? Math.round(eq.cost * 0.1) : 500;
        if (state.cash < cost) return fail('بودجه کافی برای تعمیر نیست.');
        state.cash -= cost; n.status = 'repairing'; n.repairWork = 3; n.repairHealth = 85;
        log(state, 'تعمیر «' + (n.name || 'نامشخص') + '» شروع شد.', 'repair');
        return { ok: true, cost };
      }
      case 'replace': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        if (n.status === 'repairing') return fail('این گره در حال تعمیر است.');
        const eq = getEq(n.type);
        const cost = eq ? Math.round(eq.cost * 0.25) : 1000;
        if (state.cash < cost) return fail('بودجه کافی برای جایگزینی نیست.');
        state.cash -= cost; n.status = 'repairing'; n.repairWork = 2; n.repairHealth = 100;
        log(state, 'جایگزینی «' + (n.name || 'نامشخص') + '» شروع شد.', 'repair');
        return { ok: true, cost };
      }
      case 'repair_link': {
        const l = linkById(state, fix.linkId || prob.linkId);
        if (!l) return fail('لینک پیدا نشد.');
        if (l.status === 'repairing') return fail('این لینک در حال تعمیر است.');
        const cost = 800;
        if (state.cash < cost) return fail('بودجه کافی برای تعمیر لینک نیست.');
        state.cash -= cost; l.status = 'repairing'; l.repairWork = 2;
        log(state, 'تعمیر لینک ' + mediumFa(l.medium) + ' شروع شد.', 'repair');
        return { ok: true, cost };
      }
      case 'connect': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        const target = nearestCoreNode(state, n);
        if (!target) return fail('گره هسته‌ای برای اتصال نیست.');
        const l = connect(state, n.id, target.id, (fix.medium && fix.medium[0]) || 'fiber');
        return l ? { ok: true, link: l } : fail('اتصال برقرار نشد.');
      }
      case 'build_backup': {
        const l = linkById(state, fix.linkId || prob.linkId);
        if (!l) return fail('لینک پیدا نشد.');
        const a = nodeById(state, l.from);
        const target = a ? nearestCoreNode(state, a) : null;
        if (!target) return fail('مسیر پشتیبان ممکن نیست.');
        const nl = connect(state, a.id, target.id, 'ptp', { isBackup: true });
        return nl ? { ok: true, link: nl } : fail('ساخت لینک پشتیبان ناموفق بود.');
      }
      case 'failover': {
        return failover(state) ? { ok: true } : fail('مسیر پشتیبان در دسترس نیست.');
      }
      case 'build_access':
      case 'build_satellite': {
        const d = state.districts.find((x) => x.id === (fix.districtId || prob.districtId));
        if (!d) return fail('منطقه پیدا نشد.');
        const eqId = fix.action === 'build_satellite' ? 'sat_terminal_leo'
          : ((fix.equipment || []).find((e) => isUnlocked(state, e)) || 'cell_3g');
        const n = buildNode(state, eqId, d.x, d.y);
        return n ? { ok: true, node: n } : fail('ساخت گره ناموفق بود (بودجه یا فناوری).');
      }
      case 'upgrade': {
        const d = state.districts.find((x) => x.id === (fix.districtId || prob.districtId));
        if (!d) return fail('منطقه پیدا نشد.');
        const srv = servingNodeForDistrict(state, d);
        if (!srv) return fail('گره‌ای برای ارتقا نیست.');
        const cost = 15000;
        if (state.cash < cost) return fail('بودجه کافی برای ارتقا نیست.');
        state.cash -= cost; srv.capacity = Math.round(srv.capacity * 1.6);
        log(state, 'ظرفیت گره «' + (srv.name || 'نامشخص') + '» ارتقا یافت.', 'build');
        return { ok: true, cost };
      }
      case 'upgrade_link': {
        const hot = state.links.filter((l) => l.status === 'congested');
        if (!hot.length) return fail('لینک پرمصرفی نیست.');
        const cost = 6000 * hot.length;
        if (state.cash < cost) return fail('بودجه کافی برای ارتقای لینک نیست.');
        state.cash -= cost;
        hot.forEach((l) => { l.capacity = Math.round(l.capacity * 2); l.status = 'active'; });
        log(state, hot.length + ' لینک پرمصرف ارتقا یافت.', 'build');
        return { ok: true, cost };
      }
      default:
        return fail('این رفع خودکار پشتیبانی نمی‌شود.');
    }
  }

  // ---------- ذخیره / بارگذاری ----------
  function saveGame(state) { return JSON.stringify(state); }
  function loadGame(json) {
    const state = JSON.parse(json);
    if (!state || !Array.isArray(state.nodes) || !Array.isArray(state.links)) {
      throw new Error('فایل ذخیره نامعتبر است.');
    }
    // تکمیل فیلدهای نسخه‌های قدیمی ذخیره (رشد شهر + درآمد روزانه)
    if (!Array.isArray(state.buildings)) state.buildings = (DATA.buildings || []).slice();
    if (!state.counters) state.counters = { node: 0, link: 0, staff: 0, problem: 0 };
    if (!state.counters.building) state.counters.building = state.buildings.length;
    if (state.monthRevenue == null) state.monthRevenue = 0;
    // فیلدهای جدید: ساعت، آب‌وهوا، دستاوردها، افراد، قراردادها، کمپین‌ها، ماهواره‌ها، تاریخچه
    if (state.hour == null) state.hour = 10;
    if (state.pendingDays == null) state.pendingDays = 0;
    if (!state.weather) state.weather = { kind: 'clear', untilDay: Math.floor(state.day || 1) + 1 };
    if (!state.achievements) state.achievements = {};
    if (!Array.isArray(state.newAchievements)) state.newAchievements = [];
    if (!Array.isArray(state.individuals)) state.individuals = [];
    if (!Array.isArray(state.contracts)) state.contracts = [];
    if (!Array.isArray(state.contractOffers)) state.contractOffers = [];
    if (!Array.isArray(state.campaigns)) state.campaigns = [];
    if (!Array.isArray(state.satellites)) state.satellites = [];
    if (!Array.isArray(state.history)) state.history = [];
    for (const key of ['individual', 'contract', 'campaign', 'satellite', 'built', 'contractsDone', 'campaignsRun', 'profitMonths']) {
      if (state.counters[key] == null) state.counters[key] = 0;
    }
    for (const n of state.nodes) {
      if (n.interference == null) n.interference = 0;
      if (n.channel === undefined) n.channel = null;
      // سازگاری ذخیره‌های قدیمی: تجهیز حذف‌شده از کاتالوگ ساده‌شده → نزدیک‌ترین معادل کلی
      if (!getEq(n.type)) {
        const mapped = (DATA.legacyEquipmentMap || {})[n.type] || 'wifi_ap';
        const eqm = getEq(mapped);
        if (eqm) {
          n.type = mapped;
          n.name = eqm.name;
          n.baseCapacity = eqm.capacity || 0;
          n.baseRadius = eqm.radius || 0;
        }
      }
      // سطح ارتقا: ذخیره‌های قدیمی سطح ۱
      if (n.level == null) n.level = 1;
      const eqN = getEq(n.type);
      if (n.baseCapacity == null) n.baseCapacity = eqN ? (eqN.capacity || 0) : (n.capacity || 0);
      if (n.baseRadius == null) n.baseRadius = eqN ? (eqN.radius || 0) : (n.radius || 0);
      applyNodeLevel(n);
      if (n.channel == null && channelCountFor(n) > 0) n.channel = leastInterferedChannel(state, n);
    }
    const capMult = (DATA.growth && DATA.growth.capMultiplier) || {};
    if (!state.scattered) state.scattered = { subscribers: 0, demand: 0, servedDemand: 0, qos: 0, satisfaction: 0, revenue: 0, potentialSubs: 0, buildingCount: 0, coveredCount: 0 };
    for (const d of (state.districts || [])) {
      if (!d.baseRadius) d.baseRadius = d.radius;
      if (d.usageMult == null) d.usageMult = 1;
      if (d.potentialQos == null) d.potentialQos = 0;
      if (d._qosAcc == null) d._qosAcc = 0;
      if (d._qosDays == null) d._qosDays = 0;
      if (d.avgLatency == null) d.avgLatency = 0;
      if (d.perSubMbps == null) d.perSubMbps = 0;
      if (!d.buildingCap) {
        const initial = (DATA.buildings || []).filter((b) => b.districtId === d.id).length;
        d.buildingCap = Math.max(1, Math.round(initial * (capMult[d.type] || 1.5)));
      }
      if (!d.techDemand) {
        const srv = (state.nodes || []).filter((n) =>
          isAccessNode(n) && n.connected && isUsableNode(n) &&
          dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + d.radius * 0.6);
        d.techDemand = computeTechDemand(d, srv, 1);
      }
    }
    // بسته‌های ذخیره‌های قدیمی: سرعت پیش‌فرض متناسب با قیمت (صفر/خالی نماند)
    const pkgDefaults = {};
    for (const p of (DATA.packageList || DATA.packages || [])) pkgDefaults[p.id] = p;
    if (!Array.isArray(state.packages) || !state.packages.length) {
      state.packages = JSON.parse(JSON.stringify(DATA.packageList || DATA.packages || []));
    }
    for (const p of state.packages) {
      if (!(p.speedMbps > 0)) {
        if (p.speed > 0) p.speedMbps = p.speed; // فیلد قدیمی
        else if (pkgDefaults[p.id]) p.speedMbps = pkgDefaults[p.id].speedMbps;
      }
      if (p.price == null && pkgDefaults[p.id]) p.price = pkgDefaults[p.id].price;
      if (p.kind == null && pkgDefaults[p.id]) p.kind = pkgDefaults[p.id].kind;
      if (p.expectFa == null && pkgDefaults[p.id]) p.expectFa = pkgDefaults[p.id].expectFa;
    }
    // ذخیره‌های قدیمی ممکن است مناطق هم‌پوشان داشته باشند: شعاع‌ها یک‌بار با همسایه‌ها محدود شوند
    for (const d of (state.districts || [])) {
      d.radius = Math.round(capRadiusByNeighbors(state, d, d.radius));
    }
    // انشعاب فیبر دستی: ذخیره‌های قدیمی که فیبر خودکار داشتند، انشعاب فعال می‌گیرند تا شبکه‌شان نشکند
    if (!Array.isArray(state.fiberDrops)) {
      state.fiberDrops = [];
      if (state.counters.fiberDrop == null) state.counters.fiberDrop = 0;
      refreshConnectivity(state); // وضعیت اتصال تازه برای تشخیص پوشش فعلی فیبر
      const ftths = (state.nodes || []).filter((n) => n.type === 'ftth' && n.connected && isUsableNode(n));
      if (ftths.length) {
        const nearestFtth = (x, y) => {
          let best = null, bd = Infinity;
          for (const n of ftths) { const dd = dist(x, y, n.x, n.y); if (dd < bd) { bd = dd; best = n; } }
          return best;
        };
        // مناطق: اگر مرکز منطقه زیر پوشش FTTH بود، همهٔ ساختمان‌هایش انشعاب می‌گیرند (حفظ سرویس قبلی)
        const coveredDistricts = new Set();
        for (const d of (state.districts || [])) {
          if (ftths.some((n) => dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + d.radius * 0.6 && inWedge(n, d.x, d.y))) coveredDistricts.add(d.id);
        }
        for (const b of (state.buildings || [])) {
          const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
          const inCoveredDistrict = b.districtId && coveredDistricts.has(b.districtId);
          const selfCovered = !b.districtId && ftths.some((n) => dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy));
          if (inCoveredDistrict || selfCovered) {
            const src = nearestFtth(cx, cy);
            if (src) state.fiberDrops.push({ id: 'fd' + (++state.counters.fiberDrop), buildingId: b.id, nodeId: src.id, status: 'active', work: 0 });
          }
        }
      }
      refreshConnectivity(state);
    }
    return state;
  }

  // ---------- آمار مشترکان (تجمیعی + نمونهٔ فردی) ----------
  // همهٔ اعداد از همان state خوانده می‌شوند تا با هم سازگار باشند:
  // مجموع مناطق + پراکنده‌ها = کل؛ مشترکان فردی نمونه‌ای از همین مجموع‌اند (≤ کل).
  function subscriberStats(state) {
    const sc = state.scattered || { subscribers: 0, potentialSubs: 0, revenue: 0 };
    const districts = (state.districts || []).map((d) => {
      const maxSubs = Math.max(1, Math.floor((d.population || 0) * 0.35));
      const pkg = districtPackage(state, d);
      return {
        id: d.id, name: d.name, subscribers: d.subscribers || 0,
        population: d.population || 0, maxSubs,
        penetration: Math.round(1000 * (d.subscribers || 0) / Math.max(1, d.population || 0)) / 10,
        qos: d.qos || 0, satisfaction: Math.round(d.satisfaction || 0),
        revenue: d.revenue || 0, packageId: pkg ? pkg.id : 'home',
        packageName: pkg ? pkg.name : 'خانگی',
        individuals: (state.individuals || []).filter((p) => String(p.districtId) === String(d.id)).length,
        individualsSubscribed: (state.individuals || []).filter((p) => String(p.districtId) === String(d.id) && p.status === 'subscribed').length,
      };
    });
    const byPackage = {};
    for (const row of districts) byPackage[row.packageId] = (byPackage[row.packageId] || 0) + row.subscribers;
    byPackage.home = (byPackage.home || 0) + (sc.subscribers || 0);
    const lf = state.lastFlow || {};
    const indiv = state.individuals || [];
    return {
      total: districts.reduce((s, r) => s + r.subscribers, 0) + (sc.subscribers || 0),
      scatteredSubscribers: sc.subscribers || 0,
      scatteredPotential: sc.potentialSubs || 0,
      districts,
      byPackage,
      joins: lf.joins || 0,
      leaves: lf.leaves || 0,
      monthlyRevenue: lf.monthlyRevenue || 0,
      individualsTotal: indiv.length,
      individualsSubscribed: indiv.filter((p) => p.status === 'subscribed').length,
      individualCap: INDIVIDUAL_CAP,
    };
  }

  // وضعیت سرویس یک ساختمان: پوشش، اتصال زیرساخت، مشترکان فردی ساکن
  function buildingServiceStatus(state, buildingId) {
    const b = (state.buildings || []).find((x) => String(x.id) === String(buildingId));
    if (!b) return { found: false, covered: false, connected: false, individuals: 0, individualsSubscribed: 0 };
    const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
    let covered = false, connected = false;
    for (const n of (state.nodes || [])) {
      if (!isAccessNode(n) || !isUsableNode(n)) continue;
      if (dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy)) {
        covered = true;
        if (n.connected) connected = true;
      }
    }
    const list = (state.individuals || []).filter((p) => String(p.buildingId) === String(b.id));
    return {
      found: true, covered, connected,
      individuals: list.length,
      individualsSubscribed: list.filter((p) => p.status === 'subscribed').length,
    };
  }

  // ---------- API ----------
  const GameSim = {
    newGame, buildNode, connect, tracePath, computeFlow, tick, growCity,
    failover, saveGame, loadGame, unlockTech, isUnlocked, traceSatellitePath,
    // عملیات کمکی UI
    demolishNode, moveNode, isValidPlacement, hireStaff, fireStaff, staffEffects, updatePackage, applyFix,
    upgradeNode, upgradeInfo,
    refreshConnectivity, connectBuildingFiber, disconnectBuildingFiber, buildingFiberStatus, fiberDropFor,
    disconnectLink, linkDisconnectImpact, linksOfNode,
    subscriberStats, buildingServiceStatus, individualTargetFor, CONCURRENCY, INDIVIDUAL_CAP,
    buildingAttenuation, ptpLosFactor,
    // کمکی‌ها
    nodeById, linkById, getEq, getTech, rand, ACCESS_TYPES, computeTechDemand, TECH_KEYS, speedTestAt, aggregateSpeedAt,
    isAccessNode, nodeCategory, updateDistrictSizes, mergeDistricts, desiredRadius,
    // ویژگی‌های جدید: دستاورد، کانال، جهت، سیگنال، پیشنهاد مکان، ماهواره، قرارداد، کمپین، ساعت و فصل
    checkAchievements, achievementProgress, setNodeChannel, autoChannel, setNodeDirection,
    signalAt, suggestPlacements, launchSatellite, constellationCapacity,
    negotiateContract, startCampaign, stopCampaign, clockTick, demandFactorAtHour, seasonOf,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameSim;
  if (root) root.GameSim = GameSim;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
