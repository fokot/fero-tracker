import { googleRequest } from './googleApi';
import { prepareTrackerSheet } from './sheetSetup';
import { SHEETS, post, rowData, serialize, trackerSheetName, type Spreadsheet } from './googleSheetsClient';

export function connectWorkoutSheet(id: string): Promise<void> {
  return serialize(id, () => prepareTrackerSheet('workouts', id));
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
