import { createLoader, plain } from './load-module.mjs';

export const user = { id: 'one', email: 'test@example.com' };
export const habit = { id: 'run', name: 'Run', type: 'boolean' };
export const habitData = { kind: 'habits', habits: [habit, { id: 'read', name: 'Read', type: 'numeric' }], values: {} };
export const workoutData = { kind: 'workouts', exercises: ['Bench', 'Drep'], days: {
  '2026-10-25': { Bench: [{ reps: 5, weight: 100 }], Drep: [{ reps: 8, weight: 0 }] },
  '2026-10-26': { Bench: [{ reps: 3, weight: 120 }] },
} };
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function memoryDatabase() {
  const records = new Map(), listeners = new Set();
  let tail = Promise.resolve(), session = null, failure = null;
  const api = {
    readLocal: async key => structuredClone(records.get(key) ?? null),
    listLocal: async () => structuredClone([...records.values()]),
    subscribeLocal: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    updateLocal: (key, update) => {
      const task = tail.catch(() => {}).then(() => {
        if (failure) throw failure;
        const previous = records.get(key);
        const record = structuredClone({ ...update(structuredClone(previous ?? null)), revision: (previous?.revision ?? 0) + 1 });
        records.set(key, record);
        for (const listener of listeners) listener(key);
        return structuredClone(record);
      });
      tail = task; return task;
    },
    readLocalSession: async () => structuredClone(session),
    saveLocalSession: async value => { session = structuredClone(value); },
  };
  return { api, records, fail: value => { failure = value; } };
}
export function setupLocal({ database = memoryDatabase(), remote = {}, globals = {}, mocks = {} } = {}) {
  let version = 0;
  const requests = [], sends = [];
  const cloud = {
    readRemote: async (id, kind) => { requests.push([id, kind]); return { data: structuredClone(kind === 'habits' ? habitData : workoutData) }; },
    sendRemote: async (...args) => {
      sends.push(args);
      const [id, kind, ops] = args;
      const model = load('src/lib/localModel.ts');
      const data = (await cloud.readRemote(id, kind)).data;
      return ops.reduce((data, operation) => model.applyChange(data, operation.change), data);
    },
    invalidateRemote: () => {}, ...remote,
  };
  class SessionExpiredError extends Error {}
  const auth = { getAuthVersion: () => version, getValidAccessToken: () => 'token', SessionExpiredError };
  const load = createLoader({ globals: {
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; },
    navigator: { onLine: true, locks: { request: async (_key, task) => task() } }, ...globals,
  }, mocks: {
    './localDatabase': database.api, '../lib/localDatabase': database.api,
    './remoteSync': cloud, './googleOAuth': auth,
    '../lib/workoutSheets': { getOrCreateWorkoutSheet: async () => 'workout-sheet' }, ...mocks,
  } });
  const model = load('src/lib/localModel.ts');
  const sync = load('src/lib/localSync.ts');
  const status = load('src/store/useSyncStore.ts').useSyncStore;
  async function seed(kind = 'habits', sheetId = kind === 'habits' ? 'sheet-1' : 'workout-sheet', data = kind === 'habits' ? habitData : workoutData, account = user) {
    const record = model.emptyRecord(account.id, kind, sheetId);
    if (database.records.has(record.key)) return record.key;
    await database.api.updateLocal(record.key, () => ({ ...record, base: structuredClone(data), initialized: true, syncedAt: Date.now() }));
    return record.key;
  }
  return { database, load, model, sync, status, cloud, auth, requests, sends, seed, expire: () => version++, plain };
}
