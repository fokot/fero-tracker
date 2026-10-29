import { createGoogleSheetsRemote, createIndexedDBStorage, createSheetbase, SheetbaseError, type Columns, type SheetTable, type Storage } from '@fokot/sheetbase';
import { getAuthVersion, getValidAccessToken } from './googleOAuth';
import { trackerDefinition } from './trackerSchema';
import type { TrackerKind } from './preferences';
import { errorMessage } from './types';
import { useSyncStore } from '../store/useSyncStore';

export type TrackerTable = SheetTable<Columns>;
let storage: Storage | undefined;
export const trackerStorage = () => storage ??= createIndexedDBStorage('feros-tracker-sheetbase');
const clients = new Map<string, ReturnType<typeof createSheetbase>>();
const tables = new Map<string, TrackerTable>();
const openings = new Map<string, Promise<TrackerTable>>();
let authorizedVersion = -1;
export const validName = (input: string) => { const name = input.trim(); if (!name || name.length > 100) throw new Error('Názov musí mať 1 až 100 znakov.'); return name; };
export function canSynchronize(userId: string): boolean {
  const state = useSyncStore.getState(); return state.online && state.authorizedUserId === userId && authorizedVersion === getAuthVersion();
}
function clientFor(accountId: string) {
  let client = clients.get(accountId); if (client) return client;
  const remote = createGoogleSheetsRemote({ getCredentials: () => {
    if (!canSynchronize(accountId)) throw new SheetbaseError('auth-required', 'Prihlás sa na odoslanie zmien do Google Sheets.');
    try { return { accountId, accessToken: getValidAccessToken() }; }
    catch { throw new SheetbaseError('auth-required', 'Platnosť prihlásenia vypršala. Prihlás sa znova.'); }
  } });
  client = createSheetbase({ accountId, storage: trackerStorage(), remote, namespace: 'fero-tracker' });
  if (!canSynchronize(accountId)) client.pause();
  clients.set(accountId, client); return client;
}
function updateStatus() {
  const accountId = useSyncStore.getState().authorizedUserId;
  const active = [...tables.values()].filter(table => table.target.accountId === accountId);
  const snapshots = active.map(table => table.snapshot());
  if (accountId && snapshots.some(snapshot => snapshot.phase === 'auth-required' && snapshot.error?.code === 'auth-required')) { authorizedVersion = -1; useSyncStore.setState({ authorizedUserId: null }); }
  useSyncStore.setState({ syncing: active.filter(table => table.snapshot().phase === 'syncing').map(table => table.key),
    error: snapshots.find(snapshot => snapshot.error)?.error?.message ?? null });
}
export function trackerTable(accountId: string, kind: TrackerKind, spreadsheetId: string): TrackerTable {
  const table = clientFor(accountId).table(trackerDefinition(kind, spreadsheetId));
  if (!tables.has(table.key)) { tables.set(table.key, table); table.subscribe(updateStatus); }
  return table;
}
export async function openTracker(accountId: string, kind: TrackerKind, spreadsheetId: string): Promise<TrackerTable> {
  const table = trackerTable(accountId, kind, spreadsheetId), pending = openings.get(table.key); if (pending) return pending;
  const opening = (async () => {
    const authorized = canSynchronize(accountId);
    await table.open({ create: true, cachedOnly: !authorized }); return table;
  })();
  openings.set(table.key, opening);
  try { return await opening; } finally { if (openings.get(table.key) === opening) openings.delete(table.key); }
}
export function pauseSynchronization() {
  authorizedVersion = -1;
  for (const client of clients.values()) client.pause();
  useSyncStore.setState({ authorizedUserId: null, syncing: [], error: null });
}
export function authorizeSynchronization(accountId: string, activeSheets?: string[]) {
  pauseSynchronization(); authorizedVersion = getAuthVersion(); useSyncStore.setState({ authorizedUserId: accountId, error: null });
  clientFor(accountId).resume(); void wakeSynchronization(true, activeSheets);
}
export async function synchronizeRecord(key: string, refresh = false): Promise<void> {
  const table = tables.get(key); if (!table || !canSynchronize(table.target.accountId)) return;
  try { if (table.pending()) await table.sync(); if (refresh) await table.refresh(); }
  catch (error) { table.report(error); } finally { updateStatus(); }
}
export async function wakeSynchronization(refresh = false, activeSheets?: string[]) {
  const accountId = useSyncStore.getState().authorizedUserId; if (!accountId || !canSynchronize(accountId)) return;
  try {
    const records = await trackerStorage().list();
    const connections = new Map<string, { kind: TrackerKind; id: string }>();
    for (const record of records) if (record.target.accountId === accountId) connections.set(record.target.spreadsheetId, { id: record.target.spreadsheetId, kind: record.target.sheet === 'Habits' ? 'habits' : 'workouts' });
    for (const table of tables.values()) if (table.target.accountId === accountId) connections.set(table.target.spreadsheetId, { id: table.target.spreadsheetId, kind: table.target.sheet === 'Habits' ? 'habits' : 'workouts' });
    await Promise.all([...connections.values()].map(async ({ id, kind }) => {
      const table = await openTracker(accountId, kind, id);
      if (!canSynchronize(accountId)) return;
      await synchronizeRecord(table.key, refresh && (!activeSheets || activeSheets.includes(id)));
    }));
  } catch (error) { useSyncStore.setState({ error: errorMessage(error) }); }
}
export function startLocalSync(): () => void {
  // Sheetbase owns reconnect, focus, retry and cross-tab scheduling. This listener
  // only exposes connectivity to the app's login and settings controls.
  const online = () => useSyncStore.setState({ online: navigator.onLine !== false });
  window.addEventListener('online', online); window.addEventListener('offline', online); online();
  return () => { window.removeEventListener('online', online); window.removeEventListener('offline', online); };
}
