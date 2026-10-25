import { useId, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { errorMessage } from '../lib/types';
import { validateWorkoutSets, type WorkoutSet } from '../lib/workouts';

interface DraftSet { id: number; reps: string; weight: string }
interface Props {
  date: string;
  name?: string;
  initialSets: WorkoutSet[];
  addSet?: boolean;
  exercises: string[];
  busy: boolean;
  onSave: (name: string, sets: WorkoutSet[]) => Promise<boolean>;
  onClose: () => void;
}

export function WorkoutEditor({ date, name, initialSets, addSet, exercises, busy, onSave, onClose }: Props) {
  const suggestionId = useId();
  const [exercise, setExercise] = useState(name ?? '');
  const [draft, setDraft] = useState<DraftSet[]>(() => {
    const rows = initialSets.map(({ reps, weight }, index) => ({ id: index, reps: String(reps), weight: String(weight) }));
    if (addSet || !name) rows.push({ id: rows.length, reps: '', weight: '' });
    return rows;
  });
  const [nextId, setNextId] = useState(draft.length);
  const [error, setError] = useState<string | null>(null);
  const update = (id: number, field: 'reps' | 'weight', value: string) => setDraft((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    try {
      if (!exercise.trim() || exercise.trim().length > 100) throw new Error('Zadaj názov cviku s 1 až 100 znakmi.');
      if (!name && !draft.length) throw new Error('Pridaj aspoň jednu sériu.');
      if (draft.some((row) => row.reps.trim() === '' || row.weight.trim() === '')) throw new Error('Vyplň opakovania aj váhu v každej sérii.');
      const sets = draft.map((row) => ({ reps: Number(row.reps), weight: Number(row.weight) }));
      validateWorkoutSets(sets);
      if (await onSave(exercise.trim(), sets)) onClose();
      else setError('Tréning sa nepodarilo uložiť. Skús to znova; série zostali vo formulári.');
    } catch (reason) { setError(errorMessage(reason)); }
  };
  return <Modal title={name ? `Série · ${name}` : 'Pridať cvik'} onClose={onClose}>
    <form onSubmit={(event) => void submit(event)}>
      <p className="text-sm text-gray-500 mb-4">{date}</p>
      {!name && <>
        <label htmlFor={`${suggestionId}-name`} className="block text-sm font-medium mb-1">Názov cviku</label>
        <input id={`${suggestionId}-name`} list={suggestionId} autoFocus required maxLength={100} value={exercise} disabled={busy}
          onChange={(event) => setExercise(event.target.value)} placeholder="Napr. Bench press" className="w-full border rounded-lg px-3 py-2 mb-4" />
        <datalist id={suggestionId}>{exercises.map((item) => <option key={item} value={item} />)}</datalist>
      </>}
      <div className="grid grid-cols-[24px_1fr_1fr_40px] gap-2 text-xs text-gray-500 mb-2" aria-hidden="true"><span>#</span><span>Opakovania</span><span>Váha (kg)</span><span /></div>
      <div className="space-y-2 max-h-[45vh] overflow-y-auto">
        {draft.map((row, index) => <div key={row.id} className="grid grid-cols-[24px_1fr_1fr_40px] gap-2 items-center">
          <span className="text-sm text-gray-500">{index + 1}</span>
          <input aria-label={`Séria ${index + 1}: opakovania`} type="number" min="1" step="1" required value={row.reps} disabled={busy}
            onChange={(event) => update(row.id, 'reps', event.target.value)} className="min-w-0 w-full border rounded-lg px-2 h-11" autoFocus={!!name && index === 0} />
          <input aria-label={`Séria ${index + 1}: váha v kg`} type="number" min="0" step="any" required value={row.weight} disabled={busy}
            onChange={(event) => update(row.id, 'weight', event.target.value)} className="min-w-0 w-full border rounded-lg px-2 h-11" />
          <button type="button" aria-label={`Odstrániť sériu ${index + 1}`} disabled={busy} onClick={() => setDraft((rows) => rows.filter((item) => item.id !== row.id))}
            className="h-11 w-10 text-xl text-gray-500 hover:text-red-700 rounded-lg hover:bg-red-50">×</button>
        </div>)}
      </div>
      {!draft.length && <p className="text-sm text-gray-500 py-3">Uložením bez sérií odstrániš tento cvik z vybraného dňa.</p>}
      <button type="button" disabled={busy} onClick={() => { setDraft((rows) => [...rows, { id: nextId, reps: '', weight: '' }]); setNextId((value) => value + 1); }}
        className="mt-3 py-2 text-sm font-medium text-indigo-700">+ Pridať sériu</button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3 mt-5">
        <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg disabled:opacity-50">Zrušiť</button>
        <button disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">{busy ? 'Ukladám…' : 'Uložiť série'}</button>
      </div>
    </form>
  </Modal>;
}
