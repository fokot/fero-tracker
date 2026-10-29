export type HabitType = 'boolean' | 'numeric';
export interface Habit { id: string; name: string; type: HabitType }
export interface User { id: string; email: string; name?: string; picture?: string }
export type HabitValues = Record<string, Record<string, string>>;
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please retry.';
}
