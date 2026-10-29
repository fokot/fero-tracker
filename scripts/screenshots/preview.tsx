// Development-only capture fixture. This mounts the real tracker components with
// sample store snapshots; it never signs in, opens IndexedDB, or calls Google.
// Run npm run dev and open /scripts/screenshots/?lang=en (or ?lang=sk).
// Capture at 390 × 844; use the real bottom navigation for the Workouts image.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Tracker } from '../../src/components/Tracker';
import { useHabitStore } from '../../src/store/useHabitStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useSyncStore } from '../../src/store/useSyncStore';
import { dateKey } from '../../src/lib/dates';
import { setLocale, startLocale } from '../../src/i18n/locale';
import type { Habit } from '../../src/lib/types';
import '../../src/index.css';

const locale = new URLSearchParams(location.search).get('lang') === 'sk' ? 'sk' : 'en';
setLocale(locale); startLocale();
document.documentElement.dataset.theme = 'light';
const user = { id: 'documentation-sample', email: 'demo@example.com', name: 'Fero' };
const today = new Date(), selectedDate = dateKey(today);
const names = locale === 'sk'
  ? ['Ranná prechádzka', 'Čítanie', 'Spánok (h)', 'Voda (l)', 'Strečing', 'Večer bez mobilu']
  : ['Morning walk', 'Reading', 'Sleep (h)', 'Water (l)', 'Stretching', 'Screen-free evening'];
const types = ['boolean', 'numeric', 'numeric', 'numeric', 'boolean', 'boolean'] as const;
const habits: Habit[] = names.map((name, index) => ({ id: `sample-habit-${index}`, name, type: types[index] }));
const habitValues = Object.fromEntries(Array.from({ length: 31 }, (_, index) => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30 + index, 12);
  const values = [index % 4 === 0 ? '' : '✓', String([12, 18, 24, 8, 16][index % 5]), [7.5, 8, 7, 8.5][index % 4].toString(), [2, 2.5, 1.5, 2][index % 4].toString(), index % 3 === 0 ? '' : '✓', index % 5 === 0 ? '' : '✓'];
  return [dateKey(date), Object.fromEntries(names.map((name, item) => [name, values[item]]))];
}));
const workouts = {
  'Bench press': [{ reps: 8, weight: 50 }, { reps: 6, weight: 60 }, { reps: 5, weight: 65 }],
  [locale === 'sk' ? 'Drep' : 'Squat']: [{ reps: 8, weight: 60 }, { reps: 8, weight: 70 }, { reps: 6, weight: 75 }],
};
useHabitStore.setState({ user, spreadsheetId: 'sample-habits', habits, habitValues, hasLoaded: true, isLoading: false,
  pendingWrites: 0, queuedWrites: 0, error: null, syncError: null, syncedAt: Date.now(), localKey: null,
  loadHabitsAndValues: async () => {},
});
useWorkoutStore.setState({ user, spreadsheetId: 'sample-workouts', workouts, exercises: Object.keys(workouts), loadedDate: selectedDate,
  isLoading: false, pendingWrites: 0, queuedWrites: 0, error: null, syncError: null, syncedAt: Date.now(), localKey: null,
  loadDay: async () => {},
});
useSyncStore.setState({ online: true, authorizedUserId: user.id, syncing: [], error: null });
createRoot(document.getElementById('root')!).render(<React.StrictMode><Tracker onSignOut={() => {}} /></React.StrictMode>);
