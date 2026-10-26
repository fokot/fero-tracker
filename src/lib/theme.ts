import { isThemePreference, THEME_KEY, type ThemePreference } from './preferences';
import { useAppearanceStore } from '../store/useAppearanceStore';

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}
export function startTheme(): () => void {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const theme = resolveTheme(useAppearanceStore.getState().preference, system.matches);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1724' : '#f5f8fc');
  };
  const storage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) useAppearanceStore.setState({ preference: isThemePreference(event.newValue) ? event.newValue : 'system' });
  };
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', storage);
  const unsubscribe = useAppearanceStore.subscribe(apply);
  return () => { unsubscribe(); system.removeEventListener('change', apply); window.removeEventListener('storage', storage); };
}
