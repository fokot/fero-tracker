import type { DynamicColumn, Operation, StoredTable } from '@fokot/sheetbase';
import type { Habit, HabitValues, User } from './types';
import { formatWorkoutSets, type DayWorkouts, type WorkoutSet } from './workouts';
import type { TrackerKind } from './preferences';

// Only the old on-disk format lives here. All new edits use Sheetbase operations.
type HabitData = { kind: 'habits'; habits: Habit[]; values: HabitValues };
type WorkoutData = { kind: 'workouts'; exercises: string[]; days: Record<string, DayWorkouts> };
type Change =
  | { type: 'habit-add'; habit: Habit } | { type: 'habit-value'; habitId: string; date: string; value: string }
  | { type: 'habit-rename'; habitId: string; name: string } | { type: 'habit-delete'; habitId: string }
  | { type: 'workout-sets'; date: string; name: string; sets: WorkoutSet[] }
  | { type: 'workout-rename'; previousName: string; name: string };
export interface LegacyRecord {
  key: string; userId: string; sheetId: string; kind: TrackerKind; base: HabitData | WorkoutData;
  operations: { id: string; change: Change }[]; batch: { id: string; operationIds: string[] } | null;
  initialized: boolean; syncedAt: number | null;
}
export interface LocalSession { user: User; habitsId: string | null; workoutsId: string | null }
export function convertLegacy(record: LegacyRecord): Pick<StoredTable, 'base' | 'columns' | 'operations' | 'batch' | 'initialized' | 'syncedAt'> {
  const data = record.base;
  let columns: DynamicColumn[] = data.kind === 'habits'
    ? data.habits.map(habit => ({ id: habit.id, header: habit.name, type: habit.type }))
    : data.exercises.map(name => ({ id: `legacy:${name}`, header: name, type: 'sets' }));
  const original = structuredClone(columns);
  const base = Object.fromEntries(Object.entries(data.kind === 'habits' ? data.values : data.days).map(([date, values]) => [date,
    Object.fromEntries(columns.map(column => [column.id, data.kind === 'habits' ? (values as Record<string, string>)[column.header] ?? '' : formatWorkoutSets((values as DayWorkouts)[column.header] ?? [])]))]));
  const operations: Operation[] = [], protectedIds: string[] = [];
  for (const operation of record.operations) {
    const { change, id } = operation; const converted: Operation[] = [];
    const structural = (schema: NonNullable<Operation['schema']>, operationId = id) => converted.push({ id: operationId, key: '', values: {}, schema: structuredClone(schema), transaction: id });
    if (change.type === 'habit-add') { const column = { id: change.habit.id, header: change.habit.name, type: change.habit.type }; structural({ type: 'add', column }); columns.push(column); }
    else if (change.type === 'habit-value') converted.push({ id, key: change.date, values: { [change.habitId]: change.value.trim() } });
    else if (change.type === 'habit-rename' || change.type === 'workout-rename') {
      const column = columns.find(column => change.type === 'habit-rename' ? column.id === change.habitId : column.header === change.previousName);
      if (!column) throw new Error('Pôvodný stĺpec pre neodoslanú zmenu chýba. Stiahni lokálnu zálohu.');
      structural({ type: 'rename', id: column.id, header: change.name.trim() }); column.header = change.name.trim();
    } else if (change.type === 'habit-delete') { structural({ type: 'remove', id: change.habitId }); columns = columns.filter(column => column.id !== change.habitId); }
    else if (change.type === 'workout-sets') {
      let column = columns.find(column => column.header.toLowerCase() === change.name.trim().toLowerCase());
      if (!column) { column = { id: `legacy:${change.name.trim()}`, header: change.name.trim(), type: 'sets' }; columns.push(column); structural({ type: 'add', column: { ...column } }, `${id}:column`); }
      converted.push({ id, key: change.date, values: { [column.id]: formatWorkoutSets(change.sets) }, transaction: id });
    }
    operations.push(...converted);
    if (record.batch?.operationIds.includes(id)) protectedIds.push(...converted.map(entry => entry.id));
  }
  return { base, columns: original, operations, batch: record.batch ? { id: record.batch.id, operationIds: protectedIds } : null, initialized: record.initialized, syncedAt: record.syncedAt };
}
