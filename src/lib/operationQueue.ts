import type { LocalOperation, TrackerData } from './localModel';

// Absolute values can replace earlier unsent values. Schema changes and an
// already persisted batch are barriers: their ordering and IDs must survive.
export function compactOperations(base: TrackerData, operations: LocalOperation[], protectedIds: string[] = []): LocalOperation[] {
  const protectedSet = new Set(protectedIds);
  const result: (LocalOperation | null)[] = [];
  const previous = new Map<string, number>();
  const exercises = new Set(base.kind === 'workouts' ? base.exercises.map((name) => name.toLowerCase()) : []);
  for (const operation of operations) {
    const change = operation.change;
    let key: string | null = null;
    if (change.type === 'habit-value') key = JSON.stringify(['habit', change.habitId, change.date]);
    if (change.type === 'workout-sets') {
      const name = change.name.trim().toLowerCase();
      if (exercises.has(name)) key = JSON.stringify(['workout', name, change.date]);
      else exercises.add(name); // The first sets also create an exercise column.
    }
    if (change.type === 'workout-rename') { exercises.delete(change.previousName.toLowerCase()); exercises.add(change.name.trim().toLowerCase()); }
    if (!key || protectedSet.has(operation.id)) previous.clear();
    else {
      const index = previous.get(key);
      if (index !== undefined) result[index] = null;
      previous.set(key, result.length);
    }
    result.push(operation);
  }
  return result.filter((operation): operation is LocalOperation => operation !== null);
}
