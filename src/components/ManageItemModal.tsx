import { translateError, t } from '../i18n/messages';
import { useId, useState, type FormEvent } from 'react';
import { errorMessage } from '../lib/types';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface Props {
  name: string;
  kind: 'habit' | 'exercise';
  renameHelp: string;
  deleteHelp: string;
  deleteLabel: string;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function ManageItemModal({ name, kind, renameHelp, deleteHelp, deleteLabel, busy, onRename, onDelete, onClose }: Props) {
  const inputId = useId();
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setError(null);
    try { await operation(); onClose(); }
    catch (reason) { setError(errorMessage(reason)); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) { setError(t('error.name')); return; }
    void run(() => onRename(draft.trim()));
  };
  return <Modal title={confirming ? t(kind === 'habit' ? 'manage.deleteHabit' : 'manage.deleteExercise') : t(kind === 'habit' ? 'manage.editHabit' : 'manage.editExercise')} onClose={onClose}>
    {confirming ? <div>
      <p className="manage-item-name">{name}</p>
      <p className="field-help">{deleteHelp}</p>
      {error && <p role="alert" className="form-error">{translateError(error)}</p>}
      <div className="form-actions"><button type="button" autoFocus onClick={() => { setConfirming(false); setError(null); }} disabled={busy} className="secondary-button">{t('common.back')}</button><button type="button" disabled={busy} onClick={() => void run(onDelete)} className="danger-button">{busy ? t('common.deleting') : deleteLabel}</button></div>
    </div> : <>
      <form onSubmit={submit}>
        <label htmlFor={inputId} className="field-label">{kind === 'habit' ? t('habits.name') : t('workouts.name')}</label>
        <input id={inputId} className="form-input" value={draft} onChange={(event) => setDraft(event.target.value)} required maxLength={100} disabled={busy} />
        <p className="field-help">{renameHelp}</p>
        {error && <p role="alert" className="form-error">{translateError(error)}</p>}
        <div className="form-actions"><button type="button" onClick={onClose} disabled={busy} className="secondary-button">{t('common.cancel')}</button><button disabled={busy || !draft.trim() || draft.trim() === name} className="primary-button">{busy ? t('common.saving') : t('common.rename')}</button></div>
      </form>
      <div className="manage-delete"><button type="button" className="delete-link" disabled={busy} onClick={() => { setConfirming(true); setError(null); }}><Icon name="trash" size={18} />{deleteLabel}</button></div>
    </>}
  </Modal>;
}
