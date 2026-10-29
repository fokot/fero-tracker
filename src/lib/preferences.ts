import { t } from '../i18n/messages';
export type ThemePreference = 'system' | 'light' | 'dark';
export type TrackerKind = 'habits' | 'workouts';
export interface SheetChoice { id: string; name: string }
export const THEME_KEY = 'feros-tracker:theme';
export const isThemePreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark';
export const isSpreadsheetId = (value: string) => /^[a-zA-Z0-9_-]+$/.test(value);
const sheetKey = (userId: string) => `feros-tracker:sheets:${userId}`;

export function readThemePreference(): ThemePreference {
  try { const value = localStorage.getItem(THEME_KEY); return isThemePreference(value) ? value : 'system'; }
  catch { return 'system'; }
}
export function saveThemePreference(value: ThemePreference): void {
  try { localStorage.setItem(THEME_KEY, value); } catch { /* The current page still applies the choice. */ }
}
export function readSheetChoices(userId: string): Partial<Record<TrackerKind, SheetChoice>> {
  try {
    const saved = JSON.parse(localStorage.getItem(sheetKey(userId)) ?? '{}');
    const choices: Partial<Record<TrackerKind, SheetChoice>> = {};
    for (const kind of ['habits', 'workouts'] as const) {
      const choice = saved?.[kind];
      if (typeof choice?.id === 'string' && isSpreadsheetId(choice.id) && typeof choice?.name === 'string') choices[kind] = { id: choice.id, name: choice.name };
    }
    return choices;
  } catch { return {}; }
}
export function saveSheetChoice(userId: string, kind: TrackerKind, choice: SheetChoice): boolean {
  try {
    localStorage.setItem(sheetKey(userId), JSON.stringify({ ...readSheetChoices(userId), [kind]: choice }));
    return true;
  } catch { return false; }
}
export function spreadsheetIdFromInput(input: string): string {
  const value = input.trim();
  if (isSpreadsheetId(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'docs.google.com') {
      const match = url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
      if (match && match[1] !== 'e') return match[1];
    }
  } catch { /* Show the same validation error for malformed URLs. */ }
  throw new Error(t('error.sheetLink'));
}
