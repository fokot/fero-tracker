import { t } from '../i18n/messages';
import { useEffect, useState, type ReactNode } from 'react';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { HabitGrid } from './HabitGrid';
import { Workouts } from './Workouts';
import { Icon } from './Icon';
import { Settings } from './Settings';

export function Tracker({ onSignOut, connection }: { onSignOut: () => void; connection?: ReactNode }) {
  const user = useHabitStore((state) => state.user);
  const habitWrites = useHabitStore((state) => state.pendingWrites);
  const workoutWrites = useWorkoutStore((state) => state.pendingWrites);
  const [tab, setTab] = useState<'habits' | 'workouts'>('habits');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const busy = habitWrites > 0 || workoutWrites > 0 || settingsBusy;
  useEffect(() => {
    if (user && useWorkoutStore.getState().user?.id !== user.id) useWorkoutStore.getState().setUser(user);
  }, [user]);
  return <div className="tracker-shell">
    <header className="app-header">
      <a className="brand" href="#main-content" aria-label={t('nav.skip')}><span className="brand-mark" aria-hidden="true"><Icon name="check" size={19} /></span>Fero<span className="brand-light">Tracker</span></a>
      <div className="account">
        <span className="account-email" title={user?.email}>{user?.email}</span>
        {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="account-avatar" /> : <span className="account-avatar account-initial" aria-hidden="true">{(user?.name || user?.email || 'F').slice(0, 1).toUpperCase()}</span>}
        <button type="button" onClick={() => setSettingsOpen((open) => !open)} disabled={busy} className={`icon-button ${settingsOpen ? 'is-active' : ''}`} aria-label={t('common.settings')} aria-pressed={settingsOpen} title={t('common.settings')}><Icon name="settings" size={21} /></button>
        <button onClick={onSignOut} disabled={busy} className="icon-button sign-out" aria-label={t('nav.signOut')} title={t('nav.signOut')}><Icon name="logout" size={18} /></button>
      </div>
    </header>
    {connection}
    <nav aria-label={t('nav.sections')} className="app-nav">
      {(['habits', 'workouts'] as const).map((name) => <button key={name} onClick={() => { setTab(name); setSettingsOpen(false); }} disabled={busy} aria-current={!settingsOpen && tab === name ? 'page' : undefined} className={`nav-item ${!settingsOpen && tab === name ? 'is-active' : ''}`}>
        <Icon name={name} size={23} /><span>{name === 'habits' ? t('common.habits') : t('common.workouts')}</span>
      </button>)}
    </nav>
    {settingsOpen ? <Settings onBusy={setSettingsBusy} /> : tab === 'habits' ? <HabitGrid /> : <Workouts />}
  </div>;
}
