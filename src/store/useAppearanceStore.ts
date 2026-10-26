import { create } from 'zustand';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../lib/preferences';

export const useAppearanceStore = create<{ preference: ThemePreference; setPreference: (value: ThemePreference) => void }>((set) => ({
  preference: readThemePreference(),
  setPreference: (preference) => { saveThemePreference(preference); set({ preference }); },
}));
