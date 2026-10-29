import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLoader, plain } from './load-module.mjs';

for (const catalog of ['app','site']) test(`${catalog} messages have matching keys, values and interpolation parameters`,()=>{
  const sk=JSON.parse(fs.readFileSync(new URL(`../messages/${catalog}.sk.json`,import.meta.url)));
  const en=JSON.parse(fs.readFileSync(new URL(`../messages/${catalog}.en.json`,import.meta.url)));
  assert.deepEqual(Object.keys(sk).sort(),Object.keys(en).sort());
  for(const key of Object.keys(sk)) {
    assert.ok(sk[key].trim()&&en[key].trim(),key);
    const parameters=value=>[...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    assert.deepEqual(parameters(sk[key]),parameters(en[key]),key);
    assert.ok(!/<script|\bon\w+\s*=|javascript:/i.test(sk[key]+en[key]),key);
  }
});
function setup({saved=null,languages=['en-GB'],blocked=false}={}){
  const storage=new Map(saved?[['fero-tracker:locale',saved]]:[]),events=new Map();
  const localStorage={getItem:key=>{if(blocked)throw Error('Blocked');return storage.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('Blocked');storage.set(key,value);}};
  const document={documentElement:{lang:''}};
  const load=createLoader({locale:null,globals:{localStorage,navigator:{languages},document,window:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}}});
  return {load,locale:load('src/i18n/locale.ts'),storage,events,document};
}
test('language chooses a saved preference, then a supported browser language, with Slovak fallback',()=>{
  assert.equal(setup().locale.getLocale(),'en');
  assert.equal(setup({saved:'sk'}).locale.getLocale(),'sk');
  assert.equal(setup({saved:'bad',languages:['de-DE','sk-SK','en']}).locale.getLocale(),'sk');
  assert.equal(setup({languages:['fr']}).locale.getLocale(),'sk');
  assert.equal(setup({languages:['enochian','skew']}).locale.getLocale(),'sk');
});
test('switching persists across reload, updates document language and follows other tabs without overwriting records',()=>{
  const env=setup();env.storage.set('feros-tracker:session','record');const stop=env.locale.startLocale();
  let changes=0;const unsubscribe=env.locale.subscribeLocale(()=>changes++);
  env.locale.setLocale('sk');assert.equal(env.document.documentElement.lang,'sk');assert.equal(env.storage.get('fero-tracker:locale'),'sk');assert.equal(changes,1);
  assert.equal(setup({saved:env.storage.get('fero-tracker:locale')}).locale.getLocale(),'sk');
  env.storage.set('fero-tracker:locale','en');env.events.get('storage')({key:'fero-tracker:locale'});assert.equal(env.locale.getLocale(),'en');assert.equal(env.document.documentElement.lang,'en');
  env.storage.set('fero-tracker:locale','sk');env.events.get('storage')({key:'unrelated'});assert.equal(env.locale.getLocale(),'en');
  assert.equal(env.storage.get('feros-tracker:session'),'record');
  unsubscribe();stop();assert.equal(env.events.size,0);
});
test('blocked storage still allows switching, translations, plurals and existing error messages',()=>{
  const env=setup({blocked:true});const messages=env.load('src/i18n/messages.ts');
  const error=messages.t('error.addSet');assert.equal(error,'Add at least one set.');
  env.locale.setLocale('sk');assert.equal(messages.translateError(error),'Pridaj aspoň jednu sériu.');
  assert.equal(messages.translateError('External Google detail'),'External Google detail');
  assert.equal(messages.t('workouts.repsLabel',{number:3}),'Séria 3: opakovania');
  assert.equal(messages.plural('exercise',1),'cvik');assert.equal(messages.plural('exercise',2),'cviky');assert.equal(messages.plural('exercise',5),'cvikov');
  env.locale.setLocale('en');assert.equal(messages.plural('exercise',1),'exercise');assert.equal(messages.plural('exercise',2),'exercises');assert.equal(messages.plural('set',5),'sets');
  assert.equal(env.locale.interpolate('{name}: {value}',{name:'$&',value:0}),'$&: 0');
});
test('both languages keep spreadsheet identifiers, codecs and serialization stable',()=>{
  const env=setup();const schema=env.load('src/lib/trackerSchema.ts'),workouts=env.load('src/lib/workouts.ts');
  for(const locale of ['en','sk']){
    env.locale.setLocale(locale);
    const definition=schema.trackerDefinition('workouts','file');assert.equal(definition.sheet,'Workouts');assert.equal(definition.dynamic.sheet,'WorkoutDefinitions');assert.equal(definition.dynamic.defaultType,'sets');
    assert.equal(schema.trackerDefinition('habits','file').sheet,'Habits');
    assert.equal(workouts.formatWorkoutSets([{reps:5,weight:62.5}]),'5×62.5');
    assert.deepEqual(plain(workouts.parseWorkoutSets('5×62.5')),[{reps:5,weight:62.5}]);
  }
});
test('forms, installation instructions and appearance render their selected-language messages',()=>{
  const env=setup();
  const Appearance=env.load('src/components/Appearance.tsx').Appearance;
  const InstallApp=env.load('src/components/InstallApp.tsx').InstallApp;
  const WorkoutEditor=env.load('src/components/WorkoutEditor.tsx').WorkoutEditor;
  const ManageItemModal=env.load('src/components/ManageItemModal.tsx').ManageItemModal;
  for(const locale of ['en','sk']){
    env.locale.setLocale(locale);
    const appearance=renderToStaticMarkup(React.createElement(Appearance));assert.ok(appearance.includes(locale==='en'?'Appearance':'Vzhľad'));
    const install=renderToStaticMarkup(React.createElement(InstallApp));assert.ok(install.includes(locale==='en'?'How to add':'Ako pridať'));
    const editor=renderToStaticMarkup(React.createElement(WorkoutEditor,{date:'2026-10-29',name:'My own name',initialSets:[{reps:5,weight:60}],exercises:[],busy:false,onSave:async()=>true,onClose:()=>{}}));
    assert.ok(editor.includes('My own name'));assert.ok(editor.includes(locale==='en'?'Save sets':'Uložiť série'));assert.ok(editor.includes(locale==='en'?'Set 1: repetitions':'Séria 1: opakovania'));
    const manage=renderToStaticMarkup(React.createElement(ManageItemModal,{name:'My habit',kind:'habit',renameHelp:'',deleteHelp:'',deleteLabel:'',busy:false,onRename:async()=>{},onDelete:async()=>{},onClose:()=>{}}));assert.ok(manage.includes(locale==='en'?'Edit habit':'Upraviť návyk'));
  }
});
