/* GameAudio: WebAudio-only sound engine, no audio files.
   Lazy AudioContext (first user gesture). Headless-safe: silent no-op without AudioContext.
   Settings persisted in localStorage 'connected-city-audio' {volume:0..1, muted, music}. */
(function () {
  'use strict';

  var STORAGE_KEY = 'connected-city-audio';
  var ctx = null;
  var master = null;
  var musicNodes = null; // {oscs:[], gain, lfo, timer}
  var musicChordIdx = 0;
  var lastIncomeAt = 0;
  var settings = { volume: 0.7, muted: false, music: false };

  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.volume === 'number') settings.volume = Math.max(0, Math.min(1, parsed.volume));
        settings.muted = !!parsed.muted;
        settings.music = !!parsed.music;
      }
    }
  } catch (e) { /* ignore */ }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function hasAudio() {
    try { return !!(window.AudioContext || window.webkitAudioContext); } catch (e) { return false; }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    if (!hasAudio()) return null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = settings.muted ? 0 : settings.volume;
      master.connect(ctx.destination);
      return ctx;
    } catch (e) { ctx = null; master = null; return null; }
  }

  function applyMaster() {
    try {
      if (master && ctx) master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume, ctx.currentTime, 0.02);
    } catch (e) { /* ignore */ }
  }

  function tone(freq, dur, type, vol, when, glideTo) {
    try {
      if (!ensureCtx() || !ctx || !master) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t0 = ctx.currentTime + (when || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.15), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function noiseBurst(dur, vol, freq, when) {
    try {
      if (!ensureCtx() || !ctx || !master) return;
      if (ctx.state === 'suspended') ctx.resume();
      var t0 = ctx.currentTime + (when || 0);
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq || 800;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  var SOUNDS = {
    click: function () { tone(880, 0.06, 'sine', 0.10, 0, 660); },
    build: function () { tone(140, 0.16, 'triangle', 0.22, 0, 80); noiseBurst(0.10, 0.12, 500, 0); },
    complete: function () { tone(523.25, 0.12, 'sine', 0.14, 0); tone(783.99, 0.18, 'sine', 0.14, 0.10); },
    error: function () { tone(160, 0.22, 'sawtooth', 0.10, 0, 110); },
    alert: function () { tone(740, 0.12, 'square', 0.08, 0); tone(554, 0.14, 'square', 0.08, 0.13); },
    income: function () {
      var now = Date.now();
      if (now - lastIncomeAt < 5000) return;
      lastIncomeAt = now;
      tone(988, 0.09, 'sine', 0.09, 0); tone(1319, 0.11, 'sine', 0.09, 0.07); tone(1568, 0.14, 'sine', 0.08, 0.14);
    },
    achievement: function () {
      tone(523.25, 0.12, 'triangle', 0.14, 0); tone(659.25, 0.12, 'triangle', 0.14, 0.10);
      tone(783.99, 0.14, 'triangle', 0.14, 0.20); tone(1046.5, 0.24, 'triangle', 0.15, 0.30);
    }
  };

  /* ---- ambient music: slow chord pad, chord progression loop ---- */
  var CHORDS = [
    [220.00, 261.63, 329.63],   // Am
    [174.61, 220.00, 261.63],   // F
    [196.00, 246.94, 293.66],   // G
    [164.81, 220.00, 261.63]    // Am/E-ish
  ];
  function startMusic() {
    try {
      if (musicNodes) return;
      if (!ensureCtx() || !ctx || !master) return;
      if (ctx.state === 'suspended') ctx.resume();
      var mg = ctx.createGain(); mg.gain.value = 0.05; mg.connect(master);
      var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
      var lfoGain = ctx.createGain(); lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain); lfoGain.connect(mg.gain); lfo.start();
      var oscs = [];
      function setChord(idx) {
        try {
          var chord = CHORDS[idx % CHORDS.length];
          var t = ctx.currentTime;
          for (var i = 0; i < 3; i++) {
            if (!oscs[i]) {
              var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = chord[i];
              var og = ctx.createGain(); og.gain.value = 0.5;
              o.connect(og); og.connect(mg); o.start();
              oscs[i] = { osc: o, gain: og };
            } else {
              oscs[i].osc.frequency.setTargetAtTime(chord[i], t, 1.2);
            }
          }
        } catch (e) { /* ignore */ }
      }
      setChord(musicChordIdx);
      var timer = setInterval(function () { musicChordIdx++; setChord(musicChordIdx); }, 8000);
      musicNodes = { oscs: oscs, gain: mg, lfo: lfo, timer: timer };
    } catch (e) { musicNodes = null; }
  }
  function stopMusic() {
    try {
      if (!musicNodes) return;
      clearInterval(musicNodes.timer);
      musicNodes.oscs.forEach(function (o) { try { o.osc.stop(); } catch (e) { /* ignore */ } });
      try { musicNodes.lfo.stop(); } catch (e) { /* ignore */ }
      try { musicNodes.gain.disconnect(); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
    musicNodes = null;
  }

  function init() {
    try {
      var once = function () {
        try {
          ensureCtx();
          if (settings.music) startMusic();
        } catch (e) { /* ignore */ }
      };
      document.addEventListener('pointerdown', once, { once: true });
      document.addEventListener('keydown', once, { once: true });
    } catch (e) { /* ignore */ }
  }

  function play(name) {
    try {
      if (settings.muted) return;
      var fn = SOUNDS[name];
      if (fn) fn();
    } catch (e) { /* ignore */ }
  }

  function setVolume(v) {
    try {
      settings.volume = Math.max(0, Math.min(1, Number(v) || 0));
      saveSettings(); applyMaster();
    } catch (e) { /* ignore */ }
  }
  function setMuted(b) {
    try { settings.muted = !!b; saveSettings(); applyMaster(); } catch (e) { /* ignore */ }
  }
  function setMusic(b) {
    try {
      settings.music = !!b; saveSettings();
      if (settings.music) startMusic(); else stopMusic();
    } catch (e) { /* ignore */ }
  }
  function getSettings() {
    return { volume: settings.volume, muted: settings.muted, music: settings.music };
  }

  window.GameAudio = {
    init: init, play: play, setVolume: setVolume, setMuted: setMuted,
    setMusic: setMusic, getSettings: getSettings
  };
})();
