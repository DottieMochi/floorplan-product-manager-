// Service Worker：离线缓存。修改资源后请更新 CACHE 版本号。
const CACHE = 'area-nav-v1';

// 本地核心资源（安装时预缓存，必须可用）
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

// 需要运行时缓存的第三方 CDN（首次联网用过后即可离线）
const RUNTIME_HOSTS = [
  'cdn.jsdelivr.net',
  'cdn.sheetjs.com',
  'tessdata.projectnaptha.com'
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

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isRuntimeCdn = RUNTIME_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isRuntimeCdn) return; // 其余跨域请求交给浏览器默认处理

  // 缓存优先；命中即用，未命中则联网并写入缓存；离线兜底到首页
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && (resp.ok || resp.type === 'opaque')) {
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
