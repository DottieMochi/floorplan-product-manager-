// Service Worker：离线缓存「应用外壳」（同源资源）。修改资源后请更新 CACHE 版本号。
// 注意：跨域 CDN（图标字体、xlsx、扫码库等）一律不拦截，交给浏览器直接联网获取，
// 以免把跨域样式表缓存成 opaque 响应导致样式（图标）失效。
const CACHE = 'area-nav-v2';

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/store.js',
  './js/areaStore.js',
  './js/canvasManager.js',
  './js/productManager.js',
  './js/uiController.js',
  './js/batchImport.js',
  './js/utils.js',
  './js/demoData.js',
  './js/scanner.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 只处理同源请求；跨域 CDN 不拦截，浏览器自行联网（图标字体等才能正确加载）
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
