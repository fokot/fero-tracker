import { translateError, plural, t } from '../i18n/messages';
import { localeTag } from '../i18n/locale';
import { SyncStatus } from './SyncStatus';
import { useEffect, useRef, useState } from 'react';
import { dateKey, isDateKey } from '../lib/dates';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useWorkoutHistoryPreference } from '../store/useWorkoutHistoryPreference';
import { WorkoutCharts } from './WorkoutCharts';
import { WorkoutEditor } from './WorkoutEditor';
import { Icon } from './Icon';
import { EditableName } from './EditableName';
import { ManageItemModal } from './ManageItemModal';

export function Workouts() {
  const { user, spreadsheetId, workouts, exercises, loadedDate, isLoading, pendingWrites, error, localKey, queuedWrites, syncError, syncedAt, loadDay, saveExercise, renameExercise } = useWorkoutStore();
  const historyMode = useWorkoutHistoryPreference(state => state.mode);
  const history = useWorkoutStore(state => state.history);
  const [date, setDate] = useState(() => loadedDate ?? dateKey(new Date()));
  const [showCharts, setShowCharts] = useState(false);
  const [editor, setEditor] = useState<{ name?: string } | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
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

  if (showCharts) return <WorkoutCharts history={history} exercises={exercises} onBack={() => setShowCharts(false)} />;

  return <main id="main-content" className="workouts-page"
    onTouchStart={(event) => {
      swipe.current = null;
      if (busy || editor || managing || event.touches.length !== 1 ||
        (event.target as Element).closest('button, a, input, select, textarea, [role="dialog"], [contenteditable]')) return;
      const touch = event.touches[0];
      swipe.current = { x: touch.clientX, y: touch.clientY };
    }}
    onTouchMove={(event) => {
      const start = swipe.current;
      if (!start) return;
      if (event.touches.length !== 1 || Math.abs(event.touches[0].clientY - start.y) > 35) swipe.current = null;
    }}
    onTouchCancel={() => { swipe.current = null; }}
    onTouchEnd={(event) => {
      const start = swipe.current;
      swipe.current = null;
      if (!start || busy || editor || managing || event.touches.length || !event.changedTouches.length) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 2) moveDay(dx < 0 ? 1 : -1);
    }}>
    <div className="page-heading">
      <div><h1>{t('common.workouts')}</h1><p className="page-description">{t('workouts.description')}</p></div>
      <button type="button" className="primary-button heading-action" disabled={!ready || busy} onClick={() => setEditor({})} aria-label={t('workouts.add')}><Icon name="plus" size={19} /><span>{t('workouts.add')}</span></button>
    </div>
    <div className="habit-order-toolbar"><button type="button" className="text-button habit-order-trigger" disabled={!ready || busy} onClick={() => setShowCharts(true)}><Icon name="chart" size={17} />{t('charts.title')}</button></div>
    <section aria-label={t('workouts.dayLabel')} className="workout-day">
      <div className="day-label"><label htmlFor="workout-date">{t('workouts.day')}</label><button type="button" disabled={busy} onClick={() => setDate(dateKey(new Date()))} className="today-button" title={t('common.goToday')}><Icon name="today" size={17} />{t('common.today')}</button></div>
      <div className="day-picker">
        <button disabled={busy} onClick={() => moveDay(-1)} aria-label={t('workouts.previous')} className="icon-button"><Icon name="left" /></button>
        <input id="workout-date" type="date" value={date} disabled={busy} onChange={(event) => { if (isDateKey(event.target.value)) setDate(event.target.value); }} />
        <button disabled={busy} onClick={() => moveDay(1)} aria-label={t('workouts.next')} className="icon-button"><Icon name="right" /></button>
      </div>
    </section>
    <div className="workout-toolbar">
      <SyncStatus {...{localKey, pendingWrites, queuedWrites, syncError, syncedAt}} ready={ready} />
      <div className="toolbar-actions">{spreadsheetId && <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`} target="_blank" rel="noreferrer" className="icon-button" aria-label={t('common.openSheet')}><Icon name="external" size={18} /></a>}<button disabled={busy || isLoading} onClick={() => void loadDay(date, true)} className="icon-button" aria-label={t('common.refresh')}><Icon name="refresh" size={18} /></button></div>
    </div>
    {error && <p role="alert" className="error-banner">{translateError(error)}</p>}
    {ready && !!entries.length && <div className="training-summary"><span><strong>{entries.length}</strong> {plural('exercise', entries.length)}</span><span><strong>{setCount}</strong> {plural('set', setCount)}</span></div>}
    {ready && !entries.length && <div className="empty-state workout-empty"><Icon name="workouts" size={36} /><h2>{t('workouts.empty')}</h2><p>{t('workouts.emptyHelp')}</p></div>}
    <div className="exercise-list">
      {entries.map(([name, sets]) => <section key={name} aria-label={name} className="exercise">
        <div className="exercise-heading"><h2><EditableName name={name} kind="exercise" disabled={busy} onOpen={() => setManaging(name)} /></h2><button disabled={busy} onClick={() => setEditor({ name })} className="text-button">{t('workouts.editSets')}</button></div>
        <table className="sets-table"><caption className="sr-only">{t('workouts.caption', { name, date })}</caption><thead><tr><th scope="col">{t('common.set')}</th><th scope="col">{t('common.reps')}</th><th scope="col">{t('common.weight')} <span>(kg)</span></th></tr></thead>
          <tbody>{sets.map((set, index) => <tr key={index}><th scope="row"><span className="set-number">{index + 1}</span></th><td>{set.reps}</td><td>{set.weight.toLocaleString(localeTag(), { maximumFractionDigits: 10 })}</td></tr>)}</tbody>
        </table>
      </section>)}
    </div>
    {managing && <ManageItemModal name={managing} kind="exercise" busy={busy} onClose={close}
      renameHelp={t('workouts.renameHelp')}
      deleteHelp={t('workouts.deleteHelp', { date })} deleteLabel={t('workouts.delete')}
      onRename={async (nextName) => { if (!await renameExercise(date, managing, nextName)) throw new Error(useWorkoutStore.getState().error ?? t('workouts.renameFailed')); }}
      onDelete={async () => { if (!await saveExercise(date, managing, [])) throw new Error(useWorkoutStore.getState().error ?? t('workouts.deleteFailed')); }} />}
    {editor && <WorkoutEditor history={history} historyMode={historyMode} date={date} name={editor.name} initialSets={editor.name ? workouts[editor.name] ?? [] : []} exercises={exercises.filter((name) => !Object.prototype.hasOwnProperty.call(workouts, name))} busy={busy} onClose={close} onSave={(name, sets) => {
      if (!editor.name && entries.some(([existing]) => existing.trim().toLowerCase() === name.trim().toLowerCase())) return Promise.reject(new Error(t('workouts.duplicateDay')));
      return saveExercise(date, name, sets);
    }} />}
  </main>;
}
