// Service worker : précache de l'app au premier chargement, puis cache d'abord (hors-ligne),
// avec mise à jour en arrière-plan. Incrémenter CACHE pour forcer le renouvellement.
const CACHE = 'boxe-v7';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      try {
        // Les fichiers générés par Vite portent un hash : on les lit dans index.html.
        const html = await (await fetch('./index.html', { cache: 'reload' })).text();
        // Set : cache.addAll rejette tout le lot s'il contient deux fois la même URL.
        const urls = [...new Set([...html.matchAll(/(?:src|href)="(\.[^"]+)"/g)].map((m) => new URL(m[1], self.registration.scope).href))];
        // Polices référencées depuis les feuilles de style (url(...) relatives au fichier CSS).
        for (const u of urls.filter((u) => u.endsWith('.css'))) {
          const css = await (await fetch(u)).text();
          for (const m of css.matchAll(/url\(["']?([^)"']+\.woff2)["']?\)/g)) urls.push(new URL(m[1], u).href);
        }
        await cache.addAll([...new Set(urls)]);
      } catch {
        /* le cache à l'exécution prendra le relais */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreVary : les scripts module envoient un en-tête Origin absent des requêtes de précache.
      const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) return hit;
      return (await net) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    })(),
  );
});
