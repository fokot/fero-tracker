export type Locale = 'sk' | 'en';
const STORAGE_KEY = 'fero-tracker:locale';
const listeners = new Set<() => void>();
export function supportedLocale(value: unknown): Locale | null {
  return typeof value === 'string' && /^(sk|en)(-|$)/i.test(value) ? value.slice(0, 2).toLowerCase() as Locale : null;
}
export function detectLocale(): Locale {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved === 'sk' || saved === 'en') return saved;
  } catch { /* A blocked preference store does not prevent switching. */ }
  if (typeof navigator !== 'undefined') {
    for (const language of navigator.languages ?? [navigator.language]) {
      const locale = supportedLocale(language);
      if (locale) return locale;
    }
  }
  return 'sk';
}
let locale = detectLocale();
export const getLocale = () => locale;
export const localeTag = () => locale === 'sk' ? 'sk-SK' : 'en-GB';
export function subscribeLocale(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setLocale(next: Locale) {
  if (next !== 'sk' && next !== 'en') return;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the current page usable. */ }
  if (locale === next) return;
  locale = next;
  for (const listener of listeners) listener();
}
export function interpolate(message: string, values: Record<string, string | number> = {}) {
  return message.replace(/\{(\w+)\}/g, (token, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token);
}
export function startLocale() {
  const updateDocument = () => { document.documentElement.lang = locale; };
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const next = detectLocale();
    if (locale !== next) { locale = next; for (const listener of listeners) listener(); }
  };
  updateDocument();
  const unsubscribe = subscribeLocale(updateDocument);
  window.addEventListener('storage', storage);
  return () => { unsubscribe(); window.removeEventListener('storage', storage); };
}
