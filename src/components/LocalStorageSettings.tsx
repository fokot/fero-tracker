import { useEffect, useState } from 'react';
import type { StoredTable } from '@fokot/sheetbase';
import { trackerStorage, wakeSynchronization } from '../lib/sheetbase';
import { errorMessage } from '../lib/types';
import { useSyncStore } from '../store/useSyncStore';

export function LocalStorageSettings({ userId }: { userId: string }) {
  const [records, setRecords] = useState<StoredTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { online, authorizedUserId } = useSyncStore();
  useEffect(() => {
    let current = true;
    const update = () => { void trackerStorage().list().then(all => {
      if (current) setRecords(all.filter(record => record.target.accountId === userId));
    }).catch(reason => { if (current) setError(errorMessage(reason)); }); };
    const unsubscribe = trackerStorage().subscribe(update); update();
    return () => { current = false; unsubscribe(); };
  }, [userId]);
  const pending = records.filter((record) => record.operations.length || record.error?.message);
  const download = async () => {
    try {
      const all = (await trackerStorage().list()).filter((record) => record.target.accountId === userId);
      const backup = { version: 2, savedAt: new Date().toISOString(), records: all };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `fero-tracker-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(errorMessage(reason)); }
  };
  return <section className="settings-section" aria-labelledby="local-title">
    <h2 id="local-title">Lokálne záznamy</h2>
    <p className="field-help">Úpravy sa najprv uložia v tomto prehliadači. Do Google Sheets sa odošlú na pozadí, keď máš spojenie a platné prihlásenie.</p>
    <p className="field-help">{pending.length ? 'Tieto tabuľky ešte čakajú na synchronizáciu. Aj po zmene pripojenia sa úpravy odošlú do pôvodnej tabuľky.' : 'Žiadne čakajúce zmeny.'}</p>
    {pending.map((record) => <div className="local-queue-item" key={record.key}>
      <a className="text-button" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(record.target.spreadsheetId)}/edit`} target="_blank" rel="noreferrer">{record.target.sheet === 'Habits' ? 'Návyky' : 'Workouts'} · {record.operations.length} čakajúcich zmien</a>
      {record.error?.message && <p className="field-help">{record.error?.message}</p>}
    </div>)}
    <div className="sheet-setting-actions">
      {!!pending.length && <button className="secondary-button" disabled={!online || authorizedUserId !== userId} onClick={() => void wakeSynchronization()}>Synchronizovať</button>}
      <button className="text-button" disabled={!records.length} onClick={() => void download()}>Stiahnuť lokálnu zálohu</button>
    </div>
    <p className="field-help">Záloha obsahuje aj neodoslané zmeny. Vymazanie dát webu v prehliadači odstráni jeho lokálne záznamy.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
