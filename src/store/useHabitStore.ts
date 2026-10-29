import { create } from 'zustand';
import type { Columns, Snapshot, Transaction } from '@fokot/sheetbase';
import { errorMessage, type Habit, type HabitType, type HabitValues, type User } from '../lib/types';
import { openTracker, trackerTable, synchronizeRecord, validName } from '../lib/sheetbase';
import { isDateKey } from '../lib/dates';

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

export const useHabitStore = create<HabitStore>((set, get) => {
  const publish = (snapshot: Snapshot<Columns>, version: number) => {
    if (version !== sessionVersion) return;
    const habits = snapshot.columns.map(column => ({ id: column.id, name: column.header, type: column.type as HabitType }));
    const habitValues = Object.fromEntries(snapshot.rows.map(row => [row.key, Object.fromEntries(habits.map(habit => {
      const value = row.values[habit.id]; return [habit.name, value == null ? '' : habit.type === 'boolean' ? value ? '✓' : '' : String(value)];
    }))]));
    set({ habits, habitValues, hasLoaded: snapshot.initialized, isLoading: false, queuedWrites: snapshot.pending, syncError: snapshot.error?.message ?? null, syncedAt: snapshot.syncedAt });
  };
  const hydrate = async (version: number) => {
    const { user, spreadsheetId } = get(); if (!user || !spreadsheetId) return;
    const table = await openTracker(user.id, 'habits', spreadsheetId); publish(table.snapshot(), version);
  };
  const mutate = async (change: (transaction: Transaction<Columns>) => void): Promise<boolean> => {
    const { user, spreadsheetId, hasLoaded } = get(), version = sessionVersion;
    if (!user || !spreadsheetId || !hasLoaded) return false;
    set(state => ({ pendingWrites: state.pendingWrites + 1, error: null }));
    try { await trackerTable(user.id, 'habits', spreadsheetId).transaction(change); return version === sessionVersion; }
    catch (error) { if (version === sessionVersion) set({ error: errorMessage(error) }); return false; }
    finally { if (version === sessionVersion) set(state => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) })); }
  };
  return {
    ...emptyState(),
    setSession: (user, spreadsheetId) => {
      const version = ++sessionVersion; unsubscribe?.();
      const table = spreadsheetId ? trackerTable(user.id, 'habits', spreadsheetId) : null;
      set({ ...emptyState(), user, spreadsheetId, localKey: table?.key ?? null, isLoading: !!table });
      unsubscribe = table?.subscribe(snapshot => publish(snapshot, version));
      void hydrate(version).catch(error => { if (version === sessionVersion) set({ error: errorMessage(error), isLoading: false }); });
    },
    clearUser: () => { sessionVersion++; unsubscribe?.(); unsubscribe = undefined; set(emptyState()); },
    loadHabitsAndValues: async (_start, _end, refresh = false) => {
      const version = sessionVersion;
      try { await hydrate(version); if (refresh && version === sessionVersion && get().localKey) await synchronizeRecord(get().localKey!, true); }
      catch (error) { if (version === sessionVersion) set({ error: errorMessage(error), isLoading: false }); }
    },
    addHabit: (name, type) => mutate(transaction => transaction.addColumn({ id: crypto.randomUUID(), header: validName(name), type })),
    renameHabit: (id, name) => mutate(transaction => transaction.renameColumn(id, validName(name))),
    deleteHabit: id => mutate(transaction => transaction.removeColumn(id)),
    toggleHabit: (name, date) => mutate(transaction => {
      if (!isDateKey(date)) throw new Error('Vyber platný dátum.');
      const habit = transaction.columns.find(column => column.header === name && column.type === 'boolean');
      if (!habit) throw new Error('Návyk už neexistuje.');
      transaction.set(date, { [habit.id]: transaction.get(date)?.values[habit.id] === true ? null : true });
    }),
    setNumericValue: (name, date, input) => mutate(transaction => {
      if (!isDateKey(date)) throw new Error('Vyber platný dátum.');
      const habit = transaction.columns.find(column => column.header === name && column.type === 'numeric');
      if (!habit) throw new Error('Návyk už neexistuje.');
      const text = input.trim();
      if (text && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error('Zadaj platné číslo alebo nechaj pole prázdne.');
      transaction.set(date, { [habit.id]: text ? Number(text) : null });
    }),
  };
});
