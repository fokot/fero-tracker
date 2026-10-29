import { googleRequest } from './googleApi';
import { prepareTrackerSheet } from './sheetSetup';
import type { User } from './types';
import { SHEETS, post, rowData, serialize, trackerSheetName, type Spreadsheet } from './googleSheetsClient';

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
    if (id) { await connectHabitSheet(id); return id; }
    const created = await googleRequest<Spreadsheet>(SHEETS, post({
      properties: { title }, sheets: [{
        properties: { sheetId: 0, title: 'Habits', gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
        data: [{ rowData: rowData([['Date']]) }],
      }],
    }));
    if (!created.spreadsheetId) throw new Error('Google did not return a spreadsheet ID.');
    return created.spreadsheetId;
  });
}

export function connectHabitSheet(id: string): Promise<void> {
  return serialize(id, () => prepareTrackerSheet('habits', id));
}
