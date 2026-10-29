import { createGoogleSheetsRemote, createMemoryStorage, createSheetbase } from '@fokot/sheetbase';
import { getAuthVersion, getValidAccessToken, SessionExpiredError } from './googleOAuth';
import type { TrackerKind } from './preferences';
import { trackerDefinition } from './trackerSchema';

// Settings validate a file without changing the active connection or cache.
export async function prepareTrackerSheet(kind: TrackerKind, spreadsheetId: string): Promise<void> {
  const version = getAuthVersion(), accountId = `setup:${version}`;
  const storage = createMemoryStorage();
  const remote = createGoogleSheetsRemote({ getCredentials: () => {
    if (version !== getAuthVersion()) throw new SessionExpiredError();
    return { accountId, accessToken: getValidAccessToken() };
  } });
  const db = createSheetbase({ accountId, storage, remote, autoSync: false });
  try { await db.table(trackerDefinition(kind, spreadsheetId)).open({ create: true }); }
  finally { db.dispose(); storage.close(); }
}
