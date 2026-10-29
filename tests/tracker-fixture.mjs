import { createLoader } from './load-module.mjs';
import * as sdk from '@fokot/sheetbase';
export const user = { id: 'one', email: 'test@example.com' };
export const date = '2026-10-25';
export const tick = () => new Promise(resolve => setImmediate(resolve));
export const habitData = { kind: 'habits', habits: [{ id: 'run', name: 'Run', type: 'boolean' }, { id: 'read', name: 'Read', type: 'numeric' }], values: { [date]: { Run: '', Read: '0' } } };
export const workoutData = { kind: 'workouts', exercises: ['Bench', 'Drep'], days: { [date]: { Bench: [{ reps: 5, weight: 100 }], Drep: [{ reps: 8, weight: 0 }] }, '2026-10-26': { Bench: [{ reps: 3, weight: 120 }] } } };
export function setupTracker(t, { storage = sdk.createMemoryStorage(), legacy = [], mocks = {}, remote: customRemote, globals = {} } = {}) {
  let version = 0, fail = null;
  const clients = [], reads = [], sends = [], inner = sdk.createMemoryRemote();
  const remote = customRemote ?? { ...inner, read: async (...args) => { reads.push(args); return inner.read(...args); }, commit: async (...args) => { sends.push(args); return inner.commit(...args); } };
  const wrapped = { ...storage, update: (...args) => { if (fail) return Promise.reject(fail); return storage.update(...args); } };
  const load = createLoader({ globals: { navigator: { onLine: true }, ...globals }, mocks: {
    '@fokot/sheetbase': { ...sdk, createIndexedDBStorage: () => wrapped, createGoogleSheetsRemote: () => remote,
      createSheetbase: options => { const client = sdk.createSheetbase({ ...options, autoSync: false }); clients.push(client); return client; } },
    './legacyDatabase': { listLegacyRecords: async () => structuredClone(legacy) },
    './googleOAuth': { getAuthVersion: () => version, getValidAccessToken: () => 'token' },
    './googleSheets': { connectHabitSheet: async () => {} },
    '../lib/workoutSheets': { getOrCreateWorkoutSheet: async () => 'workout-sheet' }, ...mocks,
  } });
  const sync = load('src/lib/sheetbase.ts');
  const habits = load('src/store/useHabitStore.ts').useHabitStore;
  const workouts = load('src/store/useWorkoutStore.ts').useWorkoutStore;
  async function seed(kind = 'habits', id = kind === 'habits' ? 'sheet-1' : 'workout-sheet', account = user, data = kind === 'habits' ? habitData : workoutData) {
    const table = sync.trackerTable(account.id, kind, id);
    const record = { userId: account.id, kind, sheetId: id, base: structuredClone(data), operations: [], batch: null, initialized: true, syncedAt: Date.now() };
    const converted = load('src/lib/legacyMigration.ts').convertLegacy(record);
    await table.import(converted);
    const target = { ...table.target, columns: converted.columns };
    await inner.initialize(target, () => {});
    await inner.commit(target, Object.entries(converted.base).map(([key, values], index) => ({ id: `seed-${index}`, key, values })), 'seed', () => {});
    return table;
  }
  t.after(() => { for (const client of clients) client.dispose(); });
  return { sync, habits, workouts, storage, inner, reads, sends, load, seed, legacy, expire: () => version++, fail: error => { fail = error; } };
}
