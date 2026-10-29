import test from 'node:test';
import assert from 'node:assert/strict';
import {plain} from './load-module.mjs';
import {setup} from './sheets-fixture.mjs';

test('repeat sign-in reuses the sheet and new spreadsheets start with a blank Date table',async()=>{
  const existing=setup();assert.equal(await existing.sheets.getOrCreateUserSheet('test@example.com'),'sheet-1');
  assert.equal(existing.calls.filter(call=>call.method==='POST').length,0);
  const fresh=setup({existing:null});assert.equal(await fresh.sheets.getOrCreateUserSheet('test@example.com'),'new-sheet');
  assert.deepEqual(fresh.rows,[['Date']]);assert.deepEqual(fresh.tabs.map(tab=>tab.properties.title),['Habits']);
  const failed=setup({failDrive:true});await assert.rejects(failed.sheets.getOrCreateUserSheet('test@example.com'),/Drive unavailable/);assert.equal(failed.calls.length,1);
});
test('connecting a chosen file creates the current Sheetbase schema and preserves unrelated sheets',async()=>{
  const env=setup({sheetName:'Notes',definitions:null,rows:[['Private notes'],['Keep me']]});await env.sheets.connectHabitSheet('sheet-1');
  assert.deepEqual(env.rows,[['Private notes'],['Keep me']]);assert.deepEqual(env.tabs.find(tab=>tab.properties.title==='Habits').rows,[['Date']]);
  assert.deepEqual(env.definitions,[['ID','Name','Type']]);
});
test('an empty habit table initializes without a format marker or data conversion',async()=>{
  const env=setup({rows:[],definitions:null});await env.sheets.connectHabitSheet('sheet-1');
  assert.deepEqual(env.rows,[['Date']]);assert.deepEqual(env.definitions,[['ID','Name','Type']]);
  assert.ok(env.calls.filter(call=>call.body).every(call=>call.body.requests.every(request=>!request.duplicateSheet&&!request.createDeveloperMetadata)));
});
test('incompatible headers, metadata and duplicate dates are rejected without rewriting populated data',async()=>{
  const invalid=setup({rows:[['Do not change'],['data']]});const before=plain(invalid.tabs);
  await assert.rejects(invalid.sheets.connectHabitSheet('sheet-1'),/Column A/);assert.deepEqual(invalid.tabs,before);
  const metadata=setup({definitions:[['Other data'],['Keep this']]});const saved=plain(metadata.tabs);
  await assert.rejects(metadata.sheets.connectHabitSheet('sheet-1'),/definitions must start/);assert.deepEqual(metadata.tabs,saved);
  const duplicate=setup({rows:[['Date','Run','Read'],['day','✓','0'],['day','','1']]});
  await assert.rejects(duplicate.sheets.connectHabitSheet('sheet-1'),/Duplicate row key/);assert.equal(duplicate.calls.filter(call=>call.method==='POST').length,0);
});
test('failed initialization and a canceled account cannot change a connection',async()=>{
  const failure=setup({sheetName:'Notes',definitions:null,rows:[['Keep']],failBatch:true});await assert.rejects(failure.sheets.connectHabitSheet('sheet-1'),/Cannot reach Google/);assert.deepEqual(failure.rows,[['Keep']]);
  const canceled=setup();const pending=canceled.sheets.connectHabitSheet('sheet-1');canceled.signOut();await assert.rejects(pending);assert.equal(canceled.calls.length,0);
});
