export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day, 12)) === value;
}
export function visibleDates(today: Date): Date[] {
  return Array.from({ length: 38 }, (_, index) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + index - 30, 12));
}
