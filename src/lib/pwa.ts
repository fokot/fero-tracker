import { create } from 'zustand';

export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const useInstallStore = create<{ prompt: InstallPrompt | null; installed: boolean }>(() => ({
  prompt: null, installed: false,
}));

export function startPwa() {
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const update = () => useInstallStore.setState({ installed: isStandalone() });
  const beforeInstall = (event: Event) => {
    event.preventDefault();
    useInstallStore.setState({ prompt: event as InstallPrompt });
  };
  const installed = () => useInstallStore.setState({ installed: true, prompt: null });
  update();
  window.addEventListener('beforeinstallprompt', beforeInstall);
  window.addEventListener('appinstalled', installed);
  displayMode.addEventListener('change', update);
  const worker = import.meta.env.PROD && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  let registration: ServiceWorkerRegistration | null = null;
  let controlled = !!worker?.controller;
  let alive = true;
  let lastCheck = 0;
  const controllerChanged = () => {
    if (!worker?.controller) return;
    if (controlled) useUpdateStore.setState({ available: true });
    controlled = true;
  };
  const checkForUpdates = () => {
    if (!registration || document.visibilityState !== 'visible' || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    void registration.update().catch(() => { /* Offline is normal; retry on return. */ });
  };
  worker?.addEventListener('controllerchange', controllerChanged);
  document.addEventListener('visibilitychange', checkForUpdates);
  window.addEventListener('online', checkForUpdates);
  const register = () => {
    if (worker) {
      void worker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL, updateViaCache: 'none',
      }).then((current) => { if (alive) registration = current; }).catch((error) => console.warn('Offline shell registration failed:', error));
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
  return () => {
    alive = false;
    worker?.removeEventListener('controllerchange', controllerChanged);
    document.removeEventListener('visibilitychange', checkForUpdates);
    window.removeEventListener('online', checkForUpdates);
    window.removeEventListener('beforeinstallprompt', beforeInstall);
    window.removeEventListener('appinstalled', installed);
    window.removeEventListener('load', register);
    displayMode.removeEventListener('change', update);
  };
}

export const useUpdateStore = create<{ available: boolean }>(() => ({ available: false }));

// Reloading is explicit and cannot interrupt an editor or an unfinished local write.
export function reloadUpdatedApp(busy: boolean): boolean {
  if (busy || document.querySelector('dialog[open]')) return false;
  window.location.reload();
  return true;
}
