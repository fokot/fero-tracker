import { create } from 'zustand';
import { getOrCreateWorkoutSheet } from '../lib/workoutSheets';
import { errorMessage, type User } from '../lib/types';
import { isDateKey } from '../lib/dates';
import type { DayWorkouts, WorkoutSet } from '../lib/workouts';
import { readLocal, subscribeLocal } from '../lib/localDatabase';
import { enqueueLocal, ensureLocal, requestSync, synchronizeRecord } from '../lib/localSync';
import { projectRecord, recordKey, type Change, type LocalRecord } from '../lib/localModel';
import { useSyncStore } from './useSyncStore';

interface WorkoutStore {
  user: User | null; spreadsheetId: string | null; exercises: string[]; workouts: DayWorkouts;
  loadedDate: string | null; isLoading: boolean; pendingWrites: number; error: string | null;
  localKey: string | null; queuedWrites: number; syncError: string | null; syncedAt: number | null;
  setUser: (user: User) => void; setSpreadsheet: (id: string) => void; clearUser: () => void;
  loadDay: (date: string, refresh?: boolean) => Promise<void>;
  saveExercise: (date: string, name: string, sets: WorkoutSet[]) => Promise<boolean>;
  renameExercise: (date: string, previousName: string, name: string) => Promise<boolean>;
}
const emptyState = () => ({ user: null, spreadsheetId: null, exercises: [], workouts: {}, loadedDate: null, isLoading: false, pendingWrites: 0, error: null, localKey: null, queuedWrites: 0, syncError: null, syncedAt: null });
let sessionVersion = 0, publishedRevision = -1;
let viewDate: string | null = null;
let unsubscribe: (() => void) | undefined;
let discovery: Promise<string> | null = null;

export const useWorkoutStore = create<WorkoutStore>((set, get) => {
  const publish = (record: LocalRecord, version: number) => {
    if (version !== sessionVersion || record.key !== get().localKey || (record.revision ?? 0) < publishedRevision) return;
    const data = projectRecord(record); if (data.kind !== 'workouts') return;
    publishedRevision = record.revision ?? 0;
    set({ exercises: data.exercises, workouts: viewDate ? data.days[viewDate] ?? {} : {}, loadedDate: record.initialized ? viewDate : null, isLoading: false, queuedWrites: record.operations.length, syncError: record.syncError, syncedAt: record.syncedAt });
  };
  const attach = (id: string) => {
    const user = get().user; if (!user) return;
    const version = ++sessionVersion; unsubscribe?.(); publishedRevision = -1;
    const key = recordKey(user.id, 'workouts', id);
    set({ ...emptyState(), user, spreadsheetId: id, localKey: key, isLoading: true });
    unsubscribe = subscribeLocal((changed) => { if (changed === key) void readLocal(key).then((record) => { if (record) publish(record, version); }).catch((error) => { if (version === sessionVersion) set({ error: errorMessage(error) }); }); });
  };
  const hydrate = async (version: number) => {
    const { user, spreadsheetId } = get(); if (!user || !spreadsheetId) return;
    const record = await ensureLocal(user.id, 'workouts', spreadsheetId); publish(record, version); if (!record.initialized) requestSync(record.key, 0);
  };
  const mutate = async (date: string, change: Change): Promise<boolean> => {
    const { localKey, loadedDate } = get(), version = sessionVersion;
    if (!localKey || loadedDate !== date) return false;
    set((state) => ({ pendingWrites: state.pendingWrites + 1, error: null }));
    try { const record = await enqueueLocal(localKey, () => change); publish(record, version); return version === sessionVersion; }
    catch (error) { if (version === sessionVersion) set({ error: errorMessage(error) }); return false; }
    finally { if (version === sessionVersion) set((state) => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) })); }
  };
  return {
    ...emptyState(),
    setUser: (user) => { sessionVersion++; unsubscribe?.(); unsubscribe = undefined; discovery = null; viewDate = null; publishedRevision = -1; set({ ...emptyState(), user }); },
    clearUser: () => { sessionVersion++; unsubscribe?.(); unsubscribe = undefined; discovery = null; viewDate = null; publishedRevision = -1; set(emptyState()); },
    setSpreadsheet: (id) => {
      if (!get().pendingWrites) { viewDate = null; attach(id); const version = sessionVersion; void hydrate(version).catch((error) => { if (version === sessionVersion) set({ error: errorMessage(error), isLoading: false }); }); }
    },
    loadDay: async (date, refresh = false) => {
      if (!isDateKey(date)) { set({ error: 'Vyber platný dátum.' }); return; }
      viewDate = date; const original = sessionVersion; let version = original, discovered = false;
      const user = get().user; if (!user) return;
      try {
        if (!get().spreadsheetId) {
          if (!useSyncStore.getState().online || useSyncStore.getState().authorizedUserId !== user.id) { set({ error: 'Prvé pripojenie tréningovej tabuľky vyžaduje internet a prihlásenie.', isLoading: false }); return; }
          set({ isLoading: true, error: null });
          discovery ??= getOrCreateWorkoutSheet(user.email);
          const pending = discovery;
          let id: string;
          try { id = await pending; } finally { if (discovery === pending) discovery = null; }
          if (original !== sessionVersion) return;
          if (!get().spreadsheetId) { attach(id); discovered = true; }
        }
        version = sessionVersion;
        await hydrate(version);
        if ((refresh || discovered) && version === sessionVersion && get().localKey) await synchronizeRecord(get().localKey!, true);
      } catch (error) { if (version === sessionVersion && get().user?.id === user.id) set({ error: errorMessage(error), isLoading: false }); }
    },
    saveExercise: (date, name, sets) => mutate(date, { type: 'workout-sets', date, name, sets: sets.map((set) => ({ ...set })) }),
    renameExercise: (date, previousName, name) => mutate(date, { type: 'workout-rename', previousName, name }),
  };
});
