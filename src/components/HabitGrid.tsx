import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useHabitStore } from '../store/useHabitStore';
import { dateKey, visibleDates } from '../lib/dates';
import type { HabitType } from '../lib/types';
import { Modal } from './Modal';

export function HabitGrid() {
  const { habits, habitValues, toggleHabit, setNumericValue, spreadsheetId,
    loadHabitsAndValues, addHabit, isLoading, hasLoaded, pendingWrites, error } = useHabitStore();
  const [today, setToday] = useState(() => dateKey(new Date()));
  const dates = useMemo(() => {
    const [year, month, day] = today.split('-').map(Number);
    return visibleDates(new Date(year, month - 1, day, 12));
  }, [today]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<HabitType>('boolean');
  const [editing, setEditing] = useState<{ name: string; date: string } | null>(null);
  const [number, setNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const syncing = isLoading || pendingWrites > 0;
  const busy = syncing || !hasLoaded;

  useEffect(() => {
    const update = () => setToday(dateKey(new Date()));
    const timer = setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (spreadsheetId) void loadHabitsAndValues(dates[0], dates[dates.length - 1]);
  }, [spreadsheetId, dates, loadHabitsAndValues]);

  const close = () => { if (!pendingWrites) { setAdding(false); setEditing(null); setFormError(null); } };
  const submitHabit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (await addHabit(name, type)) { setAdding(false); setName(''); setType('boolean'); }
    else setFormError(useHabitStore.getState().error ?? 'Could not save this habit. Please retry.');
  };
  const submitNumber = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setFormError(null);
    if (await setNumericValue(editing.name, editing.date, number)) setEditing(null);
    else setFormError(useHabitStore.getState().error ?? 'Could not save this value. Please retry.');
  };

  return <div className="min-h-screen bg-gray-50 pb-24">
    <main className="max-w-7xl mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">My Habits</h1>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4 text-sm">
        <p role="status" aria-live="polite" className={error ? 'text-red-700' : 'text-gray-600'}>
          {isLoading ? 'Loading habits…' : pendingWrites ? 'Saving…' : error ? 'Changes could not be synced.' : hasLoaded ? 'All changes saved' : 'Waiting to load habits…'}
        </p>
        <div className="flex gap-4">
          {spreadsheetId && <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`} target="_blank" rel="noreferrer" className="text-indigo-700 underline">Open Google Sheet</a>}
          <button disabled={syncing} onClick={() => void loadHabitsAndValues(dates[0], dates[dates.length - 1])} className="text-indigo-700 underline disabled:opacity-50">Refresh</button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!habits.length ? <p className="text-center text-gray-500 py-12">{hasLoaded ? 'No habits yet. Add one to get started!' : error ? 'Refresh to retry loading your habits.' : 'Loading habits…'}</p> :
        <div className="overflow-x-auto rounded-lg border bg-white" tabIndex={0} aria-label="Habit calendar, scroll horizontally for more dates">
          <table className="border-collapse text-sm">
            <caption className="sr-only">Daily habits, from {dateKey(dates[0])} to {dateKey(dates[dates.length - 1])}</caption>
            <thead><tr>
              <th scope="col" className="sticky left-0 z-20 bg-gray-50 min-w-[144px] max-w-[192px] p-3 text-left border-r">Habit</th>
              {dates.map((date) => { const key = dateKey(date); return <th key={key} scope="col" aria-current={key === today ? 'date' : undefined}
                className={`min-w-[56px] p-2 border-r text-center ${key === today ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-50'}`}>
                <time dateTime={key}><span className="block text-xs font-normal">{date.toLocaleDateString(undefined, { month: 'short' })}</span>{date.getDate()}</time>
              </th>; })}
            </tr></thead>
            <tbody>{habits.map((habit) => <tr key={habit.id} className="border-t">
              <th scope="row" className="sticky left-0 z-10 bg-gray-50 p-3 border-r text-left break-words min-w-[144px] max-w-[192px]">{habit.name}</th>
              {dates.map((date) => {
                const key = dateKey(date), value = habitValues[key]?.[habit.name] ?? '';
                return <td key={key} className={`border-r p-0 text-center ${key === today ? 'bg-indigo-50' : ''}`}>
                  <button disabled={busy} aria-label={`${habit.name}, ${key}: ${value || 'empty'}`}
                    aria-pressed={habit.type === 'boolean' ? value === '✓' : undefined}
                    onClick={() => {
                      if (habit.type === 'boolean') void toggleHabit(habit.name, key);
                      else { setEditing({ name: habit.name, date: key }); setNumber(value); setFormError(null); }
                    }}
                    className={`w-full min-w-[56px] h-12 px-1 hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 ${value === '✓' ? 'bg-green-100 text-green-800 font-bold' : value ? 'text-blue-800 font-medium' : 'text-gray-400'}`}>
                    {value || '—'}
                  </button>
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>}
    </main>
    <button onClick={() => { setAdding(true); setFormError(null); }} disabled={busy} aria-label="Add habit"
      className="fixed bottom-4 right-4 w-14 h-14 bg-indigo-600 text-white text-3xl rounded-full shadow-lg hover:bg-indigo-700 disabled:opacity-50">+</button>
    {adding && <Modal title="Add New Habit" onClose={close}>
      <form onSubmit={(event) => void submitHabit(event)}>
        <label htmlFor="habit-name" className="block text-sm font-medium mb-1">Habit name</label>
        <input id="habit-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoFocus disabled={busy}
          className="w-full border rounded-lg px-3 py-2 mb-4" placeholder="e.g., Morning Run" />
        <label htmlFor="habit-type" className="block text-sm font-medium mb-1">Habit type</label>
        <select id="habit-type" value={type} onChange={(event) => setType(event.target.value as HabitType)} disabled={busy} className="w-full border rounded-lg px-3 py-2">
          <option value="boolean">Checkmark (✓)</option><option value="numeric">Number</option>
        </select>
        {formError && <p role="alert" className="mt-3 text-sm text-red-700">{formError}</p>}
        <div className="flex gap-3 justify-end mt-6">
          <button type="button" onClick={close} disabled={busy} className="px-4 py-2 rounded-lg disabled:opacity-50">Cancel</button>
          <button disabled={busy || !name.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">{pendingWrites ? 'Saving…' : 'Add Habit'}</button>
        </div>
      </form>
    </Modal>}
    {editing && <Modal title={`${editing.name} · ${editing.date}`} onClose={close}>
      <form onSubmit={(event) => void submitNumber(event)}>
        <label htmlFor="habit-value" className="block text-sm font-medium mb-1">Value (leave empty to clear)</label>
        <input id="habit-value" type="number" step="any" autoFocus value={number} onChange={(event) => setNumber(event.target.value)} disabled={busy} className="w-full border rounded-lg px-3 py-2" />
        {formError && <p role="alert" className="mt-3 text-sm text-red-700">{formError}</p>}
        <div className="flex gap-3 justify-end mt-6">
          <button type="button" onClick={close} disabled={busy} className="px-4 py-2 rounded-lg disabled:opacity-50">Cancel</button>
          <button disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">{pendingWrites ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>}
  </div>;
}
