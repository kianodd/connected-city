/* Boot + game loop. Wires GameSim + CityMap + GameUI.
   Save key: connected-city-save (localStorage). */
(function () {
  'use strict';

  var SAVE_KEY = 'connected-city-save';
  var DAY_MS = 3000;          // 1 game day at speed 1
  var state = null;
  var speed = 1;              // 0=pause, 1=normal, 3=fast
  var lastTs = 0, acc = 0;
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
    var seed = Math.floor(Math.random() * 1e9);
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

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs; lastTs = ts;
    if (speed > 0 && state) {
      acc += dt * speed;
      while (acc >= DAY_MS) {
        acc -= DAY_MS;
        GameSim.tick(state);
        if (GameSim.computeFlow) GameSim.computeFlow(state);
      }
    }
    if (window.CityMap && CityMap.render) CityMap.render(state);
    if (state && state.day !== lastUiDay) { lastUiDay = state.day; GameUI.refresh(); }
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
        onSelect: function (kind, id) { GameUI.onMapSelect(id, kind); },
        onPlace: function (x, y) { GameUI.onPlace(x, y); }
      });
    }
    GameUI.init(function () { return state; });

    $('btn-pause').addEventListener('click', function () { setSpeed(0); });
    $('btn-play').addEventListener('click', function () { setSpeed(1); });
    $('btn-fast').addEventListener('click', function () { setSpeed(3); });

    $('btn-save').addEventListener('click', function () {
      GameUI.toast(saveGame() ? 'بازی ذخیره شد.' : 'ذخیره انجام نشد.', saveGame() ? 'success' : 'error');
    });
    $('btn-load').addEventListener('click', function () {
      var s = loadGame();
      if (s) { state = s; GameUI.setState(state); if (CityMap.setState) CityMap.setState(state); GameUI.toast('بازی بارگذاری شد.', 'success'); }
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
      GameUI.showTutorial(0);
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

    window.addEventListener('beforeunload', saveGame);
    setSpeed(1);
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
