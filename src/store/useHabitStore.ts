import { create } from 'zustand';
import { errorMessage, type Habit, type HabitType, type HabitValues, type User } from '../lib/types';
import { readLocal, subscribeLocal } from '../lib/localDatabase';
import { enqueueLocal, ensureLocal, requestSync, synchronizeRecord } from '../lib/localSync';
import { projectRecord, recordKey, type Change, type LocalRecord, type TrackerData } from '../lib/localModel';

interface HabitStore {
  user: User | null; spreadsheetId: string | null; habits: Habit[]; habitValues: HabitValues;
  isLoading: boolean; hasLoaded: boolean; pendingWrites: number; error: string | null;
  localKey: string | null; queuedWrites: number; syncError: string | null; syncedAt: number | null;
  setSession: (user: User, spreadsheetId: string | null) => void;
  clearUser: () => void;
  loadHabitsAndValues: (start: Date, end: Date, refresh?: boolean) => Promise<void>;
  addHabit: (name: string, type: HabitType) => Promise<boolean>;
  renameHabit: (habitId: string, name: string) => Promise<boolean>;
  deleteHabit: (habitId: string) => Promise<boolean>;
  toggleHabit: (name: string, date: string) => Promise<boolean>;
  setNumericValue: (name: string, date: string, value: string) => Promise<boolean>;
}
const emptyState = () => ({ user: null, spreadsheetId: null, habits: [], habitValues: {}, isLoading: false, hasLoaded: false, pendingWrites: 0, error: null, localKey: null, queuedWrites: 0, syncError: null, syncedAt: null });
let sessionVersion = 0;
let unsubscribe: (() => void) | undefined;
let publishedRevision = -1;

export const useHabitStore = create<HabitStore>((set, get) => {
  const publish = (record: LocalRecord, version: number) => {
    if (version !== sessionVersion || record.key !== get().localKey || (record.revision ?? 0) < publishedRevision) return;
    const data = projectRecord(record); if (data.kind !== 'habits') return;
    publishedRevision = record.revision ?? 0;
    set({ habits: data.habits, habitValues: data.values, hasLoaded: record.initialized, isLoading: false, queuedWrites: record.operations.length, syncError: record.syncError, syncedAt: record.syncedAt });
  };
  const hydrate = async (version: number) => {
    const { user, spreadsheetId } = get(); if (!user || !spreadsheetId) return;
    try { const record = await ensureLocal(user.id, 'habits', spreadsheetId); publish(record, version); if (!record.initialized) requestSync(record.key, 0); }
    catch (error) { if (version === sessionVersion) set({ error: errorMessage(error), isLoading: false }); }
  };
  const mutate = async (make: (data: TrackerData) => Change): Promise<boolean> => {
    const key = get().localKey, version = sessionVersion;
    if (!key || !get().hasLoaded) return false;
    set((state) => ({ pendingWrites: state.pendingWrites + 1, error: null }));
    try { const record = await enqueueLocal(key, make); publish(record, version); return version === sessionVersion; }
    catch (error) { if (version === sessionVersion) set({ error: errorMessage(error) }); return false; }
    finally { if (version === sessionVersion) set((state) => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) })); }
  };
  return {
    ...emptyState(),
    setSession: (user, spreadsheetId) => {
      const version = ++sessionVersion; unsubscribe?.(); publishedRevision = -1;
      const key = spreadsheetId ? recordKey(user.id, 'habits', spreadsheetId) : null;
      set({ ...emptyState(), user, spreadsheetId, localKey: key, isLoading: !!key });
      unsubscribe = subscribeLocal((changed) => { if (changed === key) void readLocal(changed).then((record) => { if (record) publish(record, version); }).catch((error) => { if (version === sessionVersion) set({ error: errorMessage(error) }); }); });
      void hydrate(version);
    },
    clearUser: () => { sessionVersion++; unsubscribe?.(); unsubscribe = undefined; publishedRevision = -1; set(emptyState()); },
    loadHabitsAndValues: async (_start, _end, refresh = false) => { const version = sessionVersion; await hydrate(version); if (refresh && version === sessionVersion && get().localKey) await synchronizeRecord(get().localKey!, true); },
    addHabit: (name, type) => {
      const habit: Habit = { id: crypto.randomUUID(), name: name.trim(), type };
      return mutate(() => ({ type: 'habit-add', habit }));
    },
    renameHabit: (habitId, name) => mutate(() => ({ type: 'habit-rename', habitId, name })),
    deleteHabit: (habitId) => mutate(() => ({ type: 'habit-delete', habitId })),
    toggleHabit: (name, date) => {
      const habitId = get().habits.find((habit) => habit.name === name && habit.type === 'boolean')?.id;
      if (!habitId) return Promise.resolve(false);
      return mutate((data) => {
        if (data.kind !== 'habits') throw new Error('Neplatná tabuľka.');
        const habit = data.habits.find((habit) => habit.id === habitId);
        if (!habit) throw new Error('Návyk už neexistuje.');
        return { type: 'habit-value', habitId, date, value: data.values[date]?.[habit.name] === '✓' ? '' : '✓' };
      });
    },
    setNumericValue: (name, date, value) => {
      const habitId = get().habits.find((habit) => habit.name === name && habit.type === 'numeric')?.id;
      return habitId ? mutate(() => ({ type: 'habit-value', habitId, date, value })) : Promise.resolve(false);
    },
  };
});
