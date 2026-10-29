import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './load-module.mjs';

function setup({ prod=true, base='/fero-tracker/', standalone=false, apple=false, loaded=false }={}) {
  const events=new Map(), registrations=[], display={matches:standalone,addEventListener:(name,fn)=>events.set(`media:${name}`,fn),removeEventListener:name=>events.delete(`media:${name}`)};
  const window={matchMedia:()=>display,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const navigator={standalone:apple,serviceWorker:{register:async(url,options)=>{registrations.push({url,...options});}}};
  const document={readyState:loaded?'complete':'loading'};
  const pwa=createLoader({globals:{window,navigator,document},env:{PROD:prod,BASE_URL:base}})('src/lib/pwa.ts');
  const stop=pwa.startPwa();
  return {events,registrations,pwa,display,stop};
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
