import { useEffect, useState } from 'react';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { HabitGrid } from './HabitGrid';
import { Workouts } from './Workouts';

export function Tracker({ onSignOut }: { onSignOut: () => void }) {
  const user = useHabitStore((state) => state.user);
  const habitWrites = useHabitStore((state) => state.pendingWrites);
  const workoutWrites = useWorkoutStore((state) => state.pendingWrites);
  const [tab, setTab] = useState<'habits' | 'workouts'>('habits');
  const busy = habitWrites > 0 || workoutWrites > 0;
  useEffect(() => {
    if (user && useWorkoutStore.getState().user?.id !== user.id) useWorkoutStore.getState().setUser(user);
  }, [user]);
  return <div className="min-h-screen bg-gray-50">
    <header className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 pt-3">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <p className="text-xl font-bold text-gray-900">Fero Tracker</p>
          <div className="flex items-center gap-3 min-w-0">
            {user?.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />}
            <span className="text-sm text-gray-700 truncate max-w-[12rem]">{user?.email}</span>
            <button onClick={onSignOut} disabled={busy} className="px-2 py-3 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">Sign out</button>
          </div>
        </div>
        <nav aria-label="Sekcie trackera" className="flex gap-6 mt-2">
          {(['habits', 'workouts'] as const).map((name) => <button key={name} onClick={() => setTab(name)} disabled={busy}
            aria-current={tab === name ? 'page' : undefined}
            className={`px-1 py-3 text-sm font-semibold border-b-2 disabled:opacity-50 ${tab === name ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
            {name === 'habits' ? 'Habits' : 'Workouts'}
          </button>)}
        </nav>
      </div>
    </header>
    {tab === 'habits' ? <HabitGrid /> : <Workouts />}
  </div>;
}
