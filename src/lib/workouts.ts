import { t } from '../i18n/messages';
export interface WorkoutSet { reps: number; weight: number }
export type DayWorkouts = Record<string, WorkoutSet[]>;

export function validateWorkoutSets(sets: WorkoutSet[]): void {
  for (const { reps, weight } of sets) {
    if (!Number.isSafeInteger(reps) || reps <= 0) throw new Error(t('error.reps'));
    if (!Number.isFinite(weight) || weight < 0) throw new Error(t('error.weight'));
  }
}

export function formatWorkoutSets(sets: WorkoutSet[]): string {
  validateWorkoutSets(sets);
  return sets.map(({ reps, weight }) => `${reps}×${weight}`).join(', ');
}

export function parseWorkoutSets(value: string): WorkoutSet[] {
  if (!value.trim()) return [];
  const sets = value.split(',').map((part) => {
    const match = part.trim().match(/^(\d+)\s*[x×*]\s*((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(?:kg)?$/i);
    if (!match) throw new Error(t('error.setFormat'));
    return { reps: Number(match[1]), weight: Number(match[2]) };
  });
  validateWorkoutSets(sets);
  return sets;
}
