import type { Plugin } from 'vite';

// Only the app shell is cached. Google requests and credentials never enter it.
export function offlineShell(): Plugin {
  return {
    name: 'fero-offline-shell', apply: 'build', enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest', ...Object.keys(bundle).filter((name) => /\.(?:js|css)$/.test(name)).map((name) => `/${name}`)];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'fero-shell-${Date.now()}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fero-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) return caches.match('/index.html').then(cached => cached || response);
      return response;
    }).catch(() => caches.match('/index.html').then(cached => cached || Response.error())));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(cached => cached || fetch(request)));
  }
});
` });
    },
  };
}
