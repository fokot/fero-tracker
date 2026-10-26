import { GoogleApiError, googleRequest } from './googleApi';
import { connectHabitSheet } from './googleSheets';
import { connectWorkoutSheet } from './workoutSheets';
import { SHEETS, post, rowData, type Spreadsheet } from './googleSheetsClient';
import { isSpreadsheetId, type SheetChoice, type TrackerKind } from './preferences';

const MIME = 'application/vnd.google-apps.spreadsheet';
interface DriveSheet { id: string; name: string; mimeType?: string; trashed?: boolean; capabilities?: { canEdit?: boolean } }

export async function getSpreadsheetInfo(id: string): Promise<SheetChoice> {
  if (!isSpreadsheetId(id)) throw new Error('Neplatné ID tabuľky.');
  let file: DriveSheet;
  try { file = await googleRequest<DriveSheet>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,capabilities(canEdit)&supportsAllDrives=true`); }
  catch (error) {
    if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) throw new Error('Tabuľka neexistuje alebo k nej aplikácia nemá prístup. Vyber ju cez Disk Google alebo použi tabuľku vytvorenú aplikáciou.');
    throw error;
  }
  if (file.trashed || file.mimeType !== MIME) throw new Error('Vyber Google Sheet, ktorý nie je v koši.');
  if (file.capabilities?.canEdit !== true) throw new Error('K tejto tabuľke nemáš právo na úpravy.');
  return { id: file.id, name: file.name };
}

export async function listAccessibleSheets(): Promise<SheetChoice[]> {
  const files: SheetChoice[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ q: `mimeType = '${MIME}' and trashed = false`, fields: 'files(id,name,capabilities(canEdit)),nextPageToken', pageSize: '100', orderBy: 'modifiedTime desc' });
    if (pageToken) query.set('pageToken', pageToken);
    const result = await googleRequest<{ files?: DriveSheet[]; nextPageToken?: string }>(`https://www.googleapis.com/drive/v3/files?${query}`);
    files.push(...(result.files ?? []).filter((file) => file.capabilities?.canEdit === true).map(({ id, name }) => ({ id, name })));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return files;
}

export async function prepareSheetConnection(kind: TrackerKind, id: string): Promise<void> {
  if (kind === 'habits') await connectHabitSheet(id); else await connectWorkoutSheet(id);
}

export async function createTrackerSpreadsheet(kind: TrackerKind): Promise<SheetChoice> {
  const title = `Fero Tracker · ${kind === 'habits' ? 'Návyky' : 'Workouts'} · ${new Date().toLocaleString('sk-SK')}`;
  const sheet = await googleRequest<Spreadsheet>(SHEETS, post({ properties: { title }, sheets: [{
    properties: { sheetId: 0, title: kind === 'habits' ? 'Habits' : 'Workouts', gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
    data: [{ rowData: rowData([['Date']]) }],
  }] }));
  if (!sheet.spreadsheetId) throw new Error('Google nevrátil ID novej tabuľky.');
  return { id: sheet.spreadsheetId, name: title };
}
