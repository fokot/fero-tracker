import { googleRequest } from './googleApi';
import { dateKey, isDateKey } from './dates';
import type { Habit, HabitValue, User } from './types';

import {
  SHEETS, batch, columnName, post, readRows, rowData, serialize, sheetUrl,
  trackerSheetName, type SheetProperties, type Spreadsheet,
} from './googleSheetsClient';
export { columnName } from './googleSheetsClient';

const FORMAT_KEY = 'feros-tracker-layout';
const FORMAT_VERSION = 'date-rows-v1';
interface Snapshot { rows: string[][]; habits: Habit[]; sheet: SheetProperties }

export async function getAuthorizedUser(): Promise<User> {
  const data = await googleRequest<{ sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string }>('https://openidconnect.googleapis.com/v1/userinfo');
  if (!data.sub || !data.email || data.email_verified !== true) throw new Error('Google did not return a verified account. Please sign in again.');
  return { id: data.sub, email: data.email, name: data.name, picture: data.picture };
}
export function getSheetName(email: string): Promise<string> {
  return trackerSheetName(email, 'Habits');
}

export async function getOrCreateUserSheet(email: string): Promise<string> {
  const title = await getSheetName(email);
  return serialize(`discover:${title}`, async () => {
    const query = new URLSearchParams({
      q: `name = '${title}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id)', pageSize: '1', orderBy: 'createdTime',
    });
    const existing = await googleRequest<{ files?: { id: string }[] }>(`https://www.googleapis.com/drive/v3/files?${query}`);
    const id = existing.files?.[0]?.id;
    if (id) { await serialize(id, () => prepareData(id)); return id; }
    const created = await googleRequest<Spreadsheet>(SHEETS, post({
      properties: { title }, sheets: [
        { properties: { sheetId: 0, title: 'Habits', gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, data: [{ rowData: rowData([['Date']]) }] },
        { properties: { sheetId: 1, title: 'HabitDefinitions' }, data: [{ rowData: rowData([['ID', 'Name', 'Type']]) }] },
      ],
      developerMetadata: [{ metadataKey: FORMAT_KEY, metadataValue: FORMAT_VERSION, location: { sheetId: 0 }, visibility: 'DOCUMENT' }],
    }));
    if (!created.spreadsheetId) throw new Error('Google did not return a spreadsheet ID.');
    return created.spreadsheetId;
  });
}

export function parseHabitRows(rows: string[][]): HabitValue[] {
  const headers = rows[0] ?? [];
  return rows.slice(1).flatMap((row, index) => row[0] && isDateKey(row[0])
    ? headers.slice(1).flatMap((name, column) => name ? [{ row: index + 2, date: row[0], habitName: name, value: row[column + 1] ?? '' }] : [])
    : []);
}

export function pivotLegacyRows(rows: string[][], definedNames: string[] = []): string[][] {
  const names = [...new Set(definedNames)];
  const dates = new Map<string, Map<string, string>>();
  for (const row of rows.slice(1)) {
    if (!row.some((cell) => cell !== '')) continue;
    if (!isDateKey(row[0] ?? '') || !row[1] || row.slice(3).some((cell) => cell !== '')) {
      throw new Error('An old Habits row has an invalid date or habit. Fix it in Google Sheets before converting.');
    }
    if (!names.includes(row[1])) names.push(row[1]);
    if (!dates.has(row[0])) dates.set(row[0], new Map());
    // Match the old reader: the last record wins, including an explicit clear.
    dates.get(row[0])!.set(row[1], row[2] ?? '');
  }
  return [['Date', ...names], ...[...dates.keys()].sort().map((date) => [date, ...names.map((name) => dates.get(date)!.get(name) ?? '')])];
}

function readDefinitions(rows: string[][]): Habit[] {
  const habits = new Map<string, Habit>();
  for (const row of rows.slice(1)) {
    if (row[0] && row[1] && (row[2] === 'boolean' || row[2] === 'numeric') && !habits.has(row[1])) {
      habits.set(row[1], { id: row[0], name: row[1], type: row[2] });
    }
  }
  return [...habits.values()];
}

// Migration and backup are one atomic Sheets batch: either both happen or
// neither does. The Habits sheet keeps its ID and links; its old copy is kept.
async function prepareData(id: string): Promise<Snapshot> {
  const [spreadsheet, originalRows] = await Promise.all([
    googleRequest<Spreadsheet>(`${sheetUrl(id)}?fields=spreadsheetId,sheets(properties,developerMetadata)`),
    readRows(id, "'Habits'"),
  ]);
  const tab = spreadsheet.sheets.find(({ properties }) => properties.title === 'Habits');
  if (!tab) throw new Error('The spreadsheet is missing its Habits sheet. Restore it in Google Sheets before retrying.');
  const definitionsTab = spreadsheet.sheets.find(({ properties }) => properties.title === 'HabitDefinitions');
  const definitions = definitionsTab ? await readRows(id, 'HabitDefinitions!A:C') : [];
  const knownHabits = readDefinitions(definitions);
  const marked = tab.developerMetadata?.some((entry) => entry.metadataKey === FORMAT_KEY && entry.metadataValue === FORMAT_VERSION);
  const header = originalRows[0] ?? [];
  const legacy = !marked && header.length === 3 && header[0] === 'Date' && header[1] === 'Habit Name' && header[2] === 'Value';
  let rows = legacy ? pivotLegacyRows(originalRows, knownHabits.map(({ name }) => name)) : originalRows.map((row) => [...row]);
  if (!rows.length) rows = [['Date']];
  if (rows[0][0] !== 'Date') throw new Error('The first Habits column must be named Date. Restore the header in Google Sheets before retrying.');
  for (const { name } of knownHabits) if (!rows[0].includes(name, 1)) rows[0].push(name);
  const names = rows[0].slice(1);
  if (names.some((name) => !name.trim()) || new Set(names).size !== names.length) throw new Error('Each habit column needs a unique, non-empty name in Google Sheets.');
  const values = parseHabitRows(rows);
  const habits = names.map((name): Habit => knownHabits.find((habit) => habit.name === name) ?? {
    id: `legacy:${name}`, name,
    type: values.some((entry) => entry.habitName === name && entry.value !== '' && entry.value !== '✓' && Number.isFinite(Number(entry.value))) ? 'numeric' : 'boolean',
  });
  const requests: unknown[] = [];
  const sheet = { ...tab.properties, gridProperties: { ...tab.properties.gridProperties } };
  const usedIds = new Set(spreadsheet.sheets.map(({ properties }) => properties.sheetId));
  const allocateSheetId = () => {
    let next = 0;
    while (usedIds.has(next)) next++;
    usedIds.add(next);
    return next;
  };
  if (legacy) {
    let backup = 'Habits_Legacy_Backup';
    for (let suffix = 2; spreadsheet.sheets.some(({ properties }) => properties.title === backup); suffix++) backup = `Habits_Legacy_Backup_${suffix}`;
    requests.push({ duplicateSheet: { sourceSheetId: sheet.sheetId, newSheetId: allocateSheetId(), newSheetName: backup } });
  }
  if (rows[0].length > sheet.gridProperties.columnCount) {
    requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: rows[0].length - sheet.gridProperties.columnCount } });
    sheet.gridProperties.columnCount = rows[0].length;
  }
  if (legacy) {
    requests.push({ updateCells: { range: { sheetId: sheet.sheetId }, rows: rowData(rows), fields: 'userEnteredValue' } });
    requests.push({ updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } });
  } else if (JSON.stringify(rows[0]) !== JSON.stringify(header)) {
    requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: 0 }, rows: rowData([rows[0]]), fields: 'userEnteredValue' } });
  }
  if (!marked) requests.push({ createDeveloperMetadata: { developerMetadata: {
    metadataKey: FORMAT_KEY, metadataValue: FORMAT_VERSION, location: { sheetId: sheet.sheetId }, visibility: 'DOCUMENT',
  } } });
  let definitionsId = definitionsTab?.properties.sheetId;
  if (definitionsId === undefined) {
    definitionsId = allocateSheetId();
    requests.push({ addSheet: { properties: { sheetId: definitionsId, title: 'HabitDefinitions', gridProperties: { rowCount: Math.max(1000, habits.length + 1), columnCount: 3 } } } });
  }
  if (!definitions.length) requests.push({ updateCells: { start: { sheetId: definitionsId, rowIndex: 0, columnIndex: 0 }, rows: rowData([['ID', 'Name', 'Type']]), fields: 'userEnteredValue' } });
  const inferred = habits.filter(({ name }) => !knownHabits.some((habit) => habit.name === name));
  if (inferred.length) {
    const firstRow = Math.max(1, definitions.length);
    if (definitionsTab && firstRow + inferred.length > definitionsTab.properties.gridProperties.rowCount) {
      requests.push({ appendDimension: { sheetId: definitionsId, dimension: 'ROWS', length: firstRow + inferred.length - definitionsTab.properties.gridProperties.rowCount } });
    }
    requests.push({ updateCells: { start: { sheetId: definitionsId, rowIndex: firstRow, columnIndex: 0 }, rows: rowData(inferred.map(({ id, name, type }) => [id, name, type])), fields: 'userEnteredValue' } });
  }
  if (requests.length) await batch(id, requests);
  return { rows, habits, sheet };
}

export function loadHabitData(id: string, start: Date, end: Date): Promise<{ habits: Habit[]; values: HabitValue[] }> {
  return serialize(id, async () => {
    const { rows, habits } = await prepareData(id);
    const first = dateKey(start), last = dateKey(end);
    return { habits, values: parseHabitRows(rows).filter(({ date }) => date >= first && date <= last) };
  });
}
export async function readHabitsInRange(id: string, start: Date, end: Date): Promise<HabitValue[]> {
  return (await loadHabitData(id, start, end)).values;
}

export function saveHabit(id: string, habit: Habit): Promise<void> {
  return serialize(id, async () => {
    if (!habit.name.trim()) throw new Error('Enter a habit name.');
    const { rows, habits, sheet } = await prepareData(id);
    if (habits.some(({ name }) => name.trim().toLowerCase() === habit.name.trim().toLowerCase())) throw new Error('A habit with this name already exists.');
    const requests: unknown[] = [];
    if (rows[0].length >= sheet.gridProperties.columnCount) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: 1 } });
    requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: rows[0].length }, rows: rowData([[habit.name]]), fields: 'userEnteredValue' } });
    // Metadata and the new header are committed atomically, including for empty habits.
    const metadata = await googleRequest<Spreadsheet>(`${sheetUrl(id)}?fields=sheets(properties)`);
    const definitions = metadata.sheets.find(({ properties }) => properties.title === 'HabitDefinitions');
    if (!definitions) throw new Error('Habit definitions are unavailable. Refresh and retry.');
    requests.push({ appendCells: { sheetId: definitions.properties.sheetId, rows: rowData([[habit.id, habit.name, habit.type]]), fields: 'userEnteredValue' } });
    await batch(id, requests);
  });
}

export function writeHabitValue(id: string, date: string, habitName: string, value: string): Promise<void> {
  return serialize(id, async () => {
    if (!isDateKey(date) || !habitName.trim()) throw new Error('Invalid habit or date.');
    const { rows, sheet } = await prepareData(id);
    const column = rows[0].indexOf(habitName, 1);
    if (column < 1) throw new Error('This habit column is missing. Refresh and retry.');
    const matching = rows.flatMap((row, index) => index > 0 && row[0] === date ? [index + 1] : []);
    if (matching.length) {
      await googleRequest(`${sheetUrl(id)}/values:batchUpdate`, post({ valueInputOption: 'RAW',
        data: matching.map((row) => ({ range: `Habits!${columnName(column + 1)}${row}`, values: [[value]] })),
      }));
    } else if (value !== '') {
      const requests: unknown[] = [];
      if (rows.length >= sheet.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'ROWS', length: 1 } });
      const row = Array.from({ length: rows[0].length }, (_, index) => index === 0 ? date : index === column ? value : '');
      requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: rows.length, columnIndex: 0 }, rows: rowData([row]), fields: 'userEnteredValue' } });
      await batch(id, requests);
    }
  });
}
