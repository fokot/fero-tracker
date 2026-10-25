import { useEffect, useMemo, useRef } from 'react';
import { createEditGesture } from '../lib/editGesture';

export function EditableName({ name, kind, disabled, onOpen }: { name: string; kind: 'návyk' | 'cvik'; disabled: boolean; onOpen: () => void }) {
  const latest = useRef({ disabled, onOpen });
  latest.current = { disabled, onOpen };
  const gesture = useMemo(() => createEditGesture(() => latest.current.onOpen(), () => latest.current.disabled), []);
  useEffect(() => () => gesture.cancel(), [gesture]);
  useEffect(() => { if (disabled) gesture.cancel(); }, [disabled, gesture]);
  return <button type="button" className="editable-name" disabled={disabled} aria-label={`Upraviť ${kind}: ${name}`} aria-haspopup="dialog" title="Klikni na úpravu; na dotykovej obrazovke podrž názov"
    onPointerDown={gesture.pointerDown} onPointerMove={gesture.pointerMove} onPointerUp={gesture.cancel} onPointerCancel={gesture.cancel} onPointerLeave={gesture.cancel} onClick={(event) => gesture.click(event.nativeEvent)} onContextMenu={gesture.contextMenu}>
    <span>{name}</span>
  </button>;
}
