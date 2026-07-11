import { create } from 'zustand';
import {
  readHabitsInRange,
  writeHabitValue,
  getAllHabits,
} from '../lib/googleSheets';

interface Habit {
  id: string;
  name: string;
  type: 'boolean' | 'numeric';
}

interface User {
  email: string;
  name?: string;
  picture?: string;
}

interface HabitStore {
  user: User | null;
  spreadsheetId: string | null;
  habits: Habit[];
  habitValues: Record<string, Record<string, string>>; // date -> habitName -> value
  isLoading: boolean;
  error: string | null;

  setUser: (user: User) => void;
  clearUser: () => void;
  setSpreadsheetId: (id: string) => void;

  loadHabitsAndValues: (startDate: Date, endDate: Date) => Promise<void>;
  addHabit: (name: string, type: 'boolean' | 'numeric') => Promise<void>;
  toggleHabit: (habitName: string, date: string) => Promise<void>;
  setNumericValue: (habitName: string, date: string, value: string) => Promise<void>;
}

export const useHabitStore = create<HabitStore>((set, get) => ({
  user: null,
  spreadsheetId: null,
  habits: [],
  habitValues: {},
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),

  clearUser: () => set({
    user: null,
    spreadsheetId: null,
    habits: [],
    habitValues: {},
  }),

  setSpreadsheetId: (id) => set({ spreadsheetId: id }),

  loadHabitsAndValues: async (startDate, endDate) => {
    const { spreadsheetId } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      // Get all habits from the sheet
      const allHabits = await getAllHabits(spreadsheetId);

      // Get values for date range
      const values = await readHabitsInRange(spreadsheetId, startDate, endDate);

      // Transform values into nested object for quick lookup
      const habitValues: Record<string, Record<string, string>> = {};
      values.forEach((v) => {
        if (!habitValues[v.date]) habitValues[v.date] = {};
        habitValues[v.date][v.habitName] = v.value;
      });

      const habits: Habit[] = allHabits.map((name, index) => ({
        id: `habit_${index}`,
        name,
        type: 'boolean', // Default to boolean
      }));

      set({ habits, habitValues, isLoading: false });
    } catch (error) {
      console.error('Failed to load habits:', error);
      set({ error: 'Failed to load habits', isLoading: false });
    }
  },

  addHabit: async (name, type) => {
    const { spreadsheetId, habits } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      // For now, just add to local state
      // In production, you'd write this to the sheet as a new habit entry
      const newHabit = {
        id: `habit_${Date.now()}`,
        name,
        type,
      };

      set({ habits: [...habits, newHabit], isLoading: false });
    } catch (error) {
      console.error('Failed to add habit:', error);
      set({ error: 'Failed to add habit', isLoading: false });
    }
  },

  toggleHabit: async (habitName, date) => {
    const { spreadsheetId, habitValues } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      const currentValues = { ...habitValues };

      if (!currentValues[date]) {
        currentValues[date] = {};
      }

      const current = currentValues[date][habitName];
      const newValue = current === '✓' ? '' : '✓';

      currentValues[date][habitName] = newValue;

      // Write to sheet
      await writeHabitValue(spreadsheetId, date, habitName, newValue);

      set({ habitValues: currentValues, isLoading: false });
    } catch (error) {
      console.error('Failed to toggle habit:', error);
      set({ error: 'Failed to update habit', isLoading: false });
    }
  },

  setNumericValue: async (habitName, date, value) => {
    const { spreadsheetId, habitValues } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      const currentValues = { ...habitValues };

      if (!currentValues[date]) {
        currentValues[date] = {};
      }

      currentValues[date][habitName] = value;

      // Write to sheet
      await writeHabitValue(spreadsheetId, date, habitName, value);

      set({ habitValues: currentValues, isLoading: false });
    } catch (error) {
      console.error('Failed to set numeric value:', error);
      set({ error: 'Failed to update habit', isLoading: false });
    }
  },
}));
