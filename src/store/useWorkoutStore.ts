import { create } from 'zustand';
import { getOrCreateWorkoutSheet, loadWorkoutDay, saveWorkoutSets, renameWorkoutExercise } from '../lib/workoutSheets';
import { errorMessage, type User } from '../lib/types';
import { isDateKey } from '../lib/dates';
import { validateWorkoutSets, type DayWorkouts, type WorkoutSet } from '../lib/workouts';

interface WorkoutStore {
  user: User | null;
  spreadsheetId: string | null;
  exercises: string[];
  workouts: DayWorkouts;
  loadedDate: string | null;
  isLoading: boolean;
  pendingWrites: number;
  error: string | null;
  setUser: (user: User) => void;
  setSpreadsheet: (id: string) => void;
  clearUser: () => void;
  loadDay: (date: string) => Promise<void>;
  saveExercise: (date: string, name: string, sets: WorkoutSet[]) => Promise<boolean>;
  renameExercise: (date: string, previousName: string, name: string) => Promise<boolean>;
}

let sessionVersion = 0;
let loadVersion = 0;
let discovery: { version: number; promise: Promise<string> } | null = null;
const emptyState = () => ({ user: null, spreadsheetId: null, exercises: [], workouts: {}, loadedDate: null, isLoading: false, pendingWrites: 0, error: null });

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  ...emptyState(),
  setUser: (user) => {
    sessionVersion++;
    loadVersion++;
    discovery = null;
    set({ ...emptyState(), user });
  },
  clearUser: () => {
    sessionVersion++;
    loadVersion++;
    discovery = null;
    set(emptyState());
  },
  setSpreadsheet: (spreadsheetId) => {
    if (get().pendingWrites) return;
    sessionVersion++;
    loadVersion++;
    discovery = null;
    set({ ...emptyState(), user: get().user, spreadsheetId });
  },
  loadDay: async (date) => {
    const { user, pendingWrites } = get();
    if (!user || pendingWrites) return;
    const session = sessionVersion, request = ++loadVersion;
    const isCurrent = () => session === sessionVersion && request === loadVersion;
    if (!isDateKey(date)) { set({ error: 'Vyber platný dátum.' }); return; }
    set({ isLoading: true, error: null });
    try {
      let id = get().spreadsheetId;
      if (!id) {
        if (!discovery || discovery.version !== session) discovery = { version: session, promise: getOrCreateWorkoutSheet(user.email) };
        const pending = discovery;
        try { id = await pending.promise; }
        finally { if (discovery === pending) discovery = null; }
        if (!isCurrent()) return;
        set({ spreadsheetId: id });
      }
      const result = await loadWorkoutDay(id, date);
      if (isCurrent()) set({ ...result, loadedDate: date, isLoading: false });
    } catch (error) {
      if (isCurrent()) set({ error: errorMessage(error), isLoading: false });
    }
  },
  saveExercise: async (date, name, sets) => {
    const { spreadsheetId, loadedDate, isLoading, pendingWrites } = get();
    if (!spreadsheetId || loadedDate !== date || isLoading || pendingWrites) return false;
    const session = sessionVersion;
    const isCurrent = () => session === sessionVersion;
    const savedSets = sets.map((entry) => ({ ...entry }));
    set({ pendingWrites: 1, error: null });
    try {
      validateWorkoutSets(savedSets);
      const canonical = await saveWorkoutSets(spreadsheetId, date, name, savedSets);
      if (!isCurrent()) return false;
      set((state) => {
        const workouts: DayWorkouts = Object.assign(Object.create(null) as DayWorkouts, state.workouts);
        if (savedSets.length) workouts[canonical] = savedSets;
        else delete workouts[canonical];
        return { workouts, exercises: state.exercises.includes(canonical) ? state.exercises : [...state.exercises, canonical] };
      });
      return true;
    } catch (error) {
      if (isCurrent()) set({ error: errorMessage(error) });
      return false;
    } finally {
      if (isCurrent()) set({ pendingWrites: 0 });
    }
  },
  renameExercise: async (date, previousName, name) => {
    const { spreadsheetId, loadedDate, isLoading, pendingWrites, workouts } = get();
    if (!spreadsheetId || loadedDate !== date || isLoading || pendingWrites) return false;
    const session = sessionVersion;
    if (!Object.prototype.hasOwnProperty.call(workouts, previousName)) { set({ error: 'Cvik v tomto dni už neexistuje.' }); return false; }
    set({ pendingWrites: 1, error: null });
    try {
      const canonical = await renameWorkoutExercise(spreadsheetId, previousName, name);
      if (session !== sessionVersion) return false;
      set((state) => ({
        exercises: state.exercises.map((entry) => entry === previousName ? canonical : entry),
        workouts: Object.fromEntries(Object.entries(state.workouts).map(([entry, sets]) => [entry === previousName ? canonical : entry, sets])),
      }));
      return true;
    } catch (error) {
      if (session === sessionVersion) set({ error: errorMessage(error) });
      return false;
    } finally {
      if (session === sessionVersion) set({ pendingWrites: 0 });
    }
  },
}));
