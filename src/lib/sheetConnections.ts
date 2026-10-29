import { localeTag } from '../i18n/locale';
import { t } from '../i18n/messages';
import { GoogleApiError, googleRequest } from './googleApi';
import { connectHabitSheet } from './googleSheets';
import { connectWorkoutSheet } from './workoutSheets';
import { SHEETS, post, rowData, type Spreadsheet } from './googleSheetsClient';
import { isSpreadsheetId, type SheetChoice, type TrackerKind } from './preferences';

const MIME = 'application/vnd.google-apps.spreadsheet';
interface DriveSheet { id: string; name: string; mimeType?: string; trashed?: boolean; capabilities?: { canEdit?: boolean } }

export async function getSpreadsheetInfo(id: string): Promise<SheetChoice> {
  if (!isSpreadsheetId(id)) throw new Error(t('error.sheetId'));
  let file: DriveSheet;
  try { file = await googleRequest<DriveSheet>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,capabilities(canEdit)&supportsAllDrives=true`); }
  catch (error) {
    if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) throw new Error(t('error.sheetAccess'));
    throw error;
  }
  if (file.trashed || file.mimeType !== MIME) throw new Error(t('error.sheetType'));
  if (file.capabilities?.canEdit !== true) throw new Error(t('error.sheetEdit'));
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
  const title = `Fero Tracker · ${kind === 'habits' ? t('common.habits') : t('common.workouts')} · ${new Date().toLocaleString(localeTag())}`;
  const sheet = await googleRequest<Spreadsheet>(SHEETS, post({ properties: { title }, sheets: [{
    properties: { sheetId: 0, title: kind === 'habits' ? 'Habits' : 'Workouts', gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
    data: [{ rowData: rowData([['Date']]) }],
  }] }));
  if (!sheet.spreadsheetId) throw new Error(t('error.newSheetId'));
  return { id: sheet.spreadsheetId, name: title };
}
