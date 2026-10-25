import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="rounded-xl shadow-2xl max-w-md w-[calc(100%-2rem)] p-6 backdrop:bg-black/50">
    <h2 id={titleId} className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
    {children}
  </dialog>;
}
