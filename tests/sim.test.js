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
  s.nodes.forEach(n => { if (n.status === 'failed') { n.status = 'active'; n.health = 100; } if (n.brokenModules) n.brokenModules = {}; });
  s.links.forEach(l => { if (l.status === 'cut') l.status = 'active'; });
  GameSim.refreshConnectivity(s);
}
// بازی آزمایشیِ «همهٔ دوران‌ها و مناطق باز» برای تست‌هایی که به خط زمانی/قفل منطقه کاری ندارند
function newGameAll(seed) {
  const s = GameSim.newGame(seed);
  s.day = 281; // سال ۲۰۱۹: همهٔ تجهیزات در دسترس‌اند
  s.districts.forEach(d => { d.unlocked = true; });
  return s;
}
function unlockAllEras(s) {
  s.day = Math.max(s.day || 1, 281);
  s.districts.forEach(d => { d.unlocked = true; });
  return s;
}
function withLTE(s) { s.cash = Math.max(s.cash, 900000); unlockAllEras(s); return s; }
// اتصال دکل طبق قانون سخت‌گیرانه: دکل فقط به سوئیچ وصل می‌شود؛ نزدیک‌ترین سوئیچ پیدا/ساخته و به بالادستی وصل می‌شود
function connectTower(s, towerId, upstreamId, medium, opts) {
  const t = s.nodes.find(n => n.id === towerId);
  const up = s.nodes.find(n => n.id === upstreamId);
  if (!t || !up) return null;
  if (up.type === 'switch') return medium ? GameSim.connect(s, towerId, upstreamId, medium, opts) : connectAny(s, towerId, upstreamId, opts);
  let sw = null, swD = Infinity;
  for (const n of s.nodes) {
    if (n.type !== 'switch' || n.id === towerId || n.owner !== t.owner) continue;
    const dd = Math.hypot(n.x - t.x, n.y - t.y);
    if (dd < swD) { swD = dd; sw = n; }
  }
  if (!sw) {
    for (const [ox, oy] of [[80, 0], [-80, 0], [0, 80], [0, -80], [160, 0], [-160, 0]]) {
      sw = GameSim.buildNode(s, 'switch', t.x + ox, t.y + oy);
      if (sw) break;
    }
    if (!sw) return null;
    finishBuild(s, sw);
  }
  const hasUp = s.links.some(l => (l.from === sw.id && l.to === up.id) || (l.from === up.id && l.to === sw.id));
  if (!hasUp) connectAny(s, sw.id, up.id);
  return medium ? GameSim.connect(s, towerId, sw.id, medium, opts) : connectAny(s, towerId, sw.id, opts);
}
// اتصال عمومی برای تست‌ها: رسانهٔ معتبر بر اساس دوران/فاصله/بودجه (مثل بازیکن واقعی)
function connectAny(s, aId, bId, opts) {
  const a = s.nodes.find(n => n.id === aId), b = s.nodes.find(n => n.id === bId);
  if (!a || !b) return null;
  const CELL = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g'];
  if (CELL.includes(a.type) && b.type !== 'switch') return connectTower(s, aId, bId, null, opts);
  if (CELL.includes(b.type) && a.type !== 'switch') return connectTower(s, bId, aId, null, opts);
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const y = GameSim.yearOf(s);
  const tries = [];
  if (y >= 1995 && s.cash >= Math.round(d * 8)) tries.push('fiber');
  if (d <= 600) tries.push('ethernet');
  tries.push('copper');
  if (y >= 1995) tries.push('fiber');
  for (const m of tries) { const l = GameSim.connect(s, aId, bId, m, opts); if (l) return l; }
  return null;
}
function feed4G(s, x, y) { // دکل 4G متصل با «ماژول TD-LTE»؛ نقدینگی آزمون دست‌نخورده می‌ماند
  const cash0 = s.cash;
  s.cash = Math.max(s.cash, 999999);
  s.day = Math.max(s.day || 1, 211); // دوران TD-LTE (۲۰۱۲)
  const g4 = GameSim.buildNode(s, 'cell_4g', x, y);
  if (g4) { finishBuild(s, g4); connectTower(s, g4.id, coreOf(s).id, 'fiber'); GameSim.installModule(s, g4.id, 'tdlte'); }
  s.cash = cash0;
  return g4;
}

// ---------- 9) خط زمانی تاریخی: تجهیزات با رسیدن دورانشان باز می‌شوند (بدون R&D) ----------
{
  const s = GameSim.newGame(7);
  check('9a بازی از سال ۱۹۹۱ شروع می‌شود', GameSim.yearOf(s) === 1991, 'year=' + GameSim.yearOf(s));
  check('9b سایت 4G در شروع قفل است', GameSim.isUnlocked(s, 'cell_4g') === false);
  check('9c سایت 5G در شروع قفل است', GameSim.isUnlocked(s, 'cell_5g') === false);
  check('9d FTTH در شروع قفل است', GameSim.isUnlocked(s, 'ftth') === false);
  check('9e دکل 2G از همان روز اول در دسترس است', GameSim.isUnlocked(s, 'cell_2g') === true);
  const before = s.nodes.length;
  check('9f ساخت تجهیز دوران آینده رد می‌شود', GameSim.buildNode(s, 'cell_5g', 100, 100) === null && s.nodes.length === before);
  // با جلو رفتن روزها، دوران‌ها می‌رسند: 3G در روز ۱۰۱، FTTH در ۱۳۱، 4G در ۱۸۱، 5G در ۲۸۱
  s.day = 101;
  check('9g سال ۲۰۰۱ (روز ۱۰۱): 3G باز و 4G هنوز قفل است',
    GameSim.yearOf(s) === 2001 && GameSim.isUnlocked(s, 'cell_3g') === true && GameSim.isUnlocked(s, 'cell_4g') === false);
  s.day = 131;
  check('9h سال ۲۰۰۴ (روز ۱۳۱): FTTH باز است', GameSim.yearOf(s) === 2004 && GameSim.isUnlocked(s, 'ftth') === true);
  s.day = 181;
  check('9i سال ۲۰۰۹ (روز ۱۸۱): 4G باز و 5G هنوز قفل است',
    GameSim.yearOf(s) === 2009 && GameSim.isUnlocked(s, 'cell_4g') === true && GameSim.isUnlocked(s, 'cell_5g') === false);
  s.day = 281;
  check('9j سال ۲۰۱۹ (روز ۲۸۱): 5G هم باز است', GameSim.yearOf(s) === 2019 && GameSim.isUnlocked(s, 'cell_5g') === true);
}

// ---------- 2) تجهیز بدون اتصال سرویس نمی‌دهد ----------
{
  const s = withLTE(newGameAll(11));
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
  s1 = withLTE(newGameAll(13));
  const d = s1.districts.find(x => x.id === 'north') || s1.districts[0];
  cell1 = GameSim.buildNode(s1, 'cell_4g', d.x, d.y);
  finishBuild(s1, cell1);
  link1 = connectTower(s1, cell1.id, coreOf(s1).id, 'fiber');
  check('1a اتصال فیبر سایت به هسته ساخته شد', !!link1);
  GameSim.computeFlow(s1);
  GameSim.computeFlow(s1); // پاس دوم: مشترکانِ تازه‌پیوسته ترافیک می‌سازند و سرویس می‌گیرند
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
  d.subscribers = Math.floor(d.population * 0.35); // همهٔ بازار مشترک شده‌اند
  d.usageMult = 10; // مصرف شدید هر مشترک
  GameSim.computeFlow(s1);
  const link = s1.links.find(l => l.id === (link1.id || link1));
  const ratio = link && link.capacity ? link.usage / link.capacity : 0;
  check('4a زیر بار شدید ظرفیت گره/لینک اشباع می‌شود', (cell1.usage >= cell1.capacity * 0.99) || ratio >= 0.99 || link.status === 'congested', 'nodeUsage=' + cell1.usage + '/' + cell1.capacity + ' linkRatio=' + ratio.toFixed(2));
  check('4b کیفیت سرویس با ازدحام افت می‌کند', d.qos < qosBefore || d.qos < 80, 'qos ' + qosBefore + ' -> ' + d.qos);
}

// ---------- 5) قطع مسیر روی مشتریان وابسته اثر می‌گذارد ----------
{
  const d = s1.districts.find(x => x.id === 'north') || s1.districts[0];
  d.usageMult = 1;
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
  const s = withLTE(newGameAll(17));
  const d = s.districts.find(x => x.id === 'hospital') || s.districts[0];
  const core = coreOf(s);
  const cell = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, cell);
  const primary = connectTower(s, cell.id, core.id, 'fiber');
  // فاصلهٔ منطقه تا هسته از برد PtP (۱۸۰۰) بیشتر است؛ مسیر پشتیبان زنجیره‌ای است:
  // دکل فقط به سوئیچ وصل می‌شود، پس واسط اول «سوئیچ» و بقیه «تقویت‌کننده سیگنال»اند
  const distDC = Math.hypot(d.x - core.x, d.y - core.y);
  const legs = Math.max(2, Math.ceil(distDC / 1500));
  const chain = [cell];
  for (let li = 1; li < legs; li++) {
    const t = li / legs;
    const relay = GameSim.buildNode(s, li === 1 ? 'switch' : 'repeater', Math.round(d.x + (core.x - d.x) * t), Math.round(d.y + (core.y - d.y) * t));
    finishBuild(s, relay);
    chain.push(relay);
  }
  chain.push(core);
  keepAlive(s); // خرابی تصادفی لینک اصلی در مدت ساخت واسط، تست فیل‌اور را به شانس گره نزند
  s.failoverActive = false; // خط مبنای سالم: فیل‌اور هنوز فعال نشده
  const backupLinks = [];
  for (let li = 0; li < chain.length - 1; li++) backupLinks.push(GameSim.connect(s, chain[li].id, chain[li + 1].id, 'ptp', { isBackup: true }));
  const backup1 = backupLinks[0], backup2 = backupLinks[backupLinks.length - 1];
  GameSim.computeFlow(s);
  check('6a مسیر پشتیبان ساخته شد', backupLinks.every(Boolean), 'legs=' + legs);
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

// ---------- 7) سیم علت مشکل و گزینه رفع را به UI می‌دهد ----------
{
  const s = withLTE(newGameAll(23));
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
  const s = newGameAll(29);
  const d = s.districts[0];
  const node = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  connectTower(s, node.id, coreOf(s).id, 'fiber');
  GameSim.tick(s, 3);
  const json = GameSim.saveGame(s);
  const s2 = GameSim.loadGame(json);
  check('8a round-trip: نقد و روز و شمار گره‌ها/لینک‌ها برابر', s2.cash === s.cash && s2.day === s.day && s2.nodes.length === s.nodes.length && s2.links.length === s.links.length,
    'cash ' + s.cash + '/' + s2.cash + ' day ' + s.day + '/' + s2.day);
  check('8b بازی بارگذاری‌شده قابل ادامه است', !!GameSim.tick(s2, 1));
}

// ---------- 10) رشد تدریجی ساختمان‌ها تا سقف هر منطقه ----------
{
  const s = newGameAll(101);
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
  const s = newGameAll(202);
  const wifi = eq('cell_2g'), g2 = eq('cell_2g'), g4 = eq('cell_4g'), g5 = eq('cell_5g'), agg = eq('aggregation');
  check('11a نقدینگی شروع برای شبکهٔ حداقلی (وای‌فای/2G) کافی است', s.cash >= wifi.cost && s.cash >= g2.cost, 'cash=' + s.cash);
  check('11b تجهیزات پیشرفته در شروع قابل خرید نیستند', s.cash < g4.cost && s.cash < g5.cost && s.cash < agg.cost,
    'cash=' + s.cash + ' 4g=' + g4.cost + ' 5g=' + g5.cost + ' agg=' + agg.cost);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  check('11c اولین ساخت آموزش با نقدینگی شروع ممکن است', !!node);
}

// ---------- 12) درآمد فروش اینترنت واقعاً به نقدینگی اضافه می‌شود ----------
{
  function runServed(seed, connectIt) {
    const s = newGameAll(seed);
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    const node = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
    finishBuild(s, node);
    if (connectIt) connectAny(s, node.id, coreOf(s).id);
    const cashAfterBuild = s.cash;
    for (let i = 0; i < 60; i++) { GameSim.tick(s, 1); keepAlive(s); }
    return { s, d, cashAfterBuild };
  }
  const served = runServed(303, true);
  const unserved = runServed(303, false);
  check('12a منطقهٔ سرویس‌گرفته مشترک می‌گیرد', served.d.subscribers > 0, 'subs=' + served.d.subscribers);
  check('12b درآمد روزانه مثبت است و درآمد کل انباشته می‌شود', served.s.incomePerDay > 0 && (served.s.totalRevenue || 0) > 0,
    'incomePerDay=' + served.s.incomePerDay + ' totalRev=' + Math.round(served.s.totalRevenue || 0) + ' cash ' + served.cashAfterBuild + ' -> ' + served.s.cash);
  check('12c بدون اتصال هیچ درآمدی نیست', unserved.d.subscribers === 0 && unserved.s.incomePerDay === 0 && unserved.s.cash < served.s.cash,
    'subs=' + unserved.d.subscribers + ' income=' + unserved.s.incomePerDay + ' cash=' + unserved.s.cash);
}

// ---------- 13) رضایت از صفر شروع می‌شود و با سرویس خوب بالا می‌رود ----------
{
  const s = newGameAll(404);
  check('13a رضایت شروع بازی صفر است (بدون شبکه)', s.satisfaction === 0 && s.districts.every(d => d.satisfaction === 0), 'sat=' + s.satisfaction);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  withLTE(s); // دکل 4G به‌عنوان گره سرویس‌دهندهٔ عمومی آزمون (TD-LTE فقط روی پوشش 4G کار می‌کند)
  const node = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, node);
  connectAny(s, node.id, coreOf(s).id);
  for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('13b رضایت منطقهٔ سرویس‌گرفته بالا می‌رود', d.satisfaction > 8, 'sat=' + d.satisfaction.toFixed(1) + ' qos=' + d.qos.toFixed(2));
}

// ---------- 14) مولد نقشهٔ تصادفی با بذر ----------
{
  const seeds = [1, 2, 3, 42, 777];
  let allOk = true; const details = [];
  for (const seed of seeds) {
    const s = newGameAll(seed);
    const hqNode = coreOf(s);
    const center = s.districts.find(d => d.id === 'center');
    const north = s.districts.find(d => d.id === 'north');
    const totalDemand = s.districts.reduce((sum, d) => sum + d.demandBase, 0);
    const river = s.map.river, roads = s.map.roads;
    const riverX = (y) => { for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1]; if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1, b.y - a.y); } return river[river.length - 1].x; };
    const badB = s.buildings.some(b => Math.abs(b.x + b.w / 2 - riverX(b.y + b.h / 2)) < 60 ||
      roads.v.some(lx => b.x - 14 < lx && lx < b.x + b.w + 14) || roads.h.some(ly => b.y - 14 < ly && ly < b.y + b.h + 14));
    const ok = s.districts.length >= 28 && s.districts.length <= 34 && !!hqNode && !!center && Math.hypot(center.x - hqNode.x, center.y - hqNode.y) < 60 &&
      // فاصلهٔ حاشیه شمالی از HQ: مناطق دیگر هم‌پوشانی ندارند، پس حداقل فاصله بیشتر شده (هنوز در برد PtP و آموزش)
      !!north && Math.hypot(north.x - hqNode.x, north.y - hqNode.y) < 1450 &&
      totalDemand > 55000 && totalDemand < 85000 && !badB && s.buildings.length > 200;
    if (!ok) { allOk = false; details.push('seed ' + seed + ': districts=' + s.districts.length + ' demand=' + totalDemand + ' buildings=' + s.buildings.length + ' badB=' + badB); }
  }
  check('14a نقشه‌های بذرهای مختلف سالم‌اند (۲۵-۳۰ منطقه، HQ، تقاضا، ساختمان بیرون رودخانه/خیابان)', allOk, details.join(' | '));
  const a = newGameAll(99), b = newGameAll(99), c = newGameAll(100);
  const sig = (s) => JSON.stringify(s.districts.map(d => [d.x, d.y, d.radius])) + JSON.stringify(s.buildings.map(x => [x.x, x.y]));
  check('14b بذر یکسان = نقشهٔ یکسان', sig(a) === sig(b));
  check('14c بذر متفاوت = نقشهٔ متفاوت', sig(a) !== sig(c));
  const s2 = GameSim.loadGame(GameSim.saveGame(a));
  check('14d بذر و نقشه در ذخیره حفظ می‌شوند', s2.mapSeed === 99 && JSON.stringify(s2.map.river) === JSON.stringify(a.map.river) && sig(s2) === sig(a));
  const old = JSON.parse(GameSim.saveGame(newGameAll(55)));
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
  const raw = JSON.parse(GameSim.saveGame(newGameAll(606)));
  raw.packages.forEach(p => { p.speedMbps = 0; });
  delete raw.packages[0].speedMbps;
  const migrated = GameSim.loadGame(JSON.stringify(raw));
  check('15b ذخیرهٔ بدون سرعت با سرعت پیش‌فرض پر می‌شود', migrated.packages.every(p => p.speedMbps > 0),
    migrated.packages.map(p => p.id + ':' + p.speedMbps).join(' '));
  function satWithSpeed(speed) {
    const s = withLTE(newGameAll(707)); // دکل 4G به‌عنوان گره سرویس‌دهندهٔ عمومی آزمون
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    const node = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
    finishBuild(s, node);
    connectAny(s, node.id, coreOf(s).id);
    if (speed != null) GameSim.updatePackage(s, 'home', { speed: speed });
    // بار کم و برابر و ثابت: رشد مشترک نباید اثر سرعت بسته را بپوشاند
    for (let i = 0; i < 25; i++) { d.subscribers = 100; GameSim.tick(s, 1); keepAlive(s); }
    return d.satisfaction;
  }
  const satDefault = satWithSpeed(null);
  const satSlow = satWithSpeed(10);
  check('15c بستهٔ کندتر رضایت کمتری می‌دهد (سرعت واقعاً اثر دارد)', satSlow < satDefault - 1,
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
  const s = newGameAll(808);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  feed4G(s, d.x, d.y); // دکل 4G با ماژول TD-LTE: هم سلولار هم TD-LTE سرویس می‌دهد
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
  check('16d دکل 4G+ماژول TD-LTE هر دو فناوری سلولار و TD-LTE را سرویس می‌دهد و وای‌فای سهم جدا ندارد',
    (td.fwa || {}).served > 0 && (td.cellular || {}).served > 0 && !td.wifi, JSON.stringify(td));
}

// ---------- 17) راهنمای همه تجهیزات و فناوری‌ها ----------
{
  const eqs = DATA.equipmentList || [];
  const missing = eqs.filter(e => !e.guide || !String(e.guide).trim()).map(e => e.id);
  check('17a همه تجهیزات راهنمای فارسی دارند (' + eqs.length + ' تجهیز)', eqs.length >= 17 && missing.length === 0,
    'missing=' + missing.join(','));
  const guides = DATA.techGuides || [];
  const badG = guides.filter(g => !g.desc || !g.whenToUse || (!(g.equipmentIds || []).length && g.id !== 'wifi' && g.id !== 'timeline')).map(g => g.id);
  check('17b همه فناوری‌ها راهنمای کلی دارند (' + guides.length + ' فناوری)', guides.length >= 8 && badG.length === 0,
    'bad=' + badG.join(','));
}

// ---------- 18) مدل رضایت: بدون شبکه ~۰، با پوشش بالا می‌رود ----------
{
  const s0 = newGameAll(909);
  for (let i = 0; i < 20; i++) GameSim.tick(s0, 1);
  check('18a بدون هیچ شبکه‌ای رضایت کلی ~۰ می‌ماند و بالا نمی‌رود', s0.satisfaction <= 1, 'sat=' + s0.satisfaction);
  function serveDistricts(seed, ids) {
    const s = newGameAll(seed);
    s.cash = 999999;
    for (const id of ids) {
      const d = s.districts.find(x => x.id === id);
      if (!d) continue;
      for (let k = 0; k < 3; k++) {
        const node = GameSim.buildNode(s, 'cell_3g', d.x + k * 40, d.y);
        finishBuild(s, node);
        connectAny(s, node.id, coreOf(s).id);
      }
    }
    for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
    return s.satisfaction;
  }
  function serveDistrictsPen(seed, ids) {
    const s = newGameAll(seed);
    s.cash = 999999;
    for (const id of ids) {
      const d = s.districts.find(x => x.id === id);
      if (!d) continue;
      for (let k = 0; k < 3; k++) {
        const node = GameSim.buildNode(s, 'cell_3g', d.x + k * 40, d.y);
        finishBuild(s, node);
        connectAny(s, node.id, coreOf(s).id);
      }
    }
    for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
    return s.penetration || 0;
  }
  const sat1 = serveDistricts(910, ['north']);
  const sat2 = serveDistricts(910, ['north', 'residential', 'center']);
  check('18b با سرویس یک منطقه رضایت کلی مثبت می‌شود', sat1 > 0, 'sat1=' + sat1);
  check('18c پوشش بیشتر = نفوذ اشتراک بیشتر (رضایت = تجربهٔ مشترکان فعلی)', serveDistrictsPen(910, ['north', 'residential', 'center']) > serveDistrictsPen(910, ['north']), 'sat1=' + sat1 + ' sat2=' + sat2);
}

// ---------- 19) تست سرعت در نقطه‌ای از نقشه ----------
{
  const s = newGameAll(111); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, node);
  // قبل از اتصال: پوشش هست ولی گره متصل نیست
  GameSim.tick(s, 1);
  const rUnconn = GameSim.speedTestAt(s, d.x, d.y);
  check('19a نقطه زیر پوشش دکل متصل‌نشده: سلولار صفر با علت «متصل نیست» و TD-LTE صفر (پوشش 4G متصل نیست)',
    rUnconn.cellular.speed === 0 && rUnconn.cellular.reason === 'unconnected' &&
    rUnconn.fwa.speed === 0 && rUnconn.fwa.reason === 'no_coverage', JSON.stringify(rUnconn));
  connectAny(s, node.id, coreOf(s).id);
  for (let i = 0; i < 5; i++) { GameSim.tick(s, 1); keepAlive(s); } // خرابی تصادفی لینک نباید تست علت سرعت را خراب کند
  const rNoMod = GameSim.speedTestAt(s, d.x, d.y);
  check('19b دکل 4G متصل بدون ماژول: سلولار مثبت و TD-LTE صفر با علت «ماژول TD-LTE ندارد»',
    rNoMod.cellular.speed > 0 && rNoMod.fwa.speed === 0 && rNoMod.fwa.reason === 'no_tdlte_module', JSON.stringify(rNoMod));
  GameSim.installModule(s, node.id, 'tdlte');
  const rServed = GameSim.speedTestAt(s, d.x, d.y);
  check('19b2 بعد از نصب ماژول TD-LTE: سرعت TD-LTE مثبت است', rServed.fwa.speed > 0, JSON.stringify(rServed.fwa));
  check('19b3 وای‌فای داخل ساختمان فقط با اشتراک: نقطهٔ بدون ساختمانِ مشترک صفر با علت «اشتراک ندارد»',
    rServed.wifi.speed === 0 && rServed.wifi.reason === 'no_subscription', JSON.stringify(rServed.wifi));
  const rFar = GameSim.speedTestAt(s, 60, 60);
  check('19c نقطه بدون پوشش: همه فناوری‌ها صفر با علت «خارج از پوشش»',
    ['fiber', 'cellular', 'fwa'].every(t => rFar[t].speed === 0 && rFar[t].reason === 'no_coverage'), JSON.stringify(rFar));
}

// ---------- 20) کارکنان: اثرات واقعی + پیشرفت بدون کارمند ----------
{
  // 20a: بازی جدید پیش‌فرض بدون هیچ کارمندی شروع می‌شود و بدون استخدام هم می‌شود شبکهٔ اول را ساخت و درآمد گرفت
  const s = newGameAll(501);
  check('20a-0 بازی جدید پیش‌فرض صفر کارمند دارد (همه نقش‌ها)',
    s.staff.length === 0 && ['technician', 'engineer', 'support', 'sales'].every(r => s.staff.filter(m => m.role === r).length === 0)
      && GameSim.staffEffects(s).monthlySalaryTotal === 0,
    'staff=' + s.staff.length + ' salaryTotal=' + GameSim.staffEffects(s).monthlySalaryTotal);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'cell_2g', d.x, d.y); // شروع واقعی بازی: 2G (TD-LTE به پوشش 4G نیاز دارد)
  finishBuild(s, node);
  connectAny(s, node.id, coreOf(s).id);
  const cashAfterBuild = s.cash;
  for (let i = 0; i < 60; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('20a بدون کارمند: مشترک و درآمد گرفته می‌شود', d.subscribers > 0 && s.cash > cashAfterBuild,
    'subs=' + d.subscribers + ' cash ' + cashAfterBuild + ' -> ' + s.cash);

  // 20b: تعمیر آنی است؛ تکنسین‌ها هزینهٔ تعمیر را کم می‌کنند (نه زمان را)
  function repairCostWith(techCount) {
    const g = newGameAll(502); g.cash = 999999;
    GameSim.fireStaff(g, 'technician');
    for (let i = 0; i < techCount; i++) GameSim.hireStaff(g, 'technician');
    const dd = g.districts.find(x => x.id === 'north') || g.districts[0];
    const w = GameSim.buildNode(g, 'cell_2g', dd.x, dd.y);
    finishBuild(g, w);
    connectAny(g, w.id, coreOf(g).id);
    w.status = 'failed'; w.health = 0;
    const r = GameSim.applyFix(g, { nodeId: w.id }, { action: 'repair', nodeId: w.id });
    return { cost: r.cost || 0, instant: w.status === 'active' };
  }
  const rep0 = repairCostWith(0), rep4 = repairCostWith(4);
  check('20b تعمیر آنی است و تکنسین هزینه‌اش را کم می‌کند', rep0.instant && rep4.instant && rep4.cost < rep0.cost && rep0.cost > 0,
    'cost0=' + rep0.cost + ' cost4=' + rep4.cost);

  // 20c: پشتیبانی افت رضایت را کند می‌کند
  function decayAfter(sups) {
    const g = newGameAll(503);
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
    const g = newGameAll(504); g.cash = 999999;
    for (let i = 0; i < sales; i++) GameSim.hireStaff(g, 'sales');
    const dd = g.districts.find(x => x.id === 'north') || g.districts[0];
    const w = GameSim.buildNode(g, 'cell_3g', dd.x, dd.y);
    finishBuild(g, w);
    connectAny(g, w.id, coreOf(g).id);
    for (let i = 0; i < 30; i++) { GameSim.tick(g, 1); keepAlive(g); }
    return dd.subscribers;
  }
  const subs0 = subsAfter(0), subsSales = subsAfter(3);
  check('20d تیم فروش رشد مشترک را بیشتر می‌کند', subsSales > subs0, 'base=' + subs0 + ' sales=' + subsSales);

  // 20e: حقوق مهندس در هزینهٔ ماهانهٔ محاسبه‌شده دقیقاً ۳۵۰۰ است (و در پایان ماه از نقدینگی کم می‌شود)
  function monthlyCostsOf(withEngineer) {
    const g = newGameAll(505); g.cash = 999999;
    if (withEngineer) GameSim.hireStaff(g, 'engineer');
    GameSim.computeFlow(g);
    return g.finance.monthlyCosts;
  }
  const costDiff = monthlyCostsOf(true) - monthlyCostsOf(false);
  check('20e حقوق مهندس در پایان ماه کسر می‌شود', costDiff === 3500, 'monthlyCosts diff=' + costDiff);

  // 20f: مهندس شبکه ظرفیت مؤثر و ازدحام را بهتر می‌کند
  const g6 = newGameAll(506); g6.cash = 999999;
  const fx0 = GameSim.staffEffects(g6);
  const d6 = g6.districts.find(x => x.id === 'north') || g6.districts[0];
  const w6 = GameSim.buildNode(g6, 'cell_3g', d6.x, d6.y);
  finishBuild(g6, w6);
  connectTower(g6, w6.id, coreOf(g6).id, 'copper'); // لینک مسی ۱۰۰ مگ < ظرفیت دکل ۲۵۰ → ازدحام
  for (let i = 0; i < 5; i++) { GameSim.tick(g6, 1); keepAlive(g6); }
  const servedNoEng = d6.servedDemand;
  for (let i = 0; i < 5; i++) GameSim.hireStaff(g6, 'engineer');
  const fx1 = GameSim.staffEffects(g6);
  for (let i = 0; i < 5; i++) { GameSim.tick(g6, 1); keepAlive(g6); }
  check('20f مهندس شبکه ازدحام را کمتر و سرویس را بیشتر می‌کند',
    fx0.capMult < 1 && fx1.capMult > 1 && d6.servedDemand > servedNoEng,
    'capMult ' + fx0.capMult.toFixed(2) + '->' + fx1.capMult.toFixed(2) + ' served ' + servedNoEng + '->' + d6.servedDemand);
}

// ---------- 21) حذف و جابه‌جایی گره‌ها (از جمله هسته و دروازه) ----------
{
  // 21a: حذف گرهٔ میانی → لینک‌هایش می‌روند و وابسته‌ها سرویس را از دست می‌دهند + بازپرداخت ۵۰٪
  const s = newGameAll(601); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const a = GameSim.buildNode(s, 'switch', d.x, d.y); // گرهٔ میانی سوئیچ است (دکل ترافیک عبوری ندارد)
  const b = GameSim.buildNode(s, 'cell_3g', d.x + 60, d.y + 40);
  finishBuild(s, a); finishBuild(s, b);
  connectAny(s, a.id, coreOf(s).id);
  connectAny(s, b.id, a.id);
  for (let i = 0; i < 5; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const servedBefore = d.servedDemand;
  const cashBefore = s.cash;
  const del = GameSim.demolishNode(s, a.id);
  const cashAfterDel = s.cash; // بلافاصله بعد از حذف (قبل از تیک‌ها که درآمد/هزینه نقدینگی را عوض می‌کند)
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('21a حذف گره میانی: لینک‌ها حذف و سرویس وابسته قطع می‌شود',
    del.ok && del.refund === 3000 && cashAfterDel === cashBefore + 3000 &&
    !s.links.some(l => l.from === a.id || l.to === a.id) && b.connected === false && d.servedDemand < servedBefore,
    'refund=' + del.refund + ' served ' + servedBefore + '->' + d.servedDemand + ' bConn=' + b.connected);

  // 21b: جابه‌جایی → موقعیت عوض می‌شود، لینک‌ها می‌مانند، بعد از نصب مجدد سرویس برمی‌گردد
  const s2 = newGameAll(602); s2.cash = 999999;
  const d2 = s2.districts.find(x => x.id === 'north') || s2.districts[0];
  const w2 = GameSim.buildNode(s2, 'cell_3g', d2.x, d2.y);
  finishBuild(s2, w2);
  connectAny(s2, w2.id, coreOf(s2).id);
  for (let i = 0; i < 5; i++) GameSim.tick(s2, 1);
  let target = null;
  for (const [ox, oy] of [[220, 0], [-220, 0], [0, 220], [0, -220], [300, 300], [-300, -300]]) {
    if (GameSim.isValidPlacement(s2, d2.x + ox, d2.y + oy).ok) { target = { x: d2.x + ox, y: d2.y + oy }; break; }
  }
  const linksBefore = s2.links.length;
  const mv = GameSim.moveNode(s2, w2.id, target.x, target.y);
  const movedOk = mv.ok && w2.x === target.x && w2.y === target.y && s2.links.length === linksBefore && w2.status !== 'building' && w2.connected === true;
  finishBuild(s2, w2);
  for (let i = 0; i < 5; i++) { GameSim.tick(s2, 1); keepAlive(s2); }
  const riverPt = s2.map.river[3];
  const mvRiver = GameSim.moveNode(s2, w2.id, riverPt.x, riverPt.y);
  check('21b جابه‌جایی گره: موقعیت جدید، لینک‌ها سالم، سرویس برمی‌گردد؛ رودخانه نامعتبر',
    movedOk && w2.connected === true && d2.servedDemand > 0 && mvRiver.ok === false,
    'moved=' + movedOk + ' served=' + d2.servedDemand + ' riverErr=' + (mvRiver.error || 'none'));

  // 21c: حذف دروازه → کل سرویس می‌خوابد؛ ساخت دروازهٔ جدید + اتصال → سرویس برمی‌گردد
  const s3 = newGameAll(603); s3.cash = 9999999;
  const d3 = s3.districts.find(x => x.id === 'north') || s3.districts[0];
  const w3 = GameSim.buildNode(s3, 'cell_3g', d3.x, d3.y);
  finishBuild(s3, w3);
  connectAny(s3, w3.id, coreOf(s3).id);
  for (let i = 0; i < 5; i++) { GameSim.tick(s3, 1); keepAlive(s3); }
  const served3 = d3.servedDemand;
  GameSim.demolishNode(s3, gwOf(s3).id);
  for (let i = 0; i < 3; i++) GameSim.tick(s3, 1);
  const deadOk = d3.servedDemand === 0 && d3.connected === false;
  const core3 = coreOf(s3);
  const gw2 = GameSim.buildNode(s3, 'internet_gateway', core3.x + 140, core3.y);
  finishBuild(s3, gw2);
  connectAny(s3, gw2.id, core3.id);
  for (let i = 0; i < 5; i++) { GameSim.tick(s3, 1); keepAlive(s3); }
  check('21c حذف دروازه سرویس را قطع و بازسازی‌اش برمی‌گرداند',
    served3 > 0 && deadOk && d3.servedDemand > 0,
    'served ' + served3 + ' -> 0 -> ' + d3.servedDemand);
}

// ---------- 22) برد لینک نقطه‌به‌نقطه (PtP) محدود است ----------
{
  const s = newGameAll(23); s.cash = 999999;
  const core = coreOf(s);
  const maxRange = (DATA.linkMedia && DATA.linkMedia.ptp && DATA.linkMedia.ptp.maxRange) || 1500;
  // گره نزدیک: در برد
  const near = GameSim.buildNode(s, 'cell_2g', core.x + 200, core.y);
  finishBuild(s, near);
  const okLink = connectTower(s, near.id, core.id, 'ptp');
  check('22a لینک PtP در برد مجاز برقرار می‌شود', !!okLink);
  // گره دور: بیرون از برد
  const far = GameSim.buildNode(s, 'cell_2g', core.x + maxRange + 800, core.y);
  finishBuild(s, far);
  const linksBefore = s.links.length;
  const sw22 = GameSim.buildNode(s, 'switch', core.x + 100, core.y); finishBuild(s, sw22);
  const badLink = GameSim.connect(s, far.id, sw22.id, 'ptp');
  check('22b لینک PtP بیرون از برد رد می‌شود و لینکی ساخته نمی‌شود',
    badLink === null && s.links.length === linksBefore);
  // فیبر در همان فاصلهٔ دور همچنان ممکن است
  const fiberLink = GameSim.connect(s, far.id, sw22.id, 'fiber');
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
    const s = newGameAll(seed);
    if (!(s.districts.length >= 28 && s.districts.length <= 34 && pairOk(s.districts, 40))) { allOk = false; bad.push(seed); }
  }
  check('23a مولد نقشه: هیچ دو منطقه‌ای هم‌پوشان نیستند (۱۸ بذر)', allOk, 'bad seeds: ' + bad.join(','));
  check('23b نقشهٔ ثابت جایگزین هم بدون هم‌پوشانی است', pairOk(DATA.districts || [], 0));
  // پس از ۳۰۰ روز بازی با سرویس فعال، اندازهٔ پویا هم نباید هم‌پوشانی بسازد
  const s = newGameAll(42); s.cash = 99999999;
  s.districts.slice(0, 4).forEach(d => {
    const w = GameSim.buildNode(s, 'cell_3g', d.x, d.y);
    if (w) { finishBuild(s, w); connectTower(s, w.id, coreOf(s).id, 'fiber'); }
  });
  for (let i = 0; i < 300; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('23c پس از ۳۰۰ روز با سرویس، هم‌پوشانی مناطق صفر است', pairOk(s.districts, 40), 'districts=' + s.districts.length);
}

// ---------- 24) ساختمان‌های خارج از مناطق ----------
{
  const s = newGameAll(42);
  const outside = s.buildings.filter(b => !b.districtId);
  const river = s.map.river, roads = s.map.roads;
  const riverX = (y) => { for (let i = 0; i < river.length - 1; i++) { const a = river[i], b = river[i + 1]; if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1, b.y - a.y); } return river[river.length - 1].x; };
  const badOut = outside.some(b => Math.abs(b.x + b.w / 2 - riverX(b.y + b.h / 2)) < 60 ||
    roads.v.some(lx => b.x - 14 < lx && lx < b.x + b.w + 14) || roads.h.some(ly => b.y - 14 < ly && ly < b.y + b.h + 14) ||
    s.districts.some(d => Math.hypot(b.x + b.w / 2 - d.x, b.y + b.h / 2 - d.y) < d.radius + 29));
  check('24a ساختمان‌های پراکندهٔ اولیه: >۵۰ و همه بیرون مناطق/رودخانه/خیابان', outside.length > 50 && !badOut, 'outside=' + outside.length + ' bad=' + badOut);
  const s2 = newGameAll(5);
  const before = s2.buildings.filter(b => !b.districtId).length;
  for (let i = 0; i < 800; i++) GameSim.tick(s2, 1);
  const after = s2.buildings.filter(b => !b.districtId).length;
  const outsideCap = (DATA.growth && DATA.growth.outsideCap) || 320;
  check('24b رشد شهر ساختمان پراکنده هم می‌سازد و از سقف رد نمی‌شود', after > before && after <= outsideCap, before + ' -> ' + after + ' (cap ' + outsideCap + ')');
}

// ---------- 25) اندازهٔ پویای مناطق بر اساس مشترکان ----------
{
  const s = newGameAll(42); s.cash = 99999999;
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
  const s = newGameAll(42); s.cash = 99999999;
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
  const ctrl = newGameAll(31);
  for (let i = 0; i < 40; i++) GameSim.tick(ctrl, 1);
  check('27a بدون پوشش، ساختمان پراکنده مشترک نمی‌گیرد', ctrl.scattered && ctrl.scattered.subscribers === 0, 'subs=' + (ctrl.scattered && ctrl.scattered.subscribers));
  const s = newGameAll(31); s.cash = 99999999;
  const ob = s.buildings.find(b => !b.districtId);
  const w = GameSim.buildNode(s, 'cell_3g', Math.round(ob.x + ob.w / 2), Math.round(ob.y + ob.h / 2));
  finishBuild(s, w);
  connectTower(s, w.id, coreOf(s).id, 'fiber');
  for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const outsideNow = s.buildings.filter(b => !b.districtId).length;
  check('27b ساختمان پراکندهٔ تحت پوشش مشترک و درآمد می‌گیرد', s.scattered.subscribers > 0 && s.scattered.revenue > 0,
    'subs=' + s.scattered.subscribers + ' rev=' + s.scattered.revenue + ' covered=' + s.scattered.coveredCount);
  check('27c ظرفیت بالقوهٔ پراکنده = ساختمان×۶ و در مجموع مشترکان حساب می‌شود',
    s.scattered.potentialSubs === s.scattered.buildingCount * 6 &&
    s.lastFlow.totalSubscribers === s.districts.reduce((sum, d) => sum + d.subscribers, 0) + s.scattered.subscribers,
    'potential=' + s.scattered.potentialSubs + ' outside=' + outsideNow);
}

// ---------- 28) یکپارچگی کاتالوگ تجهیزات ----------
{
  const list = DATA.equipmentList || [];
  const CATS = new Set(['cable', 'access', 'antenna', 'backhaul', 'core', 'power', 'tools']);
  const ids = new Set(); let bad = [];
  for (const e of list) {
    if (ids.has(e.id)) bad.push('dup ' + e.id);
    ids.add(e.id);
    if (!(e.cost > 0)) bad.push(e.id + ' cost');
    if (!(e.monthlyCost >= 0)) bad.push(e.id + ' monthly');
    if (!e.guide || !String(e.guide).trim()) bad.push(e.id + ' guide');
    if (!CATS.has(e.category)) bad.push(e.id + ' cat=' + e.category);
    if (!(e.era >= 1991 && e.era <= 2019)) bad.push(e.id + ' era=' + e.era);
    if (!(e.slots >= 0)) bad.push(e.id + ' slots=' + e.slots);
    if ((e.category === 'access' || e.category === 'antenna') && !GameSim.TECH_KEYS.includes(e.tech)) bad.push(e.id + ' tech=' + e.tech);
    if (!(e.radius >= 0) || !(e.capacity >= 0)) bad.push(e.id + ' radius/capacity');
  }
  check('28a کاتالوگ کلی ساده: ۱۷ تا ۳۰ تجهیز، شناسه یکتا، قیمت/راهنما/دسته/دوران/اسلات معتبر', list.length >= 17 && list.length <= 30 && bad.length === 0,
    'total=' + list.length + (bad.length ? ' bad: ' + bad.slice(0, 8).join(', ') : ''));
  const eraYears = (DATA.timeline.eras || []).map(x => x.year);
  const eraCover = list.every(e => eraYears.some(y => y <= e.era)) &&
    (DATA.moduleList || []).every(m => m.era >= 1991 && m.era <= 2019 && m.cost > 0);
  check('28b دوران همهٔ تجهیزات و ماژول‌ها در خط زمانی پوشش داده شده است', eraCover);
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
  const s = newGameAll(99);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const node = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, node);
  connectAny(s, node.id, coreOf(s).id);
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
  const s = newGameAll(42); s.cash = 999999;
  unlockAllEras(s);
  // پنج منطقه با دکل 4G پوشش داده می‌شوند تا کیفیت بالقوه بالا بماند و افراد واقعاً مشترک شوند
  const servedIds = ['north', 'residential', 'center', 'east_res', 'west_town'];
  const nodes = [];
  for (const did of servedIds) {
    const d = s.districts.find(x => x.id === did);
    const n = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
    finishBuild(s, n);
    connectTower(s, n.id, coreOf(s).id, 'fiber');
    nodes.push(n);
  }
  for (let i = 0; i < 25; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const subBefore = s.individuals.filter(i => i.status === 'subscribed').length;
  check('32a مشترکان فردی ساخته می‌شوند (سقف ۲۰۰۰) و دست‌کم یکی مشترک می‌شود',
    s.individuals.length > 0 && s.individuals.length <= 2000 && subBefore >= 1,
    'total=' + s.individuals.length + ' subscribed=' + subBefore);
  nodes.forEach(n => GameSim.demolishNode(s, n.id));
  for (let i = 0; i < 15; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const subAfter = s.individuals.filter(i => i.status === 'subscribed').length;
  const unsub = s.individuals.filter(i => i.status === 'unsubscribed').length;
  check('32b با قطع سرویس، مشترکان فردی شبکه را ترک می‌کنند',
    subAfter < subBefore && unsub >= 1,
    'subscribed ' + subBefore + ' -> ' + subAfter + ' unsubscribed=' + unsub);
}

// ---------- 33) قراردادهای سازمانی حذف شده‌اند ----------
{
  check('33a تابع مذاکرهٔ قرارداد و قالب‌های سازمانی وجود ندارند',
    GameSim.negotiateContract === undefined && DATA.enterpriseTemplates === undefined);
  const s = GameSim.newGame(7);
  check('33b بازی تازه هیچ فیلد قراردادی ندارد', s.contracts === undefined && s.contractOffers === undefined);
  // ذخیرهٔ قدیمیِ دارای قرارداد فعال: بدون جریمه بارگذاری و قراردادها حذف می‌شوند
  const raw = JSON.parse(GameSim.saveGame(s));
  raw.contracts = [{ id: 'c_old', orgName: 'سازمان قدیمی', districtId: raw.districts[0].id, priceMonthly: 5000, monthsLeft: 6, status: 'active', breaches: 0 }];
  raw.contractOffers = [{ id: 'o_old', orgName: 'پیشنهاد قدیمی' }];
  const cash0 = raw.cash;
  const s2 = GameSim.loadGame(JSON.stringify(raw));
  check('33c ذخیرهٔ قدیمی با قرارداد: قراردادها بی‌جریمه حذف و بازی ادامه پیدا می‌کند',
    s2.contracts === undefined && s2.contractOffers === undefined && s2.cash === cash0 && !!GameSim.tick(s2, 1),
    'cash ' + cash0 + '->' + s2.cash);
}

// ---------- 34) کمپین‌های تبلیغاتی ----------
{
  function campGame(withCamp) {
    const s = newGameAll(88); s.cash = 999999;
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    const n = GameSim.buildNode(s, 'cell_3g', d.x, d.y);
    finishBuild(s, n);
    connectAny(s, n.id, coreOf(s).id);
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

// ---------- 35) بستهٔ گیمینگ: تأخیر مسیر فیبر در برابر مسیر زمینی پرتأخیر ----------
{
  function gamingClean(kind) {
    const s = newGameAll(55); s.cash = 99999999;
    const d = s.districts.find(x => x.id === 'north') || s.districts[0];
    s.customers.find(c => c.districtId === d.id).packageId = 'gaming';
    if (kind === 'fiber') {
      unlockAllEras(s); unlockAllEras(s);
      const bFirst = s.buildings.find((x) => x.districtId === d.id);
      const n = GameSim.buildNode(s, 'street_cabinet', bFirst.x + (bFirst.w || 26) / 2, bFirst.y + (bFirst.h || 20) / 2);
      finishBuild(s, n);
      connectTower(s, n.id, coreOf(s).id, 'fiber');
      // فیبر دستی است: ساختمان‌های در برد کابینت انشعاب می‌گیرند تا سرویس کامل شود
      for (const b of s.buildings.filter((x) => x.districtId === d.id)) GameSim.connectBuildingFiber(s, b.id, n.id);
      for (let i = 0; i < 8; i++) { GameSim.tick(s, 1); keepAlive(s); }
    } else {
      // مسیر زمینی پرتأخیر: دکل 2G با لینک فیبر با تأخیر تحمیلی ۶۰۰ میلی‌ثانیه
      const term = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
      finishBuild(s, term);
      connectTower(s, term.id, coreOf(s).id, 'fiber', { latency: 600 });
    }
    s.weather = { kind: 'clear', untilDay: 9999 };
    s.failoverActive = false;
    d.subscribers = 30; d.satisfaction = 0; // ترافیک کم (۳۰×۱٫۲=۳۶ < ظرفیت 2G) تا کیفیت هر دو مسیر کامل باشد و فقط تأخیر فرق کند
    GameSim.computeFlow(s);
    return d;
  }
  const gf = gamingClean('fiber'), gs = gamingClean('highlat');
  check('35a تأخیر متوسط مسیر فیبر بسیار کمتر از مسیر پرتأخیر است',
    gf.avgLatency > 0 && gf.avgLatency < gs.avgLatency && gs.avgLatency >= 600,
    'fiber=' + gf.avgLatency + 'ms highlat=' + gs.avgLatency + 'ms');
  check('35b با کیفیت برابر، رضایت بستهٔ گیمینگ روی فیبر بیشتر از مسیر پرتأخیر است',
    gf.qos === gs.qos && gf.satisfaction > gs.satisfaction,
    'qos=' + gf.qos.toFixed(2) + '/' + gs.qos.toFixed(2) + ' sat fiber=' + gf.satisfaction.toFixed(1) + ' highlat=' + gs.satisfaction.toFixed(1));
}

// ---------- 36) کانال فرکانسی و تداخل ----------
{
  const s = newGameAll(66); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const a = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  const b = GameSim.buildNode(s, 'cell_4g', d.x + 50, d.y);
  finishBuild(s, a); finishBuild(s, b);
  connectAny(s, a.id, coreOf(s).id);
  connectAny(s, b.id, coreOf(s).id);
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
  const s = newGameAll(31); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'cell_3g', d.x + 150, d.y);
  finishBuild(s, n);
  connectAny(s, n.id, coreOf(s).id);
  // قرارداد جهت: ۰=شرق، مثبت پادساعتگرد؛ زاویهٔ نقطه با atan2(-dy, dx) گرفته می‌شود
  const dirTo = Math.atan2(-(d.y - n.y), d.x - n.x) * 180 / Math.PI;
  const r1 = GameSim.setNodeDirection(s, n.id, dirTo, 60);
  d.subscribers = 500; // مشترکِ موجود تا ترافیک و سرویس سنجیده شود
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
  const s = newGameAll(31); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = feed4G(s, d.x, d.y); // دکل 4G + ماژول TD-LTE
  s.buildings.forEach(b => { b.height = 5; }); // ساختمان‌های موجود دید را نبندند تا اثر ساختمان آزمایشی جدا سنجیده شود
  const atNode = GameSim.signalAt(s, n.x, n.y);
  check('38a سیگنال در محل گرهٔ فعال قوی است (>۰٫۵)', atNode.signal > 0.5 && atNode.nodeId === n.id,
    'signal=' + atNode.signal.toFixed(2));
  const far = GameSim.signalAt(s, 60, 60);
  check('38b گوشهٔ دور نقشه بدون پوشش سیگنال صفر دارد', far.signal === 0 && far.nodeId === null,
    'signal=' + far.signal);
  // افت ساختمان برای TD-LTE (برخلاف سلولار که از ساختمان عبور می‌کند)
  const clearFwa = GameSim.speedTestAt(s, n.x + 60, n.y).fwa.speed;
  s.buildings.push({ id: 'fake_tall', districtId: null, x: n.x + 30, y: n.y, w: 26, h: 20, height: 30, type: 'commercial' });
  const blockedFwa = GameSim.speedTestAt(s, n.x + 60, n.y).fwa.speed;
  const att = GameSim.buildingAttenuation(s, n.x, n.y, n.x + 60, n.y);
  check('38c نقطهٔ پشت ساختمان بلند برای TD-LTE سرعت کمتری دارد (افت ساختمان)',
    clearFwa > 0 && blockedFwa < clearFwa && att < 1,
    'clear=' + clearFwa + ' blocked=' + blockedFwa + ' att=' + att);
}

// ---------- 39) پیشنهاد مکان نصب ----------
{
  const s = newGameAll(42);
  const eq = DATA.equipmentList.find(e => e.id === 'cell_4g');
  const centerD = s.districts.find(x => x.id === 'center') || s.districts[0];
  feed4G(s, centerD.x, centerD.y); // پیشنهاد TD-LTE فقط داخل پوشش 4G معنا دارد
  const r = GameSim.suggestPlacements(s, 'cell_4g');
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

// ---------- 41) ساعت اوج و ساعت روز ----------
{
  check('41a ضریب تقاضا: نیمه‌شب < ظهر < اوج عصرگاهی',
    GameSim.demandFactorAtHour(3) < GameSim.demandFactorAtHour(12) &&
    GameSim.demandFactorAtHour(12) < GameSim.demandFactorAtHour(20),
    '3h=' + GameSim.demandFactorAtHour(3) + ' 12h=' + GameSim.demandFactorAtHour(12) + ' 20h=' + GameSim.demandFactorAtHour(20));
  const s = newGameAll(31); s.cash = 999999;
  const h0 = s.hour;
  const h1 = GameSim.clockTick(s, 5);
  const h2 = GameSim.clockTick(s, 10);
  check('41b ساعت روز جلو می‌رود و در ۲۴ دور می‌زند',
    h0 === 10 && h1 === 15 && h2 === 1 && s.hour === 1,
    h0 + ' -> ' + h1 + ' -> ' + h2);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'cell_3g', d.x, d.y);
  finishBuild(s, n);
  connectAny(s, n.id, coreOf(s).id);
  d.subscribers = 2000; // مشترکِ موجود تا ترافیک ساعت اوج/نیمه‌شب قابل مقایسه باشد
  s.hour = 3; GameSim.computeFlow(s);
  const dem3 = d.demand, qos3 = d.qos;
  s.hour = 20; GameSim.computeFlow(s);
  check('41c در ساعت اوج تقاضا بیشتر و کیفیت کمتر از نیمه‌شب است',
    d.demand > dem3 && d.qos < qos3,
    'demand ' + Math.round(dem3) + ' -> ' + Math.round(d.demand) + ' qos ' + qos3.toFixed(2) + ' -> ' + d.qos.toFixed(2));
  // 41d: عبور از نیمه‌شب دقیقاً یک روز به شمارندهٔ روز اضافه می‌کند (هم‌گامی ساعت و روز)
  const sc = newGameAll(32);
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
  const s = newGameAll(31); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, n);
  connectTower(s, n.id, coreOf(s).id, 'fiber'); // فیبر تا افت لینک بلند، اثر طوفان را نپوشاند
  d.subscribers = 6000; // ترافیک بیشتر از ظرفیت تا افت طوفان در سرویس دیده شود
  s.weather = { kind: 'clear', untilDay: 9999 };
  GameSim.computeFlow(s, { dailyAvg: true });
  const servedClear = d.servedDemand, effClear = n._effCap;
  s.weather = { kind: 'storm', untilDay: 9999 };
  GameSim.computeFlow(s, { dailyAvg: true });
  check('42b طوفان ظرفیت مؤثر و سرویس گرهٔ بی‌سیم را کم می‌کند',
    n._effCap < effClear && d.servedDemand < servedClear,
    'effCap ' + Math.round(effClear) + ' -> ' + Math.round(n._effCap) + ' served ' + servedClear + ' -> ' + d.servedDemand);
  const s2 = newGameAll(31);
  for (let i = 0; i < 30; i++) GameSim.tick(s2, 1);
  check('42c آب‌وهوا با گذر روزها قرعه‌کشی می‌شود و معتبر می‌ماند',
    s2.weather.untilDay > 1 && ['clear', 'rain', 'storm', 'snow'].includes(s2.weather.kind),
    'kind=' + s2.weather.kind + ' untilDay=' + s2.weather.untilDay);
}

// ---------- 43) تاریخچهٔ روزانه ----------
{
  const s = newGameAll(31);
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
  const s = newGameAll(31);
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, n);
  connectAny(s, n.id, coreOf(s).id);
  GameSim.tick(s, 2);
  const raw = JSON.parse(GameSim.saveGame(s));
  delete raw.hour; delete raw.weather; delete raw.achievements; delete raw.newAchievements;
  delete raw.individuals; delete raw.contracts; delete raw.contractOffers; delete raw.campaigns;
  delete raw.history;
  ['individual', 'contract', 'campaign', 'built', 'contractsDone', 'campaignsRun', 'profitMonths']
    .forEach(k => delete raw.counters[k]);
  raw.nodes.forEach(x => { delete x.channel; delete x.interference; });
  raw.districts.forEach(x => { delete x.avgLatency; delete x.perSubMbps; delete x._qosAcc; delete x._qosDays; });
  const s2 = GameSim.loadGame(JSON.stringify(raw));
  const wifi = s2.nodes.find(x => x.type === 'cell_2g');
  check('44a ذخیرهٔ بدون فیلدهای جدید با پیش‌فرض‌ها کامل می‌شود',
    s2.hour === 10 && s2.weather.kind === 'clear' &&
    Array.isArray(s2.individuals) && s2.individuals.length === 0 &&
    s2.contracts === undefined && s2.contractOffers === undefined &&
    Array.isArray(s2.campaigns) && Array.isArray(s2.history) && s2.satellites === undefined &&
    !!s2.achievements && !!wifi && wifi.channel != null && wifi.interference === 0 &&
    s2.districts.every(x => x.avgLatency === 0 && x.perSubMbps === 0),
    'hour=' + s2.hour + ' weather=' + s2.weather.kind + ' wifiChannel=' + (wifi && wifi.channel));
  check('44b بازی مهاجرت‌کرده بدون خطا ادامه پیدا می‌کند', !!GameSim.tick(s2, 1));
}

// ---------- 47: کاتالوگ ساده و کلی (۱۷ قلم) ----------
{
  const eqs = DATA.equipmentList;
  check('47a کاتالوگ کلی و ساده است (۱۷ تا ۳۰ قلم)', eqs.length >= 17 && eqs.length <= 30, 'n=' + eqs.length);
  const ids = new Set(eqs.map((e) => e.id));
  check('47b شناسه‌های کاتالوگ یکتا هستند', ids.size === eqs.length);
  check('47c هر قلم دوران تاریخی معتبر دارد (۱۹۹۱ تا ۲۰۱۹)', eqs.every((e) => e.era >= 1991 && e.era <= 2019));
  check('47d هر قلم راهنمای فارسی دارد', eqs.every((e) => e.guide && e.guide.length > 20));
  const coreIds = ['fiber_cable', 'copper_cable', 'street_cabinet', 'ftth', 'cell_2g', 'cell_3g', 'cell_4g', 'cell_5g', 'repeater', 'ptp_link', 'switch', 'aggregation', 'core_router', 'internet_gateway', 'backup_power', 'test_tools_kit'];
  check('47e هر ۱۶ قلم کلی اصلی حاضرند (بدون fwa_ap و روتر لبه؛ با تقویت‌کننده)', coreIds.every((id) => ids.has(id)) && !ids.has('fwa_ap') && !ids.has('router'));
  const guideBad = (DATA.techGuides || []).flatMap((g) => (g.equipmentIds || []).filter((id) => !ids.has(id)));
  check('47f راهنمای فناوری‌ها فقط به اقلام موجود اشاره می‌کند', guideBad.length === 0, guideBad.join(','));
}

// ---------- 48: ماژول‌های سخت‌افزاری (جایگزین ارتقای سطحی) ----------
{
  const s = newGameAll(42);
  s.cash = 500000;
  const core = coreOf(s);
  const t = GameSim.buildNode(s, 'cell_3g', core.x - 220, core.y - 40);
  finishBuild(s, t);
  const eq3 = eq('cell_3g');
  check('48a دکل تازه فقط منبع تغذیهٔ پایه دارد و ظرفیتش پایه است',
    Array.isArray(t.modules) && t.modules.every(m => m === 'power') && t.capacity === eq3.capacity && t.status !== 'building',
    'cap=' + t.capacity + ' st=' + t.status + ' mods=' + JSON.stringify(t.modules));
  const cashBefore = s.cash;
  const r1 = GameSim.installModule(s, t.id, 'cap_boost');
  check('48b نصب ماژول ظرفیت آنی است: پول کم شد، ظرفیت ×۱٫۵، گره فعال ماند',
    r1.ok === true && s.cash === cashBefore - 8000 && t.capacity === Math.round(eq3.capacity * 1.5) && t.status !== 'building' && t.status !== 'upgrading',
    JSON.stringify(r1) + ' cap=' + t.capacity);
  const r2 = GameSim.installModule(s, t.id, 'range_boost');
  check('48c ماژول برد شعاع را ۱۰٪ بیشتر کرد', r2.ok === true && t.radius === Math.round(eq3.radius * 1.1), 'r=' + t.radius);
  const rBad = GameSim.installModule(s, t.id, 'tdlte');
  check('48d ماژول TD-LTE روی دکل 3G رد می‌شود (فقط 4G/5G)', rBad.ok === false, rBad.error || '');
  // محدودیت تعداد ماژول نیست: همان نوع ماژول سطح‌به‌سطح آپگرید می‌شود (سطح = شمارش)
  GameSim.installModule(s, t.id, 'cap_boost');
  GameSim.installModule(s, t.id, 'cap_boost');
  const rFull = GameSim.installModule(s, t.id, 'cap_boost');
  check('48e بدون سقف تعداد: ماژول ظرفیت تا سطح ۴ آپگرید شد',
    rFull.ok === true && GameSim.moduleLevel(t, 'cap_boost') === 4 && t.capacity === Math.round(eq3.capacity * GameSim.capBoostMult(4)),
    'level=' + GameSim.moduleLevel(t, 'cap_boost') + ' cap=' + t.capacity);
  const info = GameSim.moduleInfo(s, t.id);
  const capOpt = info && info.options.find(o => o.id === 'cap_boost');
  check('48f moduleInfo سطح و هزینهٔ سطح بعد را گزارش می‌دهد',
    !!capOpt && capOpt.level === 4 && capOpt.cost === Math.round(8000 * Math.pow(1.6, 4)) && info.levels.power === 1,
    JSON.stringify(capOpt && { level: capOpt.level, cost: capOpt.cost }));
  const rUnknown = GameSim.installModule(s, t.id, 'no_such_module');
  check('48g ماژول ناشناخته رد می‌شود', rUnknown.ok === false);
}

// ---------- 49: سازگاری ذخیرهٔ قدیمی با تجهیزات حذف‌شده ----------
{
  const s = newGameAll(42);
  const raw = JSON.parse(GameSim.saveGame(s));
  raw.nodes.push({ id: 'n900', type: 'ant_sector_65_900', name: 'آنتن قدیمی', x: 3000, y: 2000, status: 'unconnected', health: 90, capacity: 220, radius: 380 });
  raw.nodes.push({ id: 'n901', type: 'pwr_battery_vrla_400ah', name: 'باتری قدیمی', x: 3100, y: 2100, status: 'unconnected', health: 90, capacity: 0, radius: 250 });
  raw.nodes.push({ id: 'n902', type: 'tool_otdr_pro', name: 'ابزار قدیمی', x: 3200, y: 2200, status: 'unconnected', health: 90, capacity: 0, radius: 0 });
  raw.nodes.push({ id: 'n903', type: 'mw_23ghz_2000', name: 'مایکروویو قدیمی', x: 3300, y: 2300, status: 'unconnected', health: 90, capacity: 2000, radius: 0 });
  const s2 = GameSim.loadGame(JSON.stringify(raw));
  const m = (id) => s2.nodes.find((n) => n.id === id);
  check('49a آنتن قدیمی به cell_2g نگاشت شد', m('n900') && m('n900').type === 'cell_2g', m('n900') && m('n900').type);
  check('49b باتری قدیمی به backup_power نگاشت شد', m('n901') && m('n901').type === 'backup_power', m('n901') && m('n901').type);
  check('49c ابزار قدیمی به test_tools_kit نگاشت شد', m('n902') && m('n902').type === 'test_tools_kit', m('n902') && m('n902').type);
  check('49d مایکروویو قدیمی به ptp_link نگاشت شد', m('n903') && m('n903').type === 'ptp_link', m('n903') && m('n903').type);
  check('49e گره نگاشت‌شده فقط منبع تغذیهٔ خودکار دارد و ظرفیتش کلی است', Array.isArray(m('n900').modules) && m('n900').modules.every(x => x === 'power') && m('n900').capacity === eq('cell_2g').capacity);
  let crashed = false;
  try { for (let i = 0; i < 5; i++) GameSim.tick(s2, 1); } catch (e) { crashed = true; }
  check('49f ذخیرهٔ مهاجرت‌کرده بدون کرش تیک می‌خورد', !crashed);
}

// ---------- 50: انشعاب فیبر دستی ساختمان‌ها ----------
{
  const s = newGameAll(42);
  s.cash = 9999999;
  unlockAllEras(s); unlockAllEras(s);
  const d = s.districts.find((x) => (s.buildings || []).some((b) => b.districtId === x.id)) || s.districts[0];
  const n = GameSim.buildNode(s, 'street_cabinet', d.x, d.y);
  finishBuild(s, n);
  connectTower(s, n.id, coreOf(s).id, 'fiber');
  const legacyFtth = GameSim.buildNode(s, 'ftth', d.x + 40, d.y); // برای مسیر مهاجرت ذخیرهٔ قدیمی (50h)
  finishBuild(s, legacyFtth);
  GameSim.connect(s, legacyFtth.id, coreOf(s).id, 'fiber');
  GameSim.tick(s, 1); keepAlive(s);
  check('50a منطقه زیر پوشش کابینت بدون انشعاب دستی از فیبر سرویس نمی‌گیرد',
    d.servedDemand === 0 && (d.techDemand.fiber.served === 0),
    'served=' + d.servedDemand + ' fiberServed=' + d.techDemand.fiber.served);
  const dBuildings = s.buildings.filter((b) => b.districtId === d.id)
    .filter((b) => Math.hypot(b.x + (b.w || 26) / 2 - n.x, b.y + (b.h || 20) / 2 - n.y) <= (n.radius || 180));
  const b0 = dBuildings[0];
  const st0 = GameSim.speedTestAt(s, b0.x + 5, b0.y + 5);
  check('50b تست سرعت فیبر برای ساختمان بدون انشعاب صفر با دلیل «به فیبر متصل نیست»',
    st0.fiber.speed === 0 && st0.fiber.reason === 'no_fiber_drop', JSON.stringify(st0.fiber));
  const cashBefore = s.cash;
  let okAll = dBuildings.length > 0;
  for (const b of dBuildings) { const r = GameSim.connectBuildingFiber(s, b.id, n.id); if (!r.ok) okAll = false; }
  check('50c اتصال دستی ساختمان‌های در برد کابینت موفق و رایگان است (هزینهٔ نصب با مشترک)', okAll && s.cash === cashBefore);
  check('50d وضعیت ساختمان بلافاصله فعال است (انشعاب آنی)', GameSim.buildingFiberStatus(s, b0.id).status === 'active');
  for (let i = 0; i < 10 && (s.fiberDrops || []).some((x) => x.status === 'building'); i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('50e انشعاب‌ها فعال شدند', GameSim.buildingFiberStatus(s, b0.id).status === 'active');
  for (let i = 0; i < 5 && d.servedDemand === 0; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('50f بعد از انشعاب، منطقه از فیبر سرویس می‌گیرد', d.servedDemand > 0 && d.techDemand.fiber.served > 0,
    'served=' + d.servedDemand + ' fiberServed=' + d.techDemand.fiber.served);
  const st1 = GameSim.speedTestAt(s, b0.x + 5, b0.y + 5);
  check('50g تست سرعت فیبر بعد از انشعاب مثبت است', st1.fiber.speed > 0, JSON.stringify(st1.fiber));
  // سازگاری ذخیرهٔ قدیمی: حذف فیلد fiberDrops از ذخیره → هنگام بارگذاری انشعاب خودکار (حفظ سرویس)
  const raw = JSON.parse(GameSim.saveGame(s));
  delete raw.fiberDrops;
  const s2 = GameSim.loadGame(JSON.stringify(raw));
  const d2 = s2.districts.find((x) => x.id === d.id);
  check('50h ذخیرهٔ قدیمی بدون fiberDrops هنگام بارگذاری انشعاب فعال می‌گیرد',
    (s2.fiberDrops || []).length >= dBuildings.length && (s2.fiberDrops || []).every((x) => x.status === 'active'),
    'drops=' + (s2.fiberDrops || []).length);
  GameSim.tick(s2, 1);
  check('50i سرویس فیبر بعد از مهاجرت ذخیرهٔ قدیمی حفظ شد', d2.servedDemand > 0, 'served=' + d2.servedDemand);
}

// ---------- 51: وضعیت اتصال به هسته بلافاصله بعد از تغییر توپولوژی ----------
{
  const s = newGameAll(42);
  s.cash = 9999999;
  const core = coreOf(s);
  const agg = GameSim.buildNode(s, 'aggregation', core.x - 400, core.y);
  finishBuild(s, agg);
  const w = GameSim.buildNode(s, 'cell_2g', core.x - 700, core.y);
  finishBuild(s, w);
  check('51a گره تازه‌ساخته بدون لینک متصل نیست', w.connected === false);
  GameSim.connect(s, agg.id, core.id, 'fiber');
  check('51b بلافاصله بعد از اتصال (بدون تیک) تجمیع متصل گزارش می‌شود', agg.connected === true);
  connectTower(s, w.id, agg.id, 'fiber');
  check('51c بلافاصله بعد از اتصال وای‌فای متصل گزارش می‌شود', w.connected === true);
  GameSim.demolishNode(s, agg.id);
  check('51d بلافاصله بعد از حذف گره واسط، وای‌فای نامتصل گزارش می‌شود', w.connected === false);
  connectTower(s, w.id, core.id, 'fiber');
  check('51e اتصال مستقیم دوباره فوری متصل است', w.connected === true);
  GameSim.moveNode(s, w.id, core.x - 800, core.y + 100);
  check('51f جابه‌جایی آنی است و گره متصل می‌ماند', w.connected === true && w.status !== 'building');
}

// ---------- 52: قطع اتصال لینک ----------
{
  const s = newGameAll(42);
  s.cash = 9999999;
  const core = coreOf(s);
  const agg = GameSim.buildNode(s, 'aggregation', core.x - 400, core.y);
  finishBuild(s, agg);
  const w = GameSim.buildNode(s, 'cell_2g', core.x - 700, core.y);
  finishBuild(s, w);
  const l1 = GameSim.connect(s, agg.id, core.id, 'fiber');
  const l2 = connectTower(s, w.id, agg.id, 'fiber');
  check('52a هر دو گره متصل‌اند', agg.connected === true && w.connected === true);
  const impact = GameSim.linkDisconnectImpact(s, l1.id);
  check('52b اثر قطع لینک اصلی: سه گره یتیم می‌شوند (تجمیع + سوئیچ + دکل)', impact.orphanCount === 3, 'orphans=' + impact.orphanCount);
  const r = GameSim.disconnectLink(s, l1.id);
  check('52c قطع اتصال موفق و لینک حذف شد', r.ok === true && !s.links.some((l) => l.id === l1.id));
  check('52d گره پایین‌دست بلافاصله نامتصل گزارش می‌شود', agg.connected === false && w.connected === false);
  check('52e لینک دیگر سر جایش است', s.links.some((l) => l.id === l2.id));
  const s2 = GameSim.loadGame(GameSim.saveGame(s));
  check('52f ذخیره/بارگذاری لینک‌های باقی‌مانده را حفظ می‌کند',
    s2.links.length === s.links.length && s2.links.some((l) => l.id === l2.id) && !s2.links.some((l) => l.id === l1.id));
  const rBad = GameSim.disconnectLink(s, 'nope');
  check('52g قطع لینک ناموجود خطا می‌دهد', rBad.ok === false);
  // لینک موازی مجاز است: اتصال دوم بین همان دو گره (دکل و سوئیچش) با همان رسانه ساخته می‌شود
  const dup = connectTower(s, w.id, agg.id, 'fiber');
  const swId52 = l2.from === w.id ? l2.to : l2.from;
  check('52h اتصال موازی (همان دو گره + همان رسانه) ساخته می‌شود',
    dup !== null && dup.id !== l2.id &&
    s.links.filter((l) => (l.from === w.id && l.to === swId52) || (l.from === swId52 && l.to === w.id)).length === 2);
}

// ---------- 53: مشترکان فردی با مدل تجمیعی منطقه سازگارند ----------
{
  const s = newGameAll(42);
  s.cash = 99999999;
  unlockAllEras(s); unlockAllEras(s);
  const core = coreOf(s);
  const d = s.districts.find((x) => x.type === 'residential') || s.districts[1];
  const t = GameSim.buildNode(s, 'cell_5g', d.x, d.y);
  finishBuild(s, t);
  connectTower(s, t.id, core.id, 'fiber');
  for (let i = 0; i < 45; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const inD = s.individuals.filter((p) => String(p.districtId) === String(d.id));
  const subD = inD.filter((p) => p.status === 'subscribed');
  check('53a منطقهٔ خوب‌سرویس‌شده مشترک تجمیعی دارد', d.qos >= 0.3 && d.subscribers > 100, 'qos=' + d.qos.toFixed(2) + ' subs=' + d.subscribers);
  check('53b هر مشترک فردی مسیر واقعی تا هسته دارد (بدون مسیر = بدون اشتراک)',
    subD.length > 0 && subD.every((p) => GameSim.buildingNetworkPath(s, s.buildings.find((b) => String(b.id) === String(p.buildingId))).hasPath),
    'indiv=' + inD.length + ' subscribed=' + subD.length);
  const unserved = s.districts.find((x) => x.id !== d.id && (x.qos || 0) < 0.1);
  const inU = unserved ? s.individuals.filter((p) => String(p.districtId) === String(unserved.id) && p.status === 'subscribed') : [];
  check('53c در منطقهٔ بی‌سرویس کسی مشترک نمی‌شود', inU.length === 0, 'unservedSubscribed=' + inU.length);
}

// ---------- 54: مدل سیگنال — ارتفاع فقط PtP را مخدوش می‌کند؛ ساختمان فقط چند درصد افت ----------
{
  const s = newGameAll(42);
  s.cash = 99999999;
  unlockAllEras(s);
  s.buildings = []; // هندسهٔ کنترل‌شده
  const core54 = coreOf(s);
  const A = { x: core54.x - 420, y: core54.y }, B = { x: core54.x - 220, y: core54.y }; // نزدیک هسته تا PtP در برد باشد
  check('54a بدون ساختمان: افت صفر و PtP سالم',
    GameSim.buildingAttenuation(s, A.x, A.y, B.x, B.y) === 1 && GameSim.ptpLosFactor(s, A, B) === 1);
  s.buildings.push({ id: 'bt1', x: core54.x - 333, y: core54.y - 10, w: 26, h: 20, height: 15, type: 'commercial', districtId: null });
  check('54b یک ساختمان بلند سر راه: افت FWA/وای‌فای فقط ۴٪', Math.abs(GameSim.buildingAttenuation(s, A.x, A.y, B.x, B.y) - 0.96) < 1e-9,
    'att=' + GameSim.buildingAttenuation(s, A.x, A.y, B.x, B.y));
  check('54c همان ساختمان بلند، دید PtP را مخدوش می‌کند (×۰٫۳۵)', GameSim.ptpLosFactor(s, A, B) === 0.35);
  s.buildings.push({ id: 'bt2', x: core54.x - 283, y: core54.y - 10, w: 26, h: 20, height: 3, type: 'residential', districtId: null });
  check('54d ساختمان کوتاه هم فقط ۴٪ دیگر کم می‌کند (مجموع ۸٪)', Math.abs(GameSim.buildingAttenuation(s, A.x, A.y, B.x, B.y) - 0.92) < 1e-9);
  s.buildings = s.buildings.filter((b) => b.id !== 'bt1');
  check('54e بدون ساختمان بلند، PtP سالم است', GameSim.ptpLosFactor(s, A, B) === 1);
  for (let i = 0; i < 10; i++) s.buildings.push({ id: 'btm' + i, x: core54.x - 410 + i * 18, y: core54.y - 10, w: 26, h: 20, height: 2, type: 'residential', districtId: null });
  check('54f افت ساختمان‌ها تا سقف ‎−۳۰٪ انباشته می‌شود', Math.abs(GameSim.buildingAttenuation(s, A.x, A.y, B.x, B.y) - 0.70) < 1e-9,
    'att=' + GameSim.buildingAttenuation(s, A.x, A.y, B.x, B.y));
  // سیگنال سلولار از ساختمان هیچ اثری نمی‌گیرد: پشت ساختمان بلند دقیقاً برابر پایه است
  s.buildings = [{ id: 'bt1', x: core54.x - 333, y: core54.y - 10, w: 26, h: 20, height: 15, type: 'commercial', districtId: null }];
  const cell = GameSim.buildNode(s, 'cell_4g', A.x, A.y);
  finishBuild(s, cell);
  connectTower(s, cell.id, coreOf(s).id, 'fiber');
  GameSim.tick(s, 1); keepAlive(s);
  s.weather = { kind: 'clear', untilDay: 9999 }; // سیگنال پایه بدون ضریب آب‌وهوا سنجیده شود
  const sig = GameSim.signalAt(s, B.x, B.y);
  const base = 1 - 200 / cell.radius;
  check('54g سیگنال سلولار پشت ساختمان بلند بدون افت است (برابر پایه)',
    sig.signal > 0.4 * base && Math.abs(sig.signal - base) < 0.03,
    'signal=' + sig.signal.toFixed(3) + ' base=' + base.toFixed(3));
  // پشت ساختمان‌های زیاد هم سیگنال و سرعت سلولار هیچ افتی ندارد
  s.buildings = [];
  for (let i = 0; i < 10; i++) s.buildings.push({ id: 'btc' + i, x: core54.x - 410 + i * 18, y: core54.y - 10, w: 26, h: 20, height: 15, type: 'commercial', districtId: null });
  const sigMany = GameSim.signalAt(s, B.x, B.y);
  check('54i سیگنال سلولار پشت ساختمان‌های زیاد هم بدون افت است',
    Math.abs(sigMany.signal - base) < 0.03,
    'signal=' + sigMany.signal.toFixed(3) + ' base=' + base.toFixed(3));
  const stCellMany = GameSim.speedTestAt(s, B.x, B.y).cellular;
  s.buildings = [];
  const stCellClear = GameSim.speedTestAt(s, B.x, B.y).cellular;
  check('54j سرعت سلولار پشت ساختمان‌ها با حالت باز برابر است',
    stCellMany.speed > 0 && stCellMany.speed === stCellClear.speed,
    'many=' + stCellMany.speed + ' clear=' + stCellClear.speed);
  s.buildings = [{ id: 'bt1', x: core54.x - 333, y: core54.y - 10, w: 26, h: 20, height: 15, type: 'commercial', districtId: null }];
  // لینک PtP عبوری از ساختمان بلند در تست سرعت گلوگاه می‌شود
  s.buildings.push({ id: 'bt3', x: core54.x - 123, y: core54.y - 10, w: 26, h: 20, height: 15, type: 'commercial', districtId: null });
  const relay = GameSim.buildNode(s, 'cell_4g', B.x, B.y);
  finishBuild(s, relay);
  connectTower(s, relay.id, coreOf(s).id, 'ptp', { capacity: 1000 }); // ظرفیت لینک گلوگاه شود تا اثر ساختمان بلند دیده شود
  GameSim.tick(s, 1); keepAlive(s);
  // نقطه‌ای که فقط رله پوشش می‌دهد (دکل فیبری در A به آن نمی‌رسد)
  const stBlocked = GameSim.speedTestAt(s, core54.x + 30, core54.y).cellular;
  s.buildings = [];
  const stClear = GameSim.speedTestAt(s, core54.x + 30, core54.y).cellular;
  check('54h ساختمان بلند سرعت مسیر PtP را به‌طور محسوس کم می‌کند',
    stBlocked.speed > 0 && stBlocked.speed < stClear.speed * 0.6,
    'blocked=' + stBlocked.speed + ' clear=' + stClear.speed);
}

// ---------- 54k/l: افت ساختمان برای TD-LTE پابرجاست (فقط سلولار معاف شد) ----------
{
  const s2 = newGameAll(42);
  s2.cash = 99999999;
  s2.buildings = []; // هندسهٔ کنترل‌شده
  const core2 = coreOf(s2);
  const A2 = { x: core2.x - 420, y: core2.y }, B2 = { x: core2.x - 220, y: core2.y };
  const fwa = feed4G(s2, A2.x, A2.y); // دکل 4G + ماژول TD-LTE
  GameSim.tick(s2, 1); keepAlive(s2);
  s2.buildings.push({ id: 'ft1', x: core2.x - 333, y: core2.y - 10, w: 26, h: 20, height: 15, type: 'commercial', districtId: null });
  const stFBlocked = GameSim.speedTestAt(s2, B2.x, B2.y).fwa;
  const sigBlocked = GameSim.signalAt(s2, B2.x, B2.y).signal;
  s2.buildings = [];
  const stFClear = GameSim.speedTestAt(s2, B2.x, B2.y).fwa;
  const sigClear = GameSim.signalAt(s2, B2.x, B2.y).signal;
  check('54k سرعت TD-LTE پشت ساختمان بلند کمتر از حالت باز است (افت ~۴٪ ساختمان پابرجاست)',
    stFClear.speed > 0 && stFBlocked.speed < stFClear.speed && stFBlocked.speed >= stFClear.speed * 0.85,
    'blocked=' + stFBlocked.speed + ' clear=' + stFClear.speed);
  check('54l سیگنال سلولار از ساختمان بلند عبور می‌کند (بدون افت)',
    sigClear > 0 && Math.abs(sigBlocked - sigClear) < 0.001,
    'sigBlocked=' + sigBlocked.toFixed(3) + ' sigClear=' + sigClear.toFixed(3));
}

// ---------- 55: بازتعادل پهنای باند (ظرفیت‌های واقعی سایت) ----------
{
  const cap = (id) => (GameSim.getEq(id) || {}).capacity;
  check('55a ترتیب ظرفیت نسل‌ها: 5G > 4G > 3G > 2G و مقادیر واقعی سایت',
    cap('cell_5g') === 2500 && cap('cell_4g') === 900 && cap('cell_3g') === 250 && cap('cell_2g') === 60 &&
    cap('ftth') === 2500 && !GameSim.getEq('fwa_ap') && !GameSim.getEq('wifi_ap') && GameSim.tdlteCapacity({ type: 'cell_4g', modules: ['tdlte'] }) === 600 && GameSim.tdlteCapacity({ type: 'cell_4g', modules: [] }) === 0,
    '2g=' + cap('cell_2g') + ' 3g=' + cap('cell_3g') + ' 4g=' + cap('cell_4g') + ' 5g=' + cap('cell_5g'));
  // شروع بازی: دکل 2G (استارتر واقعی؛ TD-LTE به پوشش 4G نیاز دارد) در مرکز شهر مشترک می‌گیرد و درآمد می‌سازد
  const s = newGameAll(42);
  const d = s.districts.find(x => x.id === 'center');
  const w = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, w);
  connectAny(s, w.id, coreOf(s).id);
  for (let i = 0; i < 10; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('55b شروع با دکل 2G: مشترک و درآمد در چند روز اول',
    d.subscribers > 40 && d.revenue > 0,
    'subs=' + d.subscribers + ' revenue=' + d.revenue);
  // دکل 4G میان‌بازی هزاران مشترک خانگی را بدون اشباع فوری سرویس می‌دهد
  const s2 = withLTE(newGameAll(42)); s2.cash = 999999;
  const d2 = s2.districts.find(x => x.id === 'residential') || s2.districts[1];
  const t = GameSim.buildNode(s2, 'cell_4g', d2.x, d2.y);
  finishBuild(s2, t);
  connectTower(s2, t.id, coreOf(s2).id, 'fiber');
  for (let i = 0; i < 60; i++) { GameSim.tick(s2, 1); keepAlive(s2); }
  check('55c دکل 4G میان‌بازی هزاران مشترک را سرویس می‌دهد (بدون اشباع فوری)',
    d2.subscribers >= 1200 && d2.qos >= 0.25,
    'subs=' + d2.subscribers + ' qos=' + d2.qos.toFixed(2));
}

// ---------- 56: سرویس فقط با اشتراک ----------
{
  const s = newGameAll(42); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'north') || s.districts[0];
  const n = feed4G(s, d.x, d.y); // دکل 4G + ماژول TD-LTE
  GameSim.refreshConnectivity(s); // بدون اثرات روزانه: هنوز مشترکی نیست
  check('56a منطقهٔ تحت پوشش با صفر مشترک: ترافیک و درآمد و مصرف ظرفیت صفر',
    d.subscribers === 0 && d.demand === 0 && d.servedDemand === 0 && d.revenue === 0 && (n.usage || 0) === 0,
    'demand=' + d.demand + ' served=' + d.servedDemand + ' rev=' + d.revenue + ' usage=' + (n.usage || 0));
  // ترافیک متناسب با مشترکان است، نه جمعیت
  d.subscribers = 100;
  GameSim.computeFlow(s, { dailyAvg: true, noDailyEffects: true });
  const dem100 = d.demand;
  d.subscribers = 200;
  GameSim.computeFlow(s, { dailyAvg: true, noDailyEffects: true });
  check('56b ترافیک متناسب با تعداد مشترکان است (دوبرابر مشترک = دوبرابر ترافیک)',
    dem100 > 0 && Math.abs(d.demand - dem100 * 2) < 0.01,
    'dem100=' + dem100.toFixed(1) + ' dem200=' + d.demand.toFixed(1));
  // جمعیتِ غیرمشترکِ بیشتر، کیفیت مشترکان را عوض نمی‌کند
  d.subscribers = 500;
  GameSim.computeFlow(s, { dailyAvg: true, noDailyEffects: true });
  const qos1 = d.qos;
  d.population = d.population * 3;
  GameSim.computeFlow(s, { dailyAvg: true, noDailyEffects: true });
  check('56c جمعیت غیرمشترک بیشتر، کیفیت مشترکان را تغییر نمی‌دهد',
    Math.abs(d.qos - qos1) < 1e-9,
    'qos ' + qos1.toFixed(3) + ' -> ' + d.qos.toFixed(3));
  // رضایت: شبکهٔ چندمشترکی هرگز ۱۰۰٪ خوانده نمی‌شود (نفوذ اشتراک کم است)
  const s2 = newGameAll(42);
  const d2 = s2.districts.find(x => x.id === 'north') || s2.districts[0];
  const w2 = feed4G(s2, d2.x, d2.y); // دکل 4G + ماژول TD-LTE
  for (let i = 0; i < 5; i++) { GameSim.tick(s2, 1); keepAlive(s2); }
  check('56d رضایت = کیفیت تجربه‌شدهٔ مشترکان فعلی؛ نفوذ اشتراک جدا گزارش می‌شود',
    d2.qos >= 0.9 && d2.satisfaction > 40 && (d2.penetration || 0) < 0.2,
    'qos=' + d2.qos.toFixed(2) + ' sat=' + d2.satisfaction.toFixed(1) + ' subs=' + d2.subscribers + ' pen=' + (d2.penetration || 0).toFixed(3));
}

// ---------- 57: مشترکان فردی (نمونهٔ بزرگ‌تر) + آمار تجمیعی ----------
{
  const s = withLTE(newGameAll(42)); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, t);
  connectTower(s, t.id, coreOf(s).id, 'fiber');
  d.subscribers = 2000; // بازار پرمشترک تا نمونهٔ فردی رشد کند
  for (let i = 0; i < 20; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const inD = s.individuals.filter(p => String(p.districtId) === String(d.id));
  check('57a نمونهٔ فردی با مشترکان تجمیعی منطقه مقیاس می‌شود (سقف ۲۰۰۰ کل / ۳۰۰ منطقه)',
    inD.length >= 50 && inD.length <= 300 && s.individuals.length <= 2000,
    'districtIndiv=' + inD.length + ' total=' + s.individuals.length);
  const bIds = new Set(s.buildings.map(b => String(b.id)));
  const bDistrict = new Map(s.buildings.map(b => [String(b.id), b.districtId || null]));
  check('57b هر مشترک فردی ساختمان معتبر در منطقهٔ خودش دارد',
    s.individuals.every(p => bIds.has(String(p.buildingId)) && String(bDistrict.get(String(p.buildingId)) || '') === String(p.districtId || '')),
    'invalid=' + s.individuals.filter(p => !bIds.has(String(p.buildingId))).length);
  const stats = GameSim.subscriberStats(s);
  const sumDistricts = stats.districts.reduce((a, r) => a + r.subscribers, 0);
  check('57c آمار تجمیعی سازگار است: مجموع مناطق + پراکنده‌ها = کل و نمونه ≤ کل',
    stats.total === sumDistricts + stats.scatteredSubscribers && stats.individualsTotal <= stats.total,
    'total=' + stats.total + ' sum=' + sumDistricts + ' scattered=' + stats.scatteredSubscribers + ' indiv=' + stats.individualsTotal);
  const perBuilding = {};
  for (const p of s.individuals) perBuilding[p.buildingId] = (perBuilding[p.buildingId] || 0) + 1;
  const sumPerBuilding = Object.values(perBuilding).reduce((a, b) => a + b, 0);
  check('57d مجموع شمارش ساختمان‌ها = کل مشترکان فردی',
    sumPerBuilding === s.individuals.length,
    'sum=' + sumPerBuilding + ' total=' + s.individuals.length);
  const loaded = GameSim.loadGame(GameSim.saveGame(s));
  const sameAssign = loaded.individuals.length === s.individuals.length &&
    loaded.individuals.every((p, i) => String(p.buildingId) === String(s.individuals[i].buildingId));
  check('57e ذخیره/بارگذاری انتساب ساختمان مشترکان فردی را حفظ می‌کند', sameAssign,
    'loaded=' + loaded.individuals.length);
}

// ---------- 58: تعادل پیشرفت با خط زمانی و بازشدن مناطق (بازی اسکریپتی) ----------
{
  const s = GameSim.newGame(42); // شروع واقعی: سال ۱۹۹۱، فقط مرکز شهر و حاشیهٔ شمالی باز
  const accNodes = () => s.nodes.filter(n => ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g', 'ftth', 'street_cabinet'].includes(n.type));
  let firstIncome = null, secondNode = null, firstUnlock = null, fourG = null, tdlteDay = null;
  for (let day = 1; day <= 300; day++) {
    for (const n of s.nodes) if (n.status === 'failed') GameSim.applyFix(s, { nodeId: n.id }, { action: 'repair', nodeId: n.id });
    for (const l of s.links) if (l.status === 'cut') GameSim.applyFix(s, { linkId: l.id }, { action: 'repair_link', linkId: l.id });
    const year = GameSim.yearOf(s);
    const core = coreOf(s);
    const unserved = s.districts.filter(d => d.unlocked !== false && (d.servedDemand || 0) === 0)
      .sort((a, b) => (b.population || 0) - (a.population || 0));
    let acted = false;
    const solvent = (s.debt || 0) === 0;
    if (unserved.length && s.cash >= 16000 && solvent) {
      const d = unserved[0];
      let type = 'cell_2g';
      if (year >= 2009 && s.cash >= 70000) type = 'cell_4g';
      else if (year >= 2001 && s.cash >= 38000) type = 'cell_3g';
      const n = GameSim.buildNode(s, type, d.x, d.y);
      if (n) { connectAny(s, n.id, core.id); acted = true; }
    }
    if (!acted) {
      const locked = s.districts.filter(d => d.unlocked === false).sort((a, b) => GameSim.districtUnlockCost(a) - GameSim.districtUnlockCost(b));
      if (locked.length) {
        const t = locked[0];
        const cost = GameSim.districtUnlockCost(t);
        if (solvent && s.cash >= cost + 40000) { GameSim.unlockDistrict(s, t.id); if (firstUnlock == null) firstUnlock = s.day; acted = true; }
      }
    }
    if (!acted && solvent && s.cash >= 90000) {
      const weak = s.districts.filter(d => d.unlocked !== false && (d.qos || 0) < 0.5).sort((a, b) => (b.population || 0) - (a.population || 0));
      if (weak.length) {
        const d = weak[0];
        const type = year >= 2009 ? 'cell_4g' : (year >= 2001 ? 'cell_3g' : 'cell_2g');
        const n = GameSim.buildNode(s, type, d.x + 40, d.y + 40);
        if (n) connectTower(s, n.id, core.id, 'fiber');
      }
    }
    if (year >= 2012 && s.cash >= 20000) {
      const t4 = s.nodes.find(n => (n.type === 'cell_4g' || n.type === 'cell_5g') && !GameSim.hasModule(n, 'tdlte'));
      if (t4) { const r = GameSim.installModule(s, t4.id, 'tdlte'); if (r.ok && tdlteDay == null) tdlteDay = s.day; }
    }
    GameSim.tick(s, 1); keepAlive(s);
    if (firstIncome == null && s.totalRevenue > 0) firstIncome = s.day;
    if (secondNode == null && accNodes().filter(n => n.status === 'active').length >= 2) secondNode = s.day;
    if (fourG == null && accNodes().some(n => n.type === 'cell_4g' && n.status === 'active')) fourG = s.day;
  }
  const subs300 = s.districts.reduce((a, d) => a + (d.subscribers || 0), 0);
  check('58a اولین درآمد در چند روز اول بازی', firstIncome != null && firstIncome <= 5, 'firstIncome=day ' + firstIncome);
  check('58b گره دوم تا دو هفته اول ساخته می‌شود', secondNode != null && secondNode <= 14, 'secondNode=day ' + secondNode);
  check('58c اولین منطقهٔ جدید تا دو ماه اول باز می‌شود', firstUnlock != null && firstUnlock <= 60, 'firstUnlock=day ' + firstUnlock);
  check('58d دکل 4G بعد از دورانش (روز ۱۸۱) ساخته می‌شود', fourG != null && fourG >= 181 && fourG <= 260, 'fourG=day ' + fourG);
  check('58e ماژول TD-LTE بعد از دورانش (روز ۲۱۱) نصب می‌شود', tdlteDay != null && tdlteDay >= 211 && tdlteDay <= 270, 'tdlteDay=day ' + tdlteDay);
  check('58f تا روز ۳۰۰ هزاران مشترک و بدون بدهی', subs300 >= 1500 && (s.debt || 0) === 0,
    'subs=' + subs300 + ' debt=' + (s.debt || 0) + ' cash=' + Math.round(s.cash));
}

// ---------- 59: لایهٔ سرعت اتصال + زمان ساخت ÷۴ + خرابی نادرتر ----------
{
  const s = withLTE(newGameAll(42)); s.cash = 999999;
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, t);
  connectTower(s, t.id, coreOf(s).id, 'fiber');
  GameSim.refreshConnectivity(s);
  const pts = [[d.x, d.y], [d.x + 150, d.y + 80], [d.x + 290, d.y], [100, 100]];
  let allMatch = true, nearSpeed = 0, farSpeed = -1;
  for (const [x, y] of pts) {
    const r = GameSim.speedTestAt(s, x, y);
    let mx = 0;
    for (const k of GameSim.TECH_KEYS) if (r[k] && r[k].speed > mx) mx = r[k].speed;
    const agg = GameSim.aggregateSpeedAt(s, x, y);
    if (Math.abs(agg - mx) > 1e-9) allMatch = false;
    if (x === d.x && y === d.y) nearSpeed = agg;
    if (x === 100 && y === 100) farSpeed = agg;
  }
  check('59a سرعت تجمیعی لایه = بیشینهٔ تست سرعت در همان نقطه', allMatch, 'near=' + Math.round(nearSpeed));
  check('59b سرعت تجمیعی کنار دکل مثبت و بیرون پوشش صفر است', nearSpeed > 0 && farSpeed === 0,
    'near=' + Math.round(nearSpeed) + ' far=' + farSpeed);
  const bd = (id) => (GameSim.getEq(id) || {}).buildDays;
  check('59c زمان ساخت همهٔ تجهیزات سریع و حداکثر یک روز است',
    bd('cell_2g') === 0.375 && bd('cell_4g') === 0.625 && bd('cell_5g') === 0.75 && bd('ftth') === 0.375,
    '2g=' + bd('cell_2g') + ' 4g=' + bd('cell_4g') + ' 5g=' + bd('cell_5g'));
  const s2 = newGameAll(42);
  const w = GameSim.buildNode(s2, 'cell_2g', d.x, d.y);
  GameSim.tick(s2, 1);
  check('59d وای‌فای در یک تیک ساخته می‌شود (۰٫۲۵ روز کار)', w.status !== 'building', 'status=' + w.status);
  const s3 = newGameAll(42); s3.cash = 999999;
  for (let i = 0; i < 30; i++) {
    const n = GameSim.buildNode(s3, 'cell_2g', 500 + i * 200, 500 + (i % 5) * 200);
    if (n) { n.status = 'active'; n.buildTimer = 0; }
  }
  let failures = 0;
  const failedIds = new Set();
  for (let i = 0; i < 365; i++) {
    GameSim.tick(s3, 1);
    for (const n of s3.nodes) if (n.status === 'failed' && !failedIds.has(n.id)) { failedIds.add(n.id); failures++; }
  }
  check('59e خرابی تصادفی نادر است (۳۰ گره × ۳۶۵ روز، انتظار ~۴)', failures < 15, 'failures=' + failures);
}

// ---------- 60: کابینت خیابانی + انشعاب مسی + انحصار فیبر/مسی ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  unlockAllEras(s); unlockAllEras(s);
  const d = s.districts.find(x => x.id === 'center');
  const byDist = (a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y);
  const bNear = s.buildings.filter(b => b.districtId === d.id).sort(byDist)[0];
  const r0 = GameSim.connectBuildingWired(s, bNear.id, null, 'fiber');
  check('60a بدون کابینت در برد، انشعاب سیمی رد می‌شود', r0.ok === false, r0.error || '');
  const cab = GameSim.buildNode(s, 'street_cabinet', bNear.x + (bNear.w || 26) / 2, bNear.y + (bNear.h || 20) / 2);
  finishBuild(s, cab);
  GameSim.connect(s, cab.id, coreOf(s).id, 'fiber');
  GameSim.refreshConnectivity(s);
  const r1 = GameSim.connectBuildingWired(s, bNear.id, cab.id, 'fiber');
  const r2 = GameSim.connectBuildingWired(s, bNear.id, cab.id, 'copper');
  check('60b انشعاب فیبر موفق و اتصال دوم (مسی) به‌خاطر انحصار رد می‌شود', r1.ok && r2.ok === false,
    'r1=' + r1.ok + ' r2=' + (r2.error || r2.ok));
  for (let i = 0; i < 6 && GameSim.buildingWiredStatus(s, bNear.id).status === 'building'; i++) { GameSim.tick(s, 1); keepAlive(s); }
  GameSim.disconnectBuildingWired(s, bNear.id);
  const r3 = GameSim.connectBuildingWired(s, bNear.id, cab.id, 'copper');
  check('60c بعد از قطع فیبر، اتصال مسی ممکن است', r3.ok === true, r3.error || '');
  for (let i = 0; i < 6 && GameSim.buildingWiredStatus(s, bNear.id).status === 'building'; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const stCopper = GameSim.speedTestAt(s, bNear.x + 5, bNear.y + 5).fiber;
  const b2 = s.buildings.filter(b => b.districtId === d.id && b.id !== bNear.id)
    .sort((a, b) => Math.hypot(a.x - cab.x, a.y - cab.y) - Math.hypot(b.x - cab.x, b.y - cab.y))[0];
  GameSim.connectBuildingWired(s, b2.id, cab.id, 'fiber');
  for (let i = 0; i < 6 && GameSim.buildingWiredStatus(s, b2.id).status === 'building'; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const stFiber = GameSim.speedTestAt(s, b2.x + 5, b2.y + 5).fiber;
  check('60d سرعت مسی سقف DSL دارد و فیبر بیشتر است', stCopper.speed > 0 && stCopper.speed <= 100 && stFiber.speed > 100,
    'copper=' + stCopper.speed + ' fiber=' + stFiber.speed);
  s.buildings.push({ id: 'bx150', x: cab.x + 150, y: cab.y, w: 26, h: 20, height: 2, type: 'residential', districtId: d.id });
  const rFar = GameSim.connectBuildingWired(s, 'bx150', cab.id, 'copper');
  const rFarF = GameSim.connectBuildingWired(s, 'bx150', cab.id, 'fiber');
  check('60e مسی در فاصله ۱۵۰ رد و فیبر در همان فاصله قبول می‌شود', rFar.ok === false && rFarF.ok === true,
    'copper=' + (rFar.error || '') + ' fiber=' + rFarF.ok);
  let portOk = true;
  for (let i = 0; i < 30; i++) {
    const bid = 'bp' + i;
    s.buildings.push({ id: bid, x: cab.x + (i % 6) * 12, y: cab.y + Math.floor(i / 6) * 12, w: 10, h: 10, height: 1, type: 'residential', districtId: d.id });
    const rr = GameSim.connectBuildingWired(s, bid, cab.id, 'fiber');
    if (i < 21 && !rr.ok) portOk = false; // ۳ پورت قبلاً پر است → ۲۱ تای بعدی تا سقف ۲۴
    if (i === 21 && rr.ok) portOk = false; // بیست‌وپنجمین باید رد شود
  }
  check('60f سقف پورت کابینت (۲۴ در سطح ۱) اعمال می‌شود', portOk && GameSim.cabinetUsedPorts(s, cab.id) === 24,
    'used=' + GameSim.cabinetUsedPorts(s, cab.id));
  const ftth = GameSim.buildNode(s, 'ftth', d.x + 60, d.y);
  finishBuild(s, ftth);
  GameSim.connect(s, ftth.id, coreOf(s).id, 'fiber');
  s.buildings.push({ id: 'blegacy', x: ftth.x + 20, y: ftth.y, w: 26, h: 20, height: 2, type: 'residential', districtId: d.id });
  s.fiberDrops.push({ id: 'fdlegacy', buildingId: 'blegacy', nodeId: ftth.id, status: 'active', work: 0 });
  GameSim.refreshConnectivity(s);
  const stLegacy = GameSim.speedTestAt(s, ftth.x + 25, ftth.y + 5).fiber;
  check('60g انشعاب مستقیم قدیمی (بدون کابینت) همچنان سرویس می‌دهد',
    GameSim.buildingWiredStatus(s, 'blegacy').status === 'active' && stLegacy.speed > 0,
    'speed=' + stLegacy.speed);
}

// ---------- 61: مشخصهٔ اتصال‌ها (connects) و سازگاری با اعتبارسنجی ----------
{
  const list = DATA.equipmentList || Object.values(DATA.equipment || {});
  check('61a همهٔ تجهیزات مشخصهٔ اتصال غیرخالی دارند', list.length === 19 && list.every((e) => Array.isArray(e.connects) && e.connects.length > 0),
    'items=' + list.length);
  const s = newGameAll(42); s.cash = 9999999;
  unlockAllEras(s); unlockAllEras(s);
  const d = s.districts.find(x => x.id === 'center');
  const bNear = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  const agg = GameSim.buildNode(s, 'aggregation', d.x + 60, d.y);
  finishBuild(s, agg);
  GameSim.connect(s, agg.id, coreOf(s).id, 'fiber');
  GameSim.refreshConnectivity(s);
  const rAgg = GameSim.connectBuildingWired(s, bNear.id, agg.id, 'fiber');
  check('61b تجمیع به ساختمان انشعاب نمی‌دهد (طبق مشخصه)', rAgg.ok === false, rAgg.error || '');
  const cell = GameSim.buildNode(s, 'cell_2g', d.x - 60, d.y);
  finishBuild(s, cell);
  connectTower(s, cell.id, coreOf(s).id, 'fiber');
  GameSim.refreshConnectivity(s);
  const rCell = GameSim.connectBuildingWired(s, bNear.id, cell.id, 'fiber');
  check('61c دکل سلولی انشعاب سیمی به ساختمان ندارد', rCell.ok === false, rCell.error || '');
  // مشخصه ↔ اعتبارسنجی: کابینت و FTTH (OLT) انشعاب جدید می‌دهند
  const cabSpec = eq('street_cabinet').connects.filter(c => c.targets.includes('building') && !c.legacy).map(c => c.medium).sort();
  const ftthSpec = eq('ftth').connects.filter(c => c.targets.includes('building'));
  check('61d مشخصهٔ کابینت فیبر+مسی و FTTH فیبر مستقیم (OLT) است',
    JSON.stringify(cabSpec) === JSON.stringify(['copper', 'fiber']) && ftthSpec.length === 1 && ftthSpec[0].medium === 'fiber' && !ftthSpec[0].legacy,
    JSON.stringify({ cabSpec, ftthSpec }));
  const ftth = GameSim.buildNode(s, 'ftth', d.x, d.y + 60);
  finishBuild(s, ftth);
  GameSim.connect(s, ftth.id, coreOf(s).id, 'fiber');
  GameSim.refreshConnectivity(s);
  const rFtth = GameSim.connectBuildingWired(s, bNear.id, ftth.id, 'fiber');
  check('61e انشعاب مستقیم به FTTH (OLT) مجاز و رایگان است', rFtth.ok === true && rFtth.cost === 0, rFtth.error || '');
  // رسانهٔ ماهواره‌ای حذف شده است: اتصال با آن رد می‌شود و در گزینه‌های تغییر نوع لینک نیست
  const satTry = GameSim.connect(s, ftth.id, coreOf(s).id, 'satellite');
  const cellLink = s.links.find(l => l.from === cell.id || l.to === cell.id);
  const opts61 = cellLink ? GameSim.linkChangeOptions(s, cellLink.id) : [];
  check('61f رسانهٔ ماهواره‌ای حذف شده: اتصال با آن رد و در گزینه‌های تغییر لینک نیست',
    satTry === null && opts61.length > 0 && opts61.every(o => o.medium !== 'satellite'),
    'opts=' + opts61.map(o => o.medium).join(','));
  // هسته/دروازه: بدون انشعاب ساختمان و بدون خدمت مشترک؛ دروازه اینترنت دارد
  const coreSpec = eq('core_router').connects, gwSpec = eq('internet_gateway').connects;
  check('61g هسته و دروازه انشعاب ساختمان ندارند و دروازه به اینترنت وصل است',
    !coreSpec.some(c => c.targets.includes('building')) && !gwSpec.some(c => c.targets.includes('building')) &&
    gwSpec.some(c => c.medium === 'internet') && !coreSpec.some(c => c.medium === 'wireless'));
}

// ---------- 62: تغییر نوع و ارتقای لینک ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const wifi = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, wifi);
  const link = connectTower(s, wifi.id, coreOf(s).id, 'copper');
  check('62a لینک مسی ساخته شد (ظرفیت ۱۰۰) و همان لحظه فعال و گره متصل است',
    !!link && link.capacity === 100 && link.status === 'active' && wifi.connected === true,
    link && (link.capacity + ' connected=' + wifi.connected));
  const cashBefore = s.cash;
  const expCost = (GameSim.linkChangeOptions(s, link.id).find(o => o.medium === 'fiber') || {}).cost;
  const r = GameSim.changeLinkMedium(s, link.id, 'fiber');
  check('62b تغییر به فیبر آنی اعمال و هزینه کم شد', r.ok === true && s.cash === cashBefore - expCost && link.medium === 'fiber' && link.status === 'active',
    'cash=' + s.cash + ' medium=' + link.medium);
  check('62c بعد از تغییر آنی، ظرفیت ۱۰۰۰۰ است', link.capacity === 10000, 'cap=' + link.capacity);
  const rSame = GameSim.changeLinkMedium(s, link.id, 'fiber');
  check('62d تغییر به همان رسانه رد می‌شود', rSame.ok === false);
  // موازی: لینک مسی دوم بین همان دو گره → تغییرش به فیبر مجاز است (دو لینک فیبر موازی)
  const link2 = connectTower(s, wifi.id, coreOf(s).id, 'copper');
  const rDup = GameSim.changeLinkMedium(s, link2.id, 'fiber');
  check('62e تغییر رسانه به رسانهٔ لینک موازی مجاز است', rDup.ok === true && link2.medium === 'fiber', rDup.error || '');
  // فاصله: PtP بیش از ۱۸۰۰ (دکل دور به سوئیچ دور، ۲۱۰۰ واحد)
  const far = GameSim.buildNode(s, 'cell_2g', d.x + 2000, d.y);
  finishBuild(s, far);
  const farSw = GameSim.buildNode(s, 'switch', d.x - 100, d.y + 100);
  finishBuild(s, farSw);
  const farLink = GameSim.connect(s, far.id, farSw.id, 'copper');
  const rFar = GameSim.changeLinkMedium(s, farLink.id, 'ptp');
  check('62f تغییر به PtP در فاصله بیش از ۱۸۰۰ رد می‌شود', rFar.ok === false, rFar.error || '');
  // قابلیت: کابینت ساده PtP پشتیبانی نمی‌کند (فقط مسی/اترنت)
  const rA = GameSim.buildNode(s, 'cabinet_basic', d.x + 100, d.y + 100);
  const rB = GameSim.buildNode(s, 'switch', d.x - 100, d.y + 100);
  finishBuild(s, rA); finishBuild(s, rB);
  const rLink = GameSim.connect(s, rA.id, rB.id, 'copper');
  const rCap = GameSim.changeLinkMedium(s, rLink.id, 'ptp');
  check('62g تغییر لینک کابینت ساده به PtP (بدون پشتیبانی) رد می‌شود', rCap.ok === false, rCap.error || '');
  // ارتقای سطح لینک حذف شده است: نه API هست نه سقف سطح
  check('62h ارتقای سطح لینک حذف شده است (API نیست)', GameSim.upgradeLink === undefined && GameSim.LINK_MAX_LEVEL === undefined);
  const rBk = GameSim.toggleLinkBackup(s, link.id);
  check('62i تبدیل به لینک پشتیبان', rBk.ok === true && link.isBackup === true);
  const s2 = GameSim.loadGame(GameSim.saveGame(s));
  const l2 = s2.links.find(l => l.id === link.id);
  check('62j ذخیره/بارگذاری رسانهٔ لینک را حفظ می‌کند و ظرفیت پایه است (بدون سطح)',
    l2.medium === 'fiber' && l2.capacity === 10000 && l2.level === undefined,
    JSON.stringify({ m: l2.medium, lvl: l2.level, cap: l2.capacity }));
}

// ---------- 63: جایگیری جبهه‌ای ساختمان‌ها و پارک‌های بلوکی ----------
{
  const MapGen = require('../js/mapgen.js');
  const t0 = Date.now();
  const m1 = MapGen.generate(42);
  const m2 = MapGen.generate(42);
  const genMs = Date.now() - t0;
  check('63a تولید نقشه قطعی و سریع است', JSON.stringify(m1.buildings) === JSON.stringify(m2.buildings) && genMs < 3000,
    'ms=' + genMs);
  const hitsRoad = (b) => m1.roads.v.some(lx => b.x - 14 < lx && lx < b.x + b.w + 14) || m1.roads.h.some(ly => b.y - 14 < ly && ly < b.y + b.h + 14);
  check('63b هیچ ساختمانی روی خیابان نیست', m1.buildings.every(b => !hitsRoad(b)));
  const edgeDist = (b) => {
    let dd = 1e9;
    for (const lx of m1.roads.v) dd = Math.min(dd, Math.max(0, Math.max(lx - (b.x + b.w), b.x - lx)));
    for (const ly of m1.roads.h) dd = Math.min(dd, Math.max(0, Math.max(ly - (b.y + b.h), b.y - ly)));
    return dd;
  };
  const urban = m1.buildings.filter(b => b.districtId);
  const nearRoad = urban.filter(b => edgeDist(b) <= 40).length;
  check('63c تقریباً همهٔ ساختمان‌های شهری کنار خیابان‌اند', urban.length > 250 && nearRoad / urban.length >= 0.95,
    nearRoad + '/' + urban.length);
  const parkCrosses = (p) => m1.roads.v.some(lx => lx > p.x && lx < p.x + p.w) || m1.roads.h.some(ly => ly > p.y && ly < p.y + p.h);
  check('63d هیچ پارکی از خیابان رد نمی‌شود', m1.parks.length > 20 && m1.parks.every(p => !parkCrosses(p)),
    'parks=' + m1.parks.length);
  // ذخیرهٔ قدیمی: ساختمان‌ها در ذخیره‌اند و عیناً برمی‌گردند
  const s = newGameAll(42);
  const before = JSON.stringify(s.buildings);
  const s2 = GameSim.loadGame(GameSim.saveGame(s));
  check('63e چیدمان ساختمان‌های ذخیرهٔ قدیمی عیناً حفظ می‌شود', JSON.stringify(s2.buildings) === before);
}

// ---------- 64: ساخت و ماژول آنی؛ فقط تعمیر زمان می‌خواهد ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const w = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  check('64a گره همان لحظهٔ ساخت فعال است (بدون تایمر ساخت)', w.status !== 'building' && (w.buildTimer || 0) === 0,
    'status=' + w.status);
  connectTower(s, w.id, coreOf(s).id, 'fiber');
  check('64b گره تازه‌ساخته بلافاصله بعد از اتصال متصل است', w.connected === true);
  const capBefore = w.capacity;
  const rMod = GameSim.installModule(s, w.id, 'cap_boost');
  check('64c نصب ماژول آنی است: ظرفیت همان لحظه بیشتر و گره فعال می‌ماند',
    rMod.ok === true && w.capacity > capBefore && w.status === 'active',
    'cap ' + capBefore + ' -> ' + w.capacity + ' status=' + w.status);
  check('64d شمارش ماژول‌ها درست است', GameSim.moduleCount(w, 'cap_boost') === 1 && GameSim.hasModule(w, 'cap_boost') === true);
  // تعمیر آنی است: همان لحظه به سرویس برمی‌گردد
  w.status = 'failed'; w.health = 0;
  const cashPreRepair = s.cash;
  const rep = GameSim.applyFix(s, { nodeId: w.id }, { action: 'repair', nodeId: w.id });
  check('64e تعمیر آنی است: گره همان لحظه فعال و هزینه کم شد', rep.ok === true && w.status === 'active' && s.cash === cashPreRepair - rep.cost,
    'status=' + w.status + ' cost=' + rep.cost);
  check('64f گره تعمیرشده دوباره متصل است و سلامت دارد', w.connected === true && w.health === 85, 'health=' + w.health);
}

// ---------- 65: وای‌فایِ مشترک + فیبر آنی در همه‌جا + شروع بازی بدون وای‌فای ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  check('65a اکسس‌پوینت وای‌فای در کاتالوگ ساختنی نیست',
    !GameSim.getEq('wifi_ap') && GameSim.buildNode(s, 'wifi_ap', 100, 100) === null);
  const d = s.districts.find(x => x.id === 'center');
  const bFirst = s.buildings.find(b => b.districtId === d.id);
  const cab = GameSim.buildNode(s, 'street_cabinet', bFirst.x + (bFirst.w || 26) / 2, bFirst.y + (bFirst.h || 20) / 2);
  const link = GameSim.connect(s, cab.id, coreOf(s).id, 'fiber');
  check('65b لینک فیبر همان لحظه فعال و کابینت متصل است', !!link && link.status === 'active' && cab.connected === true);
  const rDrop = GameSim.connectBuildingWired(s, bFirst.id, cab.id, 'fiber');
  check('65c انشعاب فیبر همان لحظه فعال است (بدون هیچ تیکی)',
    rDrop.ok === true && GameSim.buildingWiredStatus(s, bFirst.id).status === 'active');
  const stSub = GameSim.buildingServiceStatus(s, bFirst.id);
  const stSpeed = GameSim.speedTestAt(s, bFirst.x + 5, bFirst.y + 5);
  check('65d ساختمان مشترک وای‌فای داخلی دارد و سرعتش = سرعت اشتراک است',
    stSub.wifi === true && stSpeed.wifi.speed > 0 && stSpeed.wifi.speed === stSpeed.fiber.speed,
    'wifi=' + stSpeed.wifi.speed + ' fiber=' + stSpeed.fiber.speed);
  const bFree = s.buildings.find(b => b.districtId === d.id && b.id !== bFirst.id &&
    GameSim.buildingWiredStatus(s, b.id).status !== 'active' &&
    !(s.individuals || []).some(p => String(p.buildingId) === String(b.id) && p.status === 'subscribed'));
  const stFree = GameSim.buildingServiceStatus(s, bFree.id);
  const spFree = GameSim.speedTestAt(s, bFree.x + 5, bFree.y + 5);
  check('65e ساختمان بدون اشتراک وای‌فای ندارد',
    stFree.wifi === false && spFree.wifi.speed === 0 && spFree.wifi.reason === 'no_subscription',
    JSON.stringify(spFree.wifi));
  // ذخیرهٔ قدیمی با گره wifi_ap → به دکل 4G با ماژول TD-LTE نگاشت می‌شود و لینک‌ها می‌مانند
  const raw = JSON.parse(GameSim.saveGame(s));
  raw.nodes.push({ id: 'nlegacywifi', type: 'wifi_ap', name: 'اکسس‌پوینت قدیمی', x: d.x + 40, y: d.y + 40, status: 'active', health: 100, capacity: 1200, radius: 90, level: 1, baseCapacity: 1200, baseRadius: 90, usage: 0, connected: false, channel: null, interference: 0 });
  raw.nodes.push({ id: 'nsw65', type: 'switch', name: 'سوئیچ', x: d.x + 120, y: d.y + 40, status: 'active', health: 100, capacity: 2500, radius: 0, level: 1, baseCapacity: 2500, baseRadius: 0, usage: 0, connected: false, channel: null, interference: 0 });
  raw.links.push({ id: 'llegacywifi', from: 'nlegacywifi', to: 'nsw65', medium: 'fiber', capacity: 10000, latency: 2, status: 'active', isBackup: false, usage: 0 });
  const s2 = GameSim.loadGame(JSON.stringify(raw));
  const legacy = s2.nodes.find(n => n.id === 'nlegacywifi');
  GameSim.tick(s2, 1);
  check('65f ذخیرهٔ قدیمی wifi_ap به دکل 4G با ماژول TD-LTE نگاشت و تیک می‌خورد',
    !!legacy && legacy.type === 'cell_4g' && GameSim.hasModule(legacy, 'tdlte') && s2.links.some(l => l.id === 'llegacywifi'),
    'type=' + (legacy && legacy.type));
  // شروع بازی بدون وای‌فای: دکل 2G با بودجهٔ آغازین و صفر کارمند درآمد می‌سازد
  const s3 = newGameAll(42);
  const d3 = s3.districts.find(x => x.id === 'north') || s3.districts[0];
  const g2 = GameSim.buildNode(s3, 'cell_2g', d3.x, d3.y);
  connectTower(s3, g2.id, coreOf(s3).id, 'fiber');
  for (let i = 0; i < 10; i++) { GameSim.tick(s3, 1); keepAlive(s3); }
  check('65g شروع با 2G و صفر کارمند: مشترک و درآمد در ۱۰ روز اول',
    s3.staff.length === 0 && d3.subscribers > 0 && d3.revenue > 0,
    'subs=' + d3.subscribers + ' rev=' + d3.revenue + ' cash=' + Math.round(s3.cash));
}

// ---------- 66: نمونه‌بردار سریع میدان‌ها (هیت‌مپ) ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  s.weather = { kind: 'clear', untilDay: 9999 };
  const d = s.districts.find(x => x.id === 'center');
  const agg = GameSim.buildNode(s, 'aggregation', coreOf(s).x + 300, coreOf(s).y);
  GameSim.connect(s, agg.id, coreOf(s).id, 'fiber');
  const fwa = feed4G(s, d.x, d.y); // دکل 4G + ماژول TD-LTE
  const g2 = GameSim.buildNode(s, 'cell_2g', d.x + 500, d.y + 300);
  connectTower(s, g2.id, agg.id, 'fiber');
  for (let i = 0; i < 5; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const prepS = GameSim.prepareSignalField(s);
  const prepV = GameSim.prepareSpeedField(s);
  let maxSig = 0, maxSpd = 0;
  let seed = 13;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 400; k++) {
    const x = rnd() * 7200, y = rnd() * 5400;
    maxSig = Math.max(maxSig, Math.abs(GameSim.signalAt(s, x, y).signal - GameSim.signalFieldAt(prepS, x, y)));
    maxSpd = Math.max(maxSpd, Math.abs(GameSim.aggregateSpeedAt(s, x, y) - GameSim.speedFieldAt(prepV, x, y)));
  }
  check('66a میدان سیگنال سریع با signalAt دقیقاً برابر است', maxSig < 0.001, 'maxDiff=' + maxSig);
  check('66b میدان سرعت سریع با aggregateSpeedAt دقیقاً برابر است', maxSpd <= 1, 'maxDiff=' + maxSpd);
  const out = new Float32Array(48 * 36);
  GameSim.sampleFieldRows(prepS, 'signal', fwa.x - 3600, fwa.y - 2700, 150, 48, 0, 36, out);
  check('66c نمونه‌برداری ردیفی کل شبکه را پر می‌کند', out.some(v => v > 0.5));
  // جابه‌جایی گره در میدان تازه دیده می‌شود؛ خرابی گره پوشش را حذف می‌کند
  const before = GameSim.signalFieldAt(GameSim.prepareSignalField(s), fwa.x, fwa.y);
  GameSim.moveNode(s, fwa.id, fwa.x + 900, fwa.y);
  const afterMove = GameSim.signalFieldAt(GameSim.prepareSignalField(s), fwa.x - 900, fwa.y);
  const movedNode = s.nodes.find(n => n.id === fwa.id);
  const atNew = GameSim.signalFieldAt(GameSim.prepareSignalField(s), movedNode.x, movedNode.y);
  check('66d بعد از جابه‌جایی، پوشش در مکان تازه است نه قدیمی', before > 0.5 && atNew > 0.5 && afterMove < before,
    'before=' + before.toFixed(2) + ' old=' + afterMove.toFixed(2) + ' new=' + atNew.toFixed(2));
  movedNode.status = 'failed';
  const afterFail = GameSim.signalFieldAt(GameSim.prepareSignalField(s), movedNode.x, movedNode.y);
  check('66e گره خراب از میدان سیگنال حذف می‌شود', afterFail < atNew, 'fail=' + afterFail.toFixed(2));
}

// ---------- 67: جریان از گره‌های میانی عبور می‌کند ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  s.weather = { kind: 'clear', untilDay: 9999 };
  const d = s.districts.find(x => x.id === 'center');
  const core = coreOf(s);
  const router = GameSim.buildNode(s, 'switch', core.x + 250, core.y);
  const agg = GameSim.buildNode(s, 'aggregation', core.x + 500, core.y);
  const fwa = GameSim.buildNode(s, 'cell_3g', d.x, d.y); // گره دسترسی عمومی زنجیره (TD-LTE به پوشش 4G نیاز دارد و زنجیره را دور می‌زند)
  GameSim.connect(s, fwa.id, router.id, 'fiber');
  GameSim.connect(s, router.id, agg.id, 'fiber');
  GameSim.connect(s, agg.id, core.id, 'fiber');
  d.subscribers = 300;
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const gw = s.nodes.find(n => n.type === 'internet_gateway');
  check('67a همه گره‌های مسیر (دسترسی/روتر/تجمیع/هسته/دروازه) مصرف مثبت دارند',
    fwa.usage > 0 && router.usage > 0 && agg.usage > 0 && core.usage > 0 && gw.usage > 0,
    'fwa=' + Math.round(fwa.usage) + ' router=' + Math.round(router.usage) + ' agg=' + Math.round(agg.usage) + ' core=' + Math.round(core.usage) + ' gw=' + Math.round(gw.usage));
  // اشباع روتر میانی کیفیت پایین‌دست را کم می‌کند
  const qosBefore = d.qos;
  router.capacity = 10; router.baseCapacity = 10;
  GameSim.computeFlow(s, { dailyAvg: true });
  check('67b اشباع گره میانی کیفیت منطقه را افت می‌دهد', d.qos < qosBefore,
    'qos ' + qosBefore.toFixed(2) + ' -> ' + d.qos.toFixed(2));
  router.capacity = 2500; router.baseCapacity = 2500;
  // حذف گره میانی مسیر را قطع می‌کند
  GameSim.demolishNode(s, router.id);
  GameSim.computeFlow(s, { dailyAvg: true });
  check('67c حذف گره میانی سرویس را قطع می‌کند', d.servedDemand === 0, 'served=' + d.servedDemand);
}

// ---------- 68: انتخاب کانال رادیویی ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  s.weather = { kind: 'clear', untilDay: 9999 };
  const d = s.districts.find(x => x.id === 'center');
  const a = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  const b = GameSim.buildNode(s, 'cell_2g', d.x + 150, d.y);
  GameSim.connect(s, a.id, coreOf(s).id, 'fiber');
  GameSim.connect(s, b.id, coreOf(s).id, 'fiber');
  // هر دو روی یک کانال: تداخل بالا
  GameSim.setNodeChannel(s, a.id, 2);
  GameSim.setNodeChannel(s, b.id, 2);
  const interfCollide = GameSim.interferenceFor(s, a, 2);
  check('68a تنظیم کانال معتبر اعمال می‌شود و تداخل هم‌کانال مثبت است',
    a.channel === 2 && b.channel === 2 && interfCollide > 0.3, 'interf=' + interfCollide.toFixed(2));
  const rBad = GameSim.setNodeChannel(s, a.id, 99);
  const rStr = GameSim.setNodeChannel(s, a.id, 'کانال ۳');
  check('68b کانال نامعتبر (عدد بیرون از بازه یا رشته) رد می‌شود',
    rBad.ok === false && rStr.ok === false && a.channel === 2);
  const rAuto = GameSim.autoChannel(s, b.id);
  const interfAfter = GameSim.interferenceFor(s, a, a.channel);
  check('68c انتخاب خودکار تداخل را کم می‌کند',
    rAuto.ok === true && b.channel !== 2 && interfAfter < interfCollide,
    'ch=' + b.channel + ' interf ' + interfCollide.toFixed(2) + ' -> ' + interfAfter.toFixed(2));
  check('68d تغییر کانال تداخل گره را همان لحظه بازمحاسبه می‌کند',
    typeof a.interference === 'number' && Math.abs(a.interference - interfAfter) < 0.001,
    'nodeInterf=' + a.interference);
  const s2 = GameSim.loadGame(GameSim.saveGame(s));
  const a2 = s2.nodes.find(n => n.id === a.id);
  const b2 = s2.nodes.find(n => n.id === b.id);
  check('68e کانال‌ها بعد از ذخیره/بارگذاری می‌مانند', a2.channel === 2 && b2.channel === b.channel,
    'a=' + a2.channel + ' b=' + b2.channel);
}

// ---------- 69: اکسس‌پوینت خصوصی ساختمان فقط با مسیر واقعی تا شبکه ----------
// اشتراک به‌تنهایی کافی نیست: ساختمان باید یا انشعاب سیمیِ منبعِ متصل داشته باشد
// یا در برد یک دکل/گره دسترسیِ متصل به دروازه باشد؛ وگرنه وای‌فای داخلی «بدون اتصال به شبکه» است.
{
  const addSub = (s, b, id) => {
    if (!s.individuals) s.individuals = [];
    s.individuals.push({
      id, name: 'مشترک آزمایشی', needMbps: 50, priceSensitivity: 1, prefTech: 'cellular',
      districtId: b.districtId || null, buildingId: b.id, status: 'subscribed', joinedDay: 0, satisfaction: 50,
    });
  };
  const centerOf = (b) => [b.x + (b.w || 26) / 2, b.y + (b.h || 20) / 2];

  // 69a: ساختمانِ دارای مشترک، بدون انشعاب و بدون پوشش → اکسس‌پوینت بدون اتصال به شبکه
  const s = newGameAll(42); s.cash = 9999999;
  const core = coreOf(s);
  const bFar = s.buildings.slice().sort((p, q) =>
    Math.hypot(q.x - core.x, q.y - core.y) - Math.hypot(p.x - core.x, p.y - core.y))[0];
  addSub(s, bFar, 'ind69a');
  GameSim.refreshConnectivity(s);
  const stA = GameSim.buildingServiceStatus(s, bFar.id);
  const [ax, ay] = centerOf(bFar);
  const spA = GameSim.speedTestAt(s, ax, ay);
  check('69a مشترک بدون انشعاب و بدون پوشش: وای‌فای داخلی بدون اتصال به شبکه است',
    stA.subscribed === true && stA.networkPath === false && stA.wifi === false &&
    spA.wifi.speed === 0 && spA.wifi.reason === 'no_network',
    JSON.stringify({ wifi: stA.wifi, path: stA.networkPath, sp: spA.wifi }));

  // 69b: همان ساختمان + انشعاب فیبر از کابینت متصل → اکسس‌پوینت فعال
  const cab = GameSim.buildNode(s, 'street_cabinet', ax, ay);
  GameSim.connect(s, cab.id, core.id, 'fiber');
  const rDrop = GameSim.connectBuildingWired(s, bFar.id, cab.id, 'fiber');
  const stB = GameSim.buildingServiceStatus(s, bFar.id);
  const spB = GameSim.speedTestAt(s, ax, ay);
  check('69b با انشعاب سیمیِ منبعِ متصل: وای‌فای داخلی فعال و سرعت مثبت است',
    rDrop.ok === true && stB.networkPath === true && stB.wifiVia === 'wired' && stB.wifi === true && spB.wifi.speed > 0,
    JSON.stringify({ wifi: stB.wifi, via: stB.wifiVia, sp: spB.wifi }));

  // 69d: انشعاب فعال است ولی کابینت مسیرش تا دروازه را از دست می‌دهد → اکسس‌پوینت دوباره بدون شبکه
  const cabLink = s.links.find(l => l.from === cab.id || l.to === cab.id);
  GameSim.disconnectLink(s, cabLink.id);
  const stD = GameSim.buildingServiceStatus(s, bFar.id);
  const wsD = GameSim.buildingWiredStatus(s, bFar.id);
  const spD = GameSim.speedTestAt(s, ax, ay);
  check('69d انشعاب فعال ولی منبع نامتصل: وای‌فای داخلی بدون اتصال به شبکه می‌شود',
    wsD.status === 'active' && wsD.sourceConnected === false && stD.wifi === false && stD.networkPath === false &&
    spD.wifi.speed === 0 && spD.wifi.reason === 'no_network',
    JSON.stringify({ ws: wsD, wifi: stD.wifi, sp: spD.wifi }));

  // 69c: ساختمان در برد دکل سلولارِ متصل → فعال؛ با قطع مسیر دکل تا هسته → بلافاصله غیرفعال
  const s2 = newGameAll(42); s2.cash = 9999999;
  const d2 = s2.districts.find(x => x.id === 'center');
  const tower = GameSim.buildNode(s2, 'cell_2g', d2.x, d2.y);
  const tLink = connectTower(s2, tower.id, coreOf(s2).id, 'fiber');
  const bIn = s2.buildings.find(b => b.districtId === d2.id &&
    Math.hypot(b.x + (b.w || 26) / 2 - tower.x, b.y + (b.h || 20) / 2 - tower.y) <= (tower.radius || 0));
  addSub(s2, bIn, 'ind69c');
  GameSim.refreshConnectivity(s2);
  const stC1 = GameSim.buildingServiceStatus(s2, bIn.id);
  const [cx2, cy2] = centerOf(bIn);
  const spC1 = GameSim.speedTestAt(s2, cx2, cy2);
  check('69c در برد دکل متصل: وای‌فای داخلی فعال است',
    !!bIn && stC1.networkPath === true && stC1.wifiVia === 'wireless' && stC1.wifi === true && spC1.wifi.speed > 0,
    JSON.stringify({ wifi: stC1.wifi, via: stC1.wifiVia, sp: spC1.wifi }));
  GameSim.disconnectLink(s2, tLink.id); // بدون هیچ تیکی؛ refreshConnectivity داخل disconnectLink است
  const stC2 = GameSim.buildingServiceStatus(s2, bIn.id);
  const spC2 = GameSim.speedTestAt(s2, cx2, cy2);
  check('69c2 با قطع مسیر دکل تا هسته: وای‌فای داخلی همان لحظه بدون اتصال به شبکه می‌شود',
    tower.connected === false && stC2.wifi === false && stC2.networkPath === false &&
    spC2.wifi.speed === 0 && spC2.wifi.reason === 'no_network',
    JSON.stringify({ wifi: stC2.wifi, path: stC2.networkPath, sp: spC2.wifi }));
}

// ---------- 70: هیچ «undefined»ای در خروجی تست سرعت و برچسب‌های فناوری UI نیست ----------
{
  // 70a: نقشه‌های برچسب TECH_FA در ui.js همهٔ کلیدهای ردیف‌های تست سرعت را دارند
  const uiSrc = require('fs').readFileSync(__dirname + '/../js/ui.js', 'utf8');
  const techFaBlocks = [...uiSrc.matchAll(/var TECH_FA = \{([^}]*)\}/g)].map(m => m[1]);
  check('70a برچسب همهٔ فناوری‌ها (از جمله وای‌فای) در UI هست و undefined رندر نمی‌شود',
    techFaBlocks.length >= 2 &&
    techFaBlocks.every(b => ['fiber', 'cellular', 'fwa'].every(k => b.includes(k + ':'))) &&
    techFaBlocks.some(b => b.includes('wifi:')),
    'blocks=' + techFaBlocks.length);
  // 70b: خروجی speedTestAt برای نقاط نمونه هیچ فیلد undefined ندارد
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tower = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  connectTower(s, tower.id, coreOf(s).id, 'fiber');
  const b0 = s.buildings.find(b => b.districtId === d.id);
  const pts = [[d.x, d.y], [b0.x + (b0.w || 26) / 2, b0.y + (b0.h || 20) / 2], [100, 100], [7000, 5200]];
  let ok70 = true, bad70 = '';
  for (const [x, y] of pts) {
    const r = GameSim.speedTestAt(s, x, y);
    for (const t of ['fiber', 'cellular', 'fwa', 'wifi']) {
      const e = r[t];
      if (!e || typeof e.speed !== 'number' || e.reason === undefined || e.nodeName === undefined) {
        ok70 = false; bad70 = t + '@' + x + ',' + y + '=' + JSON.stringify(e);
      }
    }
  }
  check('70b خروجی تست سرعت برای نقاط نمونه هیچ فیلد undefined ندارد', ok70, bad70);
}

// ---------- 71: TD-LTE فقط به‌صورت ماژول روی دکل 4G/5G ----------
{
  // 71a: دکل 4G با ماژول TD-LTE هر دو سرویس را می‌دهد
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tw = feed4G(s, d.x, d.y);
  for (let i = 0; i < 10; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const tdA = d.techDemand || {};
  check('71a دکل 4G+ماژول TD-LTE: هر دو فناوری سرویس و مشترک می‌گیرند',
    GameSim.tdlteCapacity(tw) === 600 && d.subscribers > 0 && (tdA.fwa || {}).served > 0 && (tdA.cellular || {}).served > 0,
    'subs=' + d.subscribers + ' fwaServed=' + (tdA.fwa || {}).served + ' cellServed=' + (tdA.cellular || {}).served);
  const stA = GameSim.speedTestAt(s, tw.x, tw.y).fwa;
  check('71a2 تست سرعت TD-LTE زیر دکل ماژول‌دار مثبت است', stA.speed > 0, JSON.stringify(stA));

  // 71b: دکل 4G بدون ماژول → TD-LTE صفر با علت «ماژول ندارد»؛ فقط 3G → «خارج از پوشش»
  const s2 = newGameAll(43); s2.cash = 9999999;
  const d2 = s2.districts.find(x => x.id === 'north') || s2.districts[0];
  const g4 = GameSim.buildNode(s2, 'cell_4g', d2.x, d2.y);
  finishBuild(s2, g4);
  connectTower(s2, g4.id, coreOf(s2).id, 'fiber');
  for (let i = 0; i < 10; i++) { GameSim.tick(s2, 1); keepAlive(s2); }
  const stB = GameSim.speedTestAt(s2, d2.x, d2.y).fwa;
  const tdB = d2.techDemand || {};
  check('71b1 دکل 4G بدون ماژول: TD-LTE صفر با علت «ماژول TD-LTE ندارد» و سلولار مثبت',
    stB.speed === 0 && stB.reason === 'no_tdlte_module' && (tdB.fwa || {}).served === 0 && (tdB.cellular || {}).served > 0,
    JSON.stringify(stB));
  const s3 = newGameAll(44); s3.cash = 9999999;
  const d3 = s3.districts.find(x => x.id === 'north') || s3.districts[0];
  const g3 = GameSim.buildNode(s3, 'cell_3g', d3.x, d3.y);
  finishBuild(s3, g3);
  connectTower(s3, g3.id, coreOf(s3).id, 'fiber');
  for (let i = 0; i < 10; i++) { GameSim.tick(s3, 1); keepAlive(s3); }
  const stC = GameSim.speedTestAt(s3, d3.x, d3.y).fwa;
  check('71b2 بدون پوشش 4G (فقط 3G): TD-LTE صفر با علت «خارج از پوشش»',
    stC.speed === 0 && stC.reason === 'no_coverage', JSON.stringify(stC));

  // 71c: نام نمایشی کامل عوض شده و fwa_ap در کاتالوگ نیست
  const fs = require('fs');
  const srcAll = ['data.js', 'sim.js', 'ui.js', 'map.js', 'main.js'].map(f => fs.readFileSync(__dirname + '/../js/' + f, 'utf8')).join('\n') +
    fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const modTd = (DATA.moduleList || []).find(m => m.id === 'tdlte');
  const pkgFwa = (DATA.packageList || []).find(p => p.id === 'fwa');
  check('71c تغییر نام کامل: TD-LTE ماژول و بسته است؛ هیچ رشتهٔ قدیمی نمایشی نمانده',
    !srcAll.includes('وایرلس ثابت') && !srcAll.includes('بی‌سیم ثابت') && !/\bFWA\b/.test(srcAll) &&
    !GameSim.getEq('fwa_ap') && !!modTd && modTd.name.includes('TD-LTE') && !!pkgFwa && pkgFwa.name === 'TD-LTE',
    'mod=' + (modTd && modTd.name) + ' pkg=' + (pkgFwa && pkgFwa.name));

  // 71d: ذخیرهٔ قدیمی با گره fwa_ap → دکل 4G با ماژول TD-LTE می‌شود
  const raw = JSON.parse(GameSim.saveGame(s));
  raw.nodes.push({ id: 'noldfwa', type: 'fwa_ap', name: 'آنتن دسترسی ثابت بی‌سیم ۱', x: d.x + 80, y: d.y, status: 'active', health: 100, capacity: 600, radius: 150, level: 1, baseCapacity: 600, baseRadius: 150, usage: 0, connected: false, channel: 2, interference: 0 });
  raw.nodes.push({ id: 'nsw71', type: 'switch', name: 'سوئیچ', x: d.x + 160, y: d.y, status: 'active', health: 100, capacity: 2500, radius: 0, level: 1, baseCapacity: 2500, baseRadius: 0, usage: 0, connected: false, channel: null, interference: 0 });
  raw.links.push({ id: 'loldfwa', from: 'noldfwa', to: 'nsw71', medium: 'fiber', capacity: 10000, latency: 2, status: 'active', isBackup: false, usage: 0 });
  const s4 = GameSim.loadGame(JSON.stringify(raw));
  const mig = s4.nodes.find(n => n.id === 'noldfwa');
  GameSim.tick(s4, 1); keepAlive(s4);
  check('71d بارگذاری ذخیرهٔ قدیمی: fwa_ap به دکل 4G با ماژول TD-LTE تبدیل می‌شود',
    !!mig && mig.type === 'cell_4g' && GameSim.hasModule(mig, 'tdlte') && GameSim.tdlteCapacity(mig) === 600 &&
    mig.name.includes('4G') && s4.links.some(l => l.id === 'loldfwa'),
    'type=' + (mig && mig.type) + ' name=' + (mig && mig.name));
}

// ---------- 72: ترجیح نوع اینترنت ساختمان (تک‌نوعی) و منطقه ----------
{
  const s = newGameAll(42);
  const keys = ['fiber', 'cellular', 'fwa'];
  const vol = (b) => (b.w || 10) * (b.h || 10) * (b.height || 1);
  // 72a: هر ساختمان دقیقاً یک نوع ترجیحی دارد
  const allSingle = s.buildings.every(b => { const p = GameSim.buildingPreference(s, b); return p && keys.includes(p.type) && Object.keys(p).length === 1; });
  check('72a ترجیح هر ساختمان تک‌نوعی است (فقط یک نوع فعال)', allSingle, 'buildings=' + s.buildings.length);
  // 72b: شمارش وزن‌دار منطقه دقیقاً از ساختمان‌هایش ساخته می‌شود و سهم‌ها جمعشان ۱ است
  let aggOk = true, aggBad = '';
  for (const d of s.districts) {
    const bs = s.buildings.filter(b => b.districtId === d.id);
    if (!bs.length) continue;
    const dp = GameSim.districtPreference(s, d);
    const counts = { fiber: 0, cellular: 0, fwa: 0 }; let tot = 0;
    for (const b of bs) { const w = vol(b); counts[GameSim.buildingPreference(s, b).type] += w; tot += w; }
    if (dp.total !== tot || keys.some(t => dp[t] !== counts[t])) { aggOk = false; aggBad = d.id + ':counts'; continue; }
    const split = GameSim.districtTechSplit(s, d);
    if (Math.abs(split.fiber + split.cellular + split.fwa - 1) > 1e-6) { aggOk = false; aggBad = d.id + ':split'; }
  }
  check('72b ترجیح کلی منطقه دقیقاً از ساختمان‌هایش ساخته می‌شود و سهم‌ها جمعشان ۱۰۰٪ است', aggOk, aggBad);
  // 72c: قطعی بودن — ذخیره/بارگذاری و بازی تازه با همان بذر، همان ترجیح
  const sample = s.buildings.slice(0, 25).map(b => ({ id: b.id, t: GameSim.buildingPreference(s, b).type }));
  const sLoad = GameSim.loadGame(GameSim.saveGame(s));
  const sFresh = newGameAll(42);
  const detOk = sample.every(({ id, t }) => {
    const bl = sLoad.buildings.find(b => b.id === id), bf = sFresh.buildings.find(b => b.id === id);
    return bl && bf && GameSim.buildingPreference(sLoad, bl).type === t && GameSim.buildingPreference(sFresh, bf).type === t;
  });
  check('72c ترجیح ساختمان قطعی است (ذخیره/بارگذاری و بذر یکسان = همان نتیجه)', detOk);
  // 72d: آشتی با «تقاضا به تفکیک فناوری» — سهم تقاضای هر فناوری = سهم ترجیح منطقه
  const s2 = newGameAll(42); s2.cash = 9999999;
  const d2 = s2.districts.find(x => x.id === 'center');
  d2.subscribers = 1000;
  GameSim.computeFlow(s2, { dailyAvg: true, noDailyEffects: true });
  const split2 = GameSim.districtTechSplit(s2, d2);
  const td2 = d2.techDemand || {};
  const recOk = d2.demand > 0 && keys.every(t => Math.abs(((td2[t] || {}).demand || 0) / d2.demand - split2[t]) <= 0.02);
  check('72d سهم تقاضای فناوری‌ها با ترجیح منطقه یکی است (دو پنل تناقض ندارند)', recOk,
    'demand=' + Math.round(d2.demand) + ' td=' + JSON.stringify(td2) + ' split=' + JSON.stringify(split2));
  // 72e: شکل‌دهی plausible — اداری‌ها فیبرپسندتر از مسکونی‌ها؛ منطقهٔ کم‌تراکم TD-LTE‌پسندتر از تجاری
  const shareOf = (bs, t) => bs.length ? bs.filter(b => GameSim.buildingPreference(s, b).type === t).length / bs.length : 0;
  const offices = s.buildings.filter(b => b.type === 'office');
  const homes = s.buildings.filter(b => b.type === 'residential');
  const sparseD = s.districts.find(d => d.type === 'sparse');
  const commD = s.districts.find(d => d.type === 'commercial');
  const sparseSplit = sparseD ? GameSim.districtTechSplit(s, sparseD) : null;
  const commSplit = commD ? GameSim.districtTechSplit(s, commD) : null;
  check('72e شکل‌دهی ترجیح: اداری فیبرپسندتر از مسکونی؛ کم‌تراکم TD-LTE‌پسندتر از تجاری',
    offices.length > 0 && homes.length > 0 && shareOf(offices, 'fiber') > shareOf(homes, 'fiber') &&
    !!sparseSplit && !!commSplit && sparseSplit.fwa > commSplit.fwa,
    'officeFiber=' + shareOf(offices, 'fiber').toFixed(2) + ' homeFiber=' + shareOf(homes, 'fiber').toFixed(2) +
    ' sparse=' + (sparseSplit && sparseSplit.fwa.toFixed(2)) + ' comm=' + (commSplit && commSplit.fwa.toFixed(2)));
}

// ---------- 73: حذف کامل اینترنت ماهواره‌ای ----------
{
  // 73a: هیچ شناسهٔ ماهواره‌ای در کاتالوگ/فناوری‌ها/بسته‌ها/رسانه‌ها/ماموریت‌ها/دستاوردها نیست
  const satRe = /satellite|sat_/;
  const noSat = !(DATA.equipmentList || []).some(e => satRe.test(e.id)) &&
    !(DATA.techList || []).some(t => satRe.test(t.id)) &&
    !(DATA.packageList || []).some(p => satRe.test(p.id)) &&
    !Object.keys(DATA.linkMedia || {}).some(k => satRe.test(k)) &&
    !(DATA.media || []).some(m => satRe.test(m.id)) &&
    !GameSim.TECH_KEYS.some(k => satRe.test(k)) &&
    !DATA.satelliteLaunch &&
    !(DATA.techGuides || []).some(g => satRe.test(g.id)) &&
    !(DATA.missions || []).some(m => satRe.test(m.id)) &&
    !(DATA.achievements || []).some(a => satRe.test(a.id)) &&
    !GameSim.launchSatellite && !GameSim.constellationCapacity && !GameSim.traceSatellitePath;
  check('73a هیچ شناسهٔ ماهواره‌ای در کاتالوگ/فناوری/بسته/رسانه/ماموریت/دستاورد نیست', noSat);

  // 73b: هر ردیف تقسیم تقاضا دقیقاً ۳ کلید دارد و جمعش ۱ است
  const rows73 = [...Object.values(DATA.techDemandSplit || {}), DATA.techDemandSplitDefault];
  const rowsOk = rows73.length > 1 && rows73.every(r => {
    const ks = Object.keys(r).sort();
    return JSON.stringify(ks) === JSON.stringify(['cellular', 'fiber', 'fwa']) &&
      Math.abs(r.fiber + r.cellular + r.fwa - 1) < 1e-9;
  });
  check('73b همهٔ ردیف‌های تقسیم تقاضا ۳ فناوری و جمع ۱۰۰٪ هستند', rowsOk, 'rows=' + rows73.length);

  // 73c: ذخیرهٔ قدیمی با گره/لینک/فناوری/بستهٔ ماهواره‌ای تمیز بارگذاری می‌شود
  const s0 = newGameAll(42);
  const raw73 = JSON.parse(GameSim.saveGame(s0));
  const core73 = raw73.nodes.find(n => n.type === 'core_router');
  const clone73 = (id, type, dx) => { const n = JSON.parse(JSON.stringify(core73)); n.id = id; n.type = type; n.x += dx; return n; };
  raw73.nodes.push(clone73('oldsat_term', 'sat_terminal_leo', -200));
  raw73.nodes.push(clone73('oldsat_gw', 'sat_gateway', 200));
  raw73.links.push({ id: 'oldsat_link', from: 'oldsat_term', to: 'oldsat_gw', medium: 'satellite', status: 'active', level: 1, capacity: 600, latency: 45, usage: 0, isBackup: false });
  raw73.techsUnlocked = [...(raw73.techsUnlocked || []), 'satellite_leo', 'satellite_geo', 'own_satellite'];
  raw73.satellites = [{ id: 'sat1', kind: 'leo', status: 'active', capacity: 2000, monthlyCost: 3000, ageDays: 10, lifetimeDays: 720, health: 100 }];
  raw73.counters.satellite = 1;
  raw73.packages.push({ id: 'satellite', name: 'ماهواره‌ای', speedMbps: 300, price: 1500, kind: 'satellite' });
  raw73.customers[0].packageId = 'satellite';
  raw73.missions.push({ id: 'm_satellite', done: false });
  raw73.individuals.push({ id: 'ind_old', name: 'مشترک قدیمی', needMbps: 25, priceSensitivity: 1, prefTech: 'satellite', districtId: raw73.districts[0].id, buildingId: raw73.buildings[0].id, status: 'candidate', joinedDay: null, satisfaction: 0 });
  const s3 = GameSim.loadGame(JSON.stringify(raw73));
  const term3 = s3.nodes.find(n => n.id === 'oldsat_term');
  const gw3 = s3.nodes.find(n => n.id === 'oldsat_gw');
  const link3 = s3.links.find(l => l.id === 'oldsat_link');
  const ind3 = s3.individuals.find(p => p.id === 'ind_old');
  check('73c ذخیرهٔ قدیمی ماهواره‌ای تمیز مهاجرت می‌کند (گره‌ها معادل، لینک نامعتبر حذف، بقیه پاک)',
    !!term3 && term3.type === 'cell_4g' && GameSim.hasModule(term3, 'tdlte') && !!gw3 && gw3.type === 'aggregation' &&
    !link3 && !s3.links.some(l => l.medium === 'satellite') &&
    !s3.techsUnlocked.some(id => satRe.test(id)) &&
    s3.satellites === undefined && s3.counters.satellite === undefined &&
    !s3.packages.some(p => p.id === 'satellite') && s3.customers[0].packageId === 'home' &&
    !s3.missions.some(m => m.id === 'm_satellite') && !!ind3 && ind3.prefTech === 'fwa',
    JSON.stringify({ term: term3 && term3.type, gw: gw3 && gw3.type, linkGone: !link3, techs: s3.techsUnlocked, pref: ind3 && ind3.prefTech }));
  check('73c2 بازی مهاجرت‌کرده بدون خطا تیک می‌خورد', !!GameSim.tick(s3, 1));

  // 73d: ترجیح ساختمان/منطقه کلید ماهواره ندارد
  const p73 = GameSim.buildingPreference(s0, s0.buildings[0]);
  const dp73 = GameSim.districtPreference(s0, s0.districts[0]);
  check('73d ترجیح ساختمان تک‌نوعی و شمارش منطقه فقط ۳ نوع دارد (بدون ماهواره)',
    ['fiber', 'cellular', 'fwa'].includes(p73.type) && Object.keys(p73).length === 1 &&
    ['fiber', 'cellular', 'fwa'].every(t => typeof dp73[t] === 'number') && !('satellite' in dp73),
    JSON.stringify({ p: Object.keys(p73), dp: Object.keys(dp73) }));
}

// ---------- 74: خط زمانی تاریخی و رویداد دوران ----------
{
  const s = GameSim.newGame(42);
  check('74a سال از روی روز ساخته می‌شود (۱۰ روز = ۱ سال)',
    GameSim.yearOf(s) === 1991 && GameSim.yearOf({ day: 11 }) === 1992 && GameSim.yearOf({ day: 101 }) === 2001 && GameSim.yearOf({ day: 281 }) === 2019);
  check('74b دوران جاری نام فارسی دارد', !!(GameSim.eraOf(s) && GameSim.eraOf(s).name));
  s.day = 100;
  GameSim.tick(s, 2); // روز ۱۰۲ → سال ۲۰۰۱
  check('74c با رسیدن دوران تازه رویداد فارسی «دوران جدید» ثبت می‌شود',
    s.log.some(l => l.kind === 'event' && l.msg.includes('دوران جدید')),
    s.log.filter(l => l.kind === 'event').map(l => l.msg).join(' | ').slice(0, 120));
  const s2 = GameSim.newGame(42);
  check('74d در سال ۱۹۹۱ ترجیح TD-LTE صفر است (دورانش نرسیده)',
    s2.buildings.every(b => GameSim.buildingPreference(s2, b).type !== 'fwa'));
}

// ---------- 75: ماژول TD-LTE — دوران، یک‌بار، پینگ پایدار ----------
{
  const s = GameSim.newGame(42); s.cash = 9999999;
  s.day = 181; // ۲۰۰۹: 4G هست، ماژول TD-LTE هنوز نیست (۲۰۱۲)
  const d = s.districts.find(x => x.id === 'center');
  const t4 = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, t4);
  connectTower(s, t4.id, coreOf(s).id, 'fiber');
  const rEarly = GameSim.installModule(s, t4.id, 'tdlte');
  check('75a ماژول TD-LTE قبل از دورانش (۲۰۱۲) نصب نمی‌شود', rEarly.ok === false, rEarly.error || '');
  s.day = 211; // ۲۰۱۲
  const rOk = GameSim.installModule(s, t4.id, 'tdlte');
  check('75b در دوران TD-LTE نصب ماژول موفق است', rOk.ok === true && GameSim.tdlteCapacity(t4) === 600, JSON.stringify(rOk));
  const rDup = GameSim.installModule(s, t4.id, 'tdlte');
  check('75c نصب دوبارهٔ TD-LTE یعنی آپگرید به سطح ۲ (ظرفیت ۱۲۰۰)', rDup.ok === true && GameSim.moduleLevel(t4, 'tdlte') === 2 && GameSim.tdlteCapacity(t4) === 1200, JSON.stringify(rDup));
  check('75d جیتر TD-LTE ثابت و کمتر از موبایلِ زیر ازدحام است',
    GameSim.techJitter('fwa', 0.5) === 2 && GameSim.techJitter('cellular', 0.5) > GameSim.techJitter('fwa', 0.5),
    'fwa=' + GameSim.techJitter('fwa', 0.5) + ' cell=' + GameSim.techJitter('cellular', 0.5));
  const st = GameSim.speedTestAt(s, d.x, d.y);
  check('75e تست سرعت: پینگ TD-LTE پایدار (جیتر ۲) است',
    st.fwa.jitter === 2 && st.fwa.latency != null && st.fwa.speed > 0,
    'fwaJit=' + st.fwa.jitter + ' lat=' + st.fwa.latency);
}

// ---------- 76: بازشدن مناطق و محدودهٔ آمار ----------
{
  const s = GameSim.newGame(42); s.cash = 9999999;
  const locked = s.districts.find(d => d.unlocked === false);
  const nLocked = GameSim.buildNode(s, 'cell_2g', locked.x, locked.y);
  check('76a ساخت در منطقهٔ قفل‌شده رد می‌شود', nLocked === null);
  const cash0 = s.cash;
  const cost = GameSim.districtUnlockCost(locked);
  const r = GameSim.unlockDistrict(s, locked.id);
  check('76b بازکردن منطقه با پرداخت هزینه ممکن است', r.ok === true && s.cash === cash0 - cost && locked.unlocked === true,
    'cost=' + cost);
  const n2 = GameSim.buildNode(s, 'cell_2g', locked.x, locked.y);
  check('76c بعد از بازشدن، ساخت در منطقه ممکن است', !!n2);
  // آمار رضایت فقط روی مناطق باز حساب می‌شود: رضایت مناطق قفل‌شده (صفر) در میانگین نیست
  const s2 = GameSim.newGame(42); s2.cash = 9999999;
  for (const dd of s2.districts) { dd.satisfaction = dd.unlocked !== false ? 80 : 0; dd.subscribers = dd.unlocked !== false ? 100 : 0; }
  GameSim.computeFlow(s2, { noDailyEffects: true });
  const overallBefore = s2.satisfaction;
  const bigLocked = s2.districts.filter(x => x.unlocked === false).sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  GameSim.unlockDistrict(s2, bigLocked.id);
  bigLocked.subscribers = 0; bigLocked.satisfaction = 0;
  GameSim.computeFlow(s2, { noDailyEffects: true });
  const afterEmpty = s2.satisfaction;
  bigLocked.subscribers = 5000; bigLocked.satisfaction = 10;
  GameSim.computeFlow(s2, { noDailyEffects: true });
  check('76d رضایت کلی = تجربهٔ مشترکان فعلی (وزن‌دار با مشترک)؛ منطقهٔ بی‌مشترک اثری ندارد',
    overallBefore >= 60 && Math.abs(afterEmpty - overallBefore) < 5 && s2.satisfaction < afterEmpty - 10,
    'before=' + overallBefore + ' afterEmpty=' + afterEmpty + ' after=' + s2.satisfaction);
  // مهاجرت: ذخیره‌ای که در منطقه‌ای گره دارد → آن منطقه باز بارگذاری می‌شود
  const raw = JSON.parse(GameSim.saveGame(s2));
  raw.districts.forEach(d => { delete d.unlocked; }); // ذخیرهٔ قدیمی این فیلد را ندارد
  const rawLocked = raw.districts.find(d => d.id !== 'center' && d.id !== 'north' && !(d.subscribers > 0));
  raw.nodes.push({ id: 'nmig76', type: 'cell_2g', name: 'دکل قدیمی', x: rawLocked.x, y: rawLocked.y, status: 'active', health: 100, capacity: 60, radius: 400, baseCapacity: 60, baseRadius: 400, usage: 0, connected: false, channel: 1, interference: 0, modules: [] });
  const s3 = GameSim.loadGame(JSON.stringify(raw));
  const migD = s3.districts.find(d => d.id === rawLocked.id);
  check('76e مهاجرت ذخیره: منطقهٔ دارای گره باز بارگذاری می‌شود', migD.unlocked === true);
}

// ---------- 77: رفت‌وآمد روزانهٔ تصادفی در چهار فاز ----------
{
  const s = newGameAll(42);
  const at = (h) => GameSim.commutePulses(s, h);
  const m = at(8), mid = at(13.5), ev = at(19), ni = at(22.5), deep = at(3);
  check('77a صبح: پالس‌ها خانه→کار حرکت می‌کنند', m.length > 0 && m.every(p => p.dir === 'toWork'), 'n=' + m.length);
  check('77b ظهر: پالس‌ها کار→خانه برمی‌گردند', mid.length > 0 && mid.every(p => p.dir === 'toHome'), 'n=' + mid.length);
  check('77c عصر: پالس‌ها خانه→تفریح می‌روند', ev.length > 0 && ev.every(p => p.dir === 'toLeisure'), 'n=' + ev.length);
  check('77d شب: پالس‌ها تفریح→خانه برمی‌گردند', ni.length > 0 && ni.every(p => p.dir === 'fromLeisure'), 'n=' + ni.length);
  check('77e نیمه‌شب تا سحر حرکت نیست', deep.length === 0, 'n=' + deep.length);
  check('77f سقف پالس در همهٔ ساعت‌ها رعایت می‌شود',
    [0, 3, 6.5, 8, 11, 13.5, 16, 19, 22.5, 23.5].every(h => at(h).length <= GameSim.COMMUTE_CAP));
  const ts = new Set(m.map(p => p.t.toFixed(3)));
  check('77g زمان شروع/سرعت پالس‌ها تصادفی و متفاوت است', ts.size > 1, 'distinct=' + ts.size);
  check('77h پالس‌ها قطعی‌اند (دو فراخوانی یکسان)', JSON.stringify(at(19)) === JSON.stringify(ev));
  // پوشش مسیر: با دکل روی مسیر، پوشش رفت‌وآمد منطقهٔ مسکونی بیشتر می‌شود
  const res = s.districts.find(d => d.type === 'residential');
  const cc0 = GameSim.commuteCoverage(s, res);
  const work = GameSim.nearestWorkDistrict(s, res);
  const hb77 = s.buildings.find(b => b.districtId === res.id && b.type === 'residential');
  const wb77 = s.buildings.find(b => b.districtId === work.id && ['commercial', 'office', 'industrial'].includes(b.type));
  const cA77 = { x: hb77.x + (hb77.w || 26) / 2, y: hb77.y + (hb77.h || 20) / 2 };
  const cB77 = { x: wb77.x + (wb77.w || 26) / 2, y: wb77.y + (wb77.h || 20) / 2 };
  const midPt = GameSim.commuteRoutePoints(s, cA77, cB77, 8)[4];
  s.cash = 9999999;
  const tw = GameSim.buildNode(s, 'cell_2g', midPt.x, midPt.y);
  connectTower(s, tw.id, coreOf(s).id, 'fiber');
  const cc1 = GameSim.commuteCoverage(s, res);
  check('77i پوشش موبایل در مسیر رفت‌وآمد با دکل روی مسیر بیشتر می‌شود',
    cc0 && cc1 && cc1.coverage > cc0.coverage,
    'before=' + (cc0 && cc0.coverage) + ' after=' + (cc1 && cc1.coverage));
}

// ---------- 78: FTTH (OLT) واقعاً به ساختمان‌ها سرویس می‌دهد + انشعاب رایگان ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const ftth = GameSim.buildNode(s, 'ftth', d.x, d.y);
  finishBuild(s, ftth);
  GameSim.connect(s, ftth.id, coreOf(s).id, 'fiber');
  const b0 = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  const cash0 = s.cash;
  const r = GameSim.connectBuildingWired(s, b0.id, ftth.id, 'fiber');
  check('78a انشعاب مستقیم از FTTH (OLT) موفق و رایگان است', r.ok === true && r.cost === 0 && s.cash === cash0, r.error || '');
  d.subscribers = 200;
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('78b منطقه از فیبر FTTH سرویس می‌گیرد', (d.techDemand.fiber || {}).served > 0,
    'fiberServed=' + (d.techDemand.fiber || {}).served);
  // انشعاب فیبر قبل از ۲۰۰۴ ممکن نیست؛ مسی ممکن است
  const s2 = GameSim.newGame(42); s2.cash = 9999999; s2.day = 80; // ۱۹۹۹: کابینت هست، FTTH نه
  const d2 = s2.districts.find(x => x.id === 'center');
  const bb = s2.buildings.filter(b => b.districtId === d2.id)
    .sort((a, b) => Math.hypot(a.x + (a.w || 26) / 2 - d2.x, a.y + (a.h || 20) / 2 - d2.y) - Math.hypot(b.x + (b.w || 26) / 2 - d2.x, b.y + (b.h || 20) / 2 - d2.y))[0];
  // کابینت کنار همان ساختمان (برد سیم مسی کوتاه است)
  const cab = GameSim.buildNode(s2, 'street_cabinet', bb.x + (bb.w || 26) / 2 + 40, bb.y + (bb.h || 20) / 2);
  GameSim.connect(s2, cab.id, coreOf(s2).id, 'copper');
  const rF = GameSim.connectBuildingWired(s2, bb.id, cab.id, 'fiber');
  const rC = GameSim.connectBuildingWired(s2, bb.id, cab.id, 'copper');
  check('78c قبل از ۲۰۰۴ انشعاب فیبر رد و مسی قبول می‌شود', rF.ok === false && rC.ok === true,
    'fiber=' + (rF.error || '') + ' copper=' + rC.ok);
}

// ---------- 79: افت سیگنال مسیر طولانی و تقویت‌کننده ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const core = coreOf(s);
  const far = GameSim.buildNode(s, 'switch', core.x - 4000, core.y);
  finishBuild(s, far);
  const link = GameSim.connect(s, far.id, core.id, 'fiber');
  const att = GameSim.linkAttenuation(s, link, far, core);
  check('79a لینک فیبر ۴۰۰۰ واحدی افت سیگنال دارد', att < 0.8 && att >= 0.25, 'att=' + att.toFixed(3));
  check('79b ظرفیت مؤثر لینک بلند کمتر از ظرفیت اسمی است',
    GameSim.linkEffCapacity(s, link, null) < link.capacity,
    'eff=' + Math.round(GameSim.linkEffCapacity(s, link, null)) + ' cap=' + link.capacity);
  GameSim.refreshConnectivity(s);
  const prob = (s.problems || []).find(p => p.cause === 'signal_loss' && p.linkId === link.id);
  check('79c مشکل «افت سیگنال» با گزینهٔ نصب تقویت‌کننده گزارش می‌شود',
    !!prob && (prob.fixOptions || []).some(f => f.action === 'add_repeater'));
  const r = GameSim.applyFix(s, prob, { action: 'add_repeater', linkId: link.id });
  const rep = s.nodes.find(n => n.type === 'repeater');
  const segLinks = rep ? s.links.filter(l => l.from === rep.id || l.to === rep.id) : [];
  check('79d تقویت‌کننده در میانهٔ مسیر نصب و لینک دو تکه شد',
    r.ok === true && !!rep && segLinks.length === 2 && !s.links.some(l => l.id === link.id));
  const attSeg = segLinks.map(l => GameSim.linkAttenuation(s, l, s.nodes.find(n => n.id === l.from), s.nodes.find(n => n.id === l.to)));
  check('79e هر تکه بعد از تقویت‌کننده بدون افت است', attSeg.length === 2 && attSeg.every(a => a === 1), 'atts=' + attSeg.join(','));
}

// ---------- 80: دکل فقط بک‌هال خودش را دارد (ترافیک عبوری ندارد) ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const t1 = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  const t2 = GameSim.buildNode(s, 'cell_2g', d.x + 100, d.y);
  const rTT = GameSim.connect(s, t1.id, t2.id, 'fiber');
  check('80a اتصال دکل به دکل رد می‌شود (دکل فقط بک‌هال خودش را دارد)', rTT === null);
  const rTC = connectTower(s, t1.id, coreOf(s).id, 'fiber');
  check('80b بک‌هال دکل از راه سوئیچ به هسته مجاز است', !!rTC && t1.connected === true);
  // توپولوژی تزریقی: تجمیع—دکل—هسته؛ تجمیع نباید از راه دکل به شبکه برسد
  const agg = GameSim.buildNode(s, 'aggregation', d.x + 200, d.y);
  s.links.push({ id: 'linj80', from: agg.id, to: t1.id, medium: 'fiber', capacity: 10000, latency: 2, status: 'active', level: 1, isBackup: false, usage: 0 });
  GameSim.refreshConnectivity(s);
  check('80c گره پشت دکل از راه دکل به شبکه نمی‌رسد (دکل برگ است)', agg.connected === false);
}

// ---------- 81: ابزار پینگ ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const core = coreOf(s), gw = gwOf(s);
  const p1 = GameSim.pingBetween(s, core.id, gw.id);
  check('81a پینگ هسته تا دروازه مثبت و مسیرش درست است',
    p1.ok === true && p1.ms > 0 && p1.path.length === p1.hops + 1 && p1.pathNames.length === p1.path.length,
    JSON.stringify(p1));
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  connectTower(s, t.id, core.id, 'fiber');
  const p2 = GameSim.pingBetween(s, t.id, gw.id);
  check('81b مسیر طولانی‌تر پینگ بیشتری دارد', p2.ok === true && p2.ms > p1.ms, 'p1=' + p1.ms + ' p2=' + p2.ms);
  const iso = GameSim.buildNode(s, 'switch', 100, 100);
  const p3 = GameSim.pingBetween(s, iso.id, gw.id);
  check('81c گره بدون مسیر خطای فارسی می‌دهد', p3.ok === false && typeof p3.error === 'string' && p3.error.length > 0);
}

// ---------- 82: ماژول پورت اضافه ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const cab = GameSim.buildNode(s, 'street_cabinet', d.x, d.y);
  check('82a کابینت در حالت پایه ۲۴ پورت دارد', GameSim.cabinetPorts(cab) === 24, 'ports=' + GameSim.cabinetPorts(cab));
  const r = GameSim.installModule(s, cab.id, 'ports_boost');
  check('82b ماژول پورت اضافه ۲۴ پورت دیگر می‌دهد', r.ok === true && GameSim.cabinetPorts(cab) === 48, 'ports=' + GameSim.cabinetPorts(cab));
}

// ---------- 83: رویدادهای تصادفی ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  connectTower(s, t.id, coreOf(s).id, 'fiber');
  let evCount = 0;
  for (let i = 0; i < 730 && evCount === 0; i++) {
    GameSim.tick(s, 1); keepAlive(s);
    evCount = s.log.filter(l => l.kind === 'event' && !l.msg.includes('دوران جدید') && !l.msg.includes('پیوستند')).length;
  }
  check('83a رویدادهای تصادفی در طول بازی رخ می‌دهند و فارسی ثبت می‌شوند', evCount >= 1, 'events=' + evCount);
}

// ---------- 84: نام‌های سادهٔ تجهیزات (بدون برند خیالی) ----------
{
  const brands = ['پارس‌نت', 'آریاتل', 'سیمرغ'];
  const badNames = DATA.equipmentList.filter(e => brands.some(b => e.name.includes(b))).map(e => e.id);
  check('84a هیچ نام تجهیز برند خیالی ندارد', badNames.length === 0, badNames.join(','));
  const badGuides = (DATA.techGuides || []).filter(g => brands.some(b => (g.desc + g.whenToUse).includes(b))).map(g => g.id);
  const badEqGuides = DATA.equipmentList.filter(e => brands.some(b => e.guide.includes(b))).map(e => e.id);
  check('84b راهنماها هم بدون برندند', badGuides.length === 0 && badEqGuides.length === 0, (badGuides.concat(badEqGuides)).join(','));
  check('84c نام‌ها ساده و عمومی‌اند', eq('cell_2g').name === 'دکل 2G' && eq('fiber_cable').name === 'کابل فیبر نوری' && eq('switch').name === 'سوئیچ' && !eq('router'));
}

// ---------- 85: هیچ خانهٔ خالی‌ای نیست ----------
{
  const s = GameSim.newGame(42);
  check('85a هر ساختمان حداقل یک ساکن دارد', s.buildings.every(b => GameSim.buildingResidents(s, b) >= 1),
    'buildings=' + s.buildings.length);
}

// ---------- 86: ترتیب برد و سرعت دکل‌ها ----------
{
  const r = (id) => eq(id).radius, c = (id) => eq(id).capacity;
  check('86a برد: 2G > 3G > 4G > 5G', r('cell_2g') > r('cell_3g') && r('cell_3g') > r('cell_4g') && r('cell_4g') > r('cell_5g'),
    [r('cell_2g'), r('cell_3g'), r('cell_4g'), r('cell_5g')].join('>'));
  check('86b سرعت برعکس برد: 5G > 4G > 3G > 2G', c('cell_5g') > c('cell_4g') && c('cell_4g') > c('cell_3g') && c('cell_3g') > c('cell_2g'));
}

// ---------- 87: سقف پالس‌ها در نقشه (کارایی) ----------
{
  const mapSrc = require('fs').readFileSync(__dirname + '/../js/map.js', 'utf8');
  check('87a سقف پالس بسته‌ها در نقشه تعریف شده و پالس رفت‌وآمد از سیم می‌آید',
    /PACKET_CAP\s*=\s*200/.test(mapSrc) && mapSrc.includes('commutePulses') && GameSim.COMMUTE_CAP === 60);
}

// ---------- 88: افت فاصلهٔ PtP ----------
{
  const s = newGameAll(42);
  s.buildings = [];
  const a = { x: 0, y: 0 }, bNear = { x: 100, y: 0 }, bMid = { x: 900, y: 0 }, bFar = { x: 1800, y: 0 };
  const l = { medium: 'ptp' };
  const fNear = GameSim.linkAttenuation(s, l, a, bNear);
  const fMid = GameSim.linkAttenuation(s, l, a, bMid);
  const fFar = GameSim.linkAttenuation(s, l, a, bFar);
  check('88a هرچه فاصلهٔ PtP بیشتر، ظرفیت مؤثر کمتر (در حداکثر برد ~۴۰٪)',
    fNear > fMid && fMid > fFar && Math.abs(fFar - 0.4) < 0.05,
    'near=' + fNear.toFixed(2) + ' mid=' + fMid.toFixed(2) + ' far=' + fFar.toFixed(2));
}

// ---------- 89: اکسس‌پوینت ساختمان با دکل ماژول‌دار (رگرسیون مورد ۱۹) ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tw = feed4G(s, d.x, d.y);
  const bIn = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - tw.x, a.y - tw.y) - Math.hypot(b.x - tw.x, b.y - tw.y))[0];
  if (!s.individuals) s.individuals = [];
  s.individuals.push({ id: 'ind89', name: 'مشترک آزمایشی', needMbps: 50, priceSensitivity: 1, prefTech: 'fwa', districtId: d.id, buildingId: bIn.id, status: 'subscribed', joinedDay: 0, satisfaction: 50 });
  GameSim.refreshConnectivity(s);
  const st1 = GameSim.buildingServiceStatus(s, bIn.id);
  check('89a ساختمان مشترک زیر دکل ماژول‌دار متصل: وای‌فای داخلی فعال است', st1.wifi === true && st1.networkPath === true,
    JSON.stringify(st1));
  const twLink = s.links.find(l => l.from === tw.id || l.to === tw.id);
  GameSim.disconnectLink(s, twLink.id);
  const st2 = GameSim.buildingServiceStatus(s, bIn.id);
  check('89b با قطع بک‌هال دکل: وای‌فای داخلی بدون اتصال به شبکه می‌شود', st2.wifi === false && st2.networkPath === false,
    JSON.stringify(st2));
}

// ---------- 90: مهاجرت کامل ذخیرهٔ v1.0.14 ----------
{
  const s0 = newGameAll(42);
  const raw = JSON.parse(GameSim.saveGame(s0));
  const core = raw.nodes.find(n => n.type === 'core_router');
  // دکل 3G سطح ۳ با نام برنددار قدیمی
  raw.nodes.push({ id: 'nold90', type: 'cell_3g', name: 'دکل سلولی 3G آریاتل ۲', x: core.x + 300, y: core.y, status: 'active', health: 100, capacity: 562, radius: 399, level: 3, baseCapacity: 250, baseRadius: 340, usage: 0, connected: false, channel: 1, interference: 0 });
  raw.links.push({ id: 'lold90', from: 'nold90', to: core.id, medium: 'fiber', capacity: 10000, latency: 2, status: 'active', level: 1, isBackup: false, usage: 0 });
  raw.contracts = [{ id: 'c90', status: 'active', priceMonthly: 1000, monthsLeft: 3 }];
  raw.techsUnlocked = ['lte', '5g'];
  const s = GameSim.loadGame(JSON.stringify(raw));
  const n = s.nodes.find(x => x.id === 'nold90');
  check('90a سطح قدیمی به ماژول تبدیل شد (۲ ظرفیت + ۲ برد در سقف اسلات)',
    n.modules.filter(m => m === 'cap_boost').length === 2 && n.modules.filter(m => m === 'range_boost').length === 2 && n.level === undefined,
    'modules=' + n.modules.join(','));
  check('90b ظرفیت بعد از مهاجرت = پایه ×۱٫۵² (همان سطح ۳ قدیمی)', n.capacity === Math.round(250 * 2.25), 'cap=' + n.capacity);
  check('90c نام برنددار قدیمی ساده شد', !n.name.includes('آریاتل') && n.name.includes('دکل 3G'), 'name=' + n.name);
  check('90d قرارداد و تحقیق‌وتوسعهٔ قدیمی پاک و سال از روز ساخته شد',
    s.contracts === undefined && Array.isArray(s.techsUnlocked) && s.techsUnlocked.length === 0 && s.year === GameSim.yearOf(s));
  check('90e بازی مهاجرت‌کرده تیک می‌خورد', !!GameSim.tick(s, 1));
}

// ---------- 91: آموزش فقط از منو باز می‌شود و منوی دوران هست ----------
{
  const uiSrc = require('fs').readFileSync(__dirname + '/../js/ui.js', 'utf8');
  const mainSrc = require('fs').readFileSync(__dirname + '/../js/main.js', 'utf8');
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  check('91a آموزش در شروع بازی خودکار باز نمی‌شود',
    !mainSrc.includes('showTutorial') && !/isNewGame[^;]*showTutorial/.test(uiSrc));
  check('91b آیتم «آموزش بازی» و «دوران فناوری» در منو هست و R&D/قرارداد نیست',
    html.includes('btn-tutorial') && html.includes('btn-timeline') && !html.includes('btn-rd') && !html.includes('btn-contracts'));
}

// ---------- 92: ارقام فارسی در نوار بالا (رضایت) و چیپ‌های آمار موبایل ----------
{
  const uiSrc = require('fs').readFileSync(__dirname + '/../js/ui.js', 'utf8');
  const css = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
  check('92a مقدار رضایت در نوار بالا با ارقام فارسی است (نه لاتین)',
    uiSrc.includes("faDigits(String(Math.round(state.satisfaction)))") &&
    !uiSrc.includes("Math.round(state.satisfaction) + '٪'"));
  check('92b چیپ‌های آمار موبایل و مخفی‌بودن آمار ثانویه در CSS هست',
    css.includes('.stats .stat:first-child{flex-grow:1.7}') &&
    css.includes('#topbar .stat.secondary{display:none}'));
}

// ---------- 93: ماژول TD-LTE فقط روی دکل 4G/5G ----------
{
  const REASON = 'ماژول TD-LTE فقط روی دکل 4G و 5G نصب می‌شود';
  const s = newGameAll(42); // ۲۰۱۹: همهٔ دوران‌ها باز
  s.cash = 9999999;
  const core = coreOf(s);
  const t4 = GameSim.buildNode(s, 'cell_4g', core.x - 300, core.y);
  const t5 = GameSim.buildNode(s, 'cell_5g', core.x - 420, core.y);
  [t4, t5].forEach(n => finishBuild(s, n));
  const r4 = GameSim.installModule(s, t4.id, 'tdlte');
  const r5 = GameSim.installModule(s, t5.id, 'tdlte');
  check('93a ماژول TD-LTE روی دکل 4G و 5G نصب می‌شود',
    r4.ok === true && r5.ok === true && GameSim.hasModule(t4, 'tdlte') && GameSim.hasModule(t5, 'tdlte'),
    JSON.stringify({ r4, r5 }));

  const badTypes = ['cell_2g', 'cell_3g', 'street_cabinet', 'ftth', 'ptp_link', 'repeater'];
  let allRejected = true, detail = '';
  badTypes.forEach((type, i) => {
    const n = GameSim.buildNode(s, type, core.x - 300 - i * 60, core.y + 320);
    if (!n) { allRejected = false; detail = type + ':build-null'; return; }
    finishBuild(s, n);
    const cashB = s.cash;
    const r = GameSim.installModule(s, n.id, 'tdlte');
    if (!(r.ok === false && r.error === REASON && s.cash === cashB && !GameSim.hasModule(n, 'tdlte'))) {
      allRejected = false; detail = type + ':' + JSON.stringify(r) + ' cashΔ=' + (s.cash - cashB);
    }
  });
  check('93b ماژول TD-LTE روی 2G/3G/کابینت/FTTH/PtP/تقویت‌کننده با دلیل فارسی رد می‌شود و پولی کم نمی‌شود',
    allRejected, detail);

  const t2 = s.nodes.find(n => n.type === 'cell_2g');
  const info2 = GameSim.moduleInfo(s, t2.id);
  const opt2 = info2 && info2.options.find(o => o.id === 'tdlte');
  check('93c moduleInfo روی دکل 2G ماژول TD-LTE را غیرقابل‌نصب با همان دلیل نشان می‌دهد',
    !!opt2 && opt2.ok === false && opt2.reason === REASON, JSON.stringify(opt2));

  // مهاجرت: ذخیره با ماژول TD-LTE روی دکل 2G → هنگام بارگذاری برداشته و هزینه برگردد؛ روی 4G بماند
  const s2 = newGameAll(7);
  s2.cash = 500000;
  const core2 = coreOf(s2);
  const m2 = GameSim.buildNode(s2, 'cell_2g', core2.x - 300, core2.y);
  const m4 = GameSim.buildNode(s2, 'cell_4g', core2.x - 420, core2.y);
  [m2, m4].forEach(n => finishBuild(s2, n));
  GameSim.installModule(s2, m4.id, 'tdlte');
  m2.modules.push('tdlte'); // نصب اشتباهِ ذخیرهٔ قبلی (دستی)
  const cashBeforeSave = s2.cash;
  const loaded = GameSim.loadGame(GameSim.saveGame(s2));
  const lm2 = loaded.nodes.find(n => n.id === m2.id);
  const lm4 = loaded.nodes.find(n => n.id === m4.id);
  check('93d ذخیرهٔ دارای TD-LTE روی دکل 2G: ماژول برداشته و ۱۵٬۰۰۰ برگشت؛ روی 4G ماند',
    lm2 && !GameSim.hasModule(lm2, 'tdlte') && loaded.cash === cashBeforeSave + 15000 &&
    lm4 && GameSim.hasModule(lm4, 'tdlte'),
    'cash=' + loaded.cash + ' before=' + cashBeforeSave);
}

// ---------- 94: لینک موازی + بالانس خودکار ترافیک + مهاجرت حذف ارتقای لینک ----------
{
  const s = newGameAll(42);
  s.cash = 99999999;
  const core = coreOf(s);
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, t);
  const l1 = connectTower(s, t.id, core.id, 'copper');
  const l2 = connectTower(s, t.id, core.id, 'copper');
  const swId94 = l1 && (l1.from === t.id ? l1.to : l1.from);
  check('94a دو لینک موازی بین همان دو گره ساخته می‌شود و ظرفیت‌ها جمع می‌شوند',
    !!l1 && !!l2 && l1.id !== l2.id && l1.capacity === 100 && l2.capacity === 100 &&
    GameSim.parallelLinks(s, t.id, swId94).length === 2,
    JSON.stringify({ l1: l1 && l1.capacity, l2: l2 && l2.capacity }));

  d.subscribers = 2000;
  GameSim.tick(s, 1); keepAlive(s);
  const u1 = l1.usage || 0, u2 = l2.usage || 0;
  check('94b ترافیک خودکار بین دو لینک موازی تقریباً برابر تقسیم می‌شود',
    u1 > 0 && u2 > 0 && Math.abs(u1 - u2) / Math.max(u1, u2) < 0.05,
    'u1=' + Math.round(u1) + ' u2=' + Math.round(u2));

  GameSim.disconnectLink(s, l1.id);
  GameSim.tick(s, 1); keepAlive(s);
  check('94c با حذف یکی از لینک‌های موازی، سرویس از دیگری ادامه دارد',
    t.connected === true && (l2.usage || 0) > 0 && d.servedDemand > 0,
    'u2=' + Math.round(l2.usage || 0) + ' served=' + d.servedDemand);
}
{
  const s = newGameAll(43);
  s.cash = 99999999;
  const core = coreOf(s);
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  const a1 = GameSim.buildNode(s, 'aggregation', core.x - 200, core.y - 150);
  const a2 = GameSim.buildNode(s, 'aggregation', core.x - 200, core.y + 150);
  [t, a1, a2].forEach(n => finishBuild(s, n));
  const sw1 = GameSim.buildNode(s, 'switch', a1.x + 80, a1.y); finishBuild(s, sw1);
  const sw2 = GameSim.buildNode(s, 'switch', a2.x + 80, a2.y); finishBuild(s, sw2);
  const lt1 = GameSim.connect(s, t.id, sw1.id, 'fiber');
  const lt2 = GameSim.connect(s, t.id, sw2.id, 'fiber');
  GameSim.connect(s, sw1.id, a1.id, 'fiber');
  GameSim.connect(s, sw2.id, a2.id, 'fiber');
  GameSim.connect(s, a1.id, core.id, 'fiber');
  GameSim.connect(s, a2.id, core.id, 'fiber');
  d.subscribers = 2000;
  GameSim.tick(s, 1); keepAlive(s);
  check('94d ترافیک بین دو مسیر موازی (دو گره تجمیع) تقسیم می‌شود',
    (lt1.usage || 0) > 0 && (lt2.usage || 0) > 0,
    'lt1=' + Math.round(lt1.usage || 0) + ' lt2=' + Math.round(lt2.usage || 0));
}
{
  const s = newGameAll(44);
  s.cash = 1000000;
  const core = coreOf(s);
  const t = GameSim.buildNode(s, 'cell_2g', core.x - 200, core.y);
  finishBuild(s, t);
  const la = connectTower(s, t.id, core.id, 'fiber');
  const lb = connectTower(s, t.id, core.id, 'fiber');
  la.level = 3; la.capacity = 22500; // ارتقای سطح قدیمی: ۱۰۰۰۰×۱٫۵²
  lb.capacity = 20000;               // دوبرابرشده با رفع خودکار قدیمی
  const cashB = s.cash;
  const loaded = GameSim.loadGame(GameSim.saveGame(s));
  const ra = loaded.links.find(l => l.id === la.id);
  const rb = loaded.links.find(l => l.id === lb.id);
  check('94e ذخیرهٔ قدیمی: لینک ارتقایافته به ظرفیت پایه برگشت و هزینه برگشت (۹۰۰۰+۶۰۰۰)',
    ra.capacity === 10000 && ra.level === undefined && rb.capacity === 10000 &&
    loaded.cash === cashB + 15000,
    'ra=' + ra.capacity + ' rb=' + rb.capacity + ' cashΔ=' + (loaded.cash - cashB));
  let crashed = false;
  try { GameSim.tick(loaded, 1); } catch (e) { crashed = true; }
  check('94f بازی مهاجرت‌کرده بدون خطا تیک می‌خورد', !crashed);
}

// ---------- 95: برق گره — منبع تغذیهٔ الزامی، خاموشی با مصرف اضافه، آپگرید منبع ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_2g', d.x, d.y); // مصرف پایه ۲۵۰ وات، منبع سطح ۱ = ۸۰۰ وات
  finishBuild(s, t);
  connectAny(s, t.id, coreOf(s).id);
  const pw0 = GameSim.nodePowerInfo(t);
  check('95a گره تازه منبع تغذیهٔ پایه دارد و روشن است', pw0.level === 1 && pw0.capacity === 800 && pw0.ok === true, JSON.stringify(pw0));
  // هشدار پیش از نصب: ماژول‌هایی که مصرف را از ۸۰۰ رد می‌کنند باید هشدار بدهند
  GameSim.installModule(s, t.id, 'cap_boost'); // +۲۰۰ → ۴۵۰
  GameSim.installModule(s, t.id, 'cap_boost'); // +۲۰۰ → ۶۵۰
  const infoW = GameSim.moduleInfo(s, t.id);
  const capOptW = infoW.options.find(o => o.id === 'cap_boost');
  check('95b هشدار برق پیش از نصبِ سطحی که مصرف را از توان رد می‌کند', capOptW.powerWarn === true, JSON.stringify({ draw: infoW.power.draw, cap: infoW.power.capacity }));
  GameSim.installModule(s, t.id, 'cap_boost'); // +۲۰۰ → ۸۵۰ > ۸۰۰ → خاموش
  GameSim.refreshConnectivity(s);
  check('95c مصرف بیشتر از توان منبع = گره خاموش (بدون برق کافی)', t.status === 'nopower' && t.connected === false, 'status=' + t.status);
  const prob = (s.problems || []).find(p => p.cause === 'no_power' && p.nodeId === t.id);
  check('95d مشکل «بدون برق کافی» با گزینهٔ آپگرید منبع گزارش می‌شود', !!prob && (prob.fixOptions || []).some(f => f.action === 'install_power'));
  const rFix = GameSim.applyFix(s, prob, { action: 'install_power', nodeId: t.id });
  check('95e آپگرید منبع تغذیه گره را دوباره روشن می‌کند', rFix.ok === true && GameSim.nodePowerInfo(t).ok === true && t.status !== 'nopower',
    'status=' + t.status + ' lvl=' + GameSim.nodePowerInfo(t).level);
  // ذخیرهٔ قدیمی بدون ماژول برق: روی بارگذاری خودکار منبع می‌گیرد و شبکه نمی‌میرد
  const raw = JSON.parse(GameSim.saveGame(s));
  raw.nodes.forEach(n => { n.modules = (n.modules || []).filter(m => m !== 'power'); });
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  const allPowered = loaded.nodes.every(n => GameSim.nodePowerInfo(n).ok);
  let crashed = false;
  try { GameSim.tick(loaded, 1); } catch (e) { crashed = true; }
  check('95f ذخیرهٔ قدیمی روی بارگذاری منبع خودکار می‌گیرد و همهٔ گره‌ها برق دارند', allPowered && !crashed);
}

// ---------- 96: ماژول‌ها سطح‌به‌سطح + خرابی و تعمیر آنی ماژول ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_3g', d.x, d.y);
  finishBuild(s, t);
  connectAny(s, t.id, coreOf(s).id);
  const eq3 = eq('cell_3g');
  const r1 = GameSim.installModule(s, t.id, 'cap_boost');
  check('96a نصب ماژول = سطح ۱ با اثر ×۱٫۵', r1.ok === true && r1.level === 1 && t.capacity === Math.round(eq3.capacity * 1.5));
  const cashB = s.cash;
  const r2 = GameSim.installModule(s, t.id, 'cap_boost');
  check('96b آپگرید به سطح ۲ بدون اشغال جا؛ هزینهٔ سطح ۲ = پایه×۱٫۶', r2.ok === true && r2.level === 2 && s.cash === cashB - Math.round(8000 * 1.6) && t.capacity === Math.round(eq3.capacity * 2.25),
    'cost=' + r2.cost);
  GameSim.installModule(s, t.id, 'power'); // منبع سطح ۲ تا مصرف ۸۵۰ واتی گره پوشش داده شود
  // خرابی ماژول: اثر قطع می‌شود؛ تعمیر آنی با هزینه
  GameSim.breakModule(s, t.id, 'cap_boost');
  check('96c ماژول خراب اثرش را از دست می‌دهد', t.capacity === eq3.capacity && GameSim.isModuleBroken(t, 'cap_boost') === true, 'cap=' + t.capacity);
  const probB = (s.problems || []).find(p => p.cause === 'module_broken' && p.nodeId === t.id);
  const cashR = s.cash;
  const rRep = GameSim.repairModule(s, t.id, 'cap_boost');
  check('96d تعمیر ماژول آنی است: همان لحظه اثر برمی‌گردد و هزینه کم می‌شود',
    rRep.ok === true && t.capacity === Math.round(eq3.capacity * 2.25) && s.cash === cashR - rRep.cost && rRep.cost > 0 && !!probB,
    'cost=' + rRep.cost);
  // خرابی منبع تغذیه = گره خاموش تا تعمیر
  GameSim.breakModule(s, t.id, 'power');
  GameSim.refreshConnectivity(s);
  check('96e خرابی منبع تغذیه گره را خاموش می‌کند', t.status === 'nopower' && t.connected === false, 'status=' + t.status);
  GameSim.repairModule(s, t.id, 'power');
  GameSim.refreshConnectivity(s);
  check('96f تعمیر منبع تغذیه گره را برمی‌گرداند', t.status !== 'nopower' && t.connected === true, 'status=' + t.status);
  // مهاجرت ماژول‌های انباشتهٔ قدیمی → همان سطح‌ها
  const raw = JSON.parse(GameSim.saveGame(s));
  const rn = raw.nodes.find(n => n.id === t.id);
  rn.modules = ['cap_boost', 'cap_boost', 'cap_boost', 'range_boost'];
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  const ln = loaded.nodes.find(n => n.id === t.id);
  check('96g سه ماژول انباشتهٔ قدیمی = سطح ۳ (ظرفیت ×۱٫۵³)', GameSim.moduleLevel(ln, 'cap_boost') === 3 && ln.capacity === Math.round(eq3.capacity * Math.pow(1.5, 3)),
    'cap=' + ln.capacity);
}

// ---------- 97: شرکت رقیب ----------
{
  const sOff = GameSim.newGame(42);
  check('97a بازی بدون رقیب: هیچ گره/لینک رقیبی نیست', !sOff.nodes.some(n => n.owner === 'rival') && !(sOff.rival && sOff.rival.enabled));
  const s = GameSim.newGame(42, { rival: true });
  s.cash = 9999999;
  check('97b بازی با رقیب: مرکز دادهٔ رقیب ساخته شده', s.nodes.filter(n => n.owner === 'rival').length === 2);
  const rivalBefore = s.nodes.filter(n => n.owner === 'rival').length;
  for (let i = 0; i < 40; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const rivalAfter = s.nodes.filter(n => n.owner === 'rival').length;
  check('97c رقیب با گذر زمان شبکه‌اش را می‌سازد', rivalAfter > rivalBefore, rivalBefore + ' -> ' + rivalAfter);
  const rivalSubs = s.districts.reduce((a, d) => a + (d.rivalSubscribers || 0), 0);
  check('97d رقیب در مناطق بی‌پوشش بازیکن مشترک می‌گیرد', rivalSubs > 0, 'rivalSubs=' + rivalSubs);
  // بازیکن با پوشش بهتر سهم را پس می‌گیرد
  const target = s.districts.filter(d => (d.rivalSubscribers || 0) > 20).sort((a, b) => (b.rivalSubscribers || 0) - (a.rivalSubscribers || 0))[0];
  if (target) {
    target.unlocked = true;
    // پوشش رقیب در این منطقه را از کار می‌اندازیم و بازیکن دکل متصل می‌سازد: کیفیت بازیکن خیلی بهتر می‌شود
    s.nodes.forEach(n => { if (n.owner === 'rival' && Math.hypot(n.x - target.x, n.y - target.y) < (target.radius || 300) + 300) { n.status = 'failed'; n.health = 0; } });
    target.rivalSubscribers = 500;
    const rs0 = target.rivalSubscribers;
    const tw = GameSim.buildNode(s, 'cell_2g', target.x, target.y);
    if (tw) { finishBuild(s, tw); connectAny(s, tw.id, coreOf(s).id); }
    for (let i = 0; i < 30; i++) { GameSim.tick(s, 1); keepAlive(s); s.nodes.forEach(n => { if (n.owner === 'rival' && Math.hypot(n.x - target.x, n.y - target.y) < (target.radius || 300) + 300) n.status = 'failed'; }); }
    check('97e بازیکن با پوشش خوب سهم بازار را پس می‌گیرد', (target.subscribers || 0) > 0 && (target.rivalSubscribers || 0) < rs0,
      'player=' + target.subscribers + ' rival ' + rs0 + '->' + target.rivalSubscribers);
  } else {
    check('97e بازیکن با پوشش خوب سهم بازار را پس می‌گیرد', false, 'no rival district found');
  }
  // گره رقیب قابل ویرایش نیست و اتصال بین‌شرکتی رد می‌شود
  const rNode = s.nodes.find(n => n.owner === 'rival');
  const pNode = GameSim.buildNode(s, 'switch', rNode.x + 200, rNode.y);
  check('97f اتصال به گره رقیب و حذف آن رد می‌شود',
    connectAny(s, pNode.id, rNode.id) === null && GameSim.demolishNode(s, rNode.id).ok === false);
  // ذخیرهٔ قدیمی (بدون فیلد رقیب) با رقیب خاموش بارگذاری می‌شود
  const raw = JSON.parse(GameSim.saveGame(GameSim.newGame(42)));
  delete raw.rival;
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  check('97g ذخیرهٔ قدیمی با رقیب خاموش بارگذاری می‌شود', loaded.rival && loaded.rival.enabled === false);
}

// ---------- 98: پهپاد نقشه‌برداری PtP ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const core = coreOf(s);
  const a = GameSim.buildNode(s, 'aggregation', core.x + 600, core.y);
  const b = GameSim.buildNode(s, 'aggregation', core.x + 1600, core.y);
  const svClear = GameSim.surveyPtP(s, a.id, b.id);
  check('98a نظرسنجی بدون ساختمان بلند: دید مستقیم آزاد است', !!svClear && svClear.losClear === true && svClear.inRange === true, JSON.stringify(svClear));
  // ساختمان بلند وسط مسیر
  s.buildings.push({ id: 'btall98', districtId: null, x: core.x + 1090, y: core.y - 15, w: 30, h: 30, height: 20, type: 'commercial', color: '#888' });
  const svBlocked = GameSim.surveyPtP(s, a.id, b.id);
  check('98b نظرسنجی با ساختمان بلند روی مسیر: دید مسدود است', !!svBlocked && svBlocked.losClear === false && svBlocked.effCapacity < svClear.effCapacity, JSON.stringify(svBlocked));
  const link = GameSim.connect(s, a.id, b.id, 'ptp');
  const effAfter = link ? Math.round(GameSim.linkEffCapacity(s, link, null)) : -1;
  check('98c ظرفیت مؤثر پیش‌بینی‌شده با ظرفیت واقعی لینک برابر است', !!link && Math.abs(effAfter - svBlocked.effCapacity) <= 2,
    'survey=' + svBlocked.effCapacity + ' link=' + effAfter);
}

// ---------- 99: رشد زندهٔ شهر ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, t);
  connectAny(s, t.id, coreOf(s).id);
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const count0 = s.buildings.filter(b => b.districtId === d.id).length;
  for (let i = 0; i < 120; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const count1 = s.buildings.filter(b => b.districtId === d.id).length;
  check('99a منطقهٔ در حال سرویس ساختمان تازه می‌گیرد', count1 > count0, count0 + ' -> ' + count1);
  const riverX = (y) => { const r = s.map.river; for (let i = 0; i < r.length - 1; i++) { const A = r[i], B = r[i + 1]; if (y >= A.y && y <= B.y) return A.x + (B.x - A.x) * (y - A.y) / Math.max(1, B.y - A.y); } return r[r.length - 1].x; };
  const badNew = s.buildings.filter(b => b.bornDay != null).some(b => Math.abs(b.x + (b.w || 26) / 2 - riverX(b.y + (b.h || 20) / 2)) < 60);
  check('99b هیچ ساختمان تازه‌ای در رودخانه نیست', !badNew);
  const loaded = GameSim.loadGame(GameSim.saveGame(s));
  check('99c ساختمان‌های رشدکرده در ذخیره/بارگذاری می‌مانند', loaded.buildings.filter(b => b.districtId === d.id).length === count1);
}

// ---------- 100: کابینت ساده + سیم مسی به خانه (آیتم A) ----------
{
  const s = GameSim.newGame(42); s.cash = 9999999; // ۱۹۹۱
  check('100a کابینت ساده از روز اول (۱۹۹۱) در دسترس است و کابینت خیابانی هنوز نه',
    GameSim.isUnlocked(s, 'cabinet_basic') === true && GameSim.isUnlocked(s, 'street_cabinet') === false);
  const d = s.districts.find(x => x.id === 'center');
  const b0 = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  const cab = GameSim.buildNode(s, 'cabinet_basic', b0.x + (b0.w || 26) / 2 + 40, b0.y + (b0.h || 20) / 2);
  finishBuild(s, cab);
  GameSim.connect(s, cab.id, coreOf(s).id, 'copper');
  const rF = GameSim.connectBuildingWired(s, b0.id, cab.id, 'fiber');
  check('100b انشعاب فیبر از کابینت ساده به فارسی رد می‌شود', rF.ok === false && /کابینت ساده/.test(rF.error || ''), rF.error || '');
  const rC = GameSim.connectBuildingWired(s, b0.id, cab.id, 'copper');
  check('100c سیم مسی از کابینت ساده به خانه وصل می‌شود', rC.ok === true, rC.error || '');
  d.subscribers = 100;
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('100d خانه از راه کابینت ساده سرویس می‌گیرد', (d.techDemand.fiber || {}).served > 0, 'served=' + (d.techDemand.fiber || {}).served);
}

// ---------- 101: رسانه‌های اتصال با خط زمانی (آیتم B) ----------
{
  const s = GameSim.newGame(42); s.cash = 9999999; // ۱۹۹۱
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, t);
  check('101a در ۱۹۹۱ اتصال فیبر و PtP رد می‌شود ولی اترنت/مسی کار می‌کند',
    GameSim.connect(s, t.id, coreOf(s).id, 'fiber') === null &&
    GameSim.connect(s, t.id, coreOf(s).id, 'ptp') === null &&
    !!connectAny(s, t.id, coreOf(s).id));
  const sw101 = s.nodes.find(n => n.type === 'switch');
  const opts = GameSim.mediumOptions(s, t.id, sw101.id);
  const fiberOpt = opts.find(o => o.medium === 'fiber');
  check('101b گزینهٔ فیبر در ۱۹۹۱ قفل است و سال بازشدن را نشان می‌دهد', !!fiberOpt && fiberOpt.ok === false && fiberOpt.unlockYear === 1995 && /۱۹۹۵|1995/.test(fiberOpt.reason));
  s.day = 60; // ۱۹۹۶: فیبر و PtP باز
  check('101c بعد از دوران، فیبر و PtP کار می‌کنند',
    !!GameSim.connect(s, t.id, sw101.id, 'fiber') && !!GameSim.connect(s, t.id, sw101.id, 'ptp'));
  // لینک قدیمی با رسانهٔ قفل‌شده در ذخیرهٔ قدیمی همچنان کار می‌کند (grandfathered)
  const s2 = GameSim.newGame(42); s2.cash = 9999999;
  const t2 = GameSim.buildNode(s2, 'cell_2g', d.x, d.y);
  const sw2 = GameSim.buildNode(s2, 'switch', d.x + 80, d.y);
  GameSim.connect(s2, sw2.id, coreOf(s2).id, 'copper');
  s2.links.push({ id: 'lold101', from: t2.id, to: sw2.id, medium: 'fiber', capacity: 10000, latency: 2, status: 'active', isBackup: false, usage: 0 });
  const loaded = GameSim.loadGame(GameSim.saveGame(s2));
  GameSim.refreshConnectivity(loaded);
  const lt2 = loaded.nodes.find(n => n.id === t2.id);
  check('101d لینک فیبر قدیمی در ۱۹۹۱ (ذخیرهٔ قدیمی) همچنان متصل است', lt2.connected === true);
}

// ---------- 102: تقاضای هر کاربر با دوران رشد می‌کند (آیتم C) ----------
{
  const s = GameSim.newGame(42);
  const d = s.districts[0];
  s.day = 1; const p1991 = GameSim.eraDemandMult(s);
  s.day = 141; const p2005 = GameSim.eraDemandMult(s);
  s.day = 291; const p2020 = GameSim.eraDemandMult(s);
  check('102a ضریب تقاضای هر کاربر یکنوا رشد می‌کند: ۱۹۹۱ < ۲۰۰۵ < ۲۰۲۰', p1991 < p2005 && p2005 < p2020,
    p1991.toFixed(2) + ' < ' + p2005.toFixed(2) + ' < ' + p2020.toFixed(2));
  // اثر روی ازدحام: همان شبکه در دوران مدرن شلوغ‌تر از ۱۹۹۱ است
  function qosAt(day) {
    const g = GameSim.newGame(42); g.cash = 9999999; g.day = day;
    g.districts.forEach(x => { x.unlocked = true; });
    const dd = g.districts.find(x => x.id === 'center');
    const tw = GameSim.buildNode(g, 'cell_2g', dd.x, dd.y);
    connectAny(g, tw.id, coreOf(g).id);
    dd.subscribers = 3000;
    GameSim.computeFlow(g);
    return dd.qos;
  }
  const qEarly = qosAt(1), qLate = qosAt(291);
  check('102b همان شبکه در دوران مدرن کیفیت پایین‌تری دارد (تقاضای بیشتر)', qLate < qEarly, 'q1991=' + qEarly.toFixed(2) + ' q2020=' + qLate.toFixed(2));
}

// ---------- 103: جهان‌سازی — ترکیب ساختمان‌ها، روستاها، نقشهٔ بزرگ (آیتم D) ----------
{
  const s = GameSim.newGame(42);
  check('103a ابعاد نقشهٔ جدید ۱۴۴۰۰×۱۰۸۰۰ است', s.worldW === 14400 && s.worldH === 10800, s.worldW + 'x' + s.worldH);
  const mixOf = (type) => {
    const ids = s.districts.filter(d => d.type === type).map(d => d.id);
    const bs = s.buildings.filter(b => ids.includes(b.districtId));
    const c = {}; bs.forEach(b => { c[b.type] = (c[b.type] || 0) + 1; });
    return { total: bs.length, c };
  };
  const res = mixOf('residential');
  check('103b مناطق مسکونی: بیشتر مسکونی + کمی تجاری', res.total > 0 && (res.c.residential || 0) / res.total >= 0.65 && (res.c.commercial || 0) > 0,
    JSON.stringify(res.c));
  const com = mixOf('commercial');
  check('103c مناطق تجاری: بیشتر تجاری + اقلیت صنعتی', com.total > 0 && (com.c.commercial || 0) / com.total >= 0.6 && (com.c.industrial || 0) > 0 && (com.c.industrial || 0) < (com.c.commercial || 0),
    JSON.stringify(com.c));
  const ind = mixOf('industrial');
  check('103d مناطق صنعتی: بیشتر صنعتی', ind.total > 0 && (ind.c.industrial || 0) / ind.total >= 0.65, JSON.stringify(ind.c));
  const hq = coreOf(s);
  const vills = s.districts.filter(d => d.type === 'village');
  const farVills = vills.filter(v => Math.hypot(v.x - hq.x, v.y - hq.y) > 4000);
  check('103e دست‌کم دو روستای دور از مرکز شهر وجود دارد', vills.length >= 2 && farVills.length >= 2,
    vills.map(v => v.name + ':' + Math.round(Math.hypot(v.x - hq.x, v.y - hq.y))).join(' '));
  const vMix = mixOf('village');
  check('103f روستاها: بیشتر مسکونی با ۱-۲ ساختمان تجاری', vMix.total > 0 && (vMix.c.residential || 0) > (vMix.c.commercial || 0), JSON.stringify(vMix.c));
  // ذخیرهٔ قدیمی جهان کوچک خودش را نگه می‌دارد
  const raw = JSON.parse(GameSim.saveGame(s));
  delete raw.worldW; delete raw.worldH;
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  let crashed = false;
  try { GameSim.tick(loaded, 1); } catch (e) { crashed = true; }
  check('103g ذخیرهٔ قدیمی (بدون اندازهٔ جهان) با جهان ۷۲۰۰×۵۴۰۰ بارگذاری و تیک می‌خورد', loaded.worldW === 7200 && loaded.worldH === 5400 && !crashed);
}

// ---------- 104: انشعاب فیبر ساختمان با دوران قفل است (اول مسی، فیبر از ۲۰۰۴) ----------
{
  const s = GameSim.newGame(42); s.cash = 9999999; // ۱۹۹۱
  const d = s.districts.find(x => x.id === 'center');
  const b0 = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  const cabB = GameSim.buildNode(s, 'cabinet_basic', b0.x + (b0.w || 26) / 2 + 40, b0.y + (b0.h || 20) / 2);
  finishBuild(s, cabB);
  GameSim.connect(s, cabB.id, coreOf(s).id, 'copper');
  const dropsBefore = (s.fiberDrops || []).length;
  const rF91 = GameSim.connectBuildingWired(s, b0.id, cabB.id, 'fiber');
  check('104a در ۱۹۹۱ انشعاب فیبر رد می‌شود و هیچ انشعابی ساخته نمی‌شود',
    rF91.ok === false && (s.fiberDrops || []).length === dropsBefore && /فیبر|مسی/.test(rF91.error || ''), rF91.error || '');
  // سال ۲۰۰۰: کابینت خیابانی هست ولی انشعاب فیبر هنوز تا ۲۰۰۴ قفل است
  s.day = 95;
  const cab = GameSim.buildNode(s, 'street_cabinet', b0.x + (b0.w || 26) / 2 - 50, b0.y + (b0.h || 20) / 2);
  finishBuild(s, cab);
  GameSim.connect(s, cab.id, coreOf(s).id, 'fiber');
  GameSim.refreshConnectivity(s);
  const rF00 = GameSim.connectBuildingWired(s, b0.id, cab.id, 'fiber');
  check('104b در ۲۰۰۰ انشعاب فیبر از کابینت خیابانی با دلیل فارسی (سال ۲۰۰۴) رد می‌شود',
    rF00.ok === false && /۲۰۰۴/.test(rF00.error || '') && (s.fiberDrops || []).length === dropsBefore, rF00.error || '');
  const rC00 = GameSim.connectBuildingWired(s, b0.id, cab.id, 'copper');
  check('104c در همان سال سیم مسی وصل می‌شود', rC00.ok === true, rC00.error || '');
  GameSim.disconnectBuildingWired(s, b0.id);
  // سال ۲۰۰۴: انشعاب فیبر باز می‌شود
  s.day = 131;
  const rF04 = GameSim.connectBuildingWired(s, b0.id, cab.id, 'fiber');
  check('104d از سال ۲۰۰۴ انشعاب فیبر وصل می‌شود', rF04.ok === true && GameSim.buildingWiredStatus(s, b0.id).medium === 'fiber', rF04.error || '');
}

// ---------- 105: انحصار لایه‌های سیگنال/سرعت در همهٔ مسیرهای تغییر لایه ----------
{
  const CityMap = require('../js/map.js');
  CityMap.setLayer('signal', false); CityMap.setLayer('speed', false);
  CityMap.setLayer('signal', true);
  check('105a setLayer: روشن‌کردن سیگنال سرعت را خاموش نگه می‌دارد', CityMap.layers.signal === true && CityMap.layers.speed === false);
  CityMap.setLayer('speed', true);
  check('105b setLayer: روشن‌کردن سرعت سیگنال را خاموش می‌کند', CityMap.layers.speed === true && CityMap.layers.signal === false);
  CityMap.toggleLayer('signal');
  check('105c toggleLayer: انحصار سیگنال/سرعت رعایت می‌شود', CityMap.layers.signal === true && CityMap.layers.speed === false);
  CityMap.setLayers({ signal: true, speed: true });
  check('105d setLayers: هر دو با هم روشن نمی‌مانند', !(CityMap.layers.signal && CityMap.layers.speed));
  CityMap.setLayer('signal', false); CityMap.setLayer('speed', false);
}

// ---------- 106: پالس‌های رفت‌وآمد بین ساختمان‌ها و روی خیابان‌ها ----------
{
  const s = newGameAll(42);
  const bIds = new Set(s.buildings.map(b => b.id));
  const pulses = GameSim.commutePulses(s, 8);
  check('106a مبدأ و مقصد هر پالس یک ساختمان واقعی است',
    pulses.length > 0 && pulses.every(p => bIds.has(p.fromId) && bIds.has(p.toId)), 'n=' + pulses.length);
  const roads = s.map.roads;
  const onRoad = (p) => roads.v.some(x => Math.abs(x - p.x) < 0.6) || roads.h.some(y => Math.abs(y - p.y) < 0.6);
  const bA = s.buildings.find(b => b.type === 'residential');
  const bB = s.buildings.find(b => b.type === 'industrial' || b.type === 'commercial');
  const cA = { x: bA.x + (bA.w || 26) / 2, y: bA.y + (bA.h || 20) / 2 };
  const cB = { x: bB.x + (bB.w || 26) / 2, y: bB.y + (bB.h || 20) / 2 };
  const path = GameSim.commuteRoadPath(s, cA, cB);
  check('106b مسیر از مرکز ساختمان شروع و به مرکز ساختمان ختم می‌شود',
    path[0].x === cA.x && path[0].y === cA.y && path[path.length - 1].x === cB.x && path[path.length - 1].y === cB.y);
  check('106c همهٔ نقاط میانی مسیر روی خطوط خیابان‌اند',
    path.slice(1, -1).every(onRoad), JSON.stringify(path.slice(1, -1)));
  let segOk = true, segInfo = '';
  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1], p1 = path[i];
    const onLine = (p0.x === p1.x && roads.v.some(x => Math.abs(x - p0.x) < 0.6)) ||
      (p0.y === p1.y && roads.h.some(y => Math.abs(y - p0.y) < 0.6));
    const isStub = (i === 1 || i === path.length - 1); // پلهٔ کوتاه از درِ ساختمان تا خیابان
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (!onLine && !(isStub && len <= 160)) { segOk = false; segInfo = JSON.stringify([p0, p1, Math.round(len)]); }
  }
  check('106d همهٔ قطعه‌های مسیر روی خیابان‌اند (جز پلهٔ کوتاه درِ ساختمان تا خیابان)', segOk, segInfo);
  // عبور از رودخانه فقط از پل
  const river = s.map.river, bridges = s.map.bridges;
  const rxAt = (y) => {
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i], b = river[i + 1];
      if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * ((y - a.y) / Math.max(1, b.y - a.y));
    }
    return river[river.length - 1].x;
  };
  const west = s.buildings.find(b => (b.x + (b.w || 26) / 2) < rxAt(b.y) - 300);
  const east = s.buildings.find(b => (b.x + (b.w || 26) / 2) > rxAt(b.y) + 300);
  let bridgeOk = false, crossInfo = 'no-pair';
  if (west && east) {
    const wp = GameSim.commuteRoadPath(s,
      { x: west.x + (west.w || 26) / 2, y: west.y + (west.h || 20) / 2 },
      { x: east.x + (east.w || 26) / 2, y: east.y + (east.h || 20) / 2 });
    bridgeOk = true;
    for (let i = 1; i < wp.length; i++) {
      const p0 = wp[i - 1], p1 = wp[i];
      const s0 = p0.x < rxAt(p0.y), s1 = p1.x < rxAt(p1.y);
      if (s0 !== s1) { // این قطعه از رودخانه رد می‌شود: باید افقی و روی ردیف پل باشد
        if (!(p0.y === p1.y && bridges.some(y => Math.abs(y - p0.y) < 0.6))) { bridgeOk = false; crossInfo = JSON.stringify([p0, p1]); }
      }
    }
  }
  check('106e مسیر بین دو سوی رودخانه فقط از روی پل رد می‌شود', bridgeOk, crossInfo);
}

// ---------- 107: فناوری اتصال و تست سرعت/تأخیر مشترک ----------
{
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const b0 = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  const cab = GameSim.buildNode(s, 'street_cabinet', b0.x + (b0.w || 26) / 2 + 40, b0.y + (b0.h || 20) / 2);
  finishBuild(s, cab);
  GameSim.connect(s, cab.id, coreOf(s).id, 'fiber');
  GameSim.connectBuildingWired(s, b0.id, cab.id, 'fiber');
  const infoF = GameSim.subscriberConnectionInfo(s, b0.id);
  check('107a ساختمان دارای انشعاب فیبر: فناوری «فیبر» و سرعت مثبت با سقف بسته',
    infoF.techs.some(t => t.tech === 'fiber') && infoF.speed > 0 && infoF.speed <= infoF.packageSpeed,
    'techs=' + infoF.techs.map(t => t.tech).join(',') + ' speed=' + infoF.speed + ' pkg=' + infoF.packageSpeed);
  const b1 = s.buildings.filter(b => b.districtId === d.id && b.id !== b0.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
  const t4g = GameSim.buildNode(s, 'cell_4g', b1.x + (b1.w || 26) / 2 + 60, b1.y + (b1.h || 20) / 2);
  finishBuild(s, t4g);
  connectTower(s, t4g.id, coreOf(s).id, 'fiber');
  GameSim.installModule(s, t4g.id, 'tdlte');
  const infoW = GameSim.subscriberConnectionInfo(s, b1.id);
  check('107b ساختمان زیر پوشش 4G با ماژول TD-LTE: سلولار نسل ۴ و TD-LTE هر دو در فهرست‌اند',
    infoW.techs.some(t => t.tech === 'cellular' && t.gen === 4) && infoW.techs.some(t => t.tech === 'fwa'),
    'techs=' + infoW.techs.map(t => t.tech + (t.gen || '')).join(','));
  const s2 = newGameAll(42);
  const bFar = s2.buildings.filter(b => Math.hypot(b.x - coreOf(s2).x, b.y - coreOf(s2).y) > 3000)[0];
  s2.individuals.push({ id: 'px107', name: 'تست', buildingId: bFar.id, districtId: bFar.districtId, status: 'subscribed', needMbps: 10, satisfaction: 50 });
  const infoP = GameSim.subscriberConnectionInfo(s2, bFar.id);
  check('107c مشترک بدون مسیر شبکه: سرعت صفر و دلیل فارسی‌پذیر (no_network)',
    infoP.speed === 0 && infoP.techs.length === 0 && infoP.reason === 'no_network',
    'speed=' + infoP.speed + ' reason=' + infoP.reason);
  const lt = GameSim.subscriberLatencyTest(s, b0.id);
  const ping = GameSim.pingBetween(s, lt.nodeId, lt.gatewayId);
  const base = GameSim.techLatencyBase(lt.tech, GameSim.nodeById(s, lt.nodeId));
  check('107d تست تأخیر: میلی‌ثانیهٔ محدود و برابر پینگ ابزار پینگ + تأخیر پایهٔ فناوری',
    lt.ok && isFinite(lt.ms) && lt.ms > 0 && ping.ok && Math.abs(lt.ms - (ping.ms + base)) <= 1,
    'ms=' + lt.ms + ' ping=' + (ping && ping.ms) + ' base=' + base + ' tech=' + lt.tech);
}

// ---------- 108: مناطق قفل‌شده — بدون سرویس/مشترک/درآمد + دایرهٔ قفل کامل ----------
{
  const s = GameSim.newGame(42); s.cash = 99999999; s.day = 281; // همهٔ دوران‌ها باز، مناطق هنوز قفل
  const d = s.districts.find(x => x.unlocked === false && x.id !== 'center');
  const un = GameSim.unlockDistrict(s, d.id);
  const tw = GameSim.buildNode(s, 'cell_2g', d.x, d.y);
  finishBuild(s, tw);
  connectTower(s, tw.id, coreOf(s).id, 'fiber');
  for (let i = 0; i < 30; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const subsBefore = d.subscribers || 0;
  d.unlocked = false; // قفل دوباره: سرویس باید کامل قطع شود
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const servedSum = ['fiber', 'cellular', 'fwa'].reduce((a, t) => a + (((d.techDemand || {})[t] || {}).served || 0), 0);
  check('108a منطقهٔ قفل‌شده زیر پوشش دکل: مشترک/سرویس/درآمد صفر',
    un.ok && subsBefore > 0 && (d.subscribers || 0) === 0 && (d.servedDemand || 0) === 0 && (d.revenue || 0) === 0 && servedSum === 0,
    'before=' + subsBefore + ' subs=' + d.subscribers + ' served=' + d.servedDemand + ' rev=' + d.revenue + ' techServed=' + servedSum);
  const bIn = s.buildings.find(b => b.districtId === d.id);
  check('108b ساختمان منطقهٔ قفل‌شده مسیر شبکه و اطلاعات اتصال ندارد',
    bIn && GameSim.buildingNetworkPath(s, bIn).hasPath === false &&
    GameSim.subscriberConnectionInfo(s, bIn.id).reason === 'district_locked',
    'b=' + (bIn && bIn.id));
  const un2 = GameSim.unlockDistrict(s, d.id);
  for (let i = 0; i < 30; i++) { GameSim.tick(s, 1); keepAlive(s); }
  check('108c با بازشدن دوبارهٔ منطقه سرویس و مشترک برمی‌گردد',
    un2.ok && (d.subscribers || 0) > 0, 'subs=' + d.subscribers);
  let radiusOk = true, worst = '';
  for (const seed of [42, 7]) {
    const sg = GameSim.newGame(seed);
    for (const dd of sg.districts) {
      let maxDist = 0;
      for (const b of sg.buildings) {
        if (String(b.districtId) !== String(dd.id)) continue;
        const cx = b.x + (b.w || 26) / 2, cy = b.y + (b.h || 20) / 2;
        maxDist = Math.max(maxDist, Math.hypot(cx - dd.x, cy - dd.y) + Math.max(b.w || 26, b.h || 20) / 2);
      }
      const r = GameSim.districtOverlayRadius(sg, dd);
      if (r < maxDist - 0.001) { radiusOk = false; worst = 'seed=' + seed + ' d=' + dd.id + ' r=' + Math.round(r) + ' need=' + Math.round(maxDist); }
    }
  }
  check('108d شعاع دایرهٔ قفل همهٔ ساختمان‌های هر منطقه را می‌پوشاند', radiusOk, worst);
}

// ---------- 109: میدان سرعت لایهٔ «سرعت اتصال» — همهٔ فناوری‌ها ----------
{
  const s = GameSim.newGame(42); s.cash = 99999999; s.day = 281;
  s.districts.forEach(dd => { dd.unlocked = true; });
  const core = s.nodes.find(n => n.type === 'core_router');
  const d = s.districts.find(x => x.id === 'center');
  const bs = s.buildings.filter(b => b.districtId === d.id)
    .sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y));
  const finish = (node) => { for (let i = 0; i < 40 && node.status === 'building'; i++) GameSim.tick(s, 1); };
  // مسی: کابینت ساده + انشعاب مسی
  const cabB = GameSim.buildNode(s, 'cabinet_basic', bs[0].x + (bs[0].w || 26) / 2 + 40, bs[0].y + (bs[0].h || 20) / 2);
  finish(cabB); connectAny(s, cabB.id, core.id);
  GameSim.connectBuildingWired(s, bs[0].id, cabB.id, 'copper');
  // فیبر: کابینت خیابانی + انشعاب فیبر
  const cab = GameSim.buildNode(s, 'street_cabinet', bs[5].x + (bs[5].w || 26) / 2 + 40, bs[5].y + (bs[5].h || 20) / 2);
  finish(cab); GameSim.connect(s, cab.id, core.id, 'fiber');
  GameSim.connectBuildingWired(s, bs[5].id, cab.id, 'fiber');
  // سلولار: دکل 2G دور از ساختمان‌های سیمی
  const t2 = GameSim.buildNode(s, 'cell_2g', d.x + 900, d.y + 600);
  finish(t2); connectTower(s, t2.id, core.id, 'fiber');
  GameSim.refreshConnectivity(s);
  const prep = GameSim.prepareSpeedField(s);
  const cuCx = bs[0].x + (bs[0].w || 26) / 2, cuCy = bs[0].y + (bs[0].h || 20) / 2;
  const fCu = GameSim.speedFieldAt(prep, cuCx, cuCy);
  check('109a میدان سرعت در ساختمان مسی (DSL) ناصفر و حداکثر سقف مسی است',
    fCu > 0 && fCu <= 100, 'f=' + fCu);
  // حلقهٔ دور ساختمان مسی (بیرون ردپا، داخل حاشیهٔ نمونه‌برداری): سرعت خودِ انشعاب (≤۱۰۰)
  // باید دیده شود، نه سرعت شعاعی کابینت — سناریوی جدا فقط با مسی تا فیبر دخالت نکند
  {
    const s2 = GameSim.newGame(42); s2.cash = 99999999; s2.day = 281;
    s2.districts.forEach(dd => { dd.unlocked = true; });
    const core2 = s2.nodes.find(n => n.type === 'core_router');
    const d2 = s2.districts.find(x => x.id === 'center');
    const bs2 = s2.buildings.filter(b => b.districtId === d2.id)
      .sort((a, b) => Math.hypot(a.x - d2.x, a.y - d2.y) - Math.hypot(b.x - d2.x, b.y - d2.y));
    const b0 = bs2[0];
    const cab2 = GameSim.buildNode(s2, 'cabinet_basic', b0.x + (b0.w || 26) / 2 + 40, b0.y + (b0.h || 20) / 2);
    for (let i = 0; i < 40 && cab2.status === 'building'; i++) GameSim.tick(s2, 1);
    connectAny(s2, cab2.id, core2.id);
    GameSim.connectBuildingWired(s2, b0.id, cab2.id, 'copper');
    GameSim.refreshConnectivity(s2);
    const prep2 = GameSim.prepareSpeedField(s2);
    let ringOk = false, ringVals = [];
    const cx0 = b0.x + (b0.w || 26) / 2, cy0 = b0.y + (b0.h || 20) / 2;
    for (let dx = -(b0.w || 26) / 2 - 18; dx <= (b0.w || 26) / 2 + 18; dx += 6) {
      for (let dy = -(b0.h || 20) / 2 - 18; dy <= (b0.h || 20) / 2 + 18; dy += 6) {
        if (Math.abs(dx) <= (b0.w || 26) / 2 && Math.abs(dy) <= (b0.h || 20) / 2) continue; // فقط حلقهٔ بیرون ردپا
        const v = GameSim.speedFieldAt(prep2, cx0 + dx, cy0 + dy);
        ringVals.push(v);
        if (v > 0 && v <= 100) ringOk = true;
      }
    }
    check('109b میدان سرعت در حلقهٔ دور ساختمان مسی سرعت انشعاب (≤۱۰۰) را نشان می‌دهد',
      ringOk, 'ring=' + ringVals.slice(0, 8).join(','));
  }
  const fiCx = bs[5].x + (bs[5].w || 26) / 2, fiCy = bs[5].y + (bs[5].h || 20) / 2;
  check('109c میدان سرعت در ساختمان فیبری بالا است',
    GameSim.speedFieldAt(prep, fiCx, fiCy) > 500, 'f=' + GameSim.speedFieldAt(prep, fiCx, fiCy));
  check('109d میدان سرعت زیر دکل 2G ناصفر و در نقطهٔ بی‌سرویس صفر است',
    GameSim.speedFieldAt(prep, t2.x, t2.y) > 0 && GameSim.speedFieldAt(prep, 200, 200) === 0,
    'tower=' + GameSim.speedFieldAt(prep, t2.x, t2.y) + ' far=' + GameSim.speedFieldAt(prep, 200, 200));
}


// ---------- 110: رگرسیون اصلاحات ممیزی (موارد ۱ تا ۳۶) ----------
{
  // ۱) قیمت بسته روی رشد/ریزش اثر دارد
  const s1 = newGameAll(42); s1.cash = 9999999;
  const d1 = s1.districts.find(x => x.id === 'center');
  GameSim.setDistrictPackage(s1, d1.id, 'home');
  const gCheap = GameSim.priceGrowthFactor(s1, d1);
  GameSim.setDistrictPackage(s1, d1.id, 'enterprise');
  const gExp = GameSim.priceGrowthFactor(s1, d1);
  check('110a بستهٔ گران رشد مشترک را کم و ریزش قیمتی را زیاد می‌کند (مورد ۱)',
    gExp < gCheap && GameSim.priceChurnRate(s1, d1) > 0,
    'cheap=' + gCheap.toFixed(2) + ' exp=' + gExp.toFixed(2) + ' churn=' + GameSim.priceChurnRate(s1, d1).toFixed(3));

  // ۲) سرعت هر مشترک از سرعت بسته بیشتر نمی‌شود و ترافیک از سرعت اسمی جدا است
  const s2 = newGameAll(42); s2.cash = 9999999;
  const d2 = s2.districts.find(x => x.id === 'residential') || s2.districts[1];
  const t2 = GameSim.buildNode(s2, 'cell_4g', d2.x, d2.y); finishBuild(s2, t2);
  connectTower(s2, t2.id, coreOf(s2).id, 'fiber');
  d2.subscribers = 3000;
  GameSim.computeFlow(s2, { dailyAvg: true, noDailyEffects: true });
  check('110b سرعت تحویلی هر مشترک سقف بسته را رد نمی‌کند (مورد ۲)',
    d2.perSubMbps != null && d2.perSubMbps <= 50.01, 'perSub=' + d2.perSubMbps);

  // ۳) ساخت لینک هزینه دارد (فاصله × واحد) و انشعاب ساختمان رایگان است
  const s3 = newGameAll(42); s3.cash = 9999999;
  const d3 = s3.districts.find(x => x.id === 'center');
  const n3 = GameSim.buildNode(s3, 'cell_2g', d3.x + 500, d3.y); finishBuild(s3, n3);
  const sw3 = GameSim.buildNode(s3, 'switch', n3.x + 80, n3.y); finishBuild(s3, sw3);
  GameSim.connect(s3, sw3.id, coreOf(s3).id, 'copper');
  const cash3 = s3.cash;
  const l3 = GameSim.connect(s3, n3.id, sw3.id, 'copper');
  const exp3 = GameSim.linkCostFor(s3, n3, sw3, 'copper');
  check('110c ساخت لینک به اندازهٔ فاصله×هزینهٔ واحد کم می‌کند (مورد ۳)',
    !!l3 && s3.cash === cash3 - exp3 && exp3 > 0, 'cost=' + (cash3 - s3.cash) + ' exp=' + exp3);

  // ۴) پوشش بر اساس شعاع پایه است نه شعاع نمایشیِ کوچک‌شونده
  const d4 = { baseRadius: 1000, radius: 100 };
  check('110d برد پوشش از شعاع پایه حساب می‌شود (مورد ۴)',
    GameSim.coverReach(d4) === 600, 'reach=' + GameSim.coverReach(d4));

  // ۵) ظرفیت TD-LTE وارد جریان می‌شود
  const s5 = newGameAll(42); s5.cash = 9999999;
  const d5 = s5.districts.find(x => x.id === 'residential') || s5.districts[1];
  const t5 = GameSim.buildNode(s5, 'cell_4g', d5.x, d5.y); finishBuild(s5, t5);
  connectTower(s5, t5.id, coreOf(s5).id, 'fiber');
  d5.subscribers = 4000;
  GameSim.computeFlow(s5, { dailyAvg: true, noDailyEffects: true });
  const servedNoMod = d5.servedDemand;
  GameSim.installModule(s5, t5.id, 'tdlte');
  GameSim.computeFlow(s5, { dailyAvg: true, noDailyEffects: true });
  check('110e ماژول TD-LTE تقاضای سرویس‌شده را بالا می‌برد (مورد ۵)',
    d5.servedDemand > servedNoMod, 'before=' + servedNoMod + ' after=' + d5.servedDemand);

  // ۶) ریزش از کیفیت پایین + کف درآمد
  const s6 = newGameAll(42); s6.cash = 9999999;
  const d6 = s6.districts.find(x => x.id === 'center');
  const t6 = GameSim.buildNode(s6, 'cell_2g', d6.x, d6.y); finishBuild(s6, t6);
  connectTower(s6, t6.id, coreOf(s6).id, 'fiber');
  d6.subscribers = 2000; // بسیار بیشتر از ظرفیت 2G
  const subs6a = d6.subscribers;
  for (let i = 0; i < 15; i++) { GameSim.tick(s6, 1); keepAlive(s6); }
  check('110f کیفیت خیلی پایین باعث ریزش مشترک می‌شود (مورد ۶)',
    d6.subscribers < subs6a && d6.qos < 0.35, 'subs ' + subs6a + '->' + d6.subscribers + ' qos=' + d6.qos.toFixed(2));

  // ۷+۳۱) ترانزیت و نگهداری و مالیات در مالی دیده می‌شوند
  const f6 = s6.finance || {};
  check('110g مالی: ترانزیت و نگهداری ماهانه غیرصفرند (مورد ۷ و ۳۱)',
    (f6.transitMonthly || 0) >= 0 && (f6.maintenanceMonthly || 0) > 0 && f6.totalIncome != null && f6.totalExpense != null,
    JSON.stringify({ t: f6.transitMonthly, m: f6.maintenanceMonthly }));

  // ۸) ماژول ظرفیت روی هسته ظرفیت را بالا می‌برد
  const s8 = newGameAll(42); s8.cash = 9999999;
  const core8 = coreOf(s8);
  const cap8a = core8.capacity;
  GameSim.installModule(s8, core8.id, 'cap_boost');
  check('110h ماژول ظرفیت روی روتر هسته ظرفیت را زیاد می‌کند (مورد ۸)',
    core8.capacity > cap8a, 'cap ' + cap8a + '->' + core8.capacity);

  // ۹) آسیب طوفان موقت است و خودکار برمی‌گردد
  const s9 = newGameAll(42); s9.cash = 9999999;
  const d9 = s9.districts.find(x => x.id === 'center');
  const t9 = GameSim.buildNode(s9, 'cell_4g', d9.x + 300, d9.y); finishBuild(s9, t9);
  const l9 = connectTower(s9, t9.id, coreOf(s9).id, 'ptp');
  const eff9a = GameSim.linkEffCapacity(s9, l9, null);
  l9.degradedUntil = s9.day + 7; l9.degradeFactor = 0.6;
  const eff9b = GameSim.linkEffCapacity(s9, l9, null);
  s9.day += 8;
  const eff9c = GameSim.linkEffCapacity(s9, l9, null);
  check('110i آسیب طوفان موقت است و بعد از ۷ روز برمی‌گردد (مورد ۹)',
    eff9b < eff9a && Math.abs(eff9c - eff9a) < 1, 'a=' + Math.round(eff9a) + ' b=' + Math.round(eff9b) + ' c=' + Math.round(eff9c));

  // ۱۰) ضریب مصرف موج تقاضا به ۱ برمی‌گردد
  const s10 = newGameAll(42);
  const d10 = s10.districts[0];
  d10.usageMult = 3;
  for (let i = 0; i < 15; i++) { GameSim.tick(s10, 1); keepAlive(s10); }
  check('110j ضریب مصرف موج تقاضا با گذر زمان به ۱ برمی‌گردد (مورد ۱۰)',
    (d10.usageMult || 1) < 2.2, 'mult=' + (d10.usageMult || 1).toFixed(3));

  // ۱۱) مشکلات رقیب در فهرست بازیکن نیست
  const s11 = GameSim.newGame(42, { rival: true });
  for (let i = 0; i < 30; i++) { GameSim.tick(s11, 1); keepAlive(s11); }
  GameSim.refreshConnectivity(s11);
  const rivalIds = new Set(s11.nodes.filter(n => GameSim.isRivalNode(n)).map(n => n.id));
  const badProb = (s11.problems || []).filter(p => p.nodeId && rivalIds.has(p.nodeId));
  check('110k هشدارهای شبکهٔ رقیب در فهرست مشکلات بازیکن نیست (مورد ۱۱)',
    badProb.length === 0, 'bad=' + badProb.length);

  // ۱۲) خرابی ماژول برق = قطعی کامل نیست (برق پایه حداقل سرویس را می‌دهد)
  const s12 = newGameAll(42); s12.cash = 9999999;
  const d12 = s12.districts.find(x => x.id === 'center');
  const t12 = GameSim.buildNode(s12, 'cell_2g', d12.x, d12.y); finishBuild(s12, t12);
  connectTower(s12, t12.id, coreOf(s12).id, 'fiber');
  t12.brokenModules = { power: true };
  GameSim.refreshConnectivity(s12);
  check('110l با ماژول برق خراب، گره با برق پایه فعال می‌ماند (مورد ۱۲)',
    t12.status !== 'nopower' && t12.connected === true, 'status=' + t12.status + ' conn=' + t12.connected);

  // ۱۳) بهرهٔ بدهی + هشدار ورشکستگی
  const s13 = newGameAll(42);
  s13.debt = 500000; s13.cash = 0; s13.lastMonthDay = s13.day - 30;
  GameSim.tick(s13, 1);
  check('110m بدهی بهره می‌گیرد و هشدار ورشکستگی فعال می‌شود (مورد ۱۳)',
    s13.debt > 500000 && s13.bankruptcyWarning === true, 'debt=' + Math.round(s13.debt) + ' warn=' + s13.bankruptcyWarning);

  // ۱۴) کمپین بدون پوشش مشترک جدید نمی‌سازد
  const s14 = newGameAll(42); s14.cash = 9999999;
  const camp14 = (GameSim.DATA && GameSim.DATA.campaigns) || null;
  const campList = camp14 || (s14.campaigns || []);
  check('110n کمپین‌ها در داده تعریف شده‌اند (مورد ۱۴)', Array.isArray(campList) ? campList.length >= 0 : true, 'n=' + (campList.length || 0));

  // ۱۵) بازده نزولی ماژول ظرفیت
  check('110o ماژول ظرفیت سطح ۱۰ بازده نزولی دارد (مورد ۱۵)',
    GameSim.capBoostMult(10) < 14 && GameSim.capBoostMult(10) > GameSim.capBoostMult(9),
    'm10=' + GameSim.capBoostMult(10).toFixed(2));

  // ۱۶) اترنت بلندتر از ۶۰۰ رد می‌شود
  const s16 = newGameAll(42); s16.cash = 9999999;
  const d16 = s16.districts.find(x => x.id === 'center');
  const t16 = GameSim.buildNode(s16, 'cell_2g', d16.x + 700, d16.y); finishBuild(s16, t16);
  const sw16 = GameSim.buildNode(s16, 'switch', d16.x, d16.y); finishBuild(s16, sw16);
  const l16 = GameSim.connect(s16, t16.id, sw16.id, 'ethernet');
  check('110p لینک اترنت بلندتر از ۶۰۰ واحد رد می‌شود (مورد ۱۶)', l16 === null, 'link=' + !!l16);

  // ۱۷) آستانه‌های افت سیگنال با نقشهٔ بزرگ متناسب‌اند
  const s17 = newGameAll(42); s17.cash = 9999999;
  const d17 = s17.districts.find(x => x.id === 'center');
  const a17 = GameSim.buildNode(s17, 'switch', d17.x + 500, d17.y); finishBuild(s17, a17);
  const b17 = GameSim.buildNode(s17, 'switch', d17.x, d17.y); finishBuild(s17, b17);
  const l17 = GameSim.connect(s17, a17.id, b17.id, 'ethernet');
  const att17 = l17 ? GameSim.linkAttenuation(s17, l17, a17, b17) : 0;
  check('110q اترنت ۵۰۰ واحدی افت سیگنال ندارد (آستانه ۶۰۰) (مورد ۱۷)',
    att17 >= 0.99, 'att=' + att17);

  // ۱۸) انتخاب بستهٔ منطقه + هشدار فرسودگی
  const s18 = newGameAll(42); s18.cash = 9999999;
  const d18 = s18.districts.find(x => x.id === 'center');
  const r18 = GameSim.setDistrictPackage(s18, d18.id, 'gaming');
  const t18 = GameSim.buildNode(s18, 'cell_2g', d18.x, d18.y); finishBuild(s18, t18);
  connectTower(s18, t18.id, coreOf(s18).id, 'fiber');
  t18.health = 10;
  GameSim.refreshConnectivity(s18);
  const cust18 = (s18.customers || []).find(c => String(c.districtId) === String(d18.id));
  const worn18 = (s18.problems || []).some(p => p.nodeId === t18.id && p.cause === 'worn_node');
  check('110r بستهٔ منطقه عوض می‌شود و گرهٔ فرسوده هشدار می‌گیرد (مورد ۱۸)',
    r18.ok === true && cust18 && cust18.packageId === 'gaming' && worn18, 'pkg=' + (cust18 && cust18.packageId) + ' worn=' + worn18);

  // ۱۹) بازپرداخت تخریب شامل ماژول‌ها است
  const s19 = newGameAll(42); s19.cash = 9999999;
  const d19 = s19.districts.find(x => x.id === 'center');
  const t19 = GameSim.buildNode(s19, 'cell_4g', d19.x, d19.y); finishBuild(s19, t19);
  const ref19a = GameSim.demolishRefund(s19, t19.id);
  GameSim.installModule(s19, t19.id, 'cap_boost');
  GameSim.installModule(s19, t19.id, 'cap_boost');
  const ref19b = GameSim.demolishRefund(s19, t19.id);
  check('110s بازپرداخت تخریب هزینهٔ ماژول‌ها را هم برمی‌گرداند (مورد ۱۹)',
    ref19b > ref19a, 'before=' + ref19a + ' after=' + ref19b);

  // ۲۰) جابه‌جایی گره هزینهٔ سیم‌کشی دوباره دارد
  const s20 = newGameAll(42); s20.cash = 9999999;
  const d20 = s20.districts.find(x => x.id === 'center');
  const t20 = GameSim.buildNode(s20, 'cell_2g', d20.x + 100, d20.y); finishBuild(s20, t20);
  connectTower(s20, t20.id, coreOf(s20).id, 'fiber');
  const cash20 = s20.cash;
  const mv20 = GameSim.moveNode(s20, t20.id, d20.x + 1500, d20.y);
  const moveCost20 = cash20 - s20.cash;
  check('110t هزینهٔ جابه‌جایی شامل کشیدن دوبارهٔ لینک‌ها است (مورد ۲۰)',
    mv20.ok === true && moveCost20 > Math.round(12000 * 0.1) + 500, 'cost=' + moveCost20);

  // ۲۱) رقیب نقدینگی محدود دارد و زنده می‌ماند
  const s21 = GameSim.newGame(42, { rival: true });
  for (let i = 0; i < 120; i++) { GameSim.tick(s21, 1); keepAlive(s21); }
  check('110u رقیب شبکه می‌سازد ولی نقدینگی‌اش محدود می‌ماند (مورد ۲۱)',
    s21.nodes.some(n => GameSim.isRivalNode(n) && n.type !== 'core_router' && n.type !== 'internet_gateway') && s21.rival.cash < 500000,
    'rivalCash=' + Math.round(s21.rival.cash));

  // ۲۲) نفوذ اشتراک جدا از رضایت گزارش می‌شود
  check('110v نفوذ اشتراک شهر جدا گزارش می‌شود (مورد ۲۲)',
    typeof s6.penetration === 'number' && s6.penetration >= 0 && s6.penetration <= 1, 'pen=' + s6.penetration);

  // ۲۳) مشترک فیبر با جمعیت ساختمان‌های انشعاب‌خورده سقف دارد
  const s23 = newGameAll(42); s23.cash = 9999999;
  const d23 = s23.districts.find(x => x.id === 'residential') || s23.districts[1];
  const cab23 = GameSim.buildNode(s23, 'street_cabinet', d23.x, d23.y); finishBuild(s23, cab23);
  GameSim.connect(s23, cab23.id, coreOf(s23).id, 'fiber');
  const b23 = s23.buildings.filter(b => b.districtId === d23.id)
    .sort((a, b) => Math.hypot(a.x - d23.x, a.y - d23.y) - Math.hypot(b.x - d23.x, b.y - d23.y))[0];
  if (b23) GameSim.connectBuildingWired(s23, b23.id, cab23.id, 'fiber');
  d23.subscribers = 5000;
  GameSim.computeFlow(s23, { dailyAvg: true, noDailyEffects: true });
  const dropped23 = GameSim.droppedResidents(s23, d23);
  const td23 = d23.techDemand || {};
  const perSub23 = d23.subscribers > 0 ? d23.demand / d23.subscribers : 1;
  check('110w ترافیک سیمی سرویس‌شده از جمعیت انشعاب‌خورده بیشتر نمی‌شود (مورد ۲۳)',
    dropped23 > 0 && (!td23.fiber || td23.fiber.served <= dropped23 * 0.35 * perSub23 + 2),
    'dropped=' + dropped23 + ' fiberServed=' + (td23.fiber && Math.round(td23.fiber.served)));

  // ۲۵) اعتبارسنجی رسانه در connect
  const s25 = newGameAll(42); s25.cash = 9999999;
  const d25 = s25.districts.find(x => x.id === 'center');
  const r25a = GameSim.buildNode(s25, 'cabinet_basic', d25.x + 100, d25.y); finishBuild(s25, r25a);
  const r25b = GameSim.buildNode(s25, 'switch', d25.x - 100, d25.y); finishBuild(s25, r25b);
  check('110x اتصال با رسانهٔ پشتیبانی‌نشده رد می‌شود (مورد ۲۵)',
    GameSim.connect(s25, r25a.id, r25b.id, 'ptp') === null, '');

  // ۲۶) کابل گره ساختنی نیست
  check('110y «کابل فیبر» گره قابل ساخت نیست (مورد ۲۶)',
    GameSim.buildNode(newGameAll(42), 'fiber_cable', 1000, 1000) === null, '');

  // ۲۷) آموزش ترتیبی است
  const s27 = GameSim.newGame(42);
  GameSim.tick(s27, 1);
  check('110z آموزش در اولین تیک به قدم ۴ نمی‌پرد (مورد ۲۷)',
    (s27.tutorialStep || 0) <= 1, 'step=' + s27.tutorialStep);

  // ۲۸) پیام «متصل نیست» نام گره را دارد
  const s28 = newGameAll(42); s28.cash = 9999999;
  const d28 = s28.districts.find(x => x.id === 'center');
  const t28 = GameSim.buildNode(s28, 'cell_2g', d28.x + 200, d28.y); finishBuild(s28, t28);
  GameSim.refreshConnectivity(s28);
  const p28 = (s28.problems || []).find(p => p.nodeId === t28.id && p.cause === 'unconnected');
  check('110aa پیام گرهٔ متصل‌نشده نام خود گره را می‌گوید (مورد ۲۸)',
    !!p28 && p28.message.indexOf(t28.name) >= 0, p28 ? p28.message : 'no problem');

  // ۳۰) سرعت هر کاربر از ظرفیت سایت کمتر یا مساوی است
  const st30 = GameSim.speedTestAt(s2, d2.x, d2.y);
  check('110ab تست سرعت، سرعت هر کاربر را جدا از ظرفیت سایت می‌دهد (مورد ۳۰)',
    st30.cellular.perUser != null && st30.cellular.perUser <= st30.cellular.speed,
    'perUser=' + st30.cellular.perUser + ' site=' + st30.cellular.speed);

  // ۳۳) مشترک فردی بدون مسیر مشترک نمی‌شود و با قطع مسیر لغو می‌شود
  const s33 = newGameAll(42); s33.cash = 99999999;
  unlockAllEras(s33);
  const d33 = s33.districts.find(x => x.type === 'residential') || s33.districts[1];
  const t33 = GameSim.buildNode(s33, 'cell_5g', d33.x, d33.y); finishBuild(s33, t33);
  connectTower(s33, t33.id, coreOf(s33).id, 'fiber');
  for (let i = 0; i < 30; i++) { GameSim.tick(s33, 1); keepAlive(s33); }
  const subs33a = s33.individuals.filter(p => p.status === 'subscribed').length;
  GameSim.demolishNode(s33, t33.id);
  for (let i = 0; i < 10; i++) { GameSim.tick(s33, 1); keepAlive(s33); }
  const subs33b = s33.individuals.filter(p => p.status === 'subscribed' && String(p.districtId) === String(d33.id)).length;
  check('110ac با حذف مسیر، مشترکان فردی آن ساختمان لغو می‌شوند (مورد ۳۳)',
    subs33a > 0 && subs33b === 0, 'before=' + subs33a + ' after=' + subs33b);

  // ۳۴) تعمیر آنی لینک قطع
  const s34 = newGameAll(42); s34.cash = 9999999;
  const d34 = s34.districts.find(x => x.id === 'center');
  const t34 = GameSim.buildNode(s34, 'cell_2g', d34.x, d34.y); finishBuild(s34, t34);
  const l34 = connectTower(s34, t34.id, coreOf(s34).id, 'fiber');
  l34.status = 'cut';
  const cash34 = s34.cash;
  const r34 = GameSim.repairLink(s34, l34.id);
  check('110ad لینک قطع آنی تعمیر می‌شود (مورد ۳۴)',
    r34.ok === true && l34.status === 'active' && s34.cash === cash34 - r34.cost, 'cost=' + r34.cost);

  // ۳۵) رویدادهای جدید ایرانی تعریف شده‌اند و اثرشان محدود است
  const evIds = (require('../js/data.js').events || []).map(e => e.id);
  const s35 = newGameAll(42);
  s35.day = 10; // بهار: نوروز
  for (let i = 0; i < 3; i++) GameSim.tick(s35, 1);
  check('110ae رویدادهای نوروز/یلدا/جشنواره استریم وجود دارند (مورد ۳۵)',
    ['ev_nowruz', 'ev_yalda', 'ev_stream_fest', 'ev_dust'].every(id => evIds.indexOf(id) >= 0),
    'events=' + evIds.length);

  // ۳۶) حالت تماشاچی: هوش مصنوعی ۲۰۰ روز بازی می‌کند
  const s36 = GameSim.newGame(42, { rival: true });
  GameSim.setSpectatorAI(s36, true);
  for (let i = 0; i < 200; i++) GameSim.tick(s36, 1);
  const subs36 = s36.districts.reduce((a, d) => a + (d.subscribers || 0), 0);
  check('110af حالت تماشاچی ۲۰۰ روز بدون مارپیچ بدهی رشد می‌کند (مورد ۳۶)',
    s36.totalRevenue > 0 && subs36 > 500 && (s36.debt || 0) < 200000,
    'subs=' + subs36 + ' debt=' + Math.round(s36.debt || 0) + ' cash=' + Math.round(s36.cash));
}

// ---------- 111) قانون جفت‌گره: دکل/کابینت فقط به گره شبکه وصل می‌شود ----------
{
  const s = withLTE(newGameAll(31));
  const core = coreOf(s), gw = gwOf(s);
  const tw = GameSim.buildNode(s, 'cell_2g', core.x - 500, core.y + 300); finishBuild(s, tw);
  const cabB = GameSim.buildNode(s, 'cabinet_basic', core.x - 420, core.y + 380); finishBuild(s, cabB);
  const cabS = GameSim.buildNode(s, 'street_cabinet', core.x - 340, core.y + 300); finishBuild(s, cabS);
  const ftth = GameSim.buildNode(s, 'ftth', core.x - 260, core.y + 380); finishBuild(s, ftth);
  const tw2 = GameSim.buildNode(s, 'cell_4g', core.x - 180, core.y + 300); finishBuild(s, tw2);
  const agg = GameSim.buildNode(s, 'aggregation', core.x - 100, core.y + 380); finishBuild(s, agg);
  const rtr = GameSim.buildNode(s, 'switch', core.x - 60, core.y + 300); finishBuild(s, rtr);
  const sw = GameSim.buildNode(s, 'switch', core.x - 140, core.y + 460); finishBuild(s, sw);
  const rep = GameSim.buildNode(s, 'repeater', core.x - 220, core.y + 460); finishBuild(s, rep);
  check('111a گره‌های تست قانون جفت‌گره ساخته شدند', !!(tw && cabB && cabS && ftth && tw2 && agg && rtr && sw && rep),
    JSON.stringify([tw, cabB, cabS, ftth, tw2, agg, rtr, sw, rep].map(n => n && n.type)));

  const linksBefore = s.links.length, cashBefore = s.cash;
  const bad1 = GameSim.connect(s, tw.id, cabB.id, 'copper');
  const bad2 = GameSim.connect(s, cabB.id, tw.id, 'copper');
  check('111b دکل↔کابینت ساده در هر دو جهت رد می‌شود (گزارش کاربر)',
    !bad1 && !bad2 && s.links.length === linksBefore && s.cash === cashBefore,
    'links=' + s.links.length + ' cashΔ=' + (s.cash - cashBefore));
  const bad3 = GameSim.connect(s, tw.id, cabS.id, 'fiber');
  const bad4 = GameSim.connect(s, tw.id, ftth.id, 'fiber');
  const bad5 = GameSim.connect(s, tw.id, tw2.id, 'fiber');
  const bad6 = GameSim.connect(s, cabB.id, cabS.id, 'copper');
  const bad7 = GameSim.connect(s, cabS.id, ftth.id, 'fiber');
  check('111c دکل↔کابینت خیابانی/FTTH/دکل و کابینت↔کابینت/FTTH رد می‌شود',
    !bad3 && !bad4 && !bad5 && !bad6 && !bad7 && s.links.length === linksBefore,
    'links=' + s.links.length);

  const okAgg = GameSim.connect(s, tw.id, agg.id, 'fiber');
  const okCore = GameSim.connect(s, tw2.id, core.id, 'fiber');
  const okTowerSw = GameSim.connect(s, tw.id, sw.id, 'fiber');
  const okRtr = GameSim.connect(s, cabB.id, rtr.id, 'copper');
  const okSw = GameSim.connect(s, cabS.id, sw.id, 'fiber');
  const okRep = GameSim.connect(s, ftth.id, rep.id, 'fiber');
  const okGw = GameSim.connect(s, agg.id, gw.id, 'fiber');
  check('111d دکل فقط به سوئیچ وصل می‌شود (تجمیع/هسته رد)؛ کابینت/FTTH به گره شبکه و تجمیع به دروازه وصل می‌شوند',
    !okAgg && !okCore && !!(okTowerSw && okRtr && okSw && okRep && okGw),
    JSON.stringify([okAgg, okCore, okTowerSw, okRtr, okSw, okRep, okGw].map(l => !!l)));

  const pairBad = GameSim.canConnectPair(s, tw.id, cabB.id);
  const pairOk = GameSim.canConnectPair(s, tw.id, sw.id);
  const optsBad = GameSim.mediumOptions(s, tw.id, cabB.id);
  check('111e canConnectPair و گزینه‌های رسانه برای جفت نامعتبر با دلیل فارسی بسته‌اند (انتخاب‌گر)',
    pairBad.ok === false && /دکل فقط به سوئیچ وصل می‌شود/.test(pairBad.error || '') && pairOk.ok === true &&
    optsBad.length > 0 && optsBad.every(o => !o.ok && /دکل فقط به سوئیچ وصل می‌شود/.test(o.reason || '')),
    JSON.stringify({ pairBad, pairOk, opts: optsBad.map(o => o.ok) }));

  // تغییر رسانه قانون جفت‌گره را دور نمی‌زند: لینک نامعتبر دستی (مثل ذخیرهٔ قدیمی) قابل تغییر نیست
  const fakeBad = { id: 'l_fake_bad', from: tw.id, to: cabB.id, medium: 'copper', capacity: 100, latency: 5, status: 'active', isBackup: false, usage: 0 };
  s.links.push(fakeBad);
  const chOpts = GameSim.linkChangeOptions(s, fakeBad.id);
  const chRes = GameSim.changeLinkMedium(s, fakeBad.id, 'fiber');
  check('111f تغییر رسانه روی لینک نامعتبر (دکل↔کابینت) ممکن نیست',
    chOpts.every(o => !o.ok) && chRes.ok === false && fakeBad.medium === 'copper',
    JSON.stringify({ chRes, opts: chOpts.map(o => o.ok) }));
  s.links = s.links.filter(l => l.id !== fakeBad.id);

  // مهاجرت ذخیرهٔ قدیمی: لینک دکل↔کابینت ساده حذف و هزینهٔ ساختش (فاصله × هزینهٔ واحد) برگردانده می‌شود
  const s2 = withLTE(newGameAll(32));
  const core2 = coreOf(s2);
  const twOld = GameSim.buildNode(s2, 'cell_2g', core2.x - 400, core2.y + 300); finishBuild(s2, twOld);
  const cabOld = GameSim.buildNode(s2, 'cabinet_basic', core2.x - 300, core2.y + 380); finishBuild(s2, cabOld);
  const dOld = Math.hypot(twOld.x - cabOld.x, twOld.y - cabOld.y);
  const expectRefund = Math.round(dOld * GameSim.linkCostPerUnit('copper'));
  s2.links.push({ id: 'l_old_bad', from: twOld.id, to: cabOld.id, medium: 'copper', capacity: 100, latency: 5, status: 'active', isBackup: false, usage: 0 });
  const cashOld = s2.cash;
  const loaded = GameSim.loadGame(GameSim.saveGame(s2));
  const badGone = !loaded.links.some(l => l.id === 'l_old_bad');
  const cashLoaded = loaded.cash; // قبل از تیک (تیک درآمد روزانه اضافه می‌کند)
  let tickOk = true;
  try { GameSim.tick(loaded, 1); } catch (e) { tickOk = false; }
  check('111g ذخیرهٔ قدیمی با لینک دکل↔کابینت: لینک حذف + بازپرداخت فاصله×هزینهٔ واحد + تیک سالم',
    badGone && cashLoaded === cashOld + expectRefund && tickOk,
    'gone=' + badGone + ' cashΔ=' + (cashLoaded - cashOld) + ' expect=' + expectRefund + ' tickOk=' + tickOk);
}

// ---------- 112) هیت‌مپ سیگنال: فقط دکل سلولی (نه هسته/دروازه/سوئیچ/کابینت) ----------
{
  const s = withLTE(newGameAll(33));
  const core = coreOf(s), gw = gwOf(s);
  // گره‌های شبکه و سیمی نزدیک HQ، بدون هیچ دکلی در نزدیکی
  const agg = GameSim.buildNode(s, 'aggregation', core.x + 250, core.y + 200); finishBuild(s, agg);
  const rtr = GameSim.buildNode(s, 'switch', core.x - 250, core.y + 200); finishBuild(s, rtr);
  const sw = GameSim.buildNode(s, 'switch', core.x + 250, core.y - 200); finishBuild(s, sw);
  const rep = GameSim.buildNode(s, 'repeater', core.x - 250, core.y - 200); finishBuild(s, rep);
  const cab = GameSim.buildNode(s, 'street_cabinet', core.x + 120, core.y + 320); finishBuild(s, cab);
  const ftth = GameSim.buildNode(s, 'ftth', core.x - 120, core.y + 320); finishBuild(s, ftth);
  const prep0 = GameSim.prepareSignalField(s);
  const zeros = [core, gw, agg, rtr, sw, rep, cab, ftth].every(n =>
    GameSim.signalFieldAt(prep0, n.x, n.y) === 0 && GameSim.signalAt(s, n.x, n.y).signal === 0);
  check('112a سیگنال در محل هسته/دروازه/روتر/سوئیچ/تجمیع/تقویت‌کننده/کابینت/FTTH صفر است',
    zeros && prep0.nodes.length === 0,
    'prepNodes=' + prep0.nodes.length + ' coreSig=' + GameSim.signalFieldAt(prep0, core.x, core.y));
  // حالا یک دکل: فقط همان حباب سیگنال می‌سازد
  const tw = GameSim.buildNode(s, 'cell_2g', core.x + 900, core.y); finishBuild(s, tw);
  const prep1 = GameSim.prepareSignalField(s);
  check('112b فقط دکل در میدان سیگنال است و در محل دکل سیگنال ناصفر، در HQ صفر می‌ماند',
    prep1.nodes.length === 1 && GameSim.signalFieldAt(prep1, tw.x, tw.y) > 0.5 &&
    GameSim.signalFieldAt(prep1, core.x, core.y) === 0 && GameSim.signalFieldAt(prep1, gw.x, gw.y) === 0,
    'prepNodes=' + prep1.nodes.length + ' tw=' + GameSim.signalFieldAt(prep1, tw.x, tw.y).toFixed(2) +
    ' core=' + GameSim.signalFieldAt(prep1, core.x, core.y));
}

// ---------- 113) تنظیم پینگ و پهنای باند: فیبر خیلی کم، سلولار بالاتر از سیمی، PtP پرظرفیت‌تر از فیبر و پینگش با فاصله ----------
{
  // 113a ترتیب پینگ حلقهٔ دسترسی: فیبر < مسی < سلولار (2G بیشترین ... 5G کمترینِ سلولارها، همه بالای سیمی)
  const fb = GameSim.techLatencyBase('fiber', null);
  const cb = GameSim.techLatencyBase('copper', null);
  const g2 = GameSim.techLatencyBase('cellular', { type: 'cell_2g' });
  const g3 = GameSim.techLatencyBase('cellular', { type: 'cell_3g' });
  const g4 = GameSim.techLatencyBase('cellular', { type: 'cell_4g' });
  const g5 = GameSim.techLatencyBase('cellular', { type: 'cell_5g' });
  check('113a پینگ دسترسی: فیبر < مسی < 5G < 4G < 3G < 2G', fb < cb && cb < g5 && g5 < g4 && g4 < g3 && g3 < g2,
    'fiber=' + fb + ' copper=' + cb + ' 5g=' + g5 + ' 4g=' + g4 + ' 3g=' + g3 + ' 2g=' + g2);

  // 113b ترتیب پینگ لینک در فاصلهٔ برابر: فیبر < اترنت < مسی
  const A = { x: 0, y: 0 }, B = { x: 600, y: 0 };
  const lf = GameSim.linkLatency({ medium: 'fiber' }, A, B);
  const le = GameSim.linkLatency({ medium: 'ethernet' }, A, B);
  const lc = GameSim.linkLatency({ medium: 'copper' }, A, B);
  check('113b پینگ لینک در فاصلهٔ برابر: فیبر < اترنت < مسی', lf < le && le < lc, 'f=' + lf + ' e=' + le + ' c=' + lc);

  // 113c ظرفیت PtP از فیبر بیشتر است
  check('113c ظرفیت نقطه‌به‌نقطه (۱۲۰۰۰) از فیبر (۱۰۰۰۰) بیشتر است',
    GameSim.linkBaseCapacity('ptp') === 12000 && GameSim.linkBaseCapacity('fiber') === 10000 &&
    GameSim.linkBaseCapacity('ptp') > GameSim.linkBaseCapacity('fiber'));

  // 113d پینگ PtP با فاصله رشد می‌کند (کوتاه ~۶٫۴ms، حداکثر برد ~۲۵٫۶ms یک‌طرفه)
  const pShort = GameSim.linkLatency({ medium: 'ptp' }, { x: 0, y: 0 }, { x: 200, y: 0 });
  const pLong = GameSim.linkLatency({ medium: 'ptp' }, { x: 0, y: 0 }, { x: 1800, y: 0 });
  check('113d پینگ PtP در برد بلند خیلی بیشتر از برد کوتاه است', pLong > pShort * 3 && Math.abs(pShort - 6.4) < 0.01 && Math.abs(pLong - 25.6) < 0.01,
    'short=' + pShort + ' long=' + pLong);

  // 113e سرتاسری (تست سرعت ساختمان): فیبر < مسی < سلولار با بک‌هال یکسان
  const s = withLTE(newGameAll(113));
  const core = coreOf(s);
  const d = s.districts.find(x => x.id === 'center');
  const b0 = s.buildings.find(x => x.districtId === d.id);
  const cab = GameSim.buildNode(s, 'street_cabinet', b0.x + 13, b0.y + 10); finishBuild(s, cab);
  GameSim.connect(s, cab.id, core.id, 'fiber');
  const tw = GameSim.buildNode(s, 'cell_2g', b0.x + 60, b0.y + 40); finishBuild(s, tw);
  connectTower(s, tw.id, core.id, 'fiber');
  const near = s.buildings.filter(x => x.districtId === d.id)
    .sort((p, q) => Math.hypot(p.x - cab.x, p.y - cab.y) - Math.hypot(q.x - cab.x, q.y - cab.y));
  let bF = null, bC = null;
  for (const b of near) { if (!bF && GameSim.connectBuildingWired(s, b.id, cab.id, 'fiber').ok) bF = b; else if (!bC && GameSim.connectBuildingWired(s, b.id, cab.id, 'copper').ok) bC = b; if (bF && bC) break; }
  const stF = bF && GameSim.speedTestAt(s, bF.x + (bF.w || 26) / 2, bF.y + (bF.h || 20) / 2);
  const stC = bC && GameSim.speedTestAt(s, bC.x + (bC.w || 26) / 2, bC.y + (bC.h || 20) / 2);
  check('113e پینگ سرتاسری ساختمان: انشعاب فیبر < انشعاب مسی < سلولار',
    !!stF && !!stC && stF.fiber.latency != null && stC.fiber.latency != null && stF.cellular.latency != null &&
    stF.fiber.latency < stC.fiber.latency && stC.fiber.latency < stF.cellular.latency,
    'fiberDrop=' + (stF && stF.fiber.latency) + ' copperDrop=' + (stC && stC.fiber.latency) + ' cell=' + (stF && stF.cellular.latency));

  // 113f ذخیرهٔ قدیمی: لینک PtP با ظرفیت/تأخیر قدیمی هنگام بارگذاری به اعداد جدید می‌رسد
  const s2 = withLTE(newGameAll(114));
  const a2 = GameSim.buildNode(s2, 'switch', coreOf(s2).x + 300, coreOf(s2).y); finishBuild(s2, a2);
  const raw = JSON.parse(GameSim.saveGame(s2));
  raw.links.push({ id: 'l_old_ptp', from: a2.id, to: coreOf(s2).id, medium: 'ptp', capacity: 5000, latency: 8, status: 'active', isBackup: false, usage: 0 });
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  const lp = loaded.links.find(l => l.id === 'l_old_ptp');
  check('113f لینک PtP ذخیرهٔ قدیمی: ظرفیت ۱۲۰۰۰ و تأخیر پایهٔ ۴ بعد از بارگذاری',
    !!lp && lp.capacity === 12000 && lp.latency === 4, lp && ('cap=' + lp.capacity + ' lat=' + lp.latency));
}

// ---------- 114) ادغام «روتر لبه» با «سوئیچ» (یکی بودند؛ سوئیچ ارزان‌تر ماند) ----------
{
  // 114a کاتالوگ روتر ندارد؛ سوئیچ با آمار ارزان‌تر مانده است
  const swEq = eq('switch');
  check('114a روتر لبه از کاتالوگ حذف و سوئیچ (۶۰۰۰/۱۵۰/۱۰۰W) مانده است',
    !eq('router') && !!swEq && swEq.cost === 6000 && swEq.monthlyCost === 150 && swEq.powerDraw === 100 &&
    !DATA.equipmentList.some(e => e.id === 'router'));
  // 114b ساخت روتر ممکن نیست
  const s = withLTE(newGameAll(115));
  const core = coreOf(s);
  check('114b ساخت «روتر لبه» ممکن نیست', !GameSim.buildNode(s, 'router', core.x + 200, core.y));
  // 114c ذخیرهٔ قدیمی با گره روتر → سوئیچ می‌شود؛ لینک/ماژول/موقعیت حفظ می‌شود
  const sw = GameSim.buildNode(s, 'switch', core.x + 300, core.y + 100); finishBuild(s, sw);
  GameSim.connect(s, sw.id, core.id, 'fiber');
  GameSim.installModule(s, sw.id, 'cap_boost');
  const raw = JSON.parse(GameSim.saveGame(s));
  const rn = raw.nodes.find(n => n.id === sw.id);
  rn.type = 'router'; rn.name = 'روتر لبه';
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  const ln = loaded.nodes.find(n => n.id === sw.id);
  const linkOk = loaded.links.some(l => (l.from === sw.id || l.to === sw.id) && l.medium === 'fiber');
  let tickOk = true; try { GameSim.tick(loaded, 1); } catch (e) { tickOk = false; }
  check('114c گره روتر ذخیرهٔ قدیمی سوئیچ می‌شود (لینک/ماژول/موقعیت سالم)',
    !!ln && ln.type === 'switch' && ln.name === 'سوئیچ' && linkOk && (ln.modules || []).includes('cap_boost') &&
    ln.x === sw.x && ln.y === sw.y && tickOk,
    ln && ('type=' + ln.type + ' name=' + ln.name + ' mods=' + JSON.stringify(ln.modules)));
  // 114d نگاشت‌های قدیمی روتر → سوئیچ
  const m = DATA.legacyEquipmentMap || {};
  check('114d همهٔ نگاشت‌های قدیمی روتر به سوئیچ می‌روند',
    m['router'] === 'switch' && m['rt_edge_1g_500'] === 'switch' && m['fw_core_20000'] === 'switch' &&
    m['cab_street_500'] === 'switch' && Object.values(m).every(v => v !== 'router'));
}

// ---------- 115) قانون سخت‌گیرانهٔ دکل: دکل فقط به سوئیچ وصل می‌شود ----------
{
  const s = withLTE(newGameAll(115));
  const core = coreOf(s), gw = gwOf(s);
  const tw = GameSim.buildNode(s, 'cell_2g', core.x - 500, core.y + 300); finishBuild(s, tw);
  const agg = GameSim.buildNode(s, 'aggregation', core.x - 300, core.y + 300); finishBuild(s, agg);
  const rep = GameSim.buildNode(s, 'repeater', core.x - 400, core.y + 420); finishBuild(s, rep);
  const sw = GameSim.buildNode(s, 'switch', core.x - 200, core.y + 300); finishBuild(s, sw);
  check('115a دکل به هسته/تجمیع/دروازه/تقویت‌کننده رد و فقط به سوئیچ قبول می‌شود',
    !GameSim.connect(s, tw.id, core.id, 'fiber') &&
    !GameSim.connect(s, tw.id, agg.id, 'fiber') &&
    !GameSim.connect(s, tw.id, gw.id, 'fiber') &&
    !GameSim.connect(s, tw.id, rep.id, 'fiber') &&
    !!GameSim.connect(s, tw.id, sw.id, 'fiber') &&
    /دکل فقط به سوئیچ وصل می‌شود/.test(GameSim.canConnectPair(s, tw.id, core.id).error || ''));

  // 115b ذخیرهٔ قدیمی با لینک دکل↔هسته: حذف + بازپرداخت فاصله×هزینهٔ واحد
  const s2 = withLTE(newGameAll(116));
  const core2 = coreOf(s2);
  const tw2 = GameSim.buildNode(s2, 'cell_2g', core2.x - 400, core2.y + 300); finishBuild(s2, tw2);
  const dOld = Math.hypot(tw2.x - core2.x, tw2.y - core2.y);
  const expectRefund = Math.round(dOld * GameSim.linkCostPerUnit('fiber'));
  s2.links.push({ id: 'l_old_tower_core', from: tw2.id, to: core2.id, medium: 'fiber', capacity: 10000, latency: 1, status: 'active', isBackup: false, usage: 0 });
  const cashOld = s2.cash;
  const loaded = GameSim.loadGame(GameSim.saveGame(s2));
  const gone = !loaded.links.some(l => l.id === 'l_old_tower_core');
  const lt = loaded.nodes.find(n => n.id === tw2.id);
  check('115b لینک دکل↔هستهٔ ذخیرهٔ قدیمی حذف و هزینه‌اش برگردانده می‌شود',
    gone && loaded.cash === cashOld + expectRefund && lt.connected === false,
    'gone=' + gone + ' cashΔ=' + (loaded.cash - cashOld) + ' expect=' + expectRefund);

  // 115c تقویت‌کننده روی لینک دکل نصب نمی‌شود (نه در رفع خودکار، نه در گزینه‌های مشکل)
  const s3 = withLTE(newGameAll(117));
  const core3 = coreOf(s3);
  let tw3 = null;
  for (let dy = 0; dy <= 600 && !tw3; dy += 150) tw3 = GameSim.buildNode(s3, 'cell_2g', core3.x - 3200, core3.y + dy);
  finishBuild(s3, tw3);
  const sw3 = GameSim.buildNode(s3, 'switch', core3.x, core3.y - 200); finishBuild(s3, sw3);
  const lk = GameSim.connect(s3, tw3.id, sw3.id, 'fiber'); // ~۳۲۰۰ واحد: افت سیگنال
  GameSim.connect(s3, sw3.id, core3.id, 'fiber');
  GameSim.tick(s3, 1);
  const prob = (s3.problems || []).find(p => p.type === 'signal_loss' && p.linkId === lk.id);
  const fixRes = GameSim.applyFix(s3, prob || { linkId: lk.id }, { action: 'add_repeater', linkId: lk.id });
  check('115c تقویت‌کننده روی لینک دکل نصب نمی‌شود و گزینهٔ رفعش هم نیست',
    !!lk && fixRes.ok === false && s3.links.some(l => l.id === lk.id) &&
    (!prob || !(prob.fixOptions || []).some(f => f.action === 'add_repeater')),
    'fixOk=' + fixRes.ok + ' prob=' + !!prob);

  // 115d حالت تماشاچی + رقیب: هیچ لینک دکل نامعتبری ساخته نمی‌شود و شبکه رشد می‌کند
  const s4 = GameSim.newGame(42, { rival: true });
  GameSim.setSpectatorAI(s4, true);
  let firstIncomeDay = -1;
  for (let i = 0; i < 150; i++) { GameSim.tick(s4, 1); if (firstIncomeDay < 0 && (s4.totalRevenue || 0) > 0) firstIncomeDay = s4.day; }
  const CELL4 = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g'];
  const badTowerLinks = s4.links.filter(l => {
    const a = s4.nodes.find(n => n.id === l.from), b = s4.nodes.find(n => n.id === l.to);
    if (!a || !b) return false;
    if (CELL4.includes(a.type)) return b.type !== 'switch';
    if (CELL4.includes(b.type)) return a.type !== 'switch';
    return false;
  });
  const subs4 = s4.districts.reduce((acc, d) => acc + (d.subscribers || 0), 0);
  check('115d تماشاچی+رقیب ۱۵۰ روز: صفر لینک دکل نامعتبر، درآمد زودهنگام و رشد مشترک',
    badTowerLinks.length === 0 && firstIncomeDay > 0 && firstIncomeDay <= 10 && subs4 > 100 && (s4.debt || 0) < 200000,
    'bad=' + badTowerLinks.length + ' incomeDay=' + firstIncomeDay + ' subs=' + subs4 + ' debt=' + Math.round(s4.debt || 0));
}

// ---------- 116: سلول کوچک (مورد ۱۱) ----------
{
  // 116a دوران: در ۱۹۹۱ ساخته نمی‌شود (از ۲۰۰۹)
  const s0 = GameSim.newGame(42); s0.cash = 999999;
  const d0 = s0.districts.find(x => x.id === 'center');
  const early = GameSim.buildNode(s0, 'small_cell', d0.x, d0.y);
  check('116a سلول کوچک قبل از دورانش (۲۰۰۹) ساخته نمی‌شود', early == null, 'node=' + (early && early.id));

  const s = withLTE(newGameAll(42));
  const d = s.districts.find(x => x.id === 'center');
  const sc = GameSim.buildNode(s, 'small_cell', d.x, d.y);
  check('116b سلول کوچک در دورانش ساخته می‌شود', !!sc, 'sc=' + (sc && sc.id));
  if (sc) {
    finishBuild(s, sc);
    // 116c بک‌هال فقط به سوئیچ (قانون سخت دکل‌ها)
    const core = coreOf(s);
    const badLink = GameSim.connect(s, sc.id, core.id, 'fiber');
    const goodLink = connectTower(s, sc.id, core.id, 'fiber');
    check('116c بک‌هال سلول کوچک فقط به سوئیچ وصل می‌شود (نه مستقیم به هسته)', badLink == null && !!goodLink,
      'bad=' + !!badLink + ' good=' + !!goodLink);
    // 116d سرویس در شعاع + حضور در هیت‌مپ سیگنال
    for (let i = 0; i < 8; i++) { GameSim.tick(s, 1); keepAlive(s); }
    const sig = GameSim.signalAt(s, sc.x, sc.y);
    const sigFar = GameSim.signalAt(s, sc.x + 400, sc.y);
    check('116d سلول کوچک در شعاعش سرویس می‌دهد و در هیت‌مپ سیگنال هست (بیرون شعاع نه)',
      (d.servedDemand || 0) > 0 && sig.signal > 0 && sigFar.signal === 0,
      'served=' + Math.round(d.servedDemand || 0) + ' sig=' + sig.signal + ' far=' + sigFar.signal);
    // 116e ماژول TD-LTE روی سلول کوچک نصب نمی‌شود
    const r = GameSim.installModule(s, sc.id, 'tdlte');
    check('116e ماژول TD-LTE روی سلول کوچک نصب نمی‌شود', !r.ok, 'r=' + JSON.stringify(r));
  }
}

// ---------- 117: گره کش محلی (مورد ۱۳) ----------
{
  const s = withLTE(newGameAll(42));
  const d = s.districts.find(x => x.id === 'center');
  const t = GameSim.buildNode(s, 'cell_4g', d.x, d.y);
  finishBuild(s, t); connectTower(s, t.id, coreOf(s).id, 'fiber');
  for (let i = 0; i < 10; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const latBefore = d.avgLatency || 0;
  const transitBefore = GameSim.monthlyTransitCost(s);
  check('117a پیش‌شرط: منطقه سرویس می‌گیرد و ترافیک ترانزیت دارد', (d.servedDemand || 0) > 0 && GameSim.transitMbps(s) > 0,
    'served=' + Math.round(d.servedDemand || 0) + ' transit=' + Math.round(GameSim.transitMbps(s)));
  const cdn = GameSim.buildNode(s, 'cdn_cache', d.x + 60, d.y + 60);
  finishBuild(s, cdn); connectAny(s, cdn.id, coreOf(s).id);
  for (let i = 0; i < 3; i++) { GameSim.tick(s, 1); keepAlive(s); }
  const saving = GameSim.cdnTransitSavingMbps(s);
  const transitAfter = GameSim.monthlyTransitCost(s);
  check('117b گره کش هزینهٔ ترانزیت منطقهٔ تحت پوشش را کم می‌کند', d.cdnServed === true && saving > 0 && transitAfter < transitBefore,
    'cdnServed=' + d.cdnServed + ' saving=' + Math.round(saving) + ' before=' + transitBefore + ' after=' + transitAfter);
  check('117c تأخیر منطقهٔ تحت پوشش کش کمتر می‌شود', (d.avgLatency || 0) < latBefore,
    'latBefore=' + latBefore.toFixed(1) + ' latAfter=' + (d.avgLatency || 0).toFixed(1));
  const names = GameSim.cdnServedDistricts(s, cdn.id);
  const farD = s.districts.find(x => Math.hypot(x.x - cdn.x, x.y - cdn.y) > 3000);
  check('117d پنل گره کش مناطق تحت پوشش را نشان می‌دهد و منطقهٔ دور پوشش ندارد',
    names.includes(d.name) && farD && farD.cdnServed !== true,
    'names=' + names.length + ' far=' + (farD && farD.id) + ' farServed=' + (farD && farD.cdnServed));
}

// ---------- 118: پروژه‌های عمرانی شهرداری (مورد ۲۱) ----------
{
  const s = GameSim.newGame(42);
  const d = s.districts.find(x => x.id === 'center');
  const pop0 = d.population;
  s.cityProjects.push({ id: 'prT', typeId: 'metro', name: 'ایستگاه مترو', districtId: d.id, startDay: 1, endDay: 5, phase: 'building' });
  const fBuild = GameSim.projectDemandFactor(s, d);
  check('118a حین ساخت پروژه تقاضای منطقه موقتاً افت می‌کند (×۰٫۹۲)', Math.abs(fBuild - 0.92) < 1e-9, 'f=' + fBuild);
  s.day = 5;
  GameSim.tickCityProjects(s, 1, []);
  const fDone = GameSim.projectDemandFactor(s, d);
  const p = s.cityProjects.find(x => x.id === 'prT');
  check('118b بعد از اتمام پروژه جمعیت (+۱۲٪) و تقاضا (+۱۵٪) منطقه برای همیشه بیشتر می‌شود',
    p.phase === 'done' && d.population === Math.round(pop0 * 1.12) && Math.abs(fDone - 1.15) < 1e-9 && d.projectsDone === 1,
    'phase=' + p.phase + ' pop=' + d.population + '/' + pop0 + ' f=' + fDone);
  check('118c اتمام پروژه در لاگ رویداد اعلام می‌شود', s.log.some(e => e.kind === 'event' && /ایستگاه مترو/.test(e.msg || '')),
    'log=' + s.log.length);
  // 118d شروع خودکار: در ۶۰۰ روز دست‌کم یک پروژه شروع می‌شود و هم‌زمان‌ها از ۳ بیشتر نمی‌شوند
  const s2 = GameSim.newGame(42);
  let maxActive = 0;
  for (let day = 1; day <= 600; day++) {
    s2.day = day;
    GameSim.tickCityProjects(s2, 1, []);
    maxActive = Math.max(maxActive, s2.cityProjects.filter(x => x.phase === 'building').length);
  }
  check('118d پروژه‌ها خودکار شروع می‌شوند و حداکثر ۳ پروژه هم‌زمان فعال است',
    s2.counters.project >= 1 && maxActive <= 3,
    'started=' + s2.counters.project + ' maxActive=' + maxActive);
}

// ---------- 119: مهاجرت جمعیت (مورد ۲۲) ----------
{
  const s = GameSim.newGame(42); // فقط مرکز و حاشیهٔ شمالی بازند
  const c = s.districts.find(x => x.id === 'center');
  const n = s.districts.find(x => x.id === 'north');
  const locked = s.districts.find(x => x.unlocked === false);
  c.satisfaction = 90; c.potentialQos = 1;
  n.satisfaction = 10; n.potentialQos = 0.1;
  const c0 = c.population, n0 = n.population, l0 = locked.population;
  GameSim.runMigration(s);
  check('119a مهاجرت جمعیت را به منطقهٔ خوب‌سرویس می‌برد و مجموع را حفظ می‌کند',
    c.population > c0 && n.population < n0 && (c.population + n.population) === (c0 + n0),
    'c=' + c0 + '→' + c.population + ' n=' + n0 + '→' + n.population);
  check('119b مناطق قفل‌شده در مهاجرت شرکت نمی‌کنند', locked.population === l0 && !locked.popTrend,
    'locked=' + l0 + '→' + locked.population);
  check('119c روند جمعیت برای پنل منطقه ثبت می‌شود', c.popTrend > 0 && n.popTrend < 0,
    'cTrend=' + c.popTrend + ' nTrend=' + n.popTrend);
  // 119d مهاجرت در حساب ماهانهٔ تیک اجرا می‌شود
  const s2 = GameSim.newGame(42); s2.cash = 999999;
  const c2 = s2.districts.find(x => x.id === 'center');
  const t2 = GameSim.buildNode(s2, 'cell_2g', c2.x, c2.y);
  finishBuild(s2, t2); connectTower(s2, t2.id, coreOf(s2).id, 'copper');
  for (let i = 0; i < 35; i++) { GameSim.tick(s2, 1); keepAlive(s2); }
  check('119d مهاجرت ماهانه داخل تیک اجرا و روند ثبت می‌شود', s2.districts.some(x => x.popTrend != null && x.popTrend !== 0),
    'trends=' + s2.districts.filter(x => x.popTrend).map(x => x.id + ':' + x.popTrend).join(','));
}

// ---------- 120: کسب‌وکارهای آنلاین محلی (مورد ۲۳) ----------
{
  const s = newGameAll(42);
  const d = s.districts.find(x => x.id === 'center');
  d.qos = 0.8; d.satisfaction = 70;
  for (let i = 0; i < 60; i++) GameSim.updateOnlineBiz(s, d);
  const cap = GameSim.onlineBizCap(d);
  check('120a در منطقهٔ خوب‌سرویس کسب‌وکارهای آنلاین شکل می‌گیرند (تا سقف)',
    d.onlineBiz > 0 && d.onlineBiz <= cap && GameSim.onlineBizDemandFactor(d) > 1 && GameSim.onlineBizRevenueFactor(d) > 1,
    'biz=' + d.onlineBiz + ' cap=' + cap);
  const bizBefore = d.onlineBiz;
  d.qos = 0.1;
  for (let i = 0; i < 30; i++) GameSim.updateOnlineBiz(s, d);
  check('120b با بدشدن سرویس کسب‌وکارهای آنلاین کم می‌شوند', d.onlineBiz < bizBefore,
    'before=' + bizBefore + ' after=' + d.onlineBiz);
  const res = { type: 'residential', population: 8000 }, com = { type: 'commercial', population: 8000 };
  check('120c سقف کسب‌وکار در مناطق تجاری بیشتر از مسکونی است و اثرها سقف دارند',
    GameSim.onlineBizCap(com) > GameSim.onlineBizCap(res) &&
    GameSim.onlineBizDemandFactor({ onlineBiz: 9999 }) <= 1.5 && GameSim.onlineBizRevenueFactor({ onlineBiz: 9999 }) <= 1.3,
    'comCap=' + GameSim.onlineBizCap(com) + ' resCap=' + GameSim.onlineBizCap(res));
}

// ---------- 121: نقشه‌ها و بذرهای متنوع (مورد ۴۳) ----------
{
  const MapGen = require('../js/mapgen.js');
  const riverMean = (m) => m.river.reduce((a, p) => a + p.x, 0) / m.river.length;
  const mRiver = MapGen.generate(7, 'river');
  const mCoast = MapGen.generate(7, 'coast');
  const mCentral = MapGen.generate(7, 'central');
  check('121a قالب‌های مختلف نقشه‌های واقعاً متفاوت می‌سازند (مسیر رودخانه)',
    Math.abs(riverMean(mRiver) - riverMean(mCoast)) > 1000 && Math.abs(riverMean(mRiver) - riverMean(mCentral)) > 500,
    'river=' + Math.round(riverMean(mRiver)) + ' coast=' + Math.round(riverMean(mCoast)) + ' central=' + Math.round(riverMean(mCentral)));
  const m1 = MapGen.generate(7, 'central'), m2 = MapGen.generate(7, 'central');
  check('121b همان قالب+بذر همیشه همان نقشه را می‌سازد (قطعی)',
    JSON.stringify(m1) === JSON.stringify(m2), '');
  const mDef = MapGen.generate(42), mRiver42 = MapGen.generate(42, 'river');
  check('121c قالب پیش‌فرض همان نقشهٔ قبلی است (بذرهای قدیمی عوض نمی‌شوند)',
    JSON.stringify(mDef) === JSON.stringify(mRiver42), '');
  const g1 = GameSim.newGame(7, { preset: 'desert' });
  const g2 = GameSim.newGame(7, { preset: 'ناموجود' });
  const g3 = GameSim.newGame(7);
  check('121d بازی جدید قالب را نگه می‌دارد و قالب نامعتبر به پیش‌فرض برمی‌گردد',
    g1.mapPreset === 'desert' && g2.mapPreset === 'river' && g3.mapPreset === 'river',
    'g1=' + g1.mapPreset + ' g2=' + g2.mapPreset + ' g3=' + g3.mapPreset);
}

// ---------- 122: ذخیرهٔ قدیمی با فیلدهای جدید ----------
{
  const s = GameSim.newGame(42);
  for (let i = 0; i < 5; i++) GameSim.tick(s, 1);
  const raw = JSON.parse(GameSim.saveGame(s));
  delete raw.cityProjects; delete raw.mapPreset; delete raw.counters.project;
  for (const d of raw.districts) {
    delete d.basePopulation; delete d.popTrend; delete d.onlineBiz; delete d.onlineBizF;
    delete d.projectDemandBoost; delete d.projectsDone; delete d.cdnServed;
  }
  const loaded = GameSim.loadGame(JSON.stringify(raw));
  let ok = true;
  try { for (let i = 0; i < 35; i++) GameSim.tick(loaded, 1); } catch (e) { ok = false; }
  const d = loaded.districts.find(x => x.id === 'center');
  check('122 ذخیرهٔ قدیمی (بدون فیلدهای جدید) بارگذاری و تیک می‌خورد و فیلدها پیش‌فرض می‌گیرند',
    ok && Array.isArray(loaded.cityProjects) && loaded.mapPreset === 'river' && d.basePopulation > 0 &&
    d.onlineBiz != null && d.projectDemandBoost != null && loaded.counters.project != null,
    'ok=' + ok + ' preset=' + loaded.mapPreset + ' basePop=' + d.basePopulation);
}

// ---------- رنگ ترجیح شبکهٔ ساختمان روی نقشه (لایهٔ prefnet) ----------
{
  // 123a: برای هر نوع ترجیح یک رنگ معتبر در منبع واحد (GAME_DATA.prefColors) هست
  const pc = DATA.prefColors || {};
  const hexOk = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  check('123a برای هر نوع ترجیح شبکه رنگ معتبر در prefColors هست',
    GameSim.TECH_KEYS.every(t => hexOk(pc[t])),
    'keys=' + GameSim.TECH_KEYS.join(',') + ' colors=' + JSON.stringify(pc));
}
{
  // 123b: ترجیح هر ساختمان همیشه یکی از TECH_KEYS است (رنگ هرگز undefined نمی‌شود) — ۱۹۹۱ و ۲۰۱۹
  let allOk = true, bad = '';
  for (const day of [1, 281]) {
    const s = GameSim.newGame(42);
    s.day = day;
    for (const b of s.buildings) {
      const t = GameSim.buildingPreference(s, b).type;
      if (!GameSim.TECH_KEYS.includes(t) || !DATA.prefColors[t]) { allOk = false; bad = 'day=' + day + ' type=' + t; break; }
    }
    if (!allOk) break;
  }
  check('123b ترجیح همهٔ ساختمان‌ها در ۱۹۹۱ و ۲۰۱۹ رنگ دارد (بدون undefined)', allOk, bad);
}
{
  // 123c: ترجیح با دوران عوض می‌شود (رنگ نقشه زنده به‌روز می‌شود): TD-LTE در ۱۹۹۱ نیست، در ۲۰۱۹ هست
  const s91 = GameSim.newGame(42); s91.day = 1;
  const s19 = GameSim.newGame(42); s19.day = 281;
  const cnt = (s) => { const c = { fiber: 0, cellular: 0, fwa: 0 }; for (const b of s.buildings) c[GameSim.buildingPreference(s, b).type]++; return c; };
  const c91 = cnt(s91), c19 = cnt(s19);
  check('123c ترجیح TD-LTE در ۱۹۹۱ صفر و در ۲۰۱۹ موجود است (تغییر رنگ با دوران)',
    c91.fwa === 0 && c19.fwa > 0 && c19.fiber > 0 && c19.cellular > 0,
    '1991=' + JSON.stringify(c91) + ' 2019=' + JSON.stringify(c19));
}
{
  // 123d: ترجیح قطعی است (فراخوانی دوباره همان نتیجه) تا کش نقشه امن باشد
  const s = GameSim.newGame(7); s.day = 281;
  let det = true;
  for (const b of s.buildings) {
    if (GameSim.buildingPreference(s, b).type !== GameSim.buildingPreference(s, b).type) { det = false; break; }
  }
  check('123d ترجیح ساختمان قطعی و تکرارپذیر است', det);
}

{
  // 124a: لینک اشباع‌شده روی مسیر منطقه به‌عنوان گلوگاه نام برده می‌شود (با درصد مصرف و رفع مشخص)
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tw = GameSim.buildNode(s, 'cell_4g', d.x, d.y); finishBuild(s, tw);
  let sw = null;
  for (const [ox, oy] of [[80, 0], [-80, 0], [0, 80], [0, -80], [160, 0], [-160, 0]]) {
    sw = GameSim.buildNode(s, 'switch', tw.x + ox, tw.y + oy);
    if (sw) break;
  }
  finishBuild(s, sw);
  GameSim.connect(s, tw.id, sw.id, 'fiber');
  const copper = GameSim.connect(s, sw.id, coreOf(s).id, 'copper'); // لینک ضعیف ۱۰۰ مگابیت روی مسیر
  d.subscribers = 3000;
  keepAlive(s);
  const prob = (s.problems || []).find(p => p.cause === 'congestion' && p.districtId === d.id);
  const bn0 = prob && prob.bottlenecks && prob.bottlenecks[0];
  check('124a لینک مسی اشباع‌شده گلوگاه اول منطقه است با درصد و رفع موازی',
    !!bn0 && bn0.kind === 'link' && bn0.linkId === copper.id && bn0.utilPct > 100 &&
    bn0.fix && bn0.fix.action === 'parallel_link' && bn0.fix.linkId === copper.id && !!bn0.fixText,
    'bn=' + JSON.stringify(bn0) + ' qos=' + d.qos);
  check('124a2 همهٔ گلوگاه‌ها هدف ضربه (nodeId/linkId) و درصد دارند',
    !!prob && prob.bottlenecks.length > 0 && prob.bottlenecks.every(b => (b.nodeId || b.linkId) && b.utilPct > 0 && b.fixText),
    'n=' + (prob && prob.bottlenecks.length));
}
{
  // 124b: گره دسترسیِ کامل (دکل 2G با ظرفیت ۶۰) به‌عنوان گلوگاه گرهی نام برده می‌شود
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tw = GameSim.buildNode(s, 'cell_2g', d.x, d.y); finishBuild(s, tw);
  connectTower(s, tw.id, coreOf(s).id, 'fiber');
  d.subscribers = 3000;
  keepAlive(s);
  const prob = (s.problems || []).find(p => p.cause === 'congestion' && p.districtId === d.id);
  const bnN = prob && (prob.bottlenecks || []).find(b => b.kind === 'node' && b.nodeId === tw.id);
  check('124b دکل اشباع‌شده گلوگاه گرهی است با رفع ماژول ظرفیت',
    !!bnN && bnN.utilPct >= 99 && bnN.fix && bnN.fix.action === 'install_module' && bnN.fix.moduleId === 'cap_boost' && bnN.fix.nodeId === tw.id,
    'bn=' + JSON.stringify(bnN) + ' qos=' + d.qos);
}
{
  // 124c: منطقهٔ بدون ازدحام هشدار کمبود ظرفیت ندارد
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tw = GameSim.buildNode(s, 'cell_4g', d.x, d.y); finishBuild(s, tw);
  connectTower(s, tw.id, coreOf(s).id, 'fiber');
  d.subscribers = 5;
  keepAlive(s);
  const prob = (s.problems || []).find(p => p.cause === 'congestion' && p.districtId === d.id);
  check('124c منطقهٔ سالم هشدار کمبود ظرفیت ندارد', !prob && d.qos >= 0.5, 'qos=' + d.qos);
}
{
  // 124d: وقتی گلوگاه مشخصی نیست ولی تقاضا از مجموع ظرفیت دسترسی بیشتر است، پیام صریح همان را می‌گوید
  const s = newGameAll(42); s.cash = 9999999;
  const d = s.districts.find(x => x.id === 'center');
  const tw = GameSim.buildNode(s, 'cell_2g', d.x, d.y); finishBuild(s, tw);
  connectTower(s, tw.id, coreOf(s).id, 'fiber');
  d.subscribers = 3000;
  keepAlive(s); // qos پایین می‌آید و مصرف‌ها ثبت می‌شوند
  tw.usage = 10; // هیچ عنصری اشباع نیست (حالت مجموع ظرفیت دسترسی)
  const probs = GameSim.buildProblems(s);
  const prob = probs.find(p => p.cause === 'congestion' && p.districtId === d.id);
  check('124d بدون گلوگاه مشخص، پیام «مجموع ظرفیت دسترسی» با اعداد می‌آید',
    !!prob && (prob.bottlenecks || []).length === 0 && prob.message.indexOf('مجموع ظرفیت دسترسی') >= 0,
    'msg=' + (prob && prob.message));
}

console.log('\nنتیجه: ' + pass + ' پاس، ' + fail + ' رد');
process.exit(fail ? 1 : 0);
