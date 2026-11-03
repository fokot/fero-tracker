import { translateError, t } from '../i18n/messages';
import { useId, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { errorMessage } from '../lib/types';
import type { WorkoutSet } from '../lib/workouts';
import { createWorkoutDraft, isEmptySet, parseWorkoutDraft, removeWorkoutDraftRow, updateWorkoutDraft } from '../lib/workoutDraft';
import { exerciseSuggestions } from '../lib/exerciseSuggestions';
import { workoutReference, type WorkoutHistory, type HistoryMode } from '../lib/workoutHistory';
import { localeTag } from '../i18n/locale';

interface Props {
  history?: WorkoutHistory;
  historyMode?: HistoryMode;
  date: string;
  name?: string;
  initialSets: WorkoutSet[];
  exercises: string[];
  busy: boolean;
  onSave: (name: string, sets: WorkoutSet[]) => Promise<boolean>;
  onClose: () => void;
}

export function WorkoutEditor({ date, name, initialSets, exercises, busy, onSave, onClose, history = {}, historyMode = 'last' }: Props) {
  const suggestionId = useId();
  const [exercise, setExercise] = useState(name ?? '');
  const reference = workoutReference(history, exercise, date, historyMode);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestions = exerciseSuggestions(exercises, exercise);
  const showSuggestions = suggestionsOpen && !busy && suggestions.length > 0;
  const selectExercise = (value: string) => {
    setExercise(value);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };
  const [draft, setDraft] = useState(() => createWorkoutDraft(initialSets));
  const [error, setError] = useState<string | null>(null);
  const update = (id: number, field: 'reps' | 'weight', value: string) => setDraft((current) => updateWorkoutDraft(current, id, field, value));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    try {
      if (!exercise.trim() || exercise.trim().length > 100) throw new Error(t('error.exerciseName'));
      const sets = parseWorkoutDraft(draft.rows, !!name);
      if (await onSave(exercise.trim(), sets)) onClose();
      else setError(t('workouts.saveFailed'));
    } catch (reason) { setError(errorMessage(reason)); }
  };
  return <Modal title={name ? t('workouts.setsTitle', { name }) : t('workouts.add')} onClose={onClose}>
    <form onSubmit={(event) => void submit(event)}>
      <p className="form-context">{date}</p>
      {!name && <>
        <label htmlFor={`${suggestionId}-name`} className="field-label">{t('workouts.name')}</label>
        <div className="exercise-autocomplete">
          <input id={`${suggestionId}-name`} role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? suggestionId : undefined}
            aria-activedescendant={showSuggestions && activeSuggestion >= 0 && activeSuggestion < suggestions.length ? `${suggestionId}-${activeSuggestion}` : undefined}
            autoComplete="off" autoFocus required maxLength={100} value={exercise} disabled={busy}
            onFocus={() => setSuggestionsOpen(true)} onBlur={() => { setSuggestionsOpen(false); setActiveSuggestion(-1); }}
            onChange={(event) => { setExercise(event.target.value); setSuggestionsOpen(true); setActiveSuggestion(-1); }}
            onKeyDown={(event) => {
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
                event.preventDefault();
                setSuggestionsOpen(true);
                setActiveSuggestion(current => event.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length - 1 : current - 1));
              } else if (event.key === 'Enter' && showSuggestions && activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
                event.preventDefault(); selectExercise(suggestions[activeSuggestion]);
              } else if (event.key === 'Escape' && suggestionsOpen) {
                event.preventDefault(); event.stopPropagation(); setSuggestionsOpen(false); setActiveSuggestion(-1);
              }
            }} placeholder={t('workouts.placeholder')} className="form-input" />
          {showSuggestions && <ul id={suggestionId} role="listbox" aria-label={t('workouts.name')} className="exercise-suggestions">
            {suggestions.map((item, index) => <li key={item} id={`${suggestionId}-${index}`} role="option" aria-selected={index === activeSuggestion}
              className={index === activeSuggestion ? 'is-active' : ''} onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                selectExercise(item);
              }}
              onClick={() => selectExercise(item)}>{item}</li>)}
          </ul>}
        </div>
      </>}
      <div className="set-editor-labels" aria-hidden="true"><span>#</span><span>{t('common.reps')}</span><span>{t('common.weightKg')}</span><span /></div>
      <div className="set-editor-rows">
        {draft.rows.map((row, index) => <div key={row.id} className={`set-editor-row ${isEmptySet(row) ? 'is-empty' : ''}`}>
          <span className="set-row-number">{index + 1}</span>
          <input aria-label={t('workouts.repsLabel', { number: index + 1 })} type="number" inputMode="numeric" min="1" step="1" required={!isEmptySet(row)} value={row.reps} disabled={busy}
            onChange={(event) => update(row.id, 'reps', event.target.value)} className="form-input set-input" autoFocus={!!name && index === 0} />
          <input aria-label={t('workouts.weightLabel', { number: index + 1 })} type="number" inputMode="decimal" min="0" step="any" required={!isEmptySet(row)} value={row.weight} disabled={busy}
            onChange={(event) => update(row.id, 'weight', event.target.value)} className="form-input set-input" />
          {index < draft.rows.length - 1 ? <button type="button" aria-label={t('workouts.removeSet', { number: index + 1 })} disabled={busy} onClick={() => setDraft((current) => removeWorkoutDraftRow(current, row.id))}
            className="icon-button remove-set"><Icon name="close" size={18} /></button> : <span aria-hidden="true" />}
        </div>)}
      </div>
      <p className="field-help">{t('workouts.moreHelp')}</p>
      {!!name && draft.rows.every(isEmptySet) && <p className="field-help">{t('workouts.clearHelp')}</p>}
      {reference && <p className="field-help workout-reference">
        <strong>{t(historyMode === 'best' ? 'workouts.historyBest' : 'workouts.historyLast')}</strong>
        {' · '}{new Date(`${reference.date}T12:00:00`).toLocaleDateString(localeTag())}
        <br />{reference.sets.map(set => t('workouts.historySet', {
          reps: set.reps, weight: set.weight.toLocaleString(localeTag(), { maximumFractionDigits: 10 }),
        })).join(' · ')}
      </p>}
      {error && <p role="alert" className="form-error">{translateError(error)}</p>}
      <div className="form-actions">
        <button type="button" onClick={onClose} disabled={busy} className="secondary-button">{t('common.cancel')}</button>
        <button disabled={busy} className="primary-button">{busy ? t('common.saving') : t('workouts.saveSets')}</button>
      </div>
    </form>
  </Modal>;
}
