import { t } from '../i18n/messages';
import { validateWorkoutSets, type WorkoutSet } from './workouts';

export interface DraftSet { id: number; reps: string; weight: string }
export interface WorkoutDraft { rows: DraftSet[]; nextId: number }
export const isEmptySet = (row: DraftSet) => !row.reps.trim() && !row.weight.trim();

function withEmptyRow(draft: WorkoutDraft): WorkoutDraft {
  if (draft.rows.length && isEmptySet(draft.rows[draft.rows.length - 1])) return draft;
  return { rows: [...draft.rows, { id: draft.nextId, reps: '', weight: '' }], nextId: draft.nextId + 1 };
}

export function createWorkoutDraft(sets: WorkoutSet[]): WorkoutDraft {
  return withEmptyRow({ rows: sets.map((set, id) => ({ id, reps: String(set.reps), weight: String(set.weight) })), nextId: sets.length });
}

export function updateWorkoutDraft(draft: WorkoutDraft, id: number, field: 'reps' | 'weight', value: string): WorkoutDraft {
  return withEmptyRow({ ...draft, rows: draft.rows.map((row) => row.id === id ? { ...row, [field]: value } : row) });
}

export function removeWorkoutDraftRow(draft: WorkoutDraft, id: number): WorkoutDraft {
  return withEmptyRow({ ...draft, rows: draft.rows.filter((row) => row.id !== id) });
}

export function parseWorkoutDraft(rows: DraftSet[], allowEmpty: boolean): WorkoutSet[] {
  const filled = rows.filter((row) => !isEmptySet(row));
  if (!filled.length && !allowEmpty) throw new Error(t('error.addSet'));
  if (filled.some((row) => !row.reps.trim() || !row.weight.trim())) throw new Error(t('error.partialSet'));
  const sets = filled.map((row) => ({ reps: Number(row.reps), weight: Number(row.weight) }));
  validateWorkoutSets(sets);
  return sets;
}
