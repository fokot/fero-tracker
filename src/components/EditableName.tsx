import { t } from '../i18n/messages';
import { useEffect, useMemo, useRef } from 'react';
import { createEditGesture } from '../lib/editGesture';

export function EditableName({ name, kind, disabled, onOpen }: { name: string; kind: 'habit' | 'exercise'; disabled: boolean; onOpen: () => void }) {
  const latest = useRef({ disabled, onOpen });
  latest.current = { disabled, onOpen };
  const gesture = useMemo(() => createEditGesture(() => latest.current.onOpen(), () => latest.current.disabled), []);
  useEffect(() => () => gesture.cancel(), [gesture]);
  useEffect(() => { if (disabled) gesture.cancel(); }, [disabled, gesture]);
  return <button type="button" className="editable-name" disabled={disabled} aria-label={t(kind === 'habit' ? 'manage.habitLabel' : 'manage.exerciseLabel', { name })} aria-haspopup="dialog" title={t('manage.gesture')}
    onPointerDown={gesture.pointerDown} onPointerMove={gesture.pointerMove} onPointerUp={gesture.cancel} onPointerCancel={gesture.cancel} onPointerLeave={gesture.cancel} onClick={(event) => gesture.click(event.nativeEvent)} onContextMenu={gesture.contextMenu}>
    <span>{name}</span>
  </button>;
}
