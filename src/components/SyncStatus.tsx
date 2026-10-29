import { translateError, t } from '../i18n/messages';
import { useSyncStore } from '../store/useSyncStore';
import { synchronizeRecord } from '../lib/sheetbase';

interface Props {
  localKey: string | null; pendingWrites: number; queuedWrites: number;
  syncError: string | null; syncedAt: number | null; ready: boolean;
}
export function SyncStatus({ localKey, pendingWrites, queuedWrites, syncError, syncedAt, ready }: Props) {
  const { online, authorizedUserId, syncing, error } = useSyncStore();
  const working = !!localKey && syncing.includes(localKey);
  const problem = syncError || error;
  const pending = pendingWrites > 0 || queuedWrites > 0 || !online || !authorizedUserId || working;
  const label = pendingWrites ? t('sync.saving')
    : !ready ? online && authorizedUserId ? problem ? t('sync.failedLoad') : t('sync.loading') : t('sync.firstLoad')
    : !online ? `${t('sync.offline')}${queuedWrites ? ` (${queuedWrites})` : ''}`
    : problem ? t('sync.failed')
    : !authorizedUserId ? t('sync.local')
    : working ? t('sync.working')
    : queuedWrites ? t('sync.waiting', { count: queuedWrites })
    : syncedAt ? t('sync.done') : t('sync.local');
  return <div className="sync-detail">
    <span role="status" aria-live="polite" className={`sync-status ${problem ? 'has-error' : ''}`}><span className={`status-dot ${pending ? 'is-pending' : ''}`} />{label}</span>
    {problem && <details className="sync-problem"><summary>{t('common.details')}</summary><p>{translateError(problem)}</p><p>{t('sync.retained')}</p>{localKey && online && authorizedUserId && <button type="button" className="text-button" disabled={working} onClick={() => void synchronizeRecord(localKey, true)}>{t('sync.retry')}</button>}</details>}
  </div>;
}
