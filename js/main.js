/* Boot + game loop. Wires GameSim + CityMap + GameUI.
   Save key: connected-city-save (localStorage). */
(function () {
  'use strict';

  var SAVE_KEY = 'connected-city-save';
  var DAY_MS = 20000;         // 1 game day at speed 1 (20s; fast x3 ≈ 6.7s) — clock: 24h per DAY_MS
  var state = null;
  var speed = 0;              // 0=pause, 1=normal, 3=fast — بازی هنگام بارگذاری متوقف است
  var lastTs = 0, lastTopbarAt = 0;
  var lastAutosave = Date.now();
  var lastUiDay = -1;

  function $(id) { return document.getElementById(id); }

  function saveGame() {
    try {
      var data = (window.GameSim && GameSim.saveGame) ? GameSim.saveGame(state) : JSON.stringify(state);
      localStorage.setItem(SAVE_KEY, typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    } catch (e) { console.warn('save failed', e); return false; }
  }

  function loadGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      if (window.GameSim && GameSim.loadGame) return GameSim.loadGame(raw);
      return JSON.parse(raw);
    } catch (e) { console.warn('load failed', e); return null; }
  }

  function newGame() {
    var qs = null;
    try { qs = new URLSearchParams(location.search).get('seed'); } catch (e) { qs = null; }
    var seed = (qs != null && qs !== '') ? (parseInt(qs, 10) >>> 0) : Math.floor(Math.random() * 1e9);
    var s = GameSim.newGame(seed);
    s.isNewGame = true;
    return s;
  }

  function setSpeed(s) {
    speed = s;
    $('btn-pause').classList.toggle('active', s === 0);
    $('btn-play').classList.toggle('active', s === 1);
    $('btn-fast').classList.toggle('active', s === 3);
  }

  var lastIncomeSoundAt = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs; lastTs = ts;
    if (speed > 0 && state) {
      // ساعت و روز یکپارچه‌اند: ساعت با نرخ ۲۴ ساعت در هر DAY_MS جلو می‌رود و
      // هر بار که از نیمه‌شب رد شود، دقیقاً یک tick روزانه زده می‌شود
      if (window.GameSim && typeof GameSim.clockTick === 'function') {
        try { GameSim.clockTick(state, (dt / DAY_MS) * 24 * speed); } catch (e) { /* ignore */ }
      }
      while ((state.pendingDays || 0) > 0) {
        state.pendingDays--;
        GameSim.tick(state);
      }
      // نوار بالا (ساعت/سطح تقاضا) پیوسته تازه شود، نه فقط هنگام عوض‌شدن روز
      if (window.GameUI && GameUI.renderTopbar && ts - lastTopbarAt >= 100) {
        lastTopbarAt = ts;
        try { GameUI.renderTopbar(); } catch (e) { /* ignore */ }
      }
    }
    if (window.CityMap && CityMap.render) CityMap.render(state);
    if (state && state.day !== lastUiDay) {
      var prevDay = lastUiDay;
      lastUiDay = state.day; GameUI.refresh();
      if (prevDay !== -1) {
        var inc = (state.finance && state.finance.incomePerDay != null) ? state.finance.incomePerDay : (state.incomePerDay || 0);
        var nowMs = Date.now();
        if (inc > 0 && window.GameAudio && nowMs - lastIncomeSoundAt >= 5000) {
          lastIncomeSoundAt = nowMs;
          try { GameAudio.play('income'); } catch (e) { /* ignore */ }
        }
      }
    }
    if (Date.now() - lastAutosave > 30000) { lastAutosave = Date.now(); saveGame(); }
  }

  function download(filename, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function boot() {
    if (!window.GameSim) { document.body.innerHTML = '<p style="padding:20px">خطا: فایل js/sim.js بارگذاری نشده است.</p>'; return; }
    state = loadGame() || newGame();

    var canvas = $('city-canvas');
    if (window.CityMap && CityMap.init) {
      CityMap.init(canvas, state, {
        onSelect: function (kind, id, wx, wy) { GameUI.onMapSelect(id, kind, wx, wy); },
        onPlace: function (x, y) { GameUI.onPlace(x, y); },
        onSectorRotate: function (nodeId, dir) {
          try {
            if (window.GameSim && typeof GameSim.setNodeDirection === 'function' && state) {
              var node = null;
              var nodes = state.nodes || [];
              for (var i = 0; i < nodes.length; i++) if (String(nodes[i].id) === String(nodeId)) { node = nodes[i]; break; }
              var ang = node && node.angle != null ? node.angle : 120;
              GameSim.setNodeDirection(state, nodeId, dir, ang);
            }
          } catch (e) { /* ignore */ }
          if (window.GameUI && GameUI.refresh) GameUI.refresh();
        }
      });
    }
    if (window.GameAudio && GameAudio.init) { try { GameAudio.init(); } catch (e) { /* ignore */ } }
    GameUI.init(function () { return state; });

    $('btn-pause').addEventListener('click', function () { setSpeed(0); });
    $('btn-play').addEventListener('click', function () { setSpeed(1); });
    $('btn-fast').addEventListener('click', function () { setSpeed(3); });

    $('btn-save').addEventListener('click', function () {
      GameUI.toast(saveGame() ? 'بازی ذخیره شد.' : 'ذخیره انجام نشد.', saveGame() ? 'success' : 'error');
    });
    $('btn-load').addEventListener('click', function () {
      var s = loadGame();
      if (s) { state = s; GameUI.setState(state); if (CityMap.setState) CityMap.setState(state); setSpeed(0); GameUI.toast('بازی بارگذاری شد.', 'success'); }
      else GameUI.toast('ذخیره‌ای یافت نشد.', 'warn');
    });
    $('btn-export').addEventListener('click', function () {
      var data = GameSim.saveGame ? GameSim.saveGame(state) : JSON.stringify(state);
      download('connected-city-save.json', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
      GameUI.toast('فایل ذخیره دانلود شد.', 'success');
    });
    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var s = GameSim.loadGame ? GameSim.loadGame(r.result) : JSON.parse(r.result);
          state = s; GameUI.setState(state); if (CityMap.setState) CityMap.setState(state);
          setSpeed(0);
          saveGame(); GameUI.toast('بازی درون‌بری شد.', 'success');
        } catch (err) { GameUI.toast('فایل نامعتبر است.', 'error'); }
      };
      r.readAsText(f); e.target.value = '';
    });
    $('btn-reset').addEventListener('click', function () {
      if (!confirm('بازی جدید شروع شود؟ ذخیره فعلی حذف می‌شود.')) return;
      localStorage.removeItem(SAVE_KEY);
      state = newGame();
      GameUI.setState(state); if (CityMap.setState) CityMap.setState(state);
      setSpeed(0);
      GameUI.toast('بازی جدید شروع شد.', 'success');
    });

    $('zoom-in').addEventListener('click', function () { if (CityMap.zoomBy) CityMap.zoomBy(1.2); });
    $('zoom-out').addEventListener('click', function () { if (CityMap.zoomBy) CityMap.zoomBy(1 / 1.2); });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
      else if (e.key === '+' || e.key === '=') { if (CityMap.zoomBy) CityMap.zoomBy(1.2); }
      else if (e.key === '-' || e.key === '_') { if (CityMap.zoomBy) CityMap.zoomBy(1 / 1.2); }
    });

    var btnUpdate = $('btn-update');
    if (btnUpdate) btnUpdate.addEventListener('click', function () { window.checkAppUpdate(); });
    var btnApply = $('btn-apply-update');
    if (btnApply) btnApply.addEventListener('click', function () { window.applyAppUpdate(); });
    var btnLater = $('btn-update-later');
    if (btnLater) btnLater.addEventListener('click', hideUpdateBanner);

    window.addEventListener('beforeunload', saveGame);
    setSpeed(0); // پیش‌فرض: بازی متوقف شروع می‌شود تا بازیکن خودش پخش کند
    registerSW();
    requestAnimationFrame(loop);
  }

  // ---------- PWA: ثبت سرویس‌ورکر + بررسی/اعمال آپدیت ----------
  var swReg = null;
  var updateReady = false;

  function toastFa(msg, type) { if (window.GameUI && GameUI.toast) GameUI.toast(msg, type); }

  function showUpdateBanner() {
    var b = $('update-banner'); if (b) b.classList.remove('hidden');
    var m = $('btn-menu'); if (m) m.classList.add('has-update');
  }
  function hideUpdateBanner() { var b = $('update-banner'); if (b) b.classList.add('hidden'); }

  function watchWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', function () {
      // ورکر جدید نصب شده و منتظر فعال‌سازی است (نسخهٔ قبلی هنوز کنترل‌کننده است)
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        updateReady = true;
        showUpdateBanner();
      }
    });
  }

  function registerSW() {
    var verEl = $('app-version');
    if (verEl) verEl.textContent = 'نسخهٔ برنامه: ' + (window.APP_VERSION || '—');
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; } // نصب اول نیازی به بارگذاری مجدد ندارد
      if (reloading) return;
      reloading = true;
      location.reload(); // ذخیرهٔ localStorage دست‌نخورده می‌ماند
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) { updateReady = true; showUpdateBanner(); }
      reg.addEventListener('updatefound', function () { watchWorker(reg.installing); });
      reg.update().catch(function () {}); // بررسی خاموش هنگام بارگذاری
    }).catch(function () { /* PWA اختیاری است؛ بازی بدون آن هم کار می‌کند */ });
  }

  window.checkAppUpdate = function () {
    if (!('serviceWorker' in navigator) || !swReg) { toastFa('بررسی آپدیت در این مرورگر ممکن نیست.', 'warn'); return; }
    if (!navigator.onLine) { toastFa('آفلاین هستید؛ بررسی آپدیت نیازمند اینترنت است.', 'warn'); return; }
    if (updateReady || swReg.waiting) { showUpdateBanner(); toastFa('نسخهٔ جدید آماده است.', 'success'); return; }
    toastFa('در حال بررسی آپدیت…', 'info');
    swReg.update().then(function () {
      setTimeout(function () {
        if (updateReady || swReg.waiting) { showUpdateBanner(); toastFa('نسخهٔ جدید آماده است.', 'success'); }
        else toastFa('شما آخرین نسخه را دارید.', 'success');
      }, 3500);
    }).catch(function () { toastFa('بررسی آپدیت ممکن نشد؛ اتصال اینترنت را بررسی کنید.', 'error'); });
  };

  window.applyAppUpdate = function () {
    var w = swReg && (swReg.waiting || swReg.installing);
    if (w) w.postMessage({ type: 'SKIP_WAITING' }); // بعد از فعال‌شدن، controllerchange صفحه را تازه می‌کند
    else location.reload();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
