import type { User } from './types';
import { isSpreadsheetId } from './preferences';

export interface LocalSession { user: User; habitsId: string | null; workoutsId: string | null }
const SESSION_KEY = 'feros-tracker:session';
const sheetId = (value: unknown) => typeof value === 'string' && isSpreadsheetId(value) ? value : null;
const profile = (user: User): User => ({ id: user.id, email: user.email,
  ...(typeof user.name === 'string' ? { name: user.name } : {}),
  ...(typeof user.picture === 'string' ? { picture: user.picture } : {}) });

export async function readLocalSession(): Promise<LocalSession | null> {
  const raw = localStorage.getItem(SESSION_KEY); if (!raw) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch { return null; }
  if (!saved?.user || typeof saved.user.id !== 'string' || !saved.user.id || typeof saved.user.email !== 'string' || !saved.user.email) return null;
  return { user: profile(saved.user), habitsId: sheetId(saved.habitsId), workoutsId: sheetId(saved.workoutsId) };
}
export async function saveLocalSession(value: LocalSession | null): Promise<void> {
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify({ user: profile(value.user), habitsId: value.habitsId, workoutsId: value.workoutsId }));
  else localStorage.removeItem(SESSION_KEY);
}
