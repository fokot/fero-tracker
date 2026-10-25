import test from 'node:test';
import assert from 'node:assert/strict';
import { plain } from './load-module.mjs';
import { setup } from './sheets-fixture.mjs';

const start=new Date(2026,9,1,12),end=new Date(2026,9,31,12);

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
test('an edit updates the correct column and physical row without touching adjacent habits',async()=>{
  const env=setup({rows:[['Date','Run','Read'],['2026-10-23','✓','2'],[],['2026-10-25','✓','5']]});
  await env.sheets.writeHabitValue('sheet-1','2026-10-25','Read','6');
  const update=env.calls.find((call)=>call.url.includes('values:batchUpdate'));
  assert.equal(update.body.data[0].range,'Habits!C4');
  assert.deepEqual(env.rows,[['Date','Run','Read'],['2026-10-23','✓','2'],[],['2026-10-25','✓','6']]);
});
test('two habits on a new date share one row, and rapid edits do not duplicate it',async()=>{
  const env=setup();
  await Promise.all([
    env.sheets.writeHabitValue('sheet-1','2026-10-25','Run','✓'),
    env.sheets.writeHabitValue('sheet-1','2026-10-25','Read','0'),
    env.sheets.writeHabitValue('sheet-1','2026-10-25','Run',''),
  ]);
  assert.deepEqual(env.rows,[['Date','Run','Read'],['2026-10-25','','0']]);
});
test('cleared cells and duplicate existing dates are updated consistently',async()=>{
  const env=setup({rows:[['Date','Run','Read'],['2026-10-25','✓','2'],['2026-10-25','✓','3']]});
  await env.sheets.writeHabitValue('sheet-1','2026-10-25','Run','');
  assert.deepEqual(env.rows,[['Date','Run','Read'],['2026-10-25','','2'],['2026-10-25','','3']]);
});
test('clearing an absent date makes no empty row; unknown habits are rejected',async()=>{
  const env=setup();
  await env.sheets.writeHabitValue('sheet-1','2026-10-25','Read','');
  assert.equal(env.rows.length,1);
  await assert.rejects(env.sheets.writeHabitValue('sheet-1','2026-10-25','Missing','5'),/missing/);
});
test('new habits append a header and metadata atomically and preserve existing data',async()=>{
  const env=setup({rows:[['Date','Run','Read'],['2026-10-25','✓','5']]});
  await env.sheets.saveHabit('sheet-1',{id:'sleep',name:'Sleep',type:'numeric'});
  assert.deepEqual(env.rows,[['Date','Run','Read','Sleep'],['2026-10-25','✓','5']]);
  assert.deepEqual(env.definitions.at(-1),['sleep','Sleep','numeric']);
  const batch=env.calls.find((call)=>call.body?.requests?.some((request)=>request.appendCells));
  assert.ok(batch.body.requests.some((request)=>request.updateCells));
  await assert.rejects(env.sheets.saveHabit('sheet-1',{id:'other',name:' sleep ',type:'boolean'}),/already exists/);
  const loaded=await env.sheets.loadHabitData('sheet-1',start,end);
  assert.equal(loaded.habits.find((habit)=>habit.name==='Sleep').type,'numeric');
});
test('failed new-habit batches leave both headers and metadata unchanged',async()=>{
  const env=setup({failBatch:true});
  await assert.rejects(env.sheets.saveHabit('sheet-1',{id:'sleep',name:'Sleep',type:'numeric'}),/batch failure/);
  assert.deepEqual(env.rows,[['Date','Run','Read']]);
  assert.equal(env.definitions.length,3);
});
test('column names and edits work beyond Z and expand a full sheet',async()=>{
  const names=Array.from({length:26},(_,i)=>`Habit ${i+1}`);
  const definitions=[['ID','Name','Type'],...names.map((name,i)=>[`${i}`,name,'numeric'])];
  const env=setup({rows:[['Date',...names.slice(0,25)]],definitions:definitions.slice(0,26),columns:26,rowCount:1});
  assert.equal(env.sheets.columnName(26),'Z');assert.equal(env.sheets.columnName(27),'AA');assert.equal(env.sheets.columnName(703),'AAA');
  await env.sheets.saveHabit('sheet-1',{id:'26',name:names[25],type:'numeric'});
  await env.sheets.writeHabitValue('sheet-1','2026-10-25',names[25],'5');
  await env.sheets.writeHabitValue('sheet-1','2026-10-25',names[25],'6');
  assert.equal(env.rows[1][26],'6');
  assert.equal(env.tabs[0].properties.gridProperties.columnCount,27);
  assert.equal(env.tabs[0].properties.gridProperties.rowCount,2);
  assert.ok(env.calls.some((call)=>call.body?.data?.some((entry)=>entry.range==='Habits!AA2')));
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
  const loaded=await env.sheets.loadHabitData('sheet-1',start,end);
  assert.equal(loaded.habits.find((habit)=>habit.name==='Read').type,'numeric');
  assert.equal(env.tabs.filter((sheet)=>sheet.properties.title.startsWith('Habits_Legacy_Backup')).length,1);
});
test('migration works during refresh and editing an already signed-in tracker',async()=>{
  const env=setup({rows:[['Date','Habit Name','Value'],['2026-10-25','Run','✓']],legacy:true,definitions:null});
  await env.sheets.writeHabitValue('sheet-1','2026-10-25','Run','');
  assert.deepEqual(env.rows,[['Date','Run'],['2026-10-25','']]);
  assert.deepEqual(env.definitions,[['ID','Name','Type'],['legacy:Run','Run','boolean']]);
  assert.equal(new Set(env.tabs.map((sheet)=>sheet.properties.sheetId)).size,3);
});
test('migration failures and invalid legacy rows never partially rewrite data',async()=>{
  const old=[['Date','Habit Name','Value'],['2026-10-25','Run','✓']];
  const failed=setup({rows:old,legacy:true,failBatch:true});
  await assert.rejects(failed.sheets.loadHabitData('sheet-1',start,end),/batch failure/);
  assert.deepEqual(failed.rows,old);assert.equal(failed.tabs.length,2);
  const invalid=setup({rows:[...old,['invalid','Run','✓']],legacy:true});
  await assert.rejects(invalid.sheets.loadHabitData('sheet-1',start,end),/invalid date/);
  assert.equal(invalid.calls.filter((call)=>call.method==='POST').length,0);
});
test('backup names do not overwrite an existing backup',async()=>{
  const extra={properties:{sheetId:2,title:'Habits_Legacy_Backup',gridProperties:{rowCount:1000,columnCount:26}},rows:[['keep']]};
  const env=setup({legacy:true,rows:[['Date','Habit Name','Value']],extraTabs:[extra]});
  await env.sheets.loadHabitData('sheet-1',start,end);
  assert.deepEqual(env.tabs.find((sheet)=>sheet.properties.title==='Habits_Legacy_Backup').rows,[['keep']]);
  assert.ok(env.tabs.some((sheet)=>sheet.properties.title==='Habits_Legacy_Backup_2'));
});
test('format marker distinguishes habit columns named Habit Name and Value from old data',async()=>{
  const env=setup({rows:[['Date','Habit Name','Value'],['2026-10-25','✓','3']],definitions:[['ID','Name','Type'],['one','Habit Name','boolean'],['two','Value','numeric']]});
  await env.sheets.loadHabitData('sheet-1',start,end);
  assert.equal(env.tabs.length,2);
  assert.equal(env.rows[1][2],'3');
});
test('legacy habits named Habit Name and Value migrate once and remain readable',async()=>{
  const env=setup({legacy:true,rows:[['Date','Habit Name','Value'],['2026-10-25','Habit Name','✓'],['2026-10-25','Value','3']],definitions:[['ID','Name','Type'],['one','Habit Name','boolean'],['two','Value','numeric']]});
  await env.sheets.loadHabitData('sheet-1',start,end);
  const loaded=await env.sheets.loadHabitData('sheet-1',start,end);
  assert.deepEqual(env.rows,[['Date','Habit Name','Value'],['2026-10-25','✓','3']]);
  assert.equal(loaded.habits.length,2);
  assert.equal(env.tabs.length,3);
});
test('loads only requested dates and preserves numeric type after all numbers are cleared',async()=>{
  const env=setup({rows:[['Date','Run','Read'],['2026-09-25','✓',''],['2026-10-25','','']]});
  const loaded=await env.sheets.loadHabitData('sheet-1',start,end);
  assert.equal(loaded.habits.find((habit)=>habit.name==='Read').type,'numeric');
  assert.equal(loaded.values.length,2);
  assert.ok(loaded.values.every((value)=>value.date==='2026-10-25'));
});
test('queued writes never start under a different login',async()=>{
  const env=setup();const pending=env.sheets.writeHabitValue('sheet-1','2026-10-25','Run','✓');env.signOut();
  await assert.rejects(pending);assert.equal(env.calls.length,0);
});
test('repeat sign-in reuses the sheet; new sheets begin with only the Date header',async()=>{
  const existing=setup();assert.equal(await existing.sheets.getOrCreateUserSheet('test@example.com'),'sheet-1');
  assert.equal(existing.calls.filter((call)=>call.method==='POST').length,0);
  const fresh=setup({existing:null});assert.equal(await fresh.sheets.getOrCreateUserSheet('test@example.com'),'new-sheet');
  assert.deepEqual(fresh.rows,[['Date']]);
  const failed=setup({failDrive:true});await assert.rejects(failed.sheets.getOrCreateUserSheet('test@example.com'),/Drive unavailable/);assert.equal(failed.calls.length,1);
});
