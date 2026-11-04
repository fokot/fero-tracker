import type { WorkoutHistory } from './workoutHistory';

export type WorkoutMetric = 'weight' | 'volume' | 'set';
export interface WorkoutPoint { date: string; value: number }
export function workoutPoints(history: WorkoutHistory, name: string, metric: WorkoutMetric): WorkoutPoint[] {
  return Object.entries(history).flatMap(([date, exercises]) => {
    const sets = exercises[name];
    if (!sets?.length) return [];
    const values = sets.map(set => metric === 'weight' ? set.weight : set.weight * set.reps);
    return [{ date, value: metric === 'volume' ? values.reduce((sum, value) => sum + value, 0) : Math.max(...values) }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}
