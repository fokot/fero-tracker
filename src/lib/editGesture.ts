// Touch edits require a deliberate hold; mouse and keyboard keep native clicks.
export function createEditGesture(open: () => void, disabled: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin: { x: number; y: number } | undefined;
  let fromTouch = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; origin = undefined; };
  return {
    cancel,
    pointerDown(event: { pointerType: string; button: number; isPrimary: boolean; clientX: number; clientY: number }) {
      cancel();
      fromTouch = event.pointerType === 'touch' || event.pointerType === 'pen';
      if (!fromTouch || disabled() || !event.isPrimary || event.button !== 0) return;
      origin = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => { cancel(); if (!disabled()) open(); }, 550);
    },
    pointerMove(event: { clientX: number; clientY: number }) {
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) cancel();
    },
    click(event: { detail: number; pointerType?: string }) {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
      if (!disabled() && (!fromTouch || event.detail === 0)) open();
    },
    contextMenu(event: { preventDefault: () => void }) { if (fromTouch) event.preventDefault(); },
  };
}
