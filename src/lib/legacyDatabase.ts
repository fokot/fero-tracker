import type { LegacyRecord, LocalSession } from './legacyMigration';

let opening: Promise<IDBDatabase> | null = null;
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
export async function listLegacyRecords(): Promise<LegacyRecord[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('trackers').objectStore('trackers').getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
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
