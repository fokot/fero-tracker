import { create } from 'zustand';
import type { HistoryMode } from '../lib/workoutHistory';

const key = 'fero-tracker-workout-history';
const valid = (value: unknown): value is HistoryMode => value === 'last' || value === 'best' || value === 'none';
function read(): HistoryMode {
  try { const value = localStorage.getItem(key); return valid(value) ? value : 'last'; }
  catch { return 'last'; }
}
export const useWorkoutHistoryPreference = create<{ mode: HistoryMode; setMode: (mode: HistoryMode) => void }>(set => ({
  mode: read(),
  setMode: mode => {
    if (!valid(mode)) return;
    try { localStorage.setItem(key, mode); } catch { /* Keep the choice for this session. */ }
    set({ mode });
  },
}));
