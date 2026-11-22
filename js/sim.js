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

  const ACCESS_TYPES = ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g', 'fwa_ap', 'wifi_ap', 'ftth', 'sat_terminal_leo', 'sat_terminal_geo'];
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
    const hq = (DATA.installPoints || []).find((p) => p.id === 'ip_hq') || { x: 1600, y: 1200 };

    const state = {
      version: 1,
      seed: s,
      rngState: s >>> 0,
      cash: 500000,
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
      counters: { node: 0, link: 0, staff: 0, problem: 0 },
      lastMonthDay: 1,
      lastMonthlyProfit: 0,
      totalRevenue: 0,
      totalCosts: 0,
      lastFlow: null,
      // فیلدهای کمکی برای UI
      finance: { incomePerDay: 0, expensePerDay: 0 },
      incomePerDay: 0,
      expensePerDay: 0,
      satisfaction: 50,
      completedMissions: [],
      missionsDone: 0,
      loan: 0,
      isNewGame: true,
      buildings: DATA.buildings || [],
      installPoints: DATA.installPoints || [],
    };

    // مناطق runtime
    state.districts = (DATA.districts || []).map((d) => ({
      id: d.id, name: d.name, type: d.type, x: d.x, y: d.y, radius: d.radius,
      population: d.population, demandBase: d.demandBase,
      priceSensitivity: d.priceSensitivity, potentialRevenue: d.potentialRevenue,
      demand: d.demandBase, servedDemand: 0, subscribers: 0,
      qos: 0, satisfaction: 50, revenue: 0, complaints: 0, connected: false,
    }));
    // گروه مشتری هر منطقه
    state.customers = state.districts.map((d) => ({
      id: 'cust_' + d.id, districtId: d.id,
      packageId: d.type === 'industrial' ? 'enterprise' : (d.type === 'commercial' ? 'business' : 'home'),
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
      buildTimer: 0, usage: 0, connected: true,
    };
    const gw = {
      id: 'n' + (++state.counters.node), type: 'internet_gateway', name: gwEq ? gwEq.name : 'دروازه اینترنت',
      x: hq.x + 40, y: hq.y, status: 'active', health: 100,
      capacity: gwEq ? gwEq.capacity : 40000, radius: 0,
      tech: null, direction: 0, angle: 360, power: 1,
      buildTimer: 0, usage: 0, connected: true,
    };
    state.nodes.push(core, gw);
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
    const node = {
      id: 'n' + (++state.counters.node),
      type: eqId,
      name: eq.name,
      x: x, y: y,
      status: 'building',
      health: 100,
      capacity: eq.capacity || 0,
      radius: eq.radius || 0,
      tech: CELL_TECH[eqId] || null,
      direction: opts.direction !== undefined ? opts.direction : 0,
      angle: opts.angle !== undefined ? opts.angle : 360,
      power: opts.power !== undefined ? opts.power : 1,
      buildTimer: eq.buildDays || 1,
      usage: 0,
      connected: false,
      installPointId: opts.installPointId || null,
    };
    state.nodes.push(node);
    log(state, 'ساخت «' + eq.name + '» آغاز شد (' + node.buildTimer + ' روز).', 'build');
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
    return link;
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
      if (!ACCESS_TYPES.includes(n.type)) continue;
      if (!isUsableNode(n)) continue;
      const d = dist(district.x, district.y, n.x, n.y);
      const reach = (n.radius || 0) + district.radius * 0.6;
      if (d > reach) continue;
      // ساختمان‌های بلند بین گره و مرکز منطقه دید را می‌بندند (برای بی‌سیم)
      let blocked = false;
      if (n.type !== 'ftth') {
        for (const b of (DATA.buildings || [])) {
          if (b.height < 10) continue;
          // فاصله ساختمان از پاره‌خط گره↔مرکز منطقه
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
  function computeFlow(state) {
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

    // ترتیب اولویت هنگام failover: اضطراری (بیمارستان) و سازمانی/صنعتی اول
    const priority = (d) => (d.id === 'hospital' ? 0 : (d.type === 'industrial' || d.type === 'commercial' ? 1 : 2));
    const ordered = state.districts.slice().sort((a, b) => priority(a) - priority(b));

    let totalRevenue = 0, qosSum = 0, servedDistricts = 0;

    for (const d of ordered) {
      d.demand = d.demandBase * (1 + d.subscribers / Math.max(1, d.population));
      // گره‌های دسترسی متصلِ پوشش‌دهنده
      const servers = state.nodes.filter((n) =>
        ACCESS_TYPES.includes(n.type) && n.connected && isUsableNode(n) &&
        dist(d.x, d.y, n.x, n.y) <= (n.radius || 0) + d.radius * 0.6);
      const cust = (state.customers || []).find((c) => c.districtId === d.id);
      if (!servers.length) {
        d.servedDemand = 0; d.qos = 0; d.connected = false;
        if (cust) cust.servingNodeId = null;
        d.subscribers = Math.max(0, Math.floor(d.subscribers * 0.97));
        d.revenue = 0;
        continue;
      }
      if (cust) cust.servingNodeId = servers[0].id;
      const accessCap = servers.reduce((s, n) => s + (n.capacity || 0), 0);
      let served = Math.min(d.demand, accessCap);

      // انتشار روی مسیرها و محاسبه ازدحام
      let remaining = served;
      for (const srv of servers) {
        if (remaining <= 0) break;
        const share = Math.min(remaining, srv.capacity || 0);
        const path = bfsPath(state, srv.id);
        if (!path) continue;
        srv.usage += share;
        for (const id of path) {
          const l = linkById(state, id);
          if (l) l.usage += share;
        }
        remaining -= share;
      }
      // گلوگاه لینک‌ها: اگر مصرف > ظرفیت، کیفیت افت می‌کند
      let congestionFactor = 1;
      for (const l of state.links) {
        if (l.usage > l.capacity && l.capacity > 0) {
          l.status = 'congested';
          congestionFactor = Math.min(congestionFactor, l.capacity / l.usage);
        }
      }
      if (state.failoverActive && priority(d) === 2) congestionFactor *= 0.6; // throttling عادی‌ها
      served = served * congestionFactor;

      d.servedDemand = Math.round(served);
      d.qos = d.demand > 0 ? clamp(served / d.demand, 0, 1) : 0;
      d.connected = d.qos > 0;
      qosSum += d.qos; if (d.qos > 0) servedDistricts++;

      // مشترکان: رشد با کیفیت خوب، ریزش با کیفیت بد
      const maxSubs = Math.floor(d.population * 0.35);
      if (d.qos >= 0.7) d.subscribers = Math.min(maxSubs, d.subscribers + Math.ceil(d.population * 0.004));
      else if (d.qos < 0.3) d.subscribers = Math.max(0, Math.floor(d.subscribers * 0.96));
      if (cust) cust.count = d.subscribers;

      // رضایت به سمت کیفیت حرکت می‌کند
      const target = d.qos * 100;
      d.satisfaction = clamp(d.satisfaction + (target - d.satisfaction) * 0.25, 0, 100);
      d.complaints = d.qos < 0.4 && d.subscribers > 0 ? Math.ceil(d.subscribers * 0.05) : 0;

      // درآمد ماهانه: مشترک × قیمت بسته × ضریب رضایت
      const pkg = (state.packages || []).find((p) => p.id === (cust ? cust.packageId : 'home'));
      const price = pkg ? pkg.price : 120;
      d.revenue = Math.round(d.subscribers * price * (0.4 + 0.6 * (d.satisfaction / 100)));
      totalRevenue += d.revenue;
    }

    const summary = {
      monthlyRevenue: totalRevenue,
      avgQoS: state.districts.length ? qosSum / state.districts.length : 0,
      servedDistricts,
      totalSubscribers: state.districts.reduce((s, d) => s + d.subscribers, 0),
      congestedLinks: state.links.filter((l) => l.status === 'congested').length,
    };
    state.lastFlow = summary;
    // فیلدهای کمکی UI: رضایت کلی و نرخ روزانه مالی
    state.satisfaction = state.districts.length
      ? Math.round(state.districts.reduce((s, d) => s + d.satisfaction, 0) / state.districts.length) : 50;
    let monthlyCosts = 0;
    for (const n of state.nodes) { const eq = getEq(n.type); if (eq && n.status !== 'building') monthlyCosts += eq.monthlyCost || 0; }
    for (const st of state.staff) monthlyCosts += st.salary || 0;
    state.incomePerDay = Math.round(totalRevenue / 30);
    state.expensePerDay = Math.round(monthlyCosts / 30);
    state.finance = { incomePerDay: state.incomePerDay, expensePerDay: state.expensePerDay, monthlyRevenue: totalRevenue, monthlyCosts };
    return summary;
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
      const servers = state.nodes.filter((n) => ACCESS_TYPES.includes(n.type) &&
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
        if (d) { d.demandBase = Math.round(d.demandBase * (fx.factor || 1.3)); detail = 'تقاضای «' + d.name + '» بالا رفت.'; }
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
    const hasAccess = state.nodes.some((n) => ACCESS_TYPES.includes(n.type));
    const hasConnectedAccess = state.nodes.some((n) => ACCESS_TYPES.includes(n.type) && n.connected);
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
    const totalSubs = state.districts.reduce((s, d) => s + d.subscribers, 0);
    for (const m of state.missions) {
      if (m.done) continue;
      const g = m.goal || {};
      let ok = false;
      if (g.type === 'build_access') ok = state.nodes.filter((n) => ACCESS_TYPES.includes(n.type)).length >= (g.count || 1);
      else if (g.type === 'connect_access') ok = state.nodes.filter((n) => ACCESS_TYPES.includes(n.type) && n.connected).length >= (g.count || 1);
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
  function tick(state, dtDays) {
    dtDays = (dtDays === undefined || dtDays === null) ? 1 : dtDays;
    if (state.paused) return { events: [], problems: state.problems || [] };
    state.day += dtDays;

    // تایمر ساخت
    for (const n of state.nodes) {
      if (n.status === 'building') {
        n.buildTimer -= dtDays;
        if (n.buildTimer <= 0) {
          n.buildTimer = 0; n.status = 'active';
          log(state, 'ساخت «' + (n.name || 'گره') + '» تمام شد؛ برای سرویس باید به شبکه وصل شود.', 'build');
        }
      }
    }

    // خرابی‌های تصادفی کوچک (هسته و دروازه در مرکز داده محافظت‌شده‌اند)
    const isHQ = (n) => n && (n.type === 'core_router' || n.type === 'internet_gateway');
    for (const n of state.nodes) {
      if (isHQ(n)) continue;
      if (n.status === 'active' && rand(state) < 0.002 * dtDays) {
        n.status = 'failed'; n.health = 0;
        log(state, 'گره «' + (n.name || 'نامشخص') + '» خراب شد.', 'error');
      } else if (n.status === 'active') {
        n.health = clamp(n.health - 0.1 * dtDays, 10, 100);
      }
    }
    for (const l of state.links) {
      if (isHQ(nodeById(state, l.from)) && isHQ(nodeById(state, l.to))) continue;
      if (l.status === 'active' && rand(state) < 0.001 * dtDays) {
        l.status = 'cut';
        log(state, 'یک لینک ' + mediumFa(l.medium) + ' قطع شد.', 'error');
      }
    }

    // رویدادها + failover خودکار
    const events = rollEvents(state, dtDays);
    if (state.links.some((l) => l.status === 'cut')) failover(state);

    // جریان ترافیک
    computeFlow(state);

    // حساب ماهانه (هر ۳۰ روز)
    if (state.day - state.lastMonthDay >= 30) {
      state.lastMonthDay += 30;
      const revenue = state.districts.reduce((s, d) => s + (d.revenue || 0), 0);
      let costs = 0;
      for (const n of state.nodes) {
        if (n.status === 'building') continue;
        const eq = getEq(n.type);
        if (eq) costs += eq.monthlyCost || 0;
      }
      for (const st of state.staff) costs += st.salary || 0;
      state.cash += revenue - costs;
      state.totalRevenue += revenue;
      state.totalCosts += costs;
      state.lastMonthlyProfit = revenue - costs;
      if (state.cash < 0) { state.debt += -state.cash; state.cash = 0; }
      state.loan = state.debt;
      log(state, 'پایان ماه: درآمد ' + revenue + '، هزینه ' + costs + '، سود ' + (revenue - costs) + '.', 'finance');
    }

    updateTutorial(state);
    checkMissions(state);
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
    if (n.type === 'core_router' || n.type === 'internet_gateway') {
      return { ok: false, error: 'هسته و دروازه اینترنت قابل تخریب نیستند.' };
    }
    const eq = getEq(n.type);
    const refund = eq ? Math.round(eq.cost * 0.3) : 0;
    state.nodes = state.nodes.filter((x) => x.id !== id);
    state.links = state.links.filter((l) => l.from !== id && l.to !== id);
    state.cash += refund;
    log(state, 'گره «' + (n.name || 'نامشخص') + '» تخریب شد. بازگشت: ' + refund, 'build');
    return { ok: true, refund };
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
        const eq = getEq(n.type);
        const cost = eq ? Math.round(eq.cost * 0.1) : 500;
        if (state.cash < cost) return fail('بودجه کافی برای تعمیر نیست.');
        state.cash -= cost; n.status = 'active'; n.health = 85;
        log(state, 'گره «' + (n.name || 'نامشخص') + '» تعمیر شد.', 'repair');
        return { ok: true, cost };
      }
      case 'replace': {
        const n = nodeById(state, fix.nodeId || prob.nodeId);
        if (!n) return fail('گره پیدا نشد.');
        const eq = getEq(n.type);
        const cost = eq ? Math.round(eq.cost * 0.25) : 1000;
        if (state.cash < cost) return fail('بودجه کافی برای جایگزینی نیست.');
        state.cash -= cost; n.status = 'active'; n.health = 100;
        log(state, 'گره «' + (n.name || 'نامشخص') + '» جایگزین شد.', 'repair');
        return { ok: true, cost };
      }
      case 'repair_link': {
        const l = linkById(state, fix.linkId || prob.linkId);
        if (!l) return fail('لینک پیدا نشد.');
        const cost = 800;
        if (state.cash < cost) return fail('بودجه کافی برای تعمیر لینک نیست.');
        state.cash -= cost; l.status = 'active';
        log(state, 'لینک ' + mediumFa(l.medium) + ' تعمیر شد.', 'repair');
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
    return state;
  }

  // ---------- API ----------
  const GameSim = {
    newGame, buildNode, connect, tracePath, computeFlow, tick,
    failover, saveGame, loadGame, unlockTech, isUnlocked, traceSatellitePath,
    // عملیات کمکی UI
    demolishNode, hireStaff, updatePackage, applyFix,
    // کمکی‌ها
    nodeById, linkById, getEq, getTech, rand, ACCESS_TYPES,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameSim;
  if (root) root.GameSim = GameSim;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
