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
    { title: 'گام ۲: نصب دستگاه دسترسی', text: 'از پنل «ابزار ساخت» یک دستگاه دسترسی (Access) مثل DSLAM یا OLT انتخاب کنید و روی نقشه نزدیک ساختمان‌ها قرار دهید. دستگاه بدون اتصال به شبکه هیچ سرویسی نمی‌دهد!' },
    { title: 'گام ۳: اتصال انتقال (Transport)', text: 'ابزار «اتصال» را انتخاب کنید، روی دستگاه دسترسی و سپس روی یک گره تجمیع (Aggregation) کلیک کنید و رسانه (فیبر/مسی/بی‌سیم) را انتخاب کنید تا لینک انتقال ساخته شود.' },
    { title: 'گام ۴: اتصال هسته و دروازه', text: 'زنجیره باید کامل باشد: مشتری ← دسترسی ← تجمیع ← هسته (Core) ← دروازه (Gateway). گره تجمیع را به هسته و هسته را به دروازه وصل کنید تا اینترنت به شهر برسد.' },
    { title: 'گام ۵: فعال‌سازی سرویس', text: 'حالا مسیر کامل است و مشتریان آنلاین می‌شوند. از پنل «بسته‌ها» قیمت و سرعت بسته‌ها را تنظیم کنید؛ قیمت بالاتر درآمد بیشتر اما تقاضای کمتر می‌دهد.' },
    { title: 'گام ۶: بررسی ظرفیت و رفع مشکل', text: 'اگر لینک یا دستگاه اشباع شود، هشدار 🔔 ظاهر می‌شود. روی گره مشکل‌دار کلیک کنید: علت مشکل و گزینه‌های رفع آن (ارتقا، لینک موازی، تغییر رسانه) نمایش داده می‌شود.' },
    { title: 'گام ۷: گسترش به منطقه جدید', text: 'با درآمد حاصل، در مناطق دیگر شهر دستگاه نصب کنید و به شبکه وصل کنید. با «تحقیق و توسعه» فناوری‌های جدید مثل فیبر نوری و 5G را باز کنید.' },
    { title: 'گام ۸: مسیر جایگزین (افزونگی)', text: 'برای جلوگیری از قطعی هنگام خرابی، بین گره‌های کلیدی یک مسیر دوم بسازید. اگر مسیر اصلی قطع شود، ترافیک از مسیر جایگزین (مثلاً ماهواره) عبور می‌کند. موفق باشید!' }
  ];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('fa-IR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* ---------- Mobile panels (drawer / bottom sheet, one at a time) ---------- */
  function isMobile() { return window.innerWidth <= 900; }
  function openPanel(id) {
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
  /* On mobile the save buttons join the scrollable actions row; on desktop they stay in place. */
  function placeSaveBtns() {
    var save = document.querySelector('.save-btns');
    var actions = document.querySelector('.tb-group.actions');
    var topbar = $('topbar');
    if (!save || !actions || !topbar) return;
    if (isMobile()) { if (save.parentNode !== actions) actions.appendChild(save); }
    else if (save.parentNode !== topbar) topbar.insertBefore(save, $('toggle-right'));
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
      var t = typeof e === 'string' ? e : (e.text || e.message || '');
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

  function renderBuildMenu() {
    var menu = $('build-menu'); if (!menu) return;
    var groups = {};
    equipList().forEach(function (it) {
      var cat = it.category || it.type || 'سایر';
      (groups[cat] = groups[cat] || []).push(it);
    });
    var html = '';
    Object.keys(groups).forEach(function (cat) {
      html += '<div class="build-cat">' + esc(cat) + '</div>';
      groups[cat].forEach(function (it) {
        var locked = !isUnlocked(it);
        var sel = selectedTool === it.id ? ' selected' : '';
        html += '<button class="build-item' + (locked ? ' locked' : '') + sel + '" data-equip="' + esc(it.id) + '"' + (locked ? ' disabled title="قفل است — ابتدا فناوری لازم را در تحقیق و توسعه باز کنید"' : '') + '>' +
          '<span class="bi-icon">' + esc(it.icon || '📡') + '</span>' +
          '<span class="bi-main"><span class="bi-name">' + esc(it.name || it.id) + '</span><br><span class="bi-sub">' + esc(it.description || '') + '</span></span>' +
          (locked ? '<span class="lock">🔒</span>' : '<span class="bi-cost">' + fmt(it.cost || 0) + '</span>') +
          '</button>';
      });
    });
    menu.innerHTML = html || '<p class="muted">کاتالوگ تجهیزات بارگذاری نشده است.</p>';
    menu.querySelectorAll('[data-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTool(btn.getAttribute('data-equip')); });
    });
  }

  function setMode(m) {
    mode = m; connectFirst = null;
    if (window.CityMap && CityMap.setPlacementMode) CityMap.setPlacementMode(m === 'place');
    ['tool-select', 'tool-connect', 'tool-demolish'].forEach(function (id) {
      var b = $(id); if (b) b.classList.toggle('active', (m === 'select' && id === 'tool-select') || (m === 'connect' && id === 'tool-connect') || (m === 'demolish' && id === 'tool-demolish'));
    });
    var hint = $('map-hint');
    var hints = {
      place: 'روی نقشه کلیک کنید تا دستگاه نصب شود (Esc برای لغو)',
      connect: 'روی گره اول کلیک کنید، سپس گره دوم را انتخاب کنید',
      demolish: 'روی گره کلیک کنید تا تخریب شود',
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
  function onPlace(x, y) {
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

  function onMapSelect(id, kind) {
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
      if (window.GameSim && GameSim.demolishNode) {
        var r = GameSim.demolishNode(state, id);
        toast(r && r.ok === false ? (r.error || 'تخریب انجام نشد.') : 'گره تخریب شد.', r && r.ok === false ? 'error' : 'success');
      } else toast('تخریب در این نسخه پشتیبانی نمی‌شود.', 'warn');
      refresh(); return;
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
        esc(m.name || m.id) + ' — ظرفیت ' + fmt(m.capacity || 0) + ' Mbps' + (locked ? ' 🔒' : '') + '</button>';
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
  function findNode(id) {
    if (!state) return null;
    var n = (state.nodes || []).find(function (x) { return String(x.id) === String(id); });
    if (n) return { node: n, kind: 'node' };
    var b = ((window.GAME_DATA && GAME_DATA.buildings) || []).find(function (x) { return String(x.id) === String(id); });
    if (b) return { node: b, kind: 'building' };
    return null;
  }

  function selectNode(id, kind) {
    selectedId = id;
    renderDetail();
    if (isMobile()) {
      if (id != null) openPanel('panel-detail');
      else $('panel-detail').classList.remove('open');
    }
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
    var name = n.name || (equipList().find(function (e) { return e.id === n.type || e.id === n.equipId; }) || {}).name || n.type || ('گره ' + n.id);
    var html = '<h4>' + esc(name) + '</h4>';
    var connected = n.connected !== false && n.status !== 'unconnected';
    var path = null;
    if (window.GameSim && GameSim.tracePath && found.kind === 'node') path = GameSim.tracePath(state, n.id);
    if (path && path.length === 0) connected = false;
    if (found.kind === 'node') {
      html += connected
        ? '<p class="status-ok">● متصل به شبکه</p>'
        : '<div class="warn-box">⚠️ متصل نیست — این دستگاه به هسته/دروازه مسیر ندارد و هیچ سرویسی ارائه نمی‌دهد. با ابزار «اتصال» آن را وصل کنید.</div>';
    }
    if (n.status) html += '<p>وضعیت: ' + esc(n.status) + '</p>';
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
    var problems = (state.problems || []).filter(function (p) { return String(p.nodeId) === String(n.id) || String(p.targetId) === String(n.id); });
    problems.forEach(function (p, i) {
      html += '<div class="problem-box"><strong>مشکل:</strong> ' + esc(p.cause || p.message || 'نامشخص');
      if (p.fixOptions && p.fixOptions.length) {
        html += '<div class="fix-btns">' + p.fixOptions.map(function (f, j) {
          return '<button class="btn sm" data-fix="' + i + ':' + j + '">' + esc(f.label || f.name || f) + (f.cost != null ? ' (' + fmt(f.cost) + ')' : '') + '</button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });
    box.innerHTML = html;
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
  function openModal(id) { $(id).classList.remove('hidden'); $('modal-backdrop').classList.remove('hidden'); }
  function closeModals() {
    ['modal-finance', 'modal-rd', 'modal-staff', 'modal-missions', 'modal-packages'].forEach(function (id) { $(id).classList.add('hidden'); });
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
      return '<div class="tech-card ' + (unlocked ? 'unlocked' : 'locked') + '"><h5>' + (unlocked ? '✅ ' : '🔒 ') + esc(t.name || t.id) + '</h5>' +
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

  function renderStaff() {
    var staff = (state && state.staff) || [];
    var roles = (window.GAME_DATA && GAME_DATA.staffRoles) || [];
    var html = '<table><tr><th>نام/نقش</th><th>حقوق روزانه</th><th>وضعیت</th></tr>';
    html += staff.map(function (s) { return '<tr><td>' + esc(s.name || s.role || s.id) + '</td><td>' + fmt(s.salary || s.wage) + '</td><td>' + esc(s.status || 'فعال') + '</td></tr>'; }).join('') || '<tr><td colspan="3" class="muted">کارکنانی استخدام نشده است.</td></tr>';
    html += '</table>';
    if (roles.length) {
      html += '<h4>استخدام</h4>' + roles.map(function (r) {
        return '<button class="btn sm" style="margin:4px" data-hire="' + esc(r.id) + '">+ ' + esc(r.name || r.id) + ' (' + fmt(r.salary || r.wage || 0) + '/روز)</button>';
      }).join('');
    }
    $('staff-body').innerHTML = html;
    $('staff-body').querySelectorAll('[data-hire]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (GameSim.hireStaff) { var r = GameSim.hireStaff(state, btn.getAttribute('data-hire')); toast(r && r.ok === false ? (r.error || 'استخدام نشد.') : 'استخدام شد.', r && r.ok === false ? 'error' : 'success'); }
        else toast('استخدام در این نسخه فعال نیست.', 'warn');
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
        return '<tr><td>' + esc(m.name || m.title || m.id) + '<br><span class="muted">' + esc(m.description || '') + '</span></td><td>' + fmt(m.reward || 0) + '</td><td class="' + (isDone ? 'mission-done' : 'mission-todo') + '">' + (isDone ? 'انجام شده ✅' : 'در حال انجام') + '</td></tr>';
      }).join('') + '</table>';
  }

  function renderPackages() {
    var pkgs = (state && state.packages) || (window.GAME_DATA && GAME_DATA.packages) || [];
    pkgs = Array.isArray(pkgs) ? pkgs : Object.values(pkgs);
    $('packages-body').innerHTML = '<table><tr><th>بسته</th><th>سرعت (Mbps)</th><th>قیمت ماهانه</th><th></th></tr>' +
      pkgs.map(function (p, i) {
        return '<tr><td>' + esc(p.name || p.id) + '</td>' +
          '<td><input type="number" min="1" value="' + (p.speed || 0) + '" data-pkg-speed="' + i + '"></td>' +
          '<td><input type="number" min="0" value="' + (p.price || 0) + '" data-pkg-price="' + i + '"></td>' +
          '<td><button class="btn sm primary" data-pkg-save="' + i + '">ذخیره</button></td></tr>';
      }).join('') + '</table><p class="muted">تغییر قیمت/سرعت از روز بعد روی تقاضا و درآمد اثر می‌گذارد.</p>';
    $('packages-body').querySelectorAll('[data-pkg-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-pkg-save');
        var speed = +document.querySelector('[data-pkg-speed="' + i + '"]').value;
        var price = +document.querySelector('[data-pkg-price="' + i + '"]').value;
        if (GameSim.updatePackage) { var r = GameSim.updatePackage(state, pkgs[i].id, { speed: speed, price: price }); toast(r && r.ok === false ? (r.error || 'ذخیره نشد.') : 'بسته به‌روزرسانی شد.', r && r.ok === false ? 'error' : 'success'); }
        else { pkgs[i].speed = speed; pkgs[i].price = price; toast('بسته به‌روزرسانی شد.', 'success'); }
        refresh();
      });
    });
  }

  /* ---------- Alerts ---------- */
  function renderAlerts() {
    var probs = (state && state.problems) || [];
    $('alerts-body').innerHTML = probs.length ? probs.map(function (p) {
      return '<div class="alert-item"><strong>⚠️ ' + esc(p.title || 'مشکل') + '</strong><br>' + esc(p.cause || p.message || '') +
        (p.nodeId != null ? '<br><button class="btn sm" data-goto="' + esc(p.nodeId) + '">مشاهده گره</button>' : '') + '</div>';
    }).join('') : '<p class="muted">هشداری وجود ندارد. شبکه سالم است. ✅</p>';
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
    $('confirm-yes').addEventListener('click', confirmBuild);
    $('confirm-no').addEventListener('click', function () { pendingBuild = null; $('build-confirm').classList.add('hidden'); });
    $('medium-cancel').addEventListener('click', function () { $('medium-picker').classList.add('hidden'); });
    $('btn-finance').addEventListener('click', function () { renderFinance(); openModal('modal-finance'); });
    $('btn-rd').addEventListener('click', function () { renderRD(); openModal('modal-rd'); });
    $('btn-staff').addEventListener('click', function () { renderStaff(); openModal('modal-staff'); });
    $('btn-missions').addEventListener('click', function () { renderMissions(); openModal('modal-missions'); });
    $('btn-packages').addEventListener('click', function () { renderPackages(); openModal('modal-packages'); });
    document.querySelectorAll('.modal-close').forEach(function (b) { b.addEventListener('click', closeModals); });
    $('modal-backdrop').addEventListener('click', closeModals);
    $('btn-alerts').addEventListener('click', function () { renderAlerts(); $('alerts-drawer').classList.toggle('hidden'); });
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
    placeSaveBtns();
    window.addEventListener('resize', placeSaveBtns);
    document.querySelectorAll('#layer-toggles input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (window.CityMap && CityMap.setLayer) CityMap.setLayer(cb.getAttribute('data-layer'), cb.checked);
        else if (window.CityMap && CityMap.layers) CityMap.layers[cb.getAttribute('data-layer')] = cb.checked;
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { setMode('select'); selectedTool = null; $('build-confirm').classList.add('hidden'); $('medium-picker').classList.add('hidden'); closeModals(); closePanels(); }
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
