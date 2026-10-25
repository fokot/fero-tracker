import { useEffect, useState } from 'react';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { HabitGrid } from './HabitGrid';
import { Workouts } from './Workouts';
import { Icon } from './Icon';

export function Tracker({ onSignOut }: { onSignOut: () => void }) {
  const user = useHabitStore((state) => state.user);
  const habitWrites = useHabitStore((state) => state.pendingWrites);
  const workoutWrites = useWorkoutStore((state) => state.pendingWrites);
  const [tab, setTab] = useState<'habits' | 'workouts'>('habits');
  const busy = habitWrites > 0 || workoutWrites > 0;
  useEffect(() => {
    if (user && useWorkoutStore.getState().user?.id !== user.id) useWorkoutStore.getState().setUser(user);
  }, [user]);
  return <div className="tracker-shell">
    <header className="app-header">
      <a className="brand" href="#main-content" aria-label="Fero Tracker, prejsť na obsah"><span className="brand-mark" aria-hidden="true"><Icon name="check" size={19} /></span>Fero<span className="brand-light">Tracker</span></a>
      <div className="account">
        <span className="account-email" title={user?.email}>{user?.email}</span>
        {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="account-avatar" /> : <span className="account-avatar account-initial" aria-hidden="true">{(user?.name || user?.email || 'F').slice(0, 1).toUpperCase()}</span>}
        <button onClick={onSignOut} disabled={busy} className="icon-button sign-out" aria-label="Sign out" title="Odhlásiť sa"><Icon name="logout" size={18} /></button>
      </div>
    </header>
    <nav aria-label="Sekcie trackera" className="app-nav">
      {(['habits', 'workouts'] as const).map((name) => <button key={name} onClick={() => setTab(name)} disabled={busy} aria-current={tab === name ? 'page' : undefined} className={`nav-item ${tab === name ? 'is-active' : ''}`}>
        <Icon name={name} size={23} /><span>{name === 'habits' ? 'Habits' : 'Workouts'}</span>
      </button>)}
    </nav>
    {tab === 'habits' ? <HabitGrid /> : <Workouts />}
  </div>;
}
