import { googleRequest } from './googleApi';
import { connectHabitSheet, parseHabitRows } from './googleSheets';
import { batch, rowData, serialize, sheetUrl, type SheetProperties, type Sheet } from './googleSheetsClient';
import { isDateKey } from './dates';
import { formatWorkoutSets, parseWorkoutSets } from './workouts';
import { applyChange, type LocalOperation, type TrackerData, type HabitData, type WorkoutData } from './localModel';
import type { TrackerKind } from './preferences';
import { compactOperations } from './operationQueue';

const LEDGER = 'FeroTrackerSync';
interface RemoteTab { properties: SheetProperties; rows: string[][] }
export interface RemoteSnapshot { tabs: RemoteTab[]; data: TrackerData; batches: Set<string> }
interface GridSheet extends Sheet { data?: { startRow?: number; startColumn?: number; rowData?: { values?: { formattedValue?: string; userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean } }[] }[] }[] }
const metadata = new Map<string, { expires: number; sheets: Sheet[] }>();
export function invalidateRemote(id: string) { metadata.delete(id); }

export function dataFromTabs(tabs: RemoteTab[], kind: TrackerKind): TrackerData {
  const rows = tabs.find((tab) => tab.properties.title === (kind === 'habits' ? 'Habits' : 'Workouts'))?.rows;
  if (!rows || rows[0]?.[0] !== 'Date') throw new Error('Tabuľka má neplatnú hlavičku. Prvý stĺpec musí byť Date.');
  const names = rows[0].slice(1);
  if (names.some((name) => !name.trim()) || new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error('Názvy v tabuľke musia byť jedinečné a neprázdne.');
  if (kind === 'habits') {
    const definitions = tabs.find((tab) => tab.properties.title === 'HabitDefinitions')?.rows ?? [];
    const habits = names.map((name) => {
      const entry = definitions.slice(1).find((row) => row[1] === name && (row[2] === 'numeric' || row[2] === 'boolean'));
      if (!entry?.[0]) throw new Error('Definícia návyku chýba. Obnov tabuľku v nastaveniach.');
      return { id: entry[0], name, type: entry[2] as 'numeric' | 'boolean' };
    });
    if (new Set(habits.map((habit) => habit.id)).size !== habits.length) throw new Error('Návyky v HabitDefinitions musia mať jedinečné ID. Oprav ich v Google Sheete a obnov synchronizáciu.');
    const values: HabitData['values'] = Object.create(null);
    for (const entry of parseHabitRows(rows)) { values[entry.date] ??= Object.create(null); values[entry.date][entry.habitName] = entry.value; }
    return { kind, habits, values };
  }
  const days: WorkoutData['days'] = Object.create(null);
  for (const row of rows.slice(1)) if (isDateKey(row[0] ?? '')) {
    const day = Object.create(null);
    names.forEach((name, column) => { if (row[column + 1]?.trim()) day[name] = parseWorkoutSets(row[column + 1]); });
    days[row[0]] = day;
  }
  return { kind, exercises: names, days };
}

async function fetchTabs(id: string, kind: TrackerKind, indexOnly = false): Promise<{ tabs: RemoteTab[]; sheets: GridSheet[] }> {
  let meta = metadata.get(id);
  if (!meta || meta.expires < Date.now()) {
    const result = await googleRequest<{ sheets: Sheet[] }>(`${sheetUrl(id)}?fields=sheets(properties)`);
    meta = { sheets: result.sheets, expires: Date.now() + 30000 }; metadata.set(id, meta);
  }
  const titles = [kind === 'habits' ? 'Habits' : 'Workouts', ...(kind === 'habits' ? ['HabitDefinitions'] : []), LEDGER];
  const query = new URLSearchParams({ fields: 'sheets(properties,developerMetadata(metadataKey,metadataValue),data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue))))' });
  for (const title of titles) if (meta.sheets.some((tab) => tab.properties.title === title)) {
    const ranges = !indexOnly ? [`'${title}'`] : title === LEDGER ? [`'${title}'!A:A`, `'${title}'!B1`]
      : title === 'HabitDefinitions' ? [`'${title}'!A:C`] : [`'${title}'!1:1`, `'${title}'!A2:A`];
    for (const range of ranges) query.append('ranges', range);
  }
  if (!query.has('ranges')) throw new Error('V Google Sheete chýba list trackera. Vyber alebo oprav tabuľku v nastaveniach.');
  let response: { sheets: GridSheet[] };
  try { response = await googleRequest(`${sheetUrl(id)}?${query}`); }
  catch (error) { invalidateRemote(id); throw error; }
  const tabs: RemoteTab[] = meta.sheets.map(({ properties }) => ({ properties: structuredClone(properties), rows: [] }));
  for (const sheet of response.sheets) {
    let tab = tabs.find((entry) => entry.properties.title === sheet.properties.title);
    if (!tab) { tab = { properties: sheet.properties, rows: [] }; tabs.push(tab); }
    tab.properties = structuredClone(sheet.properties);
    for (const grid of sheet.data ?? []) (grid.rowData ?? []).forEach((row, index) => {
      const values = tab!.rows[(grid.startRow ?? 0) + index] ??= [];
      (row.values ?? []).forEach((cell, column) => {
        const value = cell.userEnteredValue;
        values[(grid.startColumn ?? 0) + column] = value?.stringValue ?? (value?.numberValue !== undefined ? String(value.numberValue) : value?.boolValue !== undefined ? String(value.boolValue) : cell.formattedValue ?? '');
      });
    });
    while (tab.rows.length && !tab.rows[tab.rows.length - 1]?.some((value) => value !== '')) tab.rows.pop();
    tab.rows = Array.from({ length: tab.rows.length }, (_, index) => tab!.rows[index] ?? []);
    for (const row of tab.rows) { while (row.length && row[row.length - 1] === '') row.pop(); }
  }
  return { tabs, sheets: response.sheets };
}

function readBatches(tabs: RemoteTab[]): Set<string> {
  const ledger = tabs.find((tab) => tab.properties.title === LEDGER);
  if (ledger?.rows.length && (ledger.rows[0][0] !== 'Batch ID' || ledger.rows[0][1] !== 'Saved at')) throw new Error('List FeroTrackerSync má neplatný formát. Záznamy v zariadení zostali zachované.');
  return new Set(ledger?.rows.slice(1).map((row) => row[0]) ?? []);
}

export async function readRemote(id: string, kind: TrackerKind, repaired = false): Promise<RemoteSnapshot> {
  const { tabs, sheets } = await fetchTabs(id, kind);
  if (kind === 'habits' && !repaired) {
    const primary = tabs.find((tab) => tab.properties.title === 'Habits');
    const defs = tabs.find((tab) => tab.properties.title === 'HabitDefinitions');
    const marked = sheets.find((tab) => tab.properties.title === 'Habits')?.developerMetadata?.some((entry) => entry.metadataKey === 'feros-tracker-layout' && entry.metadataValue === 'date-rows-v1');
    if (!defs || JSON.stringify(defs.rows[0]?.slice(0, 3)) !== JSON.stringify(['ID', 'Name', 'Type']) || (!marked && JSON.stringify(primary?.rows[0]) === JSON.stringify(['Date', 'Habit Name', 'Value'])) || primary?.rows[0]?.slice(1).some((name) => !defs.rows.some((row) => row[1] === name))) {
      await connectHabitSheet(id); invalidateRemote(id); return readRemote(id, kind, true);
    }
  }
  return { tabs, data: dataFromTabs(tabs, kind), batches: readBatches(tabs) };
}

export function planRemote(snapshot: RemoteSnapshot, operations: LocalOperation[], batchId: string): { requests: unknown[]; data: TrackerData } {
  if (snapshot.batches.has(batchId)) return { requests: [], data: snapshot.data };
  const tabs = structuredClone(snapshot.tabs), requests: unknown[] = [];
  let data = snapshot.data;
  const table = tabs.find((tab) => tab.properties.title === (data.kind === 'habits' ? 'Habits' : 'Workouts'))!;
  const definitions = tabs.find((tab) => tab.properties.title === 'HabitDefinitions');
  const grow = (tab: RemoteTab, rows: number, columns: number) => {
    for (const [dimension, key, needed] of [['ROWS', 'rowCount', rows], ['COLUMNS', 'columnCount', columns]] as const) if (needed > tab.properties.gridProperties[key]) {
      requests.push({ appendDimension: { sheetId: tab.properties.sheetId, dimension, length: needed - tab.properties.gridProperties[key] } });
      tab.properties.gridProperties[key] = needed;
    }
  };
  const write = (tab: RemoteTab, row: number, column: number, value: string) => {
    if ((tab.rows[row]?.[column] ?? '') === value) return;
    grow(tab, row + 1, column + 1);
    requests.push({ updateCells: { start: { sheetId: tab.properties.sheetId, rowIndex: row, columnIndex: column }, rows: rowData([[value]]), fields: 'userEnteredValue' } });
    tab.rows[row] ??= []; tab.rows[row][column] = value;
  };
  const writeDate = (date: string, column: number, value: string) => {
    let rows = table.rows.flatMap((row, index) => index > 0 && row[0] === date ? [index] : []);
    if (!rows.length && value) { const row = table.rows.length; write(table, row, 0, date); rows = [row]; }
    for (const row of rows) write(table, row, column, value);
  };
  for (const { change } of operations) {
    const before = data, next = applyChange(data, change);
    if (before.kind === 'habits' && next.kind === 'habits' && definitions) {
      if (change.type === 'habit-add' && !before.habits.some((habit) => habit.id === change.habit.id)) {
        const habit = next.habits.find((entry) => entry.id === change.habit.id)!;
        write(table, 0, table.rows[0].length, habit.name);
        const row = Math.max(1, definitions.rows.length);
        write(definitions, row, 0, habit.id); write(definitions, row, 1, habit.name); write(definitions, row, 2, habit.type);
      }
      if (change.type === 'habit-value' || change.type === 'habit-rename' || change.type === 'habit-delete') {
        const habit = before.habits.find((entry) => entry.id === change.habitId);
        if (habit) {
          const column = table.rows[0].indexOf(habit.name, 1);
          if (column < 1) throw new Error('Stĺpec návyku chýba. Zmeny zostali v zariadení.');
          const metadataRows = definitions.rows.flatMap((row, index) => index > 0 && row[1] === habit.name ? [index] : []);
          if (change.type === 'habit-value') writeDate(change.date, column, change.value.trim());
          else if (change.type === 'habit-rename') {
            write(table, 0, column, change.name.trim()); for (const row of metadataRows) write(definitions, row, 1, change.name.trim());
          } else {
            requests.push({ deleteDimension: { range: { sheetId: table.properties.sheetId, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 } } });
            for (const row of table.rows) row.splice(column, 1); table.properties.gridProperties.columnCount--;
            for (const row of metadataRows.sort((a, b) => b - a)) {
              requests.push({ deleteDimension: { range: { sheetId: definitions.properties.sheetId, dimension: 'ROWS', startIndex: row, endIndex: row + 1 } } });
              definitions.rows.splice(row, 1); definitions.properties.gridProperties.rowCount--;
            }
          }
        }
      }
    } else if (before.kind === 'workouts' && next.kind === 'workouts') {
      if (change.type === 'workout-sets') {
        const name = next.exercises.find((entry) => entry.toLowerCase() === change.name.trim().toLowerCase())!;
        let column = table.rows[0].indexOf(name, 1);
        if (column < 1) { column = table.rows[0].length; write(table, 0, column, name); }
        writeDate(change.date, column, formatWorkoutSets(change.sets));
      } else if (change.type === 'workout-rename') write(table, 0, table.rows[0].indexOf(change.previousName, 1), change.name.trim());
    }
    data = next;
  }
  let ledger = tabs.find((tab) => tab.properties.title === LEDGER);
  if (!ledger) {
    ledger = { properties: { sheetId: Math.max(-1, ...tabs.map((tab) => tab.properties.sheetId)) + 1, title: LEDGER, gridProperties: { rowCount: 1000, columnCount: 2 } }, rows: [] };
    requests.push({ addSheet: { properties: { ...ledger.properties, hidden: true } } }); tabs.push(ledger);
  }
  write(ledger, 0, 0, 'Batch ID'); write(ledger, 0, 1, 'Saved at');
  const row = Math.max(1, ledger.rows.length);
  write(ledger, row, 0, batchId); write(ledger, row, 1, new Date().toISOString());
  return { requests, data };
}

// Existing columns need only their current names and physical date rows. Never
// reuse cached row/column positions: users may sort or insert rows in Sheets.
function sameSchema(base: TrackerData, remote: TrackerData): boolean {
  if (base.kind === 'habits' && remote.kind === 'habits') {
    const schema = (data: HabitData) => data.habits.map(({ id, name, type }) => [id, name, type]);
    return JSON.stringify(schema(base)) === JSON.stringify(schema(remote));
  }
  return base.kind === 'workouts' && remote.kind === 'workouts' && JSON.stringify(base.exercises) === JSON.stringify(remote.exercises);
}
function existingValuesOnly(base: TrackerData, operations: LocalOperation[]): boolean {
  return operations.every(({ change }) => base.kind === 'habits' && change.type === 'habit-value'
    ? base.habits.some((habit) => habit.id === change.habitId)
    : base.kind === 'workouts' && change.type === 'workout-sets'
      && base.exercises.some((name) => name.toLowerCase() === change.name.trim().toLowerCase()));
}
function planValues(snapshot: RemoteSnapshot, base: TrackerData, operations: LocalOperation[], batchId: string): { requests: unknown[]; data: TrackerData } {
  const table = snapshot.tabs.find((tab) => tab.properties.title === (base.kind === 'habits' ? 'Habits' : 'Workouts'))!;
  const requests: unknown[] = [], changes = new Map<string, Map<number, string>>();
  let data = base;
  for (const { change } of compactOperations(base, operations)) {
    data = applyChange(data, change);
    let date: string, name: string, value: string;
    if (change.type === 'habit-value' && data.kind === 'habits') {
      date = change.date; name = data.habits.find((habit) => habit.id === change.habitId)!.name; value = change.value.trim();
    } else if (change.type === 'workout-sets' && data.kind === 'workouts') {
      date = change.date; name = data.exercises.find((entry) => entry.toLowerCase() === change.name.trim().toLowerCase())!; value = formatWorkoutSets(change.sets);
    } else throw new Error('Táto zmena vyžaduje úplné načítanie tabuľky.');
    const column = table.rows[0].indexOf(name, 1);
    if (column < 1) throw new Error('Stĺpec chýba. Obnov synchronizáciu.');
    if (!changes.has(date)) changes.set(date, new Map());
    changes.get(date)!.set(column, value);
  }
  const newRows: string[][] = [];
  for (const [date, values] of changes) {
    const rows = table.rows.flatMap((row, index) => index > 0 && row[0] === date ? [index] : []);
    if (rows.length) {
      for (const rowIndex of rows) for (const [columnIndex, value] of values) requests.push({ updateCells: {
        start: { sheetId: table.properties.sheetId, rowIndex, columnIndex }, rows: rowData([[value]]), fields: 'userEnteredValue',
      } });
    } else if ([...values.values()].some((value) => value !== '')) {
      const row = Array.from({ length: Math.max(...values.keys()) + 1 }, () => ''); row[0] = date;
      for (const [column, value] of values) row[column] = value;
      newRows.push(row);
    }
  }
  // Server-side append also preserves trailing rows with blank dates or notes.
  if (newRows.length) requests.push({ appendCells: { sheetId: table.properties.sheetId, rows: rowData(newRows), fields: 'userEnteredValue' } });
  let ledger = snapshot.tabs.find((tab) => tab.properties.title === LEDGER);
  if (!ledger) {
    ledger = { properties: { sheetId: Math.max(-1, ...snapshot.tabs.map((tab) => tab.properties.sheetId)) + 1, title: LEDGER, gridProperties: { rowCount: 1000, columnCount: 2 } }, rows: [] };
    requests.push({ addSheet: { properties: { ...ledger.properties, hidden: true } } });
  }
  if (!ledger.rows.length) requests.push({ updateCells: { start: { sheetId: ledger.properties.sheetId, rowIndex: 0, columnIndex: 0 }, rows: rowData([['Batch ID', 'Saved at']]), fields: 'userEnteredValue' } });
  requests.push({ appendCells: { sheetId: ledger.properties.sheetId, rows: rowData([[batchId, new Date().toISOString()]]), fields: 'userEnteredValue' } });
  return { requests, data };
}

export async function sendRemote(id: string, kind: TrackerKind, operations: LocalOperation[], batchId: string, base?: TrackerData): Promise<TrackerData> {
  return serialize(id, async () => {
    let snapshot: RemoteSnapshot | undefined, plan: { requests: unknown[]; data: TrackerData } | undefined;
    if (base?.kind === kind && existingValuesOnly(base, operations)) {
      const { tabs } = await fetchTabs(id, kind, true);
      const batches = readBatches(tabs);
      let schema: TrackerData | undefined;
      // Missing/changed definitions may need the full reader's repair path.
      try { schema = dataFromTabs(tabs.map((tab) => tab.properties.title === 'HabitDefinitions' ? tab : { ...tab, rows: tab.rows.slice(0, 1) }), kind); }
      catch { /* Fall back to the validated full snapshot below. */ }
      if (schema && sameSchema(base, schema) && !batches.has(batchId)) {
        snapshot = { tabs, data: schema, batches };
        plan = planValues(snapshot, base, operations, batchId);
      }
    }
    // Structural edits, mismatched schemas and a lost acknowledgement need the
    // complete current server snapshot. Pending local operations stay durable.
    if (!plan) {
      snapshot = await readRemote(id, kind);
      plan = planRemote(snapshot, compactOperations(snapshot.data, operations), batchId);
    }
    if (plan.requests.length) {
      try { await batch(id, plan.requests); }
      catch (error) { invalidateRemote(id); throw error; }
      if (!snapshot!.tabs.some((tab) => tab.properties.title === LEDGER)) invalidateRemote(id);
    }
    return plan.data;
  });
}
