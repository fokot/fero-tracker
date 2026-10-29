import { column, type Columns } from '@fokot/sheetbase';
import { googleRequest } from './googleApi';
import { createSetupClient } from './sheetSetup';
import { SHEETS, post, rowData, serialize, trackerSheetName, type Spreadsheet } from './googleSheetsClient';
import { formatWorkoutSets, parseWorkoutSets } from './workouts';

export function connectWorkoutSheet(id: string): Promise<void> {
  return serialize(id, async () => {
    const setup = createSetupClient();
    try {
      const table = setup.db.table<Columns>({ spreadsheetId: id, sheet: 'Workouts', keyColumn: 'Date', duplicateKeys: 'last', columns: {},
        dynamic: { sheet: 'WorkoutDefinitions', defaultType: 'sets', codecs: { sets: header => column.custom(header, { id: 'workout-sets:v1', encode: formatWorkoutSets, decode: parseWorkoutSets }) } } });
      await table.open({ create: true });
    } finally { setup.dispose(); }
  });
}

export async function getOrCreateWorkoutSheet(email: string): Promise<string> {
  const title = await trackerSheetName(email, 'Workouts');
  return serialize(`discover:${title}`, async () => {
    const query = new URLSearchParams({ q: `name = '${title}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id)', pageSize: '1', orderBy: 'createdTime' });
    const existing = await googleRequest<{ files?: { id: string }[] }>(`https://www.googleapis.com/drive/v3/files?${query}`);
    const id = existing.files?.[0]?.id;
    if (id) { await connectWorkoutSheet(id); return id; }
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
