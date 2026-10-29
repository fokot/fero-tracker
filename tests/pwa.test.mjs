import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './load-module.mjs';

function setup({ prod=true, base='/fero-tracker/', standalone=false, apple=false, loaded=false, controlled=false }={}) {
  const events=new Map(), registrations=[]; let updates=0, reloads=0, dialog=false; const display={matches:standalone,addEventListener:(name,fn)=>events.set(`media:${name}`,fn),removeEventListener:name=>events.delete(`media:${name}`)};
  const window={location:{reload:()=>reloads++},matchMedia:()=>display,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const navigator={standalone:apple,serviceWorker:{controller:controlled?{}:null,addEventListener:(name,fn)=>events.set(`worker:${name}`,fn),removeEventListener:name=>events.delete(`worker:${name}`),register:async(url,options)=>{registrations.push({url,...options});return {update:async()=>updates++};}}};
  const document={readyState:loaded?'complete':'loading',visibilityState:'visible',querySelector:()=>dialog?{}:null,addEventListener:(name,fn)=>events.set(`document:${name}`,fn),removeEventListener:name=>events.delete(`document:${name}`)};
  const pwa=createLoader({globals:{window,navigator,document},env:{PROD:prod,BASE_URL:base}})('src/lib/pwa.ts');
  const stop=pwa.startPwa();
  return {events,registrations,pwa,display,stop,navigator, get updates(){return updates;}, get reloads(){return reloads;},set dialog(value){dialog=value;}};
}
test('PWA registration honors production base and scope, including late loading',()=>{
  const env=setup();assert.equal(env.registrations.length,0);env.events.get('load')();
  assert.equal(env.registrations[0].url,'/fero-tracker/sw.js');assert.equal(env.registrations[0].scope,'/fero-tracker/');
  const root=setup({base:'/',loaded:true});assert.equal(root.registrations[0].url,'/sw.js');
  const dev=setup({prod:false,loaded:true});assert.equal(dev.registrations.length,0);
});
test('install prompt is retained until consumed, installation hides it, and listeners clean up',()=>{
  const env=setup();let prevented=false;
  const event={preventDefault:()=>{prevented=true;},prompt:async()=>{}};
  env.events.get('beforeinstallprompt')(event);
  assert.ok(prevented);assert.equal(env.pwa.useInstallStore.getState().prompt,event);
  env.events.get('appinstalled')();assert.equal(env.pwa.useInstallStore.getState().prompt,null);assert.equal(env.pwa.useInstallStore.getState().installed,true);
  env.stop();assert.equal(env.events.size,0);
});
test('standalone display and Apple standalone modes suppress installation instructions',()=>{
  assert.equal(setup({standalone:true}).pwa.useInstallStore.getState().installed,true);
  assert.equal(setup({apple:true}).pwa.useInstallStore.getState().installed,true);
  const env=setup();assert.equal(env.pwa.useInstallStore.getState().installed,false);
  env.display.matches=true;env.events.get('media:change')();assert.equal(env.pwa.useInstallStore.getState().installed,true);
});

test('new controllers expose an update notice without reloading, while first installation stays quiet',()=>{
  const first=setup();first.navigator.serviceWorker.controller={};first.events.get('worker:controllerchange')();assert.equal(first.pwa.useUpdateStore.getState().available,false);
  const previous=setup({controlled:true});previous.events.get('worker:controllerchange')();assert.equal(previous.pwa.useUpdateStore.getState().available,true);assert.equal(previous.reloads,0);
});
test('returning to the foreground checks for updates, throttled and cleaned up on disposal',async()=>{
  const env=setup({loaded:true});await Promise.resolve();await Promise.resolve();
  env.events.get('document:visibilitychange')();assert.equal(env.updates,1);
  env.events.get('online')();assert.equal(env.updates,1);
  env.stop();assert.equal(env.events.size,0);
});
test('explicit reload protects open editors and unfinished local writes',()=>{
  const env=setup();env.dialog=true;assert.equal(env.pwa.reloadUpdatedApp(false),false);assert.equal(env.reloads,0);
  env.dialog=false;assert.equal(env.pwa.reloadUpdatedApp(true),false);assert.equal(env.reloads,0);
  assert.equal(env.pwa.reloadUpdatedApp(false),true);assert.equal(env.reloads,1);
});
