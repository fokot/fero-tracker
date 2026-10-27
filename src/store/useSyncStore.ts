import { create } from 'zustand';

export const useSyncStore = create<{ online: boolean; authorizedUserId: string | null; syncing: string[]; error: string | null }>(() => ({
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  authorizedUserId: null, syncing: [], error: null,
}));
