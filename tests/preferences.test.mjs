import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, plain } from './load-module.mjs';

function setup(storage) {
  const values = new Map();
  const localStorage = storage ?? { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
  return { api: createLoader({globals:{localStorage}})('src/lib/preferences.ts'), values };
}
test('theme defaults to the system and explicit choices survive reloads',()=>{
  const {api,values}=setup();
  assert.equal(api.readThemePreference(),'system');
  api.saveThemePreference('dark');assert.equal(api.readThemePreference(),'dark');
  values.set(api.THEME_KEY,'invalid');assert.equal(api.readThemePreference(),'system');
});
test('sheet choices are isolated by account and tracker and contain no auth tokens',()=>{
  const {api,values}=setup();
  api.saveSheetChoice('one','habits',{id:'habit-1',name:'My habits'});
  api.saveSheetChoice('one','workouts',{id:'workout-1',name:'My workouts'});
  api.saveSheetChoice('two','habits',{id:'habit-2',name:'Other account'});
  assert.deepEqual(plain(api.readSheetChoices('one')),{habits:{id:'habit-1',name:'My habits'},workouts:{id:'workout-1',name:'My workouts'}});
  assert.equal(api.readSheetChoices('two').habits.id,'habit-2');
  assert.equal([...values.values()].some(value=>value.includes('token')),false);
  values.set('feros-tracker:sheets:one','{invalid');assert.deepEqual(plain(api.readSheetChoices('one')),{});
});
test('storage restrictions fall back to usable defaults without breaking the page',()=>{
  const {api}=setup({getItem:()=>{throw new Error('Blocked');},setItem:()=>{throw new Error('Blocked');}});
  assert.equal(api.readThemePreference(),'system');
  assert.doesNotThrow(()=>api.saveThemePreference('light'));
  assert.deepEqual(plain(api.readSheetChoices('one')),{});
  assert.equal(api.saveSheetChoice('one','habits',{id:'id',name:'Sheet'}),false);
});
test('Google Sheet links are parsed locally and other hosts and published URLs are rejected',()=>{
  const {api}=setup();
  for(const value of [' sheet-1 ','https://docs.google.com/spreadsheets/d/sheet-1/edit#gid=0','https://docs.google.com/spreadsheets/u/0/d/sheet-1/edit'])assert.equal(api.spreadsheetIdFromInput(value),'sheet-1');
  for(const value of ['','https://evil.test/spreadsheets/d/secret/edit','https://docs.google.com.evil.test/spreadsheets/d/secret/edit','http://docs.google.com/spreadsheets/d/id/edit','https://docs.google.com/spreadsheets/d/e/published/pubhtml'])assert.throws(()=>api.spreadsheetIdFromInput(value));
});
