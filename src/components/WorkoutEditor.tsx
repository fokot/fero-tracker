import { translateError, t } from '../i18n/messages';
import { useId, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { errorMessage } from '../lib/types';
import type { WorkoutSet } from '../lib/workouts';
import { createWorkoutDraft, isEmptySet, parseWorkoutDraft, removeWorkoutDraftRow, updateWorkoutDraft } from '../lib/workoutDraft';

interface Props {
  date: string;
  name?: string;
  initialSets: WorkoutSet[];
  exercises: string[];
  busy: boolean;
  onSave: (name: string, sets: WorkoutSet[]) => Promise<boolean>;
  onClose: () => void;
}

export function WorkoutEditor({ date, name, initialSets, exercises, busy, onSave, onClose }: Props) {
  const suggestionId = useId();
  const [exercise, setExercise] = useState(name ?? '');
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
        <input id={`${suggestionId}-name`} list={suggestionId} autoFocus required maxLength={100} value={exercise} disabled={busy}
          onChange={(event) => setExercise(event.target.value)} placeholder={t('workouts.placeholder')} className="form-input" />
        <datalist id={suggestionId}>{exercises.map((item) => <option key={item} value={item} />)}</datalist>
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
      {error && <p role="alert" className="form-error">{translateError(error)}</p>}
      <div className="form-actions">
        <button type="button" onClick={onClose} disabled={busy} className="secondary-button">{t('common.cancel')}</button>
        <button disabled={busy} className="primary-button">{busy ? t('common.saving') : t('workouts.saveSets')}</button>
      </div>
    </form>
  </Modal>;
}
