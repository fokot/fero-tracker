import type { Plugin } from 'vite';

// Cache only this deployment's static shell. Account data stays in Sheetbase.
export function offlineShell(): Plugin {
  let base = '/';
  return {
    name: 'fero-offline-shell', apply: 'build', enforce: 'post',
    configResolved(config) {
      base = config.base;
      if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('PWA base must be an absolute path ending in / (for example /fero-tracker/).');
    },
    generateBundle(_options, bundle) {
      const files = ['index.html', 'docs/index.html', 'icon.svg', 'manifest.webmanifest',
        'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
        ...Object.keys(bundle).filter((name) => /\.(?:js|css)$/.test(name))];
      const assets = [...new Set(files.map((name) => `${base}${name}`))];
      // Each path owns a separate cache namespace, including on shared github.io origins.
      const prefix = `fero-shell:${encodeURIComponent(base)}:`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const BASE = ${JSON.stringify(base)};
const PREFIX = ${JSON.stringify(prefix)};
const CACHE = PREFIX + ${JSON.stringify(String(Date.now()))};
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.location.origin), { cache: 'reload' })))).then(() => self.skipWaiting()).catch(async error => {
    await caches.delete(CACHE);
    throw error;
  }));
});
// Activate the downloaded shell even if iOS keeps an old window suspended.
// Existing documents are never reloaded by the worker. Keep the immediately
// previous static cache for requests already started by the previous document.
const owned = key => key.startsWith(PREFIX) || (BASE === '/' && /^fero-shell-\\d+$/.test(key));
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => {
    const older = keys.filter(key => owned(key) && key !== CACHE);
    return Promise.all(older.slice(0, -1).map(key => caches.delete(key)));
  }).then(() => self.clients.claim()));
});
async function staticAsset(path) {
  const current = await (await caches.open(CACHE)).match(path);
  if (current) return current;
  const older = (await caches.keys()).filter(key => owned(key) && key !== CACHE);
  const previous = older[older.length - 1];
  return previous ? (await caches.open(previous)).match(path) : undefined;
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // Keep HTML and hashed bundles from the same installed version. Documentation
  // has its own document; arbitrary navigations never fall back to the login page.
  const document = url.pathname === BASE || url.pathname === BASE + 'index.html' ? BASE + 'index.html'
    : url.pathname === BASE + 'docs/' || url.pathname === BASE + 'docs/index.html' ? BASE + 'docs/index.html' : null;
  if (request.mode === 'navigate' && document) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(document)).then(cached => cached || fetch(request)));
  } else if (ASSETS.includes(url.pathname) || url.pathname.startsWith(BASE + 'assets/')) {
    event.respondWith(staticAsset(url.pathname).then(cached => cached || fetch(request)));
  }
});
` });
    },
  };
}
