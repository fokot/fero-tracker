import { useEffect, useState } from 'react';
import { dateKey, isDateKey } from '../lib/dates';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { WorkoutEditor } from './WorkoutEditor';
import { Icon } from './Icon';
import { EditableName } from './EditableName';
import { ManageItemModal } from './ManageItemModal';

export function Workouts() {
  const { user, spreadsheetId, workouts, exercises, loadedDate, isLoading, pendingWrites, error, loadDay, saveExercise, renameExercise } = useWorkoutStore();
  const [date, setDate] = useState(() => loadedDate ?? dateKey(new Date()));
  const [editor, setEditor] = useState<{ name?: string } | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const ready = loadedDate === date && !isLoading;
  const busy = pendingWrites > 0;
  useEffect(() => { if (user) void loadDay(date); }, [user, date, loadDay]);
  const moveDay = (offset: number) => {
    const [year, month, day] = date.split('-').map(Number);
    setDate(dateKey(new Date(year, month - 1, day + offset, 12)));
  };
  const close = () => { if (!useWorkoutStore.getState().pendingWrites) { setEditor(null); setManaging(null); } };
  const entries = ready ? Object.entries(workouts) : [];
  const setCount = entries.reduce((total, [, sets]) => total + sets.length, 0);

  return <main id="main-content" className="workouts-page">
    <div className="page-heading"><div><h1>Workouts</h1><p className="page-description">Tvoj tréning, séria po sérii.</p></div><span className="page-symbol" aria-hidden="true"><Icon name="workouts" size={31} /></span></div>
    <section aria-label="Výber tréningového dňa" className="workout-day">
      <div className="day-label"><label htmlFor="workout-date">Tréningový deň</label><button type="button" disabled={busy} onClick={() => setDate(dateKey(new Date()))} className="today-button" title="Prejsť na dnešný dátum"><Icon name="today" size={17} />Dnes</button></div>
      <div className="day-picker">
        <button disabled={busy} onClick={() => moveDay(-1)} aria-label="Predchádzajúci deň" className="icon-button"><Icon name="left" /></button>
        <input id="workout-date" type="date" value={date} disabled={busy} onChange={(event) => { if (isDateKey(event.target.value)) setDate(event.target.value); }} />
        <button disabled={busy} onClick={() => moveDay(1)} aria-label="Nasledujúci deň" className="icon-button"><Icon name="right" /></button>
      </div>
    </section>
    <div className="workout-toolbar">
      <p role="status" aria-live="polite" className={`sync-status ${error ? 'has-error' : ''}`}><span className={`status-dot ${isLoading || busy ? 'is-pending' : ''}`} />{isLoading ? 'Načítavam…' : busy ? 'Ukladám…' : error ? 'Zápis zlyhal' : ready ? 'Uložené' : 'Pripájam…'}</p>
      <div className="toolbar-actions">{spreadsheetId && <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`} target="_blank" rel="noreferrer" className="icon-button" aria-label="Otvoriť Google Sheet"><Icon name="external" size={18} /></a>}<button disabled={busy || isLoading} onClick={() => void loadDay(date)} className="icon-button" aria-label="Obnoviť"><Icon name="refresh" size={18} /></button></div>
    </div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {ready && !!entries.length && <><div className="training-summary"><span><strong>{entries.length}</strong> {entries.length === 1 ? 'cvik' : entries.length < 5 ? 'cviky' : 'cvikov'}</span><span><strong>{setCount}</strong> {setCount === 1 ? 'séria' : setCount < 5 ? 'série' : 'sérií'}</span></div><p className="exercise-edit-hint"><span className="edit-hint-touch">Podrž názov cviku pre úpravu.</span><span className="edit-hint-mouse">Klikni na názov cviku pre úpravu.</span></p></>}
    {ready && !entries.length && <div className="empty-state workout-empty"><Icon name="workouts" size={36} /><h2>Deň čaká na tvoj tréning</h2><p>Pridaj prvý cvik a zapíš si série.</p></div>}
    <div className="exercise-list">
      {entries.map(([name, sets]) => <section key={name} aria-label={name} className="exercise">
        <div className="exercise-heading"><h2><EditableName name={name} kind="cvik" disabled={busy} onOpen={() => setManaging(name)} /></h2><button disabled={busy} onClick={() => setEditor({ name })} className="text-button">Upraviť série</button></div>
        <table className="sets-table"><caption className="sr-only">Série cviku {name} v deň {date}</caption><thead><tr><th scope="col">Séria</th><th scope="col">Opakovania</th><th scope="col">Váha <span>(kg)</span></th></tr></thead>
          <tbody>{sets.map((set, index) => <tr key={index}><th scope="row"><span className="set-number">{index + 1}</span></th><td>{set.reps}</td><td>{set.weight.toLocaleString('sk-SK', { maximumFractionDigits: 10 })}</td></tr>)}</tbody>
        </table>
      </section>)}
    </div>
    <div className="workout-add"><button disabled={!ready || busy} onClick={() => setEditor({})} className="primary-button"><Icon name="plus" size={20} />Pridať cvik</button></div>
    {managing && <ManageItemModal name={managing} kind="cvik" busy={busy} onClose={close}
      renameHelp="Nový názov sa použije vo všetkých dňoch. Série zostanú zachované."
      deleteHelp={`Vymažú sa všetky série tohto cviku z dňa ${date}. Záznamy v ostatných dňoch zostanú zachované.`} deleteLabel="Vymazať z tohto dňa"
      onRename={async (nextName) => { if (!await renameExercise(date, managing, nextName)) throw new Error(useWorkoutStore.getState().error ?? 'Cvik sa nepodarilo premenovať.'); }}
      onDelete={async () => { if (!await saveExercise(date, managing, [])) throw new Error(useWorkoutStore.getState().error ?? 'Cvik sa nepodarilo vymazať.'); }} />}
    {editor && <WorkoutEditor date={date} name={editor.name} initialSets={editor.name ? workouts[editor.name] ?? [] : []} exercises={exercises.filter((name) => !Object.prototype.hasOwnProperty.call(workouts, name))} busy={busy} onClose={close} onSave={(name, sets) => {
      if (!editor.name && entries.some(([existing]) => existing.trim().toLowerCase() === name.trim().toLowerCase())) return Promise.reject(new Error('Tento cvik už v tomto dni máš. Ďalšie série pridaj cez jeho kartu.'));
      return saveExercise(date, name, sets);
    }} />}
  </main>;
}
