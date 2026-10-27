import { getAuthVersion, getValidAccessToken, SessionExpiredError } from './googleOAuth';
import { readLocal, updateLocal, listLocal, subscribeLocal } from './localDatabase';
import { applyChange, emptyRecord, projectRecord, type Change, type LocalRecord } from './localModel';
import { readRemote, sendRemote, invalidateRemote } from './remoteSync';
import { useSyncStore } from '../store/useSyncStore';
import { errorMessage } from './types';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Map<string, Promise<void>>();
const failures = new Map<string, number>();
let authorizedVersion = -1;
const clientId = crypto.randomUUID();
function allowed(record: LocalRecord): boolean {
  const state = useSyncStore.getState();
  return state.online && state.authorizedUserId === record.userId && authorizedVersion === getAuthVersion();
}
export function authorizeSynchronization(userId: string) {
  authorizedVersion = getAuthVersion();
  useSyncStore.setState({ authorizedUserId: userId, error: null });
  void wakeSynchronization();
}
export function pauseSynchronization() { authorizedVersion = -1; useSyncStore.setState({ authorizedUserId: null }); }
export function canSynchronize(userId: string): boolean {
  const state = useSyncStore.getState();
  return state.online && state.authorizedUserId === userId && authorizedVersion === getAuthVersion();
}
export function requestSync(key: string, delay = 650) {
  if (timers.has(key) || running.has(key)) return;
  timers.set(key, setTimeout(() => { timers.delete(key); void synchronizeRecord(key); }, delay));
}
export async function enqueueLocal(key: string, makeChange: (data: ReturnType<typeof projectRecord>) => Change): Promise<LocalRecord> {
  const result = await updateLocal(key, (record) => {
    if (!record?.initialized) throw new Error('Najprv načítaj túto tabuľku online.');
    const change = makeChange(projectRecord(record));
    applyChange(projectRecord(record), change);
    return { ...record, operations: [...record.operations, { id: crypto.randomUUID(), change: structuredClone(change) }], syncError: null };
  });
  useSyncStore.setState({ error: null });
  requestSync(key); return result;
}
export async function ensureLocal(userId: string, kind: LocalRecord['kind'], sheetId: string): Promise<LocalRecord> {
  const initial = emptyRecord(userId, kind, sheetId);
  return await readLocal(initial.key) ?? await updateLocal(initial.key, (record) => record ?? initial);
}
async function locked(key: string, task: () => Promise<void>): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`feros-local-sync:${key}`, async () => { await task(); return true; });
  let acquired = false;
  await updateLocal(key, (record) => {
    if (!record) throw new Error('Lokálna tabuľka chýba.');
    if (record.lease && record.lease.owner !== clientId && record.lease.expires > Date.now()) return record;
    acquired = true; return { ...record, lease: { owner: clientId, expires: Date.now() + 90000 } };
  });
  if (!acquired) return false;
  const renewal = setInterval(() => { void updateLocal(key, (record) => {
    if (!record) throw new Error('Lokálna tabuľka chýba.');
    return record.lease?.owner === clientId ? { ...record, lease: { owner: clientId, expires: Date.now() + 90000 } } : record;
  }).catch(() => {}); }, 20000);
  try { await task(); }
  finally { clearInterval(renewal); await updateLocal(key, (record) => { if (!record) throw new Error('Lokálna tabuľka chýba.'); return record.lease?.owner === clientId ? { ...record, lease: undefined } : record; }); }
  return true;
}
export async function synchronizeRecord(key: string, refresh = false): Promise<void> {
  if (running.has(key)) return running.get(key);
  const timer = timers.get(key); if (timer) { clearTimeout(timer); timers.delete(key); }
  let failed = false, waitingForLease = false;
  const startedVersion = getAuthVersion();
  const work = (async () => {
    const record = await readLocal(key);
    if (!record || !allowed(record)) return;
    useSyncStore.setState((state) => ({ syncing: [...state.syncing, key] }));
    try {
      const acquired = await locked(key, async () => {
        let current = await readLocal(key);
        if (!current || !allowed(current)) return;
        getValidAccessToken();
        const version = getAuthVersion();
        if (current.operations.length) {
          current = await updateLocal(key, (latest) => {
            if (!latest) throw new Error('Lokálna tabuľka chýba.');
            return { ...latest, batch: latest.batch ?? { id: crypto.randomUUID(), operationIds: latest.operations.slice(0, 200).map((entry) => entry.id) } };
          });
          const batch = current.batch!;
          const operations = current.operations.filter((entry) => batch.operationIds.includes(entry.id));
          const data = await sendRemote(current.sheetId, current.kind, operations, batch.id);
          if (version !== getAuthVersion() || !allowed(current)) return;
          await updateLocal(key, (latest) => {
            if (!latest) throw new Error('Lokálna tabuľka chýba.');
            const next = { ...latest, base: data, operations: latest.operations.filter((entry) => !batch.operationIds.includes(entry.id)), batch: null, initialized: true, syncedAt: Date.now(), syncError: null };
            projectRecord(next); return next;
          });
        } else if (refresh || !current.initialized || !current.syncedAt || Date.now() - current.syncedAt > 30000) {
          const remote = await readRemote(current.sheetId, current.kind);
          if (version !== getAuthVersion() || !allowed(current)) return;
          await updateLocal(key, (latest) => {
            if (!latest) throw new Error('Lokálna tabuľka chýba.');
            const next = { ...latest, base: remote.data, initialized: true, syncedAt: Date.now(), syncError: null };
            projectRecord(next); return next;
          });
        }
        failures.delete(key);
        useSyncStore.setState({ error: null });
      });
      waitingForLease = !acquired;
    } catch (error) {
      failed = true;
      if (error instanceof SessionExpiredError) {
        if (startedVersion === getAuthVersion() && allowed(record)) pauseSynchronization();
      }
      else {
        invalidateRemote(record.sheetId);
        await updateLocal(key, (latest) => {
          if (!latest) throw new Error('Lokálna tabuľka chýba.');
          return { ...latest, syncError: errorMessage(error) };
        }).catch((reason) => useSyncStore.setState({ error: errorMessage(reason) }));
      }
    } finally { useSyncStore.setState((state) => ({ syncing: state.syncing.filter((entry) => entry !== key) })); }
  })().catch((error) => { failed = true; useSyncStore.setState({ error: errorMessage(error) }); });
  running.set(key, work);
  await work; running.delete(key);
  const latest = await readLocal(key).catch(() => null);
  if (latest && allowed(latest) && (latest.operations.length || !latest.initialized)) {
    const attempts = failed ? (failures.get(key) ?? 0) + 1 : 0; failures.set(key, attempts);
    if (attempts < 6) requestSync(key, waitingForLease ? 3000 : failed ? Math.min(60000, 2000 * 2 ** attempts) : 100);
  }
}
export async function wakeSynchronization() {
  try {
    for (const record of await listLocal()) if (allowed(record)) { failures.delete(record.key); requestSync(record.key, 50); }
  } catch (error) { useSyncStore.setState({ error: errorMessage(error) }); }
}
export function startLocalSync(): () => void {
  const online = () => { useSyncStore.setState({ online: navigator.onLine !== false }); if (navigator.onLine !== false) void wakeSynchronization(); };
  const visible = () => { if (document.visibilityState === 'visible') void wakeSynchronization(); };
  window.addEventListener('online', online); window.addEventListener('offline', online); window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
  const unsubscribe = subscribeLocal((key) => { if (!running.has(key)) void readLocal(key).then((record) => { if (record && allowed(record) && (record.operations.length || !record.initialized)) requestSync(key); }).catch(() => {}); });
  online();
  return () => { unsubscribe(); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); window.removeEventListener('online', online); window.removeEventListener('offline', online); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
}
