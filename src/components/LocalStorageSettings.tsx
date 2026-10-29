import { translateError, t } from '../i18n/messages';
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
    <h2 id="local-title">{t('local.title')}</h2>
    <p className="field-help">{t('local.help')}</p>
    <p className="field-help">{pending.length ? t('local.pendingHelp') : t('local.empty')}</p>
    {pending.map((record) => <div className="local-queue-item" key={record.key}>
      <a className="text-button" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(record.target.spreadsheetId)}/edit`} target="_blank" rel="noreferrer">{record.target.sheet === 'Habits' ? t('common.habits') : t('common.workouts')} · {t('local.pending', { count: record.operations.length })}</a>
      {record.error?.message && <p className="field-help">{translateError(record.error.message)}</p>}
    </div>)}
    <div className="sheet-setting-actions">
      {!!pending.length && <button className="secondary-button" disabled={!online || authorizedUserId !== userId} onClick={() => void wakeSynchronization()}>{t('local.sync')}</button>}
      <button className="text-button" disabled={!records.length} onClick={() => void download()}>{t('local.backup')}</button>
    </div>
    <p className="field-help">{t('local.backupHelp')}</p>
    {error && <p role="alert" className="form-error">{translateError(error)}</p>}
  </section>;
}
