/* UI shell: renders topbar, build menu, detail panel, modals, tutorial, toasts.
   Depends on globals: GAME_DATA (data.js), GameSim (sim.js), CityMap (map.js).
   Exposes window.GameUI with init + refresh helpers used by main.js. */
(function () {
  'use strict';

  var state = null;          // reference to sim state (set via setState)
  var mode = 'select';       // select | place | connect | demolish
  var selectedTool = null;   // equipment id chosen for placement
  var connectFirst = null;   // first node id in connect mode
  var selectedId = null;     // currently inspected node/building id
  var pendingBuild = null;   // {equipId, x, y} awaiting confirm

  var TUTORIAL = [
    { title: 'گام ۱: بررسی نقشه', text: 'به «شبکه‌ساز: شهر متصل» خوش آمدید! روی نقشه مناطق و ساختمان‌ها را ببینید. روی یک ساختمان کلیک کنید تا نیاز آن (کاربران و پهنای باند) نمایش داده شود. با دکمه‌های + و − یا کلیدهای + و − بزرگ‌نمایی کنید.' },
    { title: 'گام ۲: نصب دستگاه دسترسی', text: 'از پنل «ابزار ساخت» یک دستگاه دسترسی مثل دکل سلولی یا اکسس‌پوینت وای‌فای انتخاب کنید و روی نقشه نزدیک ساختمان‌ها قرار دهید. دستگاه بدون اتصال به شبکه هیچ سرویسی نمی‌دهد!' },
    { title: 'گام ۳: اتصال انتقال', text: 'ابزار «اتصال» را انتخاب کنید، روی دستگاه دسترسی و سپس روی یک گره تجمیع کلیک کنید و رسانه (فیبر/مسی/نقطه‌به‌نقطه) را انتخاب کنید تا لینک انتقال ساخته شود.' },
    { title: 'گام ۴: اتصال هسته و دروازه', text: 'زنجیره باید کامل باشد: مشتری ← دسترسی ← تجمیع ← هسته ← دروازه اینترنت. گره تجمیع را به هسته و هسته را به دروازه وصل کنید تا اینترنت به شهر برسد.' },
    { title: 'گام ۵: فعال‌سازی سرویس', text: 'حالا مسیر کامل است و مشتریان آنلاین می‌شوند. از پنل «بسته‌ها» قیمت و سرعت بسته‌ها را تنظیم کنید؛ قیمت بالاتر درآمد بیشتر اما تقاضای کمتر می‌دهد.' },
    { title: 'گام ۶: بررسی ظرفیت و رفع مشکل', text: 'اگر لینک یا دستگاه اشباع شود، هشدار ظاهر می‌شود. روی گره مشکل‌دار کلیک کنید: علت مشکل و گزینه‌های رفع آن (ارتقا، لینک موازی، تغییر رسانه) نمایش داده می‌شود.' },
    { title: 'گام ۷: گسترش به منطقه جدید', text: 'با درآمد حاصل، در مناطق دیگر شهر دستگاه نصب کنید و به شبکه وصل کنید. با «تحقیق و توسعه» فناوری‌های جدید مثل فیبر نوری و 5G را باز کنید.' },
    { title: 'گام ۸: مسیر جایگزین (افزونگی)', text: 'برای جلوگیری از قطعی هنگام خرابی، بین گره‌های کلیدی یک مسیر دوم بسازید. اگر مسیر اصلی قطع شود، ترافیک از مسیر جایگزین (مثلاً ماهواره) عبور می‌کند. موفق باشید!' }
  ];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('fa-IR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* ---------- Inline SVG icons (stroke, currentColor; no emoji) ---------- */
  function svgIcon(path) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var ICONS = {
    lock: svgIcon('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    check: svgIcon('<path d="M4 12.5 9.5 18 20 6.5"/>'),
    warn: svgIcon('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
    antenna: svgIcon('<path d="M12 21v-8"/><circle cx="12" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M7.5 6.5a6.5 6.5 0 0 1 9 0"/><path d="M4.8 3.8a10.5 10.5 0 0 1 14.4 0"/>'),
    cable: svgIcon('<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'),
    backhaul: svgIcon('<path d="M4 8h13M13 4l4 4-4 4"/><path d="M20 16H7M11 12l-4 4 4 4"/>'),
    satellite: svgIcon('<path d="M4 16a8 8 0 0 0 12 4"/><path d="M6 18 16 8"/><circle cx="16" cy="8" r="1.6" fill="currentColor" stroke="none"/><path d="M10 20v2"/>'),
    core: svgIcon('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>'),
    info: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
    trash: svgIcon('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
    move: svgIcon('<path d="M12 3v18M3 12h18"/><path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8 3 12l4 4M17 8l4 4-4 4"/>'),
    bolt: svgIcon('<path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z"/>'),
    wrench: svgIcon('<path d="M14.5 6.5a4 4 0 0 1 5.6-3.6l-2.7 2.7 1.4 1.4 2.7-2.7a4 4 0 0 1-5.3 4.9L8 17.3a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 1 1.3.4z"/>')
  };
  var CAT_ICONS = { cable: ICONS.cable, access: ICONS.antenna, antenna: ICONS.antenna, backhaul: ICONS.backhaul, satellite: ICONS.satellite, core: ICONS.core, power: ICONS.bolt, tools: ICONS.wrench };

  /* ---------- Mobile panels (drawer / bottom sheet, one at a time) ---------- */
  function isMobile() { return window.innerWidth <= 900; }
  function openPanel(id) {
    closeSideMenu();
    ['panel-right', 'panel-detail'].forEach(function (p) { $(p).classList.toggle('open', p === id); });
  }
  function closePanels() {
    $('panel-right').classList.remove('open');
    $('panel-detail').classList.remove('open');
  }
  function togglePanel(id) {
    if ($(id).classList.contains('open')) $(id).classList.remove('open');
    else openPanel(id);
  }
  /* ---------- Side menu (drawer; one overlay at a time) ---------- */
  function openSideMenu() {
    closePanels();
    $('alerts-drawer').classList.add('hidden');
    $('side-menu').classList.add('open');
    $('side-menu-backdrop').classList.remove('hidden');
  }
  function closeSideMenu() {
    $('side-menu').classList.remove('open');
    $('side-menu-backdrop').classList.add('hidden');
  }

  /* ---------- Toasts ---------- */
  function toast(msg, kind) {
    var box = $('toasts'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4500);
  }

  /* ---------- Topbar ---------- */
  function renderTopbar() {
    if (!state) return;
    $('ui-cash').textContent = fmt(state.cash) + ' تومان';
    $('ui-cash').closest('.stat').classList.toggle('negative', state.cash < 0);
    var income = (state.finance && state.finance.incomePerDay != null) ? state.finance.incomePerDay : (state.incomePerDay || 0);
    $('ui-income').textContent = fmt(income) + ' /روز';
    $('ui-day').textContent = fmt(state.day || 1);
    var sat = state.satisfaction != null ? Math.round(state.satisfaction) + '٪' : '—';
    $('ui-satisfaction').textContent = sat;
    var n = (state.problems || []).length;
    var badge = $('alert-count');
    badge.textContent = fmt(n);
    badge.classList.toggle('hidden', n === 0);
    renderLog();
  }

  function renderLog() {
    var box = $('event-log'); if (!box || !state) return;
    var items = (state.log || []).slice(-30).reverse();
    box.innerHTML = items.map(function (e) {
      var t = typeof e === 'string' ? e : (e.msg || e.text || e.message || '');
      var d = (typeof e === 'object' && e.day != null) ? 'روز ' + fmt(e.day) + ': ' : '';
      return '<div>' + esc(d + t) + '</div>';
    }).join('') || '<div>رویدادی ثبت نشده است.</div>';
  }

  /* ---------- Build menu ---------- */
  function equipList() {
    var eq = (window.GAME_DATA && GAME_DATA.equipment) || [];
    return Array.isArray(eq) ? eq : Object.values(eq);
  }
  function isUnlocked(item) {
    if (window.GameSim && GameSim.isUnlocked) return GameSim.isUnlocked(state, item && item.id ? item.id : item);
    return !item.unlockTech && !item.tech;
  }

  var CAT_FA = { cable: 'کابل‌ها و اتصالات', access: 'دسترسی', antenna: 'آنتن‌ها', backhaul: 'انتقال', satellite: 'ماهواره‌ای', core: 'هسته و تجمیع', power: 'برق و پشتیبان', tools: 'ابزار و اندازه‌گیری' };
  var CAT_ORDER = ['access', 'antenna', 'cable', 'backhaul', 'core', 'satellite', 'power', 'tools'];
  var buildQuery = '';
  function renderBuildMenu() {
    var menu = $('build-menu'); if (!menu) return;
    var q = (buildQuery || '').trim();
    var groups = {};
    equipList().forEach(function (it) {
      if (q) {
        var hay = ((it.name || '') + ' ' + (it.id || '') + ' ' + (CAT_FA[it.category] || '') + ' ' + (it.guide || '')).toLowerCase();
        if (hay.indexOf(q.toLowerCase()) < 0) return;
      }
      var cat = it.category || it.type || 'سایر';
      (groups[cat] = groups[cat] || []).push(it);
    });
    var html = '';
    var cats = Object.keys(groups).sort(function (a, b) {
      var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    cats.forEach(function (cat) {
      html += '<div class="build-cat">' + esc(CAT_FA[cat] || cat) + '</div>';
      groups[cat].forEach(function (it) {
        var locked = !isUnlocked(it);
        var sel = selectedTool === it.id ? ' selected' : '';
        html += '<button class="build-item' + (locked ? ' locked' : '') + sel + '" data-equip="' + esc(it.id) + '"' + (locked ? ' title="قفل است — ابتدا فناوری لازم را در تحقیق و توسعه باز کنید"' : '') + '>' +
          '<span class="bi-icon">' + (CAT_ICONS[it.category] || ICONS.antenna) + '</span>' +
          '<span class="bi-main"><span class="bi-name">' + esc(it.name || it.id) + '</span><br><span class="bi-sub">' + esc(it.description || '') + '</span></span>' +
          (locked ? '<span class="lock">' + ICONS.lock + '</span>' : '<span class="bi-cost">' + fmt(it.cost || 0) + '</span>') +
          '<span class="bi-info" data-guide="' + esc(it.id) + '" title="راهنمای این تجهیز" role="button" aria-label="راهنما">' + ICONS.info + '</span>' +
          '</button>';
      });
    });
    menu.innerHTML = html || (q ? '<p class="muted">تجهیزی با این جست‌وجو پیدا نشد.</p>' : '<p class="muted">کاتالوگ تجهیزات بارگذاری نشده است.</p>');
    menu.querySelectorAll('[data-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTool(btn.getAttribute('data-equip')); });
    });
    menu.querySelectorAll('[data-guide]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        openGuide(el.getAttribute('data-guide'));
      });
    });
  }

  /* ---------- راهنمای تجهیزات و فناوری‌ها ---------- */
  function techNameForEquip(item) {
    var techs = (window.GAME_DATA && (GAME_DATA.techList || GAME_DATA.techs)) || [];
    techs = Array.isArray(techs) ? techs : Object.values(techs);
    var t = techs.find(function (x) { return (x.unlocks || []).indexOf(item.id) >= 0; }) ||
      techs.find(function (x) { return x.id === item.unlock; });
    return t ? (t.name || t.id) : (item.unlock || '');
  }
  function openGuide(equipId) {
    var item = equipList().find(function (i) { return i.id === equipId; });
    if (!item) return;
    var locked = !isUnlocked(item);
    $('guide-title').textContent = item.name || item.id;
    var html = '<p class="guide-text">' + esc(item.guide || item.description || 'توضیحی ثبت نشده است.') + '</p>';
    html += '<dl class="kv">' +
      '<dt>هزینه ساخت</dt><dd>' + fmt(item.cost || 0) + ' تومان</dd>' +
      '<dt>هزینه ماهانه</dt><dd>' + fmt(item.monthlyCost || 0) + ' تومان</dd>' +
      '<dt>ظرفیت</dt><dd>' + fmt(item.capacity || 0) + ' Mbps</dd>' +
      (item.radius ? '<dt>برد/پوشش</dt><dd>' + fmt(item.radius) + '</dd>' : '') +
      '<dt>زمان ساخت</dt><dd>' + fmt(item.buildDays || 0) + ' روز</dd>' +
      '</dl>';
    if (locked) html += '<div class="warn-box">' + ICONS.lock + ' این تجهیز قفل است. برای باز شدن، تحقیق «' + esc(techNameForEquip(item)) + '» را در بخش تحقیق و توسعه انجام دهید.</div>';
    $('guide-body').innerHTML = html;
    $('guide-popover').classList.remove('hidden');
  }
  /* ---------- تست سرعت در نقطه‌ای از نقشه ---------- */
  var SPEED_REASON_FA = {
    no_coverage: 'خارج از پوشش', unconnected: 'گره متصل نیست', congestion: 'ازدحام مسیر',
    distance: 'فاصله زیاد', los: 'ساختمان بلند مانع دید', no_path: 'مسیر تا دروازه نیست'
  };
  function runSpeedTest(wx, wy) {
    if (!window.GameSim || !GameSim.speedTestAt || !state) return;
    var res = GameSim.speedTestAt(state, wx, wy);
    var TECH_FA = { fiber: 'فیبر/مسی', cellular: 'سلولار', fwa: 'وایرلس ثابت', wifi: 'وای‌فای', satellite: 'ماهواره' };
    var html = '<p class="muted">سرعت مؤثر در این نقطه، به تفکیک فناوری:</p>';
    ['fiber', 'cellular', 'fwa', 'wifi', 'satellite'].forEach(function (t) {
      var e = res[t] || { speed: 0, reason: 'no_coverage' };
      var sub = e.nodeName ? esc(e.nodeName) : '';
      if (e.reason) sub += (sub ? ' — ' : '') + esc(SPEED_REASON_FA[e.reason] || e.reason);
      html += '<div class="tech-row"><div class="tech-head"><span>' + TECH_FA[t] + '</span>' +
        '<span><strong>' + fmt(e.speed || 0) + ' Mbps</strong></span></div>' +
        (sub ? '<div class="muted tech-sub">' + sub + '</div>' : '') + '</div>';
    });
    $('speedtest-body').innerHTML = html;
    $('speedtest-popover').classList.remove('hidden');
  }
  function renderGuideOverview() {
    var guides = (window.GAME_DATA && GAME_DATA.techGuides) || [];
    var eqs = equipList();
    $('guide-overview-body').innerHTML = guides.map(function (g) {
      var names = (g.equipmentIds || []).map(function (id) {
        var e = eqs.find(function (x) { return x.id === id; });
        return e ? (e.name || e.id) : id;
      }).join('، ');
      return '<div class="guide-tech"><h4>' + esc(g.name || g.id) + '</h4>' +
        '<p>' + esc(g.desc || '') + '</p>' +
        (g.whenToUse ? '<p><strong>کی استفاده کنیم؟</strong> ' + esc(g.whenToUse) + '</p>' : '') +
        (names ? '<p class="muted">تجهیزات: ' + esc(names) + '</p>' : '') + '</div>';
    }).join('') || '<p class="muted">راهنمایی ثبت نشده است.</p>';
  }

  var moveNodeId = null, pendingDeleteId = null;
  function setMode(m) {
    mode = m; connectFirst = null;
    if (m !== 'move') moveNodeId = null;
    if (window.CityMap && CityMap.setPlacementMode) CityMap.setPlacementMode(m === 'place' || m === 'move');
    ['tool-select', 'tool-connect', 'tool-demolish', 'tool-speedtest'].forEach(function (id) {
      var b = $(id); if (b) b.classList.toggle('active', (m === 'select' && id === 'tool-select') || (m === 'connect' && id === 'tool-connect') || (m === 'demolish' && id === 'tool-demolish') || (m === 'speedtest' && id === 'tool-speedtest'));
    });
    var hint = $('map-hint');
    var hints = {
      place: 'روی نقشه کلیک کنید تا دستگاه نصب شود (Esc برای لغو)',
      connect: 'روی گره اول کلیک کنید، سپس گره دوم را انتخاب کنید',
      demolish: 'روی گره کلیک کنید تا حذف شود',
      move: 'روی محل جدید گره کلیک کنید (Esc برای لغو) — گره در مدت جابه‌جایی سرویس نمی‌دهد',
      speedtest: 'روی هر نقطه از نقشه کلیک کنید تا سرعت اتصال آنجا سنجیده شود',
      select: ''
    };
    if (hints[m]) { hint.textContent = hints[m]; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
  }

  function selectTool(equipId) {
    var item = equipList().find(function (i) { return i.id === equipId; });
    if (!item) return;
    if (!isUnlocked(item)) { toast('این تجهیز قفل است. ابتدا فناوری لازم را در بخش تحقیق و توسعه باز کنید.', 'error'); return; }
    if (state && state.cash < (item.cost || 0)) { toast('نقدینگی کافی نیست. هزینه: ' + fmt(item.cost) + ' تومان', 'error'); return; }
    selectedTool = equipId;
    setMode('place');
    renderBuildMenu();
    if (isMobile()) $('panel-right').classList.remove('open'); // free the map for the placement tap
  }

  /* ---------- Placement / connect (called from map via main) ---------- */
  function startMove(id) {
    moveNodeId = id;
    setMode('move');
    if (isMobile()) { $('panel-detail').classList.remove('open'); $('panel-right').classList.remove('open'); }
    toast('محل جدید را روی نقشه انتخاب کنید.');
  }

  function openDeleteConfirm(id) {
    var found = findNode(id);
    if (!found || found.kind !== 'node') return;
    var n = found.node;
    pendingDeleteId = id;
    var eq = equipList().find(function (e) { return e.id === n.type; });
    var refund = eq ? Math.round((eq.cost || 0) * 0.5) : 0;
    $('delete-title').textContent = 'حذف «' + (n.name || n.type) + '»؟';
    $('delete-desc').textContent = n.type === 'internet_gateway'
      ? 'حذف دروازه اینترنت کل شبکه را از اینترنت قطع می‌کند؛ همهٔ مناطق سرویس را از دست می‌دهند تا دروازهٔ جدیدی ساخته و وصل شود.'
      : n.type === 'core_router'
        ? 'حذف روتر هسته همهٔ مسیرها به دروازه اینترنت را قطع می‌کند؛ شبکه تا ساخت هستهٔ جدید سرویس نمی‌دهد.'
        : 'با حذف این گره، همهٔ لینک‌هایش هم حذف می‌شوند و گره‌ها و مناطق وابسته به آن سرویس را از دست می‌دهند.';
    $('delete-refund').textContent = fmt(refund) + ' تومان (۵۰٪ هزینهٔ ساخت)';
    $('delete-confirm').classList.remove('hidden');
  }

  function onPlace(x, y) {
    if (mode === 'move' && moveNodeId != null) {
      var r = (window.GameSim && GameSim.moveNode) ? GameSim.moveNode(state, moveNodeId, x, y) : { ok: false, error: 'جابه‌جایی در این نسخه موجود نیست.' };
      toast(r && r.ok === false ? (r.error || 'جابه‌جایی انجام نشد.') : 'جابه‌جایی شروع شد؛ گره تا پایان نصب مجدد سرویس نمی‌دهد.', r && r.ok === false ? 'error' : 'success');
      if (r && r.ok !== false) { setMode('select'); refresh(); }
      return;
    }
    if (mode !== 'place' || !selectedTool) return;
    var item = equipList().find(function (i) { return i.id === selectedTool; });
    if (!item) return;
    if (state.cash < (item.cost || 0)) { toast('نقدینگی کافی نیست.', 'error'); return; }
    pendingBuild = { equipId: selectedTool, x: x, y: y };
    $('confirm-title').textContent = 'نصب «' + (item.name || item.id) + '»';
    $('confirm-desc').textContent = item.description || '';
    $('confirm-cost').textContent = fmt(item.cost || 0) + ' تومان';
    $('confirm-time').textContent = (item.buildTime != null ? fmt(item.buildTime) + ' روز' : 'آنی');
    $('confirm-effect').textContent = item.effect || item.expectedEffect || ('ظرفیت: ' + fmt(item.capacity || 0) + ' Mbps');
    $('build-confirm').classList.remove('hidden');
  }

  function confirmBuild() {
    if (!pendingBuild) return;
    var res = GameSim.buildNode(state, pendingBuild.equipId, pendingBuild.x, pendingBuild.y);
    $('build-confirm').classList.add('hidden');
    if (!res || res.ok === false) { toast((res && res.error) || 'ساخت انجام نشد (بودجه یا فناوری).', 'error'); }
    else {
      toast('دستگاه با موفقیت نصب شد. یادتان باشد آن را به شبکه وصل کنید!', 'success');
      if (res && (res.nodeId != null || res.id != null)) selectNode(res.nodeId != null ? res.nodeId : res.id);
    }
    pendingBuild = null;
    refresh();
  }

  function onMapSelect(id, kind, wx, wy) {
    if (mode === 'speedtest') { if (wx != null && wy != null) runSpeedTest(wx, wy); return; }
    if (id == null) { if (mode === 'select') selectNode(null, kind); return; } // empty tap: clear selection only
    if (mode === 'connect') {
      if (connectFirst == null) {
        connectFirst = id;
        toast('گره اول انتخاب شد. حالا گره دوم را انتخاب کنید.');
        return;
      }
      if (connectFirst === id) { toast('یک گره را نمی‌توان به خودش وصل کرد.', 'warn'); return; }
      openMediumPicker(connectFirst, id);
      connectFirst = null;
      return;
    }
    if (mode === 'demolish') {
      openDeleteConfirm(id);
      return;
    }
    selectNode(id, kind);
  }

  function openMediumPicker(a, b) {
    var media = (window.GAME_DATA && (GAME_DATA.media || GAME_DATA.linkTypes)) || [
      { id: 'fiber', name: 'فیبر نوری', costPerUnit: 8, capacity: 10000 },
      { id: 'copper', name: 'مسی', costPerUnit: 3, capacity: 100 },
      { id: 'wireless', name: 'بی‌سیم', costPerUnit: 2, capacity: 300 }
    ];
    var box = $('medium-options');
    box.innerHTML = media.map(function (m) {
      var locked = m.unlockTech && GameSim.isUnlocked && !GameSim.isUnlocked(state, m);
      return '<button class="btn" style="display:block;width:100%;margin:6px 0;text-align:right" data-medium="' + esc(m.id) + '"' + (locked ? ' disabled' : '') + '>' +
        esc(m.name || m.id) + ' — ظرفیت ' + fmt(m.capacity || 0) + ' Mbps' + (locked ? ' ' + ICONS.lock : '') + '</button>';
    }).join('');
    box.querySelectorAll('[data-medium]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var res = GameSim.connect(state, a, b, btn.getAttribute('data-medium'));
        $('medium-picker').classList.add('hidden');
        if (!res || res.ok === false) toast((res && res.error) || 'اتصال برقرار نشد.', 'error');
        else toast('اتصال برقرار شد.', 'success');
        refresh();
      });
    });
    $('medium-picker').classList.remove('hidden');
  }

  /* ---------- Detail panel ---------- */
  var STATUS_FA = {
    active: 'فعال', building: 'در حال ساخت', failed: 'خراب', unconnected: 'متصل‌نشده',
    congested: 'شلوغ', cut: 'قطع', repairing: 'در حال تعمیر', online: 'آنلاین', offline: 'آفلاین'
  };
  function findNode(id) {
    if (!state) return null;
    var n = (state.nodes || []).find(function (x) { return String(x.id) === String(id); });
    if (n) return { node: n, kind: 'node' };
    var b = (((state && state.buildings) || (window.GAME_DATA && GAME_DATA.buildings)) || []).find(function (x) { return String(x.id) === String(id); });
    if (b) return { node: b, kind: 'building' };
    var d = (state.districts || []).find(function (x) { return String(x.id) === String(id); });
    if (d) return { node: d, kind: 'district' };
    return null;
  }

  function selectNode(id, kind) {
    selectedId = id;
    renderDetail();
    // details panel appears on selection on every viewport (desktop: slide-in
    // overlay, mobile: bottom sheet) and hides again on deselect
    if (id != null) openPanel('panel-detail');
    else $('panel-detail').classList.remove('open');
    if (window.GameSim && GameSim.tracePath && kind !== 'building') {
      var path = GameSim.tracePath(state, id);
      if (window.CityMap && CityMap.setHighlightPath) CityMap.setHighlightPath(path || []);
    else if (window.CityMap && CityMap.highlightPath) CityMap.highlightPath(path || []);
    }
  }

  function renderDetail() {
    var box = $('detail-content'); if (!box) return;
    if (selectedId == null) { box.innerHTML = '<p class="muted">یک گره یا ساختمان را انتخاب کنید.</p>'; return; }
    var found = findNode(selectedId);
    if (!found) { box.innerHTML = '<p class="muted">مورد انتخاب‌شده یافت نشد.</p>'; return; }
    var n = found.node;
    var BTYPE_FA = (window.GAME_DATA && GAME_DATA.buildingTypeFa) || { residential: 'مسکونی', commercial: 'تجاری', office: 'اداری', industrial: 'صنعتی' };
    var name = n.name || (equipList().find(function (e) { return e.id === n.type || e.id === n.equipId; }) || {}).name ||
      (found.kind === 'building' ? ('ساختمان ' + (BTYPE_FA[n.type] || '')) : null) || n.type || ('گره ' + n.id);
    var html = '<h4>' + esc(name) + '</h4>';
    if (found.kind === 'building') {
      var bDist = n.districtId ? (state.districts || []).find(function (d) { return d.id === n.districtId; }) : null;
      html += '<dl class="kv">' +
        '<dt>نوع ساختمان</dt><dd>' + esc(BTYPE_FA[n.type] || 'ساختمانی') + '</dd>' +
        '<dt>طبقات</dt><dd>' + fmt(n.height || 1) + '</dd>' +
        '<dt>منطقه</dt><dd>' + esc(bDist ? bDist.name : 'خارج از مناطق (پراکنده)') + '</dd>' +
        (n.height >= 10 ? '<dt>اثر بر پوشش</dt><dd>ساختمان بلند است؛ دید مستقیم بی‌سیم را می‌بندد</dd>' : '') +
        '</dl>';
      if (!n.districtId && state.scattered) {
        html += '<p class="muted">این ساختمان خارج از مناطق است. مشترکان ساختمان‌های پراکنده: ' + fmt(state.scattered.subscribers || 0) +
          ' از ' + fmt(state.scattered.potentialSubs || 0) + ' ممکن (پوشش: ' + fmt(state.scattered.coveredCount || 0) + ' ساختمان).</p>';
      }
      box.innerHTML = html;
      return;
    }
    if (found.kind === 'district') {
      var TYPE_FA = { commercial: 'تجاری', residential: 'مسکونی', dense: 'پرتراکم', sparse: 'کم‌تراکم', industrial: 'صنعتی', landmark: 'مرکز مهم',
        academic: 'دانشگاهی', medical: 'درمانی', heavy_industrial: 'صنعتی سنگین', tourism: 'گردشگری', transport: 'حمل‌ونقل', villa: 'ویلایی', slum: 'حاشیه‌نشین', government: 'اداری' };
      var qosPct = Math.round((n.qos || 0) * 100);
      html += n.connected
        ? '<p class="status-ok"><span class="dot-ok"></span>دارای سرویس</p>'
        : '<div class="warn-box">' + ICONS.warn + ' این منطقه هنوز سرویس ندارد. یک دستگاه دسترسی نزدیک آن نصب و به شبکه وصل کنید.</div>';
      html += '<dl class="kv">' +
        '<dt>نوع منطقه</dt><dd>' + esc(TYPE_FA[n.type] || n.type || '—') + '</dd>' +
        '<dt>جمعیت</dt><dd>' + fmt(n.population) + '</dd>' +
        '<dt>تقاضا</dt><dd>' + fmt(n.demand) + ' Mbps</dd>' +
        '<dt>تقاضای سرویس‌شده</dt><dd>' + fmt(n.servedDemand) + ' Mbps</dd>' +
        '<dt>مشترکان</dt><dd>' + fmt(n.subscribers) + '</dd>' +
        '<dt>کیفیت سرویس</dt><dd>' + fmt(qosPct) + '٪</dd>' +
        '<dt>رضایت</dt><dd>' + fmt(Math.round(n.satisfaction || 0)) + '٪</dd>' +
        '<dt>درآمد ماهانه</dt><dd>' + fmt(n.revenue) + ' تومان</dd>' +
        '</dl>';
      html += '<div class="cap-bar"><div class="cap-fill ' + (qosPct < 30 ? 'hot' : qosPct < 60 ? 'warm' : '') + '" style="width:' + qosPct + '%"></div></div>';
      // تقاضا به تفکیک فناوری: سهم هر فناوری از تقاضا و بخش سرویس‌گرفته‌اش
      var td = n.techDemand;
      if (!td && window.GameSim && GameSim.computeTechDemand) td = GameSim.computeTechDemand(n, [], 1);
      if (td) {
        var TECH_FA = { fiber: 'فیبر/مسی', cellular: 'سلولار', fwa: 'وایرلس ثابت', wifi: 'وای‌فای', satellite: 'ماهواره' };
        // همان رنگ‌های لایهٔ «تقاضای فناوری» روی نقشه (map.js TECH_TINT)
        var TECH_COLOR = { fiber: '#22d3ee', cellular: '#3fb950', fwa: '#fb923c', wifi: '#a78bfa', satellite: '#e879f9' };
        var totalD = Math.max(1, n.demand || 0);
        html += '<h5>تقاضا به تفکیک فناوری</h5>';
        ['fiber', 'cellular', 'fwa', 'wifi', 'satellite'].forEach(function (t) {
          var e = td[t] || { demand: 0, served: 0 };
          var share = Math.round((e.demand || 0) / totalD * 100);
          var pct = e.demand > 0 ? Math.min(100, Math.round((e.served || 0) / e.demand * 100)) : 0;
          html += '<div class="tech-row"><div class="tech-head"><span><span class="tech-dot" style="background:' + TECH_COLOR[t] + '"></span>' + TECH_FA[t] + '</span>' +
            '<span class="muted">' + fmt(e.served || 0) + ' از ' + fmt(e.demand || 0) + ' Mbps (' + fmt(share) + '٪ تقاضا)</span></div>' +
            '<div class="cap-bar"><div class="cap-fill ' + (pct < 30 ? 'hot' : pct < 60 ? 'warm' : '') + '" style="width:' + pct + '%"></div></div></div>';
        });
      }
      box.innerHTML = html;
      return;
    }
    var connected = n.connected !== false && n.status !== 'unconnected';
    var path = null;
    if (window.GameSim && GameSim.tracePath && found.kind === 'node') path = GameSim.tracePath(state, n.id);
    if (path && path.length === 0) connected = false;
    if (found.kind === 'node') {
      html += connected
        ? '<p class="status-ok"><span class="dot-ok"></span>متصل به شبکه</p>'
        : '<div class="warn-box">' + ICONS.warn + ' متصل نیست — این دستگاه به هسته/دروازه مسیر ندارد و هیچ سرویسی ارائه نمی‌دهد. با ابزار «اتصال» آن را وصل کنید.</div>';
    }
    if (n.status) html += '<p>وضعیت: ' + esc(STATUS_FA[n.status] || n.status) + '</p>';
    if (n.capacity != null) {
      var used = n.used || n.usage || 0;
      var pct = n.capacity ? Math.min(100, used / n.capacity * 100) : 0;
      var cls = pct > 90 ? 'hot' : pct > 70 ? 'warm' : '';
      html += '<p>ظرفیت: ' + fmt(used) + ' از ' + fmt(n.capacity) + ' Mbps (' + fmt(pct) + '٪)</p><div class="cap-bar"><div class="cap-fill ' + cls + '" style="width:' + pct + '%"></div></div>';
    }
    html += '<dl class="kv">';
    if (n.cost != null) html += '<dt>هزینه ساخت</dt><dd>' + fmt(n.cost) + '</dd>';
    if (n.maintenance != null) html += '<dt>نگهداری روزانه</dt><dd>' + fmt(n.maintenance) + '</dd>';
    if (n.users != null) html += '<dt>کاربران</dt><dd>' + fmt(n.users) + '</dd>';
    if (n.demand != null) html += '<dt>تقاضا (Mbps)</dt><dd>' + fmt(n.demand) + '</dd>';
    if (n.district != null) html += '<dt>منطقه</dt><dd>' + esc(n.district) + '</dd>';
    html += '</dl>';
    if (path && path.length) {
      html += '<h5>مسیر تا دروازه:</h5><ol class="path-list">' + path.map(function (p) {
        var pn = findNode(typeof p === 'object' ? p.id : p);
        return '<li>' + esc(pn ? (pn.node.name || pn.node.type || pn.node.id) : p) + '</li>';
      }).join('') + '</ol>';
    }
    if (found.kind === 'node') {
      html += '<div class="fix-btns" style="margin-top:10px">' +
        '<button class="btn sm" data-move-node="' + esc(n.id) + '">' + ICONS.move + ' جابه‌جایی</button>' +
        '<button class="btn sm danger" data-delete-node="' + esc(n.id) + '">' + ICONS.trash + ' حذف</button></div>';
    }
    var problems = (state.problems || []).filter(function (p) { return String(p.nodeId) === String(n.id) || String(p.targetId) === String(n.id); });
    problems.forEach(function (p, i) {
      html += '<div class="problem-box"><strong>' + esc(p.title || 'مشکل') + ':</strong> ' + esc(p.message || 'نامشخص');
      if (p.fixOptions && p.fixOptions.length) {
        html += '<div class="fix-btns">' + p.fixOptions.map(function (f, j) {
          return '<button class="btn sm" data-fix="' + i + ':' + j + '">' + esc(f.label || f.name || f) + (f.cost != null ? ' (' + fmt(f.cost) + ')' : '') + '</button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-move-node]').forEach(function (btn) {
      btn.addEventListener('click', function () { startMove(btn.getAttribute('data-move-node')); });
    });
    box.querySelectorAll('[data-delete-node]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeleteConfirm(btn.getAttribute('data-delete-node')); });
    });
    box.querySelectorAll('[data-fix]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parts = btn.getAttribute('data-fix').split(':');
        var prob = problems[+parts[0]], fix = prob.fixOptions[+parts[1]];
        if (window.GameSim && GameSim.applyFix) {
          var r = GameSim.applyFix(state, prob, fix);
          toast(r && r.ok === false ? (r.error || 'رفع مشکل انجام نشد.') : 'مشکل رفع شد.', r && r.ok === false ? 'error' : 'success');
        } else toast('رفع خودکار در این نسخه موجود نیست؛ از ابزار ساخت/اتصال استفاده کنید.', 'warn');
        refresh();
      });
    });
  }

  /* ---------- Modals ---------- */
  function openModal(id) { closeSideMenu(); $(id).classList.remove('hidden'); $('modal-backdrop').classList.remove('hidden'); }
  function closeModals() {
    document.querySelectorAll('.modal').forEach(function (m) { m.classList.add('hidden'); });
    $('modal-backdrop').classList.add('hidden');
  }

  function renderFinance() {
    var f = (state && state.finance) || {};
    var rows = [
      ['نقدینگی', fmt(state.cash)],
      ['درآمد روزانه', fmt(f.incomePerDay != null ? f.incomePerDay : state.incomePerDay)],
      ['هزینه روزانه', fmt(f.expensePerDay != null ? f.expensePerDay : state.expensePerDay)],
      ['سود خالص روزانه', fmt((f.incomePerDay || state.incomePerDay || 0) - (f.expensePerDay || state.expensePerDay || 0))],
      ['کل درآمد', fmt(f.totalIncome)], ['کل هزینه', fmt(f.totalExpense)],
      ['هزینهٔ کارکنان (ماهانه)', fmt((state.staff || []).reduce(function (s, m) { return s + (m.salary || 0); }, 0)) + ' تومان — ' + fmt((state.staff || []).length) + ' نفر'],
      ['وام', fmt(f.loan || state.loan)], ['مالیات روزانه', fmt(f.taxPerDay)]
    ];
    $('finance-body').innerHTML = '<table>' + rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' +
      '<p class="muted">جزئیات درآمد بر اساس بسته‌های فعال و تعداد مشتریان متصل محاسبه می‌شود.</p>';
  }

  function renderRD() {
    var techs = (window.GAME_DATA && GAME_DATA.techs) || [];
    techs = Array.isArray(techs) ? techs : Object.values(techs);
    $('rd-body').innerHTML = '<div class="tech-grid">' + techs.map(function (t) {
      var unlocked = GameSim.isUnlocked ? GameSim.isUnlocked(state, t) : false;
      var canAfford = state.cash >= (t.cost || 0);
      return '<div class="tech-card ' + (unlocked ? 'unlocked' : 'locked') + '"><h5>' + (unlocked ? ICONS.check + ' ' : ICONS.lock + ' ') + esc(t.name || t.id) + '</h5>' +
        '<p>' + esc(t.description || '') + '</p>' +
        (unlocked ? '<span class="status-ok">باز شده</span>' :
          '<button class="btn sm primary" data-tech="' + esc(t.id) + '"' + (canAfford ? '' : ' disabled title="نقدینگی کافی نیست"') + '>باز کردن — ' + fmt(t.cost || 0) + '</button>') + '</div>';
    }).join('') + '</div>';
    $('rd-body').querySelectorAll('[data-tech]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = GameSim.unlockTech(state, btn.getAttribute('data-tech'));
        toast(r && r.ok === false ? (r.error || 'باز کردن فناوری انجام نشد.') : 'فناوری باز شد!', r && r.ok === false ? 'error' : 'success');
        renderRD(); refresh();
      });
    });
  }

  function faMult(x) { return '×' + String(Math.round(x * 10) / 10).replace('.', '٫'); }
  function renderStaff() {
    var staff = (state && state.staff) || [];
    var roles = (window.GAME_DATA && GAME_DATA.staffRoles) || [];
    var fx = (window.GameSim && GameSim.staffEffects && state) ? GameSim.staffEffects(state) : null;
    var countOf = function (id) { return staff.filter(function (s) { return s.role === id; }).length; };
    var nowLine = function (r) {
      if (!fx) return '';
      if (r.id === 'technician') return 'سرعت ساخت ' + faMult(fx.buildSpeed) + ' — سرعت تعمیر ' + faMult(fx.repairSpeed) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqTechs) + ' نفر';
      if (r.id === 'engineer') return 'ظرفیت مؤثر شبکه ' + faMult(fx.capMult) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqEngs) + ' نفر';
      if (r.id === 'support') return 'افت رضایت ' + faMult(fx.satDecayRate / 0.25) + ' — بازگشت رضایت ' + faMult(fx.satRecoveryRate / 0.25) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqSups) + ' نفر';
      if (r.id === 'sales') return 'رشد مشترک ' + faMult(fx.growthMult) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqSales) + ' نفر';
      return '';
    };
    var reqOf = function (r) {
      if (!fx) return 1;
      return r.id === 'technician' ? fx.reqTechs : r.id === 'engineer' ? fx.reqEngs : r.id === 'support' ? fx.reqSups : r.id === 'sales' ? fx.reqSales : 1;
    };
    var html = roles.map(function (r) {
      var c = countOf(r.id), req = reqOf(r);
      var warn = '';
      if (c === 0) warn = '<div class="staff-warn">' + ICONS.warn + ' ' + esc(r.absence || '') + '</div>';
      else if (c < req) warn = '<div class="staff-warn">' + ICONS.warn + ' نیرو کم است: شبکهٔ شما به ' + fmt(req) + ' نفر «' + esc(r.name) + '» نیاز دارد و الان ' + fmt(c) + ' نفر دارید؛ اثر این نقش ضعیف‌تر از حالت کامل است.</div>';
      return '<div class="staff-card">' +
        '<div class="staff-head"><h4>' + esc(r.name) + '</h4>' +
        '<div class="staff-count"><button class="btn sm" data-fire="' + esc(r.id) + '" ' + (c === 0 ? 'disabled' : '') + '>−</button><span class="num">' + fmt(c) + '</span><button class="btn sm" data-hire="' + esc(r.id) + '">+</button></div></div>' +
        '<div class="staff-meta">حقوق ماهانه هر نفر: ' + fmt(r.salary || 0) + ' تومان — جمع این نقش: ' + fmt(c * (r.salary || 0)) + ' تومان/ماه</div>' +
        '<p class="staff-effect">' + esc(r.effect || r.description || '') + '</p>' +
        '<div class="staff-now">اثر فعلی: ' + esc(nowLine(r)) + '</div>' + warn + '</div>';
    }).join('');
    var total = staff.reduce(function (s, m) { return s + (m.salary || 0); }, 0);
    html += '<div class="staff-summary">جمع حقوق کارکنان: ' + fmt(total) + ' تومان در ماه (' + fmt(staff.length) + ' نفر)</div>';
    $('staff-body').innerHTML = html;
    $('staff-body').querySelectorAll('[data-hire]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (GameSim.hireStaff) { var r = GameSim.hireStaff(state, btn.getAttribute('data-hire')); toast(r && r.ok === false ? (r.error || 'استخدام نشد.') : 'استخدام شد.', r && r.ok === false ? 'error' : 'success'); }
        else toast('استخدام در این نسخه فعال نیست.', 'warn');
        renderStaff(); refresh();
      });
    });
    $('staff-body').querySelectorAll('[data-fire]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (GameSim.fireStaff) { var r = GameSim.fireStaff(state, btn.getAttribute('data-fire')); toast(r && r.ok === false ? (r.error || 'اخراج نشد.') : 'اخراج شد.', r && r.ok === false ? 'error' : 'success'); }
        renderStaff(); refresh();
      });
    });
  }

  function renderMissions() {
    var missions = (window.GAME_DATA && GAME_DATA.missions) || [];
    missions = Array.isArray(missions) ? missions : Object.values(missions);
    var done = (state && (state.completedMissions || state.missionsDone)) || [];
    $('missions-body').innerHTML = '<table><tr><th>مأموریت</th><th>پاداش</th><th>وضعیت</th></tr>' +
      missions.map(function (m) {
        var isDone = done.indexOf(m.id) >= 0 || m.done;
        return '<tr><td>' + esc(m.name || m.title || m.id) + '<br><span class="muted">' + esc(m.description || '') + '</span></td><td>' + fmt(m.reward || 0) + '</td><td class="' + (isDone ? 'mission-done' : 'mission-todo') + '">' + (isDone ? 'انجام شده ' + ICONS.check : 'در حال انجام') + '</td></tr>';
      }).join('') + '</table>';
  }

  function renderPackages() {
    var pkgs = (state && state.packages) || (window.GAME_DATA && GAME_DATA.packages) || [];
    pkgs = Array.isArray(pkgs) ? pkgs : Object.values(pkgs);
    $('packages-body').innerHTML = '<table><tr><th>بسته</th><th>سرعت (Mbps)</th><th>قیمت ماهانه</th><th></th></tr>' +
      pkgs.map(function (p, i) {
        return '<tr><td>' + esc(p.name || p.id) + '</td>' +
          '<td><input type="number" min="1" value="' + (p.speedMbps || p.speed || 0) + '" data-pkg-speed="' + i + '"></td>' +
          '<td><input type="number" min="0" value="' + (p.price || 0) + '" data-pkg-price="' + i + '"></td>' +
          '<td><button class="btn sm primary" data-pkg-save="' + i + '">ذخیره</button></td></tr>';
      }).join('') + '</table><p class="muted">تغییر قیمت/سرعت از روز بعد روی تقاضا و درآمد اثر می‌گذارد.</p>';
    $('packages-body').querySelectorAll('[data-pkg-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-pkg-save');
        var speed = +document.querySelector('[data-pkg-speed="' + i + '"]').value;
        var price = +document.querySelector('[data-pkg-price="' + i + '"]').value;
        if (GameSim.updatePackage) { var r = GameSim.updatePackage(state, pkgs[i].id, { speed: speed, price: price }); toast(r && r.ok === false ? (r.error || 'ذخیره نشد.') : 'بسته به‌روزرسانی شد.', r && r.ok === false ? 'error' : 'success'); }
        else { pkgs[i].speedMbps = speed; pkgs[i].price = price; toast('بسته به‌روزرسانی شد.', 'success'); }
        refresh();
      });
    });
  }

  /* ---------- Alerts ---------- */
  function renderAlerts() {
    var probs = (state && state.problems) || [];
    $('alerts-body').innerHTML = probs.length ? probs.map(function (p) {
      return '<div class="alert-item"><strong>' + ICONS.warn + ' ' + esc(p.title || 'مشکل') + '</strong><br>' + esc(p.message || '') +
        (p.fixOptions && p.fixOptions.length ? '<br><span class="muted">راه‌حل: ' + esc(p.fixOptions.map(function (f) { return f.label || ''; }).filter(Boolean).join('، ')) + '</span>' : '') +
        (p.nodeId != null ? '<br><button class="btn sm" data-goto="' + esc(p.nodeId) + '">مشاهده گره</button>' : '') + '</div>';
    }).join('') : '<p class="muted">هشداری وجود ندارد. شبکه سالم است. ' + ICONS.check + '</p>';
    $('alerts-body').querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { selectNode(b.getAttribute('data-goto')); $('alerts-drawer').classList.add('hidden'); });
    });
  }

  /* ---------- Tutorial ---------- */
  function showTutorial(step) {
    var idx = Math.max(0, Math.min(TUTORIAL.length - 1, step || 0));
    if (state) state.tutorialStep = idx;
    $('tut-step-label').textContent = 'گام ' + fmt(idx + 1) + ' از ' + fmt(TUTORIAL.length);
    $('tut-title').textContent = TUTORIAL[idx].title;
    $('tut-text').textContent = TUTORIAL[idx].text;
    $('tut-next').textContent = idx === TUTORIAL.length - 1 ? 'پایان آموزش' : 'بعدی';
    $('tut-progress-bar').style.width = ((idx + 1) / TUTORIAL.length * 100) + '%';
    $('tutorial-overlay').classList.remove('hidden');
  }
  function hideTutorial() {
    $('tutorial-overlay').classList.add('hidden');
    if (state) state.tutorialStep = TUTORIAL.length;
  }

  function refresh() { renderTopbar(); renderBuildMenu(); renderDetail(); }

  /* ---------- Init wiring ---------- */
  function init(getState) {
    state = typeof getState === 'function' ? getState() : getState;
    $('tool-select').addEventListener('click', function () { selectedTool = null; setMode('select'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    $('tool-connect').addEventListener('click', function () { selectedTool = null; setMode('connect'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    $('tool-demolish').addEventListener('click', function () { selectedTool = null; setMode('demolish'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    $('tool-speedtest').addEventListener('click', function () { selectedTool = null; setMode('speedtest'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    $('speedtest-close').addEventListener('click', function () { $('speedtest-popover').classList.add('hidden'); });
    $('confirm-yes').addEventListener('click', confirmBuild);
    $('confirm-no').addEventListener('click', function () { pendingBuild = null; $('build-confirm').classList.add('hidden'); });
    $('delete-yes').addEventListener('click', function () {
      $('delete-confirm').classList.add('hidden');
      if (pendingDeleteId == null) return;
      var r = (window.GameSim && GameSim.demolishNode) ? GameSim.demolishNode(state, pendingDeleteId) : { ok: false, error: 'حذف در این نسخه موجود نیست.' };
      toast(r && r.ok === false ? (r.error || 'حذف انجام نشد.') : 'گره حذف شد. بازگشت: ' + fmt(r.refund || 0) + ' تومان', r && r.ok === false ? 'error' : 'success');
      pendingDeleteId = null;
      selectNode(null);
      refresh();
    });
    $('delete-no').addEventListener('click', function () { pendingDeleteId = null; $('delete-confirm').classList.add('hidden'); });
    $('medium-cancel').addEventListener('click', function () { $('medium-picker').classList.add('hidden'); });
    $('btn-finance').addEventListener('click', function () { renderFinance(); openModal('modal-finance'); });
    $('btn-rd').addEventListener('click', function () { renderRD(); openModal('modal-rd'); });
    $('btn-staff').addEventListener('click', function () { renderStaff(); openModal('modal-staff'); });
    $('btn-missions').addEventListener('click', function () { renderMissions(); openModal('modal-missions'); });
    $('btn-packages').addEventListener('click', function () { renderPackages(); openModal('modal-packages'); });
    $('btn-guide').addEventListener('click', function () { renderGuideOverview(); openModal('modal-guide'); });
    $('btn-log').addEventListener('click', function () { renderLog(); openModal('modal-log'); });
    $('btn-layers').addEventListener('click', function (e) { e.stopPropagation(); $('layers-popover').classList.toggle('hidden'); });
    $('layers-close').addEventListener('click', function () { $('layers-popover').classList.add('hidden'); });
    document.addEventListener('click', function (e) {
      var pop = $('layers-popover');
      if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && e.target !== $('btn-layers') && !$('btn-layers').contains(e.target)) pop.classList.add('hidden');
    });
    $('guide-close').addEventListener('click', function () { $('guide-popover').classList.add('hidden'); });
    document.querySelectorAll('.modal-close').forEach(function (b) { b.addEventListener('click', closeModals); });
    $('modal-backdrop').addEventListener('click', closeModals);
    $('btn-alerts').addEventListener('click', function () { closeSideMenu(); renderAlerts(); $('alerts-drawer').classList.toggle('hidden'); });
    $('alerts-close').addEventListener('click', function () { $('alerts-drawer').classList.add('hidden'); });
    $('tut-next').addEventListener('click', function () {
      var cur = (state && state.tutorialStep) || 0;
      if (cur >= TUTORIAL.length - 1) hideTutorial(); else showTutorial(cur + 1);
    });
    $('tut-skip').addEventListener('click', hideTutorial);
    $('toggle-right').addEventListener('click', function () { togglePanel('panel-right'); });
    $('toggle-detail').addEventListener('click', function () { togglePanel('panel-detail'); });
    document.querySelectorAll('.panel-close').forEach(function (b) {
      b.addEventListener('click', function () { $(b.getAttribute('data-close-panel')).classList.remove('open'); });
    });
    // side menu: hamburger opens, backdrop/close/entry-selection closes
    $('btn-menu').addEventListener('click', function () {
      if ($('side-menu').classList.contains('open')) closeSideMenu(); else openSideMenu();
    });
    $('side-menu-close').addEventListener('click', closeSideMenu);
    $('side-menu-backdrop').addEventListener('click', closeSideMenu);
    $('side-menu').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.side-item')) closeSideMenu();
    });
    document.querySelectorAll('#layer-toggles input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (window.CityMap && CityMap.setLayer) CityMap.setLayer(cb.getAttribute('data-layer'), cb.checked);
        else if (window.CityMap && CityMap.layers) CityMap.layers[cb.getAttribute('data-layer')] = cb.checked;
        // راهنمای رنگ‌های لایهٔ تقاضای فناوری فقط وقتی آن لایه فعال است دیده شود
        if (cb.getAttribute('data-layer') === 'techdemand') {
          var lg = $('tech-legend'); if (lg) lg.classList.toggle('hidden', !cb.checked);
        }
      });
    });
    var bs = $('build-search');
    if (bs) bs.addEventListener('input', function () { buildQuery = bs.value || ''; renderBuildMenu(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { setMode('select'); selectedTool = null; pendingDeleteId = null; $('build-confirm').classList.add('hidden'); $('delete-confirm').classList.add('hidden'); $('medium-picker').classList.add('hidden'); $('guide-popover').classList.add('hidden'); $('speedtest-popover').classList.add('hidden'); $('layers-popover').classList.add('hidden'); closeModals(); closePanels(); closeSideMenu(); }
    });
    refresh();
    if (state && (state.tutorialStep == null || state.tutorialStep < TUTORIAL.length) && state.isNewGame) showTutorial(state.tutorialStep || 0);
  }

  window.GameUI = {
    init: init, toast: toast, refresh: refresh, renderTopbar: renderTopbar,
    onPlace: onPlace, onMapSelect: onMapSelect, selectNode: selectNode,
    showTutorial: showTutorial, setState: function (s) { state = s; refresh(); },
    getMode: function () { return mode; }, TUTORIAL: TUTORIAL
  };
})();
