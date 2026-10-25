import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const resize = () => {
      element?.style.setProperty('--editor-height', `${viewport?.height ?? window.innerHeight}px`);
      element?.style.setProperty('--editor-bottom', `${viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    element?.showModal();
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      element?.close();
      document.body.style.overflow = previousOverflow;
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} className="editor-dialog">
    <div className="sheet-handle" aria-hidden="true" />
    <h2 id={titleId} className="dialog-title">{title}</h2>
    {children}
  </dialog>;
}
