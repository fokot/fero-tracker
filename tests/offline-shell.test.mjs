import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createLoader } from './load-module.mjs';
function setup(base = '/', failInstall = false) {
  const plugin = createLoader()('build/offline.ts').offlineShell(); let source;
  plugin.configResolved({ base });
  plugin.generateBundle.call({ emitFile: asset => { source = asset.source; } }, null, {'assets/app.js':{},'assets/app.css':{},'assets/app.js.map':{}});
  const events = {}, added = [], deleted = [], cacheModes = []; let skipped = false;
  const prefix = `fero-shell:${encodeURIComponent(base)}:`;
  const cache = { addAll: async assets => {if(failInstall)throw new Error('Download failed');added.push(...assets.map(request=>new URL(request.url).pathname));cacheModes.push(...assets.map(request=>request.cache));}, match: async key =>
    key === `${base}index.html` ? new Response('cached app') : key === `${base}docs/index.html` ? new Response('cached docs') : key === `${base}assets/app.js` ? new Response('cached script') : undefined };
  vm.runInNewContext(source, {
    URL, Response, Request, fetch: async () => { throw new Error('Network offline'); },
    self: { location: {origin:'https://tracker.test'}, clients: {claim:async()=>{}}, skipWaiting:async()=>{skipped=true;}, addEventListener: (name,handler) => events[name]=handler },
    caches: { open:async key=>key===`${prefix}old`?{match:async name=>name===`${base}assets/previous.js`?new Response('previous script'):undefined}:cache, keys:async()=>['unrelated-cache', 'fero-shell-1234', `${prefix}older`, `${prefix}old`, 'fero-shell:%2Fsheetbase%2F:old'], delete:async key=>deleted.push(key) },
  });
  const wait = handler => new Promise((resolve,reject) => handler({waitUntil:promise=>promise.then(resolve,reject)}));
  const request = async (url,mode='cors',method='GET') => { let response; events.fetch({request:{url,mode,method},respondWith:promise=>{response=promise;}});return response; };
  return {events, added, deleted, cacheModes, wait, request, prefix, get skipped(){return skipped;}};
}
for (const base of ['/', '/fero-tracker/', '/tools/tracker/']) {
  test(`worker precaches its complete shell and only cleans owned caches at ${base}`, async () => {
    const env=setup(base); await env.wait(env.events.install); await env.wait(env.events.activate);
    for (const name of ['index.html','docs/index.html','assets/app.js','assets/app.css','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png']) assert.ok(env.added.includes(base+name), name);
    assert.ok(env.added.every(url=>url.startsWith(base)));
    assert.ok(!env.added.includes(base+'assets/app.js.map'));
    assert.ok(env.cacheModes.every(mode=>mode==='reload'),'new downloads bypass stale HTTP caches');
    assert.ok(env.skipped,'complete downloads activate without waiting for suspended clients');
    assert.deepEqual(env.deleted, base==='/' ? ['fero-shell-1234',`${env.prefix}older`] : [`${env.prefix}older`]);
  });
  test(`offline documents and scripts stay separate; data requests bypass worker at ${base}`, async () => {
    const env=setup(base);
    assert.equal(await (await env.request(`https://tracker.test${base}`,'navigate')).text(),'cached app');
    assert.equal(await (await env.request(`https://tracker.test${base}index.html?from=home`,'navigate')).text(),'cached app');
    assert.equal(await (await env.request(`https://tracker.test${base}docs/`,'navigate')).text(),'cached docs');
    assert.equal(await (await env.request(`https://tracker.test${base}assets/app.js`)).text(),'cached script');
    assert.equal(await (await env.request(`https://tracker.test${base}assets/previous.js`)).text(),'previous script');
    for (const [url,mode,method] of [
      ['https://sheets.googleapis.com/v4/spreadsheets/example'], ['https://tracker.test/sheetbase/','navigate'],
      [`https://tracker.test${base}api/private`], [`https://tracker.test${base}missing`,'navigate'],
      [`https://tracker.test${base}`,'cors','POST'],
    ]) assert.equal(await env.request(url,mode,method),undefined,url);
  });
}
test('worker requires an absolute path base with trailing slash', () => {
  const plugin=createLoader()('build/offline.ts').offlineShell();
  for (const base of ['./', 'https://cdn.test/', '/missing-slash']) assert.throws(()=>plugin.configResolved({base}),/PWA base/);
});

test('an incomplete download cannot activate or replace the existing shell',async()=>{
  const env=setup('/fero-tracker/',true);await assert.rejects(env.wait(env.events.install),/Download failed/);assert.equal(env.skipped,false);assert.equal(env.deleted.length,1);assert.ok(env.deleted[0].startsWith(env.prefix));assert.match(env.deleted[0],/:\d+$/);
});
