import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createLoader } from './load-module.mjs';
function setup() {
  const plugin=createLoader()('build/offline.ts').offlineShell();let source;
  plugin.generateBundle.call({emitFile:asset=>{source=asset.source;}},null,{'assets/app.js':{},'assets/app.css':{},'assets/app.js.map':{}});
  const events={},added=[],deleted=[];
  const cache={addAll:async assets=>added.push(...assets)};
  vm.runInNewContext(source,{
    URL,Response,fetch:async()=>{throw new Error('Network offline');},
    self:{location:{origin:'https://tracker.test'},clients:{claim:async()=>{}},addEventListener:(name,handler)=>events[name]=handler},
    caches:{open:async()=>cache,keys:async()=>['unrelated-cache','fero-shell-old'],delete:async key=>deleted.push(key),match:async key=>key==='/index.html'?new Response('cached app'):key==='/assets/app.js'?new Response('cached script'):undefined},
  });
  const wait=handler=>new Promise((resolve,reject)=>handler({waitUntil:promise=>promise.then(resolve,reject)}));
  const request=async(url,mode='cors',method='GET')=>{let response;events.fetch({request:{url,mode,method},respondWith:promise=>{response=promise;}});return response;};
  return {events,added,deleted,wait,request};
}
test('the production worker precaches only shell assets and cleans only its own old caches',async()=>{
  const env=setup();await env.wait(env.events.install);await env.wait(env.events.activate);
  assert.ok(env.added.includes('/index.html'));assert.ok(env.added.includes('/assets/app.js'));assert.ok(env.added.includes('/assets/app.css'));
  assert.ok(!env.added.includes('/assets/app.js.map'));assert.deepEqual(env.deleted,['fero-shell-old']);
});
test('offline navigation and bundled scripts use cached assets, Google and writes bypass the worker',async()=>{
  const env=setup();assert.equal(await (await env.request('https://tracker.test/','navigate')).text(),'cached app');
  assert.equal(await (await env.request('https://tracker.test/assets/app.js')).text(),'cached script');
  assert.equal(await env.request('https://sheets.googleapis.com/v4/spreadsheets/example'),undefined);
  assert.equal(await env.request('https://tracker.test/api/private'),undefined);
  assert.equal(await env.request('https://tracker.test/','cors','POST'),undefined);
});
