// تست‌های اجباری شبکه‌ساز: شهر متصل — اجرا: node tests/sim.test.js
const GameSim = require('../js/sim.js');
const DATA = require('../js/data.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  — ' + extra : '')); }
}
function eq(id) { return (DATA.equipment && DATA.equipment[id]) || (DATA.equipmentList || []).find(e => e.id === id); }
function coreOf(s) { return s.nodes.find(n => n.type === 'core_router'); }
function gwOf(s) { return s.nodes.find(n => n.type === 'internet_gateway'); }
function finishBuild(s, node) { // جلو بردن زمان تا ساخت تمام شود
  for (let i = 0; i < 40 && node.status === 'building'; i++) GameSim.tick(s, 1);
}
function keepAlive(s) { // تعمیر خرابی‌های تصادفی تا تست مدل اقتصادی/رضایت باشد نه شانس
  s.nodes.forEach(n => { if (n.status === 'failed') { n.status = 'active'; n.health = 100; } });
  s.links.forEach(l => { if (l.status === 'cut') l.status = 'active'; });
}
function withLTE(s) { s.cash = Math.max(s.cash, 900000); GameSim.unlockTech(s, 'lte'); return s; }

// ---------- 9) فناوری‌های پیشرفته در شروع قفل‌اند و با R&D باز می‌شوند ----------
{
  const s = GameSim.newGame(7);
  check('9a ماهواره LEO در شروع قفل است', GameSim.isUnlocked(s, 'sat_terminal_leo') === false);
  check('9b سایت 5G در شروع قفل است', GameSim.isUnlocked(s, 'cell_5g') === false);
  check('9c FTTH در شروع قفل است', GameSim.isUnlocked(s, 'ftth') === false);
  const before = s.nodes.length;
  check('9d ساخت تجهیز قفل‌شده رد می‌شود', GameSim.buildNode(s, 'sat_terminal_leo', 100, 100) === null && s.nodes.length === before);
  // باز کردن با تحقیق‌وتوسعه (پیش‌نیازها)
  const techs = DATA.techs || DATA.techTree || [];
  const leo = techs.find(t => (t.unlocks || []).includes('sat_terminal_leo'));
  if (leo) {
    s.cash = 99999999;
    (leo.requires || []).forEach(r => GameSim.unlockTech(s, r));
    const ok = GameSim.unlockTech(s, leo.id);
    check('9e ماهواره LEO پس از R&D باز می‌شود', ok !== false && GameSim.isUnlocked(s, 'sat_terminal_leo') === true, JSON.stringify(ok));
  } else check('9e ماهواره LEO پس از R&D باز می‌شود', false, 'tech برای LEO پیدا نشد');
}

// ---------- 2) تجهیز بدون اتصال سرویس نمی‌دهد ----------
{
  const s = withLTE(GameSim.newGame(11));
  const d = s.districts.find(x => x.id === 'center') || s.districts[0];
  const node = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, node);
  GameSim.computeFlow(s);
  check('2a گره ساخته‌شده ولی متصل‌نشده: connected=false', node.connected === false);
  check('2b منطقه تحت پوشش گره متصل‌نشده سرویس نمی‌گیرد', (d.servedDemand || 0) === 0 && (d.subscribers || 0) === 0,
    'served=' + d.servedDemand + ' subs=' + d.subscribers);
  check('2c مسیر مشتری تا دروازه وجود ندارد', !GameSim.tracePath(s, 'cust_' + d.id));
}

// ---------- 1) مسیر مشتری تا دروازه اینترنت قابل ردیابی است ----------
let s1, cell1, link1;
{
  s1 = withLTE(GameSim.newGame(13));
  const d = s1.districts.find(x => x.id === 'north') || s1.districts[0];
  cell1 = GameSim.buildNode(s1, 'cell_4g', d.x, d.y);
  finishBuild(s1, cell1);
  link1 = GameSim.connect(s1, cell1.id, coreOf(s1).id, 'fiber');
  check('1a اتصال فیبر سایت به هسته ساخته شد', !!link1);
  GameSim.computeFlow(s1);
  const path = GameSim.tracePath(s1, 'cust_' + d.id);
  const ids = (path || []).map(p => (typeof p === 'string' ? p : p.id));
  check('1b مسیر مشتری تا دروازه اینترنت کامل است', !!path && ids.includes(gwOf(s1).id) && ids.includes(coreOf(s1).id) && ids.includes(cell1.id),
    JSON.stringify(ids));
  check('1c منطقه سرویس و مشترک می‌گیرد', (d.servedDemand || 0) > 0 && (d.subscribers || 0) > 0,
    'served=' + d.servedDemand + ' subs=' + d.subscribers);
}

// ---------- 4) افزایش تقاضا ظرفیت لینک را اشباع می‌کند ----------
{
  const d = s1.districts.find(x => x.id === 'north') || s1.districts[0];
  const qosBefore = d.qos;
  d.demand = (d.demand || d.demandBase) * 40; // تقاضای شدید
  GameSim.computeFlow(s1);
  const link = s1.links.find(l => l.id === (link1.id || link1));
  const ratio = link && link.capacity ? link.usage / link.capacity : 0;
  check('4a زیر بار شدید ظرفیت گره/لینک اشباع می‌شود', (cell1.usage >= cell1.capacity * 0.99) || ratio >= 0.99 || link.status === 'congested', 'nodeUsage=' + cell1.usage + '/' + cell1.capacity + ' linkRatio=' + ratio.toFixed(2));
  check('4b کیفیت سرویس با ازدحام افت می‌کند', d.qos < qosBefore || d.qos < 80, 'qos ' + qosBefore + ' -> ' + d.qos);
}

// ---------- 5) قطع مسیر روی مشتریان وابسته اثر می‌گذارد ----------
{
  const d = s1.districts.find(x => x.id === 'north') || s1.districts[0];
  d.demand = d.demandBase;
  GameSim.computeFlow(s1);
  const servedBefore = d.servedDemand;
  const link = s1.links.find(l => l.id === (link1.id || link1));
  link.status = 'cut';
  GameSim.computeFlow(s1);
  check('5a با قطع لینک، سرویس منطقه وابسته صفر/قطع می‌شود', servedBefore > 0 && (d.servedDemand || 0) === 0,
    servedBefore + ' -> ' + d.servedDemand);
  link.status = 'active';
}

// ---------- 6) مسیر پشتیبان فقط طبق تنظیمات و ظرفیت فعال می‌شود ----------
{
  const s = withLTE(GameSim.newGame(17));
  const d = s.districts.find(x => x.id === 'hospital') || s.districts[0];
  const core = coreOf(s);
  const cell = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, cell);
  const primary = GameSim.connect(s, cell.id, core.id, 'fiber');
  // فاصلهٔ منطقه تا هسته (۳۱۹۹) از برد PtP (۱۸۰۰) بیشتر است؛ مسیر پشتیبان از گره واسط می‌گذرد
  const relay = GameSim.buildNode(s, 'cell_4g', Math.round((d.x + core.x) / 2), Math.round((d.y + core.y) / 2));
  finishBuild(s, relay);
  const backup1 = GameSim.connect(s, cell.id, relay.id, 'ptp', { isBackup: true });
  const backup2 = GameSim.connect(s, relay.id, core.id, 'ptp', { isBackup: true });
  GameSim.computeFlow(s);
  check('6a مسیر پشتیبان ساخته شد', !!backup1 && !!backup2);
  // بدون خرابی، فیل‌اور نباید ترافیک را روی پشتیبان ببرد
  const bLink1 = s.links.find(l => l.id === (backup1.id || backup1));
  const bLink2 = s.links.find(l => l.id === (backup2.id || backup2));
  check('6b در حالت سالم ترافیک روی پشتیبان نیست', (bLink1.usage || 0) === 0 && (bLink2.usage || 0) === 0, 'usage=' + bLink1.usage + '/' + bLink2.usage);
  // قطع اصلی + فیل‌اور خاموش => بدون سرویس
  const pLink = s.links.find(l => l.id === (primary.id || primary));
  pLink.status = 'cut';
  s.settings.autoFailover = false;
  GameSim.computeFlow(s);
  check('6c با فیل‌اور خاموش، قطع اصلی = قطع سرویس', (d.servedDemand || 0) === 0, 'served=' + d.servedDemand);
  // فیل‌اور روشن => سرویس از پشتیبان برمی‌گردد
  s.settings.autoFailover = true;
  GameSim.failover(s);
  GameSim.computeFlow(s);
  check('6d با فیل‌اور روشن، سرویس از مسیر پشتیبان برمی‌گردد', (d.servedDemand || 0) > 0, 'served=' + d.servedDemand);
}

// ---------- 3) ماهواره به پایانه+شبکه ماهواره+دروازه زمینی+هسته وابسته است ----------
{
  const s = GameSim.newGame(19);
  s.cash = 99999999;
  const techs = DATA.techs || DATA.techTree || [];
  const leo = techs.find(t => (t.unlocks || []).includes('sat_terminal_leo'));
  if (leo) { (leo.requires || []).forEach(r => GameSim.unlockTech(s, r)); GameSim.unlockTech(s, leo.id); }
  const term = GameSim.buildNode(s, 'sat_terminal_leo', 1640, 300); // مرکز حاشیه شمالی در نقشهٔ جدید 3200×2400
  const gw = GameSim.buildNode(s, 'sat_gateway', 1600, 1200);      // مرکز دادهٔ مرکزی (HQ)
  check('3a پایانه و دروازه زمینی پس از R&D ساخته می‌شوند', !!term && !!gw);
  if (term && gw) {
    finishBuild(s, term); finishBuild(s, gw);
    GameSim.connect(s, gw.id, coreOf(s).id, 'fiber');
    const satLink = GameSim.connect(s, term.id, gw.id, 'satellite');
    const path = GameSim.traceSatellitePath(s, term.id);
    const flat = JSON.stringify(path || '');
    check('3b مسیر ماهواره‌ای کامل: پایانه→ماهواره→دروازه→هسته', !!path && flat.includes(gw.id) && flat.includes(coreOf(s).id), flat.slice(0, 200));
    // شکستن هر حلقه مسیر را می‌کشد
    const sl = s.links.find(l => l.id === (satLink && (satLink.id || satLink)));
    if (sl) { sl.status = 'cut'; check('3c قطع لینک ماهواره‌ای مسیر را می‌کشد', !GameSim.traceSatellitePath(s, term.id)); sl.status = 'active'; }
    const gwCore = s.links.find(l => (l.from === gw.id && l.to === coreOf(s).id) || (l.to === gw.id && l.from === coreOf(s).id));
    if (gwCore) { gwCore.status = 'cut'; check('3d قطع دروازه↔هسته مسیر ماهواره را می‌کشد', !GameSim.traceSatellitePath(s, term.id)); gwCore.status = 'active'; }
  }
}

// ---------- 7) سیم علت مشکل و گزینه رفع را به UI می‌دهد ----------
{
  const s = withLTE(GameSim.newGame(23));
  const d = s.districts.find(x => x.id === 'center') || s.districts[0];
  const node = GameSim.buildNode(s, 'cell_4g', d.x, d.y); // متصل نمی‌کنیم => مشکل
  finishBuild(s, node);
  const res = GameSim.tick(s, 1);
  const probs = (res && res.problems) || s.problems || [];
  const p = probs.find(x => x.cause && Array.isArray(x.fixOptions) && x.fixOptions.length > 0);
  check('7a مشکل با علت (cause) و گزینه رفع (fixOptions) گزارش می‌شود', !!p, 'problems=' + probs.length);
  check('7b پیام فارسی مشکل موجود است', !!p && typeof (p.message || p.cause) === 'string' && (p.message || '').length > 0, p && p.message);
}

// ---------- 8) ذخیره/بارگذاری ----------
{
  const s = GameSim.newGame(29);
  const d = s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  GameSim.connect(s, node.id, coreOf(s).id, 'fiber');
  GameSim.tick(s, 3);
  const json = GameSim.saveGame(s);
  const s2 = GameSim.loadGame(json);
  check('8a round-trip: نقد و روز و شمار گره‌ها/لینک‌ها برابر', s2.cash === s.cash && s2.day === s.day && s2.nodes.length === s.nodes.length && s2.links.length === s.links.length,
    'cash ' + s.cash + '/' + s2.cash + ' day ' + s.day + '/' + s2.day);
  check('8b بازی بارگذاری‌شده قابل ادامه است', !!GameSim.tick(s2, 1));
}

// ---------- 10) رشد تدریجی ساختمان‌ها تا سقف هر منطقه ----------
{
  const s = GameSim.newGame(101);
  const initial = s.buildings.length;
  const capTotal = s.districts.reduce((sum, d) => sum + d.buildingCap, 0);
  const pop0 = s.districts.reduce((sum, d) => sum + d.population, 0);
  for (let i = 0; i < 400; i++) GameSim.tick(s, 1);
  check('10a ساختمان‌ها با گذر روزها بیشتر می‌شوند', s.buildings.length > initial, initial + ' -> ' + s.buildings.length);
  for (let i = 0; i < 2600; i++) GameSim.tick(s, 1);
  const atCap = s.buildings.length;
  const overCap = s.districts.some(d => s.buildings.filter(b => b.districtId === d.id).length > d.buildingCap);
  // ساختمان‌های پراکندهٔ خارج از مناطق سقف جدا دارند (DATA.growth.outsideCap)
  const districtBuildings = s.buildings.filter(b => b.districtId).length;
  const outsideBuildings = atCap - districtBuildings;
  const outsideCap = (DATA.growth && DATA.growth.outsideCap) || 320;
  check('10b هیچ منطقه‌ای از سقف ساختمان رد نمی‌شود', !overCap && districtBuildings <= capTotal && outsideBuildings <= outsideCap,
    'district=' + districtBuildings + '/' + capTotal + ' outside=' + outsideBuildings + '/' + outsideCap);
  for (let i = 0; i < 600; i++) GameSim.tick(s, 1);
  check('10c رشد در سقف متوقف می‌شود (دیگر زیاد نمی‌شود)', s.buildings.length === atCap, atCap + ' -> ' + s.buildings.length);
  const river = s.map.river, roads = s.map.roads;
  const riverX = (y) => { for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1]; if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1, b.y - a.y); } return river[river.length - 1].x; };
  const grown = s.buildings.slice(initial);
  const badRiver = grown.some(b => Math.abs(b.x + b.w / 2 - riverX(b.y + b.h / 2)) < 60);
  const badRoad = grown.some(b => roads.v.some(lx => b.x - 14 < lx && lx < b.x + b.w + 14) || roads.h.some(ly => b.y - 14 < ly && ly < b.y + b.h + 14));
  check('10d ساختمان‌های جدید در رودخانه نیستند', !badRiver, 'grown=' + grown.length);
  check('10e ساختمان‌های جدید روی خیابان نیستند', !badRoad);
  const pop1 = s.districts.reduce((sum, d) => sum + d.population, 0);
  check('10f جمعیت مناطق با رشد ساختمان‌ها بیشتر می‌شود', pop1 > pop0, pop0 + ' -> ' + pop1);
}

// ---------- 11) اقتصاد شروع: فقط ساده‌ترین‌ها قابل خریدند ----------
{
  const s = GameSim.newGame(202);
  const wifi = eq('wifi_ap'), g2 = eq('cell_2g'), g4 = eq('cell_4g'), g5 = eq('cell_5g'), sat = eq('sat_terminal_leo'), agg = eq('aggregation');
  check('11a نقدینگی شروع برای شبکهٔ حداقلی (وای‌فای/2G) کافی است', s.cash >= wifi.cost && s.cash >= g2.cost, 'cash=' + s.cash);
  check('11b تجهیزات پیشرفته در شروع قابل خرید نیستند', s.cash < g4.cost && s.cash < g5.cost && s.cash < sat.cost && s.cash < agg.cost,
    'cash=' + s.cash + ' 4g=' + g4.cost + ' 5g=' + g5.cost + ' sat=' + sat.cost + ' agg=' + agg.cost);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  check('11c اولین ساخت آموزش با نقدینگی شروع ممکن است', !!node);
}

// ---------- 12) درآمد فروش اینترنت واقعاً به نقدینگی اضافه می‌شود ----------
{
  function runServed(seed, connectIt) {
    const s = GameSim.newGame(seed);
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
    finishBuild(s, node);
    if (connectIt) GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
    const cashAfterBuild = s.cash;
    for (let i = 0; i < 60; i++) { GameSim.tick(s, 1); keepAlive(s); }
    return { s, d, cashAfterBuild };
  }
  const served = runServed(303, true);
  const unserved = runServed(303, false);
  check('12a منطقهٔ سرویس‌گرفته مشترک می‌گیرد', served.d.subscribers > 0, 'subs=' + served.d.subscribers);
  check('12b درآمد روزانه مثبت است و نقدینگی رشد می‌کند', served.s.incomePerDay > 0 && served.s.cash > served.cashAfterBuild,
    'incomePerDay=' + served.s.incomePerDay + ' cash ' + served.cashAfterBuild + ' -> ' + served.s.cash);
  check('12c بدون اتصال هیچ درآمدی نیست', unserved.d.subscribers === 0 && unserved.s.incomePerDay === 0 && unserved.s.cash < served.s.cash,
    'subs=' + unserved.d.subscribers + ' income=' + unserved.s.incomePerDay + ' cash=' + unserved.s.cash);
}

// ---------- 13) رضایت از صفر شروع می‌شود و با سرویس خوب بالا می‌رود ----------
{
  const s = GameSim.newGame(404);
  check('13a رضایت شروع بازی صفر است (بدون شبکه)', s.satisfaction === 0 && s.districts.every(d => d.satisfaction === 0), 'sat=' + s.satisfaction);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, node);
  GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
  for (let i = 0; i < 30; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('13b رضایت منطقهٔ سرویس‌گرفته بالا می‌رود', d.satisfaction > 23, 'sat=' + d.satisfaction.toFixed(1) + ' qos=' + d.qos.toFixed(2));
}

// ---------- 14) مولد نقشهٔ تصادفی با بذر ----------
{
  const seeds = [1, 2, 3, 42, 777];
  let allOk = true; const details = [];
  for (const seed of seeds) {
    const s = GameSim.newGame(seed);
    const hqNode = coreOf(s);
    const center = s.districts.find(d => d.id === 'center');
    const north = s.districts.find(d => d.id === 'north');
    const totalDemand = s.districts.reduce((sum, d) => sum + d.demandBase, 0);
    const river = s.map.river, roads = s.map.roads;
    const riverX = (y) => { for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1]; if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1, b.y - a.y); } return river[river.length - 1].x; };
    const badB = s.buildings.some(b => Math.abs(b.x + b.w / 2 - riverX(b.y + b.h / 2)) < 60 ||
      roads.v.some(lx => b.x - 14 < lx && lx < b.x + b.w + 14) || roads.h.some(ly => b.y - 14 < ly && ly < b.y + b.h + 14));
    const ok = s.districts.length >= 25 && s.districts.length <= 30 && !!hqNode && !!center && Math.hypot(center.x - hqNode.x, center.y - hqNode.y) < 60 &&
      // فاصلهٔ حاشیه شمالی از HQ: مناطق دیگر هم‌پوشانی ندارند، پس حداقل فاصله بیشتر شده (هنوز در برد PtP و آموزش)
      !!north && Math.hypot(north.x - hqNode.x, north.y - hqNode.y) < 1450 &&
      totalDemand > 55000 && totalDemand < 85000 && !badB && s.buildings.length > 200;
    if (!ok) { allOk = false; details.push('seed ' + seed + ': districts=' + s.districts.length + ' demand=' + totalDemand + ' buildings=' + s.buildings.length + ' badB=' + badB); }
  }
  check('14a نقشه‌های بذرهای مختلف سالم‌اند (۲۵-۳۰ منطقه، HQ، تقاضا، ساختمان بیرون رودخانه/خیابان)', allOk, details.join(' | '));
  const a = GameSim.newGame(99), b = GameSim.newGame(99), c = GameSim.newGame(100);
  const sig = (s) => JSON.stringify(s.districts.map(d => [d.x, d.y, d.radius])) + JSON.stringify(s.buildings.map(x => [x.x, x.y]));
  check('14b بذر یکسان = نقشهٔ یکسان', sig(a) === sig(b));
  check('14c بذر متفاوت = نقشهٔ متفاوت', sig(a) !== sig(c));
  const s2 = GameSim.loadGame(GameSim.saveGame(a));
  check('14d بذر و نقشه در ذخیره حفظ می‌شوند', s2.mapSeed === 99 && JSON.stringify(s2.map.river) === JSON.stringify(a.map.river) && sig(s2) === sig(a));
  const old = JSON.parse(GameSim.saveGame(GameSim.newGame(55)));
  delete old.map; delete old.mapSeed; old.districts.forEach(d => delete d.buildingCap); delete old.counters.building; delete old.monthRevenue;
  const sOld = GameSim.loadGame(JSON.stringify(old));
  check('14e ذخیرهٔ قدیمی (بدون نقشهٔ تولیدشده) بدون خطا بارگذاری می‌شود', !!GameSim.tick(sOld, 1) && sOld.districts.every(d => d.buildingCap > 0));
}

// ---------- 15) بسته‌های اینترنت: سرعت پیش‌فرض متناسب با قیمت ----------
{
  const pkgs = (DATA.packageList || []).slice().sort((a, b) => a.price - b.price);
  const allPositive = pkgs.length >= 4 && pkgs.every(p => p.speedMbps > 0);
  // بسته‌های گیمینگ/استریمینگ عمداً از یکنوایی سرعت خام بیرون‌اند (گیمینگ تأخیر کم می‌فروشد نه سرعت خام)؛
  // یکنوایی سرعت با قیمت فقط برای بسته‌های استاندارد سنجیده می‌شود
  const stdPkgs = pkgs.filter(p => !p.kind || p.kind === 'standard');
  const monotonic = stdPkgs.every((p, i) => i === 0 || p.speedMbps > stdPkgs[i - 1].speedMbps);
  check('15a همهٔ بسته‌ها سرعت پیش‌فرض مثبت دارند و سرعت بسته‌های استاندارد با قیمت یکنوا بالا می‌رود', allPositive && monotonic,
    pkgs.map(p => p.id + ':' + p.price + '/' + p.speedMbps).join(' '));
  const raw = JSON.parse(GameSim.saveGame(GameSim.newGame(606)));
  raw.packages.forEach(p => { p.speedMbps = 0; });
  delete raw.packages[0].speedMbps;
  const migrated = GameSim.loadGame(JSON.stringify(raw));
  check('15b ذخیرهٔ بدون سرعت با سرعت پیش‌فرض پر می‌شود', migrated.packages.every(p => p.speedMbps > 0),
    migrated.packages.map(p => p.id + ':' + p.speedMbps).join(' '));
  function satWithSpeed(speed) {
    const s = GameSim.newGame(707);
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
    finishBuild(s, node);
    GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
    if (speed != null) GameSim.updatePackage(s, 'home', { speed: speed });
    for (let i = 0; i < 30; i++) GameSim.tick(s, 1);
    return d.satisfaction;
  }
  const satDefault = satWithSpeed(null);
  const satSlow = satWithSpeed(10);
  check('15c بستهٔ کندتر رضایت کمتری می‌دهد (سرعت واقعاً اثر دارد)', satSlow < satDefault - 2,
    'default=' + satDefault.toFixed(1) + ' slow=' + satSlow.toFixed(1));
  const gaming = pkgs.find(p => p.id === 'gaming');
  const streaming = pkgs.find(p => p.id === 'streaming');
  check('15d بسته‌های گیمینگ و استریمینگ با kind مشخص و سرعت مثبت وجود دارند',
    !!gaming && gaming.kind === 'gaming' && gaming.speedMbps > 0 &&
    !!streaming && streaming.kind === 'streaming' && streaming.speedMbps > 0,
    'gaming=' + (gaming && gaming.kind + '/' + gaming.speedMbps) + ' streaming=' + (streaming && streaming.kind + '/' + streaming.speedMbps));
}

// ---------- 16) تقاضا به تفکیک فناوری ----------
{
  const s = GameSim.newGame(808);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, node);
  GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
  for (let i = 0; i < 10; i++) { GameSim.tick(s, 1); keepAlive(s); } // keepAlive: خرابی تصادفی گره نباید تست تقاضای فناوری را خراب کند
  const td = d.techDemand || {};
  const sum = Object.values(td).reduce((a, e) => a + e.demand, 0);
  check('16a جمع تقاضای فناوری‌ها برابر تقاضای کل منطقه است', Math.abs(sum - d.demand) <= 5,
    'sum=' + sum + ' demand=' + Math.round(d.demand));
  const allDistricts = s.districts.every(dd => {
    const t = dd.techDemand || {};
    return Object.values(t).every(e => e.served <= e.demand) &&
      Math.abs(Object.values(t).reduce((a, e) => a + e.demand, 0) - dd.demand) <= 5;
  });
  check('16b در همه مناطق سرویس‌گرفته ≤ تقاضا و جمع برابر کل است', allDistricts);
  const unserved = s.districts.find(x => x.id !== d.id && !x.connected);
  check('16c منطقه بدون اتصال در همه فناوری‌ها صفر سرویس دارد',
    !!unserved && Object.values(unserved.techDemand || {}).every(e => e.served === 0),
    unserved ? JSON.stringify(unserved.techDemand) : 'no unserved district');
  check('16d فناوری سرویس‌دهنده (وای‌فای) سرویس مثبت دارد', (td.wifi || {}).served > 0, JSON.stringify(td.wifi));
}

// ---------- 17) راهنمای همه تجهیزات و فناوری‌ها ----------
{
  const eqs = DATA.equipmentList || [];
  const missing = eqs.filter(e => !e.guide || !String(e.guide).trim()).map(e => e.id);
  check('17a همه تجهیزات راهنمای فارسی دارند (' + eqs.length + ' تجهیز)', eqs.length >= 18 && missing.length === 0,
    'missing=' + missing.join(','));
  const guides = DATA.techGuides || [];
  const badG = guides.filter(g => !g.desc || !g.whenToUse || !(g.equipmentIds || []).length).map(g => g.id);
  check('17b همه فناوری‌ها راهنمای کلی دارند (' + guides.length + ' فناوری)', guides.length >= 8 && badG.length === 0,
    'bad=' + badG.join(','));
}

// ---------- 18) مدل رضایت: بدون شبکه ~۰، با پوشش بالا می‌رود ----------
{
  const s0 = GameSim.newGame(909);
  for (let i = 0; i < 20; i++) GameSim.tick(s0, 1);
  check('18a بدون هیچ شبکه‌ای رضایت کلی ~۰ می‌ماند و بالا نمی‌رود', s0.satisfaction <= 1, 'sat=' + s0.satisfaction);
  function serveDistricts(seed, ids) {
    const s = GameSim.newGame(seed);
    s.cash = 999999;
    for (const id of ids) {
      const d = s.districts.find(x => x.id === id);
      if (!d) continue;
      for (let k = 0; k < 3; k++) {
        const node = GameSim.buildNode(s, 'wifi_ap', d.x + k * 40, d.y);
        finishBuild(s, node);
        GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
      }
    }
    for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
    return s.satisfaction;
  }
  const sat1 = serveDistricts(910, ['north']);
  const sat2 = serveDistricts(910, ['north', 'residential', 'center']);
  check('18b با سرویس یک منطقه رضایت کلی مثبت می‌شود', sat1 > 0, 'sat1=' + sat1);
  check('18c پوشش بیشتر = رضایت کلی بیشتر', sat2 > sat1, 'sat1=' + sat1 + ' sat2=' + sat2);
}

// ---------- 19) تست سرعت در نقطه‌ای از نقشه ----------
{
  const s = GameSim.newGame(111);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, node);
  // قبل از اتصال: پوشش هست ولی گره متصل نیست
  GameSim.tick(s, 1);
  const rUnconn = GameSim.speedTestAt(s, d.x, d.y);
  check('19a نقطه زیر پوشش گره متصل‌نشده: سرعت صفر با علت «متصل نیست»',
    rUnconn.wifi.speed === 0 && rUnconn.wifi.reason === 'unconnected', JSON.stringify(rUnconn.wifi));
  GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
  for (let i = 0; i < 5; i++) GameSim.tick(s, 1);
  const rServed = GameSim.speedTestAt(s, d.x, d.y);
  check('19b نقطه سرویس‌گرفته: سرعت وای‌فای مثبت است', rServed.wifi.speed > 0, JSON.stringify(rServed.wifi));
  const rFar = GameSim.speedTestAt(s, 60, 60);
  check('19c نقطه بدون پوشش: همه فناوری‌ها صفر با علت «خارج از پوشش»',
    Object.values(rFar).every(e => e.speed === 0 && e.reason === 'no_coverage'), JSON.stringify(rFar));
}

// ---------- 20) کارکنان: اثرات واقعی + پیشرفت بدون کارمند ----------
{
  // 20a: بازی جدید پیش‌فرض بدون هیچ کارمندی شروع می‌شود و بدون استخدام هم می‌شود شبکهٔ اول را ساخت و درآمد گرفت
  const s = GameSim.newGame(501);
  check('20a-0 بازی جدید پیش‌فرض صفر کارمند دارد (همه نقش‌ها)',
    s.staff.length === 0 && ['technician', 'engineer', 'support', 'sales'].every(r => s.staff.filter(m => m.role === r).length === 0)
      && GameSim.staffEffects(s).monthlySalaryTotal === 0,
    'staff=' + s.staff.length + ' salaryTotal=' + GameSim.staffEffects(s).monthlySalaryTotal);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, node);
  GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
  const cashAfterBuild = s.cash;
  for (let i = 0; i < 60; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('20a بدون کارمند: مشترک و درآمد گرفته می‌شود', d.subscribers > 0 && s.cash > cashAfterBuild,
    'subs=' + d.subscribers + ' cash ' + cashAfterBuild + ' -> ' + s.cash);

  // 20b: شبکهٔ بزرگ بدون تکنسین، تعمیرش چند برابر کندتر از حالت مجهز است (ولی تمام می‌شود)
  function repairDays(techCount) {
    const g = GameSim.newGame(502); g.cash = 999999;
    GameSim.fireStaff(g, 'technician');
    for (let i = 0; i < techCount; i++) GameSim.hireStaff(g, 'technician');
    const dd = g.districts.find(x => x.id === 'north') || g.districts[0];
    const w = GameSim.buildNode(g, 'wifi_ap', dd.x, dd.y);
    for (let i = 0; i < 15; i++) GameSim.buildNode(g, 'wifi_ap', 300 + i * 120, 300); // شبکهٔ بزرگ: ۱۶ گره
    finishBuild(g, w);
    GameSim.connect(g, w.id, coreOf(g).id, 'ethernet');
    w.status = 'failed'; w.health = 0;
    GameSim.applyFix(g, { nodeId: w.id }, { action: 'repair', nodeId: w.id });
    let days = 0;
    while (w.status === 'repairing' && days < 60) { GameSim.tick(g, 1); days++; }
    return days;
  }
  const slowDays = repairDays(0), fastDays = repairDays(4);
  check('20b تعمیر بدون تکنسین کندتر ولی شدنی است', slowDays > fastDays * 2 && slowDays < 60,
    'zeroTech=' + slowDays + 'd staffed=' + fastDays + 'd');

  // 20c: پشتیبانی افت رضایت را کند می‌کند
  function decayAfter(sups) {
    const g = GameSim.newGame(503);
    for (let i = 0; i < sups; i++) GameSim.hireStaff(g, 'support');
    const dd = g.districts.find(x => x.id === 'north') || g.districts[0];
    dd.satisfaction = 80; dd.subscribers = 1000;
    for (let i = 0; i < 5; i++) GameSim.tick(g, 1);
    return dd.satisfaction;
  }
  const noSup = decayAfter(0), withSup = decayAfter(3);
  check('20c بدون پشتیبانی رضایت سریع‌تر سقوط می‌کند', withSup > noSup + 5, 'noSup=' + noSup.toFixed(1) + ' withSup=' + withSup.toFixed(1));

  // 20d: تیم فروش رشد مشترک را سریع‌تر می‌کند
  function subsAfter(sales) {
    const g = GameSim.newGame(504); g.cash = 999999;
    for (let i = 0; i < sales; i++) GameSim.hireStaff(g, 'sales');
    const dd = g.districts.find(x => x.id === 'north') || g.districts[0];
    const w = GameSim.buildNode(g, 'wifi_ap', dd.x, dd.y);
    finishBuild(g, w);
    GameSim.connect(g, w.id, coreOf(g).id, 'ethernet');
    for (let i = 0; i < 30; i++) { GameSim.tick(g, 1); keepAlive(g); }
    return dd.subscribers;
  }
  const subs0 = subsAfter(0), subsSales = subsAfter(3);
  check('20d تیم فروش رشد مشترک را بیشتر می‌کند', subsSales > subs0, 'base=' + subs0 + ' sales=' + subsSales);

  // 20e: حقوق ماهانه واقعاً از نقدینگی کم می‌شود (مقایسهٔ دو بازی هم‌بذر)
  function twinCash(withEngineer) {
    const g = GameSim.newGame(505); g.cash = 999999;
    const dd = g.districts.find(x => x.id === 'north') || g.districts[0];
    const w = GameSim.buildNode(g, 'wifi_ap', dd.x, dd.y);
    finishBuild(g, w);
    GameSim.connect(g, w.id, coreOf(g).id, 'ethernet');
    for (let i = 0; i < 25; i++) { GameSim.tick(g, 1); keepAlive(g); }
    if (withEngineer) GameSim.hireStaff(g, 'engineer');
    for (let i = 0; i < 40; i++) { GameSim.tick(g, 1); keepAlive(g); }
    return g.cash;
  }
  const cashNoEng = twinCash(false), cashEng = twinCash(true);
  check('20e حقوق مهندس در پایان ماه کسر می‌شود', cashNoEng - cashEng === 7000, 'diff=' + (cashNoEng - cashEng) + ' (دو پایان ماه × ۳۵۰۰)');

  // 20f: مهندس شبکه ظرفیت مؤثر و ازدحام را بهتر می‌کند
  const g6 = GameSim.newGame(506); g6.cash = 999999;
  const fx0 = GameSim.staffEffects(g6);
  const d6 = g6.districts.find(x => x.id === 'north') || g6.districts[0];
  const w6 = GameSim.buildNode(g6, 'wifi_ap', d6.x, d6.y);
  finishBuild(g6, w6);
  GameSim.connect(g6, w6.id, coreOf(g6).id, 'copper'); // لینک مسی ۱۰۰ مگ < ظرفیت وای‌فای ۳۲۰ → ازدحام
  for (let i = 0; i < 5; i++) GameSim.tick(g6, 1);
  const servedNoEng = d6.servedDemand;
  for (let i = 0; i < 5; i++) GameSim.hireStaff(g6, 'engineer');
  const fx1 = GameSim.staffEffects(g6);
  for (let i = 0; i < 5; i++) GameSim.tick(g6, 1);
  check('20f مهندس شبکه ازدحام را کمتر و سرویس را بیشتر می‌کند',
    fx0.capMult < 1 && fx1.capMult > 1 && d6.servedDemand > servedNoEng,
    'capMult ' + fx0.capMult.toFixed(2) + '->' + fx1.capMult.toFixed(2) + ' served ' + servedNoEng + '->' + d6.servedDemand);
}

// ---------- 21) حذف و جابه‌جایی گره‌ها (از جمله هسته و دروازه) ----------
{
  // 21a: حذف گرهٔ میانی → لینک‌هایش می‌روند و وابسته‌ها سرویس را از دست می‌دهند + بازپرداخت ۵۰٪
  const s = GameSim.newGame(601); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const a = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  const b = GameSim.buildNode(s, 'wifi_ap', d.x + 60, d.y + 40);
  finishBuild(s, a); finishBuild(s, b);
  GameSim.connect(s, a.id, coreOf(s).id, 'ethernet');
  GameSim.connect(s, b.id, a.id, 'ethernet');
  for (let i = 0; i < 5; i++) GameSim.tick(s, 1);
  const servedBefore = d.servedDemand;
  const cashBefore = s.cash;
  const del = GameSim.demolishNode(s, a.id);
  for (let i = 0; i < 3; i++) GameSim.tick(s, 1);
  check('21a حذف گره میانی: لینک‌ها حذف و سرویس وابسته قطع می‌شود',
    del.ok && del.refund === 4000 && s.cash === cashBefore + 4000 &&
    !s.links.some(l => l.from === a.id || l.to === a.id) && b.connected === false && d.servedDemand < servedBefore,
    'refund=' + del.refund + ' served ' + servedBefore + '->' + d.servedDemand + ' bConn=' + b.connected);

  // 21b: جابه‌جایی → موقعیت عوض می‌شود، لینک‌ها می‌مانند، بعد از نصب مجدد سرویس برمی‌گردد
  const s2 = GameSim.newGame(602); s2.cash = 999999;
  const d2 = s2.districts.find(x => x.id === 'north') || s2.districts[0];
  const w2 = GameSim.buildNode(s2, 'wifi_ap', d2.x, d2.y);
  finishBuild(s2, w2);
  GameSim.connect(s2, w2.id, coreOf(s2).id, 'ethernet');
  for (let i = 0; i < 5; i++) GameSim.tick(s2, 1);
  let target = null;
  for (const [ox, oy] of [[220, 0], [-220, 0], [0, 220], [0, -220], [300, 300], [-300, -300]]) {
    if (GameSim.isValidPlacement(s2, d2.x + ox, d2.y + oy).ok) { target = { x: d2.x + ox, y: d2.y + oy }; break; }
  }
  const linksBefore = s2.links.length;
  const mv = GameSim.moveNode(s2, w2.id, target.x, target.y);
  const movedOk = mv.ok && w2.x === target.x && w2.y === target.y && s2.links.length === linksBefore && w2.status === 'building';
  finishBuild(s2, w2);
  for (let i = 0; i < 5; i++) { GameSim.tick(s2, 1); keepAlive(s2); }
  const riverPt = s2.map.river[3];
  const mvRiver = GameSim.moveNode(s2, w2.id, riverPt.x, riverPt.y);
  check('21b جابه‌جایی گره: موقعیت جدید، لینک‌ها سالم، سرویس برمی‌گردد؛ رودخانه نامعتبر',
    movedOk && w2.connected === true && d2.servedDemand > 0 && mvRiver.ok === false,
    'moved=' + movedOk + ' served=' + d2.servedDemand + ' riverErr=' + (mvRiver.error || 'none'));

  // 21c: حذف دروازه → کل سرویس می‌خوابد؛ ساخت دروازهٔ جدید + اتصال → سرویس برمی‌گردد
  const s3 = GameSim.newGame(603); s3.cash = 9999999;
  const d3 = s3.districts.find(x => x.id === 'north') || s3.districts[0];
  const w3 = GameSim.buildNode(s3, 'wifi_ap', d3.x, d3.y);
  finishBuild(s3, w3);
  GameSim.connect(s3, w3.id, coreOf(s3).id, 'ethernet');
  for (let i = 0; i < 5; i++) { GameSim.tick(s3, 1); keepAlive(s3); }
  const served3 = d3.servedDemand;
  GameSim.demolishNode(s3, gwOf(s3).id);
  for (let i = 0; i < 3; i++) GameSim.tick(s3, 1);
  const deadOk = d3.servedDemand === 0 && d3.connected === false;
  const core3 = coreOf(s3);
  const gw2 = GameSim.buildNode(s3, 'internet_gateway', core3.x + 140, core3.y);
  finishBuild(s3, gw2);
  GameSim.connect(s3, gw2.id, core3.id, 'ethernet');
  for (let i = 0; i < 5; i++) { GameSim.tick(s3, 1); keepAlive(s3); }
  check('21c حذف دروازه سرویس را قطع و بازسازی‌اش برمی‌گرداند',
    served3 > 0 && deadOk && d3.servedDemand > 0,
    'served ' + served3 + ' -> 0 -> ' + d3.servedDemand);
}

// ---------- 22) برد لینک نقطه‌به‌نقطه (PtP) محدود است ----------
{
  const s = GameSim.newGame(23);
  const core = coreOf(s);
  const maxRange = (DATA.linkMedia && DATA.linkMedia.ptp && DATA.linkMedia.ptp.maxRange) || 1500;
  // گره نزدیک: در برد
  const near = GameSim.buildNode(s, 'wifi_ap', core.x + 200, core.y);
  finishBuild(s, near);
  const okLink = GameSim.connect(s, near.id, core.id, 'ptp');
  check('22a لینک PtP در برد مجاز برقرار می‌شود', !!okLink);
  // گره دور: بیرون از برد
  const far = GameSim.buildNode(s, 'wifi_ap', core.x + maxRange + 800, core.y);
  finishBuild(s, far);
  const linksBefore = s.links.length;
  const badLink = GameSim.connect(s, far.id, core.id, 'ptp');
  check('22b لینک PtP بیرون از برد رد می‌شود و لینکی ساخته نمی‌شود',
    badLink === null && s.links.length === linksBefore);
  // فیبر در همان فاصلهٔ دور همچنان ممکن است
  const fiberLink = GameSim.connect(s, far.id, core.id, 'fiber');
  check('22c فیبر در فاصلهٔ دور محدودیت برد ندارد', !!fiberLink);
}

// ---------- 23) مناطق هرگز هم‌پوشانی ندارند ----------
{
  const pairOk = (ds, gap) => {
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + gap - 1) return false;
    }
    return true;
  };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 42, 777, 99, 100, 2024, 5555];
  let allOk = true; const bad = [];
  for (const seed of seeds) {
    const s = GameSim.newGame(seed);
    if (!(s.districts.length >= 25 && s.districts.length <= 30 && pairOk(s.districts, 40))) { allOk = false; bad.push(seed); }
  }
  check('23a مولد نقشه: هیچ دو منطقه‌ای هم‌پوشان نیستند (۱۸ بذر)', allOk, 'bad seeds: ' + bad.join(','));
  check('23b نقشهٔ ثابت جایگزین هم بدون هم‌پوشانی است', pairOk(DATA.districts || [], 0));
  // پس از ۳۰۰ روز بازی با سرویس فعال، اندازهٔ پویا هم نباید هم‌پوشانی بسازد
  const s = GameSim.newGame(42); s.cash = 99999999;
  s.districts.slice(0, 4).forEach(d => {
    const w = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
    if (w) { finishBuild(s, w); GameSim.connect(s, w.id, coreOf(s).id, 'fiber'); }
  });
  for (let i = 0; i < 300; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('23c پس از ۳۰۰ روز با سرویس، هم‌پوشانی مناطق صفر است', pairOk(s.districts, 40), 'districts=' + s.districts.length);
}

// ---------- 24) ساختمان‌های خارج از مناطق ----------
{
  const s = GameSim.newGame(42);
  const outside = s.buildings.filter(b => !b.districtId);
  const river = s.map.river, roads = s.map.roads;
  const riverX = (y) => { for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1]; if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1, b.y - a.y); } return river[river.length - 1].x; };
  const badOut = outside.some(b => Math.abs(b.x + b.w / 2 - riverX(b.y + b.h / 2)) < 60 ||
    roads.v.some(lx => b.x - 14 < lx && lx < b.x + b.w + 14) || roads.h.some(ly => b.y - 14 < ly && ly < b.y + b.h + 14) ||
    s.districts.some(d => Math.hypot(b.x + b.w / 2 - d.x, b.y + b.h / 2 - d.y) < d.radius + 29));
  check('24a ساختمان‌های پراکندهٔ اولیه: >۵۰ و همه بیرون مناطق/رودخانه/خیابان', outside.length > 50 && !badOut, 'outside=' + outside.length + ' bad=' + badOut);
  const s2 = GameSim.newGame(5);
  const before = s2.buildings.filter(b => !b.districtId).length;
  for (let i = 0; i < 800; i++) GameSim.tick(s2, 1);
  const after = s2.buildings.filter(b => !b.districtId).length;
  const outsideCap = (DATA.growth && DATA.growth.outsideCap) || 320;
  check('24b رشد شهر ساختمان پراکنده هم می‌سازد و از سقف رد نمی‌شود', after > before && after <= outsideCap, before + ' -> ' + after + ' (cap ' + outsideCap + ')');
}

// ---------- 25) اندازهٔ پویای مناطق بر اساس مشترکان ----------
{
  const s = GameSim.newGame(42); s.cash = 99999999;
  // منطقه‌ای با بیشترین فضای رشد نسبت به همسایه‌ها
  let d = null, bestRoom = -1;
  for (const cand of s.districts) {
    let room = Infinity;
    for (const o of s.districts) { if (o !== cand) room = Math.min(room, Math.hypot(cand.x - o.x, cand.y - o.y) - cand.radius - o.radius); }
    if (room > bestRoom) { bestRoom = room; d = cand; }
  }
  const maxSubs = Math.max(1, d.population * 0.35);
  const r0 = d.radius, base = d.baseRadius || d.radius;
  let overlap = false;
  const pairCheck = () => { for (let i = 0; i < s.districts.length; i++) for (let j = i + 1; j < s.districts.length; j++) { const a = s.districts[i], b = s.districts[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + 40 - 1) overlap = true; } };
  for (let i = 0; i < 30; i++) { d.subscribers = Math.round(maxSubs * 0.9); GameSim.tick(s, 1); keepAlive(s); if (i % 10 === 0) pairCheck(); }
  check('25a منطقهٔ پرمشترک بزرگ می‌شود', d.radius > r0 + 10, r0 + ' -> ' + d.radius);
  check('25c رشد منطقه هم‌پوشانی نمی‌سازد', !overlap);
  const r1 = d.radius;
  for (let i = 0; i < 60; i++) { d.subscribers = 0; GameSim.tick(s, 1); keepAlive(s); }
  check('25b منطقهٔ بی‌مشترک کوچک می‌شود (به‌سوی ۰٫۷× پایه)', d.radius < r1 - 10 && d.radius >= base * 0.65, r1 + ' -> ' + d.radius + ' base=' + base);
}

// ---------- 26) ادغام دو منطقهٔ مجاور پرمشترک ----------
{
  const s = GameSim.newGame(42); s.cash = 99999999;
  // نزدیک‌ترین جفت را پیدا کن و دومی را تا فاصلهٔ r1+r2+50 نزدیک کن (بدون هم‌پوشانی با بقیه)
  let pair = null;
  const sorted = [];
  for (let i = 0; i < s.districts.length; i++) for (let j = i + 1; j < s.districts.length; j++) sorted.push([s.districts[i], s.districts[j], Math.hypot(s.districts[i].x - s.districts[j].x, s.districts[i].y - s.districts[j].y)]);
  sorted.sort((x, y) => x[2] - y[2]);
  for (const [a, b] of sorted) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nd = a.radius + b.radius + 50;
    const nx = Math.round(a.x + Math.cos(ang) * nd), ny = Math.round(a.y + Math.sin(ang) * nd);
    const okMove = s.districts.every(o => o === a || o === b || Math.hypot(nx - o.x, ny - o.y) >= b.radius + o.radius + 40 - 1);
    if (okMove) { b.x = nx; b.y = ny; pair = [a, b]; break; }
  }
  const [a, b] = pair;
  const countBefore = s.districts.length;
  // مجموع موردانتظار را پیش از ادغام ثبت کن (بعد از ادغام جمعیت بازمانده ترکیبی است)
  const subsSumBefore = Math.round(a.population * 0.35 * 0.8) + Math.round(b.population * 0.35 * 0.8);
  const popSumBefore = a.population + b.population;
  for (let i = 0; i < 120 && s.districts.length === countBefore; i++) {
    a.subscribers = Math.round(a.population * 0.35 * 0.8);
    b.subscribers = Math.round(b.population * 0.35 * 0.8);
    GameSim.tick(s, 1); keepAlive(s);
  }
  const survivor = s.districts.find(x => x.id === a.id) || s.districts.find(x => x.id === b.id);
  const droppedId = survivor && survivor.id === a.id ? b.id : a.id;
  const orphanB = s.buildings.some(x => x.districtId === droppedId);
  const orphanC = (s.customers || []).some(c => c.districtId === droppedId);
  let overlap = false;
  for (let i = 0; i < s.districts.length; i++) for (let j = i + 1; j < s.districts.length; j++) { const x = s.districts[i], y = s.districts[j]; if (Math.hypot(x.x - y.x, x.y - y.y) < x.radius + y.radius + 40 - 1) overlap = true; }
  check('26a دو منطقهٔ پرمشترک مجاور ادغام می‌شوند', s.districts.length === countBefore - 1 && !!survivor, countBefore + ' -> ' + s.districts.length);
  // آستانهٔ ۰٫۹: ریزش مشترکان در همان تیک ادغام (بدون سرویس ~۳٪) مجاز است؛ جمعیت دقیقاً جمع می‌شود
  check('26b مشترکان/جمعیت/ساختمان/مشتری منطقهٔ حذف‌شده به بازمانده منتقل شده‌اند',
    survivor && survivor.subscribers >= subsSumBefore * 0.9 && survivor.population === popSumBefore && !orphanB && !orphanC,
    'subs=' + (survivor && survivor.subscribers) + ' expected>=' + Math.round(subsSumBefore * 0.9) + ' pop=' + (survivor && survivor.population) + '/' + popSumBefore);
  check('26c پس از ادغام هم‌پوشانی نیست', !overlap);
}

// ---------- 27) مشترکان ساختمان‌های پراکنده (همه‌جا به‌جز رودخانه) ----------
{
  const ctrl = GameSim.newGame(31);
  for (let i = 0; i < 40; i++) GameSim.tick(ctrl, 1);
  check('27a بدون پوشش، ساختمان پراکنده مشترک نمی‌گیرد', ctrl.scattered && ctrl.scattered.subscribers === 0, 'subs=' + (ctrl.scattered && ctrl.scattered.subscribers));
  const s = GameSim.newGame(31); s.cash = 99999999;
  const ob = s.buildings.find(b => !b.districtId);
  const w = GameSim.buildNode(s, 'wifi_ap', Math.round(ob.x + ob.w / 2), Math.round(ob.y + ob.h / 2));
  finishBuild(s, w);
  GameSim.connect(s, w.id, coreOf(s).id, 'fiber');
  for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const outsideNow = s.buildings.filter(b => !b.districtId).length;
  check('27b ساختمان پراکندهٔ تحت پوشش مشترک و درآمد می‌گیرد', s.scattered.subscribers > 0 && s.scattered.revenue > 0,
    'subs=' + s.scattered.subscribers + ' rev=' + s.scattered.revenue + ' covered=' + s.scattered.coveredCount);
  check('27c ظرفیت بالقوهٔ پراکنده = ساختمان×۶ و در مجموع مشترکان حساب می‌شود',
    s.scattered.potentialSubs === outsideNow * 6 &&
    s.lastFlow.totalSubscribers === s.districts.reduce((sum, d) => sum + d.subscribers, 0) + s.scattered.subscribers,
    'potential=' + s.scattered.potentialSubs + ' outside=' + outsideNow);
}

// ---------- 28) یکپارچگی کاتالوگ تجهیزات ----------
{
  const list = DATA.equipmentList || [];
  const techIds = new Set((DATA.techList || []).map(t => t.id));
  const CATS = new Set(['cable', 'access', 'antenna', 'backhaul', 'satellite', 'core', 'power', 'tools']);
  const ids = new Set(); let bad = [];
  for (const e of list) {
    if (ids.has(e.id)) bad.push('dup ' + e.id);
    ids.add(e.id);
    if (!(e.cost > 0)) bad.push(e.id + ' cost');
    if (!(e.monthlyCost >= 0)) bad.push(e.id + ' monthly');
    if (!e.guide || !String(e.guide).trim()) bad.push(e.id + ' guide');
    if (!CATS.has(e.category)) bad.push(e.id + ' cat=' + e.category);
    if (e.unlock != null && !techIds.has(e.unlock)) bad.push(e.id + ' unlock=' + e.unlock);
    if ((e.category === 'access' || e.category === 'antenna') && !GameSim.TECH_KEYS.includes(e.tech)) bad.push(e.id + ' tech=' + e.tech);
    if (!(e.radius >= 0) || !(e.capacity >= 0)) bad.push(e.id + ' radius/capacity');
  }
  check('28a کاتالوگ: ≥۲۱۸ تجهیز، شناسه یکتا، قیمت/راهنما/دسته/بازشدن معتبر', list.length >= 218 && bad.length === 0,
    'total=' + list.length + (bad.length ? ' bad: ' + bad.slice(0, 8).join(', ') : ''));
  const unlockMismatch = (DATA.techList || []).some(t => (t.unlocks || []).some(id => !ids.has(id))) ||
    list.some(e => e.unlock && !(DATA.techList.find(t => t.id === e.unlock) || { unlocks: [] }).unlocks.includes(e.id));
  check('28b فهرست unlocks فناوری‌ها با کاتالوگ سازگار است', !unlockMismatch);
}

// ---------- 29) برچسب فارسی نوع ساختمان ----------
{
  const fs = require('fs');
  const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
  const fa = DATA.buildingTypeFa || {};
  const keys = ['residential', 'commercial', 'office', 'industrial'];
  const allFa = keys.every(k => fa[k] && /[\u0600-\u06FF]/.test(fa[k]) && !/[a-zA-Z]/.test(fa[k]));
  check('29a هر چهار نوع ساختمان برچسب فارسی دارند', allFa, JSON.stringify(fa));
  check('29b پنل جزئیات ساختمان فارسی است (نوع ساختمان + خارج از مناطق)', ui.includes('نوع ساختمان') && ui.includes('خارج از مناطق (پراکنده)') && ui.includes('BTYPE_FA'));
}

// ---------- 30) فایل‌های PWA ----------
{
  const fs = require('fs');
  const root = __dirname + '/..';
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(root + '/manifest.webmanifest', 'utf8')); } catch (e) { /* پایین گزارش می‌شود */ }
  const iconsOk = manifest && (manifest.icons || []).length >= 3 && manifest.icons.every(ic => fs.existsSync(root + '/' + ic.src.replace(/^\.\//, '')));
  const idx = fs.readFileSync(root + '/index.html', 'utf8');
  check('30a مانیفست PWA کامل است (نام فارسی، RTL، standalone، آیکون‌ها روی دیسک)',
    !!manifest && manifest.name === 'شبکه‌ساز: شهر متصل' && manifest.short_name === 'شبکه‌ساز' && manifest.lang === 'fa' && manifest.dir === 'rtl' &&
    manifest.display === 'standalone' && iconsOk);
  check('30b سرویس‌ورکر و ثبت آن و لینک مانیفست در صفحه هست',
    fs.existsSync(root + '/sw.js') && idx.includes('manifest.webmanifest') &&
    fs.readFileSync(root + '/js/main.js', 'utf8').includes('serviceWorker'));
  const ver = fs.readFileSync(root + '/js/version.js', 'utf8');
  check('30c نسخهٔ برنامه یک منبع واحد دارد (APP_VERSION)', /APP_VERSION\s*=\s*['"]\d+\.\d+\.\d+['"]/.test(ver));
}

// ---------- 31) دستاوردها ----------
{
  const s = GameSim.newGame(99);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, node);
  GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
  for (let i = 0; i < 10; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const prog = GameSim.achievementProgress(s);
  const firstSub = prog.find(p => p.id === 'first_sub');
  check('31a پس از جذب مشترک، دستاورد «نخستین مشترک» باز می‌شود',
    !!firstSub && firstSub.unlocked && s.achievements.first_sub != null &&
    s.newAchievements.some(a => a.id === 'first_sub'),
    'unlocked=' + Object.keys(s.achievements).join(','));
  check('31b پیشرفت دستاورد مقدار فعلی و هدف را درست نشان می‌دهد',
    !!firstSub && firstSub.target === 1 && firstSub.current >= 1 &&
    prog.length === (DATA.achievements || []).length && prog.every(p => p.target > 0 && p.current >= 0),
    'first_sub=' + JSON.stringify(firstSub));
  const s2 = GameSim.loadGame(GameSim.saveGame(s));
  const prog2 = GameSim.achievementProgress(s2).find(p => p.id === 'first_sub');
  check('31c دستاورد بازشده در ذخیره/بارگذاری حفظ می‌شود',
    s2.achievements.first_sub === s.achievements.first_sub && !!prog2 && prog2.unlocked,
    'day=' + s.achievements.first_sub + '/' + s2.achievements.first_sub);
}

// ---------- 32) مشترکان فردی ----------
{
  const s = GameSim.newGame(42); s.cash = 999999;
  GameSim.unlockTech(s, 'lte');
  // تقاضای چند منطقه پایین آورده می‌شود تا کیفیت سرویس بالا بماند و افراد واقعاً مشترک شوند
  const servedIds = ['north', 'residential', 'center', 'east_res', 'west_town'];
  const nodes = [];
  for (const did of servedIds) {
    const d = s.districts.find(x => x.id === did);
    d.demandBase = 300;
    const n = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
    finishBuild(s, n);
    GameSim.connect(s, n.id, coreOf(s).id, 'fiber');
    nodes.push(n);
  }
  for (let i = 0; i < 25; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const subBefore = s.individuals.filter(i => i.status === 'subscribed').length;
  check('32a مشترکان فردی ساخته می‌شوند (سقف ۳۰۰) و دست‌کم یکی مشترک می‌شود',
    s.individuals.length > 0 && s.individuals.length <= 300 && subBefore >= 1,
    'total=' + s.individuals.length + ' subscribed=' + subBefore);
  nodes.forEach(n => GameSim.demolishNode(s, n.id));
  for (let i = 0; i < 15; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const subAfter = s.individuals.filter(i => i.status === 'subscribed').length;
  const unsub = s.individuals.filter(i => i.status === 'unsubscribed').length;
  check('32b با قطع سرویس، مشترکان فردی شبکه را ترک می‌کنند',
    subAfter < subBefore && unsub >= 1,
    'subscribed ' + subBefore + ' -> ' + subAfter + ' unsubscribed=' + unsub);
}

// ---------- 33) قراردادهای سازمانی ----------
{
  const s = GameSim.newGame(7); s.cash = 9999999;
  GameSim.unlockTech(s, 'lte');
  const d = s.districts.find(x => x.id === 'center');
  d.demandBase = 200; // تقاضای کم تا کیفیت ماه قرارداد بالا بماند
  const nodes = [];
  for (let k = 0; k < 3; k++) {
    const n = GameSim.buildNode(s, 'cell_4g', d.x + k * 60, d.y);
    finishBuild(s, n);
    GameSim.connect(s, n.id, coreOf(s).id, 'fiber');
    nodes.push(n);
  }
  let guard = 0;
  while (!s.contractOffers.length && guard++ < 200) { GameSim.tick(s, 1); keepAlive(s); }
  check('33a برای منطقهٔ سرویس‌گرفته پیشنهاد قرارداد سازمانی تولید می‌شود', s.contractOffers.length >= 1,
    'offers=' + s.contractOffers.length + ' after ' + guard + ' days');
  const offer = s.contractOffers[0];
  const bad = GameSim.negotiateContract(s, offer.id, {
    speed: Math.round(offer.wantSpeed * 0.3), sla: Math.round(offer.wantSla * 0.5), price: offer.wantPrice * 3,
  });
  check('33b شرایط خیلی بد (قیمت سه‌برابر، سرعت و SLA پایین) رد می‌شود',
    bad.status === 'rejected' && !s.contractOffers.some(o => o.id === offer.id),
    'status=' + bad.status);
  guard = 0;
  while (!s.contractOffers.length && guard++ < 200) { GameSim.tick(s, 1); keepAlive(s); }
  const offer2 = s.contractOffers[0];
  const price = Math.round(offer2.wantPrice * 0.8);
  const res = GameSim.negotiateContract(s, offer2.id, { speed: offer2.wantSpeed, sla: offer2.wantSla, price });
  const contract = res.contract;
  check('33c شرایط سخاوتمندانه (قیمت ۸۰٪ خواسته) پذیرفته و قرارداد فعال می‌شود',
    res.status === 'accepted' && !!contract && contract.status === 'active' && contract.priceMonthly === price,
    'status=' + res.status + ' priceMonthly=' + (contract && contract.priceMonthly));
  // انباشت کیفیت از اول ماه قرارداد سنجیده شود (روزهای پیش از قرارداد آلوده‌اش نکند)
  d._qosAcc = 0; d._qosDays = 0;
  const monthsLeft0 = contract.monthsLeft;
  let boundaryDelta = null;
  guard = 0;
  while (guard++ < 60) {
    const lm = s.lastMonthDay, tr = s.totalRevenue;
    GameSim.tick(s, 1); keepAlive(s);
    if (s.lastMonthDay !== lm) { boundaryDelta = s.totalRevenue - tr; break; }
  }
  check('33d پرداخت ماهانهٔ قرارداد در پایان ماه واریز می‌شود و بدون نقض SLA است',
    boundaryDelta != null && boundaryDelta >= price && contract.monthsLeft === monthsLeft0 - 1 && contract.breaches === 0,
    'delta=' + boundaryDelta + ' price=' + price + ' monthsLeft ' + monthsLeft0 + '->' + contract.monthsLeft + ' breaches=' + contract.breaches);
  nodes.forEach(n => GameSim.demolishNode(s, n.id));
  guard = 0;
  while (guard++ < 60) {
    const lm = s.lastMonthDay;
    GameSim.tick(s, 1); keepAlive(s);
    if (s.lastMonthDay !== lm) break;
  }
  check('33e یک ماه بدون سرویس = نقض SLA و جریمه',
    contract.breaches >= 1 && s.log.some(l => l.msg.includes('جریمه')),
    'breaches=' + contract.breaches);
}

// ---------- 34) کمپین‌های تبلیغاتی ----------
{
  function campGame(withCamp) {
    const s = GameSim.newGame(88); s.cash = 999999;
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    const n = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
    finishBuild(s, n);
    GameSim.connect(s, n.id, coreOf(s).id, 'ethernet');
    let camp = null;
    if (withCamp) camp = GameSim.startCampaign(s, 'social', [d.id], 30).campaign;
    return { s, d, camp };
  }
  const ctrl = campGame(false), withC = campGame(true);
  const costPerDay = (DATA.campaignTypes || []).find(t => t.id === 'social').costPerDay;
  for (let i = 0; i < 5; i++) { GameSim.tick(withC.s, 1); keepAlive(withC.s); GameSim.tick(ctrl.s, 1); keepAlive(ctrl.s); }
  const spent5 = withC.camp.spent;
  check('34a کمپین فعال هر روز از نقدینگی هزینه برمی‌دارد',
    withC.camp.active && spent5 === costPerDay * 5,
    'spent=' + spent5 + ' expected=' + (costPerDay * 5));
  for (let i = 0; i < 15; i++) { GameSim.tick(withC.s, 1); keepAlive(withC.s); GameSim.tick(ctrl.s, 1); keepAlive(ctrl.s); }
  check('34b رشد مشترک با کمپین از بازی شاهدِ هم‌بذر سریع‌تر است',
    withC.d.subscribers > ctrl.d.subscribers,
    'campaign=' + withC.d.subscribers + ' control=' + ctrl.d.subscribers);
  GameSim.stopCampaign(withC.s, withC.camp.id);
  const spentAtStop = withC.camp.spent;
  for (let i = 0; i < 3; i++) { GameSim.tick(withC.s, 1); keepAlive(withC.s); }
  check('34c توقف کمپین کسر روزانه را متوقف می‌کند',
    !withC.camp.active && withC.camp.spent === spentAtStop,
    'spent ' + spentAtStop + ' -> ' + withC.camp.spent);
}

// ---------- 35) بستهٔ گیمینگ: تأخیر مسیر فیبر در برابر ماهوارهٔ GEO ----------
{
  function gamingClean(kind) {
    const s = GameSim.newGame(55); s.cash = 99999999;
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    d.demandBase = 100; // تقاضای کم تا کیفیت هر دو مسیر کامل باشد و فقط تأخیر فرق کند
    s.customers.find(c => c.districtId === d.id).packageId = 'gaming';
    if (kind === 'fiber') {
      GameSim.unlockTech(s, 'fiber'); GameSim.unlockTech(s, 'ftth');
      const n = GameSim.buildNode(s, 'ftth', d.x, d.y);
      finishBuild(s, n);
      GameSim.connect(s, n.id, coreOf(s).id, 'fiber');
    } else {
      GameSim.unlockTech(s, 'satellite_leo'); GameSim.unlockTech(s, 'satellite_geo');
      const term = GameSim.buildNode(s, 'sat_terminal_geo', d.x, d.y);
      const gw = GameSim.buildNode(s, 'sat_gateway', coreOf(s).x + 300, coreOf(s).y);
      finishBuild(s, term); finishBuild(s, gw);
      GameSim.connect(s, gw.id, coreOf(s).id, 'fiber');
      GameSim.connect(s, term.id, gw.id, 'satellite');
    }
    s.weather = { kind: 'clear', untilDay: 9999 };
    s.failoverActive = false;
    d.subscribers = 100; d.satisfaction = 0;
    GameSim.computeFlow(s);
    return d;
  }
  const gf = gamingClean('fiber'), gs = gamingClean('geo');
  check('35a تأخیر متوسط مسیر فیبر بسیار کمتر از ماهوارهٔ GEO است',
    gf.avgLatency > 0 && gf.avgLatency < gs.avgLatency && gs.avgLatency >= 600,
    'fiber=' + gf.avgLatency + 'ms geo=' + gs.avgLatency + 'ms');
  check('35b با کیفیت برابر، رضایت بستهٔ گیمینگ روی فیبر بیشتر از GEO است',
    gf.qos === gs.qos && gf.satisfaction > gs.satisfaction,
    'qos=' + gf.qos.toFixed(2) + '/' + gs.qos.toFixed(2) + ' sat fiber=' + gf.satisfaction.toFixed(1) + ' geo=' + gs.satisfaction.toFixed(1));
}

// ---------- 36) کانال فرکانسی و تداخل ----------
{
  const s = GameSim.newGame(66); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const a = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  const b = GameSim.buildNode(s, 'wifi_ap', d.x + 50, d.y);
  finishBuild(s, a); finishBuild(s, b);
  GameSim.connect(s, a.id, coreOf(s).id, 'ethernet');
  GameSim.connect(s, b.id, coreOf(s).id, 'ethernet');
  GameSim.setNodeChannel(s, a.id, 1); GameSim.setNodeChannel(s, b.id, 1);
  GameSim.computeFlow(s);
  const servedSame = d.servedDemand, effSame = a._effCap;
  check('36a دو گرهٔ نزدیک روی یک کانال: تداخل مثبت و ظرفیت مؤثر کمتر',
    a.interference > 0 && b.interference > 0 && effSame < a.capacity,
    'interference=' + a.interference.toFixed(2) + ' effCap=' + Math.round(effSame) + '/' + a.capacity);
  const ac = GameSim.autoChannel(s, b.id);
  GameSim.computeFlow(s);
  check('36b انتخاب خودکار کانال، کانال متفاوت از همسایه می‌دهد و سرویس بیشتر می‌شود',
    ac.ok && ac.channel !== a.channel && a.interference === 0 && d.servedDemand > servedSame,
    'auto=' + ac.channel + ' neighbor=' + a.channel + ' served ' + servedSame + ' -> ' + d.servedDemand);
  const badHigh = GameSim.setNodeChannel(s, a.id, 99);
  const badZero = GameSim.setNodeChannel(s, a.id, 0);
  const badCore = GameSim.setNodeChannel(s, coreOf(s).id, 1);
  const good = GameSim.setNodeChannel(s, a.id, 2);
  check('36c تنظیم کانال بازهٔ مجاز و گره‌های بدون کانال را اعتبارسنجی می‌کند',
    !badHigh.ok && !badZero.ok && !badCore.ok && good.ok && a.channel === 2,
    'high=' + badHigh.ok + ' zero=' + badZero.ok + ' core=' + badCore.ok + ' good=' + good.ok);
}

// ---------- 37) گوهٔ سکتوری آنتن ----------
{
  const s = GameSim.newGame(31); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'wifi_ap', d.x + 150, d.y);
  finishBuild(s, n);
  GameSim.connect(s, n.id, coreOf(s).id, 'ethernet');
  // قرارداد جهت: ۰=شرق، مثبت پادساعتگرد؛ زاویهٔ نقطه با atan2(-dy, dx) گرفته می‌شود
  const dirTo = Math.atan2(-(d.y - n.y), d.x - n.x) * 180 / Math.PI;
  const r1 = GameSim.setNodeDirection(s, n.id, dirTo, 60);
  GameSim.computeFlow(s);
  check('37a آنتن سکتوری رو به منطقه سرویس می‌دهد', r1.ok && d.servedDemand > 0,
    'dir=' + Math.round(dirTo) + ' served=' + d.servedDemand);
  GameSim.setNodeDirection(s, n.id, dirTo + 180, 60);
  GameSim.computeFlow(s);
  check('37b چرخاندن آنتن به سمت مخالف، سرویس منطقه را قطع می‌کند', d.servedDemand === 0,
    'served=' + d.servedDemand);
}

// ---------- 38) سیگنال در یک نقطه ----------
{
  const s = GameSim.newGame(31); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, n);
  s.buildings.forEach(b => { b.height = 5; }); // ساختمان‌های موجود دید را نبندند تا اثر ساختمان آزمایشی جدا سنجیده شود
  const atNode = GameSim.signalAt(s, n.x, n.y);
  check('38a سیگنال در محل گرهٔ فعال قوی است (>۰٫۵)', atNode.signal > 0.5 && atNode.nodeId === n.id,
    'signal=' + atNode.signal.toFixed(2));
  const far = GameSim.signalAt(s, 60, 60);
  check('38b گوشهٔ دور نقشه بدون پوشش سیگنال صفر دارد', far.signal === 0 && far.nodeId === null,
    'signal=' + far.signal);
  const open = GameSim.signalAt(s, n.x + 60, n.y).signal;
  s.buildings.push({ id: 'fake_tall', districtId: null, x: n.x + 30, y: n.y, w: 26, h: 20, height: 30, type: 'commercial' });
  const blocked = GameSim.signalAt(s, n.x + 60, n.y).signal;
  check('38c نقطهٔ پشت ساختمان بلند سیگنال ضعیف‌تری از نقطهٔ باز دارد',
    open > 0 && blocked < open,
    'open=' + open.toFixed(3) + ' blocked=' + blocked.toFixed(3));
}

// ---------- 39) پیشنهاد مکان نصب ----------
{
  const s = GameSim.newGame(42);
  const eq = DATA.equipmentList.find(e => e.id === 'wifi_ap');
  const r = GameSim.suggestPlacements(s, 'wifi_ap');
  check('39a پیشنهاد مکان ۱ تا ۵ نقطهٔ معتبر برمی‌گرداند',
    r.length >= 1 && r.length <= 5 && r.every(x => GameSim.isValidPlacement(s, x.x, x.y).ok),
    'count=' + r.length);
  const subsDesc = r.every((x, i) => i === 0 || x.expectedSubs <= r[i - 1].expectedSubs);
  check('39b پیشنهادها بر اساس مشترکان موردانتظار نزولی مرتب‌اند', subsDesc,
    r.map(x => x.expectedSubs + '/' + x.expectedCoverage).join(' '));
  const top = r[0];
  let best = null;
  for (const d of s.districts) {
    const dd = Math.hypot(top.x - d.x, top.y - d.y);
    if (!best || dd < best.dd) best = { dd, d };
  }
  check('39c بهترین پیشنهاد نزدیک یک منطقهٔ بدون سرویس است',
    !!best && best.d.qos < 0.5 && best.dd <= eq.radius + best.d.radius,
    'nearest=' + (best && best.d.id) + ' dist=' + (best && Math.round(best.dd)) + ' limit=' + (best && (eq.radius + best.d.radius)));
}

// ---------- 40) ماهواره‌های اختصاصی (صورت فلکی) ----------
{
  const s = GameSim.newGame(77); s.cash = 99999999;
  GameSim.unlockTech(s, 'satellite_leo');
  const term = GameSim.buildNode(s, 'sat_terminal_leo', 1640, 300);
  const gw = GameSim.buildNode(s, 'sat_gateway', coreOf(s).x + 300, coreOf(s).y);
  finishBuild(s, term); finishBuild(s, gw);
  GameSim.connect(s, gw.id, coreOf(s).id, 'fiber');
  GameSim.connect(s, term.id, gw.id, 'satellite');
  GameSim.computeFlow(s);
  const mc0 = s.finance.monthlyCosts;
  const noTech = GameSim.launchSatellite(s, 'leo');
  check('40a پرتاب ماهواره بدون فناوری «ماهواره اختصاصی» رد می‌شود', noTech.ok === false,
    JSON.stringify(noTech));
  GameSim.unlockTech(s, 'own_satellite');
  const r = GameSim.launchSatellite(s, 'leo');
  check('40b پس از باز کردن فناوری، پرتاب LEO با وضعیت «در حال پرتاب» شروع می‌شود',
    r.ok && r.satellite.status === 'launching' && r.satellite.launchTimer === DATA.satelliteLaunch.leo.buildDays,
    'status=' + (r.satellite && r.satellite.status));
  for (let i = 0; i < DATA.satelliteLaunch.leo.buildDays + 5; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const sat = s.satellites[0];
  check('40c پس از پایان ساخت، ماهواره فعال و ظرفیت صورت فلکی مثبت است',
    sat.status === 'active' && GameSim.constellationCapacity(s) === DATA.satelliteLaunch.leo.capacity,
    'status=' + sat.status + ' capacity=' + GameSim.constellationCapacity(s));
  GameSim.computeFlow(s);
  const mc1 = s.finance.monthlyCosts;
  // صورت فلکی اشتراک پایانه را به ۳۰٪ می‌رساند (−۱۸۲۰) و هزینهٔ خود ماهواره (+۳۰۰۰) اضافه می‌شود
  const termMonthly = DATA.equipmentList.find(e => e.id === 'sat_terminal_leo').monthlyCost;
  const expectedDelta = DATA.satelliteLaunch.leo.monthlyCost - Math.round(termMonthly * 0.7);
  check('40d صورت فلکی هزینهٔ ماهانهٔ پایانهٔ ماهواره‌ای را کم می‌کند',
    mc1 - mc0 === expectedDelta && (mc1 - DATA.satelliteLaunch.leo.monthlyCost) < mc0,
    'monthlyCosts ' + mc0 + ' -> ' + mc1 + ' delta=' + (mc1 - mc0) + ' expected=' + expectedDelta);
  sat.ageDays = sat.lifetimeDays - 1;
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('40e ماهواره در پایان عمر از مدار خارج می‌شود (deorbited/failed)',
    sat.status === 'deorbited' || sat.status === 'failed',
    'status=' + sat.status);
}

// ---------- 41) ساعت اوج و ساعت روز ----------
{
  check('41a ضریب تقاضا: نیمه‌شب < ظهر < اوج عصرگاهی',
    GameSim.demandFactorAtHour(3) < GameSim.demandFactorAtHour(12) &&
    GameSim.demandFactorAtHour(12) < GameSim.demandFactorAtHour(20),
    '3h=' + GameSim.demandFactorAtHour(3) + ' 12h=' + GameSim.demandFactorAtHour(12) + ' 20h=' + GameSim.demandFactorAtHour(20));
  const s = GameSim.newGame(31); s.cash = 999999;
  const h0 = s.hour;
  const h1 = GameSim.clockTick(s, 5);
  const h2 = GameSim.clockTick(s, 10);
  check('41b ساعت روز جلو می‌رود و در ۲۴ دور می‌زند',
    h0 === 10 && h1 === 15 && h2 === 1 && s.hour === 1,
    h0 + ' -> ' + h1 + ' -> ' + h2);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, n);
  GameSim.connect(s, n.id, coreOf(s).id, 'ethernet');
  s.hour = 3; GameSim.computeFlow(s);
  const dem3 = d.demand, qos3 = d.qos;
  s.hour = 20; GameSim.computeFlow(s);
  check('41c در ساعت اوج تقاضا بیشتر و کیفیت کمتر از نیمه‌شب است',
    d.demand > dem3 && d.qos < qos3,
    'demand ' + Math.round(dem3) + ' -> ' + Math.round(d.demand) + ' qos ' + qos3.toFixed(2) + ' -> ' + d.qos.toFixed(2));
  // 41d: عبور از نیمه‌شب دقیقاً یک روز به شمارندهٔ روز اضافه می‌کند (هم‌گامی ساعت و روز)
  const sc = GameSim.newGame(32);
  const day0 = sc.day;
  GameSim.clockTick(sc, 13); // ۱۰ -> ۲۳، هنوز همان روز
  const noWrap = (sc.pendingDays || 0) === 0 && sc.hour === 23;
  GameSim.clockTick(sc, 2); // ۲۳ -> ۰۱، یک نیمه‌شب رد شد
  const oneWrap = (sc.pendingDays || 0) === 1 && sc.hour === 1;
  while ((sc.pendingDays || 0) > 0) { sc.pendingDays--; GameSim.tick(sc); }
  check('41d ساعت در نیمه‌شب دور می‌زند و روز دقیقاً یک واحد جلو می‌رود',
    noWrap && oneWrap && sc.day === day0 + 1,
    'hour=' + sc.hour + ' day ' + day0 + ' -> ' + sc.day);
  GameSim.clockTick(sc, 50); // دو روز کامل + ۲ ساعت
  check('41e پرش چندروزهٔ ساعت: دو نیمه‌شب شمرده می‌شود', (sc.pendingDays || 0) === 2 && sc.hour === 3,
    'pendingDays=' + sc.pendingDays + ' hour=' + sc.hour);
}

// ---------- 42) آب‌وهوا و فصل‌ها ----------
{
  check('42a فصل با روز عوض می‌شود (بهار، تابستان، پاییز، زمستان)',
    GameSim.seasonOf({ day: 1 }).id === 'spring' && GameSim.seasonOf({ day: 100 }).id === 'summer' &&
    GameSim.seasonOf({ day: 200 }).id === 'autumn' && GameSim.seasonOf({ day: 300 }).id === 'winter',
    [1, 100, 200, 300].map(day => GameSim.seasonOf({ day }).id).join(','));
  const s = GameSim.newGame(31); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, n);
  GameSim.connect(s, n.id, coreOf(s).id, 'ethernet');
  s.weather = { kind: 'clear', untilDay: 9999 };
  GameSim.computeFlow(s);
  const servedClear = d.servedDemand, effClear = n._effCap;
  s.weather = { kind: 'storm', untilDay: 9999 };
  GameSim.computeFlow(s);
  check('42b طوفان ظرفیت مؤثر و سرویس گرهٔ بی‌سیم را کم می‌کند',
    n._effCap < effClear && d.servedDemand < servedClear,
    'effCap ' + Math.round(effClear) + ' -> ' + Math.round(n._effCap) + ' served ' + servedClear + ' -> ' + d.servedDemand);
  const s2 = GameSim.newGame(31);
  for (let i = 0; i < 30; i++) GameSim.tick(s2, 1);
  check('42c آب‌وهوا با گذر روزها قرعه‌کشی می‌شود و معتبر می‌ماند',
    s2.weather.untilDay > 1 && ['clear', 'rain', 'storm', 'snow'].includes(s2.weather.kind),
    'kind=' + s2.weather.kind + ' untilDay=' + s2.weather.untilDay);
}

// ---------- 43) تاریخچهٔ روزانه ----------
{
  const s = GameSim.newGame(31);
  for (let i = 0; i < 5; i++) GameSim.tick(s, 1);
  check('43a پس از ۵ روز، تاریخچه دست‌کم ۵ رکورد با روز/نقد/مشترک دارد',
    s.history.length >= 5 && s.history.every(h => typeof h.day === 'number' && typeof h.cash === 'number' && typeof h.subs === 'number'),
    'len=' + s.history.length + ' first=' + JSON.stringify(s.history[0] && { day: s.history[0].day, cash: s.history[0].cash, subs: s.history[0].subs }));
  for (let i = 0; i < 405; i++) GameSim.tick(s, 1);
  check('43b سقف تاریخچه (۴۰۰ رکورد) رعایت می‌شود', s.history.length <= 400,
    'len=' + s.history.length);
}

// ---------- 44) مهاجرت ذخیرهٔ قدیمی (بدون فیلدهای جدید) ----------
{
  const s = GameSim.newGame(31);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, n);
  GameSim.connect(s, n.id, coreOf(s).id, 'ethernet');
  GameSim.tick(s, 2);
  const raw = JSON.parse(GameSim.saveGame(s));
  delete raw.hour; delete raw.weather; delete raw.achievements; delete raw.newAchievements;
  delete raw.individuals; delete raw.contracts; delete raw.contractOffers; delete raw.campaigns;
  delete raw.satellites; delete raw.history;
  ['individual', 'contract', 'campaign', 'satellite', 'built', 'contractsDone', 'campaignsRun', 'profitMonths']
    .forEach(k => delete raw.counters[k]);
  raw.nodes.forEach(x => { delete x.channel; delete x.interference; });
  raw.districts.forEach(x => { delete x.avgLatency; delete x.perSubMbps; delete x._qosAcc; delete x._qosDays; });
  const s2 = GameSim.loadGame(JSON.stringify(raw));
  const wifi = s2.nodes.find(x => x.type === 'wifi_ap');
  check('44a ذخیرهٔ بدون فیلدهای جدید با پیش‌فرض‌ها کامل می‌شود',
    s2.hour === 10 && s2.weather.kind === 'clear' &&
    Array.isArray(s2.individuals) && s2.individuals.length === 0 &&
    Array.isArray(s2.contracts) && Array.isArray(s2.contractOffers) &&
    Array.isArray(s2.campaigns) && Array.isArray(s2.satellites) && Array.isArray(s2.history) &&
    !!s2.achievements && !!wifi && wifi.channel != null && wifi.interference === 0 &&
    s2.districts.every(x => x.avgLatency === 0 && x.perSubMbps === 0),
    'hour=' + s2.hour + ' weather=' + s2.weather.kind + ' wifiChannel=' + (wifi && wifi.channel));
  check('44b بازی مهاجرت‌کرده بدون خطا ادامه پیدا می‌کند', !!GameSim.tick(s2, 1));
}

console.log('\nنتیجه: ' + pass + ' پاس، ' + fail + ' رد');
process.exit(fail ? 1 : 0);
