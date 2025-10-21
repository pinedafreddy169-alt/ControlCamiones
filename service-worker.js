/* Camiones BYC — Service Worker Antipega */
const APP_VERSION = (new URL(location.href)).searchParams.get('v') || '2025.10.21-1';
const CACHE_NAME = 'byc-cache-v' + APP_VERSION;
const CORE = [
  './',
  './index.html?v=' + APP_VERSION,
  './manifest.json?v=' + APP_VERSION,
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE.map(u => new Request(u, {cache:'reload'}))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const {type} = e.data || {};
  if(type === 'SKIP_WAITING'){ self.skipWaiting(); }
});

/* Estrategias:
   - Navegación (HTML): network-first con fallback a caché (evita “pega”).
   - GET estáticos: stale-while-revalidate.
   - POST/externos: pasar directo (no cachear).
*/
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // No cachear POST ni llamadas a Apps Script (dejar pasar)
  if(req.method !== 'GET' || url.hostname.endsWith('googleusercontent.com') || url.hostname.endsWith('google.com')){
    return; // default fetch
  }

  // Navegaciones / HTML -> network-first
  if (req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html')){
    e.respondWith((async()=>{
      try{
        const fresh = await fetch(req, {cache:'no-store'});
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        return cached || caches.match('./index.html?v='+APP_VERSION);
      }
    })());
    return;
  }

  // Otros GET -> stale-while-revalidate
  e.respondWith((async()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then(res=>{
      if(res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(()=>null);
    return cached || fetchPromise || fetch(req);
  })());
});
