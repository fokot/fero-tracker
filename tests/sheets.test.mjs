import test from 'node:test';
import assert from 'node:assert/strict';
import { plain } from './load-module.mjs';
import { setup } from './sheets-fixture.mjs';



test('matrix reader retains row positions, gaps, zero and cleared trailing values',()=>{
  const {sheets}=setup();
  const result=sheets.parseHabitRows([['Date','Run','Read'],['2026-10-23','✓','0'],[],['2026-10-25']]);
  assert.deepEqual(plain(result),[
    {row:2,date:'2026-10-23',habitName:'Run',value:'✓'},
    {row:2,date:'2026-10-23',habitName:'Read',value:'0'},
    {row:4,date:'2026-10-25',habitName:'Run',value:''},
    {row:4,date:'2026-10-25',habitName:'Read',value:''},
  ]);
});
test('legacy migration pivots dates, preserves last values and unused habits, and backs up the original',async()=>{
  const old=[['Date','Habit Name','Value'],['2026-10-26','Run','✓'],['2026-10-25','Read','0'],['2026-10-25','Run','✓'],['2026-10-25','Run']];
  const env=setup({rows:old,legacy:true,definitions:[['ID','Name','Type'],['sleep','Sleep','numeric']]});
  await env.sheets.getOrCreateUserSheet('test@example.com');
  assert.deepEqual(env.rows,[['Date','Sleep','Run','Read'],['2026-10-25','','','0'],['2026-10-26','','✓','']]);
  const backup=env.tabs.find((sheet)=>sheet.properties.title==='Habits_Legacy_Backup');
  assert.deepEqual(backup.rows,old);
  assert.equal(env.tabs[0].properties.sheetId,0);
  const migration=env.calls.find((call)=>call.body?.requests?.some((request)=>request.duplicateSheet));
  assert.ok(migration.body.requests.some((request)=>request.updateCells?.range?.sheetId===0));
  await env.sheets.connectHabitSheet('sheet-1');
  assert.equal(env.definitions.find(row=>row[1]==='Read')[2],'numeric');
  assert.equal(env.tabs.filter((sheet)=>sheet.properties.title.startsWith('Habits_Legacy_Backup')).length,1);
});
test('migration failures and invalid legacy rows never partially rewrite data',async()=>{
  const old=[['Date','Habit Name','Value'],['2026-10-25','Run','✓']];
  const failed=setup({rows:old,legacy:true,failBatch:true});
  await assert.rejects(failed.sheets.connectHabitSheet('sheet-1'),/batch failure/);
  assert.deepEqual(failed.rows,old);assert.equal(failed.tabs.length,2);
  const invalid=setup({rows:[...old,['invalid','Run','✓']],legacy:true});
  await assert.rejects(invalid.sheets.connectHabitSheet('sheet-1'),/invalid date/);
  assert.equal(invalid.calls.filter((call)=>call.method==='POST').length,0);
});
test('backup names do not overwrite an existing backup',async()=>{
  const extra={properties:{sheetId:2,title:'Habits_Legacy_Backup',gridProperties:{rowCount:1000,columnCount:26}},rows:[['keep']]};
  const env=setup({legacy:true,rows:[['Date','Habit Name','Value']],extraTabs:[extra]});
  await env.sheets.connectHabitSheet('sheet-1');
  assert.deepEqual(env.tabs.find((sheet)=>sheet.properties.title==='Habits_Legacy_Backup').rows,[['keep']]);
  assert.ok(env.tabs.some((sheet)=>sheet.properties.title==='Habits_Legacy_Backup_2'));
});
test('format marker distinguishes habit columns named Habit Name and Value from old data',async()=>{
  const env=setup({rows:[['Date','Habit Name','Value'],['2026-10-25','✓','3']],definitions:[['ID','Name','Type'],['one','Habit Name','boolean'],['two','Value','numeric']]});
  await env.sheets.connectHabitSheet('sheet-1');
  assert.equal(env.tabs.length,2);
  assert.equal(env.rows[1][2],'3');
});
test('legacy habits named Habit Name and Value migrate once and remain readable',async()=>{
  const env=setup({legacy:true,rows:[['Date','Habit Name','Value'],['2026-10-25','Habit Name','✓'],['2026-10-25','Value','3']],definitions:[['ID','Name','Type'],['one','Habit Name','boolean'],['two','Value','numeric']]});
  await env.sheets.connectHabitSheet('sheet-1');
  await env.sheets.connectHabitSheet('sheet-1');
  assert.deepEqual(env.rows,[['Date','Habit Name','Value'],['2026-10-25','✓','3']]);
  assert.equal(env.definitions.length,3);
  assert.equal(env.tabs.length,3);
});
test('repeat sign-in reuses the sheet; new sheets begin with only the Date header',async()=>{
  const existing=setup();assert.equal(await existing.sheets.getOrCreateUserSheet('test@example.com'),'sheet-1');
  assert.equal(existing.calls.filter((call)=>call.method==='POST').length,0);
  const fresh=setup({existing:null});assert.equal(await fresh.sheets.getOrCreateUserSheet('test@example.com'),'new-sheet');
  assert.deepEqual(fresh.rows,[['Date']]);
  const failed=setup({failDrive:true});await assert.rejects(failed.sheets.getOrCreateUserSheet('test@example.com'),/Drive unavailable/);assert.equal(failed.calls.length,1);
});
test('connecting a chosen file adds only missing tracker tabs and preserves unrelated data', async()=>{
  const env=setup({sheetName:'Notes',definitions:null,rows:[['Private notes'],['Keep me']]});
  await env.sheets.connectHabitSheet('sheet-1');
  assert.deepEqual(env.rows,[['Private notes'],['Keep me']]);
  assert.deepEqual(env.tabs.find(tab=>tab.properties.title==='Habits').rows,[['Date']]);
  assert.deepEqual(env.definitions,[['ID','Name','Type']]);
});
test('connecting an empty Habits tab initializes it, but incompatible populated tabs are not overwritten',async()=>{
  const empty=setup({rows:[],definitions:null});await empty.sheets.connectHabitSheet('sheet-1');assert.deepEqual(empty.rows,[['Date']]);
  const invalid=setup({rows:[['Do not change'],['data']]});const before=plain(invalid.tabs);
  await assert.rejects(invalid.sheets.connectHabitSheet('sheet-1'),/first Habits column/);
  assert.deepEqual(invalid.tabs,before);
  const failure=setup({sheetName:'Notes',definitions:null,rows:[['Keep']],failBatch:true});
  await assert.rejects(failure.sheets.connectHabitSheet('sheet-1'),/Cannot reach Google/);assert.deepEqual(failure.rows,[['Keep']]);
});
test('an unrelated HabitDefinitions tab is rejected before any tracker tab is added or changed',async()=>{
  const env=setup({sheetName:'Notes',rows:[['Keep notes']],definitions:[['Other data'],['Keep this too']]});
  const before=plain(env.tabs);
  await assert.rejects(env.sheets.connectHabitSheet('sheet-1'),/HabitDefinitions má iný formát/);
  assert.deepEqual(env.tabs,before);
});
