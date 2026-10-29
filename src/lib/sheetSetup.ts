import { createGoogleSheetsRemote, createMemoryStorage, createSheetbase, type Target } from '@fokot/sheetbase';
import { getAuthVersion, getValidAccessToken, SessionExpiredError } from './googleOAuth';

// Short-lived validation during discovery/settings. OAuth and file selection
// belong to the application; table validation belongs to Sheetbase.
export function createSetupClient() {
  const version = getAuthVersion(), accountId = `setup:${version}`;
  const guard = () => { if (version !== getAuthVersion()) throw new SessionExpiredError(); };
  const storage = createMemoryStorage();
  const remote = createGoogleSheetsRemote({ getCredentials: () => { guard(); return { accountId, accessToken: getValidAccessToken() }; } });
  const db = createSheetbase({ accountId, storage, remote, autoSync: false });
  return { db, remote, accountId, guard, dispose: () => { db.dispose(); storage.close(); } };
}
export async function initializeTrackerTab(spreadsheetId: string, sheet: string) {
  const setup = createSetupClient();
  const target: Target = { accountId: setup.accountId, spreadsheetId, sheet, keyColumn: 'Date', headers: [], fingerprint: 'setup' };
  try { await setup.remote.initialize(target, setup.guard); } finally { setup.dispose(); }
}
