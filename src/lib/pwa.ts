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
  const register = () => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      }).catch((error) => console.warn('Offline shell registration failed:', error));
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
  return () => {
    window.removeEventListener('beforeinstallprompt', beforeInstall);
    window.removeEventListener('appinstalled', installed);
    window.removeEventListener('load', register);
    displayMode.removeEventListener('change', update);
  };
}
