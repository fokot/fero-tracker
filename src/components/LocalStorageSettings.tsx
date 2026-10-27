import { useEffect, useState } from 'react';
import { listLocal, subscribeLocal } from '../lib/localDatabase';
import { wakeSynchronization } from '../lib/localSync';
import { projectRecord, type LocalRecord } from '../lib/localModel';
import { errorMessage } from '../lib/types';
import { useSyncStore } from '../store/useSyncStore';

export function LocalStorageSettings({ userId }: { userId: string }) {
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { online, authorizedUserId } = useSyncStore();
  useEffect(() => {
    let current = true;
    const update = () => { void listLocal().then((all) => { if (current) setRecords(all.filter((record) => record.userId === userId)); }).catch((reason) => { if (current) setError(errorMessage(reason)); }); };
    const unsubscribe = subscribeLocal(update); update();
    return () => { current = false; unsubscribe(); };
  }, [userId]);
  const pending = records.filter((record) => record.operations.length || record.syncError);
  const download = async () => {
    try {
      const all = (await listLocal()).filter((record) => record.userId === userId);
      const backup = { version: 1, savedAt: new Date().toISOString(), records: all.map((record) => ({ ...record, data: projectRecord(record) })) };
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
      <a className="text-button" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(record.sheetId)}/edit`} target="_blank" rel="noreferrer">{record.kind === 'habits' ? 'Návyky' : 'Workouts'} · {record.operations.length} čakajúcich zmien</a>
      {record.syncError && <p className="field-help">{record.syncError}</p>}
    </div>)}
    <div className="sheet-setting-actions">
      {!!pending.length && <button className="secondary-button" disabled={!online || authorizedUserId !== userId} onClick={() => void wakeSynchronization()}>Synchronizovať</button>}
      <button className="text-button" disabled={!records.length} onClick={() => void download()}>Stiahnuť lokálnu zálohu</button>
    </div>
    <p className="field-help">Záloha obsahuje aj neodoslané zmeny. Vymazanie dát webu v prehliadači odstráni jeho lokálne záznamy.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
