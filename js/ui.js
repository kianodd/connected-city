/* UI shell: renders topbar, build menu, detail panel, modals, tutorial, toasts.
   Depends on globals: GAME_DATA (data.js), GameSim (sim.js), CityMap (map.js).
   Exposes window.GameUI with init + refresh helpers used by main.js. */
(function () {
  'use strict';

  var state = null;          // reference to sim state (set via setState)
  var mode = 'select';       // select | place | connect | demolish
  var selectedTool = null;   // equipment id chosen for placement
  var connectFirst = null;   // source node id armed from its detail panel
  var panelPointerDown = false; // pointer currently down inside detail panel (protect taps from re-render)
  var lastTapAt = 0; // زمان آخرین ضربه روی نقشه (برای خنثی‌کردن کلیکِ دنباله‌دار همان ضربه روی پاپ‌آپ تازه‌بازشده)
  var connectFromBuilding = null; // building id when arming a fiber drop from the building panel
  var selectedId = null;     // currently inspected node/building id
  var pendingBuild = null;   // {equipId, x, y} awaiting confirm
  var pendingSuggestions = null; // last suggestPlacements list shown on map
  var lastLogLen = 0;
  var lastAlertCount = 0;
  var campaignForm = { typeId: null, days: 14 };

  var TUTORIAL = [
    { title: 'گام ۱: بررسی نقشه', text: 'به «شبکه‌ساز: شهر متصل» خوش آمدید! بازی از سال ۱۹۹۱ شروع می‌شود و هر ۱۰ روزِ بازی یک سال جلو می‌رود؛ تجهیزات با رسیدن دورانشان در منوی ساخت ظاهر می‌شوند (فیبر ۱۹۹۵، 3G در ۲۰۰۱، FTTH در ۲۰۰۴، 4G در ۲۰۰۹، TD-LTE در ۲۰۱۲، 5G در ۲۰۱۹). روی نقشه مناطق و ساختمان‌ها را ببینید؛ فقط مرکز شهر و حاشیهٔ شمالی در شروع بازند و بقیهٔ مناطق با پرداخت هزینه باز می‌شوند.' },
    { title: 'گام ۲: نصب دستگاه دسترسی', text: 'از پنل «ابزار ساخت» یک دستگاه دسترسی مثل دکل 2G انتخاب کنید و روی نقشه نزدیک ساختمان‌ها قرار دهید. دستگاه بدون اتصال به شبکه هیچ سرویسی نمی‌دهد! دکل‌ها فقط به مشترکان سرویس می‌دهند و ترافیک گره‌های دیگر از آن‌ها عبور نمی‌کند؛ بک‌هال هر دکل مستقیم به تجمیع/هسته وصل می‌شود. TD-LTE گرهٔ جدا ندارد: «ماژول TD-LTE» روی دکل 4G یا 5G نصب می‌شود و مشترکان ثابتِ داخل پوشش همان دکل از آن سرویس می‌گیرند.' },
    { title: 'گام ۳: اتصال انتقال', text: 'ابزار «اتصال» را انتخاب کنید، روی دستگاه دسترسی و سپس روی یک گره تجمیع کلیک کنید و رسانه (فیبر/مسی/نقطه‌به‌نقطه) را انتخاب کنید تا لینک انتقال ساخته شود. مسیرهای بلند فیبر و مسی سیگنال از دست می‌دهند؛ «تقویت‌کننده سیگنال» در میانهٔ مسیر افت را جبران می‌کند.' },
    { title: 'گام ۴: اتصال هسته و دروازه', text: 'زنجیره باید کامل باشد: مشتری ← دسترسی ← تجمیع ← هسته ← دروازه اینترنت. گره تجمیع را به هسته و هسته را به دروازه وصل کنید تا اینترنت به شهر برسد.' },
    { title: 'گام ۵: فعال‌سازی سرویس', text: 'حالا مسیر کامل است و مشتریان آنلاین می‌شوند. از پنل «بسته‌ها» قیمت و سرعت بسته‌ها را تنظیم کنید؛ قیمت بالاتر درآمد بیشتر اما تقاضای کمتر می‌دهد. انشعاب فیبر و مسی ساختمان‌ها رایگان است (هزینهٔ نصب با مشترک است)؛ انشعاب فیبر از سال ۲۰۰۴ ممکن است.' },
    { title: 'گام ۶: بررسی ظرفیت و رفع مشکل', text: 'اگر لینک یا دستگاه اشباع شود، هشدار ظاهر می‌شود. روی گره مشکل‌دار کلیک کنید: علت مشکل و گزینه‌های رفع آن (نصب ماژول، لینک موازی، تغییر رسانه) نمایش داده می‌شود. هر گره ماژول دارد که سطح‌به‌سطح آپگرید می‌شود (بدون محدودیت تعداد): افزایش ظرفیت، افزایش برد، پورت اضافه، TD-LTE و منبع تغذیه. هر ماژول برق مصرف می‌کند؛ اگر مصرف از توان منبع بیشتر شود گره خاموش می‌شود.' },
    { title: 'گام ۷: گسترش به منطقه جدید', text: 'با درآمد حاصل، مناطق قفل‌شدهٔ شهر را باز کنید (از پنل هر منطقه) و شبکه را گسترش دهید. با گذشت سال‌ها مردم فناوری دوران خودشان را می‌خواهند؛ ماندن روی فناوری قدیمی رضایت را کم می‌کند. صبح‌ها مردم از خانه به محل کار می‌روند و در مسیر به پوشش موبایل نیاز دارند؛ پالس‌های سبز/قرمز روی نقشه پوشش مسیر را نشان می‌دهند.' },
    { title: 'گام ۸: مسیر جایگزین (افزونگی)', text: 'برای جلوگیری از قطعی هنگام خرابی، بین گره‌های کلیدی یک مسیر دوم بسازید. اگر مسیر اصلی قطع شود، ترافیک از مسیر جایگزین (مثلاً لینک نقطه‌به‌نقطه) عبور می‌کند. با ابزار «پینگ» تأخیر بین هر دو گره را ببینید. موفق باشید!' }
  ];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('fa-IR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function faDigits(s) { return String(s == null ? '' : s).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
  function fmt1(n) { return (n == null || isNaN(n)) ? '—' : (Math.round(n * 10) / 10).toLocaleString('fa-IR'); }
  function fmtDays(n) { // مدت ساخت/نصب: کمتر از یک روز با ساعت، وگرنه روز (با واحد)
    if (n == null || isNaN(n)) return '—';
    if (n < 1) return Math.max(1, Math.round(n * 24)).toLocaleString('fa-IR') + ' ساعت';
    return (Math.round(n * 4) / 4).toLocaleString('fa-IR') + ' روز';
  }
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
    upgrade: svgIcon('<path d="m5 14 7-7 7 7"/><path d="m5 20 7-7 7 7"/>'),
    target: svgIcon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>')
  };
  var ACH_ICONS = {
    trophy: ICONS.trophy, medal: ICONS.medal, star: ICONS.star, users: ICONS.users,
    chart: ICONS.chart, money: ICONS.money, globe: ICONS.globe, rocket: ICONS.rocket,
    signal: ICONS.signal, target: ICONS.target, antenna: ICONS.antenna, bolt: ICONS.bolt,
    core: ICONS.core, cable: ICONS.cable
  };
  function achIcon(key) { return ACH_ICONS[key] || ICONS.trophy; }
  var CAT_ICONS = { cable: ICONS.cable, access: ICONS.antenna, antenna: ICONS.antenna, backhaul: ICONS.backhaul, core: ICONS.core, power: ICONS.bolt, tools: ICONS.wrench };

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
    var yearEl = $('ui-year');
    if (yearEl) {
      var y = null;
      try { if (window.GameSim && GameSim.yearOf) y = GameSim.yearOf(state); } catch (e) { y = null; }
      yearEl.textContent = y != null ? faDigits(String(y)) : '—';
    }
    $('ui-day').textContent = fmt(state.day || 1);
    var sat = state.satisfaction != null ? faDigits(String(Math.round(state.satisfaction))) + '٪' : '—';
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
    return true;
  }

  var CAT_FA = { cable: 'کابل‌ها و اتصالات', access: 'دسترسی', antenna: 'آنتن‌ها', backhaul: 'انتقال', core: 'هسته و تجمیع', power: 'برق و پشتیبان', tools: 'ابزار و اندازه‌گیری' };
  var CAT_ORDER = ['access', 'antenna', 'cable', 'backhaul', 'core', 'power', 'tools'];
  var buildQuery = '';
  function renderBuildMenu() {
    var menu = $('build-menu'); if (!menu) return;
    var q = (buildQuery || '').trim();
    var groups = {};
    equipList().forEach(function (it) {
      if (it.buildable === false) return; // کابل‌ها رسانه‌اند نه گره ساختنی
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
        html += '<button class="build-item' + (locked ? ' locked' : '') + sel + '" data-equip="' + esc(it.id) + '"' + (locked ? ' title="هنوز در این دوران نیست — از سال ' + faDigits(String(it.era || '')) + ' در دسترس می‌شود"' : '') + '>' +
          '<span class="bi-icon">' + (CAT_ICONS[it.category] || ICONS.antenna) + '</span>' +
          '<span class="bi-main"><span class="bi-name">' + esc(it.name || it.id) + '</span><br><span class="bi-sub">' + esc(it.description || '') + '</span>' +
          (connectsText(it) ? '<br><span class="bi-conn">اتصال‌ها: ' + esc(connectsText(it)) + '</span>' : '') + '</span>' +
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
  var CONN_MEDIUM_FA = { fiber: 'فیبر', copper: 'سیم مسی', ptp: 'نقطه‌به‌نقطه', wireless: 'بی‌سیم', internet: 'اینترنت', power: 'برق', tools: 'ابزار' };
  // متن «اتصال‌ها» از مشخصهٔ connects تجهیز ساخته می‌شود (همان منبعی که اعتبارسنجی سیم‌کشی می‌خواند)
  function connectsText(eq) {
    var spec = (eq && eq.connects) || [];
    if (!spec.length) return '';
    var parts = [];
    var nodeMedia = spec.filter(function (c) {
      return (c.targets || []).indexOf('node') >= 0 && (c.direction === 'both' || c.direction === 'upstream') && c.medium !== 'power' && c.medium !== 'tools';
    }).map(function (c) { return CONN_MEDIUM_FA[c.medium] || c.medium; });
    if (nodeMedia.length) parts.push('لینک با گره‌های شبکه: ' + nodeMedia.join('، '));
    var bld = spec.filter(function (c) { return (c.targets || []).indexOf('building') >= 0 && !c.legacy; });
    var bldLegacy = spec.some(function (c) { return (c.targets || []).indexOf('building') >= 0 && c.legacy; });
    if (bld.length) parts.push('انشعاب به ساختمان‌ها: ' + bld.map(function (c) { return CONN_MEDIUM_FA[c.medium] || c.medium; }).join(' یا ') + (eq.ports ? ' (تا ' + fmt(eq.ports) + ' پورت در سطح ۱)' : ''));
    if (bldLegacy) parts.push('انشعاب مستقیم قدیمی ساختمان‌ها (انشعاب جدید از کابینت خیابانی)');
    if (spec.some(function (c) { return c.medium === 'wireless' && c.direction === 'service'; })) parts.push('خدمت بی‌سیم به مشترک‌ها');
    if (spec.some(function (c) { return c.medium === 'internet'; })) parts.push('اتصال به اینترنت جهانی');
    if (spec.some(function (c) { return c.medium === 'power'; })) parts.push('پشتیبانی برق گره‌های اطراف (بدون لینک شبکه)');
    if (spec.some(function (c) { return c.medium === 'tools'; })) parts.push('ابزار تیم فنی (بدون لینک شبکه)');
    if (!bld.length && !bldLegacy && eq.category === 'core') parts.push('به ساختمان مستقیم وصل نمی‌شود (از کابینت خیابانی استفاده کنید)');
    return parts.join(' — ');
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
      '<dt>ساخت</dt><dd>آنی</dd>' +
      '</dl>';
    if (connectsText(item)) html += '<h5>اتصال‌ها</h5><p class="guide-text">' + esc(connectsText(item)) + '</p>';
    if (locked) html += '<div class="warn-box">' + ICONS.lock + ' این تجهیز هنوز در این دوران نیست؛ از سال ' + faDigits(String(item.era || '')) + ' در دسترس می‌شود. خط زمانی را از منو («دوران فناوری») ببینید.</div>';
    $('guide-body').innerHTML = html;
    $('guide-popover').classList.remove('hidden');
  }
  /* ---------- تست سرعت در نقطه‌ای از نقشه ---------- */
  var SPEED_REASON_FA = {
    no_coverage: 'خارج از پوشش', unconnected: 'گره متصل نیست', congestion: 'ازدحام مسیر',
    distance: 'فاصله زیاد', los: 'ساختمان‌های مسیر سیگنال را ضعیف کرده‌اند', no_path: 'مسیر تا دروازه نیست', no_fiber_drop: 'به فیبر متصل نیست',
    no_subscription: 'اشتراک ندارد (وای‌فای داخل ساختمان فقط با اشتراک فعال می‌شود)',
    no_network: 'بدون اتصال به شبکه (ساختمان به شبکه وصل نیست و در برد دکل متصلی هم نیست)',
    no_tdlte_module: 'پوشش 4G هست ولی دکل «ماژول TD-LTE» ندارد',
    district_locked: 'منطقه قفل است (سرویس فقط در مناطق باز)',
    no_4g_coverage: 'خارج از پوشش 4G (TD-LTE فقط روی پوشش شبکهٔ 4G و بالاتر کار می‌کند)'
  };
  function runSpeedTest(wx, wy) {
    if (!window.GameSim || !GameSim.speedTestAt || !state) return;
    var res = GameSim.speedTestAt(state, wx, wy);
    var TECH_FA = { fiber: 'فیبر/مسی', cellular: 'سلولار', fwa: 'TD-LTE', wifi: 'وای‌فای داخل ساختمان' };
    var html = '<p class="muted">سرعت بالقوه در این نقطه (با اشتراک)، به تفکیک فناوری:</p>';
    ['fiber', 'cellular', 'fwa', 'wifi'].forEach(function (t) {
      var e = res[t] || { speed: 0, reason: 'no_coverage' };
      var sub = e.nodeName ? esc(e.nodeName) : '';
      if (e.reason) sub += (sub ? ' — ' : '') + esc(SPEED_REASON_FA[e.reason] || e.reason);
      var pingTxt = (e.latency != null) ? ('پینگ: ' + faDigits(String(Math.round(e.latency))) + ' میلی‌ثانیه' + (e.jitter != null ? ' (نوسان: ' + faDigits(String(e.jitter)) + ')' : '')) : '';
      if (pingTxt) sub += (sub ? ' — ' : '') + pingTxt;
      var perUser = (e.perUser != null) ? e.perUser : (e.speed || 0);
      if ((e.speed || 0) > 0 && e.perUser != null && e.perUser !== e.speed) sub += (sub ? ' — ' : '') + 'ظرفیت سایت: ' + fmt(e.speed) + ' Mbps (تقسیم بین کاربران هم‌زمان)';
      html += '<div class="tech-row"><div class="tech-head"><span>' + esc(TECH_FA[t] || t) + '</span>' +
        '<span><strong>' + fmt(perUser) + ' Mbps</strong></span></div>' +
        (sub ? '<div class="muted tech-sub">' + sub + '</div>' : '') + '</div>';
    });
    html += '<p class="muted">بدون اشتراک، سرویسی فعال نمی‌شود؛ این سرعت‌ها فقط برای مشترک است. TD-LTE پینگ پایدار و بدون نوسان دارد.</p>';
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

  var moveNodeId = null, pendingDeleteId = null, pingFromId = null;
  function setMode(m) {
    mode = m; connectFirst = null; connectFromBuilding = null;
    if (m !== 'move') moveNodeId = null;
    if (m !== 'ping') pingFromId = null;
    if (window.CityMap && CityMap.setPlacementMode) CityMap.setPlacementMode(m === 'place' || m === 'move');
    ['tool-select', 'tool-demolish', 'tool-speedtest', 'tool-ping'].forEach(function (id) {
      var b = $(id); if (b) b.classList.toggle('active', (m === 'select' && id === 'tool-select') || (m === 'demolish' && id === 'tool-demolish') || (m === 'speedtest' && id === 'tool-speedtest') || (m === 'ping' && id === 'tool-ping'));
    });
    var cancelBtn = $('btn-connect-cancel');
    if (cancelBtn) cancelBtn.classList.toggle('hidden', m !== 'connect');
    var hint = $('map-hint');
    var hints = {
      place: 'روی نقشه کلیک کنید تا دستگاه نصب شود (Esc برای لغو)',
      connect: 'مقصد اتصال رو انتخاب کن',
      demolish: 'روی گره کلیک کنید تا حذف شود',
      move: 'روی محل جدید گره کلیک کنید (Esc برای لغو) — جابه‌جایی آنی است',
      speedtest: 'روی هر نقطه از نقشه کلیک کنید تا سرعت اتصال آنجا سنجیده شود',
      ping: 'گرهٔ مبدأ پینگ را انتخاب کنید',
      select: ''
    };
    if (hints[m]) { hint.textContent = hints[m]; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
  }

  // فعال‌کردن حالت اتصال از پنل جزئیات یک گره: همان گره مبدأ است؛ بعد از ساخت لینک حالت خودکار خاموش می‌شود
  function armConnectFromNode(nodeId) {
    setMode('connect');
    connectFirst = nodeId;
    connectFromBuilding = null;
    if (window.CityMap && CityMap.setSelected) CityMap.setSelected('node', nodeId);
    var panel = $('panel-detail'); if (panel) panel.classList.remove('open');
    toast('حالت اتصال فعال شد؛ مقصد اتصال رو انتخاب کن.');
  }
  // فعال‌کردن اتصال سیمی از پنل ساختمان: ضربهٔ بعدی روی یک کابینت خیابانی، انشعاب را می‌سازد
  var connectWiredMedium = 'fiber';
  function armConnectFromBuilding(buildingId, medium) {
    setMode('connect');
    connectFirst = null;
    connectFromBuilding = buildingId;
    connectWiredMedium = medium === 'copper' ? 'copper' : 'fiber';
    if (window.CityMap && CityMap.setSelected) CityMap.setSelected('building', buildingId);
    var hint = $('map-hint');
    if (hint) { hint.textContent = 'کابینت خیابانی متصل نزدیک ساختمان را انتخاب کنید'; hint.classList.remove('hidden'); }
    var panel = $('panel-detail'); if (panel) panel.classList.remove('open');
    toast('حالت اتصال ' + (connectWiredMedium === 'copper' ? 'سیم مسی' : 'فیبر') + ' فعال شد؛ کابینت خیابانی را انتخاب کنید.');
  }

  function selectTool(equipId) {
    var item = equipList().find(function (i) { return i.id === equipId; });
    if (!item) return;
    if (!isUnlocked(item)) { toast('این تجهیز هنوز در این دوران نیست؛ از سال ' + faDigits(String(item.era || '')) + ' در دسترس می‌شود.', 'error'); return; }
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
    var c2 = list.find(function (i) { return i.id === 'cell_2g'; });
    if (c2 && isUnlocked(c2)) return 'cell_2g';
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
    var refund = (window.GameSim && GameSim.demolishRefund) ? GameSim.demolishRefund(state, id) : (eq ? Math.round((eq.cost || 0) * 0.5) : 0);
    $('delete-title').textContent = 'حذف «' + (n.name || n.type) + '»؟';
    $('delete-desc').textContent = n.type === 'internet_gateway'
      ? 'حذف دروازه اینترنت کل شبکه را از اینترنت قطع می‌کند؛ همهٔ مناطق سرویس را از دست می‌دهند تا دروازهٔ جدیدی ساخته و وصل شود.'
      : n.type === 'core_router'
        ? 'حذف روتر هسته همهٔ مسیرها به دروازه اینترنت را قطع می‌کند؛ شبکه تا ساخت هستهٔ جدید سرویس نمی‌دهد.'
        : 'با حذف این گره، همهٔ لینک‌هایش هم حذف می‌شوند و گره‌ها و مناطق وابسته به آن سرویس را از دست می‌دهند.';
    $('delete-refund').textContent = fmt(refund) + ' تومان (۵۰٪ کل سرمایه‌گذاری: تجهیز + ماژول‌ها)';
    $('delete-confirm').classList.remove('hidden');
  }

  function onPlace(x, y) {
    lastTapAt = Date.now();
    if (mode === 'move' && moveNodeId != null) {
      var r = (window.GameSim && GameSim.moveNode) ? GameSim.moveNode(state, moveNodeId, x, y) : { ok: false, error: 'جابه‌جایی در این نسخه موجود نیست.' };
      toast(r && r.ok === false ? (r.error || 'جابه‌جایی انجام نشد.') : 'گره آنی جابه‌جا شد.', r && r.ok === false ? 'error' : 'success');
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
      selectedTool = null;
      setMode('select'); // بعد از ساخت موفق، حالت ساخت خودش غیرفعال می‌شود
      renderBuildMenu();
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
    lastTapAt = Date.now();
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
    if (mode === 'ping') {
      if (kind !== 'node' || id == null) { setMode('select'); toast('حالت پینگ لغو شد.', 'warn'); return; }
      if (pingFromId == null) {
        pingFromId = id;
        toast('گرهٔ مقصد پینگ را انتخاب کنید.');
        return;
      }
      var pr = (window.GameSim && GameSim.pingBetween) ? GameSim.pingBetween(state, pingFromId, id) : null;
      if (!pr || pr.ok === false) {
        toast((pr && pr.error) || 'پینگ انجام نشد.', 'error');
        setMode('select');
        return;
      }
      var phtml = '<div class="tech-row"><div class="tech-head"><span>پینگ (رفت‌وبرگشت)</span>' +
        '<span><strong>' + faDigits(String(pr.ms)) + ' میلی‌ثانیه</strong></span></div>' +
        '<div class="muted tech-sub">مسیر (' + faDigits(String(pr.hops)) + ' لینک): ' + (pr.pathNames || []).map(esc).join(' ← ') + '</div></div>';
      $('ping-body').innerHTML = phtml;
      $('ping-popover').classList.remove('hidden');
      setMode('select');
      return;
    }
    if (id == null) {
      if (mode === 'connect') { setMode('select'); toast('حالت اتصال لغو شد.', 'warn'); return; } // empty tap cancels connect
      if (mode === 'select') selectNode(null, kind);
      return;
    }
    if (mode === 'connect') {
      // اتصال سیمی ساختمان: ضربه روی کابینت، انشعاب را می‌سازد و حالت خاموش می‌شود
      if (connectFromBuilding != null) {
        if (kind !== 'node') { setMode('select'); toast('حالت اتصال لغو شد.', 'warn'); return; }
        var wiredFn = window.GameSim && (GameSim.connectBuildingWired || GameSim.connectBuildingFiber);
        if (wiredFn) {
          var rf = GameSim.connectBuildingWired
            ? GameSim.connectBuildingWired(state, connectFromBuilding, id, connectWiredMedium)
            : GameSim.connectBuildingFiber(state, connectFromBuilding, id);
          if (rf && rf.ok === false) { toast(rf.error || 'اتصال سیمی انجام نشد.', 'error'); return; } // stay armed
          toast('اتصال ' + (connectWiredMedium === 'copper' ? 'سیم مسی' : 'فیبر') + ' آنی برقرار شد.', 'success');
          setMode('select');
          refresh();
        }
        return;
      }
      if (kind !== 'node') { setMode('select'); toast('حالت اتصال لغو شد.', 'warn'); return; } // tap on non-node = cancel
      if (connectFirst == null) {
        connectFirst = id;
        toast('مقصد اتصال رو انتخاب کن.');
        return;
      }
      if (connectFirst === id) { toast('یک گره را نمی‌توان به خودش وصل کرد.', 'warn'); return; }
      openMediumPicker(connectFirst, id);
      return;
    }
    if (mode === 'demolish') {
      openDeleteConfirm(id);
      return;
    }
    selectNode(id, kind);
  }

  function openMediumPicker(a, b) {
    var opts = [];
    try { opts = (window.GameSim && GameSim.mediumOptions) ? GameSim.mediumOptions(state, a, b) : []; } catch (e) { opts = []; }
    if (!opts.length) {
      opts = ['fiber', 'ptp', 'ethernet', 'copper'].map(function (m) {
        var mi = (window.GAME_DATA && GAME_DATA.linkMedia && GAME_DATA.linkMedia[m]) || {};
        return { medium: m, name: mi.name || m, capacity: mi.capacity || 0, ok: true, reason: '' };
      });
    }
    var box = $('medium-options');
    box.innerHTML = opts.map(function (o) {
      var extra = '';
      if (o.medium === 'ptp' && o.survey) {
        var sv = o.survey;
        extra = '<br><span class="muted">پهپاد نقشه‌برداری: دید مستقیم: ' + (sv.losClear ? 'آزاد' : 'مسدود' + (sv.blockedByName ? ' (' + esc(sv.blockedByName) + ')' : '')) +
          ' — فاصله ' + fmt(sv.distance) + ' واحد — ظرفیت مؤثر حدود ' + fmt(sv.effCapacity) + ' Mbps' + (sv.inRange ? '' : ' — بیش از برد مجاز!') + '</span>';
      }
      if (!o.ok) extra += '<br><span class="muted">' + esc(o.reason || '') + '</span>';
      return '<button class="btn" style="display:block;width:100%;margin:6px 0;text-align:right" data-medium="' + esc(o.medium) + '"' + (o.ok ? '' : ' disabled') + '>' +
        esc(o.name || o.medium) + ' — ظرفیت ' + fmt(o.capacity || 0) + ' Mbps' + (o.cost != null ? ' — هزینهٔ ساخت: ' + fmt(o.cost) + ' تومان' : '') + (o.ok ? '' : ' ' + ICONS.lock) + extra + '</button>';
    }).join('');
    // پیش‌نمایش پهپاد روی نقشه تا وقتی پنجره باز است
    try { if (window.CityMap && CityMap.setSurveyPreview) CityMap.setSurveyPreview(a, b); } catch (e) { /* ignore */ }
    box.querySelectorAll('[data-medium]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var res = GameSim.connect(state, a, b, btn.getAttribute('data-medium'));
        $('medium-picker').classList.add('hidden');
        try { if (window.CityMap && CityMap.clearSurveyPreview) CityMap.clearSurveyPreview(); } catch (e) { /* ignore */ }
        if (!res || res.ok === false) {
          toast((res && res.error) || 'اتصال برقرار نشد.', 'error');
          // حالت اتصال مسلح می‌ماند تا مقصد یا رسانهٔ دیگری انتخاب شود
        } else {
          toast('اتصال برقرار شد.', 'success');
          setMode('select'); // بعد از ساخت لینک، حالت اتصال خودش غیرفعال می‌شود
        }
        refresh();
      });
    });
    $('medium-picker').classList.remove('hidden');
  }

  /* ---------- Detail panel ---------- */
  var STATUS_FA = {
    active: 'فعال', building: 'در حال ساخت', failed: 'خراب', unconnected: 'متصل‌نشده',
    congested: 'شلوغ', cut: 'قطع', repairing: 'در حال تعمیر', upgrading: 'در حال ارتقا', changing: 'در حال تغییر نوع', online: 'آنلاین', offline: 'آفلاین', nopower: 'بدون برق کافی'
  };
  function findNode(id) {
    if (!state) return null;
    var n = (state.nodes || []).find(function (x) { return String(x.id) === String(id); });
    if (n) return { node: n, kind: 'node' };
    var lk = (state.links || []).find(function (x) { return String(x.id) === String(id); });
    if (lk) return { node: lk, kind: 'link' };
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
    if (t.indexOf('cell') >= 0 || t.indexOf('rru') >= 0 || t.indexOf('ant') >= 0) return 'cellular';
    if (t.indexOf('fwa') >= 0 || t.indexOf('cpe') >= 0) return 'fwa';
    if (t.indexOf('ftth') >= 0 || t.indexOf('fiber') >= 0) return 'fiber';
    return null;
  }

  var indivShow = {}; // کلید لیست → تعداد ردیف نمایشی («نمایش بیشتر»)
  var indivTestResults = {}; // شناسهٔ مشترک → HTML نتیجهٔ تست سرعت/تأخیر (بعد از رندر دوباره هم می‌ماند)
  function indivTechFa(t) {
    if (t.tech === 'fiber') return 'فیبر';
    if (t.tech === 'copper') return 'مسی (DSL)';
    if (t.tech === 'cellular') return 'سلولار' + (t.gen ? ' ' + t.gen + 'G' : '');
    if (t.tech === 'fwa') return 'TD-LTE';
    return t.tech;
  }
  function indivSpeedResultHtml(bid) {
    var info = null;
    try { info = GameSim.subscriberConnectionInfo(state, bid); } catch (e) { info = null; }
    if (!info || !info.found) return '<span class="status-bad">تست سرعت ممکن نیست.</span>';
    if (!info.bestTech) return 'سرعت تحویلی: <strong>۰ Mbps</strong> — <span class="status-bad">' + esc(SPEED_REASON_FA[info.reason] || 'بدون اتصال به شبکه') + '</span>';
    var best = info.techs.find(function (t) { return t.tech === info.bestTech; }) || {};
    return 'سرعت تحویلی: <strong>' + fmt(info.speed) + ' Mbps</strong>' +
      (info.packageSpeed ? ' (بستهٔ ' + esc(info.packageName || '') + ': ' + fmt(info.packageSpeed) + ' Mbps)' : '') +
      ' — از راه ' + esc(indivTechFa(best));
  }
  function indivPingResultHtml(bid) {
    var r = null;
    try { r = GameSim.subscriberLatencyTest(state, bid); } catch (e) { r = null; }
    if (!r || !r.ok) return '<span class="status-bad">' + esc((r && r.error) || 'تست تأخیر ممکن نیست.') + '</span>';
    var info = null;
    try { info = GameSim.subscriberConnectionInfo(state, bid); } catch (e) { info = null; }
    var best = info ? (info.techs.find(function (t) { return t.tech === r.tech; }) || {}) : {};
    return 'پینگ تا اینترنت: <strong>' + fmt(r.ms) + ' میلی‌ثانیه</strong>' +
      (r.jitter != null ? ' (نوسان: ' + fmt(r.jitter) + ')' : '') +
      ' — از راه ' + esc(indivTechFa(best));
  }
  function indivPackageName(p) {
    var cust = (state.customers || []).find(function (c) { return String(c.districtId) === String(p.districtId); });
    var pkg = (state.packages || []).find(function (x) { return x.id === (cust ? cust.packageId : 'home'); });
    return pkg ? (pkg.name || pkg.id) : '';
  }
  function indivBuildingLabel(p) {
    var b = (state.buildings || []).find(function (x) { return String(x.id) === String(p.buildingId); });
    if (!b) return '';
    var BTYPE_FA = (window.GAME_DATA && GAME_DATA.buildingTypeFa) || { residential: 'مسکونی', commercial: 'تجاری', office: 'اداری', industrial: 'صنعتی' };
    return 'ساختمان ' + (BTYPE_FA[b.type] || '');
  }
  function individualsHtml(list, emptyMsg, opts) {
    opts = opts || {};
    var key = opts.key || 'x';
    if (!list || !list.length) return '<p class="muted">' + esc(emptyMsg || 'مشترک فردی ثبت نشده است.') + '</p>';
    var subCount = list.filter(function (p) { return p.status === 'subscribed'; }).length;
    var show = indivShow[key] || 12;
    // فناوری‌های فعال ساختمان (برای پنل ساختمان): یک‌بار حساب می‌شود و برای همهٔ مشترکان همان ساختمان است
    var connInfo = null;
    if (opts.buildingId && window.GameSim && GameSim.subscriberConnectionInfo) {
      try { connInfo = GameSim.subscriberConnectionInfo(state, opts.buildingId); } catch (e) { connInfo = null; }
    }
    var rows = list.slice(0, show).map(function (p) {
      var isSub = p.status === 'subscriber' || p.status === 'subscribed' || p.status === 'active' || p.subscribed === true;
      var stFa = isSub ? 'مشترک' : 'غیرمشترک';
      var satv = Math.max(0, Math.min(100, Math.round(p.satisfaction || 0)));
      var meta = indivPackageName(p);
      if (p.joinedDay != null) meta += (meta ? ' — ' : '') + 'از روز ' + fmt(p.joinedDay);
      if (opts.showBuilding) { var bl = indivBuildingLabel(p); if (bl) meta += (meta ? ' — ' : '') + bl; }
      var extra = '';
      if (isSub && connInfo) {
        var techTxt = connInfo.techs.length ? connInfo.techs.map(indivTechFa).join('، ') : 'بدون اتصال به شبکه';
        extra = '<div class="indiv-tech">اتصال: ' + esc(techTxt) + '</div>' +
          '<div class="indiv-tests">' +
          '<button class="btn sm" data-indiv-speed="' + esc(p.id) + '" data-bld="' + esc(opts.buildingId) + '">تست سرعت</button>' +
          '<button class="btn sm" data-indiv-ping="' + esc(p.id) + '" data-bld="' + esc(opts.buildingId) + '">تست تأخیر</button>' +
          '</div>' +
          '<div class="indiv-result" data-indiv-result="' + esc(p.id) + '">' +
          '<div data-indiv-speed-res>' + ((indivTestResults[p.id] || {}).speed || '') + '</div>' +
          '<div data-indiv-ping-res>' + ((indivTestResults[p.id] || {}).ping || '') + '</div></div>';
      }
      return '<div class="indiv-row"' + (opts.showBuilding && p.buildingId != null ? ' data-indiv-bld="' + esc(p.buildingId) + '" title="مشاهده ساختمان روی نقشه"' : '') + '><div class="indiv-head"><span>' + esc(p.name || p.id) + '</span>' +
        '<span class="muted">' + fmt(p.needMbps || 0) + ' Mbps — ' + stFa + '</span></div>' +
        (meta ? '<div class="muted tech-sub">' + esc(meta) + '</div>' : '') +
        '<div class="cap-bar"><div class="cap-fill ' + (satv < 30 ? 'hot' : satv < 60 ? 'warm' : '') + '" style="width:' + satv + '%"></div></div>' + extra + '</div>';
    }).join('');
    var more = list.length > show
      ? '<button class="btn sm" data-indiv-more="' + esc(key) + '">نمایش بیشتر (' + fmt(list.length - show) + ' نفر دیگر)</button>'
      : '';
    return '<p class="muted">' + fmt(subCount) + ' مشترک از ' + fmt(list.length) + ' نفر</p>' +
      '<div class="indiv-list">' + rows + '</div>' + more;
  }
  function wireIndivLists(box) {
    box.querySelectorAll('[data-indiv-more]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-indiv-more');
        indivShow[k] = (indivShow[k] || 12) + 24;
        renderDetail();
      });
    });
    box.querySelectorAll('[data-indiv-bld]').forEach(function (row) {
      row.addEventListener('click', function () {
        var bid = row.getAttribute('data-indiv-bld');
        var b = (state.buildings || []).find(function (x) { return String(x.id) === String(bid); });
        if (b && window.CityMap && CityMap.panTo) CityMap.panTo(b.x + (b.w || 26) / 2, b.y + (b.h || 20) / 2);
        selectNode(bid, 'building');
      });
    });
    box.querySelectorAll('[data-indiv-speed]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var pid = btn.getAttribute('data-indiv-speed');
        var html = indivSpeedResultHtml(btn.getAttribute('data-bld'));
        (indivTestResults[pid] = indivTestResults[pid] || {}).speed = html;
        var el = box.querySelector('[data-indiv-result="' + pid + '"] [data-indiv-speed-res]');
        if (el) el.innerHTML = html;
      });
    });
    box.querySelectorAll('[data-indiv-ping]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var pid = btn.getAttribute('data-indiv-ping');
        var html = indivPingResultHtml(btn.getAttribute('data-bld'));
        (indivTestResults[pid] = indivTestResults[pid] || {}).ping = html;
        var el = box.querySelector('[data-indiv-result="' + pid + '"] [data-indiv-ping-res]');
        if (el) el.innerHTML = html;
      });
    });
  }

  function selectNode(id, kind) {
    // ساختمان‌های مناطق قفل‌شده جزئیات ندارند؛ فقط راهنمای کوتاه نشان داده می‌شود
    if (id != null) {
      var foundSel = findNode(id);
      if (foundSel && foundSel.kind === 'building' && foundSel.node.districtId) {
        var bd = (state.districts || []).find(function (x) { return String(x.id) === String(foundSel.node.districtId); });
        if (bd && window.GameSim && GameSim.districtUnlocked && !GameSim.districtUnlocked(bd)) {
          toast('این منطقه قفل است؛ اول آن را باز کنید.', 'warn');
          return;
        }
      }
    }
    selectedId = id;
    renderDetail();
    // پنل جزئیات همیشه از بالا باز می‌شود تا خط اول زیر سربرگ بریده نشود
    var pdEl = $('panel-detail'); if (pdEl) pdEl.scrollTop = 0;
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

  // دکمهٔ قطع اتصال لینک با تأیید دومرحله‌ای و هشدار جداشدن گره‌های پایین‌دست
  function disconnectBtnHtml(linkId) {
    var impact = null;
    try { impact = (window.GameSim && GameSim.linkDisconnectImpact) ? GameSim.linkDisconnectImpact(state, linkId) : null; } catch (e) { impact = null; }
    var warn = '';
    if (impact && impact.orphanCount > 0) {
      warn = '<div class="warn-box hidden" data-disconnect-warn="' + esc(linkId) + '">' + ICONS.warn +
        ' هشدار: با قطع این لینک، ' + fmt(impact.orphanCount) + ' گره (' + esc(impact.orphanNames.join('، ')) + (impact.orphanCount > 3 ? ' و…' : '') + ') از شبکه جدا می‌شوند.</div>';
    }
    return warn + '<button class="btn sm danger" data-disconnect-link="' + esc(linkId) + '">قطع اتصال</button>';
  }
  function wireDisconnectButtons(box) {
    box.querySelectorAll('[data-disconnect-link]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var linkId = btn.getAttribute('data-disconnect-link');
        if (btn.getAttribute('data-armed') !== '1') {
          btn.setAttribute('data-armed', '1');
          btn.textContent = 'تأیید قطع اتصال؟';
          var warnEl = box.querySelector('[data-disconnect-warn="' + linkId + '"]');
          if (warnEl) warnEl.classList.remove('hidden');
          return;
        }
        if (window.GameSim && GameSim.disconnectLink) {
          var r = GameSim.disconnectLink(state, linkId);
          toast(r && r.ok === false ? (r.error || 'قطع اتصال انجام نشد.') : 'اتصال قطع شد.', r && r.ok === false ? 'error' : 'success');
          if (r && r.ok !== false && String(selectedId) === String(linkId)) selectNode(null, 'link');
        } else toast('قطع اتصال در این نسخه موجود نیست.', 'warn');
        refresh();
      });
    });
  }

  // ترجیح اینترنت: هر ساختمان فقط «یک» نوع فعال دارد (برچسب تک)؛ منطقه شمار ساختمان‌ها را نشان می‌دهد
  var PREF_FA = { fiber: 'فیبر/مسی', cellular: 'سلولار', fwa: 'TD-LTE' };
  var PREF_COLOR = { fiber: '#22d3ee', cellular: '#3fb950', fwa: '#fb923c' };
  function prefHtml(pref) {
    if (!pref) return '';
    if (pref.type) {
      return '<div class="tech-row"><div class="tech-head"><span><span class="tech-dot" style="background:' + (PREF_COLOR[pref.type] || '#888') + '"></span>' + esc(PREF_FA[pref.type] || pref.type) + '</span>' +
        '<span class="muted">نوع ترجیحی این ساختمان</span></div></div>';
    }
    // شمار ساختمان‌های منطقه به تفکیک نوع ترجیحی (وزن‌دار با حجم ساختمان)
    var total = Math.max(1, pref.total || ((pref.fiber || 0) + (pref.cellular || 0) + (pref.fwa || 0)));
    var out = '';
    ['fiber', 'cellular', 'fwa'].forEach(function (t) {
      var share = Math.round(((pref[t] || 0) / total) * 100);
      out += '<div class="tech-row"><div class="tech-head"><span><span class="tech-dot" style="background:' + (PREF_COLOR[t] || '#888') + '"></span>' + esc(PREF_FA[t] || t) + '</span>' +
        '<span class="muted">سهم ' + fmt(share) + '٪ ساختمان‌ها</span></div>' +
        '<div class="cap-bar"><div class="cap-fill" style="width:' + share + '%;background:' + (PREF_COLOR[t] || '#888') + '"></div></div></div>';
    });
    return out;
  }

  function renderDetail() {
    var box = $('detail-content'); if (!box) return;
    if (selectedId == null) { box.innerHTML = '<p class="muted">یک گره یا ساختمان را انتخاب کنید.</p>'; return; }
    var found = findNode(selectedId);
    if (!found) { box.innerHTML = '<p class="muted">مورد انتخاب‌شده یافت نشد.</p>'; return; }
    var n = found.node;
    var BTYPE_FA = (window.GAME_DATA && GAME_DATA.buildingTypeFa) || { residential: 'مسکونی', commercial: 'تجاری', office: 'اداری', industrial: 'صنعتی' };
    var name = n.name || (equipList().find(function (e) { return e.id === n.type || e.id === n.equipId; }) || {}).name ||
      (found.kind === 'building' ? ('ساختمان ' + (BTYPE_FA[n.type] || '')) : null) ||
      (found.kind === 'link' ? ('لینک ' + (((window.GAME_DATA && GAME_DATA.linkMedia && GAME_DATA.linkMedia[n.medium]) || {}).name || 'ارتباطی')) : null) ||
      n.type || ('گره ' + n.id);
    var html = '<h4>' + esc(name) + '</h4>';
    if (found.kind === 'building') {
      var bDist = n.districtId ? (state.districts || []).find(function (d) { return d.id === n.districtId; }) : null;
      html += '<dl class="kv">' +
        '<dt>نوع ساختمان</dt><dd>' + esc(BTYPE_FA[n.type] || 'ساختمانی') + '</dd>' +
        '<dt>طبقات</dt><dd>' + fmt(n.height || 1) + '</dd>' +
        '<dt>ساکنان</dt><dd>' + fmt((window.GameSim && GameSim.buildingResidents) ? GameSim.buildingResidents(state, n) : 1) + ' نفر</dd>' +
        '<dt>منطقه</dt><dd>' + esc(bDist ? bDist.name : 'خارج از مناطق (پراکنده)') + '</dd>' +
        (n.height >= 10 ? '<dt>اثر بر پوشش</dt><dd>ساختمان بلند است؛ فقط دید لینک‌های نقطه‌به‌نقطه (PtP) را مخدوش می‌کند (روی سیگنال سلولار اثری ندارد؛ برای TD-LTE/وای‌فای فقط چند درصد افت سیگنال)</dd>' : '') +
        '</dl>';
      if (!n.districtId && state.scattered) {
        html += '<p class="muted">این ساختمان خارج از مناطق است. مشترکان ساختمان‌های پراکنده: ' + fmt(state.scattered.subscribers || 0) +
          ' از ' + fmt(state.scattered.potentialSubs || 0) + ' ممکن (پوشش: ' + fmt(state.scattered.coveredCount || 0) + ' ساختمان).</p>';
      }
      var svc = null;
      try { svc = (window.GameSim && GameSim.buildingServiceStatus) ? GameSim.buildingServiceStatus(state, n.id) : null; } catch (e) { svc = null; }
      if (svc && svc.found) {
        var svcHtml;
        if (svc.individualsSubscribed > 0 && svc.networkPath) svcHtml = '<span class="status-ok">دارای مشترک (' + fmt(svc.individualsSubscribed) + ' نفر)</span>';
        else if (svc.individualsSubscribed > 0) svcHtml = '<span class="status-warn">دارای مشترک (' + fmt(svc.individualsSubscribed) + ' نفر) — ولی بدون اتصال به شبکه؛ سرویسی نمی‌گیرد</span>';
        else if (svc.wifi) svcHtml = '<span class="status-ok">اشتراک سیمی فعال (انشعاب متصل است)</span>';
        else if (svc.covered && svc.connected) svcHtml = '<span class="status-warn">تحت پوشش — اشتراک ندارد (سرویس فقط با اشتراک فعال می‌شود)</span>';
        else if (svc.covered) svcHtml = '<span class="status-warn">تحت پوشش گرهٔ متصل‌نشده — سرویسی ارائه نمی‌شود</span>';
        else svcHtml = '<span class="status-bad">خارج از پوشش</span>';
        html += '<h5>وضعیت سرویس</h5><p>' + svcHtml + '</p>';
        var wifiHtml;
        if (svc.wifi) wifiHtml = '<span class="status-ok">فعال (اکسس‌پوینت خود مشترک)</span>';
        else if (svc.subscribed && !svc.networkPath) wifiHtml = '<span class="status-bad">بدون اتصال به شبکه</span> <span class="muted">(اکسس‌پوینت ساختمان هست، ولی ساختمان به شبکه وصل نیست و در برد هیچ دکل متصلی هم نیست)</span>';
        else wifiHtml = 'غیرفعال — فقط با اشتراک و اتصال ساختمان به شبکه فعال می‌شود';
        html += '<p class="muted">وای‌فای داخلی ساختمان: ' + wifiHtml + '</p>';
      }
      var bPref = null;
      try { bPref = (window.GameSim && GameSim.buildingPreference) ? GameSim.buildingPreference(state, n) : null; } catch (e) { bPref = null; }
      if (bPref) html += '<h5>ترجیح اینترنت ساکنان</h5>' + prefHtml(bPref);
      var bIndiv = (state.individuals || []).filter(function (p) { return String(p.buildingId) === String(n.id); });
      html += '<h5>ساکنان ساختمان</h5>' + individualsHtml(bIndiv, 'ساکنی برای این ساختمان ثبت نشده است.', { key: 'b:' + n.id, buildingId: n.id });
      // انشعاب سیمی دستی (فیبر یا سیم مسی از راه کابینت خیابانی؛ هر ساختمان فقط یکی از این دو)
      var fStatus = null;
      try { fStatus = (window.GameSim && (GameSim.buildingWiredStatus || GameSim.buildingFiberStatus)) ? (GameSim.buildingWiredStatus || GameSim.buildingFiberStatus)(state, n.id) : null; } catch (e) { fStatus = null; }
      if (fStatus) {
        var medFa = fStatus.medium === 'copper' ? 'سیم مسی' : 'فیبر';
        var otherFa = fStatus.medium === 'copper' ? 'فیبر' : 'سیم مسی';
        var curYear = 1991;
        try { if (window.GameSim && GameSim.yearOf) curYear = GameSim.yearOf(state); } catch (e) { /* ignore */ }
        var fiberLocked = curYear < 2004; // انشعاب فیبر از دوران FTTH (۲۰۰۴) باز می‌شود
        html += '<h5>اتصال سیمی</h5><div class="fiber-row">';
        if (fStatus.status === 'active') {
          var srcOk = fStatus.sourceConnected !== false;
          html += '<div class="fiber-status">' + (srcOk
            ? '<span class="status-ok">متصل به ' + medFa + '</span>'
            : '<span class="status-warn">متصل به ' + medFa + ' — ولی منبع به شبکه وصل نیست؛ سرویس قطع است</span>') +
            ' <span class="muted">(منبع: ' + esc(fStatus.nodeName || '—') + ')</span></div>' +
            '<div class="fiber-btns">' +
            '<button class="btn sm danger" data-wired-disconnect="' + esc(n.id) + '">قطع اتصال</button>' +
            '<button class="btn sm" disabled title="اول اتصال فعلی را قطع کنید">اتصال به ' + otherFa + '</button>' +
            '</div>' +
            '<p class="muted fiber-hint">هر ساختمان فقط به یکی از فیبر یا سیم مسی وصل می‌شود؛ برای تغییر، اول اتصال فعلی را قطع کنید.</p>';
        } else if (fStatus.status === 'building') {
          html += '<div class="fiber-status"><span class="status-warn">در حال اتصال به ' + medFa + '…</span></div>';
        } else {
          html += '<div class="fiber-status"><span class="status-bad">به شبکه سیمی متصل نیست</span></div>' +
            '<div class="fiber-btns">' +
            (fiberLocked
              ? '<button class="btn sm" disabled title="انشعاب فیبر از سال ۲۰۰۴ (دوران FTTH) ممکن است">' + ICONS.cable + ' اتصال به فیبر (از سال ۲۰۰۴)</button>'
              : '<button class="btn sm primary" data-wired-connect="fiber" data-building="' + esc(n.id) + '">' + ICONS.cable + ' اتصال به فیبر</button>') +
            '<button class="btn sm' + (fiberLocked ? ' primary' : '') + '" data-wired-connect="copper" data-building="' + esc(n.id) + '">' + ICONS.cable + ' اتصال به سیم مسی</button>' +
            '</div>' +
            '<p class="muted fiber-hint">بعد از زدن دکمه، روی یک کابینت خیابانی یا گره FTTH متصل نزدیک ساختمان ضربه بزنید. فیبر تا شعاع ۱۸۰ واحد (از کابینت) یا ۴۰۰ واحد (از FTTH)؛ سیم مسی (DSL تا حدود ۱۰۰ مگابیت) تا شعاع ۱۲۰ واحد. انشعاب برای شما رایگان است (هزینهٔ نصب با مشترک است) و آنی وصل می‌شود؛ انشعاب فیبر از سال ۲۰۰۴ ممکن است.</p>';
        }
        html += '</div>';
      }
      box.innerHTML = html;
      wireIndivLists(box);
      box.querySelectorAll('[data-wired-connect]').forEach(function (btn) {
        btn.addEventListener('click', function () { armConnectFromBuilding(btn.getAttribute('data-building'), btn.getAttribute('data-wired-connect')); });
      });
      box.querySelectorAll('[data-wired-disconnect]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var disc = window.GameSim && (GameSim.disconnectBuildingWired || GameSim.disconnectBuildingFiber);
          if (disc) {
            var r = disc(state, btn.getAttribute('data-wired-disconnect'));
            toast(r && r.ok === false ? (r.error || 'قطع اتصال انجام نشد.') : 'انشعاب سیمی قطع شد.', r && r.ok === false ? 'error' : 'success');
          }
          refresh();
        });
      });
      return;
    }
    if (found.kind === 'link') {
      var la = (state.nodes || []).find(function (x) { return String(x.id) === String(n.from); });
      var lb = (state.nodes || []).find(function (x) { return String(x.id) === String(n.to); });
      var medName = ((window.GAME_DATA && GAME_DATA.linkMedia && GAME_DATA.linkMedia[n.medium]) || {}).name || n.medium || 'ارتباطی';
      // لینک‌های موازی بین همین دو گره: ظرفیتشان با هم جمع می‌شود و ترافیک خودکار تقسیم می‌شود
      var parallels = (state.links || []).filter(function (l) {
        return (String(l.from) === String(n.from) && String(l.to) === String(n.to)) ||
               (String(l.from) === String(n.to) && String(l.to) === String(n.from));
      });
      var parallelCap = parallels.reduce(function (s, l) { return s + (l.capacity || 0); }, 0);
      var linkMs = null, linkAtt = null;
      try {
        if (window.GameSim && GameSim.linkLatency) linkMs = Math.round(GameSim.linkLatency(n, la, lb) * 2 * 10) / 10;
        if (window.GameSim && GameSim.linkAttenuation) linkAtt = GameSim.linkAttenuation(state, n, la, lb);
      } catch (e) { /* ignore */ }
      html += '<dl class="kv">' +
        '<dt>نوع اتصال</dt><dd>' + esc(medName) + (n.isBackup ? ' (پشتیبان)' : '') + '</dd>' +
        '<dt>از</dt><dd>' + esc((la && la.name) || '—') + '</dd>' +
        '<dt>به</dt><dd>' + esc((lb && lb.name) || '—') + '</dd>' +
        '<dt>ظرفیت</dt><dd>' + fmt(n.capacity || 0) + ' Mbps</dd>' +
        (parallels.length > 1 ? '<dt>لینک‌های موازی</dt><dd>' + fmt(parallels.length) + ' لینک — ظرفیت مجموع ' + fmt(parallelCap) + ' Mbps (تقسیم خودکار ترافیک)</dd>' : '') +
        '<dt>مصرف فعلی</dt><dd>' + fmt(Math.round(n.usage || 0)) + ' Mbps</dd>' +
        (linkMs != null ? '<dt>تأخیر (پینگ)</dt><dd>' + faDigits(String(linkMs)) + ' میلی‌ثانیه</dd>' : '') +
        (linkAtt != null && linkAtt < 1 ? '<dt>افت سیگنال</dt><dd>ظرفیت مؤثر ' + fmt(Math.round(linkAtt * 100)) + '٪ (مسیر بلند)</dd>' : '') +
        '<dt>وضعیت</dt><dd>' + esc(STATUS_FA[n.status] || n.status || '—') + '</dd>' +
        '</dl>';
      if (linkAtt != null && linkAtt < 0.8) {
        html += '<div class="warn-box">' + ICONS.warn + ' این مسیر بلند است و سیگنال از دست می‌دهد؛ یک «تقویت‌کننده سیگنال» در میانهٔ مسیر نصب کنید.</div>';
      }
      if (n.status === 'congested') {
        html += '<div class="warn-box">' + ICONS.warn + ' این لینک اشباع شده است؛ یک لینک موازی بین همین دو گره بسازید یا روی گره‌های دو سر «ماژول افزایش ظرفیت» نصب کنید.</div>';
      }
      // تغییر نوع لینک
      var chOpts = [];
      try { chOpts = (window.GameSim && GameSim.linkChangeOptions) ? GameSim.linkChangeOptions(state, n.id) : []; } catch (e) { chOpts = []; }
      if (chOpts.length) {
        html += '<h5>تغییر نوع لینک</h5><div class="link-opts">';
        chOpts.forEach(function (o) {
          html += '<button class="btn sm" data-link-medium="' + esc(o.medium) + '" data-link="' + esc(n.id) + '"' + (o.ok ? '' : ' disabled title="' + esc(o.reason) + '"') + '>' +
            esc(o.name) + ' — ' + fmt(o.capacity) + ' Mbps' + (o.current ? ' (فعلی)' : ' — ' + fmt(o.cost) + ' تومان (آنی)') +
            (o.ok || o.current ? '' : '<br><span class="muted">' + esc(o.reason) + '</span>') + '</button>';
        });
        html += '</div>';
      }
      // تعمیر آنی لینک قطع/آسیب‌دیده (بدون حذف و ساخت دوباره)
      var isDegraded = n.degradedUntil != null && (state.day || 0) < n.degradedUntil;
      if (n.status === 'cut' || isDegraded) {
        html += '<div class="warn-box">' + ICONS.warn + (n.status === 'cut' ? ' این لینک قطع شده است.' : ' این لینک در طوفان آسیب دیده و ظرفیتش موقتاً کم شده است.') + '</div>' +
          '<button class="btn primary" data-link-repair="' + esc(n.id) + '">تعمیر لینک (آنی)</button>';
      }
      // پشتیبان + قطع (افزایش پهنای باند فقط با لینک موازی و ماژول گره است)
      html += '<div class="fix-btns" style="margin-top:10px">';
      html += '<button class="btn sm" data-link-backup="' + esc(n.id) + '">' + (n.isBackup ? 'تبدیل به لینک اصلی' : 'تبدیل به لینک پشتیبان') + '</button>';
      html += disconnectBtnHtml(n.id) + '</div>';
      box.innerHTML = html;
      wireDisconnectButtons(box);
      box.querySelectorAll('[data-link-medium]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var r = GameSim.changeLinkMedium(state, btn.getAttribute('data-link'), btn.getAttribute('data-link-medium'));
          toast(r && r.ok === false ? (r.error || 'تغییر انجام نشد.') : 'نوع لینک آنی تغییر کرد.', r && r.ok === false ? 'error' : 'success');
          refresh();
        });
      });
      box.querySelectorAll('[data-link-repair]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var r = (window.GameSim && GameSim.repairLink) ? GameSim.repairLink(state, btn.getAttribute('data-link-repair')) : { ok: false, error: 'تعمیر در این نسخه موجود نیست.' };
          toast(r && r.ok === false ? (r.error || 'تعمیر انجام نشد.') : ('لینک آنی تعمیر شد. هزینه: ' + fmt(r.cost || 0) + ' تومان'), r && r.ok === false ? 'error' : 'success');
          refresh();
        });
      });
      box.querySelectorAll('[data-link-backup]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var r = GameSim.toggleLinkBackup(state, btn.getAttribute('data-link-backup'));
          toast(r && r.ok === false ? (r.error || 'انجام نشد.') : (r.isBackup ? 'لینک پشتیبان شد.' : 'لینک اصلی شد.'), r && r.ok === false ? 'error' : 'success');
          refresh();
        });
      });
      return;
    }
    if (found.kind === 'district') {
      var TYPE_FA = { commercial: 'تجاری', residential: 'مسکونی', dense: 'پرتراکم', sparse: 'کم‌تراکم', industrial: 'صنعتی', landmark: 'مرکز مهم',
        academic: 'دانشگاهی', medical: 'درمانی', heavy_industrial: 'صنعتی سنگین', tourism: 'گردشگری', transport: 'حمل‌ونقل', villa: 'ویلایی', slum: 'حاشیه‌نشین', government: 'اداری', village: 'روستا' };
      var qosPct = Math.round((n.qos || 0) * 100);
      if (n.unlocked === false) {
        var unlockCost = (window.GameSim && GameSim.districtUnlockCost) ? GameSim.districtUnlockCost(n) : 0;
        html += '<div class="warn-box">' + ICONS.lock + ' این منطقه هنوز باز نشده است؛ در آن نمی‌شود ساخت و آمارش در رضایت کل شهر حساب نمی‌شود.</div>' +
          '<button class="btn primary" data-unlock-district="' + esc(n.id) + '">باز کردن منطقه — ' + fmt(unlockCost) + ' تومان</button>';
      } else if (n.connected && (n.subscribers || 0) > 0) {
        html += '<p class="status-ok"><span class="dot-ok"></span>دارای سرویس</p>';
      } else if (n.connected) {
        html += '<p class="status-warn"><span class="dot-ok"></span>تحت پوشش — هنوز مشترکی ندارد (سرویس فقط با اشتراک فعال می‌شود)</p>';
      } else {
        html += '<div class="warn-box">' + ICONS.warn + ' این منطقه هنوز سرویس ندارد. یک دستگاه دسترسی نزدیک آن نصب و به شبکه وصل کنید.</div>';
      }
      var penPct = n.population ? Math.round((n.subscribers || 0) / n.population * 100) : 0;
      html += '<dl class="kv">' +
        '<dt>نوع منطقه</dt><dd>' + esc(TYPE_FA[n.type] || n.type || '—') + '</dd>' +
        '<dt>جمعیت</dt><dd>' + fmt(n.population) + '</dd>' +
        '<dt>ترافیک مشترکان</dt><dd>' + fmt(n.demand) + ' Mbps</dd>' +
        '<dt>ترافیک سرویس‌شده</dt><dd>' + fmt(n.servedDemand) + ' Mbps</dd>' +
        '<dt>مشترکان</dt><dd>' + fmt(n.subscribers) + '</dd>' +
        ((n.rivalSubscribers || 0) > 0 || (state.rival && state.rival.enabled) ? '<dt>مشترکان رقیب</dt><dd>' + fmt(n.rivalSubscribers || 0) + '</dd>' +
          '<dt>سهم بازار شما</dt><dd>' + fmt(((n.subscribers || 0) + (n.rivalSubscribers || 0)) > 0 ? Math.round((n.subscribers || 0) / ((n.subscribers || 0) + (n.rivalSubscribers || 0)) * 100) : 0) + '٪</dd>' : '') +
        '<dt>نفوذ اشتراک</dt><dd>' + fmt(penPct) + '٪ از جمعیت</dd>' +
        '<dt>کیفیت سرویس</dt><dd>' + fmt(qosPct) + '٪</dd>' +
        '<dt>رضایت</dt><dd>' + fmt(Math.round(n.satisfaction || 0)) + '٪</dd>' +
        '<dt>درآمد ماهانه</dt><dd>' + fmt(n.revenue) + ' تومان</dd>' +
        (n.avgLatency != null ? '<dt>تأخیر میانگین</dt><dd>' + fmt1(n.avgLatency) + ' ms</dd>' : '') +
        (n.jitter != null ? '<dt>نوسان تأخیر (جیتر)</dt><dd>' + fmt(n.jitter) + ' ms</dd>' : '') +
        (n.perSubMbps != null ? '<dt>سرعت هر مشترک</dt><dd>' + fmt1(n.perSubMbps) + ' Mbps</dd>' : '') +
        (n.type === 'residential' && n.commuteCoverage != null ? '<dt>پوشش مسیر رفت‌وآمد</dt><dd>' + fmt(Math.round(n.commuteCoverage * 100)) + '٪ (مسیر خانه↔کار)</dd>' : '') +
        (n.eraFactor != null && n.eraFactor < 1 ? '<dt>انتظار دوران</dt><dd>فناوری این منطقه از دوران فعلی عقب است (رضایت کمتر)</dd>' : '') +
        '</dl>';
      html += '<div class="cap-bar"><div class="cap-fill ' + (qosPct < 30 ? 'hot' : qosPct < 60 ? 'warm' : '') + '" style="width:' + qosPct + '%"></div></div>';
      // تقاضا به تفکیک فناوری: سهم هر فناوری از تقاضا و بخش سرویس‌گرفته‌اش
      var td = n.techDemand;
      if (!td && window.GameSim && GameSim.computeTechDemand) td = GameSim.computeTechDemand(n, [], 1, null, state);
      if (td) {
        var TECH_FA = { fiber: 'فیبر/مسی', cellular: 'سلولار', fwa: 'TD-LTE' };
        // همان رنگ‌های لایهٔ «تقاضای فناوری» روی نقشه (map.js TECH_TINT)
        var TECH_COLOR = { fiber: '#22d3ee', cellular: '#3fb950', fwa: '#fb923c' };
        var totalD = Math.max(1, n.demand || 0);
        html += '<h5>ترافیک به تفکیک فناوری</h5>';
        ['fiber', 'cellular', 'fwa'].forEach(function (t) {
          var e = td[t] || { demand: 0, served: 0 };
          var share = Math.round((e.demand || 0) / totalD * 100);
          var pct = e.demand > 0 ? Math.min(100, Math.round((e.served || 0) / e.demand * 100)) : 0;
          html += '<div class="tech-row"><div class="tech-head"><span><span class="tech-dot" style="background:' + (TECH_COLOR[t] || '#888') + '"></span>' + esc(TECH_FA[t] || t) + '</span>' +
            '<span class="muted">' + fmt(e.served || 0) + ' از ' + fmt(e.demand || 0) + ' Mbps (' + fmt(share) + '٪ ترافیک)</span></div>' +
            '<div class="cap-bar"><div class="cap-fill ' + (pct < 30 ? 'hot' : pct < 60 ? 'warm' : '') + '" style="width:' + pct + '%"></div></div></div>';
        });
      }
      // ترجیح کلی اینترنت در منطقه = میانگین موزون ترجیح ساختمان‌ها؛ همان منبع سهم‌های «ترافیک به تفکیک فناوری»
      var dPref = null;
      try { dPref = (window.GameSim && GameSim.districtPreference) ? GameSim.districtPreference(state, n) : null; } catch (e) { dPref = null; }
      if (dPref) html += '<h5>ترجیح کلی اینترنت در منطقه</h5>' + prefHtml(dPref);
      // بستهٔ اینترنت منطقه: انتخاب بسته روی تقاضا/رضایت/درآمد اثر دارد
      if (n.unlocked !== false) {
        var pkgs = (window.GAME_DATA && GAME_DATA.packages) || [];
        var curPkg = n.packageId || (pkgs[0] && pkgs[0].id) || '';
        html += '<h5>بستهٔ اینترنت منطقه</h5><select class="pkg-select" data-district-package="' + esc(n.id) + '" style="width:100%;padding:8px;border-radius:8px">' +
          pkgs.map(function (pk) { return '<option value="' + esc(pk.id) + '"' + (pk.id === curPkg ? ' selected' : '') + '>' + esc(pk.name || pk.id) + ' — ' + fmt(pk.speed || 0) + ' Mbps — ' + fmt(pk.price || 0) + ' تومان</option>'; }).join('') +
          '</select><p class="muted">قیمت و سرعت بسته روی رشد مشترک، ریزش و رضایت منطقه اثر مستقیم دارد.</p>';
      }
      var dIndiv = (state.individuals || []).filter(function (p) { return String(p.districtId) === String(n.id); });
      html += '<h5>مشترکان فردی منطقه</h5>' + individualsHtml(dIndiv, 'مشترک فردی در این منطقه ثبت نشده است.', { key: 'd:' + n.id, showBuilding: true });
      box.innerHTML = html;
      wireIndivLists(box);
      box.querySelectorAll('[data-district-package]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var r = (window.GameSim && GameSim.setDistrictPackage) ? GameSim.setDistrictPackage(state, sel.getAttribute('data-district-package'), sel.value) : { ok: false, error: 'در این نسخه موجود نیست.' };
          toast(r && r.ok === false ? (r.error || 'تغییر بسته انجام نشد.') : 'بستهٔ اینترنت منطقه تغییر کرد.', r && r.ok === false ? 'error' : 'success');
          refresh();
        });
      });
      return;
    }
    var connected = n.connected !== false && n.status !== 'unconnected';
    var path = null;
    if (window.GameSim && GameSim.tracePath && found.kind === 'node') path = GameSim.tracePath(state, n.id);
    if (path && path.length === 0) connected = false;
    if (found.kind === 'node' && n.owner === 'rival') {
      // گره شرکت رقیب: فقط خواندنی
      html += '<div class="warn-box">' + ICONS.warn + ' این گره متعلق به شرکت رقیب است و قابل تغییر نیست.</div>';
      html += '<p>وضعیت: ' + esc(STATUS_FA[n.status] || n.status || '—') + '</p>';
      if (n.capacity != null) html += '<p>ظرفیت: ' + fmt(n.capacity) + ' Mbps</p>';
      if (n.radius) html += '<p>شعاع پوشش: ' + fmt(n.radius) + ' واحد</p>';
      box.innerHTML = html;
      return;
    }
    if (found.kind === 'link') {
      var laR = (state.nodes || []).find(function (x) { return String(x.id) === String(n.from); });
      if (laR && laR.owner === 'rival') {
        var medNameR = ((window.GAME_DATA && GAME_DATA.linkMedia && GAME_DATA.linkMedia[n.medium]) || {}).name || n.medium || 'ارتباطی';
        html += '<div class="warn-box">' + ICONS.warn + ' این لینک متعلق به شرکت رقیب است و قابل تغییر نیست.</div>';
        html += '<dl class="kv"><dt>نوع اتصال</dt><dd>' + esc(medNameR) + '</dd><dt>ظرفیت</dt><dd>' + fmt(n.capacity || 0) + ' Mbps</dd></dl>';
        box.innerHTML = html;
        return;
      }
    }
    if (found.kind === 'node') {
      html += connected
        ? '<p class="status-ok"><span class="dot-ok"></span>متصل به شبکه</p>'
        : '<div class="warn-box">' + ICONS.warn + ' متصل نیست — این دستگاه به هسته/دروازه مسیر ندارد و هیچ سرویسی ارائه نمی‌دهد. با دکمهٔ «اتصال» آن را وصل کنید.</div>';
      // وضعیت ماژول TD-LTE روی دکل 4G/5G
      if (n.type === 'cell_4g' || n.type === 'cell_5g') {
        var hasTdlte = Array.isArray(n.modules) && n.modules.indexOf('tdlte') >= 0;
        html += hasTdlte
          ? '<p class="status-ok"><span class="dot-ok"></span>ماژول TD-LTE نصب است — مشترکان ثابت داخل پوشش این دکل سرویس TD-LTE می‌گیرند (پینگ پایدار)</p>'
          : '<div class="warn-box">' + ICONS.warn + ' ماژول TD-LTE ندارد — تقاضای TD-LTE در پوشش این دکل سرویس نمی‌گیرد. از بخش «ماژول‌ها» نصب کنید.</div>';
      }
      html += '<button class="btn primary connect-from-btn" data-connect-from="' + esc(n.id) + '">' + ICONS.backhaul + ' اتصال</button>';
      html += ' <button class="btn" data-ping-from="' + esc(n.id) + '">پینگ از این گره</button>';
    }
    if (n.status) html += '<p>وضعیت: ' + esc(STATUS_FA[n.status] || n.status) + '</p>';
    if (n.capacity != null) {
      var used = n.used || n.usage || 0;
      var pct = n.capacity ? Math.min(100, used / n.capacity * 100) : 0;
      var cls = pct > 90 ? 'hot' : pct > 70 ? 'warm' : '';
      html += '<p>ظرفیت: ' + fmt(used) + ' از ' + fmt(n.capacity) + ' Mbps (' + fmt(pct) + '٪)</p><div class="cap-bar"><div class="cap-fill ' + cls + '" style="width:' + pct + '%"></div></div>';
    }
    // برق گره: مصرف در برابر توان منبع تغذیه
    if (found.kind === 'node' && window.GameSim && GameSim.nodePowerInfo) {
      var pw = null;
      try { pw = GameSim.nodePowerInfo(n); } catch (e) { pw = null; }
      if (pw) {
        var pwPct = pw.capacity > 0 ? Math.min(100, Math.round(pw.draw / pw.capacity * 100)) : 100;
        html += '<p>برق: مصرف ' + fmt(pw.draw) + ' از ' + fmt(pw.capacity) + ' وات (منبع تغذیه سطح ' + fmt(pw.level) + ')' +
          (pw.broken ? ' — <span class="status-bad">منبع تغذیه خراب است!</span>' : (pw.ok ? '' : ' — <span class="status-bad">بدون برق کافی؛ گره خاموش است</span>')) + '</p>' +
          '<div class="cap-bar"><div class="cap-fill ' + (pwPct > 90 ? 'hot' : pwPct > 70 ? 'warm' : '') + '" style="width:' + pwPct + '%"></div></div>';
      }
    }
    if ((n.type === 'street_cabinet' || n.type === 'cabinet_basic') && window.GameSim && GameSim.cabinetPorts) {
      var usedPorts = GameSim.cabinetUsedPorts ? GameSim.cabinetUsedPorts(state, n.id) : 0;
      html += '<p>پورت‌های انشعاب: ' + fmt(usedPorts) + ' از ' + fmt(GameSim.cabinetPorts(n)) + ' پورت</p>';
    }
    var nodeEq = equipList().find(function (i) { return i.id === n.type; });
    if (nodeEq && connectsText(nodeEq)) {
      html += '<h5>اتصال‌ها</h5><p class="muted">' + esc(connectsText(nodeEq)) + '</p>';
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
        var techKey = nodeTechOf(n) || 'cellular';
        var sets = (window.GAME_DATA && GAME_DATA.channelSets) || {};
        var setDef = sets[techKey] || sets.cellular || {};
        var labels = setDef.labels || setDef.channels || [];
        var interf = (n.interference != null && !isNaN(n.interference)) ? Math.round(n.interference * 100) : null;
        var interfCls = interf == null ? '' : interf > 60 ? 'status-bad' : interf > 30 ? 'status-warn' : 'status-ok';
        html += '<h5>کانال رادیویی</h5><div class="channel-row"><label>کانال: <select data-channel-select="' + esc(n.id) + '">' +
          (labels.length ? labels.map(function (lb, ci) {
            var val = ci + 1; // کانال‌ها در سیم ۱-مبنا هستند؛ مقدار گزینه باید عدد کانال باشد نه برچسب
            var txt = (typeof lb === 'object') ? (lb.label || lb.name || String(val)) : String(lb);
            return '<option value="' + esc(val) + '"' + (val === Number(n.channel) ? ' selected' : '') + '>' + esc(txt) + '</option>';
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
      // ماژول‌های گره: هر نوع یک‌بار نصب و سطح‌به‌سطح آپگرید می‌شود (بدون محدودیت تعداد)
      var modInfo = null;
      try { modInfo = (window.GameSim && GameSim.moduleInfo) ? GameSim.moduleInfo(state, n.id) : null; } catch (e) { modInfo = null; }
      if (modInfo) {
        html += '<h5>ماژول‌ها</h5><p class="muted">هر ماژول یک‌بار نصب و بعد سطح‌به‌سطح قوی‌تر می‌شود؛ محدودیت تعداد نیست. هر سطح برق بیشتری می‌خواهد.</p>';
        modInfo.options.forEach(function (o) {
          if (o.id === 'tdlte' && n.type !== 'cell_4g' && n.type !== 'cell_5g') return; // TD-LTE فقط روی دکل 4G/5G دیده می‌شود
          var lvlTxt = o.level > 0 ? 'سطح ' + fmt(o.level) + (o.effectNow ? ' — ' + esc(o.effectNow) : '') : 'نصب نشده';
          var btnTxt = o.level > 0 ? 'آپگرید به سطح ' + fmt(o.nextLevel) : 'نصب';
          html += '<div class="module-row"><div><strong>' + esc(o.name) + '</strong> <span class="muted">(' + lvlTxt + ')</span>' +
            '<div class="muted">' + esc(o.desc) + '</div>' +
            '<div class="muted">' + (o.nextLevel <= o.maxLevel ? 'هزینهٔ سطح بعد: ' + fmt(o.cost) + ' تومان' : 'به سقف سطح رسیده') +
            ' — ماهانه: ' + fmt(o.monthlyCost) + ' — مصرف برق: ' + fmt(o.powerDraw) + ' وات' +
            (o.effectNext ? ' — اثر سطح بعد: ' + esc(o.effectNext) : '') + '</div>' +
            (o.powerWarn ? '<div class="warn-box">' + ICONS.warn + ' هشدار برق: با این آپگرید مصرف از توان منبع بیشتر می‌شود و گره خاموش خواهد شد؛ اول «منبع تغذیه» را آپگرید کنید.</div>' : '') +
            (o.broken ? '<div class="warn-box">' + ICONS.warn + ' این ماژول خراب است و کار نمی‌کند.</div>' : '') +
            '</div>' +
            (o.broken
              ? '<button class="btn sm primary" data-repair-module="' + esc(o.id) + '" data-module-node="' + esc(n.id) + '">تعمیر (آنی)</button>'
              : '<button class="btn sm primary" data-install-module="' + esc(o.id) + '" data-module-node="' + esc(n.id) + '"' + (o.ok ? '' : ' disabled') + '>' + btnTxt + '</button>') +
            (!o.ok && !o.broken ? '<div class="muted module-reason">' + esc(o.reason) + '</div>' : '') + '</div>';
        });
      }
      // لینک‌های این گره (با امکان قطع اتصال هرکدام)
      var nodeLinks = [];
      try { nodeLinks = (window.GameSim && GameSim.linksOfNode) ? GameSim.linksOfNode(state, n.id) : (state.links || []).filter(function (l) { return l.from === n.id || l.to === n.id; }); } catch (e) { nodeLinks = []; }
      if (nodeLinks.length) {
        html += '<h5>لینک‌های این گره</h5>';
        nodeLinks.forEach(function (l) {
          var otherId = l.from === n.id ? l.to : l.from;
          var other = (state.nodes || []).find(function (x) { return String(x.id) === String(otherId); });
          var medName = ((window.GAME_DATA && GAME_DATA.linkMedia && GAME_DATA.linkMedia[l.medium]) || {}).name || l.medium || 'ارتباطی';
          html += '<div class="link-row"><span>' + esc(medName) + (l.isBackup ? ' (پشتیبان)' : '') + ' ←→ «' + esc((other && other.name) || '—') + '» — ' + fmt(l.capacity || 0) + ' Mbps</span>' +
            disconnectBtnHtml(l.id) + '</div>';
        });
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
    box.querySelectorAll('[data-connect-from]').forEach(function (btn) {
      btn.addEventListener('click', function () { armConnectFromNode(btn.getAttribute('data-connect-from')); });
    });
    wireDisconnectButtons(box);
    box.querySelectorAll('[data-install-module]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.GameSim && GameSim.installModule) {
          var r = GameSim.installModule(state, btn.getAttribute('data-module-node'), btn.getAttribute('data-install-module'));
          toast(r && r.ok === false ? (r.error || 'نصب ماژول انجام نشد.') : (r.powered === false ? 'ماژول نصب شد ولی گره برق کافی ندارد و خاموش شد؛ منبع تغذیه را آپگرید کنید.' : 'ماژول نصب شد (آنی).'), r && r.ok === false ? 'error' : (r.powered === false ? 'warn' : 'success'));
        } else toast('نصب ماژول در این نسخه موجود نیست.', 'warn');
        refresh();
      });
    });
    box.querySelectorAll('[data-repair-module]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.GameSim && GameSim.repairModule) {
          var r = GameSim.repairModule(state, btn.getAttribute('data-module-node'), btn.getAttribute('data-repair-module'));
          toast(r && r.ok === false ? (r.error || 'تعمیر ماژول انجام نشد.') : 'ماژول تعمیر شد (آنی).', r && r.ok === false ? 'error' : 'success');
        }
        refresh();
      });
    });
    box.querySelectorAll('[data-ping-from]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode('ping');
        pingFromId = btn.getAttribute('data-ping-from');
        var panel = $('panel-detail'); if (panel) panel.classList.remove('open');
        toast('گرهٔ مقصد پینگ را انتخاب کنید.');
      });
    });
    box.querySelectorAll('[data-unlock-district]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.GameSim && GameSim.unlockDistrict) {
          var r = GameSim.unlockDistrict(state, btn.getAttribute('data-unlock-district'));
          toast(r && r.ok === false ? (r.error || 'بازکردن منطقه انجام نشد.') : 'منطقه باز شد.', r && r.ok === false ? 'error' : 'success');
        }
        refresh();
      });
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
      ['کل درآمد', fmt(f.totalIncome != null ? f.totalIncome : state.totalRevenue)], ['کل هزینه', fmt(f.totalExpense != null ? f.totalExpense : state.totalCosts)],
      ['هزینهٔ کارکنان (ماهانه)', fmt((state.staff || []).reduce(function (s, m) { return s + (m.salary || 0); }, 0)) + ' تومان — ' + fmt((state.staff || []).length) + ' نفر'],
      ['تعمیر و نگهداری شبکه (ماهانه)', fmt(f.maintenanceMonthly)],
      ['ترانزیت اینترنت (ماهانه)', fmt(f.transitMonthly) + (f.transitMbps != null ? ' — ' + fmt(f.transitMbps) + ' Mbps از دروازه' : '')],
      ['بدهی (وام)', fmt(f.loan != null ? f.loan : state.debt)], ['مالیات ماهانه (۵٪ درآمد)', fmt(f.taxMonthly != null ? f.taxMonthly : state.lastTax)]
    ];
    if (state.bankruptcyWarning) rows.push(['هشدار ورشکستگی', 'بدهی از حد امن گذشته است؛ درآمد را بالا ببرید یا هزینه را کم کنید']);
    if (state.rival && state.rival.enabled) {
      var lf = state.lastFlow || {};
      rows.push(['مشترکان شرکت رقیب', fmt(lf.rivalSubscribers || 0)]);
      rows.push(['نقدینگی شرکت رقیب', fmt(lf.rivalCash != null ? lf.rivalCash : Math.round(state.rival.cash || 0))]);
      rows.push(['گره‌های شرکت رقیب', fmt((state.nodes || []).filter(function (x) { return x.owner === 'rival'; }).length)]);
    }
    $('finance-body').innerHTML = '<table>' + rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' +
      '<p class="muted">جزئیات درآمد بر اساس بسته‌های فعال و تعداد مشتریان متصل محاسبه می‌شود.</p>';
  }

  function renderTimeline() {
    var tl = (window.GAME_DATA && GAME_DATA.timeline) || { startYear: 1991, daysPerYear: 10, eras: [] };
    var year = 1991;
    try { if (window.GameSim && GameSim.yearOf) year = GameSim.yearOf(state); } catch (e) { /* ignore */ }
    var eqs = equipList();
    var html = '<p>سال فعلی: <strong>' + faDigits(String(year)) + '</strong> — هر ' + faDigits(String(tl.daysPerYear || 10)) + ' روزِ بازی یک سال جلو می‌رود. تجهیزات با رسیدن دورانشان در منوی ساخت ظاهر می‌شوند و تقاضای مردم هم با دوران عوض می‌شود.</p>';
    html += '<div class="tech-grid">' + (tl.eras || []).map(function (er) {
      var active = year >= er.year;
      var items = eqs.filter(function (e) { return (e.era || 1991) === er.year; }).map(function (e) { return e.name || e.id; });
      var mods = ((window.GAME_DATA && GAME_DATA.moduleList) || []).filter(function (m) { return (m.era || 1991) === er.year; }).map(function (m) { return m.name; });
      var all = items.concat(mods);
      return '<div class="tech-card ' + (active ? 'unlocked' : 'locked') + '"><h5>' + (active ? ICONS.check + ' ' : ICONS.lock + ' ') + faDigits(String(er.year)) + ' — ' + esc(er.name || '') + '</h5>' +
        '<p>' + esc(er.desc || '') + '</p>' +
        (all.length ? '<p class="muted">تجهیزات این دوران: ' + esc(all.join('، ')) + '</p>' : '') +
        (active ? '<span class="status-ok">در دسترس</span>' : '<span class="muted">از سال ' + faDigits(String(er.year)) + '</span>') + '</div>';
    }).join('') + '</div>';
    $('timeline-body').innerHTML = html;
  }

  function faMult(x) { return '×' + String(Math.round(x * 10) / 10).replace('.', '٫'); }
  function renderStaff() {
    var staff = (state && state.staff) || [];
    var roles = (window.GAME_DATA && GAME_DATA.staffRoles) || [];
    var fx = (window.GameSim && GameSim.staffEffects && state) ? GameSim.staffEffects(state) : null;
    var countOf = function (id) { return staff.filter(function (s) { return s.role === id; }).length; };
    var nowLine = function (r) {
      if (!fx) return '';
      if (r.id === 'technician') return 'سرعت ساخت ' + faMult(fx.buildSpeed) + ' — تخفیف هزینهٔ تعمیر: ' + fmt(Math.round((1 - (fx.repairDiscount != null ? fx.repairDiscount : 1)) * 100)) + '٪ (تعمیر آنی است) — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqTechs) + ' نفر';
      if (r.id === 'engineer') return 'ظرفیت مؤثر شبکه ' + faMult(fx.capMult) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqEngs) + ' نفر';
      if (r.id === 'support') return 'افت رضایت ' + faMult(fx.satDecayRate / 0.25) + ' — بازگشت رضایت ' + faMult(fx.satRecoveryRate / 0.25) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqSups) + ' نفر';
      if (r.id === 'sales') return 'رشد مشترک ' + faMult(fx.growthMult) + ' — پیشنهاد برای شبکهٔ فعلی: ' + fmt(fx.reqSales) + ' نفر';
      return '';
    };
    var reqOf = function (r) {
      if (!fx) return 1;
      return r.id === 'technician' ? fx.reqTechs : r.id === 'engineer' ? fx.reqEngs : r.id === 'support' ? fx.reqSups : r.id === 'sales' ? fx.reqSales : 1;
    };
    // هشدار نبود/کمبود نیرو فقط وقتی شبکه به اندازه‌ای بزرگ شده که آن نقش واقعاً لازم شود
    var needOf = function (r) {
      if (!fx) return true;
      if (r.id === 'technician') return fx.nodeCount >= 4;
      if (r.id === 'engineer') return fx.linkCount >= 4;
      if (r.id === 'support') return fx.totalSubs >= 100;
      if (r.id === 'sales') return fx.servedDistricts >= 2;
      return true;
    };
    var html = roles.map(function (r) {
      var c = countOf(r.id), req = reqOf(r);
      var warn = '';
      if (needOf(r) && c === 0) warn = '<div class="staff-warn">' + ICONS.warn + ' ' + esc(r.absence || '') + '</div>';
      else if (needOf(r) && c < req) warn = '<div class="staff-warn">' + ICONS.warn + ' نیرو کم است: شبکهٔ شما به ' + fmt(req) + ' نفر «' + esc(r.name) + '» نیاز دارد و الان ' + fmt(c) + ' نفر دارید؛ اثر این نقش ضعیف‌تر از حالت کامل است.</div>';
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
  function subscribersStatsHtml() {
    if (!window.GameSim || !GameSim.subscriberStats || !state) return '';
    var st = null;
    try { st = GameSim.subscriberStats(state); } catch (e) { st = null; }
    if (!st) return '';
    var html = '<h4>آمار مشترکان</h4>' +
      '<dl class="kv">' +
      '<dt>کل مشترکان</dt><dd>' + fmt(st.total) + ' نفر</dd>' +
      '<dt>مشترکان فردی (نمونه)</dt><dd>' + fmt(st.individualsSubscribed) + ' مشترک از ' + fmt(st.individualsTotal) + ' نفر ثبت‌شده</dd>' +
      '<dt>پیوستن امروز</dt><dd>' + fmt(st.joins) + ' نفر</dd>' +
      '<dt>ترک امروز</dt><dd>' + fmt(st.leaves) + ' نفر</dd>' +
      '<dt>درآمد ماهانه از مشترکان</dt><dd>' + fmt(Math.round(st.monthlyRevenue)) + ' تومان</dd>' +
      '</dl>' +
      '<p class="muted">مشترکان فردی نمونه‌ای از مجموع مشترکان‌اند (هر فرد نمایندهٔ حدود ۲۰ مشترک تجمیعی است؛ سقف نمونه ' + fmt(st.individualCap) + ' نفر). ترافیک و درآمد شبکه فقط از مشترکان می‌آید؛ جمعیتِ غیرمشترک هیچ سرویسی نمی‌گیرد.</p>';
    var pkgNames = {};
    (state.packages || []).forEach(function (p) { pkgNames[p.id] = p.name || p.id; });
    var pkgRows = Object.keys(st.byPackage).filter(function (k) { return st.byPackage[k] > 0; })
      .map(function (k) { return '<div class="tech-row"><div class="tech-head"><span>' + esc(pkgNames[k] || k) + '</span><span>' + fmt(st.byPackage[k]) + ' نفر</span></div></div>'; }).join('');
    if (pkgRows) html += '<h5>مشترکان به تفکیک بسته</h5>' + pkgRows;
    var dRows = st.districts.slice().sort(function (a, b) { return b.subscribers - a.subscribers; }).map(function (r) {
      return '<tr><td>' + esc(r.name || r.id) + '</td><td>' + fmt(r.subscribers) + '</td><td>' + fmt(r.population) + '</td>' +
        '<td>' + fmt1(r.penetration) + '٪</td><td>' + fmt(Math.round((r.qos || 0) * 100)) + '٪</td><td>' + fmt(r.revenue) + '</td></tr>';
    }).join('');
    html += '<h5>مشترکان به تفکیک منطقه</h5>' +
      '<table class="subs-table"><thead><tr><th>منطقه</th><th>مشترک</th><th>جمعیت</th><th>نفوذ</th><th>کیفیت</th><th>درآمد ماهانه</th></tr></thead><tbody>' + dRows +
      '<tr><td>ساختمان‌های پراکنده</td><td>' + fmt(st.scatteredSubscribers) + '</td><td>' + fmt(st.scatteredPotential) + '</td><td>—</td><td>—</td><td>—</td></tr>' +
      '</tbody></table>';
    return html;
  }

  function renderStats() {
    var body = $('stats-body'); if (!body) return;
    var rangeEl = $('stats-range');
    var range = rangeEl ? rangeEl.value : 'all';
    var hist = ((state && state.history) || []).slice();
    if (range === '30') hist = hist.slice(-30);
    else if (range === '90') hist = hist.slice(-90);
    var subsHtml = subscribersStatsHtml();
    if (!hist.length) { body.innerHTML = subsHtml + '<p class="muted">هنوز سابقه‌ای ثبت نشده است. چند روز بازی کنید تا نمودارها ساخته شوند.</p>'; return; }
    var charts = [
      { id: 'cash', label: 'نقدینگی', color: '#2f81f7', get: function (r) { return r.cash || 0; } },
      { id: 'rev', label: 'درآمد روزانه', color: '#3fb950', get: function (r) { return r.revenue || 0; } },
      { id: 'subs', label: 'مشترکان', color: '#a371f7', get: function (r) { return r.subs || 0; } },
      { id: 'sat', label: 'رضایت (٪)', color: '#d29922', get: function (r) { return r.sat || 0; } },
      { id: 'cov', label: 'پوشش (٪)', color: '#22d3ee', get: function (r) { return r.cov || 0; } }
    ];
    var html = subsHtml + charts.map(function (c) { return '<div class="stats-chart"><canvas id="chart-' + c.id + '" class="chart-canvas"></canvas></div>'; }).join('');
    html += '<div class="stats-chart"><canvas id="chart-bytech" class="chart-canvas"></canvas></div>' +
      '<p class="muted">مشترکان به تفکیک فناوری: فیبر (فیروزه‌ای)، سلولار (سبز)، TD-LTE (نارنجی).</p>';
    body.innerHTML = html;
    charts.forEach(function (c) {
      var cv = $('chart-' + c.id);
      if (cv) drawLineChart(cv, hist.map(c.get), c.color, c.label);
    });
    // by-tech stacked lines: draw 3 lines on one canvas
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
        var techs = [['fiber', '#22d3ee'], ['cellular', '#3fb950'], ['fwa', '#fb923c']];
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

  function updateSpectatorBtn() {
    var el = $('spectator-label');
    if (el) el.textContent = 'حالت تماشاچی: ' + ((state && state.spectatorAI) ? 'روشن (هوش مصنوعی در حال بازی)' : 'خاموش');
  }
  function refresh() {
    updateSpectatorBtn();
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
    // رویدادهای تصادفی و دوران جدید با یک پیام کوتاه دیده شوند (حداکثر یکی در هر تازه‌سازی)
    try {
      var log = (state && state.log) || [];
      if (log.length > lastLogLen) {
        var toasted = false;
        for (var i = lastLogLen; i < log.length; i++) {
          var e = log[i];
          var msg = typeof e === 'string' ? e : (e.msg || e.text || e.message || '');
          var kind = (typeof e === 'object' && e.kind) || '';
          if ((kind === 'build' || kind === 'construct') && msg.indexOf('تمام شد') >= 0) playSound('complete');
          else if (msg.indexOf('تمام شد') >= 0 && (msg.indexOf('ساخت') >= 0 || msg.indexOf('نصب') >= 0)) playSound('complete');
          if (!toasted && kind === 'event' && msg) { toast(msg, 'warn'); toasted = true; }
        }
      }
      lastLogLen = log.length;
    } catch (e2) { /* ignore */ }
    renderTopbar(); renderBuildMenu();
    if (!panelPointerDown) renderDetail(); // وسط ضربهٔ کاربر روی پنل، دکمه‌ها عوض نشوند تا کلیک گم نشود
    // re-render open new modals if visible
    try {
      var m;
      if ((m = $('modal-achievements')) && !m.classList.contains('hidden')) renderAchievements();
      if ((m = $('modal-timeline')) && !m.classList.contains('hidden')) renderTimeline();
      if ((m = $('modal-campaigns')) && !m.classList.contains('hidden')) renderCampaigns();
      if ((m = $('modal-stats')) && !m.classList.contains('hidden')) renderStats();
    } catch (e3) { /* ignore */ }
  }

  /* ---------- Init wiring ---------- */
  function init(getState) {
    state = typeof getState === 'function' ? getState() : getState;
    var detailPanel = $('panel-detail');
    if (detailPanel) {
      detailPanel.addEventListener('pointerdown', function () { panelPointerDown = true; });
      window.addEventListener('pointerup', function () { panelPointerDown = false; });
      window.addEventListener('pointercancel', function () { panelPointerDown = false; });
    }
    // کلیکِ دنباله‌دار همان ضربه‌ای که پاپ‌آپ/پنل را باز کرده نباید روی دکمه‌هایش بیفتد
    // (وگرنه منوی رسانه همان لحظه خودش یک گزینه را انتخاب و ناپدید می‌شود)
    document.addEventListener('click', function (e) {
      if (Date.now() - lastTapAt < 350 && e.target && e.target.closest &&
          e.target.closest('#medium-picker, #build-confirm, #delete-confirm, #panel-detail, #speedtest-popover, #guide-popover')) {
        e.stopPropagation(); e.preventDefault();
      }
    }, true);
    $('tool-select').addEventListener('click', function () { selectedTool = null; setMode('select'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    var btnConnectCancel = $('btn-connect-cancel');
    if (btnConnectCancel) btnConnectCancel.addEventListener('click', function () { setMode('select'); toast('حالت اتصال لغو شد.', 'warn'); });
    $('tool-demolish').addEventListener('click', function () { selectedTool = null; setMode('demolish'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    $('tool-speedtest').addEventListener('click', function () { selectedTool = null; setMode('speedtest'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    if ($('tool-ping')) $('tool-ping').addEventListener('click', function () { selectedTool = null; setMode('ping'); renderBuildMenu(); if (isMobile()) $('panel-right').classList.remove('open'); });
    $('speedtest-close').addEventListener('click', function () { $('speedtest-popover').classList.add('hidden'); });
    if ($('ping-close')) $('ping-close').addEventListener('click', function () { $('ping-popover').classList.add('hidden'); });
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
    $('medium-cancel').addEventListener('click', function () { $('medium-picker').classList.add('hidden'); try { if (window.CityMap && CityMap.clearSurveyPreview) CityMap.clearSurveyPreview(); } catch (e) { /* ignore */ } setMode('select'); });
    $('btn-finance').addEventListener('click', function () { renderFinance(); openModal('modal-finance'); });
    if ($('btn-spectator')) $('btn-spectator').addEventListener('click', function () {
      var on = !(state && state.spectatorAI);
      if (window.GameSim && GameSim.setSpectatorAI) GameSim.setSpectatorAI(state, on);
      updateSpectatorBtn();
      toast(on ? 'حالت تماشاچی روشن شد: هوش مصنوعی شرکت را اداره می‌کند و شما فقط تماشا می‌کنید. هر وقت خواستید از همین منو خاموشش کنید تا کنترل برگردد.' : 'حالت تماشاچی خاموش شد؛ کنترل شرکت دست شماست.', 'success');
      refresh();
    });
    if ($('btn-timeline')) $('btn-timeline').addEventListener('click', function () { renderTimeline(); openModal('modal-timeline'); });
    $('btn-staff').addEventListener('click', function () { renderStaff(); openModal('modal-staff'); });
    $('btn-missions').addEventListener('click', function () { renderMissions(); openModal('modal-missions'); });
    $('btn-packages').addEventListener('click', function () { renderPackages(); openModal('modal-packages'); });
    $('btn-guide').addEventListener('click', function () { renderGuideOverview(); openModal('modal-guide'); });
    $('btn-log').addEventListener('click', function () { renderLog(); openModal('modal-log'); });
    if ($('btn-achievements')) $('btn-achievements').addEventListener('click', function () { renderAchievements(); openModal('modal-achievements'); });
    if ($('btn-tutorial')) $('btn-tutorial').addEventListener('click', function () { showTutorial(0); });
    if ($('btn-campaigns')) $('btn-campaigns').addEventListener('click', function () { renderCampaigns(); openModal('modal-campaigns'); });
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
        var layerName = cb.getAttribute('data-layer');
        if (window.CityMap && CityMap.setLayer) CityMap.setLayer(layerName, cb.checked);
        else if (window.CityMap && CityMap.layers) CityMap.layers[layerName] = cb.checked;
        // راهنمای رنگ‌های لایهٔ تقاضای فناوری فقط وقتی آن لایه فعال است دیده شود
        if (layerName === 'techdemand') {
          var lg = $('tech-legend'); if (lg) lg.classList.toggle('hidden', !cb.checked);
        }
        // دو هیت‌مپ «سیگنال» و «سرعت اتصال» انحصاری‌اند: روشن‌شدن یکی، دیگری را خاموش می‌کند
        if (layerName === 'signal' || layerName === 'speed') {
          var otherName = layerName === 'signal' ? 'speed' : 'signal';
          if (cb.checked) {
            var otherCb = document.querySelector('#layer-toggles input[data-layer="' + otherName + '"]');
            if (otherCb) otherCb.checked = false;
          }
          var sg = $('signal-legend'); if (sg) sg.classList.toggle('hidden', !(window.CityMap && CityMap.layers && CityMap.layers.signal));
          var pg = $('speed-legend'); if (pg) pg.classList.toggle('hidden', !(window.CityMap && CityMap.layers && CityMap.layers.speed));
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
    // آموزش بازی خودکار باز نمی‌شود؛ فقط از منو («آموزش بازی») در دسترس است
  }

  window.GameUI = {
    init: init, toast: toast, refresh: refresh, renderTopbar: renderTopbar,
    onPlace: onPlace, onMapSelect: onMapSelect, selectNode: selectNode,
    showTutorial: showTutorial, setState: function (s) { state = s; lastLogLen = ((s && s.log) || []).length; lastAlertCount = ((s && s.problems) || []).length; clearSuggestions(); refresh(); },
    getMode: function () { return mode; }, TUTORIAL: TUTORIAL
  };
})();
