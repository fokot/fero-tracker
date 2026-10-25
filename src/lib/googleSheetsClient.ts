import { googleRequest } from './googleApi';
import { getAuthVersion, getValidAccessToken, SessionExpiredError } from './googleOAuth';

export const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export interface SheetProperties {
  sheetId: number;
  title: string;
  gridProperties: { rowCount: number; columnCount: number };
}
export interface Sheet {
  properties: SheetProperties;
  developerMetadata?: { metadataKey: string; metadataValue: string }[];
}
export interface Spreadsheet { spreadsheetId: string; sheets: Sheet[] }
export const sheetUrl = (id: string) => `${SHEETS}/${encodeURIComponent(id)}`;
export const valuesUrl = (id: string, range: string) => `${sheetUrl(id)}/values/${encodeURIComponent(range)}`;
export const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
export const rowData = (rows: string[][]) => rows.map((row) => ({ values: row.map((value) => ({ userEnteredValue: { stringValue: value } })) }));
export const batch = (id: string, requests: unknown[]) => googleRequest(`${sheetUrl(id)}:batchUpdate`, post({ requests }));

// Coordinate writes and discovery across this app and tabs on the same origin.
const writes = new Map<string, Promise<unknown>>();
export function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const version = getAuthVersion();
  const run = () => {
    if (version !== getAuthVersion()) throw new SessionExpiredError();
    getValidAccessToken();
    return operation();
  };
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() =>
    typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`feros-tracker:${key}`, run) : run());
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => {});
  return next;
}

export async function trackerSheetName(email: string, tracker: 'Habits' | 'Workouts'): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
  return `${tracker}_${hash}`;
}

export async function readRows(id: string, range: string): Promise<string[][]> {
  const response = await googleRequest<{ values?: (string | number | boolean)[][] }>(valuesUrl(id, range));
  return (response.values ?? []).map((row) => row.map(String));
}

export function columnName(column: number): string {
  if (!Number.isInteger(column) || column < 1) throw new Error('Invalid column number.');
  let name = '';
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}
