// سرویس‌ورکر «شبکه‌ساز: شهر متصل» — build: 1.0.0
// استراتژی کش: کد (HTML/JS/CSS) همیشه اول از شبکه خوانده می‌شود تا کاربر هیچ‌وقت روی نسخهٔ
// قدیمی گیر نکند؛ کش فقط پشتیبان آفلاین است. آیکون‌ها و فایل‌های ثابت cache-first هستند.
// نام کش از نسخهٔ برنامه (js/version.js) ساخته می‌شود و کش‌های قدیمی هنگام فعال‌سازی پاک می‌شوند.
importScripts('js/version.js');

const VERSION = self.APP_VERSION || '0.0.0';
const CACHE = 'connected-city-v' + VERSION;

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/version.js',
  './js/data.js',
  './js/mapgen.js',
  './js/sim.js',
  './js/map.js',
  './js/ui.js',
  './js/audio.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => {
      // نصب اول: بلافاصله فعال شود. آپدیت‌ها منتظر تأیید کاربر می‌مانند (پیام SKIP_WAITING).
      if (!self.registration.active) return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCodeRequest(req, url) {
  return req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // فونت/منابع بیرونی: شبکهٔ معمول

  if (isCodeRequest(req, url)) {
    // network-first: همیشه تازه‌ترین کد؛ آفلاین از کش
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))
      )
    );
  } else {
    // cache-first: آیکون‌ها و فایل‌های ثابت
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
  }
});
