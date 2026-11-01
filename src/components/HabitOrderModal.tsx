import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { t, translateError } from '../i18n/messages';
import { errorMessage, type Habit } from '../lib/types';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  habits: Habit[];
  busy: boolean;
  onSave: (ids: string[]) => Promise<void>;
  onClose: () => void;
}

export function HabitOrderModal({ habits, busy, onSave, onClose }: Props) {
  const [initial] = useState(() => habits.map(habit => habit.id));
  const [ids, setIds] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const focusId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusId.current) handles.current.get(focusId.current)?.focus({ preventScroll: true });
    focusId.current = null;
  }, [ids]);
  const drag = useRef<{ id: string; before: string[] } | null>(null);
  const changed = ids.some((id, index) => id !== initial[index]);
  const names = new Map(habits.map(habit => [habit.id, habit.name]));
  const move = (id: string, to: number, focus = false) => {
    if (busy || to < 0 || to >= ids.length || ids.indexOf(id) === to) return;
    if (focus) focusId.current = id;
    setIds(current => {
      const from = current.indexOf(id);
      if (busy || from < 0 || to < 0 || to >= current.length || from === to) return current;
      const next = [...current]; next.splice(from, 1); next.splice(to, 0, id); return next;
    });
    setAnnouncement(t('habits.orderPosition', { name: names.get(id) ?? '', position: to + 1, count: ids.length }));
  };
  const pointerMove = (event: PointerEvent<HTMLOListElement>) => {
    if (!drag.current || busy) return;
    const list = event.currentTarget;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-habit-id]');
    if (target && list.contains(target)) {
      const to = ids.indexOf(target.dataset.habitId!);
      if (to >= 0) move(drag.current.id, to);
    }
    const bounds = list.getBoundingClientRect();
    if (event.clientY < bounds.top + 40) list.scrollBy(0, -12);
    else if (event.clientY > bounds.bottom - 40) list.scrollBy(0, 12);
  };
  const finishDrag = (cancelled = false) => {
    if (cancelled && drag.current) setIds(drag.current.before);
    drag.current = null; setDragging(null);
  };
  const save = async () => {
    if (busy || !changed) return;
    setError(null);
    try { await onSave(ids); onClose(); }
    catch (reason) { setError(errorMessage(reason)); }
  };
  return <Modal title={t('habits.reorder')} onClose={() => { if (!busy) onClose(); }}>
    <p className="field-help">{t('habits.orderHelp')}</p>
    <ol className="habit-order-list" aria-label={t('habits.reorder')}
      onPointerMove={pointerMove} onPointerUp={() => finishDrag()} onPointerCancel={() => finishDrag(true)} onLostPointerCapture={() => finishDrag()}>
      {ids.map((id, index) => <li key={id} data-habit-id={id} className={`habit-order-item ${dragging === id ? 'is-dragging' : ''}`}>
        <button type="button" className="icon-button habit-order-grip" ref={element => { if (element) handles.current.set(id, element); else handles.current.delete(id); }} disabled={busy} aria-label={t('habits.orderMove', { name: names.get(id) ?? '' })}
          onKeyDown={event => {
            const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : null;
            if (to !== null) { event.preventDefault(); if (to >= 0 && to < ids.length) move(id, to, true); }
          }}
          onPointerDown={event => {
            if (busy || event.button !== 0 || !event.isPrimary) return;
            drag.current = { id, before: [...ids] }; setDragging(id);
            // Capture on the list: moving the handle's row can release its capture.
            event.currentTarget.closest('ol')?.setPointerCapture(event.pointerId);
          }}>
          <Icon name="grip" />
        </button>
        <span className="habit-order-name">{names.get(id)}</span>
        <button type="button" className="icon-button" disabled={busy || index === 0} aria-label={t('habits.orderUp', { name: names.get(id) ?? '' })} onClick={() => move(id, index - 1, true)}><Icon name="up" /></button>
        <button type="button" className="icon-button" disabled={busy || index === ids.length - 1} aria-label={t('habits.orderDown', { name: names.get(id) ?? '' })} onClick={() => move(id, index + 1, true)}><Icon name="down" /></button>
      </li>)}
    </ol>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {error && <p role="alert" className="form-error">{translateError(error)}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button type="button" className="primary-button" disabled={busy || !changed || dragging !== null} onClick={() => void save()}>{busy ? t('common.saving') : t('common.save')}</button></div>
  </Modal>;
}
