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
  function getModule(moduleId) {
    if (!DATA) return null;
    const m = DATA.modules;
    if (!m) return null;
    if (m[moduleId] && m[moduleId].id === moduleId) return m[moduleId];
    if (Array.isArray(m)) return m.find((x) => x.id === moduleId) || null;
    return m[moduleId] || null;
  }

  // ---------- خط زمانی تاریخی ----------
  // بازی از ۱۹۹۱ شروع می‌شود؛ هر «daysPerYear» روزِ بازی یک سال جلو می‌رود.
  // سال از روز مشتق می‌شود (در ذخیره هم از روی روز ساخته می‌شود) تا هیچ ذخیره‌ای نشکند.
  const TL = (DATA && DATA.timeline) || { startYear: 1991, daysPerYear: 10, eras: [] };
  function yearOf(state) {
    const day = Math.max(1, Math.floor((state && state.day) || 1));
    return TL.startYear + Math.floor((day - 1) / (TL.daysPerYear || 10));
  }
  function eraOf(state) {
    const y = yearOf(state);
    let cur = (TL.eras || [])[0] || { year: TL.startYear, name: '', desc: '' };
    for (const e of (TL.eras || [])) if (y >= e.year) cur = e;
    return cur;
  }
  // دوران جاری را در state نگه می‌داریم تا ورود به دوران جدید فقط یک بار اعلام شود
  function checkEraChange(state) {
    const y = yearOf(state);
    state.year = y;
    const era = eraOf(state);
    if (state.eraYear == null) { state.eraYear = era.year; return null; }
    if (era.year > state.eraYear) {
      state.eraYear = era.year;
      log(state, 'دوران جدید: «' + era.name + '» (سال ' + y + '). ' + (era.desc || ''), 'event');
      return era;
    }
    return null;
  }
  // ضریب دوران برای تقاضای هر فناوری: قبل از دورانش صفر/کم، بعد از آن رشد می‌کند
  function eraTechWeight(state, tech) {
    const y = yearOf(state);
    if (tech === 'fwa') return y >= 2012 ? 1 : 0; // TD-LTE قبل از ۲۰۱۲ تقاضایی ندارد
    if (tech === 'fiber') return y >= 2004 ? 1 : (y >= 1998 ? 0.55 : 0.25); // قبل از FTTH فقط DSL مسی
    return 1; // سلولار از ۱۹۹۱ هست
  }
  // نسل سلولارِ «مورد انتظار» دوران: ماندن روی نسل قدیمی‌تر رضایت را کم می‌کند
  function eraExpectedCellGen(state) {
    const y = yearOf(state);
    if (y >= 2019) return 5;
    if (y >= 2009) return 4;
    if (y >= 2001) return 3;
    return 2;
  }
  function cellGenOf(type) {
    return { cell_2g: 2, cell_3g: 3, cell_4g: 4, cell_5g: 5 }[type] || 0;
  }

  // RNG قطعی (mulberry32) — وضعیت در state.rngState نگه داشته می‌شود
  function rand(state) {
    let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // جریان RNG جدا برای ویژگی‌های جدید (آب‌وهوا، افراد، قرارداد) تا توالی
  // تصادفی سازوکارهای قدیمی (خرابی، رشد شهر، رویدادها) و تست‌های موجود دست‌نخورده بماند
  function rand2(state) {
    if (state.rngState2 == null) state.rngState2 = ((state.seed || 42) ^ 0x9e3779b9) >>> 0;
    let t = (state.rngState2 = (state.rngState2 + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const ACCESS_TYPES = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g', 'ftth', 'street_cabinet', 'cabinet_basic'];
  // مالک گره: بازیکن یا شرکت رقیب (گره‌های رقیب فقط برای نمایش/رقابت‌اند و قابل ویرایش نیستند)
  function ownerOf(n) { return (n && n.owner === 'rival') ? 'rival' : 'player'; }
  function isRivalNode(n) { return ownerOf(n) === 'rival'; }
  const CELL_TYPES = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g'];
  function isCellTower(n) { return !!n && CELL_TYPES.includes(n.type); }

  const OLD_NAME_PREFIXES = [
    ['دکل سلولی 2G آریاتل', 'دکل 2G'], ['دکل سلولی 3G آریاتل', 'دکل 3G'],
    ['دکل سلولی 4G آریاتل', 'دکل 4G'], ['دکل سلولی 5G سیمرغ‌لینک', 'دکل 5G'],
    ['آنتن TD-LTE پارس‌نت', 'دکل 4G'], ['آنتن TD-LTE', 'دکل 4G'],
    ['کابل فیبر نوری پارس‌نت', 'کابل فیبر نوری'], ['کابل مسی آریاتل', 'کابل مسی'],
    ['روتر لبه پارس‌نت', 'روتر لبه'], ['سوئیچ دسترسی پارس‌نت', 'سوئیچ'],
    ['لینک نقطه‌به‌نقطه سیمرغ‌لینک', 'لینک نقطه‌به‌نقطه'],
    ['روتر هسته سیمرغ‌لینک', 'روتر هسته'], ['دروازه اینترنت پارس‌نت', 'دروازه اینترنت'],
    ['گره تجمیع پارس‌نت', 'گره تجمیع'], ['کابینت خیابانی پارس‌نت', 'کابینت خیابانی'],
    ['فیبر تا خانه (FTTH) پارس‌نت', 'فیبر تا خانه (FTTH)'],
    ['برق پشتیبان پارس‌نت', 'برق پشتیبان'], ['ابزار تست شبکه آریاتل', 'ابزار تست شبکه'],
  ];
  const BRAND_STRINGS = ['پارس‌نت', 'آریاتل', 'سیمرغ‌لینک', 'سیمرغ'];
  function simplifyNodeName(n) {
    if (!n) return '';
    let name = n.name || '';
    for (const [oldP, newP] of OLD_NAME_PREFIXES) {
      if (name.indexOf(oldP) === 0) { name = newP + name.slice(oldP.length); break; }
    }
    for (const b of BRAND_STRINGS) name = name.split(b).join('').trim();
    if (!name) { const eq = getEq(n.type); name = eq ? eq.name : (n.type || 'گره'); }
    return name;
  }

  // ---------- ماژول‌ها: نصب یک‌باره + آپگرید سطح‌به‌سطح (بدون محدودیت تعداد، بدون اشغال جا) ----------
  // هر نوع ماژول یک‌بار روی گره نصب و بعد سطح‌به‌سطح قوی‌تر می‌شود؛ در ذخیره به‌صورت شمارش
  // همان شناسه در آرایهٔ modules نگه داشته می‌شود (سطح = تعداد تکرار)، پس ذخیره‌های قبلی
  // با ماژول‌های انباشته خودکار به همان سطح‌ها تبدیل می‌شوند. هزینهٔ رسیدن به سطح L:
  // cost × 1.6^(L-1). سقف سطح برای سلامت بازی: ۱۰ (منبع تغذیه: ۸).
  const MODULE_LEVEL_CAP = 10;
  const POWER_LEVEL_CAP = 8;
  const MODULE_COST_GROWTH = 1.6;
  function nodeModules(n) { return (n && Array.isArray(n.modules)) ? n.modules : []; }
  function hasModule(n, moduleId) { return nodeModules(n).includes(moduleId); }
  function moduleCount(n, moduleId) { return nodeModules(n).filter((m) => m === moduleId).length; }
  function moduleLevel(n, moduleId) { return moduleCount(n, moduleId); }
  // ماژول خراب: اثرش کامل قطع است تا تعمیر شود (تعمیر آنی است)
  function isModuleBroken(n, moduleId) { return !!(n && n.brokenModules && n.brokenModules[moduleId]); }
  function effModuleCount(n, moduleId) { return isModuleBroken(n, moduleId) ? 0 : moduleCount(n, moduleId); }
  function moduleSlots(n) { // فقط برای سازگاری قدیمی؛ دیگر محدودیتی اعمال نمی‌شود
    const eq = n ? getEq(n.type) : null;
    return eq && eq.slots != null ? eq.slots : 0;
  }
  function moduleLevelCap(moduleId) { return moduleId === 'power' ? POWER_LEVEL_CAP : MODULE_LEVEL_CAP; }
  function moduleCostForLevel(m, level) { // هزینهٔ رسیدن از سطح level-1 به level
    if (!m || level < 1) return 0;
    return Math.round((m.cost || 0) * Math.pow(MODULE_COST_GROWTH, level - 1));
  }
  // ظرفیت TD-LTE هر دکلِ دارای ماژول: هر سطح ۶۰۰ مگابیت
  const TDLTE_MODULE_CAPACITY = 600;
  function tdlteCapacity(n) {
    return (isCellTower(n) && (n.type === 'cell_4g' || n.type === 'cell_5g')) ? TDLTE_MODULE_CAPACITY * effModuleCount(n, 'tdlte') : 0;
  }
  // ---------- برق گره: «ماژول منبع تغذیه» مثل بقیهٔ ماژول‌ها سطح دارد ----------
  // توان هر سطح دو برابر سطح قبل است: ۸۰۰، ۱۶۰۰، ۳۲۰۰، ۶۴۰۰… وات. سطح پایه در قیمت ساخت هست.
  function powerWatts(level) { return level <= 0 ? 0 : 800 * Math.pow(2, level - 1); }
  function nodePowerDraw(n) { // مصرف فعلی گره (وات): پایهٔ تجهیز + ماژول‌های سالم (به ازای هر سطح)
    if (!n) return 0;
    const eq = getEq(n.type);
    let draw = (eq && eq.powerDraw) || 0;
    const seen = new Set(nodeModules(n));
    for (const mid of seen) {
      if (mid === 'power') continue;
      const m = getModule(mid);
      if (m) draw += (m.powerDraw || 0) * effModuleCount(n, mid);
    }
    return draw;
  }
  // برق پایهٔ گره (در قیمت ساخت هست): همیشه برقِ خودِ تجهیز را تأمین می‌کند، حتی اگر
  // «ماژول منبع تغذیه» خراب شود؛ ماژول فقط توان اضافه برای ماژول‌های دیگر می‌دهد.
  function basePowerWatts(n) {
    const eq = n ? getEq(n.type) : null;
    return powerWatts(smallestPowerLevelFor((eq && eq.powerDraw) || 0));
  }
  function nodePowerCapacity(n) {
    const base = basePowerWatts(n);
    if (isModuleBroken(n, 'power')) return base;
    return Math.max(base, powerWatts(moduleCount(n, 'power')));
  }
  function nodePowerInfo(n) {
    const draw = nodePowerDraw(n), capacity = nodePowerCapacity(n);
    return { draw, capacity, ok: draw <= capacity, level: moduleCount(n, 'power'), broken: isModuleBroken(n, 'power'), base: basePowerWatts(n) };
  }
  function smallestPowerLevelFor(draw) {
    for (let L = 1; L <= POWER_LEVEL_CAP; L++) if (powerWatts(L) >= draw) return L;
    return POWER_LEVEL_CAP;
  }
  // ضریب ظرفیت «ماژول افزایش ظرفیت» با بازده نزولی: سطح‌های ۱ تا ۳ هرکدام ×۱٫۵،
  // سطح‌های ۴ تا ۶ هرکدام ×۱٫۳ و سطح‌های بالاتر هرکدام ×۱٫۱۵ (سطح ۱۰ ≈ ×۱۱٫۳، نه ×۵۷٫۷).
  function capBoostMult(level) {
    const L = Math.max(0, level || 0);
    return Math.pow(1.5, Math.min(L, 3)) * Math.pow(1.3, Math.max(0, Math.min(L, 6) - 3)) * Math.pow(1.15, Math.max(0, L - 6));
  }
  // اعمال اثر ماژول‌ها روی ظرفیت/شعاع/پورت گره (از پایهٔ تجهیز، نه انباشته؛ ماژول خراب اثر ندارد)
  function applyModules(n) {
    if (!n) return;
    const eq = getEq(n.type);
    const baseCap = n.baseCapacity != null ? n.baseCapacity : (eq ? (eq.capacity || 0) : (n.capacity || 0));
    const baseRad = n.baseRadius != null ? n.baseRadius : (eq ? (eq.radius || 0) : (n.radius || 0));
    n.baseCapacity = baseCap;
    n.baseRadius = baseRad;
    n.capacity = Math.round(baseCap * capBoostMult(effModuleCount(n, 'cap_boost')));
    if (baseRad > 0) n.radius = Math.round(baseRad * Math.pow(1.1, effModuleCount(n, 'range_boost')));
  }
  function moduleEffectText(n, moduleId, level) { // پیش‌نمایش اثر یک سطح مشخص (برای پنل)
    if (moduleId === 'cap_boost') return 'ظرفیت ×' + (Math.round(capBoostMult(level) * 100) / 100);
    if (moduleId === 'range_boost') return 'شعاع ×' + (Math.round(Math.pow(1.1, level) * 100) / 100);
    if (moduleId === 'ports_boost') return 'پورت +' + (24 * level);
    if (moduleId === 'tdlte') return 'ظرفیت TD-LTE: ' + (TDLTE_MODULE_CAPACITY * level) + ' Mbps';
    if (moduleId === 'power') return 'توان ' + powerWatts(level) + ' وات';
    return '';
  }
  function moduleInfo(state, nodeId) {
    const n = nodeById(state, nodeId);
    if (!n) return null;
    const installed = nodeModules(n).slice();
    const levels = {};
    for (const mid of installed) levels[mid] = (levels[mid] || 0) + 1;
    const y = yearOf(state);
    const power = nodePowerInfo(n);
    const options = (DATA.moduleList || []).map((m) => {
      const level = levels[m.id] || 0;
      const cap = moduleLevelCap(m.id);
      const nextLevel = level + 1;
      const nextCost = nextLevel <= cap ? moduleCostForLevel(m, nextLevel) : 0;
      const broken = isModuleBroken(n, m.id);
      let ok = true, reason = '';
      if (broken) { ok = false; reason = 'این ماژول خراب است؛ اول آن را تعمیر کنید.'; }
      else if (nextLevel > cap) { ok = false; reason = 'به سقف سطح (' + cap + ') رسیده است.'; }
      else if (y < (m.era || 1991)) { ok = false; reason = 'از سال ' + m.era + ' در دسترس است.'; }
      else if (m.id === 'tdlte') {
        if (n.type !== 'cell_4g' && n.type !== 'cell_5g') { ok = false; reason = 'ماژول TD-LTE فقط روی دکل 4G و 5G نصب می‌شود'; }
      } else if (m.id === 'ports_boost') {
        if (n.type !== 'street_cabinet' && n.type !== 'ftth') { ok = false; reason = 'فقط برای کابینت خیابانی و گره FTTH است.'; }
      } else if (m.id === 'range_boost') {
        if (!(n.baseRadius > 0)) { ok = false; reason = 'این گره پوشش رادیویی ندارد.'; }
      } else if (m.id === 'cap_boost') {
        if (!(n.baseCapacity > 0)) { ok = false; reason = 'این گره ظرفیت شبکه ندارد.'; }
      }
      if (ok && (state.cash || 0) < nextCost) { ok = false; reason = 'نقدینگی کافی نیست.'; }
      // هشدار برق پیش از نصب: اگر این سطح مصرف را از توان منبع بیشتر کند، گره خاموش می‌شود
      let powerWarn = false;
      if (m.id !== 'power' && nextLevel <= cap) {
        const drawAfter = power.draw + (m.powerDraw || 0);
        if (drawAfter > power.capacity) powerWarn = true;
      }
      return {
        id: m.id, name: m.name, desc: m.desc, cost: nextCost, baseCost: m.cost,
        monthlyCost: m.monthlyCost, era: m.era, ok, reason, level, nextLevel,
        maxLevel: cap, broken, powerDraw: m.powerDraw || 0, powerWarn,
        effectNow: level > 0 ? moduleEffectText(n, m.id, level) : '',
        effectNext: nextLevel <= cap ? moduleEffectText(n, m.id, nextLevel) : '',
        installed: level,
      };
    });
    return { node: n, slots: moduleSlots(n), installed, levels, power, options };
  }
  function installModule(state, nodeId, moduleId) {
    const info = moduleInfo(state, nodeId);
    if (!info) return { ok: false, error: 'گره پیدا نشد.' };
    const n = info.node;
    if (isRivalNode(n)) return { ok: false, error: 'این گره متعلق به شرکت رقیب است و قابل تغییر نیست.' };
    const opt = info.options.find((o) => o.id === moduleId);
    if (!opt) return { ok: false, error: 'ماژول نامعتبر است.' };
    if (!opt.ok) return { ok: false, error: opt.reason || 'نصب ممکن نیست.' };
    state.cash -= opt.cost || 0;
    state.totalCosts = (state.totalCosts || 0) + (opt.cost || 0);
    if (!Array.isArray(n.modules)) n.modules = [];
    n.modules.push(moduleId);
    applyModules(n);
    const lvl = moduleCount(n, moduleId);
    log(state, '«' + opt.name + '» روی «' + (n.name || 'گره') + '» ' + (lvl > 1 ? 'به سطح ' + lvl + ' آپگرید شد' : 'نصب شد') + ' (آنی).', 'build');
    refreshConnectivity(state);
    const pw = nodePowerInfo(n);
    return { ok: true, cost: opt.cost, module: moduleId, level: lvl, capacity: n.capacity, radius: n.radius, powered: pw.ok };
  }
  // خرابی ماژول: اثرش قطع می‌شود (منبع تغذیهٔ خراب = گره خاموش) تا تعمیر شود
  function breakModule(state, nodeId, moduleId) {
    const n = nodeById(state, nodeId);
    if (!n || moduleCount(n, moduleId) <= 0 || isModuleBroken(n, moduleId)) return false;
    if (!n.brokenModules) n.brokenModules = {};
    n.brokenModules[moduleId] = true;
    applyModules(n);
    const m = getModule(moduleId);
    log(state, 'ماژول «' + ((m && m.name) || moduleId) + '» روی «' + (n.name || 'گره') + '» خراب شد و از کار افتاد.', 'error');
    refreshConnectivity(state);
    return true;
  }
  // تعمیر ماژول خراب: آنی، با هزینهٔ ۲۰٪ هزینهٔ سطح فعلی (حداقل ۲۰۰ تومان)
  function repairModule(state, nodeId, moduleId) {
    const n = nodeById(state, nodeId);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    if (isRivalNode(n)) return { ok: false, error: 'این گره متعلق به شرکت رقیب است.' };
    if (!isModuleBroken(n, moduleId)) return { ok: false, error: 'این ماژول خراب نیست.' };
    const m = getModule(moduleId);
    const cost = Math.max(200, Math.round(0.2 * moduleCostForLevel(m, Math.max(1, moduleCount(n, moduleId)))));
    if ((state.cash || 0) < cost) return { ok: false, error: 'بودجه کافی برای تعمیر ماژول نیست.' };
    state.cash -= cost;
    state.totalCosts = (state.totalCosts || 0) + cost;
    delete n.brokenModules[moduleId];
    applyModules(n);
    log(state, 'ماژول «' + ((m && m.name) || moduleId) + '» روی «' + (n.name || 'گره') + '» تعمیر شد (آنی).', 'repair');
    refreshConnectivity(state);
    return { ok: true, cost, module: moduleId };
  }

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
  const TECH_KEYS = ['fiber', 'cellular', 'fwa']; // وای‌فای فناوریِ جداگانه نیست؛ داخل ساختمانِ مشترک است
  // ---------- مدل تقاضا: فقط مشترک ترافیک می‌سازد ----------
  // بدون اشتراک هیچ سرویسی نیست: پوشش به‌تنهایی به کسی اینترنت نمی‌دهد و غیرمشترکان
  // هیچ ظرفیتی مصرف نمی‌کنند. ترافیک هر منطقه = مشترکان × سرعت بسته × ضریب هم‌زمانی
  // (مالتی‌پلکس آماری: در عمل فقط حدود ۲٪ از سقف بسته به‌صورت میانگینِ ساعت شلوغ
  // مصرف می‌شود؛ یعنی هر مشترک خانگی با بستهٔ ۵۰ مگابیت حدود ۱ مگابیت میانگین بار دارد
  // — نسبت اشتراک‌فروشی ۵۰:۱ که در شبکه‌های واقعی هم رایج است).
  // جمعیت فقط «بازار قابل‌دسترس» است که رشد مشترک از آن تغذیه می‌شود، نه بار شبکه.
  const CONCURRENCY = 0.012;
  function districtPackage(state, d) {
    const cust = (state.customers || []).find((c) => c.districtId === d.id);
    return (state.packages || []).find((p) => p.id === (cust ? cust.packageId : 'home')) || null;
  }
  function packageSpeed(pkg) { return pkg ? (pkg.speedMbps || pkg.speed || 50) : 50; }
  // ترافیک میانگینِ یک مشترک (Mbps) در ساعت شلوغ، با ضریب مصرف منطقه
  // ضریب تقاضای هر کاربر بر اساس سال (خط زمانی): ۱۹۹۱ کم (فناوری ضعیف) تا دوران مدرن زیاد.
  // بین نقاط منحنی DATA.eraDemandCurve خطی درون‌یابی می‌شود.
  function eraDemandMult(state) {
    const curve = (DATA && DATA.eraDemandCurve) || [];
    if (!curve.length) return 1;
    const y = yearOf(state);
    if (y <= curve[0].year) return curve[0].mult;
    for (let i = 1; i < curve.length; i++) {
      if (y <= curve[i].year) {
        const a = curve[i - 1], b = curve[i];
        const t = (y - a.year) / Math.max(1, b.year - a.year);
        return a.mult + (b.mult - a.mult) * t;
      }
    }
    return curve[curve.length - 1].mult;
  }
  // سرعت مورد انتظار هر نوع منطقه (مبنای مصرف واقعی کاربر و رضایت از سرعت)
  function expectedSpeedForDistrict(d) {
    if (!d) return 50;
    return (d.type === 'industrial' || d.type === 'heavy_industrial') ? 1000
      : (['commercial', 'government', 'medical', 'academic'].includes(d.type) ? 200 : 50);
  }
  // ترافیک هر مشترک از مصرف واقعی کاربر می‌آید (سرعت مورد انتظار منطقه × هم‌زمانی × دوران)،
  // نه از سرعت اسمی بسته: بستهٔ کندتر بار شبکه را کم نمی‌کند، فقط رضایت را پایین می‌آورد.
  function perSubTraffic(state, d, timeFactor) {
    return expectedSpeedForDistrict(d) * CONCURRENCY * (timeFactor == null ? 1 : timeFactor) * (d.usageMult || 1) * eraDemandMult(state);
  }
  // ---------- هزینهٔ ماهانهٔ هر گره: هزینهٔ پایه + ماژول‌ها + نگهداری متناسب با ظرفیت واقعی ----------
  const MAINT_PER_MBPS = 0.04; // تومان به ازای هر Mbps ظرفیت در ماه
  function monthlyNodeCost(state, n) {
    const eq = getEq(n.type);
    if (!eq || n.status === 'building') return 0;
    let c = (eq.monthlyCost || 0);
    for (const mid of nodeModules(n)) { const m = getModule(mid); if (m) c += (m.monthlyCost || 0); }
    c += Math.round((n.capacity || 0) * MAINT_PER_MBPS);
    return c;
  }
  // هزینهٔ ترانزیت ماهانه: به ازای هر Mbps ترافیک عبوری از دروازه اینترنت
  const TRANSIT_PER_MBPS = 8; // تومان به ازای هر Mbps در ماه
  function transitMbps(state) {
    let u = 0;
    for (const n of (state.nodes || [])) if (n.type === 'internet_gateway' && !isRivalNode(n)) u += (n.usage || 0);
    return u;
  }
  function monthlyTransitCost(state) { return Math.round(transitMbps(state) * TRANSIT_PER_MBPS); }
  // ---------- اثر قیمت بسته بر تقاضا (قیمت مرجع = قیمت پیش‌فرض همان بسته در داده‌ها) ----------
  function packageRefPrice(pkgId) {
    const def = ((DATA && DATA.packageList) || []).find((p) => p.id === pkgId);
    return def ? (def.price || 120) : 120;
  }
  // بستهٔ مورد انتظار بازار برای هر نوع منطقه (مرجع قیمت بازار)
  function expectedPackageIdForDistrict(d) {
    if (!d) return 'home';
    if (d.type === 'industrial' || d.type === 'heavy_industrial') return 'enterprise';
    if (['commercial', 'government', 'medical', 'academic', 'landmark', 'transport', 'tourism'].includes(d.type)) return 'business';
    return 'home';
  }
  function priceRatioOf(state, d) {
    const pkg = districtPackage(state, d);
    if (!pkg) return 1;
    // نسبت قیمت بستهٔ فعلی به قیمت مرجع بازارِ همان نوع منطقه: هم گرانیِ ویرایش قیمت و هم
    // گذاشتن بستهٔ گران‌تر از انتظار منطقه (مثل سازمانی در منطقهٔ مسکونی) جریمه می‌شود.
    return Math.max(0.01, (pkg.price || 120) / packageRefPrice(expectedPackageIdForDistrict(d)));
  }
  // ضریب رشد از قیمت: ارزان‌تر از مرجع → رشد بیشتر؛ گران‌تر → رشد کمتر (با حساسیت قیمتی منطقه)
  function priceGrowthFactor(state, d) {
    const sens = (d && d.priceSensitivity != null) ? d.priceSensitivity : 0.7;
    return clamp(Math.pow(1 / priceRatioOf(state, d), sens), 0.05, 2.5);
  }
  // ریزش روزانهٔ اضافه از گرانی بسته (نسبت به قیمت مرجع)
  function priceChurnRate(state, d) {
    const sens = (d && d.priceSensitivity != null) ? d.priceSensitivity : 0.7;
    return clamp((priceRatioOf(state, d) - 1) * 0.03 * sens, 0, 0.15);
  }
  // اثر قیمت بر رضایت: گرانی رضایت را کم و ارزانی کمی زیاد می‌کند
  function priceSatFactor(state, d) {
    const sens = (d && d.priceSensitivity != null) ? d.priceSensitivity : 0.7;
    return clamp(1 - (priceRatioOf(state, d) - 1) * 0.15 * sens, 0.4, 1.15);
  }
  function techOfNode(type) {
    if (type === 'ftth' || type === 'street_cabinet' || type === 'cabinet_basic') return 'fiber';
    if (type && type.indexOf('cell_') === 0) return 'cellular';
    const eq = getEq(type);
    return (eq && eq.tech) || null;
  }
  // گره در این لحظه برای یک فناوری مشخص سرویس می‌دهد؟
  // TD-LTE فناوریِ دکل‌های 4G/5G دارای «ماژول TD-LTE» است (گرهٔ جدا ندارد).
  function nodeServesTech(state, n, tech) {
    if (!isAccessNode(n) || !isUsableNode(n) || !n.connected || isRivalNode(n)) return false;
    if (tech === 'fwa') return tdlteCapacity(n) > 0;
    return techOfNode(n.type) === tech;
  }
  // گره دسترسی در این لحظه واقعاً سرویس می‌دهد؟ (متصل + قابل‌استفاده)
  function nodeServes(state, n) {
    if (!isAccessNode(n) || !isUsableNode(n) || !n.connected || isRivalNode(n)) return false;
    return true;
  }
  // نقطه داخل پوشش یک دکل 4G/5G متصل است؟ (برای نمایش وضعیت TD-LTE در تست سرعت)
  function pointIn4GCoverage(state, x, y) {
    for (const m of (state.nodes || [])) {
      if (m.type !== 'cell_4g' && m.type !== 'cell_5g') continue;
      if (!isUsableNode(m) || !m.connected || isRivalNode(m)) continue;
      if (dist(x, y, m.x, m.y) <= (m.radius || 0) && inWedge(m, x, y)) return true;
    }
    return false;
  }
  // سازگاری با فراخوانی‌های قبلی: «تغذیه‌شدن TD-LTE» حالا یعنی خود گره ماژول TD-LTE دارد
  function tdlteFed(state, node) {
    return tdlteCapacity(node) > 0;
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
    if (!n) return false;
    if (n.type === 'cell_5g') return true; // 5G موج میلی‌متری: باران و طوفان بیشتر رویش اثر می‌گذارند
    const eq = getEq(n.type);
    const name = (eq && eq.name) || n.name || '';
    return name.indexOf('mmWave') >= 0 || name.indexOf('۲۶ گیگاهرتز') >= 0;
  }
  // ضریب ظرفیت گره بر اساس آب‌وهوای جاری: بی‌سیم و mmWave افت می‌کنند، فیبر نه
  function nodeWeatherFactor(state, n) {
    if (!n || !state.weather) return 1;
    const cfg = weatherKindCfg(state.weather.kind);
    if (!cfg) return 1;
    if (isMmWaveNode(n)) return cfg.mmwaveFactor != null ? cfg.mmwaveFactor : 1;
    const tech = techOfNode(n.type);
    if (tech === 'fiber') return 1;
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
    const g = buildingGrid(state);
    const minX = Math.min(ax, bx) - 45, maxX = Math.max(ax, bx) + 45;
    const minY = Math.min(ay, by) - 45, maxY = Math.max(ay, by) + 45;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let count = 0;
    const cx0 = Math.floor(minX / g.cell), cx1 = Math.floor(maxX / g.cell);
    const cy0 = Math.floor(minY / g.cell), cy1 = Math.floor(maxY / g.cell);
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gy = cy0; gy <= cy1; gy++) {
        const arr = g.map.get(gx + ',' + gy);
        if (!arr) continue;
        for (const b of arr) {
          if ((b.height || 0) < minHeight) continue;
          const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
          if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
          const tt = clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1);
          if (dist(cx, cy, ax + tt * dx, ay + tt * dy) < 45) count++;
        }
      }
    }
    return count;
  }
  // شبکهٔ فضایی ساختمان‌ها (کش‌شده؛ فقط وقتی آرایه/تعداد ساختمان‌ها عوض شود بازساخته می‌شود)
  let _bGridCache = null;
  function buildingGrid(state) {
    const bs = state.buildings || (DATA && DATA.buildings) || [];
    if (_bGridCache && _bGridCache.bs === bs && _bGridCache.len === bs.length) return _bGridCache;
    const cell = 200, map = new Map();
    for (const b of bs) {
      const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
      const k = Math.floor(cx / cell) + ',' + Math.floor(cy / cell);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(b);
    }
    _bGridCache = { bs, len: bs.length, cell, map };
    return _bGridCache;
  }
  function buildingAtPointGrid(state, x, y, margin) {
    const m = margin || 0;
    const g = buildingGrid(state);
    const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = g.map.get((cx + i) + ',' + (cy + j));
        if (!arr) continue;
        for (const b of arr) {
          if (x >= b.x - m && x <= b.x + (b.w || 26) + m && y >= b.y - m && y <= b.y + (b.h || 20) + m) return b;
        }
      }
    }
    return null;
  }
  // مدل سیگنال: ارتفاع ساختمان فقط دید لینک نقطه‌به‌نقطه (PtP) را مخدوش می‌کند؛
  // ساختمان‌ها روی سیگنال سلولار هیچ اثری ندارند؛ برای TD-LTE/وای‌فای هر ساختمانِ سر راه
  // فقط ۴٪ از قدرت سیگنال کم می‌کند (سقف مجموع: ‎−۳۰٪). فیبر از ساختمان اثر نمی‌گیرد.
  function buildingAttenuation(state, ax, ay, bx, by) {
    return Math.max(0.70, 1 - 0.04 * segNearBuildings(state, ax, ay, bx, by, 0));
  }
  function ptpLosFactor(state, a, b) {
    if (!a || !b) return 1;
    return segNearBuildings(state, a.x, a.y, b.x, b.y, 10) > 0 ? 0.35 : 1;
  }
  function wirelessAttFactor(state, tech, ax, ay, bx, by) {
    if (tech === 'fiber' || tech === 'cellular') return 1;
    return buildingAttenuation(state, ax, ay, bx, by);
  }
  // ---------- مدل تأخیر (پینگ) ----------
  // تأخیر هر لینک = پایهٔ رسانه + فاصله × نرخ هر واحد؛ هر گرهٔ میانی هم پردازش اضافه می‌کند.
  // (فیبر در دنیای واقعی ~۵ میکروثانیه بر کیلومتر است؛ این‌جا برای قابل‌حس‌بودن در بازی مقیاس شده.)
  const LINK_LATENCY_PER_UNIT = { fiber: 0.004, copper: 0.012, ethernet: 0.003, ptp: 0.002 };
  const NODE_PROCESSING_MS = 1; // پردازش هر گرهٔ میانی (روتر/تجمیع/هسته)
  function linkLatency(l, a, b) {
    const mediumBase = (DATA.linkMedia && DATA.linkMedia[l.medium] && DATA.linkMedia[l.medium].latency) || 2;
    const base = Math.max(mediumBase, l.latency || 0); // تأخیر پایهٔ لینک (قابل تحمیل در آزمون‌ها)
    const per = LINK_LATENCY_PER_UNIT[l.medium] != null ? LINK_LATENCY_PER_UNIT[l.medium] : 0.005;
    const d = (a && b) ? dist(a.x, a.y, b.x, b.y) : 0;
    return base + d * per;
  }
  const TECH_LATENCY_BASE = { fiber: 5, cellular: 30, fwa: 25, wifi: 10 };
  function techLatencyBase(tech, node) {
    return TECH_LATENCY_BASE[tech] || 20;
  }
  // نوسان تأخیر (جیتر): موبایل زیر ازدحام نوسان دارد؛ TD-LTE ثابت و پایدار است
  function techJitter(tech, congestionFactor) {
    if (tech === 'fwa') return 2;
    if (tech === 'cellular') return Math.round(40 * clamp(1 - (congestionFactor == null ? 1 : congestionFactor), 0, 1));
    if (tech === 'fiber') return 1;
    return 5;
  }
  function pathLatency(state, nodeId) {
    const path = bfsPath(state, nodeId);
    if (!path) return 0;
    let sum = 0, hops = 0;
    for (const id of path) {
      const l = linkById(state, id);
      if (l) { sum += linkLatency(l, nodeById(state, l.from), nodeById(state, l.to)); hops++; }
    }
    return Math.round((sum + Math.max(0, hops - 1) * NODE_PROCESSING_MS) * 10) / 10;
  }
  // پینگ بین هر دو گره: مسیر (BFS روی گراف لینک‌ها) + تأخیر کل (رفت‌وبرگشت)
  function pingBetween(state, fromId, toId) {
    const from = nodeById(state, fromId), to = nodeById(state, toId);
    if (!from || !to) return { ok: false, error: 'گره مبدأ یا مقصد پیدا نشد.' };
    if (fromId === toId) return { ok: true, ms: 0, path: [fromId], pathNames: [from.name || from.type], hops: 0 };
    const visited = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toId) break;
      for (const l of state.links) {
        if (!isUsableLink(l)) continue;
        let nxt = null;
        if (l.from === cur) nxt = l.to; else if (l.to === cur) nxt = l.from; else continue;
        if (visited.has(nxt)) continue;
        visited.set(nxt, { prev: cur, linkId: l.id });
        queue.push(nxt);
      }
    }
    if (!visited.has(toId)) return { ok: false, error: 'مسیر شبکه‌ای بین این دو گره نیست.' };
    const nodes = [], links = [];
    let c = toId;
    while (c) {
      nodes.unshift(c);
      const info = visited.get(c);
      if (info) { links.unshift(info.linkId); c = info.prev; } else break;
    }
    let oneWay = 0;
    for (const lid of links) {
      const l = linkById(state, lid);
      if (l) oneWay += linkLatency(l, nodeById(state, l.from), nodeById(state, l.to));
    }
    oneWay += Math.max(0, nodes.length - 2) * NODE_PROCESSING_MS;
    return {
      ok: true,
      ms: Math.round(oneWay * 2 * 10) / 10, // رفت‌وبرگشت
      path: nodes,
      pathNames: nodes.map((id) => { const n = nodeById(state, id); return n ? (n.name || n.type) : id; }),
      hops: links.length,
    };
  }

  // ---------- افت سیگنال در مسیرهای طولانی + تقویت‌کننده ----------
  // هر رسانه تا یک آستانهٔ فاصله بدون افت است؛ بعد از آن ظرفیت مؤثر کم می‌شود.
  // تقویت‌کننده در میانهٔ مسیر (دو لینک کوتاه‌تر) افت را برمی‌گرداند.
  const LINK_ATT_THRESHOLD = { fiber: 2000, copper: 800, ethernet: 600, ptp: 0 };
  function linkAttenuation(state, l, a, b) {
    if (!l || !a || !b) return 1;
    if (l.medium === 'ptp') return ptpDistanceFactor(state, a, b); // PtP: افت فاصله + دید
    const th = LINK_ATT_THRESHOLD[l.medium];
    if (!th) return 1;
    const d = dist(a.x, a.y, b.x, b.y);
    if (d <= th) return 1;
    // افت تدریجی: در ۳ برابر آستانه به کف ۲۵٪ می‌رسد
    return clamp(1 - 0.375 * ((d - th) / th), 0.25, 1);
  }
  // PtP: هرچه فاصله بیشتر، ظرفیت کمتر (در حداکثر برد ۱۸۰۰ به ۴۰٪) × عامل دید ساختمان‌ها
  function ptpDistanceFactor(state, a, b) {
    if (!a || !b) return 1;
    const maxRange = (DATA.linkMedia && DATA.linkMedia.ptp && DATA.linkMedia.ptp.maxRange) || 1800;
    const d = dist(a.x, a.y, b.x, b.y);
    const distF = clamp(1 - 0.6 * (d / maxRange), 0.4, 1);
    return distF * ptpLosFactor(state, a, b);
  }
  // ظرفیت مؤثر یک لینک با همهٔ عامل‌ها (مهندس شبکه، افت سیگنال، دید PtP، آسیب موقت طوفان)
  function linkEffCapacity(state, l, fx) {
    if (!l) return 0;
    const a = nodeById(state, l.from), b = nodeById(state, l.to);
    const att = linkAttenuation(state, l, a, b);
    l._attFactor = att;
    const capMult = (fx && fx.capMult) || 1;
    // آسیب طوفان موقت است: تا روز مشخصی ظرفیت کم می‌شود و بعد خودکار برمی‌گردد (یا با تعمیر لینک)
    const stormF = (l.degradedUntil != null && (state.day || 1) <= l.degradedUntil) ? (l.degradeFactor || 0.6) : 1;
    return (l.capacity || 0) * capMult * att * stormF;
  }
  // تعمیر آنی لینک قطع/آسیب‌دیده (بدون حذف و ساخت دوباره)
  function repairLink(state, linkId) {
    const l = linkById(state, linkId);
    if (!l) return { ok: false, error: 'لینک پیدا نشد.' };
    const la = nodeById(state, l.from);
    if (la && isRivalNode(la)) return { ok: false, error: 'این لینک متعلق به شرکت رقیب است.' };
    if (l.status !== 'cut' && !(l.degradedUntil != null && (state.day || 1) <= l.degradedUntil)) {
      return { ok: false, error: 'این لینک سالم است و تعمیر نمی‌خواهد.' };
    }
    const cost = Math.round(800 * staffEffects(state).repairDiscount);
    if (state.cash < cost) return { ok: false, error: 'بودجه کافی برای تعمیر لینک نیست.' };
    state.cash -= cost;
    state.totalCosts += cost;
    l.status = 'active'; l.repairWork = 0;
    delete l.degradedUntil; delete l.degradeFactor;
    log(state, 'لینک ' + mediumFa(l.medium) + ' تعمیر شد (آنی).', 'repair');
    refreshConnectivity(state);
    return { ok: true, cost };
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

  // ---------- ترجیح نوع اینترنت ساکنان ساختمان‌ها ----------
  // ترجیح هر ساختمان قطعی و مشتق‌شده است (بدون ذخیرهٔ حالت): از شناسهٔ ساختمان + بذر نقشه
  // با یک RNG محلی (جریان تصادفی بازی دست نمی‌خورد)، روی پایهٔ سهم فناوریِ نوع منطقه
  // (همان DATA.techDemandSplit) و با ضریب نوع ساختمان شکل می‌گیرد.
  function prefHash(str) { // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function prefRnd(seed) { // mulberry32 محلی
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let x = Math.imul(t ^ (t >>> 15), t | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const PREF_TYPE_MULT = {
    office:      { fiber: 1.7,  cellular: 0.8,  fwa: 0.55 },
    industrial:  { fiber: 1.5,  cellular: 0.7,  fwa: 1.15 },
    commercial:  { fiber: 1.35, cellular: 1.05, fwa: 0.8 },
    residential: { fiber: 0.9,  cellular: 1.1,  fwa: 1.25 },
  };
  // ترجیح هر ساختمان فقط «یک» نوع فعال است (فیبر/مسی یا سلولار یا TD-LTE) — بدون درصد.
  // انتخاب قطعی و مشتق‌شده است (بدون ذخیرهٔ حالت): از شناسهٔ ساختمان + بذر نقشه با RNG محلی،
  // روی پایهٔ سهم فناوریِ نوع منطقه و ضریب نوع ساختمان و وزن دوران (TD-LTE قبل از ۲۰۱۲ نیست).
  function buildingPreference(state, b) {
    if (!b) return { type: 'cellular' };
    const d = b.districtId ? (state.districts || []).find((x) => x.id === b.districtId) : null;
    const base = (d && DATA.techDemandSplit && DATA.techDemandSplit[d.type]) || DATA.techDemandSplitDefault || {};
    const mult = PREF_TYPE_MULT[b.type] || { fiber: 1, cellular: 1, fwa: 1 };
    const rnd = prefRnd(prefHash(String(b.id) + '|' + (state.mapSeed || 0)));
    const weights = {};
    let sum = 0;
    for (const t of TECH_KEYS) {
      let w = (base[t] || 0.05) * (mult[t] || 1) * eraTechWeight(state, t);
      if (!d && t === 'fwa') w *= 1.3; // ساختمان پراکنده: گرایش به TD-LTE
      weights[t] = w; sum += w;
    }
    if (sum <= 0) return { type: 'cellular' };
    let r = rnd() * sum;
    for (const t of TECH_KEYS) { if (r < weights[t]) return { type: t }; r -= weights[t]; }
    return { type: 'cellular' };
  }
  // ترجیح کلی منطقه = شمار ساختمان‌ها به تفکیک نوعِ ترجیحی (وزن‌دار با حجم ساختمان)
  function districtPreference(state, d) {
    const bs = (state.buildings || []).filter((b) => b.districtId === d.id);
    const out = { fiber: 0, cellular: 0, fwa: 0, total: 0 };
    if (!bs.length) {
      const split = (DATA.techDemandSplit && DATA.techDemandSplit[d.type]) || DATA.techDemandSplitDefault || {};
      for (const t of TECH_KEYS) out[t] = Math.round((split[t] || 0) * eraTechWeight(state, t) * 100);
      out.total = out.fiber + out.cellular + out.fwa;
      return out;
    }
    for (const b of bs) {
      const w = (b.w || 10) * (b.h || 10) * (b.height || 1);
      out[buildingPreference(state, b).type] += w;
      out.total += w;
    }
    return out;
  }
  // سهم تقاضا از شمار ترجیح ساختمان‌ها (همان منبع پنل منطقه)
  function districtTechSplit(state, d) {
    const pref = districtPreference(state, d);
    const total = Math.max(1, pref.total);
    const out = {};
    for (const t of TECH_KEYS) out[t] = pref[t] / total;
    return out;
  }

  // سهم تقاضای هر فناوری از تقاضای کل منطقه + بخش سرویس‌گرفته با ظرفیت همان فناوری
  // منبع سهم‌ها «ترجیح ساختمان‌های منطقه» است تا پنل ترجیح و پنل تقاضا همیشه یکی باشند.
  // ظرفیت TD-LTE فقط از دکل‌های 4G/5G دارای «ماژول TD-LTE» می‌آید.
  function computeTechDemand(d, servers, congestionFactor, fiberRatio, state) {
    const split = state ? districtTechSplit(state, d)
      : ((DATA.techDemandSplit && DATA.techDemandSplit[d.type]) || DATA.techDemandSplitDefault || {});
    const techCap = { fiber: 0, cellular: 0, fwa: 0, wifi: 0 };
    for (const srv of (servers || [])) {
      const t = techOfNode(srv.type);
      if (t) techCap[t] += (srv._effCap != null ? srv._effCap : srv.capacity) || 0;
      techCap.fwa += tdlteCapacity(srv); // ماژول TD-LTE روی دکل 4G/5G
    }
    // فیبر دستی است: فقط به نسبت ساختمان‌های دارای انشعاب فعال سرویس می‌دهد
    if (fiberRatio != null) techCap.fiber *= fiberRatio;
    const demand = d.demand != null ? d.demand : 0;
    // مشترکان سیمی نمی‌توانند از ساکنان ساختمان‌های انشعاب‌دار بیشتر شوند:
    // سقف ترافیک سیمی = ساکنان انشعاب‌دار × نرخ اشتراک × ترافیک هر مشترک
    if (state && (d.subscribers || 0) > 0 && demand > 0) {
      const perSubNow = demand / d.subscribers;
      const wiredCapMbps = droppedResidents(state, d) * 0.35 * perSubNow;
      techCap.fiber = Math.min(techCap.fiber, wiredCapMbps);
    }
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
    // تعمیر آنی است؛ تکنسین‌ها حالا هزینهٔ تعمیر را کم می‌کنند (هر تکنسین ۶٪، حداکثر ۵۰٪ تخفیف)
    const repairDiscount = clamp(1 - 0.06 * techs, 0.5, 1);
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
      buildSpeed, repairSpeed, repairDiscount, capMult, satDecayRate, satRecoveryRate,
      churnKeepUnserved, churnKeepLowQos, growthMult, supRatio: supR,
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
    const out = {};
    const bAt = buildingAtPoint(state, x, y);
    for (const t of TECH_KEYS) {
      // فیبر دستی است: ساختمان بدون انشعاب فعال سرعت فیبر ندارد؛ با انشعاب، سرعت از گره منبع انشعاب می‌آید
      let fiberSrc = null, dropMedium = 'fiber';
      if (t === 'fiber' && bAt) {
        const st = buildingWiredStatus(state, bAt.id);
        if (st.status !== 'active') {
          out[t] = { speed: 0, nodeId: st.nodeId, nodeName: st.nodeName, reason: 'no_fiber_drop', latency: null };
          continue;
        }
        fiberSrc = nodeById(state, st.nodeId);
        dropMedium = st.medium || 'fiber';
      }
      const covering = fiberSrc ? [fiberSrc] : state.nodes.filter((n) =>
        nodeServesTech(state, n, t) && dist(x, y, n.x, n.y) <= (n.radius || 0) && inWedge(n, x, y));
      if (!covering.length) {
        // TD-LTE: اگر پوشش 4G/5G هست ولی هیچ دکلی ماژول TD-LTE ندارد، دلیل جدا نشان داده شود
        if (t === 'fwa' && pointIn4GCoverage(state, x, y)) {
          out[t] = { speed: 0, nodeId: null, nodeName: null, reason: 'no_tdlte_module', latency: null, jitter: null };
          continue;
        }
        // گره دسترسی در برد هست ولی به شبکه وصل نیست → دلیل «متصل نیست» (نه «خارج از پوشش»)
        const nearUnconn = state.nodes.find((n) => isAccessNode(n) && isUsableNode(n) && !n.connected &&
          (t === 'fwa' ? tdlteCapacity(n) > 0 : techOfNode(n.type) === t) &&
          dist(x, y, n.x, n.y) <= (n.radius || 0) && inWedge(n, x, y));
        if (nearUnconn) {
          out[t] = { speed: 0, nodeId: nearUnconn.id, nodeName: nearUnconn.name, reason: 'unconnected', latency: null, jitter: null };
          continue;
        }
        out[t] = { speed: 0, nodeId: null, nodeName: null, reason: 'no_coverage', latency: null, jitter: null }; continue;
      }
      const connected = covering.filter((n) => n.connected);
      if (!connected.length) {
        const n0 = covering[0];
        out[t] = { speed: 0, nodeId: n0.id, nodeName: n0.name, reason: 'unconnected', latency: null, jitter: null };
        continue;
      }
      const pool = connected;
      let best = null;
      for (const n of pool) {
        const path = bfsPath(state, n.id);
        if (!path) continue;
        // برای TD-LTE ظرفیتِ ماژول ملاک است، نه کل ظرفیت دکل
        let bottleneck = (t === 'fwa' ? tdlteCapacity(n) : (n.capacity || 0)) * nodeWeatherFactor(state, n) * (1 - 0.5 * interferenceFor(state, n, n.channel));
        let congFactor = 1;
        let latencySum = 0, hops = 0;
        for (const id of path) {
          const l = linkById(state, id);
          if (!l) continue;
          latencySum += linkLatency(l, nodeById(state, l.from), nodeById(state, l.to)); hops++;
          const effCap = linkEffCapacity(state, l, fx);
          bottleneck = Math.min(bottleneck, effCap);
          if (effCap > 0 && (l.usage || 0) > effCap) congFactor = Math.min(congFactor, effCap / l.usage);
        }
        const d = dist(x, y, n.x, n.y);
        const distFactor = 1 - 0.5 * clamp(d / Math.max(1, n.radius || 1), 0, 1);
        const attFactor = wirelessAttFactor(state, t, n.x, n.y, x, y);
        let speed = Math.round(bottleneck * distFactor * attFactor * congFactor);
        if (t === 'fiber' && dropMedium === 'copper') speed = Math.min(speed, COPPER_DROP_SPEED); // DSL سقف سرعت دارد
        // سرعت هر کاربر: ظرفیت سایت بین کاربران فعال همان گره تقسیم می‌شود و از سرعت بسته بیشتر نمی‌شود
        const activeUsers = Math.max(1, (n.usage || 0) / Math.max(1, 50 * eraDemandMult(state)));
        let perUser = Math.round(speed / activeUsers);
        const latency = Math.round((latencySum + Math.max(0, hops - 1) * NODE_PROCESSING_MS) * 2 + techLatencyBase(t, n));
        const jitter = techJitter(t, congFactor);
        if (!best || speed > best.speed) best = { speed, perUser, nodeId: n.id, nodeName: n.name, attFactor, congFactor, distFactor, latency, jitter };
      }
      if (!best) { out[t] = { speed: 0, perUser: 0, nodeId: pool[0].id, nodeName: pool[0].name, reason: 'no_path', latency: null, jitter: null }; continue; }
      let reason = null;
      if (best.congFactor < 0.7) reason = 'congestion';
      else if (best.attFactor <= 0.85) reason = 'los';
      else if (best.distFactor < 0.65) reason = 'distance';
      // سقف سرعت هر کاربر = سرعت بستهٔ منطقهٔ ساختمان (یا بستهٔ خانگی برای نقطهٔ آزاد)
      let pkgCap = 0;
      if (bAt && bAt.districtId) {
        const bd = (state.districts || []).find((x) => String(x.id) === String(bAt.districtId));
        if (bd) pkgCap = packageSpeed(districtPackage(state, bd));
      }
      if (!pkgCap) pkgCap = packageSpeed((state.packages || []).find((p) => p.id === 'home'));
      const perUserCapped = pkgCap > 0 ? Math.min(best.perUser, pkgCap) : best.perUser;
      out[t] = { speed: best.speed, perUser: perUserCapped, nodeId: best.nodeId, nodeName: best.nodeName, reason, latency: best.latency, jitter: best.jitter };
    }
    // وای‌فای داخل ساختمانِ مشترک است: سرعتش = سرعت اشتراک همان ساختمان؛
    // بدون اشتراک وای‌فای نیست و بدون مسیر واقعی تا دروازه (انشعابِ منبعِ متصل یا پوشش بی‌سیمِ گره متصل) هم سرویسی ندارد
    const subscribed = !!(bAt && buildingHasSubscription(state, bAt));
    const hasPath = !!(bAt && buildingNetworkPath(state, bAt).hasPath);
    const bestSpeed = Math.max(0, ...TECH_KEYS.map((t) => (out[t] && out[t].speed) || 0));
    out.wifi = (subscribed && hasPath)
      ? { speed: bestSpeed, nodeId: null, nodeName: 'اکسس‌پوینت خود مشترک', reason: null, latency: null }
      : { speed: 0, nodeId: null, nodeName: null, reason: subscribed ? 'no_network' : 'no_subscription', latency: null };
    return out;
  }

  // ساختمان اشتراک فعال دارد؟ (انشعاب سیمی فعال یا مشترک فردی ساکن)
  function buildingHasSubscription(state, b) {
    if (!b) return false;
    if (buildingWiredStatus(state, b.id).status === 'active') return true;
    return (state.individuals || []).some((p) => String(p.buildingId) === String(b.id) && p.status === 'subscribed');
  }

  // ساختمان مسیر واقعی انتها‌به‌انتها تا دروازه اینترنت دارد؟
  // (الف) انشعاب سیمی فعال که گره منبعش (کابینت) خودش به دروازه وصل است، یا
  // (ب) پوشش بی‌سیم (سلولار/TD-LTE) از گره دسترسیِ متصل به دروازه.
  // اکسس‌پوینت خصوصی داخل ساختمان فقط با همین مسیر به شبکه وصل می‌شود؛
  // اشتراک به‌تنهایی (بدون مسیر) هیچ سرویسی نمی‌دهد.
  function buildingNetworkPath(state, b) {
    if (!b) return { hasPath: false, via: null, nodeId: null };
    // ساختمان منطقهٔ قفل‌شده از بازیکن سرویس نمی‌گیرد (حتی زیر پوشش دکل)
    if (b.districtId) {
      const bd = (state.districts || []).find((x) => String(x.id) === String(b.districtId));
      if (bd && !districtUnlocked(bd)) return { hasPath: false, via: null, nodeId: null };
    }
    const st = buildingWiredStatus(state, b.id);
    if (st.status === 'active' && st.nodeId) {
      const src = nodeById(state, st.nodeId);
      if (src && isUsableNode(src) && src.connected) return { hasPath: true, via: 'wired', nodeId: src.id };
    }
    const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
    for (const n of (state.nodes || [])) {
      if (!isAccessNode(n) || !isUsableNode(n) || !n.connected) continue;
      const tech = techOfNode(n.type);
      if (tech !== 'cellular' && tdlteCapacity(n) <= 0) continue;
      if (dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy)) {
        return { hasPath: true, via: 'wireless', nodeId: n.id };
      }
    }
    return { hasPath: false, via: null, nodeId: null };
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

  // ---------- نمونه‌برداری سریع میدان سیگنال/سرعت برای لایه‌های نقشه ----------
  // همان مدل signalAt / aggregateSpeedAt، ولی با پیش‌محاسبهٔ یک‌بارهٔ عامل‌های هر گره
  // (تداخل، آب‌وهوا، گلوگاه مسیر) و جست‌وجوی فضایی — تا ساخت کل میدان در چند میلی‌ثانیه تمام شود.
  const FIELD_CELL = 800;
  function fieldBuckets(items) {
    const map = new Map();
    for (const it of items) {
      const k = Math.floor(it.x / FIELD_CELL) + ',' + Math.floor(it.y / FIELD_CELL);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return map;
  }
  function wedgeOk(e, x, y) {
    if (e.angle >= 360) return true;
    const dx = x - e.x, dy = y - e.y;
    if (Math.hypot(dx, dy) < 1) return true;
    const ang = Math.atan2(-dy, dx) * 180 / Math.PI;
    const diff = (((ang - e.direction) + 540) % 360) - 180;
    return Math.abs(diff) <= e.angle / 2;
  }
  function prepareSignalField(state) {
    const nodes = [];
    for (const n of (state.nodes || [])) {
      if (!isAccessNode(n) || !isUsableNode(n)) continue;
      const radius = n.radius || 0;
      if (radius <= 0) continue;
      nodes.push({
        x: n.x, y: n.y, radius, tech: techOfNode(n.type),
        factor: (1 - 0.5 * interferenceFor(state, n, n.channel)) * nodeWeatherFactor(state, n),
        angle: n.angle == null ? 360 : n.angle, direction: n.direction || 0,
      });
    }
    return { state, nodes, buckets: fieldBuckets(nodes) };
  }
  function signalFieldAt(prep, x, y) {
    const cx = Math.floor(x / FIELD_CELL), cy = Math.floor(y / FIELD_CELL);
    let best = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = prep.buckets.get((cx + i) + ',' + (cy + j));
        if (!arr) continue;
        for (const e of arr) {
          const d = dist(x, y, e.x, e.y);
          if (d > e.radius || !wedgeOk(e, x, y)) continue;
          const att = wirelessAttFactor(prep.state, e.tech, e.x, e.y, x, y);
          const sig = (1 - d / e.radius) * att * e.factor;
          if (sig > best) best = sig;
        }
      }
    }
    return clamp(best, 0, 1);
  }
  function nodeBottleneck(state, n, fx) {
    const path = bfsPath(state, n.id);
    if (!path) return null;
    let bottleneck = (n.capacity || 0) * nodeWeatherFactor(state, n) * (1 - 0.5 * interferenceFor(state, n, n.channel));
    let cong = 1;
    for (const id of path) {
      const l = linkById(state, id);
      if (!l) continue;
      const effCap = linkEffCapacity(state, l, fx);
      bottleneck = Math.min(bottleneck, effCap);
      if (effCap > 0 && (l.usage || 0) > effCap) cong = Math.min(cong, effCap / l.usage);
    }
    return { bottleneck, cong };
  }
  function prepareSpeedField(state) {
    const fx = staffEffects(state);
    const nodes = [];
    const byId = {};
    for (const n of (state.nodes || [])) {
      const tech = techOfNode(n.type);
      if (!tech || !isUsableNode(n) || !n.connected) continue;
      const bn = nodeBottleneck(state, n, fx);
      if (!bn) continue;
      const e = {
        id: n.id, x: n.x, y: n.y, radius: n.radius || 0, tech,
        bottleneck: bn.bottleneck, cong: bn.cong,
        // TD-LTE از همان دکل (با ظرفیت ماژول) در میدان سرعت حساب می‌شود
        fwaBottleneck: tdlteCapacity(n) > 0 ? Math.min(tdlteCapacity(n), bn.bottleneck) : 0,
        angle: n.angle == null ? 360 : n.angle, direction: n.direction || 0,
      };
      nodes.push(e);
      byId[n.id] = e;
    }
    const fiberByBuilding = {};
    for (const fd of (state.fiberDrops || [])) {
      if (fd.status !== 'active') continue;
      const src = byId[fd.nodeId];
      if (!src) continue;
      fiberByBuilding[fd.buildingId] = { src, medium: fd.medium || 'fiber' };
    }
    return { state, nodes, buckets: fieldBuckets(nodes), fiberByBuilding };
  }
  function speedFieldAt(prep, x, y) {
    let best = 0;
    // حاشیهٔ ۲۲ واحدی دور ساختمان: شبکهٔ نمونه‌برداری هیت‌مپ (گام ۲۰ تا ۴۰) نباید
    // ساختمان‌های کوچکِ دارای انشعاب سیمی را کاملاً از دست بدهد (مسی/فیبر نامرئی می‌شد)
    const bAt = buildingAtPointGrid(prep.state, x, y, 22);
    const cx = Math.floor(x / FIELD_CELL), cy = Math.floor(y / FIELD_CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = prep.buckets.get((cx + i) + ',' + (cy + j));
        if (!arr) continue;
        for (const e of arr) {
          if (e.tech === 'fiber') continue; // فیبر جداگانه (با ساختمان) حساب می‌شود
          const d = dist(x, y, e.x, e.y);
          if (d > e.radius || !wedgeOk(e, x, y)) continue;
          const distFactor = 1 - 0.5 * clamp(d / Math.max(1, e.radius || 1), 0, 1);
          const att = wirelessAttFactor(prep.state, e.tech, e.x, e.y, x, y);
          const spd = Math.round(e.bottleneck * distFactor * att * e.cong);
          if (spd > best) best = spd;
        }
      }
    }
    // سیمی: ساختمانِ دارای انشعاب از انشعاب خودش (مسی با سقف DSL)؛ وگرنه گره‌های فیبری نزدیک (مثل speedTestAt)
    const fDrop = bAt ? prep.fiberByBuilding[bAt.id] : null;
    if (fDrop) {
      const e = fDrop.src;
      const d = dist(x, y, e.x, e.y);
      const distFactor = 1 - 0.5 * clamp(d / Math.max(1, e.radius || 1), 0, 1);
      let spd = Math.round(e.bottleneck * distFactor * e.cong);
      if (fDrop.medium === 'copper') spd = Math.min(spd, COPPER_DROP_SPEED);
      if (spd > best) best = spd;
    } else {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const arr = prep.buckets.get((cx + i) + ',' + (cy + j));
          if (!arr) continue;
          for (const e of arr) {
            if (e.tech !== 'fiber') continue;
            const d = dist(x, y, e.x, e.y);
            if (d > e.radius || !wedgeOk(e, x, y)) continue;
            const distFactor = 1 - 0.5 * clamp(d / Math.max(1, e.radius || 1), 0, 1);
            const spd = Math.round(e.bottleneck * distFactor * e.cong);
            if (spd > best) best = spd;
          }
        }
      }
    }
    return best;
  }
  // نمونه‌برداری ردیفی برای ساخت تدریجی (چانک‌شده) لایه‌ها
  function sampleFieldRows(prep, kind, x0, y0, step, pw, rowStart, rowEnd, out) {
    for (let j = rowStart; j < rowEnd; j++) {
      const wy = y0 + (j + 0.5) * step;
      for (let i = 0; i < pw; i++) {
        const wx = x0 + (i + 0.5) * step;
        out[j * pw + i] = kind === 'signal' ? signalFieldAt(prep, wx, wy) : speedFieldAt(prep, wx, wy);
      }
    }
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
    const accessNodes = (state.nodes || []).filter((n) => nodeServes(state, n));
    const uncovered = (state.buildings || []).filter((b) => !b.districtId).filter((b) => {
      const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
      return !accessNodes.some((n) => dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy));
    });
    const results = [];
    for (let gx = 150; gx < W; gx += 300) {
      for (let gy = 150; gy < H; gy += 300) {
        if (!isValidPlacement(state, gx, gy).ok) continue;
        const dAt = districtAtPoint(state, gx, gy);
        if (dAt && !districtUnlocked(dAt)) continue; // در منطقهٔ قفل‌شده پیشنهاد نمی‌دهیم
        let score = 0, subCap = 0;
        for (const d of (state.districts || [])) {
          if ((d.qos || 0) >= 0.5 && (d.subscribers || 0) >= Math.floor((d.population || 0) * 0.35)) continue;
          // بازارِ هنوز مشترک‌نشدهٔ منطقه (ترافیک بالقوه اگر همه مشترک شوند)
          const maxSubsD = Math.floor((d.population || 0) * 0.35);
          const unservedSubs = Math.max(0, maxSubsD - (d.subscribers || 0));
          const unserved = unservedSubs * perSubTraffic(state, d, 1);
          const dd = dist(gx, gy, d.x, d.y);
          if (dd < radius + coverReach(d)) {
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

  // کش گراف (مجاورت + نگاشت شناسه) برای BFS سریع؛ با تغییر طول/هویت آرایه‌ها خودکار تازه می‌شود
  const _graphCaches = new WeakMap();
  function graphCache(state) {
    const c = _graphCaches.get(state);
    if (c && c.nodesRef === state.nodes && c.linksRef === state.links && c.nl === state.nodes.length && c.ll === state.links.length) return c;
    const nodes = new Map(), links = new Map(), adj = new Map(), pairs = new Map();
    for (const n of state.nodes) { nodes.set(n.id, n); if (!adj.has(n.id)) adj.set(n.id, []); }
    for (const l of state.links) {
      links.set(l.id, l);
      if (adj.has(l.from)) adj.get(l.from).push({ to: l.to, link: l });
      if (adj.has(l.to)) adj.get(l.to).push({ to: l.from, link: l });
      const key = String(l.from) < String(l.to) ? l.from + '|' + l.to : l.to + '|' + l.from;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(l);
    }
    const nc = { nodesRef: state.nodes, linksRef: state.links, nl: state.nodes.length, ll: state.links.length, nodes, links, adj, pairs };
    _graphCaches.set(state, nc);
    return nc;
  }
  function nodeById(state, id) { return graphCache(state).nodes.get(id) || null; }
  function linkById(state, id) { return graphCache(state).links.get(id) || null; }
  // نام فارسی رسانهٔ لینک برای پیام‌های کاربر
  function mediumFa(medium) {
    const info = DATA && DATA.linkMedia && DATA.linkMedia[medium];
    return (info && info.name) || 'ارتباطی';
  }

  function isUsableNode(n) { return n && (n.status === 'active' || n.status === 'unconnected'); }
  function isUsableLink(l) { return l && (l.status === 'active' || l.status === 'congested'); }

  // ---------- ساخت بازی جدید ----------
  // اندازهٔ جهان هر بازی: بازی جدید از DATA (نقشهٔ بزرگ)، ذخیره‌های قدیمی جهان خودشان را نگه می‌دارند
  function worldSize(state) {
    return {
      w: (state && state.worldW) || (DATA.world && DATA.world.width) || 7200,
      h: (state && state.worldH) || (DATA.world && DATA.world.height) || 5400,
    };
  }
  function newGame(seed, opts) {
    opts = opts || {};
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
      inventory: {},
      packages: JSON.parse(JSON.stringify(DATA.packageList || DATA.packages || [])),
      missions: JSON.parse(JSON.stringify(DATA.missions || [])).map((m) => ({ ...m, done: false, progress: 0 })),
      tutorialStep: 0,
      log: [],
      problems: [],
      settings: { autoFailover: true },
      failoverActive: false,
      counters: { node: 0, link: 0, staff: 0, problem: 0, building: genBuildings.length, individual: 0, contract: 0, campaign: 0, built: 0, contractsDone: 0, campaignsRun: 0, profitMonths: 0, fiberDrop: 0 },
      // ساعت روز (۰ تا ۲۴) و آب‌وهوای جاری
      hour: 10,
      pendingDays: 0,
      weather: { kind: 'clear', untilDay: 1 },
      // دستاوردها، مشترکان فردی، کمپین‌ها، تاریخچه
      achievements: {},
      newAchievements: [],
      individuals: [],
      campaigns: [],
      fiberDrops: [],
      history: [],
      activeEffects: [],
      _eventCooldowns: {},
      spectatorAI: false,
      lastTax: 0,
      penetration: 0,
      bankruptcyWarning: false,
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
      worldW: (DATA.world && DATA.world.width) || 14400,
      worldH: (DATA.world && DATA.world.height) || 10800,
      installPoints: genInstallPoints,
      mapSeed: s,
      map: gen ? { river: gen.river, bridges: gen.bridges, roads: gen.roads, parks: gen.parks } : null,
      // ساختمان‌های پراکندهٔ خارج از مناطق: تقاضا/مشترک تجمیعی (هر جای نقشه به‌جز رودخانه)
      scattered: { subscribers: 0, demand: 0, servedDemand: 0, qos: 0, satisfaction: 0, revenue: 0, potentialSubs: 0, buildingCount: 0, coveredCount: 0 },
    };

    // مناطق runtime — فقط مرکز شهر و حاشیهٔ شمالی (نزدیک HQ) در شروع بازند؛ بقیه قفل‌اند
    const growthCfg = DATA.growth || {};
    const capMult = growthCfg.capMultiplier || {};
    state.districts = genDistricts.map((d) => ({
      id: d.id, name: d.name, type: d.type, x: d.x, y: d.y, radius: d.radius, baseRadius: d.radius,
      buildingCap: Math.max(1, Math.round(genBuildings.filter((b) => b.districtId === d.id).length * (capMult[d.type] || 1.5))),
      population: d.population, demandBase: d.demandBase, usageMult: 1,
      priceSensitivity: d.priceSensitivity, potentialRevenue: d.potentialRevenue,
      unlocked: d.id === 'center' || d.id === 'north',
      demand: 0, servedDemand: 0, subscribers: 0, rivalSubscribers: 0,
      qos: 0, potentialQos: 0, satisfaction: 0, revenue: 0, complaints: 0, connected: false,
      avgLatency: 0, jitter: 0, perSubMbps: 0, commuteCoverage: null, eraFactor: 1, _qosAcc: 0, _qosDays: 0,
    }));
    state.year = yearOf(state);
    state.eraYear = (eraOf(state) || {}).year || TL.startYear;
    state.districts.forEach((d) => { d.techDemand = computeTechDemand(d, [], 1, null, state); });
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
      modules: Array(smallestPowerLevelFor((coreEq && coreEq.powerDraw) || 0)).fill('power'), baseCapacity: coreEq ? coreEq.capacity : 40000, baseRadius: 0,
      tech: null, direction: 0, angle: 360, power: 1,
      buildTimer: 0, usage: 0, connected: true, channel: null, interference: 0,
    };
    const gw = {
      id: 'n' + (++state.counters.node), type: 'internet_gateway', name: gwEq ? gwEq.name : 'دروازه اینترنت',
      x: hq.x + 140, y: hq.y, status: 'active', health: 100,
      capacity: gwEq ? gwEq.capacity : 40000, radius: 0,
      modules: Array(smallestPowerLevelFor((gwEq && gwEq.powerDraw) || 0)).fill('power'), baseCapacity: gwEq ? gwEq.capacity : 40000, baseRadius: 0,
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

    // شرکت رقیب (اختیاری): پیش‌فرض در جریان بازی روشن است؛ در سیم پیش‌فرض خاموش تا تست‌ها/ذخیره‌های قدیمی دست نخورند.
    state.rival = { enabled: opts.rival === true, cash: 60000, price: RIVAL_PRICE, lastBuildDay: 2, nodesBuilt: 0 };
    if (state.rival.enabled) {
      // مرکز دادهٔ رقیب در دورترین منطقه از HQ بازیکن
      let farD = null, farDist = -1;
      for (const d of state.districts) {
        const dd = dist(hq.x, hq.y, d.x, d.y);
        if (dd > farDist) { farDist = dd; farD = d; }
      }
      const rc = rivalBuildNode(state, 'core_router', farD.x, farD.y, true);
      const rg = rivalBuildNode(state, 'internet_gateway', farD.x + 140, farD.y, true);
      if (rc && rg) {
        state.links.push({ id: 'l' + (++state.counters.link), from: rc.id, to: rg.id, medium: 'fiber', capacity: 10000, latency: 2, status: 'active', isBackup: false, usage: 0 });
      }
      log(state, 'یک شرکت رقیب هم در شهر شروع به کار کرده است؛ مرکز داده‌اش در «' + (farD ? farD.name : 'دوردست') + '» است.', 'info');
    }

    log(state, 'شرکت مخابراتی شما تأسیس شد. هسته و دروازه اینترنت در مرکز داده فعال‌اند.', 'info');
    return state;
  }

  // ---------- در دسترس‌بودن تجهیزات (خط زمانی) ----------
  // هر تجهیز از سال دورانش در دسترس است؛ گره‌های ساخته‌شدهٔ قبلی (ذخیره‌های قدیمی) سر جایشان می‌مانند.
  function isUnlocked(state, eqId) {
    const eq = getEq(eqId);
    if (!eq) return false;
    return yearOf(state) >= (eq.era || TL.startYear);
  }

  // ---------- ساخت گره ----------
  function buildNode(state, eqId, x, y, opts) {
    opts = opts || {};
    const eq = getEq(eqId);
    if (!eq) { log(state, 'تجهیز ناشناخته است.', 'error'); return null; }
    // کابل‌ها رسانهٔ اتصال‌اند، نه گره قابل ساخت (با ابزار «اتصال» بین دو گره کشیده می‌شوند)
    if (eq.buildable === false) {
      log(state, '«' + eq.name + '» گره قابل ساخت نیست؛ کابل با ابزار «اتصال» بین دو گره کشیده می‌شود.', 'error');
      return null;
    }
    if (!isUnlocked(state, eqId)) {
      log(state, '«' + eq.name + '» هنوز در این دوران نیست؛ از سال ' + (eq.era || TL.startYear) + ' در دسترس می‌شود.', 'error');
      return null;
    }
    // در منطقهٔ قفل‌شده نمی‌شود ساخت (ساختمان‌های پراکنده بیرون از همهٔ مناطق همیشه آزادند)
    const dAt = districtAtPoint(state, x, y);
    if (dAt && !districtUnlocked(dAt)) {
      log(state, 'منطقهٔ «' + dAt.name + '» هنوز باز نشده است؛ اول آن را باز کنید.', 'error');
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
      status: 'active', // ساخت آنی است
      health: 100,
      capacity: eq.capacity || 0,
      radius: eq.radius || 0,
      modules: Array(smallestPowerLevelFor(eq.powerDraw || 0)).fill('power'), // منبع تغذیهٔ پایه در قیمت ساخت هست
      baseCapacity: eq.capacity || 0,
      baseRadius: eq.radius || 0,
      tech: CELL_TECH[eqId] || null,
      direction: opts.direction !== undefined ? opts.direction : 0,
      angle: (DATA.beamwidthByEq && DATA.beamwidthByEq[eqId]) || (opts.angle !== undefined ? opts.angle : 360),
      power: opts.power !== undefined ? opts.power : 1,
      buildTimer: 0,
      usage: 0,
      connected: false,
      installPointId: opts.installPointId || null,
      channel: null,
      interference: 0,
    };
    // کانال فرکانسی: برای فناوری‌های بی‌سیم، کم‌تداخل‌ترین کانال انتخاب می‌شود
    if (channelCountFor(node) > 0) node.channel = leastInterferedChannel(state, node);
    state.nodes.push(node);
    log(state, '«' + eq.name + '» ساخته شد (آنی).', 'build');
    refreshConnectivity(state);
    return node;
  }

  // ---------- رسانه‌های اتصال: قفل دوران + نظرسنجی پهپاد برای PtP ----------
  function mediumUnlockYear(medium) {
    const mi = (DATA.linkMedia && DATA.linkMedia[medium]) || {};
    return mi.era || TL.startYear;
  }
  // پهپاد نقشه‌برداری: قبل از ساخت لینک نقطه‌به‌نقطه، خط دید و ظرفیت مؤثر را بررسی می‌کند.
  function surveyPtP(state, aId, bId) {
    const a = nodeById(state, aId), b = nodeById(state, bId);
    if (!a || !b) return null;
    const d = dist(a.x, a.y, b.x, b.y);
    const mi = (DATA.linkMedia && DATA.linkMedia.ptp) || {};
    const maxRange = mi.maxRange || 1800;
    const losFactor = ptpLosFactor(state, a, b);
    const blocked = losFactor < 1;
    let blockedByName = '';
    if (blocked) {
      for (const bd of (state.buildings || [])) {
        if ((bd.height || 0) < 10) continue;
        const bcx = bd.x + (bd.w || 26) / 2, bcy = bd.y + (bd.h || 20) / 2;
        const t = clamp(((bcx - a.x) * (b.x - a.x) + (bcy - a.y) * (b.y - a.y)) / (Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) || 1), 0, 1);
        if (dist(bcx, bcy, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)) < 45) { blockedByName = bd.name || 'ساختمان بلند'; break; }
      }
    }
    // ظرفیت مؤثر دقیقاً مثل لینک ساخته‌شده: پایه × ضریب فاصله × ضریب دید مستقیم
    const effCapacity = Math.round(linkBaseCapacity('ptp') * ptpDistanceFactor(state, a, b));
    return {
      distance: Math.round(d), maxRange, inRange: d <= maxRange,
      losClear: !blocked, losFactor, blockedByName,
      distanceFactor: clamp(1 - 0.6 * d / maxRange, 0.4, 1),
      effCapacity,
    };
  }
  // گزینه‌های رسانه برای پنل اتصال: هر رسانه با وضعیت قفل دوران و (برای PtP) نتیجهٔ نظرسنجی پهپاد
  function mediumOptions(state, aId, bId) {
    const y = yearOf(state);
    const a = nodeById(state, aId), b = nodeById(state, bId);
    const d = (a && b) ? dist(a.x, a.y, b.x, b.y) : 0;
    return ['fiber', 'ptp', 'ethernet', 'copper'].map((m) => {
      const mi = (DATA.linkMedia && DATA.linkMedia[m]) || {};
      const unlockYear = mi.era || TL.startYear;
      const opt = {
        medium: m, name: mi.name || m, capacity: mi.capacity || 0, latency: mi.latency || 0,
        cost: Math.round(d * linkCostPerUnit(m)),
        unlockYear, ok: y >= unlockYear, reason: y >= unlockYear ? '' : 'از سال ' + unlockYear,
      };
      if (opt.ok && a && b && (!mediumSupportedBy(a.type, m) || !mediumSupportedBy(b.type, m))) {
        opt.ok = false; opt.reason = 'یکی از دو گره این رسانه را پشتیبانی نمی‌کند';
      }
      if (opt.ok && m === 'ethernet' && d > (mi.maxRange || 600)) {
        opt.ok = false; opt.reason = 'اترنت فقط تا ' + (mi.maxRange || 600) + ' واحد (فاصله: ' + Math.round(d) + ')';
      }
      if (opt.ok && state.cash < opt.cost) { opt.ok = false; opt.reason = 'نقدینگی کافی نیست'; }
      if (m === 'ptp') opt.survey = surveyPtP(state, aId, bId);
      return opt;
    });
  }

  // ---------- شرکت رقیب: ساخت گره/لینک داخلی (بدون دخالت بازیکن) ----------
  const RIVAL_PRICE = 110; // قیمت بستهٔ خانگی رقیب (بازیکن: ۱۲۰) — ارزان‌تر، ولی کیفیتش از پوشش می‌آید
  function rivalBuildNode(state, eqId, x, y, free) {
    const eq = getEq(eqId);
    if (!eq) return null;
    // جای معتبر پیدا کن (نه روی ساختمان/رودخانه)
    let px = x, py = y, tries = 0;
    while (tries < 24 && !isValidPlacement(state, px, py).ok) {
      px = x + (rand(state) * 2 - 1) * 160;
      py = y + (rand(state) * 2 - 1) * 160;
      tries++;
    }
    if (!isValidPlacement(state, px, py).ok) return null;
    if (!free) {
      if (!state.rival || state.rival.cash < eq.cost) return null;
      state.rival.cash -= eq.cost;
    }
    const node = {
      id: 'n' + (++state.counters.node), type: eqId, name: eq.name + ' (رقیب)',
      x: Math.round(px), y: Math.round(py), status: 'active', health: 100,
      capacity: eq.capacity || 0, radius: eq.radius || 0,
      modules: Array(smallestPowerLevelFor(eq.powerDraw || 0)).fill('power'),
      baseCapacity: eq.capacity || 0, baseRadius: eq.radius || 0,
      tech: CELL_TECH[eqId] || null, direction: 0, angle: 360, power: 1,
      buildTimer: 0, usage: 0, connected: false, channel: null, interference: 0,
      owner: 'rival',
    };
    if (channelCountFor(node) > 0) node.channel = leastInterferedChannel(state, node);
    state.nodes.push(node);
    if (state.rival) state.rival.nodesBuilt = (state.rival.nodesBuilt || 0) + 1;
    return node;
  }
  function rivalConnect(state, aId, bId) {
    const a = nodeById(state, aId), b = nodeById(state, bId);
    if (!a || !b) return null;
    const y = yearOf(state);
    const d = dist(a.x, a.y, b.x, b.y);
    // رقیب هم هزینهٔ لینک را می‌پردازد (فاصله × هزینهٔ واحد)؛ رسانه‌ها به ترتیب ترجیح امتحان می‌شوند و اولینِ قابل‌خرید ساخته می‌شود
    const tries = [];
    if (y >= 1995) tries.push('fiber');
    if (y >= 1996 && d > 1200 && d <= 1800) tries.push('ptp');
    if (d <= 600) tries.push('ethernet');
    tries.push('copper');
    let medium = null, cost = 0;
    for (const m of tries) {
      const c = Math.round(d * linkCostPerUnit(m));
      if (!state.rival || state.rival.cash >= c) { medium = m; cost = c; break; }
    }
    if (!medium) return null;
    if (state.rival) state.rival.cash -= cost;
    const mi = (DATA.linkMedia && DATA.linkMedia[medium]) || { capacity: 1000, latency: 5 };
    const link = {
      id: 'l' + (++state.counters.link), from: aId, to: bId, medium,
      capacity: mi.capacity, latency: mi.latency, status: 'active', isBackup: false, usage: 0,
    };
    state.links.push(link);
    return link;
  }
  // هوش مصنوعی رقیب: حداکثر هر ۲ روز یک گره؛ منطقهٔ بی‌پوشش و پرجمعیت را هدف می‌گیرد.
  function rivalTick(state, dtDays) {
    const R = state.rival;
    if (!R || !R.enabled) return;
    const rSubs = (state.districts || []).reduce((s, d) => s + (d.rivalSubscribers || 0), 0);
    const rQosAvg = rSubs > 0 ? (state.districts || []).reduce((s, d) => s + (d.rivalQos || 0) * (d.rivalSubscribers || 0), 0) / rSubs : 0;
    R.cash += Math.round(rSubs * (R.price || RIVAL_PRICE) / 30 * dtDays * 0.55 * (0.55 + 0.45 * rQosAvg));
    // سرمایه‌گذار مادر رقیب: اگر نقدینگی رقیب تقریباً صفر شود، ماهی یک‌بار تا سقف محدود شارژ می‌شود تا رقابت نمیرد
    if (R.cash < 3000 && state.day - (R.lastTopUpDay || 0) >= 30) { R.cash = 20000; R.lastTopUpDay = state.day; }
    // رقیب خرابی‌های خودش را هم تعمیر می‌کند (از نقدینگی خودش)
    for (const n of (state.nodes || [])) {
      if (!isRivalNode(n) || n.status !== 'failed') continue;
      const eqN = getEq(n.type);
      const rc = Math.round((eqN ? eqN.cost : 10000) * 0.1);
      if (R.cash >= rc) { R.cash -= rc; n.status = 'active'; n.health = 85; }
    }
    for (const l of (state.links || [])) {
      if (l.status !== 'cut') continue;
      const la = nodeById(state, l.from);
      if (la && isRivalNode(la) && R.cash >= 800) { R.cash -= 800; l.status = 'active'; }
    }
    // اتصال دوبارهٔ دکل‌های رقیبِ متصل‌نشده (اگر قبلاً پول لینک نرسیده بود)
    for (const n of (state.nodes || [])) {
      if (!isRivalNode(n) || !isAccessNode(n) || n.connected || n.status !== 'active') continue;
      let up2 = null, up2d = Infinity;
      for (const m of (state.nodes || [])) {
        if (!isRivalNode(m) || m.id === n.id) continue;
        if (!(m.type === 'core_router' || m.type === 'aggregation' || m.type === 'router' || m.type === 'switch')) continue;
        const dd = dist(n.x, n.y, m.x, m.y);
        if (dd < up2d) { up2d = dd; up2 = m; }
      }
      if (up2) rivalConnect(state, n.id, up2.id);
    }
    if (state.day - (R.lastBuildDay || 0) < 3) return;
    if ((state.nodes || []).filter((n) => isRivalNode(n)).length >= 55) return; // سقف شبکهٔ رقیب
    const y = yearOf(state);
    // انتخاب منطقهٔ هدف
    let best = null, bestScore = -1;
    for (const d of (state.districts || [])) {
      const rivalHere = (state.nodes || []).filter((n) => isRivalNode(n) && isAccessNode(n) && dist(n.x, n.y, d.x, d.y) < (d.radius || 300) + 200).length;
      if (rivalHere >= 3) continue;
      // ورود به منطقهٔ قفل‌شده برای رقیب هزینهٔ ورود دارد (۲۰٪ هزینهٔ بازکردن بازیکن)؛ اگر توانش را ندارد سراغ منطقهٔ دیگری می‌رود
      const entryFee = (!districtUnlocked(d) && !d._rivalPaid) ? Math.round(districtUnlockCost(d) * 0.2) : 0;
      if (R.cash < 12000 + entryFee) continue;
      if ((d.rivalSubscribers || 0) >= (d.population || 0) * 0.35 * 0.6) continue; // بازار این منطقه برای رقیب اشباع است
      const playerHere = (state.nodes || []).some((n) => !isRivalNode(n) && isAccessNode(n) && isUsableNode(n) && n.connected && dist(n.x, n.y, d.x, d.y) < (d.radius || 300) + 200);
      const share = (d.rivalSubscribers || 0) / Math.max(1, (d.population || 1) * 0.35);
      let score = (d.population || 0) * (1 - share);
      if (!playerHere) score *= 1.6; // منطقهٔ بی‌پوشش بازیکن جذاب‌تر است
      if (rivalHere === 0) score *= 1.3;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (!best) return;
    // انتخاب تجهیز بر اساس دوران و بودجه
    let eqId;
    const roll = rand(state);
    if (y >= 2004 && roll < 0.2 && R.cash >= (getEq('ftth') || {}).cost) eqId = 'ftth';
    else if (y >= 1998 && roll < 0.35 && R.cash >= (getEq('street_cabinet') || {}).cost) eqId = 'street_cabinet';
    else if (y >= 2019 && R.cash >= 150000) eqId = 'cell_5g';
    else if (y >= 2009 && R.cash >= 60000) eqId = 'cell_4g';
    else if (y >= 2001 && R.cash >= 30000) eqId = 'cell_3g';
    else eqId = 'cell_2g';
    const eq = getEq(eqId);
    if (!eq || R.cash < eq.cost) return;
    // ساخت در منطقهٔ قفل‌شده برای بازیکن: رقیب معادل هزینهٔ بازکردن منطقه را یک‌بار می‌پردازد
    let unlockFee = 0;
    if (!districtUnlocked(best) && !best._rivalPaid) {
      unlockFee = Math.round(districtUnlockCost(best) * 0.2);
      if (R.cash < eq.cost + unlockFee) return;
    }
    const tx = best.x + (rand(state) * 2 - 1) * (best.radius || 300) * 0.5;
    const ty = best.y + (rand(state) * 2 - 1) * (best.radius || 300) * 0.5;
    // نزدیک‌ترین گرهٔ بالادستی رقیب
    let up = null, upDist = Infinity;
    for (const n of (state.nodes || [])) {
      if (!isRivalNode(n)) continue;
      if (!(n.type === 'core_router' || n.type === 'aggregation' || n.type === 'router' || n.type === 'switch')) continue;
      const dd = dist(tx, ty, n.x, n.y);
      if (dd < upDist) { upDist = dd; up = n; }
    }
    if (!up) return;
    // اگر خیلی دور است، اول یک گره واسط وسط راه می‌سازد (روتر قبل از ۲۰۰۰، تجمیع بعد از آن)
    const relayId = y >= 2000 ? 'aggregation' : 'router';
    if (upDist > 2400 && R.cash >= ((getEq(relayId) || {}).cost || 10000) + eq.cost) {
      const agg = rivalBuildNode(state, relayId, (tx + up.x) / 2, (ty + up.y) / 2, false);
      if (agg) {
        rivalConnect(state, agg.id, up.id);
        R.lastBuildDay = state.day;
        log(state, 'شرکت رقیب یک «' + (getEq(relayId) || {}).name + ' (رقیب)» ساخت تا شبکه‌اش را به «' + best.name + '» برساند.', 'info');
        refreshConnectivity(state);
        return;
      }
    }
    const node = rivalBuildNode(state, eqId, tx, ty, false);
    if (!node) return;
    if (unlockFee > 0) { R.cash -= unlockFee; best._rivalPaid = true; }
    rivalConnect(state, node.id, up.id);
    R.lastBuildDay = state.day;
    log(state, 'شرکت رقیب یک «' + eq.name + '» در «' + best.name + '» ساخت.', 'info');
    refreshConnectivity(state);
  }

  // ---------- اتصال دو گره با لینک ----------
  function connect(state, fromId, toId, medium, opts) {
    opts = opts || {};
    const a = nodeById(state, fromId);
    const b = nodeById(state, toId);
    if (!a || !b) { log(state, 'اتصال ناموفق: گره مبدأ یا مقصد وجود ندارد.', 'error'); return null; }
    if (fromId === toId) { log(state, 'اتصال گره به خودش ممکن نیست.', 'error'); return null; }
    if (ownerOf(a) !== ownerOf(b)) { log(state, 'نمی‌توان به گره شرکت رقیب وصل شد.', 'error'); return null; }
    // دکل سلولی فقط برای سرویس به مشترک است: به گره دسترسی دیگری (دکل/FTTH/کابینت) وصل نمی‌شود
    // تا ترافیک گره‌های دیگر از آن عبور نکند؛ بک‌هال دکل مستقیم به تجمیع/هسته/روتر/سوئیچ است.
    const ACCESS_NODE_TYPES = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g', 'ftth', 'street_cabinet'];
    if ((isCellTower(a) && ACCESS_NODE_TYPES.includes(b.type)) || (isCellTower(b) && ACCESS_NODE_TYPES.includes(a.type))) {
      log(state, 'دکل فقط برای سرویس به مشترک است و ترافیک گره‌های دیگر از آن عبور نمی‌کند؛ دکل را مستقیم به تجمیع/هسته وصل کنید.', 'error');
      return null;
    }
    medium = medium || 'fiber';
    const mediaInfo = (DATA.linkMedia && DATA.linkMedia[medium]) || { capacity: 1000, latency: 5 };
    // روش‌های اتصال هم با خط زمانی باز می‌شوند: مسی/اترنت از ۱۹۹۱، فیبر ۱۹۹۵، نقطه‌به‌نقطه ۱۹۹۶.
    if (!opts.internal && yearOf(state) < (mediaInfo.era || TL.startYear)) {
      log(state, 'اتصال «' + mediumFa(medium) + '» هنوز در این دوران نیست؛ از سال ' + mediaInfo.era + ' در دسترس می‌شود.', 'error');
      return null;
    }

    // رسانهٔ ناشناخته (از جمله رسانه‌های حذف‌شده در نسخه‌های قبلی) لینک نمی‌سازد
    if (DATA.linkMedia && !DATA.linkMedia[medium]) {
      log(state, 'رسانهٔ اتصال نامعتبر است.', 'error');
      return null;
    }

    // هر دو گره باید این رسانه را برای لینک گره‌به‌گره پشتیبانی کنند (مشخصهٔ connects تجهیزات)
    if (!opts.internal && (!mediumSupportedBy(a.type, medium) || !mediumSupportedBy(b.type, medium))) {
      log(state, 'یکی از دو گره اتصال «' + mediumFa(medium) + '» را پشتیبانی نمی‌کند؛ رسانهٔ دیگری انتخاب کنید.', 'error');
      return null;
    }

    const linkDist = dist(a.x, a.y, b.x, b.y);
    if (medium === 'ptp') {
      const maxRange = mediaInfo.maxRange || 1800;
      if (linkDist > maxRange) {
        log(state, 'لینک نقطه‌به‌نقطه از حداکثر برد بیشتر است؛ فاصلهٔ دو گره ' + Math.round(linkDist) + ' واحد و حداکثر برد ' + maxRange + ' واحد است. یک گره واسط نزدیک‌تر انتخاب کن یا از فیبر استفاده کن.', 'error');
        return null;
      }
    }
    // اترنت فقط رسانهٔ لینک‌های کوتاه است (حداکثر ۶۰۰ واحد)
    if (medium === 'ethernet') {
      const maxRange = mediaInfo.maxRange || 600;
      if (linkDist > maxRange) {
        log(state, 'اترنت فقط برای لینک‌های کوتاه است (حداکثر ' + maxRange + ' واحد)؛ فاصلهٔ دو گره ' + Math.round(linkDist) + ' واحد است. برای مسیر بلندتر فیبر، مسی یا نقطه‌به‌نقطه انتخاب کنید.', 'error');
        return null;
      }
    }

    // هزینهٔ لینک = فاصله × هزینهٔ واحد رسانه (برای همهٔ مسیرها: ساخت، موازی، تغییر نوع).
    // انشعاب ساختمان←کابینت جدا و رایگان است (هزینهٔ نصب با مشترک است).
    const cost = opts.internal ? 0 : linkCostFor(state, a, b, medium);
    if (cost > 0 && !isRivalNode(a)) {
      if (state.cash < cost) {
        log(state, 'بودجه کافی برای ساخت لینک ' + mediumFa(medium) + ' نیست. هزینه: ' + cost, 'error');
        return null;
      }
      state.cash -= cost;
      state.totalCosts += cost;
    }

    // لینک موازی مجاز است: بین همان دو گره می‌شود چند لینک (با رسانهٔ یکسان یا متفاوت) ساخت؛
    // هرکدام ظرفیت خودش را دارد و ترافیک خودکار بینشان تقسیم می‌شود (بالانس بار).

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

  // ---------- تغییر نوع لینک (ارتقای سطح لینک حذف شده است؛ افزایش پهنای باند فقط با لینک موازی و ماژول گره) ----------
  const LINK_MEDIUM_COST = { fiber: 5000, copper: 2000, ptp: 18000, ethernet: 3000 };
  const LINK_CHANGE_DAYS = { fiber: 0.5, copper: 0.25, ptp: 0.25, ethernet: 0.25 };

  function linkBaseCapacity(medium) {
    const mi = (DATA.linkMedia && DATA.linkMedia[medium]) || {};
    return mi.capacity || 1000;
  }
  // ظرفیت هر لینک همیشه ظرفیت پایهٔ رسانه‌اش است (سطح ندارد)
  function linkCapacityFor(medium) {
    return linkBaseCapacity(medium);
  }
  // آیا این نوع گره (طبق مشخصهٔ connects در داده‌ها) این رسانه را برای لینک گره‌به‌گره پشتیبانی می‌کند؟
  // هزینهٔ ساخت یک لینک: فاصله × هزینهٔ واحد رسانه (از DATA.media)
  function linkCostPerUnit(medium) {
    const m = (DATA.media || []).find((x) => x.id === medium);
    return m ? (m.costPerUnit || 0) : 0;
  }
  function linkCostFor(state, a, b, medium) {
    if (!a || !b) return 0;
    return Math.round(dist(a.x, a.y, b.x, b.y) * linkCostPerUnit(medium));
  }
  function mediumSupportedBy(nodeType, medium) {
    const eq = DATA.equipment && DATA.equipment[nodeType];
    if (!eq || !eq.connects) return medium === 'fiber' || medium === 'copper';
    return eq.connects.some((c) => c.medium === medium && (c.targets || []).includes('node'));
  }
  // گزینه‌های تغییر رسانه برای پنل لینک: ظرفیت، هزینه، زمان و دلیل غیرفعال‌بودن
  function linkChangeOptions(state, linkId) {
    const link = (state.links || []).find((l) => l.id === linkId);
    if (!link) return [];
    const a = nodeById(state, link.from);
    const b = nodeById(state, link.to);
    const linkDist = (a && b) ? dist(a.x, a.y, b.x, b.y) : 0;
    const media = ['fiber', 'copper', 'ethernet', 'ptp'];
    return media.map((m) => {
      const opt = {
        medium: m,
        name: ((DATA.linkMedia && DATA.linkMedia[m]) || {}).name || m,
        capacity: linkCapacityFor(m, link.level || 1),
        // تغییر نوع = کشیدن رسانهٔ جدید روی همان مسیر: فاصله × هزینهٔ واحد × ۰٫۶ (مسیر آماده است)
        cost: Math.round(linkDist * linkCostPerUnit(m) * 0.6),
        days: 0, // تغییر نوع لینک آنی است
        current: m === link.medium,
        ok: true, reason: '',
      };
      if (opt.current) { opt.ok = false; opt.reason = 'نوع فعلی لینک'; return opt; }
      if (!mediumSupportedBy(a && a.type, m) || !mediumSupportedBy(b && b.type, m)) {
        opt.ok = false; opt.reason = 'یکی از دو گره این رسانه را پشتیبانی نمی‌کند'; return opt;
      }
      const mEra = ((DATA.linkMedia && DATA.linkMedia[m]) || {}).era || TL.startYear;
      if (yearOf(state) < mEra) { opt.ok = false; opt.reason = 'از سال ' + mEra; return opt; }
      if (m === 'ptp' && linkDist > ((DATA.linkMedia.ptp || {}).maxRange || 1800)) {
        opt.ok = false; opt.reason = 'فاصله بیش از برد نقطه‌به‌نقطه (۱۸۰۰ واحد)'; return opt;
      }
      if (m === 'ethernet' && linkDist > ((DATA.linkMedia.ethernet || {}).maxRange || 600)) {
        opt.ok = false; opt.reason = 'اترنت فقط برای لینک‌های کوتاه است (حداکثر ۶۰۰ واحد)'; return opt;
      }
      if (state.cash < opt.cost) { opt.ok = false; opt.reason = 'نقدینگی کافی نیست'; return opt; }
      return opt;
    });
  }
  function changeLinkMedium(state, linkId, newMedium) {
    const link = (state.links || []).find((l) => l.id === linkId);
    if (!link) return { ok: false, error: 'لینک پیدا نشد.' };
    const opt = linkChangeOptions(state, linkId).find((o) => o.medium === newMedium);
    if (!opt) return { ok: false, error: 'رسانه نامعتبر است.' };
    if (!opt.ok) return { ok: false, error: opt.reason || 'تغییر ممکن نیست.' };
    state.cash -= opt.cost;
    // تغییر نوع لینک آنی است: بدون قطعی و بدون زمان انتظار
    link.medium = newMedium;
    link.capacity = linkCapacityFor(newMedium, link.level || 1);
    link.status = 'active';
    log(state, 'نوع لینک به «' + opt.name + '» تغییر کرد (آنی).', 'build');
    refreshConnectivity(state);
    return { ok: true, cost: opt.cost, days: 0 };
  }
  function toggleLinkBackup(state, linkId) {
    const link = (state.links || []).find((l) => l.id === linkId);
    if (!link) return { ok: false, error: 'لینک پیدا نشد.' };
    link.isBackup = !link.isBackup;
    log(state, link.isBackup ? 'لینک به حالت پشتیبان رفت.' : 'لینک به حالت اصلی برگشت.', 'info');
    refreshConnectivity(state);
    return { ok: true, isBackup: link.isBackup };
  }
  function connectedSetExcluding(state, excludeLinkId) {
    const set = new Set();
    const gateways = state.nodes.filter((n) => n.type === 'internet_gateway' && isUsableNode(n));
    const gc = graphCache(state);
    const q = gateways.map((g) => g.id);
    q.forEach((id) => set.add(id));
    let qHead = 0;
    while (qHead < q.length) {
      const cur = q[qHead++];
      // دکل سلولی برگ است: از آن به گره‌های دیگر راه نمی‌رویم (ترافیک عبوری ندارد)
      if (isCellTower(gc.nodes.get(cur))) continue;
      const edges = gc.adj.get(cur) || [];
      for (const e of edges) {
        const l = e.link;
        if (l.id === excludeLinkId) continue;
        if (!isUsableLink(l)) continue;
        if (l.isBackup && !state.failoverActive) continue;
        const nxt = e.to;
        if (set.has(nxt)) continue;
        const nn = gc.nodes.get(nxt);
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
    const la0 = nodeById(state, l.from);
    if (la0 && isRivalNode(la0)) return { ok: false, error: 'این لینک متعلق به شرکت رقیب است.' };
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
    const gc = graphCache(state);
    const visited = new Map(); // nodeId -> {prevNode, linkId}
    const queue = [start.id];
    let qHead = 0;
    visited.set(start.id, null);
    while (qHead < queue.length) {
      const cur = queue[qHead++];
      const curNode = gc.nodes.get(cur);
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
      // دکل سلولی برگ است: ترافیک گره‌های دیگر از آن عبور نمی‌کند
      // (مگر این‌که خود دکل نقطهٔ شروع باشد و بک‌هالش را پیدا کنیم)
      if (isCellTower(curNode) && cur !== start.id) continue;
      const edges = gc.adj.get(cur) || [];
      for (const e of edges) {
        const l = e.link;
        if (excludeCut && !isUsableLink(l)) continue;
        if (opts.excludeLinks && opts.excludeLinks.has(l.id)) continue;
        // لینک پشتیبان فقط وقتی فیل‌اور فعال است (یا جست‌وجوی مسیر جایگزین) ترافیک می‌گیرد
        if (l.isBackup && !state.failoverActive && !opts.allowBackup) continue;
        const nxt = e.to;
        if (visited.has(nxt)) continue;
        const nn = gc.nodes.get(nxt);
        if (!nn || nn.status === 'failed' || nn.status === 'building') continue;
        if (ownerOf(nn) !== ownerOf(start)) continue; // ترافیک هر شرکت فقط روی شبکهٔ خودش می‌رود
        visited.set(nxt, { prev: cur, linkId: l.id });
        queue.push(nxt);
      }
    }
    return null;
  }

  // ---------- بالانس خودکار ترافیک روی لینک‌های موازی و مسیرهای موازی ----------
  // لینک‌های موازیِ قابل‌استفاده بین دو گره (همان قواعد bfsPath: قطع/پشتیبان کنار گذاشته می‌شوند)
  function parallelLinks(state, aId, bId) {
    const key = String(aId) < String(bId) ? aId + '|' + bId : bId + '|' + aId;
    const bucket = graphCache(state).pairs.get(key) || [];
    return bucket.filter((l) => {
      if (!isUsableLink(l)) return false;
      if (l.isBackup && !state.failoverActive) return false;
      return true;
    });
  }
  // ظرفیت مؤثر مجموع یک قطعه (مجموع لینک‌های موازی بین دو گره)
  function segmentEffCapacity(state, aId, bId, fx) {
    return parallelLinks(state, aId, bId).reduce((s, l) => s + linkEffCapacity(state, l, fx), 0);
  }
  // گلوگاه یک مسیر متناوب [گره، لینک، گره، ...]: کمترین ظرفیت مؤثر قطعه‌ها (با تجمیع موازی‌ها)
  function pathBottleneck(state, path, fx) {
    let bn = Infinity;
    for (const id of path) {
      const l = linkById(state, id);
      if (l) bn = Math.min(bn, segmentEffCapacity(state, l.from, l.to, fx));
    }
    return bn === Infinity ? 0 : bn;
  }
  // ثبت ترافیک روی یک مسیر: سهم هر قطعه بین لینک‌های موازی به نسبت ظرفیت مؤثرشان تقسیم می‌شود،
  // پس بهره‌برداری همهٔ موازی‌ها تقریباً برابر می‌ماند و با حذف/خرابی یکی، بار روی بقیه می‌افتد.
  function chargePath(state, path, share, fx) {
    if (!(share > 0)) return;
    for (const id of path) {
      const l = linkById(state, id);
      if (l) {
        const pars = parallelLinks(state, l.from, l.to);
        const caps = pars.map((p) => linkEffCapacity(state, p, fx));
        const tot = caps.reduce((a, b) => a + b, 0);
        if (tot > 0) pars.forEach((p, j) => { p.usage += share * (caps[j] / tot); });
        else l.usage += share;
        continue;
      }
      const nn = nodeById(state, id);
      if (nn) nn.usage += share;
    }
  }
  // تا maxPaths مسیر با گام اول متفاوت از گره تا دروازه (برای تقسیم بار بین مسیرهای موازی؛
  // گام‌های پایانی مشترک مثل هسته←دروازه در همهٔ مسیرها می‌مانند)
  function bfsPaths(state, startId, maxPaths) {
    const paths = [];
    const excluded = new Set();
    for (let k = 0; k < maxPaths; k++) {
      const p = bfsPath(state, startId, { excludeLinks: excluded });
      if (!p) break;
      paths.push(p);
      const firstLink = p.find((id) => linkById(state, id));
      if (firstLink) excluded.add(firstLink);
    }
    return paths;
  }
  // تقسیم سهم ترافیک یک گرهٔ سرویس‌دهنده بین مسیرهای موازی‌اش به نسبت گلوگاه هر مسیر
  function chargeBalanced(state, paths, share, fx) {
    if (!paths.length || !(share > 0)) return;
    const weights = paths.map((p) => Math.max(1, pathBottleneck(state, p, fx)));
    const wTot = weights.reduce((a, b) => a + b, 0);
    paths.forEach((p, j) => chargePath(state, p, share * (weights[j] / wTot), fx));
  }

  function servingNodeForDistrict(state, district) {
    let best = null, bestScore = -1;
    for (const n of state.nodes) {
      if (!isAccessNode(n)) continue;
      if (!isUsableNode(n) || isRivalNode(n)) continue;
      if (!inWedge(n, district.x, district.y)) continue;
      const d = dist(district.x, district.y, n.x, n.y);
      const reach = (n.radius || 0) + coverReach(district);
      if (d > reach) continue;
      // ساختمان‌های بلند بین گره و مرکز منطقه دید TD-LTE/وای‌فای را می‌بندند (سلولار از ساختمان اثر نمی‌گیرد)
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

  // ---------- اثرات موقت رویدادها (جشنواره، نوروز، یلدا و…) ----------
  // هر اثر تا روز مشخصی فعال است و ضریب تقاضا را عوض می‌کند؛ سراسری یا محدود به نوع منطقه.
  function activeEffects(state) {
    const list = (state && state.activeEffects) || [];
    return list.filter((e) => e && (state.day || 1) <= (e.untilDay || 0));
  }
  function effectDemandMult(state, d) {
    let m = 1;
    for (const e of activeEffects(state)) {
      if (e.districtTypes && e.districtTypes.length) {
        if (d && e.districtTypes.includes(d.type)) m *= (e.demandMult || 1);
      } else if (e.districtId) {
        if (d && e.districtId === d.id) m *= (e.demandMult || 1);
      } else {
        m *= (e.demandMult || 1); // اثر سراسری: برای همه (مناطق و پراکنده‌ها)
      }
    }
    return m;
  }
  // برد پوشش منطقه برای تست «سرور پوشش‌دهنده»: بر پایهٔ شعاع ثابت منطقه (baseRadius)،
  // نه شعاع نمایشیِ پویا که با رشد/ریزش مشترک کوچک و بزرگ می‌شود.
  function coverReach(d) { return ((d && (d.baseRadius || d.radius)) || 0) * 0.6; }

  // ---------- محاسبه جریان ترافیک ----------
  function computeFlow(state, opts) {
    // noDailyEffects: فقط وضعیت اتصال و جریان لحظه‌ای تازه می‌شود؛ رشد/ریزش مشترک و رضایت (اثرات روزانه) دست نمی‌خورد
    const noDaily = !!(opts && opts.noDailyEffects);
    // صفر کردن مصرف‌ها
    state.links.forEach((l) => { l.usage = 0; if (l.status === 'congested') l.status = 'active'; });
    state.nodes.forEach((n) => { n.usage = 0; });

    // برق گره‌ها: مصرف بیشتر از توان منبع تغذیه = گره خاموش (بدون برق کافی) تا منبع آپگرید شود
    state.nodes.forEach((n) => {
      const pw = nodePowerInfo(n);
      n.powered = pw.ok;
      if (n.status === 'failed' || n.status === 'repairing' || n.status === 'building') return;
      if (!pw.ok && n.status !== 'nopower') n.status = 'nopower';
      else if (pw.ok && n.status === 'nopower') n.status = n.connected ? 'active' : 'unconnected';
    });

    // گره‌های متصل به دروازه اینترنت (BFS از همه دروازه‌ها)
    const connectedSet = new Set();
    const gateways = state.nodes.filter((n) => n.type === 'internet_gateway' && isUsableNode(n));
    const q = gateways.map((g) => g.id);
    q.forEach((id) => connectedSet.add(id));
    while (q.length) {
      const cur = q.shift();
      const curNode = nodeById(state, cur);
      // دکل سلولی برگ است: ترافیک گره‌های دیگر از آن عبور نمی‌کند
      if (isCellTower(curNode)) continue;
      for (const l of state.links) {
        if (!isUsableLink(l)) continue;
        if (l.isBackup && !state.failoverActive) continue;
        let nxt = null;
        if (l.from === cur) nxt = l.to; else if (l.to === cur) nxt = l.from; else continue;
        if (connectedSet.has(nxt)) continue;
        const nn = nodeById(state, nxt);
        if (!nn || !isUsableNode(nn)) continue;
        if (ownerOf(nn) !== ownerOf(curNode)) continue; // هر شرکت فقط روی شبکهٔ خودش
        connectedSet.add(nxt); q.push(nxt);
      }
    }
    state.nodes.forEach((n) => {
      n.connected = connectedSet.has(n.id);
      if (n.status === 'active' && !n.connected) n.status = 'unconnected';
      else if (n.status === 'unconnected' && n.connected) n.status = 'active';
    });
    const fx = staffEffects(state);

    // تداخل کانال و ظرفیت مؤثر هر گره دسترسی (تداخل × آب‌وهوا × بهرهٔ سکتور)
    for (const n of state.nodes) {
      if (isAccessNode(n) && isUsableNode(n)) {
        n.interference = interferenceFor(state, n, n.channel);
        // آنتن سکتوری باریک‌تر: پوشش کمتر ولی ظرفیت مؤثر بیشتر (بهرهٔ جهت‌دار، تا +۵۰٪ در باریک‌ترین حالت)
        const beam = n.angle == null ? 360 : n.angle;
        const sectorGain = beam < 360 ? 1 + (360 - beam) / 360 * 0.5 : 1;
        n._effCap = (n.capacity || 0) * nodeWeatherFactor(state, n) * (1 - 0.5 * n.interference) * sectorGain;
      } else {
        n._effCap = n.capacity || 0;
      }
    }
    // ضریب تقاضای فصل و ساعت روز (در ساعت ۱۰ و بهار = ۱٫۰)
    // در محاسبهٔ روزانه (tick) میانگین ۲۴ساعته به‌کار می‌رود تا اقتصاد به ساعت لحظهٔ tick حساس نباشد
    const hourFactor = (opts && opts.dailyAvg) ? dailyAvgDemandFactor() : demandFactorAtHour(state.hour);
    const demandTimeFactor = ((seasonOf(state).demandFactor) || 1) * hourFactor;

    // ترتیب اولویت هنگام failover: اضطراری (بیمارستان) و سازمانی/صنعتی اول
    const priority = (d) => (d.id === 'hospital' || d.type === 'medical' ? 0
      : (['industrial', 'heavy_industrial', 'commercial', 'government'].includes(d.type) ? 1 : 2));
    const ordered = state.districts.slice().sort((a, b) => priority(a) - priority(b));
    // کش مسیرهای موازی هر گرهٔ سرویس‌دهنده در همین محاسبه (بالانس خودکار بین مسیرها و لینک‌های موازی)
    const pathCache = new Map();
    const pathsFor = (nodeId) => {
      if (!pathCache.has(nodeId)) pathCache.set(nodeId, bfsPaths(state, nodeId, 3));
      return pathCache.get(nodeId);
    };

    let totalRevenue = 0, qosSum = 0, servedDistricts = 0;
    let joinsToday = 0, leavesToday = 0;

    for (const d of ordered) {
      // منطقهٔ قفل‌شده: هنوز در دسترس شرکت نیست — بدون سرویس، بدون مشترک، بدون درآمد
      // (آمار رضایت/کیفیت کل شهر هم فقط روی مناطق باز حساب می‌شود)
      if (!districtUnlocked(d)) {
        d.subscribers = 0; // منطقهٔ قفل‌شده هیچ مشترک بازیکنی ندارد
        d.servedDemand = 0; d.qos = 0; d.potentialQos = 0; d.connected = false;
        d.avgLatency = 0; d.jitter = 0; d.perSubMbps = 0; d.revenue = 0; d.complaints = 0;
        d.techDemand = computeTechDemand(d, [], 1, 0, state);
        const custL = (state.customers || []).find((c) => c.districtId === d.id);
        if (custL) custL.servingNodeId = null;
        continue;
      }
      // تقاضا فقط از مشترکان می‌آید: مشترک × سرعت بسته × ضریب هم‌زمانی × ضریب زمانی
      // (بدون مشترک، تقاضا و ترافیک صفر است؛ جمعیت فقط بازار قابل‌دسترس است)
      const pkg = districtPackage(state, d);
      const perSub = perSubTraffic(state, d, demandTimeFactor) * effectDemandMult(state, d);
      d.demand = d.subscribers * perSub;
      // گره‌های دسترسی متصلِ پوشش‌دهنده (مرکز منطقه باید داخل گوهٔ آنتن باشد؛ برد بر پایهٔ شعاع ثابت منطقه)
      const servers = state.nodes.filter((n) =>
        nodeServes(state, n) &&
        dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + coverReach(d) && inWedge(n, d.x, d.y));
      const cust = (state.customers || []).find((c) => c.districtId === d.id);
      if (!servers.length) {
        d.servedDemand = 0; d.qos = 0; d.potentialQos = 0; d.connected = false;
        d.avgLatency = 0; d.perSubMbps = 0;
        if (!noDaily && d.subscribers > 0) { d._qosAcc = (d._qosAcc || 0) + d.qos; d._qosDays = (d._qosDays || 0) + 1; }
        d.techDemand = computeTechDemand(d, [], 1, 0, state);
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
      // فیبر دستی: ظرفیت گره‌های فیبر فقط به نسبت ساختمان‌های منطقه که انشعاب فعال دارند حساب می‌شود
      const fiberRatio = districtFiberRatio(state, d);
      const capOf = (n) => {
        const c = n._effCap != null ? n._effCap : n.capacity || 0;
        if (techOfNode(n.type) === 'fiber') return c * fiberRatio;
        // ظرفیت ماژول TD-LTE هم وارد جریان می‌شود (مشترکان ثابت سیم‌کارتی روی همان دکل)
        return c + tdlteCapacity(n);
      };
      const accessCap = servers.reduce((s, n) => s + capOf(n), 0);
      let served = Math.min(d.demand, accessCap);

      // انتشار روی مسیرها و محاسبه ازدحام: ترافیک هر گرهٔ سرویس‌دهنده خودکار بین مسیرهای موازی
      // و لینک‌های موازی تقسیم می‌شود (مصرف همهٔ گره‌های میانی مسیر هم ثبت می‌شود)
      let remaining = served;
      for (const srv of servers) {
        if (remaining <= 0) break;
        const share = Math.min(remaining, capOf(srv));
        const paths = pathsFor(srv.id);
        if (!paths.length) continue;
        chargeBalanced(state, paths, share, fx);
        remaining -= share;
      }
      // ازدحام هر منطقه فقط از مسیرهای خودش حساب می‌شود: بدترین نسبت ظرفیت/مصرف روی
      // لینک‌ها و گره‌های مسیر سرویس همین منطقه (نه بدترین لینک کل شهر).
      let congestionFactor = 1;
      {
        const seenL = new Set(), seenN = new Set();
        for (const srv of servers) {
          for (const p of pathsFor(srv.id)) {
            for (const id of p) {
              const l = linkById(state, id);
              if (l) {
                if (seenL.has(l.id)) continue; seenL.add(l.id);
                const effCap = linkEffCapacity(state, l, fx);
                if (effCap > 0 && (l.usage || 0) > effCap) congestionFactor = Math.min(congestionFactor, effCap / l.usage);
              } else {
                if (seenN.has(id)) continue; seenN.add(id);
                const nn = nodeById(state, id);
                if (!nn) continue;
                // ظرفیت مؤثر گره در ازدحام همان capOf جریان است (شامل TD-LTE) تا ظرفیت ماژول خنثی نشود
                const effCap = capOf(nn);
                if (effCap > 0 && (nn.usage || 0) > effCap) congestionFactor = Math.min(congestionFactor, effCap / nn.usage);
              }
            }
          }
        }
      }
      if (state.failoverActive && priority(d) === 2) congestionFactor *= 0.6; // throttling عادی‌ها
      served = served * congestionFactor;

      d.servedDemand = Math.round(served);
      d.techDemand = computeTechDemand(d, servers, congestionFactor, fiberRatio, state);
      // کیفیت تجربه‌شدهٔ مشترکان فعلی (بدون مشترک = ۰؛ سرویسی در کار نیست)
      d.qos = d.demand > 0 ? clamp(served / d.demand, 0, 1) : 0;
      // کیفیت بالقوه برای مشترکِ بعدی (مبنای رشد): ظرفیت آزاد نسبت به ترافیک یک مشترک تازه
      d.potentialQos = clamp((accessCap * congestionFactor) / Math.max(d.demand, perSub, 0.0001), 0, 1);
      d.connected = true; // زیرساخت متصلِ پوشش‌دهنده وجود دارد (مشترک داشتن جدا سنجیده می‌شود)
      // میانگین کیفیت ماه فقط از روزهای دارای مشترک حساب می‌شود (بدون مشترک، کیفیتی تجربه نشده است)
      if (!noDaily && d.subscribers > 0) { d._qosAcc = (d._qosAcc || 0) + d.qos; d._qosDays = (d._qosDays || 0) + 1; }
      qosSum += d.qos; servedDistricts++;

      // مشترکان: رشد بر اساس کیفیت بالقوه (سرویسی که مشترک تازه می‌گیرد) با اثر قیمت و سرعت بسته؛
      // ریزش از کیفیت تجربه‌شدهٔ زیر ۳۰٪ شروع و هرچه بدتر، بیشتر می‌شود؛ گرانی بسته هم ریزش جدا دارد.
      const maxSubs = Math.floor(d.population * 0.35);
      const subsBefore = d.subscribers;
      if (!noDaily) {
        const priceG = priceGrowthFactor(state, d);
        const speedG = clamp(packageSpeed(pkg) / Math.max(1, expectedSpeedForDistrict(d)), 0.3, 1.2);
        if (d.potentialQos >= 0.35) {
          const baseGrowth = Math.max(1, Math.ceil(d.population * 0.004 * d.potentialQos * fx.growthMult * priceG * speedG));
          d.subscribers = Math.min(maxSubs, d.subscribers + baseGrowth);
          // پاداش کمپین: جذب اضافهٔ مشخص و قابل انتساب (فقط همین بخش به کمپین نسبت داده می‌شود)
          for (const c of (state.campaigns || [])) {
            if (!c.active || !(c.districtIds || []).includes(d.id)) continue;
            const type = (DATA.campaignTypes || []).find((t) => t.id === c.typeId);
            if (!type || !(type.growthMult > 1)) continue;
            const bonus = Math.round(d.population * 0.0025 * (type.growthMult - 1) * clamp(d.potentialQos, 0, 1) * priceG);
            if (bonus > 0) {
              const before = d.subscribers;
              d.subscribers = Math.min(maxSubs, d.subscribers + bonus);
              c.newSubs = (c.newSubs || 0) + (d.subscribers - before);
            }
          }
        } else if (d.qos < 0.3 && d.subscribers > 0) {
          const keep = clamp(1 - (0.3 - d.qos) * 0.22 * (1 - 0.5 * (fx.supRatio || 0)), 0.88, 1);
          d.subscribers = Math.max(0, Math.floor(d.subscribers * keep));
        }
        // ریزش از گرانی بسته نسبت به قیمت مرجع بازار
        const pChurn = priceChurnRate(state, d);
        if (pChurn > 0 && d.subscribers > 0) d.subscribers = Math.max(0, d.subscribers - Math.max(1, Math.floor(d.subscribers * pChurn)));
        const gained = d.subscribers - subsBefore;
        if (gained > 0) joinsToday += gained; else if (gained < 0) leavesToday += -gained;
      }
      if (cust) cust.count = d.subscribers;

      // بستهٔ منطقه: قیمت برای درآمد، سرعت برای رضایت (نسبت به انتظار نوع منطقه)
      const pkgSpeed = packageSpeed(pkg);
      const expectedSpeed = expectedSpeedForDistrict(d);
      const speedFactor = clamp(pkgSpeed / expectedSpeed, 0.35, 1.15);

      // تأخیر و سرعت سرانه برای بسته‌های گیمینگ/استریمینگ (ویژگی ۱۶)
      const firstSrv = servers[0];
      const firstTech = techOfNode(firstSrv.type);
      d.avgLatency = Math.round(pathLatency(state, firstSrv.id) * 2 + techLatencyBase(firstTech, firstSrv));
      d.jitter = techJitter(firstTech, congestionFactor);
      // سرعت تحویلیِ مشترک فعال ≈ کیفیت تجربه‌شده × سرعت مورد انتظار، با سقف سرعت بسته
      d.perSubMbps = d.subscribers > 0 ? Math.round(Math.min(pkgSpeed, d.qos * expectedSpeed) * 10) / 10 : pkgSpeed;
      let kindFactor = 1;
      if (pkg && pkg.kind === 'gaming') kindFactor = clamp(80 / Math.max(1, d.avgLatency + d.jitter), 0.3, 1.1);
      else if (pkg && pkg.kind === 'streaming') kindFactor = clamp(d.perSubMbps / (pkgSpeed * 0.5), 0.4, 1.1);

      // ضریب دوران: مردم فناوری دوران خودشان را می‌خواهند؛ ماندن روی نسل قدیمی رضایت را کم می‌کند
      const expectedGen = eraExpectedCellGen(state);
      const bestGen = servers.reduce((m, n) => Math.max(m, cellGenOf(n.type)), 0);
      const eraFactor = bestGen >= expectedGen ? 1 : (expectedGen - bestGen >= 2 ? 0.8 : 0.88);
      d.eraFactor = eraFactor;
      // ضریب رفت‌وآمد: پوشش موبایل در مسیر خانه↔کار برای مناطق مسکونی
      const commuteF = commuteFactor(state, d);

      // رضایت = کیفیت تجربه‌شدهٔ مشترکان فعلی (سرعت تحویلی نسبت به انتظار، دوران، رفت‌وآمد، قیمت)؛
      // نفوذ اشتراک (مشترک/سقف مشترک) جدا گزارش می‌شود و دیگر رضایت را سقف نمی‌زند.
      const penetration = maxSubs > 0 ? d.subscribers / maxSubs : 0;
      d.penetration = Math.round(penetration * 1000) / 1000;
      const target = clamp(d.qos * 100 * speedFactor * kindFactor * eraFactor * commuteF * priceSatFactor(state, d), 0, 100);
      const satRate = target >= d.satisfaction ? fx.satRecoveryRate : fx.satDecayRate;
      if (!noDaily) d.satisfaction = clamp(d.satisfaction + (target - d.satisfaction) * satRate, 0, 100);
      d.complaints = d.qos < 0.4 && d.subscribers > 0 ? Math.ceil(d.subscribers * 0.05) : 0;

      // درآمد ماهانه: مشترک × قیمت بسته × ضریب رضایت (کف درآمد پایین است تا سرویس بد واقعاً جریمه شود)
      const price = pkg ? pkg.price : 120;
      d.revenue = Math.round(d.subscribers * price * (0.15 + 0.85 * (d.satisfaction / 100)));
      totalRevenue += d.revenue;
    }

    // ---------- شرکت رقیب: سهم بازار هر منطقه ----------
    // رقیب در همهٔ مناطق (حتی قفل‌شده برای بازیکن) می‌تواند مشترک بگیرد؛ بازار هر منطقه
    // بین دو شرکت تقسیم می‌شود: رشد رقیب از ظرفیت پوشش خودش و قیمت ارزان‌ترش می‌آید و
    // وقتی کیفیت یک طرف خیلی بهتر باشد، بخشی از مشترکان طرف دیگر جابه‌جا می‌شوند.
    if (state.rival && state.rival.enabled) {
      for (const d of (state.districts || [])) {
        const rivalServers = state.nodes.filter((n) =>
          isRivalNode(n) && isAccessNode(n) && isUsableNode(n) && n.connected &&
          dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + coverReach(d) && inWedge(n, d.x, d.y));
        const rivalCap = rivalServers.reduce((s, n) => s + (n._effCap != null ? n._effCap : n.capacity || 0), 0);
        const perSubR = perSubTraffic(state, d, demandTimeFactor);
        const rSubs = d.rivalSubscribers || 0;
        const rDemand = rSubs * perSubR;
        d.rivalCap = Math.round(rivalCap);
        d.rivalQos = rDemand > 0 ? clamp(Math.min(rDemand, rivalCap) / rDemand, 0, 1) : 0;
        d.rivalPotentialQos = rivalCap > 0 ? clamp(rivalCap / Math.max(rDemand, perSubR, 0.0001), 0, 1) * (d.rivalQos < 1 ? Math.max(0.15, d.rivalQos) : 1) : 0;
        if (noDaily) continue;
        const maxSubs = Math.floor((d.population || 0) * 0.35);
        let rs = rSubs;
        // قیمت در تقسیم بازار: رقیب ارزان‌تر است (۱۱۰ در برابر قیمت بستهٔ بازیکن) و همین مزیت قیمتی
        // رشد و جذب مشترکانش را بیشتر می‌کند؛ اگر بازیکن ارزان‌تر شود، مزیت برعکس می‌شود.
        const playerPrice = districtPackagePrice(state, d.id);
        const rivalPriceAdv = clamp(playerPrice / Math.max(1, state.rival.price || RIVAL_PRICE), 0.6, 1.8);
        const rivalScore = d.rivalPotentialQos * rivalPriceAdv;
        // رشد رقیب از بازار آزاد (مشترک‌نشده) منطقه
        const freeMarket = Math.max(0, maxSubs - (d.subscribers || 0) - rs);
        if (d.rivalPotentialQos >= 0.12 && freeMarket > 0) {
          // در مناطق قفل‌شده برای بازیکن، رقیب کندتر رشد می‌کند تا بازی منصفانه بماند
          const rateF = districtUnlocked(d) ? 1 : 0.4;
          rs += Math.min(freeMarket, Math.max(1, Math.ceil((d.population || 0) * 0.0042 * rateF * d.rivalPotentialQos * rivalPriceAdv)));
        } else if (d.rivalQos < 0.05 && rs > 0) {
          rs = Math.max(0, Math.floor(rs * 0.92));
        }
        // جابه‌جایی مشترکان به سمت پیشنهاد بهتر (کیفیت × مزیت قیمت؛ فقط در مناطق باز برای بازیکن)
        if (districtUnlocked(d)) {
          if ((d.potentialQos || 0) > rivalScore + 0.45 && rs > 0) {
            const move = Math.max(1, Math.floor(rs * 0.015));
            rs -= move;
            d.subscribers = Math.min(maxSubs, (d.subscribers || 0) + move);
            joinsToday += move;
          } else if (rivalScore > (d.potentialQos || 0) + 0.45 && (d.subscribers || 0) > 0) {
            const move = Math.max(1, Math.floor((d.subscribers || 0) * 0.015));
            d.subscribers -= move;
            rs += move;
            leavesToday += move;
          }
        }
        // رقیب حداکثر نیمی از بازار هر منطقه را می‌گیرد تا همیشه جا برای بازیکن بماند
        d.rivalSubscribers = clamp(rs, 0, Math.min(Math.max(0, maxSubs - (d.subscribers || 0)), Math.floor(maxSubs * 0.5)));
      }
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
    const scPerSub = packageSpeed(homePkg0) * CONCURRENCY * demandTimeFactor * eraDemandMult(state);
    sc.demand = Math.round(sc.subscribers * scPerSub);
    const accessNodes = state.nodes.filter((n) => nodeServes(state, n));
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
    // ترافیک پراکنده‌ها هم روی گره‌های سرویس‌دهنده و مسیرشان ثبت می‌شود (به نسبت ظرفیت)
    if (sc.servedDemand > 0 && capSum > 0) {
      for (const [nid, cap] of coveringCaps) {
        const share = sc.servedDemand * (cap / capSum);
        chargeBalanced(state, pathsFor(nid), share, fx);
      }
    }
    // کیفیت تجربه‌شدهٔ مشترکان پراکنده (بدون مشترک = ۰)
    sc.qos = sc.demand > 0 ? clamp(sc.servedDemand / sc.demand, 0, 1) : 0;
    // کیفیت بالقوه برای مشترک تازهٔ پراکنده (مبنای رشد؛ فقط ساختمان‌های تحت پوشش مشترک می‌گیرند)
    sc.potentialQos = coveredCount > 0 ? clamp(capSum / Math.max(sc.demand, scPerSub, 0.0001), 0, 1) : 0;
    const potentialCovered = coveredCount * 6;
    if (!noDaily) {
      const scBefore = sc.subscribers;
      if (sc.potentialQos >= 0.35) sc.subscribers = Math.min(potentialCovered, sc.subscribers + Math.max(1, Math.ceil(potentialCovered * 0.01 * sc.potentialQos * fx.growthMult)));
      else if (sc.qos < 0.3 && sc.subscribers > 0) {
        const keep = clamp(1 - (0.3 - sc.qos) * 0.22 * (1 - 0.5 * (fx.supRatio || 0)), 0.88, 1);
        sc.subscribers = Math.max(0, Math.floor(sc.subscribers * keep));
      }
      const scGained = sc.subscribers - scBefore;
      if (scGained > 0) joinsToday += scGained; else if (scGained < 0) leavesToday += -scGained;
    }
    // رضایت پراکنده‌ها: کیفیت تجربه‌شدهٔ مشترکان فعلی (نفوذ اشتراک جدا گزارش می‌شود)
    sc.penetration = sc.potentialSubs > 0 ? Math.round((sc.subscribers / sc.potentialSubs) * 1000) / 1000 : 0;
    const scTarget = sc.qos * 100;
    const scRate = scTarget >= sc.satisfaction ? fx.satRecoveryRate : fx.satDecayRate;
    if (!noDaily) sc.satisfaction = clamp(sc.satisfaction + (scTarget - sc.satisfaction) * scRate, 0, 100);
    const homePkg = (state.packages || []).find((p) => p.id === 'home');
    sc.revenue = Math.round(sc.subscribers * (homePkg ? homePkg.price : 120) * (0.15 + 0.85 * (sc.satisfaction / 100)));
    totalRevenue += sc.revenue;

    // علامت‌گذاری لینک‌های شلوغ برای نمایش/مشکلات (ازدحام هر منطقه جدا حساب شد؛ این فقط وضعیت نمایشی لینک است)
    for (const l of state.links) {
      const effCap = linkEffCapacity(state, l, fx);
      if (effCap > 0 && (l.usage || 0) > effCap && l.status === 'active') l.status = 'congested';
    }
    const unlockedDistricts = state.districts.filter((d) => districtUnlocked(d));
    const summary = {
      monthlyRevenue: totalRevenue,
      avgQoS: unlockedDistricts.length ? qosSum / unlockedDistricts.length : 0,
      servedDistricts,
      totalSubscribers: state.districts.reduce((s, d) => s + d.subscribers, 0) + sc.subscribers,
      joins: joinsToday,
      leaves: leavesToday,
      congestedLinks: state.links.filter((l) => l.status === 'congested').length,
      rivalSubscribers: (state.districts || []).reduce((s, d) => s + (d.rivalSubscribers || 0), 0),
      rivalCash: (state.rival && state.rival.enabled) ? Math.round(state.rival.cash || 0) : 0,
    };
    state.lastFlow = summary;
    // رضایت کلی = میانگین وزن‌دار با مشترکان (رضایت مشترکان فعلی، نه کل جمعیت شهر)
    const totalSubsW = unlockedDistricts.reduce((s, d) => s + (d.subscribers || 0), 0) + (sc.subscribers || 0);
    state.satisfaction = totalSubsW > 0
      ? Math.round((unlockedDistricts.reduce((s, d) => s + d.satisfaction * (d.subscribers || 0), 0) + sc.satisfaction * (sc.subscribers || 0)) / totalSubsW) : 0;
    // نفوذ اشتراک کلی (جدا از رضایت): مشترکان نسبت به سقف بازار مناطق باز + پراکنده‌ها
    const maxSubsAll = unlockedDistricts.reduce((s, d) => s + Math.floor((d.population || 0) * 0.35), 0) + (sc.potentialSubs || 0);
    state.penetration = maxSubsAll > 0 ? Math.round((totalSubsW / maxSubsAll) * 1000) / 1000 : 0;
    let monthlyCosts = 0;
    for (const n of state.nodes) {
      if (isRivalNode(n)) continue; // هزینهٔ گره‌های رقیب با خودش است
      monthlyCosts += monthlyNodeCost(state, n);
    }
    monthlyCosts += monthlyTransitCost(state);
    for (const st of state.staff) monthlyCosts += st.salary || 0;
    state.incomePerDay = Math.round(totalRevenue / 30);
    state.expensePerDay = Math.round(monthlyCosts / 30);
    const maintMonthly = state.nodes.reduce((s, n) => s + (!isRivalNode(n) && n.status !== 'building' ? Math.round((n.capacity || 0) * MAINT_PER_MBPS) : 0), 0);
    state.finance = {
      incomePerDay: state.incomePerDay, expensePerDay: state.expensePerDay,
      monthlyRevenue: totalRevenue, monthlyCosts,
      transitMonthly: monthlyTransitCost(state), transitMbps: Math.round(transitMbps(state)),
      maintenanceMonthly: maintMonthly,
      loan: state.debt || 0, taxMonthly: state.lastTax || 0,
      totalIncome: state.totalRevenue || 0, totalExpense: state.totalCosts || 0,
    };
    return summary;
  }

  // تازه‌سازی فوری وضعیت اتصال و جریان بعد از هر تغییر توپولوژی (اتصال/حذف/جابه‌جایی/ارتقا):
  // بدون اثرات روزانه (رشد/ریزش مشترک و رضایت) تا کلیک‌های بازیکن اقتصاد روزانه را جلو نیندازد.
  function refreshConnectivity(state) {
    computeFlow(state, { dailyAvg: true, noDailyEffects: true });
    state.problems = buildProblems(state);
    return state.lastFlow;
  }

  // ---------- بازکردن مناطق شهر ----------
  // بازی با دو منطقهٔ مرکزی شروع می‌شود؛ بقیه با پرداخت هزینه باز می‌شوند (نیمی از درآمد ماهانهٔ بالقوه).
  function districtUnlocked(d) { return !d || d.unlocked !== false; }
  function districtUnlockCost(d) {
    if (!d) return 0;
    const potential = Math.floor((d.population || 0) * 0.35) * 120; // سقف مشترک × بستهٔ خانگی
    const base = Math.max(3000, Math.round(potential * 0.5));
    // روستاها کم‌جمعیت‌اند و بازکردنشان ارزان‌تر است
    return d.type === 'village' ? Math.max(1500, Math.round(base * 0.35)) : base;
  }
  function unlockDistrict(state, districtId) {
    const d = (state.districts || []).find((x) => x.id === districtId);
    if (!d) return { ok: false, error: 'منطقه پیدا نشد.' };
    if (districtUnlocked(d)) return { ok: false, error: 'این منطقه قبلاً باز شده است.' };
    const cost = districtUnlockCost(d);
    if ((state.cash || 0) < cost) return { ok: false, error: 'برای بازکردن «' + d.name + '» به ' + cost.toLocaleString('fa-IR') + ' تومان نیاز است.' };
    state.cash -= cost;
    state.totalCosts = (state.totalCosts || 0) + cost;
    d.unlocked = true;
    log(state, 'منطقهٔ «' + d.name + '» برای ساخت‌وساز باز شد.', 'build');
    refreshConnectivity(state);
    return { ok: true, cost };
  }
  function districtAtPoint(state, x, y) {
    return (state.districts || []).find((d) => dist(x, y, d.x, d.y) <= (d.radius || 0)) || null;
  }
  // ساکنان هر ساختمان (مشتق‌شده و قطعی؛ هر ساختمانِ نشان‌داده‌شده حداقل یک ساکن دارد)
  function buildingResidents(state, b) {
    if (!b) return 0;
    const base = Math.round(((b.w || 26) * (b.h || 20)) / 130) + Math.max(0, (b.height || 1) - 1) * 3;
    const rnd = prefRnd(prefHash(String(b.id) + '|res|' + (state.mapSeed || 0)));
    return Math.max(1, base + Math.floor(rnd() * 3));
  }

  // ---------- رفت‌وآمد روزانه (خانه ↔ کار) ----------
  // رفت‌وآمد مردم چرخهٔ کامل روزانه دارد و تصادفی است (نه فقط صبح):
  // صبح خانه→کار، ظهر کار→خانه، عصر خانه→تفریح (تجاری/پارک)، شب تفریح→خانه؛
  // نیمه‌شب تا سحر تقریباً هیچ حرکتی نیست. در هر فاز فقط بخشی از مردم حرکت می‌کنند
  // و زمان شروع و سرعت هر پالس تصادفی است. مردم در مسیر به پوشش موبایل نیاز دارند؛
  // پوشش مسیر (نمونه‌برداری روی مسیر Lشکل خیابان‌ها) رضایت مناطق مسکونی را کم‌وزیاد می‌کند.
  const COMMUTE_WORK_TYPES = ['commercial', 'industrial', 'heavy_industrial', 'government', 'academic', 'medical'];
  function nearestWorkDistrict(state, d) {
    let best = null, bd = Infinity;
    for (const w of (state.districts || [])) {
      if (w.id === d.id || !COMMUTE_WORK_TYPES.includes(w.type)) continue;
      const dd = dist(d.x, d.y, w.x, w.y);
      if (dd < bd) { bd = dd; best = w; }
    }
    return best;
  }
  // ---------- مسیر خیابانی رفت‌وآمد: از ساختمان تا ساختمان، روی شبکهٔ خیابان‌ها ----------
  const _commutePathCache = new WeakMap(); // state -> Map('aId|bId' -> waypoints)
  const _districtBuildingsCache = new WeakMap(); // state -> {count, byDistrict}
  function buildingCenterOf(b) {
    return { x: b.x + (b.w || 26) / 2, y: b.y + (b.h || 20) / 2 };
  }
  function riverXAtYSim(river, y) {
    if (!river || !river.length) return -1e9;
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i], b = river[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = (b.y - a.y) ? (y - a.y) / (b.y - a.y) : 0;
        return a.x + (b.x - a.x) * t;
      }
    }
    return y < river[0].y ? river[0].x : river[river.length - 1].x;
  }
  function nearestRoadLine(lines, v) {
    let lo = 0, hi = lines.length - 1;
    if (v <= lines[0]) return lines[0];
    if (v >= lines[hi]) return lines[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lines[mid] <= v) lo = mid; else hi = mid; }
    return (v - lines[lo] <= lines[hi] - v) ? lines[lo] : lines[hi];
  }
  // مسیر منهتنی روی خیابان‌ها از نقطهٔ a تا b: نقاط میانی همه روی خطوط خیابان‌اند
  // و عبور از رودخانه فقط از روی پل‌ها انجام می‌شود (خیابان‌ها در ساحل قطع می‌شوند).
  function commuteRoadPath(state, a, b) {
    const A = { x: a.x, y: a.y }, B = { x: b.x, y: b.y };
    const m = state && state.map, roads = m && m.roads;
    if (!roads || !roads.v || !roads.h || !roads.v.length || !roads.h.length) {
      return [A, { x: B.x, y: A.y }, B]; // ذخیرهٔ قدیمی بدون دادهٔ خیابان: مسیر L ساده
    }
    const river = m.river || null, bridges = m.bridges || [];
    const BAND = 50;
    const rx = (y) => riverXAtYSim(river, y);
    const clearV = (x, y1, y2) => {
      const cand = roads.v.slice().sort((p, q) => Math.abs(p - x) - Math.abs(q - x)).slice(0, 6);
      for (const vx of cand) {
        let ok = true;
        for (const yy of [y1, y2, (y1 + y2) / 2]) if (Math.abs(vx - rx(yy)) < BAND) { ok = false; break; }
        if (ok) return vx;
      }
      return nearestRoadLine(roads.v, x);
    };
    const ay = nearestRoadLine(roads.h, A.y), by = nearestRoadLine(roads.h, B.y);
    const ax0 = nearestRoadLine(roads.v, A.x), bx0 = nearestRoadLine(roads.v, B.x);
    const crossRiver = river && bridges.length && ((ax0 < rx(ay)) !== (bx0 < rx(by)));
    let bY = null;
    if (crossRiver) {
      const midY = (ay + by) / 2; let bd = Infinity;
      for (const y of bridges) { const dd = Math.abs(y - midY); if (dd < bd) { bd = dd; bY = y; } }
    }
    const ax = clearV(A.x, Math.min(A.y, ay, bY == null ? by : bY), Math.max(A.y, ay, bY == null ? by : bY));
    const bx = clearV(B.x, Math.min(B.y, by, bY == null ? by : bY), Math.max(B.y, by, bY == null ? by : bY));
    const pts = [A, { x: ax, y: A.y }, { x: ax, y: ay }];
    if (bY != null) pts.push({ x: ax, y: bY }, { x: bx, y: bY }, { x: bx, y: by });
    else pts.push({ x: ax, y: by }, { x: bx, y: by });
    pts.push({ x: bx, y: B.y }, B);
    return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  }
  function pathPointAt(pts, t) {
    let total = 0; const lens = [];
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); lens.push(L); total += L; }
    if (total <= 0) return { x: pts[0].x, y: pts[0].y };
    let d = clamp(t, 0, 1) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const f = lens[i] > 0 ? d / lens[i] : 0;
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
      }
      d -= lens[i];
    }
    return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
  }
  function commuteRoutePoints(state, a, b, n) {
    // نمونه‌برداری یکنواخت روی مسیر خیابانی (برای پوشش مسیر و تست)
    const pts = commuteRoadPath(state, a, b);
    const steps = Math.max(2, n || 8), out = [];
    for (let i = 0; i <= steps; i++) out.push(pathPointAt(pts, i / steps));
    return out;
  }
  function cachedCommutePath(state, aB, bB) {
    let cache = _commutePathCache.get(state);
    if (!cache) { cache = new Map(); _commutePathCache.set(state, cache); }
    const key = aB.id + '|' + bB.id;
    let pts = cache.get(key);
    if (!pts) {
      pts = commuteRoadPath(state, buildingCenterOf(aB), buildingCenterOf(bB));
      if (cache.size > 4000) cache.clear();
      cache.set(key, pts);
    }
    return pts;
  }
  function districtBuildingLists(state) {
    const bs = state.buildings || [];
    const c = _districtBuildingsCache.get(state);
    if (c && c.count === bs.length) return c.byDistrict;
    const byDistrict = new Map();
    for (const b of bs) {
      if (!b.districtId) continue;
      let e = byDistrict.get(b.districtId);
      if (!e) { e = { res: [], work: [], leisure: [] }; byDistrict.set(b.districtId, e); }
      if (b.type === 'residential') e.res.push(b);
      else if (b.type === 'commercial') { e.work.push(b); e.leisure.push(b); }
      else if (b.type === 'office' || b.type === 'industrial') e.work.push(b);
    }
    _districtBuildingsCache.set(state, { count: bs.length, byDistrict });
    return byDistrict;
  }
  function pointCellularCovered(state, x, y) {
    for (const n of (state.nodes || [])) {
      if (!isCellTower(n) || !isUsableNode(n) || !n.connected || isRivalNode(n)) continue;
      if (dist(x, y, n.x, n.y) <= (n.radius || 0) && inWedge(n, x, y)) return true;
    }
    return false;
  }
  function commuteCoverage(state, d) {
    if (!d || d.type !== 'residential') return null;
    const work = nearestWorkDistrict(state, d);
    if (!work) return null;
    // پوشش روی همان مسیر خیابانیِ ساختمان‌به‌ساختمان نمونه‌برداری می‌شود
    const lists = districtBuildingLists(state);
    const hb = ((lists.get(d.id) || {}).res || [])[0];
    const wb = ((lists.get(work.id) || {}).work || [])[0];
    const A = hb ? buildingCenterOf(hb) : d, B = wb ? buildingCenterOf(wb) : work;
    const pts = commuteRoutePoints(state, A, B, 8);
    let covered = 0;
    for (const p of pts) if (pointCellularCovered(state, p.x, p.y)) covered++;
    return { coverage: covered / pts.length, workDistrict: work };
  }
  function commuteFactor(state, d) {
    const cc = commuteCoverage(state, d);
    if (!cc) return 1;
    d.commuteCoverage = Math.round(cc.coverage * 100) / 100;
    return 0.85 + 0.15 * cc.coverage;
  }

  // فازهای روزانهٔ رفت‌وآمد: [شروع، پایان، شناسه، جهت، سهم مردم در حرکت]
  const COMMUTE_PHASES = [
    { start: 0, end: 6, id: 'deepnight', dir: 'none', fraction: 0 },
    { start: 6, end: 10, id: 'morning', dir: 'toWork', fraction: 0.7 },
    { start: 10, end: 12, id: 'latemorning', dir: 'toWork', fraction: 0.08 },
    { start: 12, end: 15, id: 'midday', dir: 'toHome', fraction: 0.45 },
    { start: 15, end: 17, id: 'afternoon', dir: 'toHome', fraction: 0.08 },
    { start: 17, end: 21, id: 'evening', dir: 'toLeisure', fraction: 0.55 },
    { start: 21, end: 24, id: 'night', dir: 'fromLeisure', fraction: 0.4 },
  ];
  const COMMUTE_CAP = 60; // سقف پالس‌های هم‌زمان روی نقشه (کارایی)
  function commutePhase(hour) {
    const h = (((hour == null ? 10 : hour) % 24) + 24) % 24;
    for (const p of COMMUTE_PHASES) if (h >= p.start && h < p.end) return p;
    return COMMUTE_PHASES[0];
  }
  function commuteHash(a, b, c) { // تصادفیِ قطعی برای هر پالس (ثابت در یک فاز، متفاوت میان پالس‌ها)
    let h = (a * 2654435761 + b * 40503 + c * 97 + 11) >>> 0;
    h = (h ^ (h >> 13)) * 1274126177 >>> 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function nearestLeisureSpot(state, d) { // نزدیک‌ترین مقصد تفریحی: منطقهٔ تجاری یا پارک
    let best = null, bd = Infinity;
    for (const w of (state.districts || [])) {
      if (w.id === d.id || w.type !== 'commercial') continue;
      const dd = dist(d.x, d.y, w.x, w.y);
      if (dd < bd) { bd = dd; best = { x: w.x, y: w.y, id: w.id, kind: 'district' }; }
    }
    for (const p of ((state.map && state.map.parks) || [])) {
      const cx = p.x + (p.w || 0) / 2, cy = p.y + (p.h || 0) / 2;
      const dd = dist(d.x, d.y, cx, cy);
      if (dd < bd) { bd = dd; best = { x: cx, y: cy, kind: 'park' }; }
    }
    return best;
  }
  function nearestLeisureDistrict(state, d) { // نزدیک‌ترین منطقهٔ تجاری (مقصد تفریحی: ساختمان‌های تجاری آن)
    let best = null, bd = Infinity;
    for (const w of (state.districts || [])) {
      if (w.id === d.id || w.type !== 'commercial') continue;
      const dd = dist(d.x, d.y, w.x, w.y);
      if (dd < bd) { bd = dd; best = w; }
    }
    return best;
  }
  // پالس‌های فعال رفت‌وآمد در ساعت داده‌شده (پیش‌فرض: ساعت بازی).
  // هر پالس: مبدأ/مقصد تصادفیِ فاز، زمان شروع و سرعت تصادفی، و پوشش موبایل در نقطهٔ خودش.
  function commutePulses(state, hour) {
    const h = (((hour == null ? (state.hour == null ? 10 : state.hour) : hour) % 24) + 24) % 24;
    const ph = commutePhase(h);
    const out = [];
    if (!ph || ph.fraction <= 0) return out;
    const phaseT = (h - ph.start) / Math.max(0.0001, ph.end - ph.start);
    const ds = (state.districts || []).filter(d => ['residential', 'dense', 'villa', 'slum', 'sparse', 'village'].includes(d.type) && d.unlocked !== false);
    const lists = districtBuildingLists(state);
    const isWorkPhase = (ph.dir === 'toWork' || ph.dir === 'toHome');
    let idx = 0;
    for (const d of ds) {
      const destD = isWorkPhase ? nearestWorkDistrict(state, d) : nearestLeisureDistrict(state, d);
      const homes = (lists.get(d.id) || {}).res || [];
      const dests = destD ? (((lists.get(destD.id) || {})[isWorkPhase ? 'work' : 'leisure']) || []) : [];
      // پالس‌ها فقط بین ساختمان‌های واقعی حرکت می‌کنند (نه مرکز منطقه یا فضای خالی)
      if (destD && homes.length && dests.length) {
        const forward = (ph.dir === 'toWork' || ph.dir === 'toLeisure');
        for (let j = 0; j < 4; j++) {
          if (out.length >= COMMUTE_CAP) return out;
          if (commuteHash(idx, j, ph.start) >= ph.fraction) continue; // این نفر در این فاز در خانه می‌ماند
          const offset = commuteHash(idx, j + 31, ph.start) * 0.7; // زمان شروع تصادفی در فاز
          const dur = 0.35 + commuteHash(idx, j + 57, ph.start) * 0.45; // سرعت تصادفی
          const t = (phaseT - offset) / dur;
          if (t < 0 || t > 1) continue;
          const hb = homes[Math.floor(commuteHash(idx, j + 101, ph.start) * homes.length) % homes.length];
          const db = dests[Math.floor(commuteHash(idx, j + 131, ph.start) * dests.length) % dests.length];
          const A = forward ? hb : db, B = forward ? db : hb;
          // حرکت روی خیابان‌ها (مسیر کش‌شدهٔ ساختمان‌به‌ساختمان)
          const p = pathPointAt(cachedCommutePath(state, A, B), t);
          out.push({ x: p.x, y: p.y, phase: ph.id, dir: ph.dir, t, homeId: d.id, fromId: A.id, toId: B.id, covered: pointCellularCovered(state, p.x, p.y) });
        }
      }
      idx++;
    }
    return out;
  }

  // ---------- انشعاب سیمی دستی ساختمان‌ها (فیبر/سیم مسی از راه کابینت خیابانی) ----------
  // ساختمان فقط با انشعاب دستی از راه یک کابینت خیابانی نزدیک به شبکهٔ سیمی وصل می‌شود؛
  // انشعاب‌های مستقیم قدیمی (بدون کابینت، در ذخیره‌های قبلی) همچنان کار می‌کنند.
  // هر ساختمان در هر لحظه فقط به یکی از فیبر یا سیم مسی وصل است (نه هر دو).
  // فناوری‌های بی‌سیم همچنان پوشش‌محور و خودکارند.
  const COPPER_DROP_MAX_DIST = 120; // حداکثر فاصلهٔ انشعاب مسی تا کابینت (واحد نقشه)
  const COPPER_DROP_SPEED = 100;    // سقف سرعت DSL روی سیم مسی (Mbps)
  const COPPER_DROP_WEIGHT = 0.5;   // سهم انشعاب مسی در نسبت سرویس سیمی منطقه (کندتر از فیبر)
  function cabinetPorts(node) {
    const eq = getEq(node && node.type);
    return ((eq && eq.ports) || 24) + 24 * moduleCount(node, 'ports_boost');
  }
  function cabinetUsedPorts(state, nodeId) {
    return (state.fiberDrops || []).filter((x) => x.nodeId === nodeId && (x.status === 'active' || x.status === 'building')).length;
  }
  function fiberDropFor(state, buildingId) {
    return (state.fiberDrops || []).find((x) => x.buildingId === buildingId) || null;
  }
  function activeFiberDropSet(state) {
    return new Set((state.fiberDrops || []).filter((x) => x.status === 'active').map((x) => x.buildingId));
  }
  function districtFiberRatio(state, d) {
    const bs = (state.buildings || []).filter((b) => b.districtId === d.id);
    if (!bs.length) return 1;
    const byBuilding = new Map((state.fiberDrops || []).filter((x) => x.status === 'active').map((x) => [x.buildingId, x.medium || 'fiber']));
    // نسبت وزنی بر اساس ساکنان ساختمان‌ها: انشعاب ساختمان پرجمعیت سهم بیشتری از بازار سیمی را باز می‌کند
    let w = 0, total = 0;
    for (const b of bs) {
      const res = buildingResidents(state, b);
      total += res;
      const m = byBuilding.get(b.id);
      if (m === 'fiber') w += res;
      else if (m === 'copper') w += res * COPPER_DROP_WEIGHT;
    }
    return total > 0 ? w / total : 0;
  }
  // ساکنان ساختمان‌های دارای انشعاب فعال در یک منطقه (سقف بازار سیمی منطقه)
  function droppedResidents(state, d) {
    const active = activeFiberDropSet(state);
    let sum = 0;
    for (const b of (state.buildings || [])) {
      if (b.districtId !== d.id || !active.has(b.id)) continue;
      sum += buildingResidents(state, b);
    }
    return sum;
  }
  function buildingWiredStatus(state, buildingId) {
    const fd = fiberDropFor(state, buildingId);
    if (!fd) return { status: 'none', medium: null, nodeId: null, nodeName: null, sourceConnected: false };
    const n = nodeById(state, fd.nodeId);
    return {
      status: fd.status, medium: fd.medium || 'fiber', nodeId: fd.nodeId, nodeName: n ? n.name : null,
      // انشعاب فقط وقتی سرویس می‌دهد که گره منبعش (کابینت) خودش به دروازه وصل باشد
      sourceConnected: !!(n && isUsableNode(n) && n.connected),
    };
  }
  function buildingFiberStatus(state, buildingId) {
    return buildingWiredStatus(state, buildingId);
  }
  function fiberSourceNodes(state) {
    return (state.nodes || []).filter((n) =>
      (n.type === 'ftth' || n.type === 'aggregation' || n.type === 'core_router') && n.connected && isUsableNode(n) && !isRivalNode(n));
  }
  function cabinetSourceNodes(state) {
    return (state.nodes || []).filter((n) => (n.type === 'street_cabinet' || n.type === 'cabinet_basic' || n.type === 'ftth') && n.connected && isUsableNode(n) && !isRivalNode(n));
  }
  // انشعاب سیمی ساختمان: از کابینت خیابانی یا مستقیم از گره FTTH (معماری GPON: OLT←تقسیم‌کننده←ساختمان).
  // هزینهٔ نصب با مشترک است — برای بازیکن رایگان. انشعاب فیبر از دوران FTTH (۲۰۰۴) ممکن است.
  function connectBuildingWired(state, buildingId, nodeId, medium) {
    medium = medium === 'copper' ? 'copper' : 'fiber';
    const mediumFa = medium === 'copper' ? 'سیم مسی' : 'فیبر';
    const b = (state.buildings || []).find((x) => x.id === buildingId);
    if (!b) return { ok: false, error: 'ساختمان پیدا نشد.' };
    if (fiberDropFor(state, buildingId)) return { ok: false, error: 'این ساختمان قبلاً به شبکهٔ سیمی وصل شده است؛ برای تغییر نوع اتصال اول اتصال فعلی را قطع کنید.' };
    const srcEarly = nodeId ? nodeById(state, nodeId) : null;
    if (srcEarly && srcEarly.type === 'cabinet_basic' && medium === 'fiber') {
      return { ok: false, error: 'کابینت ساده فقط انشعاب سیم مسی می‌دهد؛ برای فیبر از کابینت خیابانی یا گره FTTH استفاده کنید.' };
    }
    if (medium === 'fiber' && yearOf(state) < 2004) {
      return { ok: false, error: 'انشعاب فیبر تا خانه هنوز در این دوران نیست؛ از سال ۲۰۰۴ (دوران FTTH) ممکن می‌شود. فعلاً سیم مسی (DSL) بگیرید.' };
    }
    if (b.districtId) {
      const bd = (state.districts || []).find((d) => d.id === b.districtId);
      if (bd && !districtUnlocked(bd)) return { ok: false, error: 'این ساختمان در منطقهٔ قفل‌شده است؛ اول منطقهٔ «' + bd.name + '» را باز کنید.' };
    }
    const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
    let src = nodeId ? nodeById(state, nodeId) : null;
    if (nodeId) {
      if (src && isRivalNode(src)) return { ok: false, error: 'این گره متعلق به شرکت رقیب است.' };
      if (!src || (src.type !== 'street_cabinet' && src.type !== 'cabinet_basic' && src.type !== 'ftth')) {
        return { ok: false, error: 'انشعاب سیمی از راه کابینت خیابانی یا گره FTTH انجام می‌شود؛ یکی از آن‌ها را نزدیک ساختمان انتخاب کنید.' };
      }
      if (src.type === 'cabinet_basic' && medium === 'fiber') {
        return { ok: false, error: 'کابینت ساده فقط انشعاب سیم مسی می‌دهد؛ برای فیبر از کابینت خیابانی یا گره FTTH استفاده کنید.' };
      }
      if (!isUsableNode(src) || !src.connected) {
        return { ok: false, error: 'این گره به شبکه وصل نیست؛ اول آن را به تجمیع/هسته وصل کنید.' };
      }
    }
    if (!src) {
      let bd2 = Infinity;
      for (const n of cabinetSourceNodes(state)) {
        if (medium === 'fiber' && n.type === 'cabinet_basic') continue; // کابینت ساده فقط سیم مسی می‌دهد
        const dd = dist(cx, cy, n.x, n.y);
        const lim = medium === 'copper' ? COPPER_DROP_MAX_DIST : (n.radius || 180);
        if (dd <= lim && dd < bd2) { bd2 = dd; src = n; }
      }
    }
    if (!src) return { ok: false, error: 'کابینت خیابانی یا گره FTTH متصل در برد این ساختمان نیست؛ اول یکی از آن‌ها را نزدیک ساختمان بسازید و به شبکه وصل کنید.' };
    const dd = dist(cx, cy, src.x, src.y);
    const lim = medium === 'copper' ? COPPER_DROP_MAX_DIST : (src.radius || 180);
    if (dd > lim) {
      return { ok: false, error: medium === 'copper'
        ? 'فاصله تا گره منبع برای سیم مسی زیاد است (حداکثر ' + COPPER_DROP_MAX_DIST + ' واحد).'
        : 'فاصله تا گره منبع برای انشعاب فیبر زیاد است.' };
    }
    if (cabinetUsedPorts(state, src.id) >= cabinetPorts(src)) {
      return { ok: false, error: 'پورت‌های این گره پر شده است؛ «ماژول پورت اضافه» نصب کنید یا گره دیگری بسازید.' };
    }
    // انشعاب برای بازیکن رایگان است (هزینهٔ نصب با مشترک است) و آنی وصل می‌شود
    if (!Array.isArray(state.fiberDrops)) state.fiberDrops = [];
    if (state.counters.fiberDrop == null) state.counters.fiberDrop = 0;
    const drop = { id: 'fd' + (++state.counters.fiberDrop), buildingId, nodeId: src.id, medium, status: 'active', work: 0 };
    state.fiberDrops.push(drop);
    log(state, 'ساختمان به «' + (src.name || 'گره') + '» با ' + mediumFa + ' متصل شد (رایگان، آنی).', 'build');
    refreshConnectivity(state);
    return { ok: true, cost: 0, days: 0, nodeId: src.id, nodeName: src.name, medium };
  }
  function connectBuildingFiber(state, buildingId, nodeId) {
    return connectBuildingWired(state, buildingId, nodeId, 'fiber');
  }
  function disconnectBuildingWired(state, buildingId) {
    const before = (state.fiberDrops || []).length;
    state.fiberDrops = (state.fiberDrops || []).filter((x) => x.buildingId !== buildingId);
    if (state.fiberDrops.length === before) return { ok: false, error: 'این ساختمان انشعاب سیمی ندارد.' };
    log(state, 'انشعاب سیمی ساختمان قطع شد.', 'build');
    refreshConnectivity(state);
    return { ok: true };
  }
  function disconnectBuildingFiber(state, buildingId) {
    return disconnectBuildingWired(state, buildingId);
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
    signal_loss: 'افت سیگنال مسیر طولانی',
    node_congestion: 'ازدحام گره',
    tdlte_missing: 'نبود ماژول TD-LTE',
    no_power: 'بدون برق کافی',
    module_broken: 'خرابی ماژول',
    worn_node: 'فرسودگی گره',
  };
  function buildProblems(state) {
    const problems = [];
    const add = (cause, ref, fixOptions) => {
      problems.push({ id: 'p' + (++state.counters.problem), cause, title: PROBLEM_TITLES[cause] || 'مشکل', ...ref, fixOptions });
    };
    for (const d of state.districts) {
      if (!districtUnlocked(d)) continue; // منطقهٔ قفل‌شده مشکل حساب نمی‌شود
      // تقاضای TD-LTE بدون دکلِ دارای ماژول در پوشش منطقه
      const td = d.techDemand && d.techDemand.fwa;
      if (td && td.demand > 0 && td.served === 0) {
        const tower4g = state.nodes.find((n) => (n.type === 'cell_4g' || n.type === 'cell_5g') && isUsableNode(n) && n.connected && !isRivalNode(n) && !hasModule(n, 'tdlte') &&
          dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + coverReach(d));
        if (tower4g) {
          add('tdlte_missing', { districtId: d.id, nodeId: tower4g.id, message: 'تقاضای TD-LTE در «' + d.name + '» هست ولی دکل منطقه ماژول TD-LTE ندارد.' }, [
            { action: 'install_module', label: 'نصب ماژول TD-LTE روی دکل', nodeId: tower4g.id, moduleId: 'tdlte' },
          ]);
        }
      }
      if (d.qos >= 0.5) continue;
      const servers = state.nodes.filter((n) => isAccessNode(n) && isUsableNode(n) && !isRivalNode(n) &&
        dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + coverReach(d));
      const anyConnected = servers.some((n) => n.connected);
      if (!servers.length) {
        add('no_coverage', { districtId: d.id, message: 'منطقه «' + d.name + '» پوشش ندارد.' }, [
          { action: 'build_access', label: 'ساخت دکل/آنتن در منطقه', equipment: ['cell_3g', 'cell_2g'] },
        ]);
      } else if (!anyConnected) {
        const srv = servers[0];
        add('unconnected', { districtId: d.id, nodeId: srv.id, message: 'گره «' + (srv.name || 'نامشخص') + '» در منطقهٔ «' + d.name + '» به هسته وصل نیست.' }, [
          { action: 'connect', label: 'اتصال گره به شبکه (فیبر/PTP)', nodeId: srv.id, medium: ['fiber', 'ptp'] },
          { action: 'repair', label: 'بررسی و تعمیر گره', nodeId: srv.id },
        ]);
      } else {
        add('congestion', { districtId: d.id, message: 'ظرفیت در «' + d.name + '» کم است و کیفیت پایین آمده.' }, [
          { action: 'upgrade', label: 'نصب ماژول افزایش ظرفیت', districtId: d.id },
          { action: 'build_access', label: 'افزودن گره دسترسی دیگر', districtId: d.id },
          { action: 'parallel_link', label: 'ساخت لینک موازی برای لینک‌های پرمصرف', districtId: d.id },
        ]);
      }
    }
    for (const n of state.nodes) {
      if (isRivalNode(n)) continue; // مشکلات گره‌های رقیب به بازیکن مربوط نیست
      if (n.status === 'failed') {
        add('failed_node', { nodeId: n.id, message: 'گره «' + (n.name || 'نامشخص') + '» خراب شده است.' }, [
          { action: 'repair', label: 'تعمیر گره (آنی)', nodeId: n.id },
          { action: 'replace', label: 'جایگزینی گره', nodeId: n.id },
        ]);
      }
      // بدون برق کافی: مصرف از توان منبع تغذیه بیشتر است و گره خاموش است
      if (n.status === 'nopower') {
        const pw = nodePowerInfo(n);
        add('no_power', { nodeId: n.id, message: 'گره «' + (n.name || 'نامشخص') + '» برق کافی ندارد و خاموش است (مصرف ' + pw.draw + ' وات، توان منبع ' + pw.capacity + ' وات).' }, [
          { action: 'install_power', label: 'آپگرید منبع تغذیه', nodeId: n.id },
        ]);
      }
      // ماژول خراب: اثرش قطع است تا آنی تعمیر شود
      if (n.brokenModules) {
        for (const mid of Object.keys(n.brokenModules)) {
          if (!n.brokenModules[mid]) continue;
          const m = getModule(mid);
          add('module_broken', { nodeId: n.id, message: 'ماژول «' + ((m && m.name) || mid) + '» روی «' + (n.name || 'گره') + '» خراب است و کار نمی‌کند.' }, [
            { action: 'repair_module', label: 'تعمیر ماژول (آنی)', nodeId: n.id, moduleId: mid },
          ]);
        }
      }
      // ازدحام گره: مصرف از ظرفیتش گذشته است
      if (isUsableNode(n) && (n.capacity || 0) > 0 && (n.usage || 0) > (n.capacity || 0)) {
        add('node_congestion', { nodeId: n.id, message: 'گره «' + (n.name || 'نامشخص') + '» اشباع شده است (مصرف بیشتر از ظرفیت).' }, [
          { action: 'install_module', label: 'نصب ماژول افزایش ظرفیت', nodeId: n.id, moduleId: 'cap_boost' },
        ]);
      }
      // فرسودگی شدید: احتمال خرابی بالا رفته است
      if (n.status === 'active' && (n.health == null ? 100 : n.health) < 25) {
        add('worn_node', { nodeId: n.id, message: 'گره «' + (n.name || 'نامشخص') + '» فرسوده شده است (سلامت ' + Math.round(n.health) + '٪) و احتمال خرابی‌اش بالاست.' }, [
          { action: 'repair', label: 'تعمیر و سرویس گره (آنی)', nodeId: n.id },
          { action: 'replace', label: 'جایگزینی گره', nodeId: n.id },
        ]);
      }
    }
    for (const l of state.links) {
      // مشکلات لینک‌های رقیب به بازیکن مربوط نیست
      const lFrom = nodeById(state, l.from);
      if (lFrom && isRivalNode(lFrom)) continue;
      // افت سیگنال در مسیر طولانی (فیبر/مسی/اترنت؛ PtP با افت فاصله در ظرفیت مؤثر دیده می‌شود)
      if (l.status !== 'cut' && l.medium !== 'ptp') {
        const a = nodeById(state, l.from), b = nodeById(state, l.to);
        const att = (a && b) ? linkAttenuation(state, l, a, b) : 1;
        if (att < 0.8) {
          add('signal_loss', { linkId: l.id, message: 'مسیر ' + mediumFa(l.medium) + ' بین «' + ((a && a.name) || 'گره') + '» و «' + ((b && b.name) || 'گره') + '» بلند است و سیگنال از دست می‌دهد.' }, [
            { action: 'add_repeater', label: 'نصب تقویت‌کننده در میانهٔ مسیر', linkId: l.id },
          ]);
        }
      }
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
  // رویدادهای فصلی با لنگر تقویمی (فصل‌های ۹۰روزه) یک‌بار در هر چرخهٔ ۳۶۰روزه می‌آیند؛
  // بقیه تصادفی‌اند و بعضی دورهٔ خنک‌شدن (cooldown) دارند. اثرات تقاضا موقت‌اند و خودکار تمام می‌شوند.
  function applyEventEffect(state, ev) {
    const fx = ev.effect || {};
    let detail = '';
    if (fx.action === 'cut') {
      const isHQn = (id) => { const n = nodeById(state, id); return n && (n.type === 'core_router' || n.type === 'internet_gateway'); };
      const cands = state.links.filter((l) => l.status === 'active' && l.medium === 'fiber' && !(isHQn(l.from) && isHQn(l.to)));
      if (cands.length) { const l = cands[Math.floor(rand(state) * cands.length)]; l.status = 'cut'; detail = 'یک لینک ' + mediumFa(l.medium) + ' قطع شد.'; }
    } else if (fx.action === 'cut_copper') {
      const cands = state.links.filter((l) => l.status === 'active' && l.medium === 'copper');
      if (cands.length) { const l = cands[Math.floor(rand(state) * cands.length)]; l.status = 'cut'; detail = 'یک لینک سیم مسی قطع شد.'; }
    } else if (fx.action === 'fail_two') {
      const cands = state.nodes.filter((n) => n.status === 'active' && n.type !== 'internet_gateway' && n.type !== 'core_router');
      const names = [];
      for (let k = 0; k < 2 && cands.length; k++) {
        const n = cands.splice(Math.floor(rand(state) * cands.length), 1)[0];
        n.status = 'failed'; n.health = 0; names.push('«' + (n.name || 'نامشخص') + '»');
      }
      if (names.length) detail = names.join(' و ') + ' از کار افتادند.';
    } else if (fx.action === 'fail') {
      const cands = state.nodes.filter((n) => n.status === 'active' && n.type !== 'internet_gateway' && n.type !== 'core_router');
      if (cands.length) { const n = cands[Math.floor(rand(state) * cands.length)]; n.status = 'failed'; n.health = 0; detail = 'گره «' + (n.name || 'نامشخص') + '» از کار افتاد.'; }
    } else if (fx.action === 'degrade') {
      // آسیب طوفان موقت است (۷ روز) و روی هم انباشته نمی‌شود؛ با «تعمیر لینک» زودتر برمی‌گردد
      state.links.filter((l) => l.medium === 'ptp').forEach((l) => {
        const still = (l.degradedUntil != null && (state.day || 1) <= l.degradedUntil) ? (l.degradeFactor || 0.6) : 1;
        l.degradeFactor = Math.min(still, 0.6);
        l.degradedUntil = Math.floor(state.day) + 7;
      });
      detail = 'ظرفیت لینک‌های بی‌سیم موقتاً کم شد (تا ۷ روز؛ با تعمیر لینک برمی‌گردد).';
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
    } else if (fx.action === 'effect' || fx.action === 'weather_effect') {
      if (!Array.isArray(state.activeEffects)) state.activeEffects = [];
      state.activeEffects.push({
        id: ev.id, name: ev.name,
        untilDay: Math.floor(state.day) + (fx.days || 1),
        demandMult: fx.demandMult || 1,
        districtTypes: fx.districtTypes || null,
        districtId: fx.districtId || null,
      });
      if (fx.satBonus) for (const d of (state.districts || [])) d.satisfaction = clamp((d.satisfaction || 0) + fx.satBonus, 0, 100);
      if (fx.action === 'weather_effect' && fx.kind) state.weather = { kind: fx.kind, untilDay: Math.floor(state.day) + (fx.days || 1) };
      detail = 'اثرش ' + (fx.days || 1) + ' روز می‌ماند.';
    } else if (fx.action === 'weather') {
      state.weather = { kind: fx.kind || 'clear', untilDay: Math.floor(state.day) + (fx.days || 1) };
      detail = 'تا ' + (fx.days || 1) + ' روز ادامه دارد.';
    }
    return detail;
  }
  function rollEvents(state, dtDays) {
    const fired = [];
    if (!state._eventCooldowns) state._eventCooldowns = {};
    // رویدادهای فصلی: یک‌بار در هر چرخهٔ ۳۶۰روزه، در آغاز فصل مربوط
    const cycle = Math.floor(((state.day || 1) - 1) / 360);
    const seasonId = (seasonOf(state) || {}).id;
    for (const ev of (DATA.events || [])) {
      if (!ev.seasonal || ev.seasonal !== seasonId) continue;
      const key = '_seasonal_' + ev.id;
      if (state[key] === cycle) continue;
      state[key] = cycle;
      const detail = applyEventEffect(state, ev);
      fired.push({ id: ev.id, name: ev.name, type: ev.type, description: ev.description, detail, day: Math.floor(state.day) });
      log(state, ev.name + ': ' + ev.description + (detail ? ' ' + detail : ''), 'event');
    }
    for (const ev of (DATA.events || [])) {
      if (ev.seasonal) continue;
      if (ev.cooldownDays && (state.day || 1) < (state._eventCooldowns[ev.id] || 0)) continue;
      if (rand(state) > (ev.probability || 0) * dtDays) continue;
      if (ev.cooldownDays) state._eventCooldowns[ev.id] = Math.floor(state.day) + ev.cooldownDays;
      const detail = applyEventEffect(state, ev);
      fired.push({ id: ev.id, name: ev.name, type: ev.type, description: ev.description, detail, day: Math.floor(state.day) });
      log(state, ev.name + ': ' + ev.description + (detail ? ' ' + detail : ''), 'event');
    }
    // پاک‌سازی اثرات تمام‌شده
    if (Array.isArray(state.activeEffects)) state.activeEffects = state.activeEffects.filter((e) => (state.day || 1) <= (e.untilDay || 0));
    return fired;
  }

  // ---------- آموزش و مأموریت‌ها ----------
  function updateTutorial(state) {
    // مراحل ترتیبی‌اند: هر مرحله فقط وقتی کامل می‌شود که مراحل قبل هم کامل شده باشند.
    // منبع تغذیهٔ پیش‌نصب (داخل قیمت ساخت) «نصب ماژول» حساب نمی‌شود.
    const own = (n) => !isRivalNode(n);
    const conds = [
      state.nodes.some((n) => own(n) && isAccessNode(n)),
      state.nodes.some((n) => own(n) && isAccessNode(n) && n.connected),
      state.districts.some((d) => d.qos >= 0.5),
      state.nodes.some((n) => {
        if (!own(n)) return false;
        const eq = getEq(n.type);
        const baseP = smallestPowerLevelFor((eq && eq.powerDraw) || 0);
        return nodeModules(n).some((mid) => mid !== 'power') || moduleCount(n, 'power') > baseP;
      }),
      (state.staff || []).length > 0,
    ];
    let step = 0;
    while (step < conds.length && conds[step]) step++;
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
      if (g.type === 'build_access') ok = state.nodes.filter((n) => isAccessNode(n) && !isRivalNode(n)).length >= (g.count || 1);
      else if (g.type === 'connect_access') ok = state.nodes.filter((n) => isAccessNode(n) && n.connected && !isRivalNode(n)).length >= (g.count || 1);
      else if (g.type === 'district_qos') ok = state.districts.filter((d) => d.qos >= (g.qos || 0.5)).length >= (g.count || 1);
      else if (g.type === 'subscribers') ok = totalSubs >= (g.count || 0);
      else if (g.type === 'year') ok = yearOf(state) >= (g.year || 1991);
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

  // ---------- حالت تماشاچی: هوش مصنوعی شرکت بازیکن را بازی می‌کند ----------
  function setSpectatorAI(state, on) {
    state.spectatorAI = !!on;
    log(state, on ? 'حالت تماشاچی روشن شد؛ هوش مصنوعی شرکت را اداره می‌کند.' : 'حالت تماشاچی خاموش شد؛ کنترل شرکت با شماست.', 'info');
    return { ok: true, spectatorAI: state.spectatorAI };
  }
  function aiFindSpot(state, x, y) {
    for (let r = 0; r <= 500; r += 50) {
      for (let a = 0; a < 8; a++) {
        const px = Math.round(x + Math.cos(a * Math.PI / 4) * r), py = Math.round(y + Math.sin(a * Math.PI / 4) * r);
        if (isValidPlacement(state, px, py).ok) return { x: px, y: py };
      }
    }
    return null;
  }
  function aiPickMedium(state, a, b) {
    const y = yearOf(state);
    const d = dist(a.x, a.y, b.x, b.y);
    const tries = [];
    if (y >= 1995) tries.push('fiber');
    if (d <= 600) tries.push('ethernet');
    if (y >= 1996 && d > 900 && d <= 1800) tries.push('ptp');
    tries.push('copper');
    for (const m of tries) {
      if (mediumSupportedBy(a.type, m) && mediumSupportedBy(b.type, m) && state.cash >= linkCostFor(state, a, b, m)) return m;
    }
    return null;
  }
  function aiConnectNode(state, node) {
    const target = nearestCoreNode(state, node);
    if (!target) return false;
    const medium = aiPickMedium(state, node, target);
    if (!medium) return false;
    return !!connect(state, node.id, target.id, medium);
  }
  function aiReserve(state) {
    // ذخیرهٔ امن: هزینهٔ یک ماه + حاشیه — هوش مصنوعی هیچ‌وقت نقدینگی را صفر نمی‌کند
    const monthly = (state.finance && state.finance.expensePerDay ? state.finance.expensePerDay * 30 : 8000);
    return Math.round(12000 + monthly);
  }
  function aiTick(state, dtDays) {
    if (!state.spectatorAI) return;
    const y = yearOf(state);
    const reserve = aiReserve(state);
    const canSpend = (cost) => state.cash >= cost + reserve && (state.debt || 0) <= 0;
    const own = (n) => !isRivalNode(n);
    let builds = 0;
    // ۱) تعمیرها: گره خراب، ماژول خراب، لینک قطع، گره بی‌برق
    for (const n of state.nodes) {
      if (!own(n)) continue;
      if (n.status === 'failed') {
        const eq = getEq(n.type);
        const cost = Math.round((eq ? Math.round(eq.cost * 0.1) : 500) * staffEffects(state).repairDiscount);
        if (state.cash >= cost) { state.cash -= cost; n.status = 'active'; n.health = 85; log(state, 'هوش مصنوعی: «' + (n.name || 'گره') + '» تعمیر شد.', 'repair'); }
      }
      if (n.brokenModules) for (const mid of Object.keys(n.brokenModules)) if (n.brokenModules[mid]) repairModule(state, n.id, mid);
      if (n.status === 'nopower') installModule(state, n.id, 'power');
    }
    for (const l of state.links) {
      const la = nodeById(state, l.from);
      if (la && own(la) && l.status === 'cut') repairLink(state, l.id);
    }
    // ۲) اتصال گره‌های دسترسیِ متصل‌نشده به هسته/تجمیع
    for (const n of state.nodes) {
      if (own(n) && isAccessNode(n) && isUsableNode(n) && !n.connected) aiConnectNode(state, n);
    }
    // ۳) انشعاب سیمی ساختمان‌های نزدیک کابینت/FTTH (رایگان؛ چندتا در روز)
    let drops = 0;
    const dropSources = cabinetSourceNodes(state);
    if (dropSources.length) {
      const active = activeFiberDropSet(state);
      for (const b of (state.buildings || [])) {
        if (drops >= 6) break;
        if (active.has(b.id)) continue;
        const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
        for (const src of dropSources) {
          if (dist(cx, cy, src.x, src.y) <= (src.radius || 0)) {
            const medium = (y >= 2004 && src.type !== 'cabinet_basic') ? 'fiber' : 'copper';
            const r = connectBuildingWired(state, b.id, src.id, medium);
            if (r && r.ok) { drops++; }
            break;
          }
        }
      }
    }
    // ۴) پوشش مناطق بازِ بدون سرویس: ساخت دکل متناسب با دوران و بودجه
    const towerLadder = [['cell_5g', 2019], ['cell_4g', 2009], ['cell_3g', 2001], ['cell_2g', 1991]];
    for (const d of (state.districts || [])) {
      if (builds >= 2) break;
      if (!districtUnlocked(d) || d.connected) continue;
      let eqId = null;
      for (const [tid, era] of towerLadder) {
        const eq = getEq(tid);
        if (eq && y >= era && canSpend(eq.cost)) { eqId = tid; break; }
      }
      if (!eqId && canSpend((getEq('cabinet_basic') || {}).cost || 3000)) eqId = 'cabinet_basic';
      if (!eqId) continue;
      const spot = aiFindSpot(state, d.x, d.y);
      if (!spot) continue;
      const node = buildNode(state, eqId, spot.x, spot.y);
      if (node) { builds++; aiConnectNode(state, node); }
    }
    // ۵) ظرفیت مناطق شلوغ: ماژول ظرفیت روی گره سرویس‌دهنده، یا دکل دوم
    for (const d of (state.districts || [])) {
      if (!districtUnlocked(d) || !d.connected || (d.subscribers || 0) <= 0 || (d.qos || 0) >= 0.5) continue;
      const srv = servingNodeForDistrict(state, d);
      if (!srv) continue;
      if (moduleCount(srv, 'cap_boost') < 6 && canSpend(8000)) {
        const r = installModule(state, srv.id, 'cap_boost');
        if (r && r.ok) continue;
      }
      if (builds < 2) {
        const spot = aiFindSpot(state, d.x + (rand(state) * 2 - 1) * (d.radius || 300) * 0.5, d.y + (rand(state) * 2 - 1) * (d.radius || 300) * 0.5);
        const eqId = y >= 2009 && canSpend((getEq('cell_4g') || {}).cost || 38000) ? 'cell_4g'
          : y >= 2001 && canSpend((getEq('cell_3g') || {}).cost || 25000) ? 'cell_3g'
          : canSpend((getEq('cell_2g') || {}).cost || 12000) ? 'cell_2g' : null;
        if (spot && eqId) { const node = buildNode(state, eqId, spot.x, spot.y); if (node) { builds++; aiConnectNode(state, node); } }
      }
    }
    // ۶) ماژول TD-LTE روی دکل‌های 4G/5G (از ۲۰۱۲)
    if (y >= 2012) {
      for (const n of state.nodes) {
        if (!own(n) || (n.type !== 'cell_4g' && n.type !== 'cell_5g') || !n.connected || hasModule(n, 'tdlte')) continue;
        if (canSpend((getModule('tdlte') || {}).cost || 15000)) installModule(state, n.id, 'tdlte');
      }
    }
    // ۷) بازکردن منطقهٔ جدید وقتی نقدینگی کافی است و مناطق باز پوشش دارند
    const locked = (state.districts || []).filter((d) => !districtUnlocked(d));
    const allServed = (state.districts || []).filter((d) => districtUnlocked(d)).every((d) => d.connected);
    if (locked.length && allServed) {
      locked.sort((a, b) => districtUnlockCost(a) - districtUnlockCost(b));
      const target = locked[0];
      if (state.cash >= districtUnlockCost(target) * 2.5 + reserve && (state.debt || 0) <= 0) unlockDistrict(state, target.id);
    }
    // ۸) استخدام متناسب با رشد شبکه
    if (state.cash > reserve + 10000 && (state.debt || 0) <= 0) {
      const fx = staffEffects(state);
      if (fx.techs < fx.reqTechs) hireStaff(state, 'technician');
      else if (fx.sups < fx.reqSups) hireStaff(state, 'support');
      else if (fx.sales < fx.reqSales) hireStaff(state, 'sales');
      else if (fx.engs < fx.reqEngs) hireStaff(state, 'engineer');
    }
    refreshConnectivity(state);
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
    const ws = worldSize(state);
    const W = ws.w;
    const H = ws.h;
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
      // رشد زندهٔ شهر: فقط مناطق بازشده و در حال سرویس ساختمان تازه می‌گیرند
      if (!districtUnlocked(d) || !(d.connected || (d.subscribers || 0) > 0 || (d.rivalSubscribers || 0) > 0)) continue;
      const p = Math.min(1, (rates[d.type] != null ? rates[d.type] : 0.07) * dtDays);
      if (rand(state) >= p) continue;
      // تلاش برای یافتن جای مناسب داخل منطقه (نه روی خیابان، نه در رودخانه، نه روی ساختمان/گره دیگر)
      // تلاش‌های اول: جبهه‌ای کنار خیابان و هم‌جهت با آن؛ تلاش‌های پایانی: شعاع بزرگ‌تر و ساختمان کوچک‌تر
      for (let attempt = 0; attempt < 80; attempt++) {
        let w, h, x, y;
        const roads = state.roads;
        if (attempt < 40 && roads && (roads.h || roads.v)) {
          const horiz = rand(state) < 0.5;
          const lines = (horiz ? roads.h : roads.v) || [];
          const center = horiz ? d.y : d.x;
          const near = lines.filter((L) => Math.abs(L - center) < d.radius);
          if (!near.length) continue;
          const L = near[Math.floor(rand(state) * near.length)];
          const side = rand(state) < 0.5 ? 1 : -1;
          const fl = 26 + Math.floor(rand(state) * 38);
          const dep = 22 + Math.floor(rand(state) * 26);
          const along = (horiz ? d.x : d.y) + (rand(state) * 2 - 1) * d.radius * 0.8;
          if (horiz) { w = fl; h = dep; x = Math.round(along - w / 2); y = Math.round(side > 0 ? L + 16 : L - 16 - h); }
          else { w = dep; h = fl; y = Math.round(along - h / 2); x = Math.round(side > 0 ? L + 16 : L - 16 - w); }
          if (Math.hypot(x + w / 2 - d.x, y + h / 2 - d.y) > d.radius) continue;
        } else {
          const small = attempt >= 50;
          w = 26 + Math.floor(rand(state) * (small ? 16 : 42));
          h = 26 + Math.floor(rand(state) * (small ? 16 : 42));
          const ang = rand(state) * Math.PI * 2;
          const rr = Math.sqrt(rand(state)) * d.radius * (attempt >= 30 ? 0.92 : 0.85);
          x = Math.round(d.x + Math.cos(ang) * rr - w / 2);
          y = Math.round(d.y + Math.sin(ang) * rr - h / 2);
        }
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
          bornDay: state.day, // برای نمایش «در حال ساخت» روی نقشه
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
          bornDay: state.day,
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
    if (!districtUnlocked(a) || !districtUnlocked(b)) return false; // منطقهٔ قفل‌شده ادغام نمی‌شود
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
    keep.rivalSubscribers = (keep.rivalSubscribers || 0) + (drop.rivalSubscribers || 0);
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
    refreshConnectivity(state); // تداخل و کیفیت همان لحظه بازمحاسبه شود
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
    refreshConnectivity(state);
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
    // مسیر واقعی هر ساختمان یک‌بار در هر ارزیابی حساب و کش می‌شود
    const pathCache = new Map();
    const hasPath = (buildingId) => {
      if (!pathCache.has(buildingId)) {
        const b = (state.buildings || []).find((x) => String(x.id) === String(buildingId));
        pathCache.set(buildingId, b ? buildingNetworkPath(state, b).hasPath : false);
      }
      return pathCache.get(buildingId);
    };
    for (const ind of (state.individuals || [])) {
      const d = ind.districtId ? (state.districts || []).find((x) => x.id === ind.districtId) : null;
      // کیفیت تجربه‌شده (رضایت/ریزش) و کیفیت بالقوه (پیوستن) جدا سنجیده می‌شوند
      const qos = d ? (d.qos || 0) : ((state.scattered && state.scattered.qos) || 0);
      const potentialQos = d ? (d.potentialQos != null ? d.potentialQos : qos)
        : ((state.scattered && state.scattered.potentialQos != null) ? state.scattered.potentialQos : qos);
      if (ind.status !== 'subscribed') {
        // پیوستن عمدتاً تابع کیفیت بالقوهٔ سرویس است (مثل مدل تجمیعی مشترکان منطقه)؛ قیمت فقط احتمال روزانه را کم‌وزیاد می‌کند،
        // نه اینکه در مناطق با بستهٔ گران تقریباً همه را برای همیشه بیرون نگه دارد و لیست با آمار منطقه ناسازگار شود.
        // شرط سخت: ساختمان باید مسیر واقعی تا دروازه داشته باشد؛ بدون مسیر، اشتراکی در کار نیست.
        if (potentialQos >= 0.3 && hasPath(ind.buildingId)) {
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
        // اگر مسیر ساختمان از بین رفته باشد، اشتراک هم تمام می‌شود (سرویسی در کار نیست)
        if (!hasPath(ind.buildingId)) {
          ind.status = 'unsubscribed';
          ind.satisfaction = Math.round(ind.satisfaction);
          continue;
        }
        ind.satisfaction = clamp(ind.satisfaction + (qos * 100 - ind.satisfaction) * 0.3, 0, 100);
        if (qos < 0.1 && rand2(state) < 0.3) {
          ind.status = 'unsubscribed';
          ind.satisfaction = Math.round(ind.satisfaction);
        }
      }
    }
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

  // ---------- دستاوردها (ویژگی ۶) ----------
  function achievementMetrics(state) {
    const lf = state.lastFlow || {};
    const totalSubs = lf.totalSubscribers != null ? lf.totalSubscribers
      : (state.districts || []).reduce((s, d) => s + (d.subscribers || 0), 0) + ((state.scattered && state.scattered.subscribers) || 0);
    const servedDistricts = lf.servedDistricts != null ? lf.servedDistricts
      : (state.districts || []).filter((d) => d.connected).length;
    const counters = state.counters || {};
    const unlockedCount = (state.districts || []).filter((d) => districtUnlocked(d)).length;
    return {
      subscribers: totalSubs,
      cash: state.cash || 0,
      totalRevenue: state.totalRevenue || 0,
      monthlyRevenue: lf.monthlyRevenue != null ? lf.monthlyRevenue : (state.monthRevenue || 0),
      servedDistricts,
      coveragePct: unlockedCount ? Math.round(100 * servedDistricts / unlockedCount) : 0,
      unlockedDistricts: unlockedCount,
      year: yearOf(state),
      nodes: (state.nodes || []).filter((n) => !isRivalNode(n)).length,
      fiberLinks: (state.links || []).filter((l) => l.medium === 'fiber' && !isRivalNode(nodeById(state, l.from))).length,
      campaignsRun: counters.campaignsRun || 0,
      satisfaction: state.satisfaction || 0,
      days: Math.floor(state.day || 1),
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
    const byTech = { fiber: 0, cellular: 0, fwa: 0, wifi: 0 };
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
      cov: (() => { const u = (state.districts || []).filter((d) => districtUnlocked(d)).length; return u ? Math.round(100 * servedDistricts / u) : 0; })(),
      byTech,
    });
    if (state.history.length > 400) state.history.splice(0, state.history.length - 400);
  }

  function tick(state, dtDays) {
    dtDays = (dtDays === undefined || dtDays === null) ? 1 : dtDays;
    if (state.paused) return { events: [], problems: state.problems || [] };
    state.day += dtDays;

    // موج تقاضا موقت است: ضریب مصرف هر منطقه به‌تدریج (طی حدود یک ماه) به ۱ برمی‌گردد
    for (const d of (state.districts || [])) {
      if (d.usageMult != null && d.usageMult !== 1) {
        d.usageMult = 1 + (d.usageMult - 1) * Math.pow(0.92, dtDays);
        if (Math.abs(d.usageMult - 1) < 0.005) d.usageMult = 1;
      }
    }

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
        // تعمیر آنی است: گره‌های «در حال تعمیر» ذخیره‌های قدیمی همان لحظه برمی‌گردند
        n.repairWork = 0; n.status = 'active'; n.health = n.repairHealth || 85;
        log(state, 'تعمیر «' + (n.name || 'گره') + '» تمام شد و به شبکه برگشت.', 'repair');
      } else if (n.status === 'upgrading') {
        // ذخیره‌های قدیمی: ارتقای نیمه‌کاره به ماژول تبدیل شده است؛ گره فعال می‌شود
        n.upgradeWork = 0;
        n.status = n._preUpgradeStatus || 'active';
        delete n._preUpgradeStatus;
      }
    }
    for (const l of state.links) {
      if (l.status === 'repairing') {
        l.repairWork = 0; l.status = 'active';
        log(state, 'تعمیر لینک ' + mediumFa(l.medium) + ' تمام شد.', 'repair');
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
    // (تغییر نوع لینک آنی است و در تیک پردازش نمی‌شود)

    // خرابی‌های تصادفی کوچک (هسته و دروازه در مرکز داده محافظت‌شده‌اند)
    // سامانه‌های برق (دستهٔ power) از گره‌های نزدیک محافظت می‌کنند: خرابی کمتر، فرسودگی کندتر
    const isHQ = (n) => n && (n.type === 'core_router' || n.type === 'internet_gateway');
    const powerNodes = state.nodes.filter((n) => nodeCategory(n) === 'power' && isUsableNode(n));
    const isProtected = (n) => powerNodes.some((p) => p.id !== n.id && dist(n.x, n.y, p.x, p.y) <= (p.radius || 0));
    for (const n of state.nodes) {
      if (isHQ(n)) continue;
      const prot = isProtected(n);
      // فرسودگی اثر واقعی دارد: هرچه سلامت گره کمتر، احتمال خرابی بیشتر (سلامت ۱۰ ≈ ۲٫۸ برابر)
      const healthRisk = 1 + (100 - (n.health == null ? 100 : n.health)) / 50;
      if (n.status === 'active' && rand(state) < 0.0004 * dtDays * (prot ? 0.3 : 1) * healthRisk) {
        n.status = 'failed'; n.health = 0;
        log(state, 'گره «' + (n.name || 'نامشخص') + '» خراب شد.', 'error');
      } else if (n.status === 'active') {
        n.health = clamp(n.health - 0.02 * dtDays * (prot ? 0.5 : 1), 10, 100);
      }
    }
    // خرابی تصادفی ماژول‌ها (فقط گره‌های بازیکن؛ تعمیرشان آنی است)
    for (const n of state.nodes) {
      if (isRivalNode(n) || isHQ(n) || n.status !== 'active') continue;
      const distinct = Array.from(new Set(nodeModules(n))).filter((mid) => !isModuleBroken(n, mid));
      if (!distinct.length) continue;
      if (rand(state) < 0.0012 * dtDays) {
        breakModule(state, n.id, distinct[Math.floor(rand(state) * distinct.length)]);
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

    // کمپین‌ها (هزینهٔ روزانه و انقضا) قبل از جریان ترافیک
    tickCampaigns(state, dtDays);

    // رویدادها + failover خودکار
    const events = rollEvents(state, dtDays);
    if (state.links.some((l) => l.status === 'cut')) failover(state);

    // شرکت رقیب شبکه‌اش را گسترش می‌دهد (اگر فعال باشد)
    rivalTick(state, dtDays);

    // جریان ترافیک (روزانه: با میانگین ضریب تقاضای ۲۴ ساعت)
    computeFlow(state, { dailyAvg: true });

    // مشترکان فردی و تاریخچهٔ روزانه
    spawnIndividuals(state, dtDays);
    evaluateIndividuals(state);
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
      let rivalCosts = 0;
      for (const n of state.nodes) {
        const nodeCost = monthlyNodeCost(state, n); // پایه + ماژول‌ها + نگهداری متناسب با ظرفیت
        if (isRivalNode(n)) rivalCosts += nodeCost; else costs += nodeCost;
      }
      if (state.rival && state.rival.enabled) state.rival.cash = Math.max(0, state.rival.cash - rivalCosts);
      for (const st of state.staff) costs += st.salary || 0;
      // ترانزیت: هزینهٔ ترافیک عبوری از دروازه اینترنت (متناسب با اندازهٔ شبکه)
      const transitCost = monthlyTransitCost(state);
      costs += transitCost;
      // مالیات: ۵٪ درآمد ماه
      const tax = Math.round(revenue * 0.05);
      state.lastTax = tax;
      costs += tax;

      for (const d of (state.districts || [])) { d._qosAcc = 0; d._qosDays = 0; }

      // بهرهٔ بدهی: ۵٪ ماهانه روی بدهی قبلی
      if ((state.debt || 0) > 0) {
        const interest = Math.round(state.debt * 0.05);
        state.debt += interest;
        if (interest > 0) log(state, 'بهرهٔ بدهی این ماه: ' + interest + ' تومان به بدهی اضافه شد.', 'finance');
      }

      state.cash -= costs;
      state.totalCosts += costs;
      state.lastMonthlyProfit = revenue - costs;
      if (state.lastMonthlyProfit > 0) state.counters.profitMonths = (state.counters.profitMonths || 0) + 1;
      if (state.cash < 0) {
        state.debt += -state.cash; state.cash = 0;
        // حقوق پرداخت‌نشده: یک نفر از پرسنل استعفا می‌دهد
        if ((state.staff || []).length > 0) {
          const quitter = state.staff.splice(Math.floor(rand(state) * state.staff.length), 1)[0];
          log(state, 'به‌خاطر پرداخت‌نشدن حقوق، یک «' + ((quitter && quitter.name) || 'کارمند') + '» استعفا داد.', 'warn');
        }
      } else if ((state.debt || 0) > 0) {
        // بازپرداخت خودکار: نیمی از نقدینگی مثبت صرف بدهی می‌شود
        const repay = Math.min(state.debt, Math.floor(state.cash * 0.5));
        if (repay > 0) { state.debt -= repay; state.cash -= repay; log(state, repay + ' تومان از بدهی بازپرداخت شد.', 'finance'); }
      }
      state.loan = state.debt;
      // هشدار ورشکستگی: بدهی سنگین نسبت به درآمد ماهانه (بازی ادامه دارد، ولی بهره و استعفا فشار می‌آورند)
      const bankruptcyThreshold = Math.max(100000, revenue * 3);
      state.bankruptcyWarning = (state.debt || 0) > bankruptcyThreshold;
      if (state.bankruptcyWarning) {
        events.push({ id: 'bankruptcy_warning', name: 'هشدار ورشکستگی', type: 'finance', description: 'بدهی شرکت از حد خطر گذشته است؛ بهرهٔ ماهانه و استعفای پرسنل ادامه دارد تا بدهی کم شود.', detail: 'بدهی فعلی: ' + Math.round(state.debt) + ' تومان', day: Math.floor(state.day) });
        log(state, 'هشدار ورشکستگی: بدهی به ' + Math.round(state.debt) + ' تومان رسیده است.', 'warn');
      }
      log(state, 'پایان ماه: درآمد ' + revenue + '، هزینه ' + costs + ' (ترانزیت ' + transitCost + '، مالیات ' + tax + ')، سود ' + (revenue - costs) + '.', 'finance');
    }

    // حالت تماشاچی: هوش مصنوعی بعد از محاسبهٔ جریان، شرکت را اداره می‌کند
    aiTick(state, dtDays);

    updateTutorial(state);
    checkMissions(state);
    checkAchievements(state);
    // ورود به دوران جدید (خط زمانی تاریخی) اعلام می‌شود
    const newEra = checkEraChange(state);
    if (newEra) events.push({ id: 'era_' + newEra.year, name: 'دوران جدید: ' + newEra.name, type: 'era', description: newEra.desc, detail: '', day: Math.floor(state.day) });
    state.problems = buildProblems(state);
    return { events, problems: state.problems };
  }

  // ---------- عملیات کمکی برای UI ----------
  // بازپرداخت حذف گره: ۵۰٪ کل سرمایه‌گذاری (هزینهٔ ساخت + هزینهٔ همهٔ سطح‌های ماژول‌ها؛
  // سطح‌های پایهٔ منبع تغذیه داخل قیمت ساخت‌اند و جدا حساب نمی‌شوند)
  function demolishRefund(state, id) {
    const n = nodeById(state, id);
    if (!n) return 0;
    const eq = getEq(n.type);
    let invested = eq ? (eq.cost || 0) : 0;
    const basePowerLevels = smallestPowerLevelFor((eq && eq.powerDraw) || 0);
    for (const mid of new Set(nodeModules(n))) {
      const m = getModule(mid);
      if (!m) continue;
      const lvl = moduleCount(n, mid);
      const from = mid === 'power' ? basePowerLevels + 1 : 1;
      for (let k = from; k <= lvl; k++) invested += moduleCostForLevel(m, k);
    }
    return Math.round(invested * 0.5);
  }
  function demolishNode(state, id) {
    const n = nodeById(state, id);
    if (!n) return { ok: false, error: 'گره پیدا نشد.' };
    if (isRivalNode(n)) return { ok: false, error: 'این گره متعلق به شرکت رقیب است و قابل حذف نیست.' };
    const refund = demolishRefund(state, id); // بازپرداخت ۵۰٪ کل سرمایه‌گذاری (ساخت + ماژول‌ها)
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
    const ws = worldSize(state);
    const W = ws.w;
    const H = ws.h;
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
    if (isRivalNode(n)) return { ok: false, error: 'این گره متعلق به شرکت رقیب است و قابل جابه‌جایی نیست.' };
    if (n.status === 'building') return { ok: false, error: 'این گره در حال ساخت است و فعلاً قابل جابه‌جایی نیست.' };
    if (n.status === 'repairing') return { ok: false, error: 'این گره در حال تعمیر است و فعلاً قابل جابه‌جایی نیست.' };
    const valid = isValidPlacement(state, x, y);
    if (!valid.ok) return valid;
    const dAt = districtAtPoint(state, x, y);
    if (dAt && !districtUnlocked(dAt)) return { ok: false, error: 'منطقهٔ «' + dAt.name + '» هنوز باز نشده است.' };
    const eq = getEq(n.type);
    // هزینهٔ جابه‌جایی = ۱۰٪ هزینهٔ ساخت + کشیدن دوبارهٔ همهٔ لینک‌ها با فاصله‌های جدید
    let relinkCost = 0;
    for (const l of linksOfNode(state, id)) {
      const other = nodeById(state, l.from === id ? l.to : l.from);
      if (other) relinkCost += Math.round(dist(x, y, other.x, other.y) * linkCostPerUnit(l.medium));
    }
    const cost = Math.max(500, Math.round((eq ? eq.cost : 5000) * 0.1) + relinkCost);
    if (state.cash < cost) return { ok: false, error: 'بودجه کافی برای جابه‌جایی نیست. هزینه: ' + cost };
    state.cash -= cost;
    state.totalCosts += cost;
    n.x = Math.round(x); n.y = Math.round(y);
    n.buildTimer = 0; // جابه‌جایی آنی است
    log(state, '«' + (n.name || 'گره') + '» جابه‌جا شد (آنی).', 'build');
    refreshConnectivity(state);
    return { ok: true, cost, days: 0 };
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

  // انتخاب بستهٔ اشتراک هر منطقه (از پنل منطقه): بسته‌های گیمینگ/استریم/TD-LTE هم قابل انتخاب‌اند
  function setDistrictPackage(state, districtId, packageId) {
    const cust = (state.customers || []).find((c) => String(c.districtId) === String(districtId));
    if (!cust) return { ok: false, error: 'منطقه پیدا نشد.' };
    const pkg = (state.packages || []).find((p) => p.id === packageId);
    if (!pkg) return { ok: false, error: 'بسته پیدا نشد.' };
    cust.packageId = packageId;
    const d = (state.districts || []).find((x) => String(x.id) === String(districtId));
    log(state, 'بستهٔ منطقهٔ «' + ((d && d.name) || districtId) + '» به «' + pkg.name + '» تغییر کرد.', 'finance');
    refreshConnectivity(state);
    return { ok: true, package: pkg };
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
      if (isRivalNode(n) !== isRivalNode(fromNode)) continue;
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
        if (isRivalNode(n)) return fail('این گره متعلق به شرکت رقیب است.');
        const eq = getEq(n.type);
        const cost = Math.round((eq ? Math.round(eq.cost * 0.1) : 500) * staffEffects(state).repairDiscount);
        if (state.cash < cost) return fail('بودجه کافی برای تعمیر نیست.');
        // تعمیر آنی است: گره همان لحظه به سرویس برمی‌گردد
        state.cash -= cost; n.status = 'active'; n.repairWork = 0; n.health = 85;
        log(state, '«' + (n.name || 'نامشخص') + '» تعمیر شد و به شبکه برگشت (آنی).', 'repair');
        refreshConnectivity(state);
        return { ok: true, cost };
      }
      case 'replace': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        if (isRivalNode(n)) return fail('این گره متعلق به شرکت رقیب است.');
        const eq = getEq(n.type);
        const cost = Math.round((eq ? Math.round(eq.cost * 0.25) : 1000) * staffEffects(state).repairDiscount);
        if (state.cash < cost) return fail('بودجه کافی برای جایگزینی نیست.');
        // جایگزینی هم آنی است: گره با سلامت کامل برمی‌گردد
        state.cash -= cost; n.status = 'active'; n.repairWork = 0; n.health = 100;
        log(state, '«' + (n.name || 'نامشخص') + '» با نمونهٔ نو جایگزین شد (آنی).', 'repair');
        refreshConnectivity(state);
        return { ok: true, cost };
      }
      case 'repair_link': {
        const r = repairLink(state, fix.linkId || prob.linkId);
        return r.ok ? { ok: true, cost: r.cost } : fail(r.error || 'تعمیر لینک ناموفق بود.');
      }
      case 'install_power': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        // منبع تغذیه را سطح‌به‌سطح آپگرید کن تا مصرف گره را پوشش دهد
        let totalCost = 0;
        for (let guard = 0; guard < POWER_LEVEL_CAP; guard++) {
          const pw = nodePowerInfo(n);
          if (pw.ok) break;
          const r = installModule(state, n.id, 'power');
          if (!r.ok) return totalCost > 0 ? { ok: true, cost: totalCost } : fail(r.error || 'آپگرید منبع تغذیه ناموفق بود.');
          totalCost += r.cost || 0;
        }
        return nodePowerInfo(n).ok ? { ok: true, cost: totalCost } : fail('توان منبع تغذیه هنوز کافی نیست.');
      }
      case 'repair_module': {
        const r = repairModule(state, fix.nodeId || prob.nodeId, fix.moduleId);
        return r.ok ? { ok: true, cost: r.cost } : fail(r.error || 'تعمیر ماژول ناموفق بود.');
      }
      case 'connect': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        const target = nearestCoreNode(state, n);
        if (!target) return fail('گره هسته‌ای برای اتصال نیست.');
        // اولین رسانهٔ بازشده در این دوران (فیبر ۱۹۹۵، نقطه‌به‌نقطه ۱۹۹۶، وگرنه اترنت/مسی)
        const wanted = (fix.medium && fix.medium.length) ? fix.medium : ['fiber', 'ptp', 'ethernet', 'copper'];
        const medium = wanted.concat(['ethernet', 'copper']).find((m) => yearOf(state) >= mediumUnlockYear(m)) || 'copper';
        const l = connect(state, n.id, target.id, medium);
        return l ? { ok: true, link: l } : fail('اتصال برقرار نشد.');
      }
      case 'build_backup': {
        const l = linkById(state, fix.linkId || prob.linkId);
        if (!l) return fail('لینک پیدا نشد.');
        const a = nodeById(state, l.from);
        const target = a ? nearestCoreNode(state, a) : null;
        if (!target) return fail('مسیر پشتیبان ممکن نیست.');
        const nl = connect(state, a.id, target.id, yearOf(state) >= 1996 ? 'ptp' : 'ethernet', { isBackup: true });
        return nl ? { ok: true, link: nl } : fail('ساخت لینک پشتیبان ناموفق بود.');
      }
      case 'failover': {
        return failover(state) ? { ok: true } : fail('مسیر پشتیبان در دسترس نیست.');
      }
      case 'build_access': {
        const d = state.districts.find((x) => x.id === (fix.districtId || prob.districtId));
        if (!d) return fail('منطقه پیدا نشد.');
        const eqId = ((fix.equipment || []).find((e) => isUnlocked(state, e)) || 'cell_3g');
        const n = buildNode(state, eqId, d.x, d.y);
        return n ? { ok: true, node: n } : fail('ساخت گره ناموفق بود (بودجه یا فناوری).');
      }
      case 'upgrade': {
        const d = state.districts.find((x) => x.id === (fix.districtId || prob.districtId));
        if (!d) return fail('منطقه پیدا نشد.');
        const srv = servingNodeForDistrict(state, d);
        if (!srv) return fail('گره‌ای برای ارتقا نیست.');
        const r = installModule(state, srv.id, 'cap_boost');
        return r.ok ? { ok: true, cost: r.cost } : fail(r.error || 'نصب ماژول ناموفق بود.');
      }
      case 'install_module': {
        const nid = fix.nodeId || prob.nodeId;
        const r = installModule(state, nid, fix.moduleId || 'cap_boost');
        return r.ok ? { ok: true, cost: r.cost } : fail(r.error || 'نصب ماژول ناموفق بود.');
      }
      case 'add_repeater': {
        const l = linkById(state, fix.linkId || prob.linkId);
        if (!l) return fail('لینک پیدا نشد.');
        const a = nodeById(state, l.from), b = nodeById(state, l.to);
        if (!a || !b) return fail('گره‌های لینک پیدا نشدند.');
        const eq = getEq('repeater');
        const cost = eq ? eq.cost : 4000;
        if (state.cash < cost) return fail('بودجه کافی برای تقویت‌کننده نیست.');
        const mx = Math.round((a.x + b.x) / 2), my = Math.round((a.y + b.y) / 2);
        const rep = buildNode(state, 'repeater', mx, my);
        if (!rep) return fail('ساخت تقویت‌کننده ناموفق بود.');
        const medium = l.medium;
        state.links = state.links.filter((x) => x.id !== l.id);
        connect(state, a.id, rep.id, medium, { internal: true }); // همان رسانهٔ لینک قبلی (grandfathered)
        connect(state, rep.id, b.id, medium, { internal: true });
        log(state, 'تقویت‌کننده در میانهٔ مسیر ' + mediumFa(medium) + ' نصب شد؛ افت سیگنال جبران شد.', 'build');
        return { ok: true, cost, node: rep };
      }
      case 'parallel_link': {
        // افزایش پهنای باند فقط با لینک موازی: کنار هر لینک پرمصرف یک لینک هم‌نوع ساخته می‌شود
        // و ترافیک خودکار بینشان تقسیم می‌شود. هزینهٔ هر لینک (فاصله × هزینهٔ واحد) در connect کسر می‌شود.
        const hot = state.links.filter((l) => l.status === 'congested' && !isRivalNode(nodeById(state, l.from)));
        if (!hot.length) return fail('لینک پرمصرفی نیست.');
        let built = 0, cost = 0;
        hot.forEach((l) => {
          const a = nodeById(state, l.from), b = nodeById(state, l.to);
          const c = linkCostFor(state, a, b, l.medium);
          if (connect(state, l.from, l.to, l.medium)) { built++; cost += c; }
        });
        if (!built) return fail('بودجه کافی برای ساخت لینک موازی نیست.');
        log(state, built + ' لینک موازی کنار لینک‌های پرمصرف ساخته شد؛ ترافیک خودکار تقسیم می‌شود.', 'build');
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
    (state.links || []).forEach((l) => {
      // لینک‌های در حال تغییرِ ذخیره‌های میانی: تغییر نوعشان آنی اعمال شود
      if (l.status === 'changing' || l.status === 'upgrading') {
        if (l.pendingMedium) { l.medium = l.pendingMedium; delete l.pendingMedium; }
        l.changeWork = 0;
        l.status = 'active';
      }
      delete l.pendingLevel;
      // ارتقای سطح لینک حذف شده است: ظرفیت لینک‌های ارتقایافته به پایه برمی‌گردد و هزینهٔ
      // ارتقاهای قبلی برگردانده می‌شود (سطح: مجموع ۰٫۶×هزینهٔ رسانه×سطح برای هر گام؛
      // ظرفیت دوبرابرشده با رفع خودکار قدیمی: ۶۰۰۰ برای هر بار دوبرابرشدن).
      const base = linkBaseCapacity(l.medium);
      const lvl = l.level || 1;
      if (lvl > 1) {
        let refund = 0;
        for (let k = 1; k < lvl; k++) refund += Math.round(0.6 * (LINK_MEDIUM_COST[l.medium] || 3000) * k);
        state.cash = (state.cash || 0) + refund;
        l.capacity = base;
      } else if ((l.capacity || 0) > base) {
        const n = Math.round(Math.log2(l.capacity / base));
        if (n >= 1 && base * Math.pow(2, n) === l.capacity) {
          state.cash = (state.cash || 0) + 6000 * n;
          l.capacity = base;
        }
      } else if ((l.capacity || 0) < base) {
        // آسیب دائمی طوفان در نسخه‌های قبلی: ظرفیت به پایه برمی‌گردد (حالا آسیب موقت است)
        l.capacity = base;
      }
      delete l.level;
      delete l.degradedUntil; delete l.degradeFactor;
    });
    if (!state.counters.building) state.counters.building = state.buildings.length;
    if (state.monthRevenue == null) state.monthRevenue = 0;
    // فیلدهای جدید: ساعت، آب‌وهوا، دستاوردها، افراد، قراردادها، کمپین‌ها، تاریخچه
    if (state.hour == null) state.hour = 10;
    if (state.pendingDays == null) state.pendingDays = 0;
    if (!state.weather) state.weather = { kind: 'clear', untilDay: Math.floor(state.day || 1) + 1 };
    if (!state.achievements) state.achievements = {};
    if (!Array.isArray(state.newAchievements)) state.newAchievements = [];
    if (!Array.isArray(state.individuals)) state.individuals = [];
    // قراردادهای سازمانی حذف شده‌اند: از ذخیره‌های قبلی بدون جریمه برداشته می‌شوند
    delete state.contracts;
    delete state.contractOffers;
    if (!Array.isArray(state.campaigns)) state.campaigns = [];
    if (!Array.isArray(state.history)) state.history = [];
    if (!Array.isArray(state.activeEffects)) state.activeEffects = [];
    if (!state._eventCooldowns) state._eventCooldowns = {};
    if (state.spectatorAI == null) state.spectatorAI = false;
    if (state.lastTax == null) state.lastTax = 0;
    if (state.penetration == null) state.penetration = 0;
    // گره‌های «کابل» ذخیره‌های قبلی سر جایشان می‌مانند و کار می‌کنند؛ فقط ساخت جدیدشان ممکن نیست
    for (const key of ['individual', 'contract', 'campaign', 'built', 'contractsDone', 'campaignsRun', 'profitMonths']) {
      if (state.counters[key] == null) state.counters[key] = 0;
    }
    // مهاجرت حذف اینترنت ماهواره‌ای (ذخیره‌های قبلی): گره‌های ماهواره‌ای در حلقهٔ گره‌ها
    // با legacyEquipmentMap به نزدیک‌ترین معادل تبدیل می‌شوند (پایانه→TD-LTE، دروازه زمینی→تجمیع)؛
    // بقیهٔ ارجاع‌ها این‌جا پاک می‌شوند تا هیچ ارجاع معلقی نماند.
    delete state.satellites;
    if (state.counters) delete state.counters.satellite;
    // تحقیق و توسعه حذف شده است: پیشرفت حالا با خط زمانی تاریخی است و سال از روی روز ساخته می‌شود
    state.techsUnlocked = [];
    state.year = yearOf(state);
    state.eraYear = (eraOf(state) || {}).year || TL.startYear;
    state.missions = (state.missions || []).filter((m) => (DATA.missions || []).some((dm) => dm.id === m.id));
    (state.links || []).forEach((l) => {
      if (l.medium === 'satellite') { // لینک ماهواره‌ای قدیمی → فیبر (اتصال حفظ می‌شود)
        l.medium = 'fiber';
        l.capacity = linkBaseCapacity('fiber');
        l.latency = (DATA.linkMedia && DATA.linkMedia.fiber && DATA.linkMedia.fiber.latency) || 2;
      }
    });
    (state.individuals || []).forEach((p) => { if (p.prefTech === 'satellite') p.prefTech = 'fwa'; });
    for (const n of state.nodes) {
      if (n.interference == null) n.interference = 0;
      if (n.channel === undefined) n.channel = null;
      // سازگاری ذخیره‌های قدیمی: تجهیز حذف‌شده از کاتالوگ ساده‌شده → نزدیک‌ترین معادل کلی
      if (!getEq(n.type)) {
        const mapped = (DATA.legacyEquipmentMap || {})[n.type] || 'fwa_ap';
        // fwa_ap دیگر در کاتالوگ نیست؛ معادلش دکل 4G است (تبدیل نهایی در بلوک پایین)
        const eqm = getEq(mapped === 'fwa_ap' ? 'cell_4g' : mapped);
        if (eqm) {
          n.type = mapped;
          n.name = eqm.name;
          n.baseCapacity = eqm.capacity || 0;
          n.baseRadius = eqm.radius || 0;
        }
      }
      // تغییر نام TD-LTE: نام قدیمی تجهیز در ذخیره‌های قبلی به نام جدید به‌روز می‌شود
      if (n.type === 'fwa_ap' && n.name && n.name.indexOf('آنتن دسترسی ثابت بی‌سیم') === 0) {
        const eqT = getEq('fwa_ap');
        n.name = (eqT ? eqT.name : 'آنتن TD-LTE') + n.name.slice('آنتن دسترسی ثابت بی‌سیم'.length);
      }
      // TD-LTE دیگر گرهٔ جدا ندارد: آنتن‌های قدیمی TD-LTE به دکل 4G با «ماژول TD-LTE» تبدیل می‌شوند
      if (n.type === 'fwa_ap') {
        const eq4 = getEq('cell_4g');
        n.type = 'cell_4g';
        if (eq4) { n.name = eq4.name; n.baseCapacity = eq4.capacity || 0; n.baseRadius = eq4.radius || 0; }
        if (!Array.isArray(n.modules)) n.modules = [];
        if (!n.modules.includes('tdlte')) n.modules.push('tdlte');
      }
      // نام‌های سادهٔ جدید: برندهای خیالی از نام گره‌های ذخیرهٔ قبلی برداشته می‌شوند
      n.name = simplifyNodeName(n);
      // سطح ارتقای قدیمی → ماژول: هر سطح بالاتر از ۱ یک «ماژول افزایش ظرفیت» می‌شود
      // (ظرفیت ×۱٫۵ دقیقاً مثل سطح قدیمی حفظ می‌شود) و اگر اسلات ماند «ماژول افزایش برد».
      if (!Array.isArray(n.modules)) n.modules = [];
      // ماژول TD-LTE فقط روی دکل 4G/5G مجاز است: از بقیهٔ گره‌ها برداشته و هزینه‌اش برگردانده می‌شود
      if (n.type !== 'cell_4g' && n.type !== 'cell_5g') {
        const misplaced = n.modules.filter((m) => m === 'tdlte').length;
        if (misplaced > 0) {
          n.modules = n.modules.filter((m) => m !== 'tdlte');
          state.cash = (state.cash || 0) + ((getModule('tdlte') || {}).cost || 15000) * misplaced;
          if (Array.isArray(state.log)) log(state, 'ماژول TD-LTE از روی «' + (n.name || 'گره') + '» برداشته شد (فقط روی دکل 4G و 5G مجاز است) و هزینهٔ نصبش برگشت.', 'build');
        }
      }
      const eqN = getEq(n.type);
      if (n.baseCapacity == null) n.baseCapacity = eqN ? (eqN.capacity || 0) : (n.capacity || 0);
      if (n.baseRadius == null) n.baseRadius = eqN ? (eqN.radius || 0) : (n.radius || 0);
      if (n.level != null && n.level > 1) {
        // سطح قدیمی → سطح ماژول (دیگر محدودیت تعداد نیست، پس همهٔ سطح‌ها تبدیل می‌شوند)
        const extra = n.level - 1;
        for (let i = 0; i < extra; i++) n.modules.push('cap_boost');
        for (let i = 0; i < extra; i++) n.modules.push('range_boost');
      }
      delete n.level;
      if (!n.brokenModules) n.brokenModules = {};
      applyModules(n);
      // برق: گره‌های ذخیره‌های قدیمی منبع تغذیه ندارند؛ خودکار تا سطحِ پوشش‌دهندهٔ مصرف فعلی پر می‌شود
      for (let guard = 0; guard < POWER_LEVEL_CAP; guard++) {
        const pw = nodePowerInfo(n);
        if (pw.ok && pw.level > 0) break;
        if (pw.level >= POWER_LEVEL_CAP) break;
        n.modules.push('power');
      }
      if (n.channel == null && channelCountFor(n) > 0) n.channel = leastInterferedChannel(state, n);
      // ساخت آنی است: گره‌های در حال ساختِ ذخیره‌های قدیمی همان لحظه فعال شوند
      if (n.status === 'building') { n.status = 'active'; n.buildTimer = 0; }
      if (n.status === 'upgrading') { n.status = n._preUpgradeStatus || 'active'; delete n._preUpgradeStatus; n.upgradeWork = 0; }
      if (n.status === 'repairing') { n.status = 'active'; n.repairWork = 0; n.health = n.repairHealth || 85; } // تعمیر آنی است
    }
    (state.fiberDrops || []).forEach((fd) => { if (fd.status === 'building') { fd.status = 'active'; fd.work = 0; } });
    const capMult = (DATA.growth && DATA.growth.capMultiplier) || {};
    if (!state.scattered) state.scattered = { subscribers: 0, demand: 0, servedDemand: 0, qos: 0, satisfaction: 0, revenue: 0, potentialSubs: 0, buildingCount: 0, coveredCount: 0 };
    // شرکت رقیب در ذخیره‌های قدیمی نیست: پیش‌فرض خاموش (فقط در بازی جدید با انتخاب بازیکن روشن می‌شود)
    if (!state.rival) state.rival = { enabled: false, cash: 0, price: RIVAL_PRICE, lastBuildDay: 0, nodesBuilt: 0 };
    // ذخیره‌های قدیمی جهان کوچک خودشان را نگه می‌دارند (نقشهٔ بزرگ فقط برای بازی جدید است)
    if (!state.worldW) { state.worldW = 7200; state.worldH = 5400; }
    for (const d of (state.districts || [])) {
      if (d.rivalSubscribers == null) d.rivalSubscribers = 0;
      // بازبودن منطقه: مرکز/شمال یا منطقه‌ای که بازیکن در آن گره ساخته/مشترک گرفته باز می‌ماند
      if (d.unlocked == null) {
        d.unlocked = d.id === 'center' || d.id === 'north' || (d.subscribers || 0) > 0 || !!d.everServed ||
          (state.nodes || []).some((n) => dist(n.x, n.y, d.x, d.y) <= (d.radius || 0));
      }
      if (d.jitter == null) d.jitter = 0;
      if (d.commuteCoverage === undefined) d.commuteCoverage = null;
      if (d.eraFactor == null) d.eraFactor = 1;
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
          nodeServes(state, n) &&
          dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + coverReach(d));
        d.techDemand = computeTechDemand(d, srv, 1, null, state);
      }
    }
    // بسته‌های ذخیره‌های قدیمی: سرعت پیش‌فرض متناسب با قیمت (صفر/خالی نماند)
    const pkgDefaults = {};
    for (const p of (DATA.packageList || DATA.packages || [])) pkgDefaults[p.id] = p;
    if (!Array.isArray(state.packages) || !state.packages.length) {
      state.packages = JSON.parse(JSON.stringify(DATA.packageList || DATA.packages || []));
    }
    // بستهٔ ماهواره‌ای حذف شده است: از ذخیره‌های قبلی برداشته و مشتریانش به بستهٔ خانگی می‌روند
    state.packages = state.packages.filter((p) => p.id !== 'satellite');
    (state.customers || []).forEach((c) => { if (c.packageId === 'satellite') c.packageId = 'home'; });
    for (const p of state.packages) {
      // تغییر نام TD-LTE: نام قدیمی بسته در ذخیره‌های قبلی به‌روز می‌شود
      if (p.id === 'fwa' && pkgDefaults[p.id]) { p.name = pkgDefaults[p.id].name; p.expectFa = pkgDefaults[p.id].expectFa; }
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
          if (ftths.some((n) => dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + coverReach(d) && inWedge(n, d.x, d.y))) coveredDistricts.add(d.id);
        }
        for (const b of (state.buildings || [])) {
          const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
          const inCoveredDistrict = b.districtId && coveredDistricts.has(b.districtId);
          const selfCovered = !b.districtId && ftths.some((n) => dist(cx, cy, n.x, n.y) <= (n.radius || 0) && inWedge(n, cx, cy));
          if (inCoveredDistrict || selfCovered) {
            const src = nearestFtth(cx, cy);
            if (src) state.fiberDrops.push({ id: 'fd' + (++state.counters.fiberDrop), buildingId: b.id, nodeId: src.id, medium: 'fiber', status: 'active', work: 0 });
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
    if (!b) return { found: false, covered: false, connected: false, individuals: 0, individualsSubscribed: 0, subscribed: false, networkPath: false, wifiVia: null, wifi: false };
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
    const subscribedCount = list.filter((p) => p.status === 'subscribed').length;
    const subscribed = subscribedCount > 0 || buildingWiredStatus(state, b.id).status === 'active';
    const path = buildingNetworkPath(state, b);
    return {
      found: true, covered, connected,
      individuals: list.length,
      individualsSubscribed: subscribedCount,
      subscribed,
      // مسیر واقعی تا دروازه: انشعابِ منبعِ متصل یا پوشش بی‌سیمِ گره متصل
      networkPath: path.hasPath,
      wifiVia: path.via,
      // وای‌فای داخلی ساختمان = اکسس‌پوینت خود مشترک؛ فقط با اشتراک + مسیر واقعی تا شبکه فعال است
      wifi: subscribed && path.hasPath,
    };
  }

  // اطلاعات اتصال مشترکِ یک ساختمان: فناوری‌های فعال (از تست سرعت همان ساختمان)،
  // سرعت تحویلی با سقف بستهٔ منطقه و پینگ/جیتر بهترین مسیر. فقط خواندنی است.
  function subscriberConnectionInfo(state, buildingId) {
    const b = (state.buildings || []).find((x) => String(x.id) === String(buildingId));
    if (!b) return { found: false, techs: [], speed: 0, latency: null, jitter: null, bestTech: null, servingNodeId: null, reason: 'no_building' };
    // ساختمان منطقهٔ قفل‌شده سرویس نمی‌گیرد
    if (b.districtId) {
      const bd = (state.districts || []).find((x) => String(x.id) === String(b.districtId));
      if (bd && !districtUnlocked(bd)) return { found: true, techs: [], speed: 0, latency: null, jitter: null, bestTech: null, servingNodeId: null, reason: 'district_locked' };
    }
    const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
    const st = speedTestAt(state, cx, cy);
    const techs = [];
    if (st.fiber && st.fiber.speed > 0) {
      const ws = buildingWiredStatus(state, b.id);
      techs.push({ tech: ws.medium === 'copper' ? 'copper' : 'fiber', speed: st.fiber.speed, latency: st.fiber.latency, jitter: st.fiber.jitter, nodeId: st.fiber.nodeId, nodeName: st.fiber.nodeName });
    }
    if (st.cellular && st.cellular.speed > 0) {
      const n = nodeById(state, st.cellular.nodeId);
      techs.push({ tech: 'cellular', gen: n ? cellGenOf(n.type) : 0, speed: st.cellular.speed, latency: st.cellular.latency, jitter: st.cellular.jitter, nodeId: st.cellular.nodeId, nodeName: st.cellular.nodeName });
    }
    if (st.fwa && st.fwa.speed > 0) {
      techs.push({ tech: 'fwa', speed: st.fwa.speed, latency: st.fwa.latency, jitter: st.fwa.jitter, nodeId: st.fwa.nodeId, nodeName: st.fwa.nodeName });
    }
    const best = techs.reduce((a, t) => (!a || t.speed > a.speed) ? t : a, null);
    const cust = (state.customers || []).find((c) => String(c.districtId) === String(b.districtId));
    const pkg = (state.packages || []).find((x) => x.id === (cust ? cust.packageId : 'home'));
    const pkgSpeed = pkg ? (pkg.speedMbps || 0) : 0;
    return {
      found: true, techs,
      packageName: pkg ? (pkg.name || pkg.id) : null, packageSpeed: pkgSpeed,
      speed: best ? (pkgSpeed > 0 ? Math.min(best.speed, pkgSpeed) : best.speed) : 0,
      bestTech: best ? best.tech : null, servingNodeId: best ? best.nodeId : null,
      latency: best ? best.latency : null, jitter: best ? best.jitter : null,
      reason: best ? null : ((st.wifi && st.wifi.reason) || 'no_network'),
    };
  }
  // تست تأخیر مشترک تا اینترنت: پینگ مسیر دسترسی تا دروازه + تأخیر پایهٔ فناوری دسترسی
  function subscriberLatencyTest(state, buildingId) {
    const info = subscriberConnectionInfo(state, buildingId);
    if (!info.found) return { ok: false, error: 'ساختمان پیدا نشد.' };
    if (!info.bestTech || !info.servingNodeId) return { ok: false, error: 'این مشترک به شبکه وصل نیست؛ تست تأخیر ممکن نیست.', reason: info.reason };
    const gw = (state.nodes || []).find((n) => n.type === 'internet_gateway');
    if (!gw) return { ok: false, error: 'دروازهٔ اینترنت پیدا نشد.' };
    const ping = pingBetween(state, info.servingNodeId, gw.id);
    if (!ping.ok) return { ok: false, error: ping.error || 'مسیر تا دروازه نیست.' };
    const base = techLatencyBase(info.bestTech === 'copper' ? 'fiber' : info.bestTech, nodeById(state, info.servingNodeId));
    return {
      ok: true, ms: Math.round(ping.ms + base), jitter: info.jitter,
      tech: info.bestTech, nodeId: info.servingNodeId, gatewayId: gw.id, pathNames: ping.pathNames,
    };
  }

  // شعاع پوششی منطقه روی نقشه: دست‌کم تا دورترین ساختمان منطقه (+ حاشیهٔ نصف ساختمان)
  // تا دایرهٔ قفل همهٔ ساختمان‌های منطقه را بپوشاند و هیچ ساختمانی بیرون نماند.
  function districtOverlayRadius(state, d) {
    let r = d.radius || 0;
    for (const b of (state.buildings || [])) {
      if (String(b.districtId) !== String(d.id)) continue;
      const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
      const dd = dist(d.x, d.y, cx, cy) + Math.max(b.w || 26, b.h || 20) / 2 + 14;
      if (dd > r) r = dd;
    }
    return r;
  }

  // ---------- API ----------
  const GameSim = {
    newGame, buildNode, connect, tracePath, computeFlow, tick, growCity,
    failover, saveGame, loadGame, isUnlocked,
    // عملیات کمکی UI
    demolishNode, moveNode, isValidPlacement, hireStaff, fireStaff, staffEffects, updatePackage, applyFix,
    // خط زمانی، ماژول‌ها، مناطق، رفت‌وآمد، پینگ
    yearOf, eraOf, checkEraChange, eraExpectedCellGen, cellGenOf,
    getModule, nodeModules, hasModule, moduleCount, moduleLevel, moduleSlots, tdlteCapacity, applyModules, moduleInfo, installModule,
    moduleCostForLevel, effModuleCount, isModuleBroken, repairModule, breakModule,
    powerWatts, nodePowerDraw, nodePowerCapacity, nodePowerInfo, smallestPowerLevelFor,
    eraDemandMult, surveyPtP, mediumOptions, mediumUnlockYear,
    isRivalNode, ownerOf, rivalTick, RIVAL_PRICE, worldSize,
    districtUnlocked, districtUnlockCost, unlockDistrict, districtAtPoint, buildingResidents, districtOverlayRadius,
    commuteCoverage, commuteRoutePoints, commuteRoadPath, nearestWorkDistrict, pointCellularCovered,
    commutePhase, commutePulses, nearestLeisureSpot, COMMUTE_CAP,
    linkLatency, linkAttenuation, linkEffCapacity, ptpDistanceFactor, pingBetween, techJitter, pathLatency,
    refreshConnectivity, connectBuildingFiber, disconnectBuildingFiber, buildingFiberStatus, fiberDropFor,
    connectBuildingWired, disconnectBuildingWired, buildingWiredStatus, cabinetPorts, cabinetUsedPorts, COPPER_DROP_SPEED,
    disconnectLink, linkDisconnectImpact, linksOfNode,
    changeLinkMedium, toggleLinkBackup, linkChangeOptions, linkCapacityFor, linkBaseCapacity, parallelLinks, segmentEffCapacity,
    subscriberStats, buildingServiceStatus, buildingHasSubscription, buildingNetworkPath, individualTargetFor, CONCURRENCY, INDIVIDUAL_CAP,
    subscriberConnectionInfo, subscriberLatencyTest,
    tdlteFed, pointIn4GCoverage, nodeServes, nodeServesTech,
    buildingPreference, districtPreference, districtTechSplit,
    prepareSignalField, prepareSpeedField, signalFieldAt, speedFieldAt, sampleFieldRows, interferenceFor,
    buildingAttenuation, ptpLosFactor,
    // کمکی‌ها
    nodeById, linkById, getEq, rand, ACCESS_TYPES, computeTechDemand, TECH_KEYS, speedTestAt, aggregateSpeedAt,
    isAccessNode, nodeCategory, updateDistrictSizes, mergeDistricts, desiredRadius,
    // ویژگی‌های جدید: دستاورد، کانال، جهت، سیگنال، پیشنهاد مکان، کمپین، ساعت و فصل
    checkAchievements, achievementProgress, setNodeChannel, autoChannel, setNodeDirection,
    signalAt, suggestPlacements,
    startCampaign, stopCampaign, clockTick, demandFactorAtHour, seasonOf,
    // اصلاحات ممیزی ۲۰۲۶-۱۱-۲۳: اقتصاد قیمت/سرعت، هزینهٔ لینک، تعمیر لینک، حالت تماشاچی
    repairLink, demolishRefund, setDistrictPackage, setSpectatorAI, aiTick,
    linkCostFor, linkCostPerUnit, capBoostMult, monthlyNodeCost, monthlyTransitCost, transitMbps,
    expectedSpeedForDistrict, priceGrowthFactor, priceChurnRate, priceSatFactor, droppedResidents,
    activeEffects, effectDemandMult, coverReach, basePowerWatts,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameSim;
  if (root) root.GameSim = GameSim;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
