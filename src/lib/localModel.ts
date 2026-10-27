import { isDateKey } from './dates';
import type { Habit, HabitValues, User } from './types';
import { validateWorkoutSets, type DayWorkouts, type WorkoutSet } from './workouts';
import type { TrackerKind } from './preferences';

export interface HabitData { kind: 'habits'; habits: Habit[]; values: HabitValues }
export interface WorkoutData { kind: 'workouts'; exercises: string[]; days: Record<string, DayWorkouts> }
export type TrackerData = HabitData | WorkoutData;
export type Change =
  | { type: 'habit-value'; habitId: string; date: string; value: string }
  | { type: 'habit-add'; habit: Habit }
  | { type: 'habit-rename'; habitId: string; name: string }
  | { type: 'habit-delete'; habitId: string }
  | { type: 'workout-sets'; date: string; name: string; sets: WorkoutSet[] }
  | { type: 'workout-rename'; previousName: string; name: string };
export interface LocalOperation { id: string; change: Change }
export interface LocalRecord {
  revision?: number;
  key: string; userId: string; sheetId: string; kind: TrackerKind;
  base: TrackerData; operations: LocalOperation[];
  batch: { id: string; operationIds: string[] } | null;
  initialized: boolean; syncedAt: number | null; syncError: string | null;
  lease?: { owner: string; expires: number };
}
export interface LocalSession { user: User; habitsId: string | null; workoutsId: string | null }
export const recordKey = (userId: string, kind: TrackerKind, sheetId: string) => JSON.stringify([userId, kind, sheetId]);
export function emptyRecord(userId: string, kind: TrackerKind, sheetId: string): LocalRecord {
  return { key: recordKey(userId, kind, sheetId), userId, kind, sheetId, base: kind === 'habits' ? { kind, habits: [], values: {} } : { kind, exercises: [], days: {} }, operations: [], batch: null, initialized: false, syncedAt: null, syncError: null };
}
export function validName(input: string): string {
  const name = input.trim();
  if (!name || name.length > 100) throw new Error('Názov musí mať 1 až 100 znakov.');
  return name;
}
export function applyChange(source: TrackerData, change: Change): TrackerData {
  const data: TrackerData = structuredClone(source);
  if (data.kind === 'habits' && change.type.startsWith('habit-')) {
    if (change.type === 'habit-add') {
      const name = validName(change.habit.name);
      if (data.habits.some((habit) => habit.id === change.habit.id)) return data;
      if (data.habits.some((habit) => habit.name.toLowerCase() === name.toLowerCase())) throw new Error('Návyk s týmto názvom už existuje.');
      data.habits.push({ ...change.habit, name });
      return data;
    }
    if (change.type === 'habit-value' || change.type === 'habit-rename' || change.type === 'habit-delete') {
      const habit = data.habits.find((entry) => entry.id === change.habitId);
      if (!habit) { if (change.type === 'habit-delete') return data; throw new Error('Návyk už v Google Sheete neexistuje. Neodoslané zmeny zostali v zariadení.'); }
      if (change.type === 'habit-value') {
        if (!isDateKey(change.date)) throw new Error('Vyber platný dátum.');
        const value = change.value.trim();
        if (habit.type === 'boolean' && value !== '' && value !== '✓') throw new Error('Neplatná hodnota návyku.');
        if (habit.type === 'numeric' && value !== '' && (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))) throw new Error('Zadaj platné číslo alebo nechaj pole prázdne.');
        data.values[change.date] = { ...data.values[change.date], [habit.name]: value };
      } else {
        const previous = habit.name;
        if (change.type === 'habit-rename') {
          const name = validName(change.name);
          if (data.habits.some((entry) => entry.id !== habit.id && entry.name.toLowerCase() === name.toLowerCase())) throw new Error('Návyk s týmto názvom už existuje.');
          habit.name = name;
        } else data.habits = data.habits.filter((entry) => entry.id !== habit.id);
        for (const [date, values] of Object.entries(data.values)) {
          const next = { ...values }; delete next[previous];
          if (change.type === 'habit-rename' && Object.prototype.hasOwnProperty.call(values, previous)) Object.defineProperty(next, habit.name, { value: values[previous], writable: true, enumerable: true, configurable: true });
          data.values[date] = next;
        }
      }
      return data;
    }
  }
  if (data.kind === 'workouts') {
    if (change.type === 'workout-sets') {
      if (!isDateKey(change.date)) throw new Error('Vyber platný dátum.');
      const trimmed = validName(change.name);
      validateWorkoutSets(change.sets);
      const name = data.exercises.find((entry) => entry.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
      if (!data.exercises.includes(name)) {
        if (!change.sets.length) throw new Error('Pridaj aspoň jednu sériu.');
        data.exercises.push(name);
      }
      const day = { ...data.days[change.date] };
      if (change.sets.length) Object.defineProperty(day, name, { value: change.sets, enumerable: true, writable: true, configurable: true });
      else delete day[name];
      data.days[change.date] = day;
      return data;
    }
    if (change.type === 'workout-rename') {
      const name = validName(change.name);
      if (!data.exercises.includes(change.previousName)) throw new Error('Cvik už neexistuje. Neodoslané zmeny zostali v zariadení.');
      if (data.exercises.some((entry) => entry !== change.previousName && entry.toLowerCase() === name.toLowerCase())) throw new Error('Cvik s týmto názvom už existuje.');
      data.exercises = data.exercises.map((entry) => entry === change.previousName ? name : entry);
      for (const [date, day] of Object.entries(data.days)) data.days[date] = Object.fromEntries(Object.entries(day).map(([entry, sets]) => [entry === change.previousName ? name : entry, sets]));
      return data;
    }
  }
  throw new Error('Zmena nepatrí k tejto tabuľke.');
}
export function projectRecord(record: LocalRecord): TrackerData {
  return record.operations.reduce((data, operation) => applyChange(data, operation.change), record.base);
}
