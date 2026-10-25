import { create } from 'zustand';
import { loadHabitData, saveHabit, writeHabitValue } from '../lib/googleSheets';
import { errorMessage, type Habit, type HabitType, type HabitValues, type User } from '../lib/types';

interface HabitStore {
  user: User | null;
  spreadsheetId: string | null;
  habits: Habit[];
  habitValues: HabitValues;
  isLoading: boolean;
  hasLoaded: boolean;
  pendingWrites: number;
  error: string | null;
  setSession: (user: User, spreadsheetId: string) => void;
  clearUser: () => void;
  loadHabitsAndValues: (start: Date, end: Date) => Promise<void>;
  addHabit: (name: string, type: HabitType) => Promise<boolean>;
  toggleHabit: (name: string, date: string) => Promise<boolean>;
  setNumericValue: (name: string, date: string, value: string) => Promise<boolean>;
}

let sessionVersion = 0;
let loadVersion = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
const emptyState = () => ({ user: null, spreadsheetId: null, habits: [], habitValues: {}, isLoading: false, hasLoaded: false, pendingWrites: 0, error: null });

export const useHabitStore = create<HabitStore>((set, get) => {
  function mutate(operation: (id: string, isCurrent: () => boolean) => Promise<void>): Promise<boolean> {
    const { spreadsheetId, isLoading, hasLoaded } = get();
    if (!spreadsheetId || isLoading || !hasLoaded) return Promise.resolve(false);
    const version = sessionVersion;
    const isCurrent = () => version === sessionVersion;
    set((state) => ({ pendingWrites: state.pendingWrites + 1, error: null }));
    const next = mutationQueue.catch(() => {}).then(async () => {
      if (!isCurrent()) return false;
      try {
        await operation(spreadsheetId, isCurrent);
        return isCurrent();
      } catch (error) {
        if (isCurrent()) set({ error: errorMessage(error) });
        return false;
      } finally {
        if (isCurrent()) set((state) => ({ pendingWrites: state.pendingWrites - 1 }));
      }
    });
    mutationQueue = next;
    return next;
  }

  function writeValue(name: string, date: string, value: string, isCurrent: () => boolean, id: string) {
    return writeHabitValue(id, date, name, value).then(() => {
      if (isCurrent()) set((state) => ({ habitValues: {
        ...state.habitValues,
        [date]: { ...state.habitValues[date], [name]: value },
      } }));
    });
  }

  return {
    ...emptyState(),
    setSession: (user, spreadsheetId) => {
      sessionVersion += 1;
      loadVersion += 1;
      mutationQueue = Promise.resolve();
      set({ ...emptyState(), user, spreadsheetId });
    },
    clearUser: () => {
      sessionVersion += 1;
      loadVersion += 1;
      mutationQueue = Promise.resolve();
      set(emptyState());
    },
    loadHabitsAndValues: async (start, end) => {
      const { spreadsheetId, pendingWrites } = get();
      if (!spreadsheetId || pendingWrites) return;
      const session = sessionVersion, request = ++loadVersion;
      const isCurrent = () => session === sessionVersion && request === loadVersion;
      set({ isLoading: true, error: null });
      try {
        const { habits, values } = await loadHabitData(spreadsheetId, start, end);
        if (!isCurrent()) return;
        const habitValues: HabitValues = Object.create(null) as HabitValues;
        for (const entry of values) {
          if (!habitValues[entry.date]) habitValues[entry.date] = Object.create(null) as Record<string, string>;
          habitValues[entry.date][entry.habitName] = entry.value;
        }
        set({ habits, habitValues, isLoading: false, hasLoaded: true });
      } catch (error) {
        if (isCurrent()) set({ error: errorMessage(error), isLoading: false });
      }
    },
    addHabit: (name, type) => mutate(async (id, isCurrent) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 100) throw new Error('Enter a habit name between 1 and 100 characters.');
      if (get().habits.some((habit) => habit.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('A habit with this name already exists.');
      const habit: Habit = { id: crypto.randomUUID(), name: trimmed, type };
      await saveHabit(id, habit);
      if (isCurrent()) set((state) => ({ habits: [...state.habits, habit] }));
    }),
    toggleHabit: (name, date) => mutate(async (id, isCurrent) => {
      if (!get().habits.some((habit) => habit.name === name && habit.type === 'boolean')) throw new Error('This habit cannot be toggled.');
      const value = get().habitValues[date]?.[name] === '✓' ? '' : '✓';
      await writeValue(name, date, value, isCurrent, id);
    }),
    setNumericValue: (name, date, input) => mutate(async (id, isCurrent) => {
      if (!get().habits.some((habit) => habit.name === name && habit.type === 'numeric')) throw new Error('This habit does not accept numbers.');
      const value = input.trim();
      if (value !== '' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) throw new Error('Enter a valid number or leave the value empty.');
      if (value !== '' && !Number.isFinite(Number(value))) throw new Error('Enter a finite number.');
      await writeValue(name, date, value, isCurrent, id);
    }),
  };
});
