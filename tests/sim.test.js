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
  const cell = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, cell);
  const primary = GameSim.connect(s, cell.id, coreOf(s).id, 'fiber');
  const backup = GameSim.connect(s, cell.id, coreOf(s).id, 'ptp', { isBackup: true });
  GameSim.computeFlow(s);
  check('6a مسیر پشتیبان ساخته شد', !!backup);
  // بدون خرابی، فیل‌اور نباید ترافیک را روی پشتیبان ببرد
  const bLink = s.links.find(l => l.id === (backup.id || backup));
  check('6b در حالت سالم ترافیک روی پشتیبان نیست', (bLink.usage || 0) === 0, 'usage=' + bLink.usage);
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
  check('10b هیچ منطقه‌ای از سقف ساختمان رد نمی‌شود', !overCap && atCap <= capTotal, 'total=' + atCap + ' capTotal=' + capTotal);
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
      !!north && Math.hypot(north.x - hqNode.x, north.y - hqNode.y) < 950 &&
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
  const monotonic = pkgs.every((p, i) => i === 0 || p.speedMbps > pkgs[i - 1].speedMbps);
  check('15a همهٔ بسته‌ها سرعت پیش‌فرض مثبت دارند و سرعت با قیمت یکنوا بالا می‌رود', allPositive && monotonic,
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
}

// ---------- 16) تقاضا به تفکیک فناوری ----------
{
  const s = GameSim.newGame(808);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'wifi_ap', d.x, d.y);
  finishBuild(s, node);
  GameSim.connect(s, node.id, coreOf(s).id, 'ethernet');
  for (let i = 0; i < 10; i++) GameSim.tick(s, 1);
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
  // 20a: بدون هیچ کارمندی هم می‌شود شبکهٔ اول را ساخت و درآمد گرفت
  const s = GameSim.newGame(501);
  GameSim.fireStaff(s, 'technician');
  check('20a-0 شروع بدون کارمند ممکن است', s.staff.length === 0, 'staff=' + s.staff.length);
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
  for (let i = 0; i < 5; i++) GameSim.tick(s3, 1);
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

console.log('\nنتیجه: ' + pass + ' پاس، ' + fail + ' رد');
process.exit(fail ? 1 : 0);
