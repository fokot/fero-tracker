import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-module.mjs';

function setup(initial=null,systemDark=false) {
  const listeners=new Map(),windowListeners=new Map();
  let stored=initial,meta;
  const media={matches:systemDark,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const document={documentElement:{dataset:{}},querySelector:()=>({setAttribute:(name,value)=>meta=value})};
  const load=createLoader({globals:{localStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value},document,window:{matchMedia:()=>media,addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)}}});
  const api=load('src/lib/theme.ts'),store=load('src/store/useAppearanceStore.ts').useAppearanceStore;
  return {api,store,document,media,listeners,windowListeners,get meta(){return meta;},get stored(){return stored;}};
}
test('system mode follows live OS changes, while manual choice overrides them',()=>{
  const env=setup(null,true),stop=env.api.startTheme();
  assert.equal(env.document.documentElement.dataset.theme,'dark');assert.equal(env.meta,'#0f1724');
  env.media.matches=false;env.listeners.get('change')();assert.equal(env.document.documentElement.dataset.theme,'light');
  env.store.getState().setPreference('dark');assert.equal(env.stored,'dark');
  env.listeners.get('change')();assert.equal(env.document.documentElement.dataset.theme,'dark');
  env.store.getState().setPreference('system');assert.equal(env.document.documentElement.dataset.theme,'light');
  stop();assert.equal(env.listeners.size,0);assert.equal(env.windowListeners.size,0);
});
test('saved light preference overrides a dark system and changes from another tab are applied',()=>{
  const env=setup('light',true),stop=env.api.startTheme();
  assert.equal(env.document.documentElement.dataset.theme,'light');
  env.windowListeners.get('storage')({key:'unrelated',newValue:'dark'});assert.equal(env.document.documentElement.dataset.theme,'light');
  env.windowListeners.get('storage')({key:'feros-tracker:theme',newValue:'dark'});assert.equal(env.document.documentElement.dataset.theme,'dark');
  env.windowListeners.get('storage')({key:null,newValue:null});assert.equal(env.store.getState().preference,'system');
  stop();
});
