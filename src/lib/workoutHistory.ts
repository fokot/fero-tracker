import type { DayWorkouts, WorkoutSet } from './workouts';

export type WorkoutHistory = Record<string, DayWorkouts>;
export type HistoryMode = 'last' | 'best' | 'none';
export function workoutReference(history: WorkoutHistory, name: string, date: string, mode: HistoryMode): { date: string; sets: WorkoutSet[] } | null {
  if (mode === 'none' || !name.trim()) return null;
  const days = Object.entries(history).filter(([day]) => day < date).sort(([a], [b]) => b.localeCompare(a));
  let best: { date: string; sets: WorkoutSet[] } | null = null;
  for (const [day, workouts] of days) {
    const sets = Object.entries(workouts).find(([exercise]) => exercise.trim().toLowerCase() === name.trim().toLowerCase())?.[1];
    if (!sets?.length) continue;
    if (mode === 'last') return { date: day, sets };
    for (const set of sets) {
      const current = best?.sets[0];
      if (!current || set.weight > current.weight || (set.weight === current.weight && set.reps > current.reps)) best = { date: day, sets: [set] };
    }
  }
  return best;
}
