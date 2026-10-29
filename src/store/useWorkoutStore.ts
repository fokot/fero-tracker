import { create } from 'zustand';
import type { Columns, Snapshot, Transaction } from '@fokot/sheetbase';
import { getOrCreateWorkoutSheet } from '../lib/workoutSheets';
import { errorMessage, type User } from '../lib/types';
import { isDateKey } from '../lib/dates';
import { validateWorkoutSets, type DayWorkouts, type WorkoutSet } from '../lib/workouts';
import { openTracker, trackerTable, synchronizeRecord, validName } from '../lib/sheetbase';
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
let sessionVersion = 0;
let viewDate: string | null = null;
let unsubscribe: (() => void) | undefined;
let discovery: Promise<string> | null = null;

export const useWorkoutStore = create<WorkoutStore>((set, get) => {
  const publish = (snapshot: Snapshot<Columns>, version: number) => {
    if (version !== sessionVersion) return;
    const day = snapshot.rows.find(row => row.key === viewDate)?.values ?? {};
    const workouts = Object.fromEntries(snapshot.columns.flatMap(column => day[column.id] ? [[column.header, day[column.id] as WorkoutSet[]]] : []));
    set({ exercises: snapshot.columns.map(column => column.header), workouts, loadedDate: snapshot.initialized ? viewDate : null, isLoading: false, queuedWrites: snapshot.pending, syncError: snapshot.error?.message ?? null, syncedAt: snapshot.syncedAt });
  };
  const attach = (id: string) => {
    const user = get().user; if (!user) return;
    const version = ++sessionVersion; unsubscribe?.();
    const table = trackerTable(user.id, 'workouts', id);
    set({ ...emptyState(), user, spreadsheetId: id, localKey: table.key, isLoading: true });
    unsubscribe = table.subscribe(snapshot => publish(snapshot, version));
  };
  const hydrate = async (version: number) => {
    const { user, spreadsheetId } = get(); if (!user || !spreadsheetId) return;
    const table = await openTracker(user.id, 'workouts', spreadsheetId); publish(table.snapshot(), version);
  };
  const mutate = async (date: string, change: (transaction: Transaction<Columns>) => void): Promise<boolean> => {
    const { user, spreadsheetId, loadedDate } = get(), version = sessionVersion;
    if (!user || !spreadsheetId || loadedDate !== date) return false;
    set(state => ({ pendingWrites: state.pendingWrites + 1, error: null }));
    try { await trackerTable(user.id, 'workouts', spreadsheetId).transaction(change); return version === sessionVersion; }
    catch (error) { if (version === sessionVersion) set({ error: errorMessage(error) }); return false; }
    finally { if (version === sessionVersion) set(state => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) })); }
  };
  return {
    ...emptyState(),
    setUser: user => { sessionVersion++; unsubscribe?.(); unsubscribe = undefined; discovery = null; viewDate = null; set({ ...emptyState(), user }); },
    clearUser: () => { sessionVersion++; unsubscribe?.(); unsubscribe = undefined; discovery = null; viewDate = null; set(emptyState()); },
    setSpreadsheet: id => {
      if (!get().pendingWrites) { viewDate = null; attach(id); const version = sessionVersion; void hydrate(version).catch(error => { if (version === sessionVersion) set({ error: errorMessage(error), isLoading: false }); }); }
    },
    loadDay: async (date, refresh = false) => {
      if (!isDateKey(date)) { set({ error: 'Vyber platný dátum.' }); return; }
      viewDate = date; const original = sessionVersion; let version = original, discovered = false;
      const user = get().user; if (!user) return;
      try {
        if (!get().spreadsheetId) {
          if (!useSyncStore.getState().online || useSyncStore.getState().authorizedUserId !== user.id) { set({ error: 'Prvé pripojenie tréningovej tabuľky vyžaduje internet a prihlásenie.', isLoading: false }); return; }
          set({ isLoading: true, error: null });
          discovery ??= getOrCreateWorkoutSheet(user.email); const pending = discovery;
          let id: string; try { id = await pending; } finally { if (discovery === pending) discovery = null; }
          if (original !== sessionVersion) return;
          if (!get().spreadsheetId) { attach(id); discovered = true; }
        }
        version = sessionVersion; await hydrate(version);
        if ((refresh || discovered) && version === sessionVersion && get().localKey) await synchronizeRecord(get().localKey!, true);
      } catch (error) { if (version === sessionVersion && get().user?.id === user.id) set({ error: errorMessage(error), isLoading: false }); }
    },
    saveExercise: (date, input, sets) => {
      const captured = sets.map(set => ({ ...set }));
      return mutate(date, transaction => {
        const name = validName(input); validateWorkoutSets(captured);
        let exercise = transaction.columns.find(column => column.header.toLowerCase() === name.toLowerCase());
        if (!exercise) {
          if (!captured.length) throw new Error('Pridaj aspoň jednu sériu.');
          exercise = { id: crypto.randomUUID(), header: name, type: 'sets' }; transaction.addColumn(exercise);
        }
        transaction.set(date, { [exercise.id]: captured.length ? captured : null });
      });
    },
    renameExercise: (date, previousName, input) => mutate(date, transaction => {
      const exercise = transaction.columns.find(column => column.header === previousName);
      if (!exercise) throw new Error('Cvik už neexistuje.');
      transaction.renameColumn(exercise.id, validName(input));
    }),
  };
});
