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
  var pendingSuggestions = null; // last suggestPlacements list shown on map
  var lastLogLen = 0;
  var lastAlertCount = 0;
  var contractCounter = {};  // offerId -> counterTerms from negotiateContract
  var campaignForm = { typeId: null, days: 14 };

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
  function faDigits(s) { return String(s == null ? '' : s).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
  function fmt1(n) { return (n == null || isNaN(n)) ? '—' : (Math.round(n * 10) / 10).toLocaleString('fa-IR'); }
  function playSound(name) { try { if (window.GameAudio && GameAudio.play) GameAudio.play(name); } catch (e) { /* ignore */ } }
  function districtNameById(id) {
    var d = ((state && state.districts) || []).find(function (x) { return String(x.id) === String(id); });
    return d ? (d.name || d.id) : (id == null ? '—' : String(id));
  }

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
    wrench: svgIcon('<path d="M14.5 6.5a4 4 0 0 1 5.6-3.6l-2.7 2.7 1.4 1.4 2.7-2.7a4 4 0 0 1-5.3 4.9L8 17.3a2.1 2.1 0 0 1-3-3l8.2-8.2a4 4 0 0 1 1.3.4z"/>'),
    trophy: svgIcon('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H4a4 4 0 0 0 4 5M16 5h4a4 4 0 0 1-4 5"/><path d="M12 13v3M8.5 20h7M12 16v4"/>'),
    medal: svgIcon('<circle cx="12" cy="9" r="5"/><path d="m9.5 13-1.8 7L12 17.5 16.3 20 14.5 13"/><path d="M9.5 9h5"/>'),
    star: svgIcon('<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.7 6.6 19.6 7.7 13.6 3.2 9.4l6.1-.8z"/>'),
    users: svgIcon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 15.2c2.4.3 4.2 1.9 4.9 4.8"/>'),
    chart: svgIcon('<path d="M4 20V10M9 20V4M14 20v-8M19 20v-5"/><path d="M3 20h18"/>'),
    money: svgIcon('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9.5h.01M18 14.5h.01"/>'),
    globe: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9z"/>'),
    rocket: svgIcon('<path d="M12 15c5-3 7-8 7-11-3 0-8 2-11 7l-3 1 4 4 1-3z"/><path d="M9 12 4.5 7.5M12 15l4.5 4.5"/><circle cx="14" cy="10" r="1.6"/><path d="M5 19c-1 1-1.5 2-2 3 1-.5 2-1 3-2z"/>'),
    signal: svgIcon('<path d="M4 20v-4M8.5 20v-8M13 20V8M17.5 20V4"/>'),
    target: svgIcon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>')
  };
  var ACH_ICONS = {
    trophy: ICONS.trophy, medal: ICONS.medal, star: ICONS.star, users: ICONS.users,
    chart: ICONS.chart, money: ICONS.money, globe: ICONS.globe, rocket: ICONS.rocket,
    signal: ICONS.signal, target: ICONS.target, antenna: ICONS.antenna, bolt: ICONS.bolt,
    satellite: ICONS.satellite, core: ICONS.core, cable: ICONS.cable
  };
  function achIcon(key) { return ACH_ICONS[key] || ICONS.trophy; }
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
    if (kind === 'error') playSound('error');
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
    // clock HH:MM from state.hour
    var clockEl = $('ui-clock');
    if (clockEl) {
      var h = (state.hour != null && !isNaN(state.hour)) ? state.hour : 8;
      h = ((h % 24) + 24) % 24;
      var hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      clockEl.textContent = faDigits(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'));
    }
    // weather + season
    var wEl = $('ui-weather');
    if (wEl) {
      var wName = '—';
      try {
        var wk = (state.weather && state.weather.kind) || 'clear';
        var kinds = (window.GAME_DATA && GAME_DATA.weatherKinds) || {};
        var def = kinds[wk];
        wName = def && (def.name || def.nameFa) ? (def.name || def.nameFa) : String(wk);
      } catch (e) { /* ignore */ }
      var sName = '';
      try {
        if (window.GameSim && typeof GameSim.seasonOf === 'function') {
          var so = GameSim.seasonOf(state);
          if (so && so.name) sName = so.name;
        }
      } catch (e) { /* ignore */ }
      wEl.textContent = sName ? (wName + ' — ' + sName) : wName;
    }
    // demand level
    var dEl = $('ui-demand-level');
    if (dEl) {
      var label = '—';
      try {
        if (window.GameSim && typeof GameSim.demandFactorAtHour === 'function') {
          var f = GameSim.demandFactorAtHour(state.hour != null ? state.hour : 8);
          label = f < 0.7 ? 'کم' : f < 1.05 ? 'متوسط' : f < 1.25 ? 'زیاد' : 'اوج';
        }
      } catch (e) { /* ignore */ }
      dEl.textContent = label;
    }
    var n = (state.problems || []).length;
    if (n > lastAlertCount) playSound('alert');
    lastAlertCount = n;
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

  function suggestEquipId() {
    if (selectedTool) return selectedTool;
    var list = equipList();
    var c4 = list.find(function (i) { return i.id === 'cell_4g'; });
    if (c4 && isUnlocked(c4)) return 'cell_4g';
    var wf = list.find(function (i) { return i.id === 'wifi_ap'; });
    if (wf && isUnlocked(wf)) return 'wifi_ap';
    var anyAccess = list.find(function (i) { return (i.category === 'access') && isUnlocked(i); });
    return anyAccess ? anyAccess.id : null;
  }

  function runSuggest() {
    if (!state) return;
    if (!window.GameSim || typeof GameSim.suggestPlacements !== 'function') {
      toast('پیشنهاد جای دکل در این نسخه موجود نیست.', 'warn'); return;
    }
    var equipId = suggestEquipId();
    if (!equipId) { toast('تجهیز مناسبی برای پیشنهاد در دسترس نیست.', 'error'); return; }
    var list = null;
    try { list = GameSim.suggestPlacements(state, equipId); } catch (e) { list = null; }
    if (!list || !list.length) { toast('جای مناسبی برای نصب پیدا نشد.', 'warn'); return; }
    pendingSuggestions = list;
    try { if (window.CityMap && typeof CityMap.setSuggestions === 'function') CityMap.setSuggestions(list); } catch (e) { /* ignore */ }
    toast(fmt(list.length) + ' نقطه پیشنهادی روی نقشه مشخص شد. روی یکی کلیک کنید تا ساخت شروع شود.', 'success');
    if (isMobile()) $('panel-right').classList.remove('open');
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
      playSound('build');
      toast('دستگاه با موفقیت نصب شد. یادتان باشد آن را به شبکه وصل کنید!', 'success');
      if (res && (res.nodeId != null || res.id != null)) selectNode(res.nodeId != null ? res.nodeId : res.id);
    }
    pendingBuild = null;
    refresh();
  }

  function clearSuggestions() {
    pendingSuggestions = null;
    try { if (window.CityMap && typeof CityMap.setSuggestions === 'function') CityMap.setSuggestions(null); } catch (e) { /* ignore */ }
  }

  function onMapSelect(id, kind, wx, wy) {
    if (kind === 'suggestion') {
      var list = pendingSuggestions || [];
      var s = list[id];
      clearSuggestions();
      if (s) {
        var equipId = selectedTool || suggestEquipId();
        if (equipId) {
          selectedTool = equipId;
          setMode('place');
          onPlace(s.x, s.y);
        } else {
          toast('تجهیز مناسبی برای ساخت در دسترس نیست.', 'error');
        }
      }
      return;
    }
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

  function nodeTechOf(n) {
    if (n.tech) return n.tech;
    var eq = equipList().find(function (e) { return e.id === n.type || e.id === n.equipId; });
    if (eq && eq.tech) return eq.tech;
    try {
      if (window.GameSim && typeof GameSim.techOfNode === 'function') return GameSim.techOfNode(n.type);
    } catch (e) { /* ignore */ }
    var t = String(n.type || '').toLowerCase();
    if (t.indexOf('wifi') >= 0 || t.indexOf('ap') >= 0) return 'wifi';
    if (t.indexOf('cell') >= 0 || t.indexOf('rru') >= 0 || t.indexOf('ant') >= 0) return 'cellular';
    if (t.indexOf('fwa') >= 0 || t.indexOf('cpe') >= 0) return 'fwa';
    if (t.indexOf('sat') >= 0) return 'satellite';
    if (t.indexOf('ftth') >= 0 || t.indexOf('fiber') >= 0) return 'fiber';
    return null;
  }

  function individualsHtml(list, emptyMsg) {
    if (!list || !list.length) return '<p class="muted">' + esc(emptyMsg || 'مشترک فردی ثبت نشده است.') + '</p>';
    return '<div class="indiv-list">' + list.slice(0, 12).map(function (p) {
      var isSub = p.status === 'subscriber' || p.status === 'subscribed' || p.status === 'active' || p.subscribed === true;
      var stFa = isSub ? 'مشترک' : 'غیرمشترک';
      var satv = Math.max(0, Math.min(100, Math.round(p.satisfaction || 0)));
      return '<div class="indiv-row"><div class="indiv-head"><span>' + esc(p.name || p.id) + '</span>' +
        '<span class="muted">' + fmt(p.needMbps || 0) + ' Mbps — ' + stFa + '</span></div>' +
        '<div class="cap-bar"><div class="cap-fill ' + (satv < 30 ? 'hot' : satv < 60 ? 'warm' : '') + '" style="width:' + satv + '%"></div></div></div>';
    }).join('') + '</div>';
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
      var bIndiv = (state.individuals || []).filter(function (p) { return String(p.buildingId) === String(n.id); });
      html += '<h5>ساکنان ساختمان</h5>' + individualsHtml(bIndiv, 'ساکنی برای این ساختمان ثبت نشده است.');
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
        (n.avgLatency != null ? '<dt>تأخیر میانگین</dt><dd>' + fmt1(n.avgLatency) + ' ms</dd>' : '') +
        (n.perSubMbps != null ? '<dt>سرعت هر مشترک</dt><dd>' + fmt1(n.perSubMbps) + ' Mbps</dd>' : '') +
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
      var dIndiv = (state.individuals || []).filter(function (p) { return String(p.districtId) === String(n.id); });
      html += '<h5>مشترکان فردی منطقه</h5>' + individualsHtml(dIndiv, 'مشترک فردی در این منطقه ثبت نشده است.');
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
      // channel control for access nodes that have a channel
      if (n.channel != null) {
        var techKey = nodeTechOf(n) || 'wifi';
        var sets = (window.GAME_DATA && GAME_DATA.channelSets) || {};
        var setDef = sets[techKey] || sets.wifi || sets.cellular || {};
        var labels = setDef.labels || setDef.channels || [];
        var interf = (n.interference != null && !isNaN(n.interference)) ? Math.round(n.interference * 100) : null;
        var interfCls = interf == null ? '' : interf > 60 ? 'status-bad' : interf > 30 ? 'status-warn' : 'status-ok';
        html += '<h5>کانال رادیویی</h5><div class="channel-row"><label>کانال: <select data-channel-select="' + esc(n.id) + '">' +
          (labels.length ? labels.map(function (lb, ci) {
            var val = (typeof lb === 'object') ? (lb.value != null ? lb.value : ci) : lb;
            var txt = (typeof lb === 'object') ? (lb.label || lb.name || String(val)) : String(lb);
            return '<option value="' + esc(val) + '"' + (String(val) === String(n.channel) ? ' selected' : '') + '>' + esc(txt) + '</option>';
          }).join('') : '<option value="' + esc(n.channel) + '" selected>' + esc(n.channel) + '</option>') +
          '</select></label>' +
          (interf != null ? ' <span class="' + interfCls + '">تداخل: ' + fmt(interf) + '٪</span>' : '') +
          ' <button class="btn sm" data-auto-channel="' + esc(n.id) + '">انتخاب خودکار کانال</button></div>';
      }
      // sector control for access nodes
      var isAccess = false;
      try { isAccess = window.GameSim && GameSim.isAccessNode ? GameSim.isAccessNode(n) : (n.radius != null && n.radius > 0); } catch (e) { isAccess = false; }
      if (isAccess) {
        var dirV = (n.direction != null && !isNaN(n.direction)) ? Math.round(n.direction) : 0;
        var angV = (n.angle != null && !isNaN(n.angle)) ? Math.round(n.angle) : 360;
        html += '<h5>جهت و پهنای سکتور</h5>' +
          '<div class="sector-row"><label>جهت: <input type="range" min="0" max="360" value="' + dirV + '" data-sector-dir="' + esc(n.id) + '"> <span data-sector-dir-val>' + fmt(dirV) + '°</span></label></div>' +
          '<div class="sector-row"><label>پهنا: <input type="range" min="30" max="360" value="' + angV + '" data-sector-angle="' + esc(n.id) + '"> <span data-sector-angle-val>' + fmt(angV) + '°</span></label></div>' +
          '<p class="muted">جهت ۰ درجه یعنی شمال؛ پهنا ۳۶۰ درجه یعنی پوشش کامل دایره‌ای.</p>';
      }
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
    box.querySelectorAll('[data-channel-select]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var nid = sel.getAttribute('data-channel-select');
        var ch = sel.value;
        var num = Number(ch);
        if (!isNaN(num) && String(num) === String(ch)) ch = num;
        if (window.GameSim && typeof GameSim.setNodeChannel === 'function') {
          var r = GameSim.setNodeChannel(state, nid, ch);
          toast(r && r.ok === false ? (r.error || 'تغییر کانال انجام نشد.') : 'کانال تغییر کرد.', r && r.ok === false ? 'error' : 'success');
        } else {
          var node = findNode(nid);
          if (node) node.node.channel = ch;
          toast('کانال تغییر کرد.', 'success');
        }
        refresh();
      });
    });
    box.querySelectorAll('[data-auto-channel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nid = btn.getAttribute('data-auto-channel');
        if (window.GameSim && typeof GameSim.autoChannel === 'function') {
          var r = GameSim.autoChannel(state, nid);
          toast(r && r.ok === false ? (r.error || 'انتخاب خودکار انجام نشد.') : 'بهترین کانال انتخاب شد: ' + (r && r.channel != null ? r.channel : ''), r && r.ok === false ? 'error' : 'success');
        } else toast('انتخاب خودکار کانال در این نسخه موجود نیست.', 'warn');
        refresh();
      });
    });
    var dirInput = box.querySelector('[data-sector-dir]');
    var angInput = box.querySelector('[data-sector-angle]');
    function applySector() {
      var nid = dirInput ? dirInput.getAttribute('data-sector-dir') : (angInput ? angInput.getAttribute('data-sector-angle') : null);
      if (nid == null) return;
      var dir = dirInput ? +dirInput.value : 0;
      var ang = angInput ? +angInput.value : 360;
      var dv = box.querySelector('[data-sector-dir-val]'); if (dv) dv.textContent = fmt(dir) + '°';
      var av = box.querySelector('[data-sector-angle-val]'); if (av) av.textContent = fmt(ang) + '°';
      if (window.GameSim && typeof GameSim.setNodeDirection === 'function') {
        try { GameSim.setNodeDirection(state, nid, dir, ang); } catch (e) { /* ignore */ }
      } else {
        var f = findNode(nid);
        if (f) { f.node.direction = dir; f.node.angle = ang; }
      }
    }
    if (dirInput) { dirInput.addEventListener('input', applySector); dirInput.addEventListener('change', function () { applySector(); refresh(); }); }
    if (angInput) { angInput.addEventListener('input', applySector); angInput.addEventListener('change', function () { applySector(); refresh(); }); }
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
    var KIND_FA = { standard: 'معمولی', gaming: 'گیمینگ', streaming: 'استریم' };
    $('packages-body').innerHTML = '<table><tr><th>بسته</th><th>سرعت (Mbps)</th><th>قیمت ماهانه</th><th></th></tr>' +
      pkgs.map(function (p, i) {
        var kind = p.kind || 'standard';
        var badge = '<span class="pkg-kind kind-' + esc(kind) + '">' + esc(KIND_FA[kind] || kind) + '</span>';
        var extra = '';
        if (p.expectFa) extra += '<br><span class="muted">' + esc(p.expectFa) + '</span>';
        if (kind === 'gaming') extra += '<br><span class="muted">تأخیر هدف: کمتر از ۸۰ms</span>';
        if (kind === 'streaming') extra += '<br><span class="muted">پهنای باند پایدار در اوج مصرف</span>';
        return '<tr><td>' + esc(p.name || p.id) + ' ' + badge + extra + '</td>' +
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

  /* ---------- Achievements ---------- */
  function renderAchievements() {
    var body = $('achievements-body'); if (!body) return;
    var defs = (window.GAME_DATA && GAME_DATA.achievements) || [];
    defs = Array.isArray(defs) ? defs : Object.values(defs);
    if (!defs.length) { body.innerHTML = '<p class="muted">دستاوردی تعریف نشده است.</p>'; return; }
    var prog = {};
    try {
      if (window.GameSim && typeof GameSim.achievementProgress === 'function') {
        (GameSim.achievementProgress(state) || []).forEach(function (p) { prog[p.id] = p; });
      }
    } catch (e) { /* ignore */ }
    var unlockedMap = (state && state.achievements) || {};
    body.innerHTML = '<div class="ach-grid">' + defs.map(function (d) {
      var p = prog[d.id] || {};
      var unlocked = !!(p.unlocked || unlockedMap[d.id]);
      var current = p.current != null ? p.current : (unlocked ? (d.target || 0) : 0);
      var target = p.target != null ? p.target : (d.target || 0);
      var pct = target > 0 ? Math.max(0, Math.min(100, Math.round(current / target * 100))) : (unlocked ? 100 : 0);
      var dayInfo = unlockedMap[d.id];
      var dayTxt = '';
      if (unlocked && dayInfo != null) {
        var dayNum = (typeof dayInfo === 'object') ? (dayInfo.day != null ? dayInfo.day : null) : dayInfo;
        if (dayNum != null && !isNaN(dayNum)) dayTxt = 'روز ' + fmt(dayNum) + ' باز شد';
        else dayTxt = 'باز شده';
      }
      return '<div class="ach-card ' + (unlocked ? 'unlocked' : 'locked') + '">' +
        '<div class="ach-icon">' + achIcon(d.icon) + '</div>' +
        '<h5>' + esc(d.name || d.id) + '</h5>' +
        '<p>' + esc(d.desc || '') + '</p>' +
        '<div class="cap-bar"><div class="cap-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="muted ach-prog">' + fmt(current) + ' از ' + fmt(target) + (dayTxt ? ' — ' + dayTxt : '') + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------- Contracts ---------- */
  function renderContracts() {
    var body = $('contracts-body'); if (!body) return;
    var offers = (state && state.contractOffers) || [];
    var contracts = (state && state.contracts) || [];
    var active = contracts.filter(function (c) { return c.status === 'active' || c.status == null || (c.monthsLeft != null && c.monthsLeft > 0 && c.status !== 'expired' && c.status !== 'ended'); });
    var expired = contracts.filter(function (c) { return c.status === 'expired' || c.status === 'ended' || (c.monthsLeft != null && c.monthsLeft <= 0 && c.status !== 'active'); }).slice(-5);
    var html = '<h4>پیشنهادهای جدید</h4>';
    if (!offers.length) html += '<p class="muted">پیشنهاد سازمانی جدیدی نیست.</p>';
    offers.forEach(function (o) {
      var counter = contractCounter[o.id];
      html += '<div class="contract-card"><h5>' + esc(o.orgName || o.id) + ' — ' + esc(districtNameById(o.districtId)) + '</h5>' +
        '<p class="muted">خواسته: سرعت ' + fmt(o.wantSpeed) + ' Mbps — SLA ' + fmt(o.wantSla) + '٪ — ' + fmt(o.wantPrice) + ' تومان/ماه — ' + fmt(o.months) + ' ماه (تا روز ' + fmt(o.expiresDay) + ')</p>' +
        '<div class="neg-form">' +
        '<label>سرعت <input type="number" min="1" value="' + (o.wantSpeed || 0) + '" data-neg-speed="' + esc(o.id) + '"></label>' +
        '<label>SLA <input type="number" min="1" max="100" value="' + (o.wantSla || 0) + '" data-neg-sla="' + esc(o.id) + '"></label>' +
        '<label>قیمت <input type="number" min="0" value="' + (o.wantPrice || 0) + '" data-neg-price="' + esc(o.id) + '"></label>' +
        '<label>ماه <input type="number" min="1" value="' + (o.months || 0) + '" data-neg-months="' + esc(o.id) + '"></label>' +
        '<button class="btn sm primary" data-neg-submit="' + esc(o.id) + '">پیشنهاد</button></div>';
      if (counter) {
        html += '<div class="warn-box">پیشنهاد متقابل: سرعت ' + fmt(counter.speed) + ' Mbps — SLA ' + fmt(counter.sla) + '٪ — ' + fmt(counter.price) + ' تومان/ماه — ' + fmt(counter.months) + ' ماه' +
          '<div class="fix-btns"><button class="btn sm primary" data-neg-accept="' + esc(o.id) + '">پذیرفتن پیشنهاد متقابل</button>' +
          '<button class="btn sm" data-neg-reject="' + esc(o.id) + '">رد کردن</button></div></div>';
      }
      html += '</div>';
    });
    html += '<h4>قراردادهای فعال</h4>';
    if (!active.length) html += '<p class="muted">قرارداد فعالی نیست.</p>';
    else {
      html += '<table><tr><th>سازمان</th><th>منطقه</th><th>سرعت</th><th>SLA</th><th>ماهانه</th><th>مانده</th><th>نقض</th></tr>' +
        active.map(function (c) {
          return '<tr><td>' + esc(c.orgName || c.id) + '</td><td>' + esc(districtNameById(c.districtId)) + '</td><td>' + fmt(c.speed) + ' Mbps</td><td>' + fmt(c.sla) + '٪</td><td>' + fmt(c.priceMonthly) + '</td><td>' + fmt(c.monthsLeft) + ' ماه</td><td>' + fmt(c.breaches || 0) + '</td></tr>';
        }).join('') + '</table>';
    }
    if (expired.length) {
      html += '<h4>قراردادهای پایان‌یافته</h4><table><tr><th>سازمان</th><th>منطقه</th><th>سرعت</th><th>ماهانه</th></tr>' +
        expired.map(function (c) { return '<tr><td>' + esc(c.orgName || c.id) + '</td><td>' + esc(districtNameById(c.districtId)) + '</td><td>' + fmt(c.speed) + ' Mbps</td><td>' + fmt(c.priceMonthly) + '</td></tr>'; }).join('') + '</table>';
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-neg-submit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var oid = btn.getAttribute('data-neg-submit');
        var terms = {
          speed: +body.querySelector('[data-neg-speed="' + oid + '"]').value,
          sla: +body.querySelector('[data-neg-sla="' + oid + '"]').value,
          price: +body.querySelector('[data-neg-price="' + oid + '"]').value,
          months: +body.querySelector('[data-neg-months="' + oid + '"]').value
        };
        negotiate(oid, terms);
      });
    });
    body.querySelectorAll('[data-neg-accept]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var oid = btn.getAttribute('data-neg-accept');
        var c = contractCounter[oid];
        if (c) negotiate(oid, c);
      });
    });
    body.querySelectorAll('[data-neg-reject]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        delete contractCounter[btn.getAttribute('data-neg-reject')];
        toast('پیشنهاد متقابل رد شد.', 'warn');
        renderContracts();
      });
    });
  }
  function negotiate(offerId, terms) {
    if (!window.GameSim || typeof GameSim.negotiateContract !== 'function') { toast('مذاکره قرارداد در این نسخه موجود نیست.', 'warn'); return; }
    var r = null;
    try { r = GameSim.negotiateContract(state, offerId, terms); } catch (e) { r = null; }
    if (!r) { toast('مذاکره انجام نشد.', 'error'); return; }
    if (r.status === 'accepted') {
      delete contractCounter[offerId];
      playSound('complete');
      toast('قرارداد پذیرفته شد.', 'success');
    } else if (r.status === 'counter') {
      contractCounter[offerId] = r.counterTerms || terms;
      toast('پیشنهاد متقابل دریافت شد.', 'warn');
    } else {
      delete contractCounter[offerId];
      toast('پیشنهاد رد شد.', 'error');
    }
    renderContracts(); refresh();
  }

  /* ---------- Campaigns ---------- */
  function renderCampaigns() {
    var body = $('campaigns-body'); if (!body) return;
    var types = (window.GAME_DATA && GAME_DATA.campaignTypes) || [];
    types = Array.isArray(types) ? types : Object.values(types);
    var campaigns = (state && state.campaigns) || [];
    var districts = ((state && state.districts) || []).slice();
    districts.sort(function (a, b) { return (b.connected ? 1 : 0) - (a.connected ? 1 : 0); });
    var selType = types.find(function (t) { return t.id === campaignForm.typeId; }) || types[0];
    if (selType) campaignForm.typeId = selType.id;
    var checkedIds = {};
    body.querySelectorAll('[data-camp-district]:checked').forEach(function (cb) { checkedIds[cb.value] = true; });
    var html = '<h4>کمپین جدید</h4>';
    if (!types.length) html += '<p class="muted">نوع کمپینی تعریف نشده است.</p>';
    else {
      html += '<div class="camp-form"><label>نوع: <select id="camp-type">' + types.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (selType && t.id === selType.id ? ' selected' : '') + '>' + esc(t.name || t.id) + ' — ' + fmt(t.costPerDay || 0) + ' تومان/روز — ضریب ' + fmt1(t.multiplier || 1) + '</option>';
      }).join('') + '</select></label>' +
        '<label>مدت (روز): <input type="number" id="camp-days" min="1" value="' + campaignForm.days + '"></label>' +
        '<span class="muted">پیش‌فرض‌ها: ۷ / ۱۴ / ۳۰ روز</span>' +
        '<div class="camp-districts">' + districts.map(function (d) {
          return '<label><input type="checkbox" data-camp-district value="' + esc(d.id) + '"' + (checkedIds[d.id] ? ' checked' : '') + '> ' + esc(d.name || d.id) + (d.connected ? ' (دارای سرویس)' : '') + '</label>';
        }).join('') + '</div>' +
        '<div id="camp-cost-preview" class="muted"></div>' +
        '<button class="btn primary" id="camp-start">شروع کمپین</button></div>';
    }
    var activeC = campaigns.filter(function (c) { return c.active !== false; });
    html += '<h4>کمپین‌های فعال</h4>';
    if (!activeC.length) html += '<p class="muted">کمپین فعالی نیست.</p>';
    else {
      html += activeC.map(function (c) {
        var t = types.find(function (x) { return x.id === c.typeId; });
        var daysLeft = Math.max(0, (c.endDay || 0) - (state.day || 0));
        var pkgs = (state.packages) || [];
        var avgPrice = pkgs.length ? pkgs.reduce(function (s, p) { return s + (p.price || 0); }, 0) / pkgs.length : 0;
        var gain = Math.round((c.newSubs || 0) * avgPrice);
        var roiTxt = 'درآمد تقریبی مشترکان جدید: ' + fmt(gain) + ' تومان در برابر هزینه ' + fmt(c.spent || 0) + ' تومان';
        return '<div class="contract-card"><h5>' + esc(t ? (t.name || t.id) : c.typeId) + '</h5>' +
          '<p class="muted">' + fmt((c.districtIds || []).length) + ' منطقه — ' + fmt(daysLeft) + ' روز مانده — هزینه‌شده ' + fmt(c.spent || 0) + ' تومان — مشترکان جدید ' + fmt(c.newSubs || 0) + '</p>' +
          '<p class="muted">' + esc(roiTxt) + '</p>' +
          '<button class="btn sm danger" data-camp-stop="' + esc(c.id) + '">توقف کمپین</button></div>';
      }).join('');
    }
    body.innerHTML = html;
    function updatePreview() {
      var prev = $('camp-cost-preview'); if (!prev) return;
      var t = types.find(function (x) { return x.id === campaignForm.typeId; }) || {};
      var n = body.querySelectorAll('[data-camp-district]:checked').length;
      var total = Math.round((t.costPerDay || 0) * (campaignForm.days || 0) * Math.max(1, n));
      prev.textContent = 'هزینه کل تقریبی: ' + fmt(total) + ' تومان (' + fmt(n) + ' منطقه × ' + fmt(campaignForm.days) + ' روز)';
    }
    var typeSel = $('camp-type');
    if (typeSel) typeSel.addEventListener('change', function () { campaignForm.typeId = typeSel.value; updatePreview(); });
    var daysIn = $('camp-days');
    if (daysIn) daysIn.addEventListener('input', function () { campaignForm.days = Math.max(1, +daysIn.value || 1); updatePreview(); });
    body.querySelectorAll('[data-camp-district]').forEach(function (cb) { cb.addEventListener('change', updatePreview); });
    updatePreview();
    var startBtn = $('camp-start');
    if (startBtn) startBtn.addEventListener('click', function () {
      var ids = [];
      body.querySelectorAll('[data-camp-district]:checked').forEach(function (cb) { ids.push(cb.value); });
      if (!ids.length) { toast('حداقل یک منطقه انتخاب کنید.', 'error'); return; }
      if (!window.GameSim || typeof GameSim.startCampaign !== 'function') { toast('کمپین در این نسخه موجود نیست.', 'warn'); return; }
      var r = null;
      try { r = GameSim.startCampaign(state, campaignForm.typeId, ids, campaignForm.days); } catch (e) { r = null; }
      toast(r && r.ok === false ? (r.error || 'کمپین شروع نشد.') : 'کمپین شروع شد.', r && r.ok === false ? 'error' : 'success');
      if (r && r.ok !== false) playSound('complete');
      renderCampaigns(); refresh();
    });
    body.querySelectorAll('[data-camp-stop]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.GameSim && typeof GameSim.stopCampaign === 'function') {
          try { GameSim.stopCampaign(state, btn.getAttribute('data-camp-stop')); } catch (e) { /* ignore */ }
          toast('کمپین متوقف شد.', 'warn');
        }
        renderCampaigns(); refresh();
      });
    });
  }

  /* ---------- Constellation ---------- */
  function renderConstellation() {
    var body = $('constellation-body'); if (!body) return;
    var launch = (window.GAME_DATA && GAME_DATA.satelliteLaunch) || {};
    var sats = (state && state.satellites) || [];
    var cap = 0;
    try { if (window.GameSim && typeof GameSim.constellationCapacity === 'function') cap = GameSim.constellationCapacity(state) || 0; } catch (e) { /* ignore */ }
    var hasTech = false;
    try {
      if (window.GameSim && GameSim.isUnlocked) hasTech = !!GameSim.isUnlocked(state, 'own_satellite');
      else hasTech = !!((state && state.unlockedTechs && state.unlockedTechs.own_satellite) || (state && state.techs && state.techs.own_satellite));
    } catch (e) { /* ignore */ }
    var STATUS_FA_SAT = { launching: 'در حال پرتاب', active: 'فعال', failed: 'خراب', deorbited: 'از مدار خارج شده', building: 'در حال پرتاب' };
    function launchBtn(kind, label) {
      var def = launch[kind] || {};
      var cost = def.cost || 0;
      var dis = !hasTech || (state.cash || 0) < cost;
      var reason = !hasTech ? 'نیازمند تحقیق «ماهواره اختصاصی»' : ((state.cash || 0) < cost ? 'نقدینگی کافی نیست' : '');
      return '<div class="contract-card"><h5>' + label + '</h5>' +
        '<p class="muted">هزینه ' + fmt(cost) + ' تومان — زمان ساخت ' + fmt(def.buildDays || 0) + ' روز — ظرفیت ' + fmt(def.capacity || 0) + ' Mbps — عمر ' + fmt(def.lifetimeDays || 0) + ' روز</p>' +
        '<button class="btn sm primary" data-launch="' + kind + '"' + (dis ? ' disabled title="' + esc(reason) + '"' : '') + '>پرتاب</button>' +
        (reason ? ' <span class="muted">' + esc(reason) + '</span>' : '') + '</div>';
    }
    var html = '<p>ظرفیت کل صورت فلکی: <strong>' + fmt(cap) + ' Mbps</strong></p>' +
      launchBtn('leo', 'ماهواره مدار پایین (LEO)') + launchBtn('geo', 'ماهواره زمین‌آهنگ (GEO)') +
      '<h4>ماهواره‌های شما</h4>';
    if (!sats.length) html += '<p class="muted">هنوز ماهواره‌ای پرتاب نکرده‌اید.</p>';
    else {
      html += sats.map(function (s) {
        var pct = s.lifetimeDays > 0 ? Math.max(0, Math.min(100, Math.round((s.ageDays || 0) / s.lifetimeDays * 100))) : 0;
        return '<div class="contract-card"><h5>' + esc(s.name || s.id) + ' — ' + esc(String(s.kind || '').toUpperCase()) + '</h5>' +
          '<p class="muted">وضعیت: ' + esc(STATUS_FA_SAT[s.status] || s.status || '—') + ' — ظرفیت ' + fmt(s.capacity || 0) + ' Mbps — سلامت ' + fmt(Math.round((s.health != null ? s.health : 1) * 100)) + '٪ — هزینه ماهانه ' + fmt(s.monthlyCost || 0) + ' تومان</p>' +
          '<div class="cap-bar"><div class="cap-fill ' + (pct > 85 ? 'hot' : pct > 65 ? 'warm' : '') + '" style="width:' + pct + '%"></div></div>' +
          '<div class="muted">عمر: ' + fmt(s.ageDays || 0) + ' از ' + fmt(s.lifetimeDays || 0) + ' روز' + (s.launchTimer ? ' — تا فعال‌سازی: ' + fmt(s.launchTimer) + ' روز' : '') + '</div></div>';
      }).join('');
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-launch]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.GameSim || typeof GameSim.launchSatellite !== 'function') { toast('پرتاب ماهواره در این نسخه موجود نیست.', 'warn'); return; }
        var r = null;
        try { r = GameSim.launchSatellite(state, btn.getAttribute('data-launch')); } catch (e) { r = null; }
        toast(r && r.ok === false ? (r.error || 'پرتاب انجام نشد.') : 'پرتاب ماهواره آغاز شد.', r && r.ok === false ? 'error' : 'success');
        if (r && r.ok !== false) playSound('complete');
        renderConstellation(); refresh();
      });
    });
  }

  /* ---------- Stats charts ---------- */
  function drawLineChart(canvas, series, color, label) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth || 560, h = canvas.clientHeight || 150;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx2 = canvas.getContext('2d'); if (!ctx2) return;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, w, h);
    ctx2.font = '11px Vazirmatn, Tahoma, sans-serif';
    ctx2.fillStyle = '#8b949e'; ctx2.textAlign = 'right';
    ctx2.fillText(label, w - 8, 14);
    if (!series.length) {
      ctx2.fillStyle = '#8b949e'; ctx2.textAlign = 'center';
      ctx2.fillText('داده‌ای نیست', w / 2, h / 2);
      return;
    }
    var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
    if (max === min) max = min + 1;
    var padL = 46, padR = 8, padT = 20, padB = 16;
    var iw = w - padL - padR, ih = h - padT - padB;
    ctx2.strokeStyle = '#30363d'; ctx2.lineWidth = 1;
    ctx2.beginPath(); ctx2.moveTo(padL, padT); ctx2.lineTo(padL, padT + ih); ctx2.lineTo(padL + iw, padT + ih); ctx2.stroke();
    ctx2.fillStyle = '#8b949e'; ctx2.textAlign = 'right';
    ctx2.fillText(fmt(max), padL - 4, padT + 4);
    ctx2.fillText(fmt(min), padL - 4, padT + ih);
    ctx2.strokeStyle = color; ctx2.lineWidth = 2; ctx2.beginPath();
    series.forEach(function (v, i) {
      var x = padL + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw);
      var y = padT + ih - ((v - min) / (max - min)) * ih;
      if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
    });
    ctx2.stroke();
  }
  function renderStats() {
    var body = $('stats-body'); if (!body) return;
    var rangeEl = $('stats-range');
    var range = rangeEl ? rangeEl.value : 'all';
    var hist = ((state && state.history) || []).slice();
    if (range === '30') hist = hist.slice(-30);
    else if (range === '90') hist = hist.slice(-90);
    if (!hist.length) { body.innerHTML = '<p class="muted">هنوز سابقه‌ای ثبت نشده است. چند روز بازی کنید تا نمودارها ساخته شوند.</p>'; return; }
    var charts = [
      { id: 'cash', label: 'نقدینگی', color: '#2f81f7', get: function (r) { return r.cash || 0; } },
      { id: 'rev', label: 'درآمد روزانه', color: '#3fb950', get: function (r) { return r.revenue || 0; } },
      { id: 'subs', label: 'مشترکان', color: '#a371f7', get: function (r) { return r.subs || 0; } },
      { id: 'sat', label: 'رضایت (٪)', color: '#d29922', get: function (r) { return r.sat || 0; } },
      { id: 'cov', label: 'پوشش (٪)', color: '#22d3ee', get: function (r) { return r.cov || 0; } }
    ];
    var html = charts.map(function (c) { return '<div class="stats-chart"><canvas id="chart-' + c.id + '" class="chart-canvas"></canvas></div>'; }).join('');
    html += '<div class="stats-chart"><canvas id="chart-bytech" class="chart-canvas"></canvas></div>' +
      '<p class="muted">مشترکان به تفکیک فناوری: فیبر (فیروزه‌ای)، سلولار (سبز)، وایرلس ثابت (نارنجی)، وای‌فای (بنفش)، ماهواره (صورتی).</p>';
    body.innerHTML = html;
    charts.forEach(function (c) {
      var cv = $('chart-' + c.id);
      if (cv) drawLineChart(cv, hist.map(c.get), c.color, c.label);
    });
    // by-tech stacked lines: draw 5 lines on one canvas
    var cv2 = $('chart-bytech');
    if (cv2) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = cv2.clientWidth || 560, h = cv2.clientHeight || 150;
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(h * dpr);
      var ctx2 = cv2.getContext('2d');
      if (ctx2) {
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2.clearRect(0, 0, w, h);
        ctx2.font = '11px Vazirmatn, Tahoma, sans-serif';
        ctx2.fillStyle = '#8b949e'; ctx2.textAlign = 'right';
        ctx2.fillText('مشترکان به تفکیک فناوری', w - 8, 14);
        var techs = [['fiber', '#22d3ee'], ['cellular', '#3fb950'], ['fwa', '#fb923c'], ['wifi', '#a78bfa'], ['satellite', '#e879f9']];
        var maxV = 1;
        hist.forEach(function (r) { techs.forEach(function (t) { maxV = Math.max(maxV, (r.byTech && r.byTech[t[0]]) || 0); }); });
        var padL = 46, padR = 8, padT = 20, padB = 16;
        var iw = w - padL - padR, ih = h - padT - padB;
        ctx2.strokeStyle = '#30363d'; ctx2.beginPath(); ctx2.moveTo(padL, padT); ctx2.lineTo(padL, padT + ih); ctx2.lineTo(padL + iw, padT + ih); ctx2.stroke();
        ctx2.fillStyle = '#8b949e'; ctx2.textAlign = 'right'; ctx2.fillText(fmt(maxV), padL - 4, padT + 4);
        techs.forEach(function (t) {
          ctx2.strokeStyle = t[1]; ctx2.lineWidth = 1.8; ctx2.beginPath();
          hist.forEach(function (r, i) {
            var v = (r.byTech && r.byTech[t[0]]) || 0;
            var x = padL + (hist.length === 1 ? iw / 2 : (i / (hist.length - 1)) * iw);
            var y = padT + ih - (v / maxV) * ih;
            if (i === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
          });
          ctx2.stroke();
        });
      }
    }
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

  function refresh() {
    // drain newly unlocked achievements
    try {
      if (state && state.newAchievements && state.newAchievements.length) {
        var defs = (window.GAME_DATA && GAME_DATA.achievements) || [];
        var byId = {};
        (Array.isArray(defs) ? defs : Object.values(defs)).forEach(function (d) { byId[d.id] = d; });
        var queue = state.newAchievements.slice();
        state.newAchievements.length = 0;
        queue.forEach(function (a) {
          var def = (typeof a === 'object') ? (byId[a.id] || a) : (byId[a] || { name: a });
          toast('دستاورد باز شد: ' + (def.name || def.id), 'success');
          playSound('achievement');
        });
      }
    } catch (e) { /* ignore */ }
    // build-complete detection via log
    try {
      var log = (state && state.log) || [];
      if (log.length > lastLogLen) {
        for (var i = lastLogLen; i < log.length; i++) {
          var e = log[i];
          var msg = typeof e === 'string' ? e : (e.msg || e.text || e.message || '');
          var kind = (typeof e === 'object' && e.kind) || '';
          if ((kind === 'build' || kind === 'construct') && msg.indexOf('تمام شد') >= 0) playSound('complete');
          else if (msg.indexOf('تمام شد') >= 0 && (msg.indexOf('ساخت') >= 0 || msg.indexOf('نصب') >= 0)) playSound('complete');
        }
      }
      lastLogLen = log.length;
    } catch (e2) { /* ignore */ }
    renderTopbar(); renderBuildMenu(); renderDetail();
    // re-render open new modals if visible
    try {
      var m;
      if ((m = $('modal-achievements')) && !m.classList.contains('hidden')) renderAchievements();
      if ((m = $('modal-contracts')) && !m.classList.contains('hidden')) renderContracts();
      if ((m = $('modal-campaigns')) && !m.classList.contains('hidden')) renderCampaigns();
      if ((m = $('modal-constellation')) && !m.classList.contains('hidden')) renderConstellation();
      if ((m = $('modal-stats')) && !m.classList.contains('hidden')) renderStats();
    } catch (e3) { /* ignore */ }
  }

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
    if ($('btn-achievements')) $('btn-achievements').addEventListener('click', function () { renderAchievements(); openModal('modal-achievements'); });
    if ($('btn-contracts')) $('btn-contracts').addEventListener('click', function () { renderContracts(); openModal('modal-contracts'); });
    if ($('btn-campaigns')) $('btn-campaigns').addEventListener('click', function () { renderCampaigns(); openModal('modal-campaigns'); });
    if ($('btn-constellation')) $('btn-constellation').addEventListener('click', function () { renderConstellation(); openModal('modal-constellation'); });
    if ($('btn-stats')) $('btn-stats').addEventListener('click', function () { renderStats(); openModal('modal-stats'); });
    if ($('btn-suggest')) $('btn-suggest').addEventListener('click', runSuggest);
    if ($('stats-range')) $('stats-range').addEventListener('change', renderStats);
    // audio controls
    try {
      var gs = (window.GameAudio && GameAudio.getSettings) ? GameAudio.getSettings() : { volume: 0.7, muted: false, music: false };
      var volEl = $('audio-volume'), muteEl = $('audio-mute'), musicEl = $('audio-music');
      if (volEl) { volEl.value = Math.round(gs.volume * 100); volEl.addEventListener('input', function () { if (window.GameAudio) GameAudio.setVolume(+volEl.value / 100); }); }
      if (muteEl) { muteEl.checked = !!gs.muted; muteEl.addEventListener('change', function () { if (window.GameAudio) GameAudio.setMuted(muteEl.checked); }); }
      if (musicEl) { musicEl.checked = !!gs.music; musicEl.addEventListener('change', function () { if (window.GameAudio) GameAudio.setMusic(musicEl.checked); }); }
    } catch (e) { /* ignore */ }
    // click sound delegate
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && (t.closest('.btn') || t.closest('.side-item'))) playSound('click');
    });
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
        if (cb.getAttribute('data-layer') === 'signal') {
          var sg = $('signal-legend'); if (sg) sg.classList.toggle('hidden', !cb.checked);
        }
      });
    });
    var bs = $('build-search');
    if (bs) bs.addEventListener('input', function () { buildQuery = bs.value || ''; renderBuildMenu(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { clearSuggestions(); setMode('select'); selectedTool = null; pendingDeleteId = null; $('build-confirm').classList.add('hidden'); $('delete-confirm').classList.add('hidden'); $('medium-picker').classList.add('hidden'); $('guide-popover').classList.add('hidden'); $('speedtest-popover').classList.add('hidden'); $('layers-popover').classList.add('hidden'); closeModals(); closePanels(); closeSideMenu(); }
    });
    lastLogLen = ((state && state.log) || []).length;
    lastAlertCount = ((state && state.problems) || []).length;
    refresh();
    if (state && (state.tutorialStep == null || state.tutorialStep < TUTORIAL.length) && state.isNewGame) showTutorial(state.tutorialStep || 0);
  }

  window.GameUI = {
    init: init, toast: toast, refresh: refresh, renderTopbar: renderTopbar,
    onPlace: onPlace, onMapSelect: onMapSelect, selectNode: selectNode,
    showTutorial: showTutorial, setState: function (s) { state = s; lastLogLen = ((s && s.log) || []).length; lastAlertCount = ((s && s.problems) || []).length; contractCounter = {}; clearSuggestions(); refresh(); },
    getMode: function () { return mode; }, TUTORIAL: TUTORIAL
  };
})();
