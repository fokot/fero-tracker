import { useSyncStore } from '../store/useSyncStore';
import { synchronizeRecord } from '../lib/localSync';

interface Props {
  localKey: string | null; pendingWrites: number; queuedWrites: number;
  syncError: string | null; syncedAt: number | null; ready: boolean;
}
export function SyncStatus({ localKey, pendingWrites, queuedWrites, syncError, syncedAt, ready }: Props) {
  const { online, authorizedUserId, syncing, error } = useSyncStore();
  const working = !!localKey && syncing.includes(localKey);
  const problem = syncError || error;
  const pending = pendingWrites > 0 || queuedWrites > 0 || !online || !authorizedUserId || working;
  const label = pendingWrites ? 'Ukladám do zariadenia…'
    : !ready ? online && authorizedUserId ? problem ? 'Načítanie zlyhalo' : 'Načítavam z Googlu…' : 'Prvé načítanie vyžaduje pripojenie'
    : !online ? `Offline · uložené v zariadení${queuedWrites ? ` (${queuedWrites})` : ''}`
    : problem ? 'Uložené v zariadení · sync zlyhal'
    : !authorizedUserId ? 'Uložené v zariadení'
    : working ? 'Synchronizujem…'
    : queuedWrites ? `Čaká na synchronizáciu (${queuedWrites})`
    : syncedAt ? 'Synchronizované' : 'Uložené v zariadení';
  return <div className="sync-detail">
    <span role="status" aria-live="polite" className={`sync-status ${problem ? 'has-error' : ''}`}><span className={`status-dot ${pending ? 'is-pending' : ''}`} />{label}</span>
    {problem && <details className="sync-problem"><summary>Podrobnosti</summary><p>{problem}</p><p>Neodoslané zmeny zostali v tomto prehliadači.</p>{localKey && online && authorizedUserId && <button type="button" className="text-button" disabled={working} onClick={() => void synchronizeRecord(localKey, true)}>Skúsiť synchronizovať znova</button>}</details>}
  </div>;
}
