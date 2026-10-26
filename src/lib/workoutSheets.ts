import { googleRequest } from './googleApi';
import { isDateKey } from './dates';
import { SHEETS, batch, ensureTrackerTab, post, readRows, rowData, serialize, sheetUrl, trackerSheetName, type SheetProperties, type Spreadsheet } from './googleSheetsClient';
import { formatWorkoutSets, parseWorkoutSets, type DayWorkouts, type WorkoutSet } from './workouts';

async function snapshot(id: string): Promise<{ rows: string[][]; sheet: SheetProperties }> {
  const metadata = await googleRequest<Spreadsheet>(`${sheetUrl(id)}?fields=sheets(properties)`);
  const tab = metadata.sheets.find(({ properties }) => properties.title === 'Workouts');
  if (!tab) throw new Error('V tréningovom spreadsheete chýba list Workouts. Obnov ho v Google Sheets.');
  const rows = await readRows(id, "'Workouts'");
  if (rows[0]?.[0] !== 'Date') throw new Error('Prvý stĺpec v liste Workouts musí mať názov Date.');
  const names = rows[0].slice(1).map((name) => name.trim().toLowerCase());
  if (names.some((name) => !name) || new Set(names).size !== names.length) throw new Error('Každý cvik v tabuľke musí mať jedinečný, neprázdny názov.');
  return { rows, sheet: tab.properties };
}

export function connectWorkoutSheet(id: string): Promise<void> {
  return serialize(id, async () => { await ensureTrackerTab(id, 'Workouts'); await snapshot(id); });
}

export async function getOrCreateWorkoutSheet(email: string): Promise<string> {
  const title = await trackerSheetName(email, 'Workouts');
  return serialize(`discover:${title}`, async () => {
    const query = new URLSearchParams({ q: `name = '${title}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id)', pageSize: '1', orderBy: 'createdTime' });
    const existing = await googleRequest<{ files?: { id: string }[] }>(`https://www.googleapis.com/drive/v3/files?${query}`);
    const id = existing.files?.[0]?.id;
    if (id) { await serialize(id, () => snapshot(id)); return id; }
    const created = await googleRequest<Spreadsheet>(SHEETS, post({
      properties: { title }, sheets: [{
        properties: { sheetId: 0, title: 'Workouts', gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
        data: [{ rowData: rowData([['Date']]) }],
      }],
    }));
    if (!created.spreadsheetId) throw new Error('Google nevrátil ID tréningového spreadsheetu.');
    return created.spreadsheetId;
  });
}

export function loadWorkoutDay(id: string, date: string): Promise<{ exercises: string[]; workouts: DayWorkouts }> {
  return serialize(id, async () => {
    if (!isDateKey(date)) throw new Error('Vyber platný dátum.');
    const { rows } = await snapshot(id);
    const exercises = rows[0].slice(1);
    const matching = rows.slice(1).filter((row) => row[0] === date);
    const day = matching[matching.length - 1];
    const workouts: DayWorkouts = Object.create(null) as DayWorkouts;
    if (day) exercises.forEach((name, index) => {
      const value = day[index + 1] ?? '';
      if (!value.trim()) return;
      try { workouts[name] = parseWorkoutSets(value); }
      catch { throw new Error(`Cvik „${name}“ má neplatný zápis sérií v Google Sheets: ${value}`); }
    });
    return { exercises, workouts };
  });
}

export function renameWorkoutExercise(id: string, previousName: string, input: string): Promise<string> {
  return serialize(id, async () => {
    const name = input.trim();
    if (!name || name.length > 100) throw new Error('Názov cviku musí mať 1 až 100 znakov.');
    const { rows, sheet } = await snapshot(id);
    const column = rows[0].indexOf(previousName, 1);
    if (column < 1) throw new Error('Cvik už neexistuje. Obnov tréning.');
    if (rows[0].some((entry, index) => index > 0 && index !== column && entry.trim().toLowerCase() === name.toLowerCase())) throw new Error('Cvik s týmto názvom už existuje.');
    if (name !== previousName) await batch(id, [{ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: column }, rows: rowData([[name]]), fields: 'userEnteredValue' } }]);
    return name;
  });
}

export async function saveWorkoutSets(id: string, date: string, name: string, sets: WorkoutSet[]): Promise<string> {
  // Capture the complete cell value before the queued write can yield.
  const value = formatWorkoutSets(sets);
  return serialize(id, async () => {
    if (!isDateKey(date)) throw new Error('Vyber platný dátum.');
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('Názov cviku musí mať 1 až 100 znakov.');
    const { rows, sheet } = await snapshot(id);
    const found = rows[0].findIndex((entry, index) => index > 0 && entry.trim().toLowerCase() === trimmed.toLowerCase());
    const column = found >= 1 ? found : rows[0].length;
    const canonicalName = found >= 1 ? rows[0][found] : trimmed;
    if (found < 1 && !value) throw new Error('K novému cviku pridaj aspoň jednu sériu.');
    const requests: unknown[] = [];
    if (column >= sheet.gridProperties.columnCount) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'COLUMNS', length: column + 1 - sheet.gridProperties.columnCount } });
    if (found < 1) requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: column }, rows: rowData([[canonicalName]]), fields: 'userEnteredValue' } });
    const matching = rows.flatMap((row, index) => index > 0 && row[0] === date ? [index] : []);
    for (const row of matching) requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: row, columnIndex: column }, rows: rowData([[value]]), fields: 'userEnteredValue' } });
    if (!matching.length && value) {
      if (rows.length >= sheet.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: 'ROWS', length: 1 } });
      const width = Math.max(rows[0].length, column + 1);
      const row = Array.from({ length: width }, (_, index) => index === 0 ? date : index === column ? value : '');
      requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: rows.length, columnIndex: 0 }, rows: rowData([row]), fields: 'userEnteredValue' } });
    }
    if (requests.length) await batch(id, requests);
    return canonicalName;
  });
}
