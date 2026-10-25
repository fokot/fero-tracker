import { useEffect, useState } from 'react';
import { dateKey, isDateKey } from '../lib/dates';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { WorkoutEditor } from './WorkoutEditor';

export function Workouts() {
  const { user, spreadsheetId, workouts, exercises, loadedDate, isLoading, pendingWrites, error, loadDay, saveExercise } = useWorkoutStore();
  const [date, setDate] = useState(() => loadedDate ?? dateKey(new Date()));
  const [editor, setEditor] = useState<{ name?: string; addSet?: boolean } | null>(null);
  const ready = loadedDate === date && !isLoading;
  const busy = pendingWrites > 0;
  useEffect(() => { if (user) void loadDay(date); }, [user, date, loadDay]);
  const moveDay = (offset: number) => {
    const [year, month, day] = date.split('-').map(Number);
    setDate(dateKey(new Date(year, month - 1, day + offset, 12)));
  };
  const close = () => { if (!useWorkoutStore.getState().pendingWrites) setEditor(null); };
  const entries = ready ? Object.entries(workouts) : [];
  const setCount = entries.reduce((total, [, sets]) => total + sets.length, 0);

  return <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Workouts</h1><p className="text-sm text-gray-500 mt-1">Tvoj tréning, séria po sérii.</p></div>
      {spreadsheetId && <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`} target="_blank" rel="noreferrer" className="text-sm text-indigo-700 underline py-2">Otvoriť Google Sheet</a>}
    </div>
    <section aria-label="Výber tréningového dňa" className="bg-white border rounded-xl p-4 mb-5">
      <label htmlFor="workout-date" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Tréningový deň</label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => moveDay(-1)} aria-label="Predchádzajúci deň" className="w-11 h-11 border rounded-lg text-lg disabled:opacity-50">←</button>
        <input id="workout-date" type="date" value={date} disabled={busy} onChange={(event) => { if (isDateKey(event.target.value)) setDate(event.target.value); }} className="min-w-0 h-11 border rounded-lg px-3 flex-1" />
        <button disabled={busy} onClick={() => moveDay(1)} aria-label="Nasledujúci deň" className="w-11 h-11 border rounded-lg text-lg disabled:opacity-50">→</button>
        <button disabled={busy} onClick={() => setDate(dateKey(new Date()))} className="px-3 h-11 text-sm text-indigo-700">Dnes</button>
      </div>
    </section>
    <div className="flex flex-wrap justify-between items-center gap-3 mb-4 text-sm">
      <p role="status" aria-live="polite" className={error ? 'text-red-700' : 'text-gray-500'}>
        {isLoading ? 'Načítavam tréning…' : busy ? 'Ukladám…' : error ? 'Synchronizácia zlyhala.' : ready ? `Cviky: ${entries.length} · Série: ${setCount} · Uložené` : 'Pripájam tréningový denník…'}
      </p>
      <button disabled={busy || isLoading} onClick={() => void loadDay(date)} className="text-indigo-700 underline disabled:opacity-50">Obnoviť</button>
    </div>
    {error && <p role="alert" className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</p>}
    {ready && !entries.length && <div className="bg-white border border-dashed rounded-xl px-6 py-10 text-center mb-5">
      <p className="font-medium text-gray-900">Zatiaľ žiadny tréning v tento deň</p><p className="text-sm text-gray-500 mt-2">Pridaj prvý cvik a zapíš si série.</p>
    </div>}
    <div className="space-y-4">
      {entries.map(([name, sets]) => <section key={name} aria-label={name} className="bg-white border rounded-xl overflow-hidden">
        <div className="flex justify-between items-center gap-3 px-5 pt-4 mb-3">
          <h2 className="font-semibold text-lg text-gray-900 break-words min-w-0">{name}</h2>
          <button disabled={busy} onClick={() => setEditor({ name })} className="text-sm text-indigo-700 py-2 shrink-0">Upraviť série</button>
        </div>
        <table className="w-full text-sm"><caption className="sr-only">Série cviku {name} v deň {date}</caption>
          <thead className="text-gray-500 text-xs bg-gray-50"><tr><th scope="col" className="text-left px-5 py-2">Séria</th><th scope="col" className="text-right px-4 py-2">Opakovania</th><th scope="col" className="text-right px-5 py-2">Váha (kg)</th></tr></thead>
          <tbody>{sets.map((set, index) => <tr key={index} className="border-t border-gray-100"><th scope="row" className="text-left px-5 py-3 font-normal text-gray-500">{index + 1}</th><td className="text-right px-4 py-3 font-medium">{set.reps}</td><td className="text-right px-5 py-3 font-medium">{set.weight.toLocaleString('sk-SK', { maximumFractionDigits: 10 })}</td></tr>)}</tbody>
        </table>
        <button disabled={busy} onClick={() => setEditor({ name, addSet: true })} className="w-full text-left px-5 py-3 border-t text-sm text-indigo-700 hover:bg-indigo-50">+ Pridať sériu</button>
      </section>)}
    </div>
    <button disabled={!ready || busy} onClick={() => setEditor({})} className="mt-5 w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">+ Pridať cvik</button>
    {editor && <WorkoutEditor date={date} name={editor.name} initialSets={editor.name ? workouts[editor.name] ?? [] : []} addSet={editor.addSet}
      exercises={exercises.filter((name) => !Object.prototype.hasOwnProperty.call(workouts, name))} busy={busy} onClose={close} onSave={(name, sets) => {
        if (!editor.name && entries.some(([existing]) => existing.trim().toLowerCase() === name.trim().toLowerCase())) {
          return Promise.reject(new Error('Tento cvik už v tomto dni máš. Ďalšie série pridaj cez jeho kartu.'));
        }
        return saveExercise(date, name, sets);
      }} />}
  </main>;
}
