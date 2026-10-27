import type { LocalRecord, LocalSession } from './localModel';

let opening: Promise<IDBDatabase> | null = null;
const listeners = new Set<(key: string) => void>();
let channel: BroadcastChannel | null = null;
function notify(key: string) {
  for (const listener of listeners) { try { listener(key); } catch { /* A committed save must still resolve. */ } }
  try { channel?.postMessage(key); } catch { /* Cross-tab notifications are optional. */ }
}
export function subscribeLocal(listener: (key: string) => void): () => void {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel('feros-tracker-local');
      channel.onmessage = (event: MessageEvent<unknown>) => { if (typeof event.data === 'string') for (const fn of listeners) { try { fn(event.data); } catch { /* Isolate listeners. */ } } };
    } catch { channel = null; }
  }
  listeners.add(listener); return () => { listeners.delete(listener); };
}
function database(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Prehliadač nepodporuje lokálne ukladanie.')); return; }
    const request = indexedDB.open('feros-tracker', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('trackers', { keyPath: 'key' });
      request.result.createObjectStore('session', { keyPath: 'id' });
    };
    request.onerror = () => reject(new Error('Lokálne úložisko sa nepodarilo otvoriť. Povoľ ukladanie dát v prehliadači.'));
    request.onblocked = () => reject(new Error('Zatvor staršie okno aplikácie a skús to znova.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
  }).catch((error: unknown) => { opening = null; throw error; });
  return opening;
}
export async function readLocal(key: string): Promise<LocalRecord | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('trackers').objectStore('trackers').get(key);
    request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
  });
}
export async function listLocal(): Promise<LocalRecord[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('trackers').objectStore('trackers').getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
// The read, new snapshot and outbox update commit together, across all tabs.
export async function updateLocal(key: string, update: (record: LocalRecord | null) => LocalRecord): Promise<LocalRecord> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('trackers', 'readwrite');
    const store = transaction.objectStore('trackers');
    let result: LocalRecord, failure: unknown;
    const request = store.get(key);
    request.onsuccess = () => {
      try { result = { ...update(request.result ?? null), revision: (request.result?.revision ?? 0) + 1 }; store.put(result); }
      catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => { notify(key); resolve(result); };
    transaction.onabort = transaction.onerror = () => reject(failure ?? new Error('Zmenu sa nepodarilo uložiť do zariadenia. Skontroluj voľné miesto a povolenia prehliadača.'));
  });
}
export async function readLocalSession(): Promise<LocalSession | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('session').objectStore('session').get('active');
    request.onsuccess = () => resolve(request.result?.value ?? null); request.onerror = () => reject(request.error);
  });
}
export async function saveLocalSession(value: LocalSession | null): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('session', 'readwrite'), store = transaction.objectStore('session');
    if (value) store.put({ id: 'active', value }); else store.delete('active');
    transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}
