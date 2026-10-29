import { column, type Columns, type TableDefinition } from '@fokot/sheetbase';
import type { TrackerKind } from './preferences';
import { formatWorkoutSets, parseWorkoutSets, type WorkoutSet } from './workouts';

export function trackerDefinition(kind: TrackerKind, spreadsheetId: string): TableDefinition<Columns> {
  return { spreadsheetId, sheet: kind === 'habits' ? 'Habits' : 'Workouts', keyColumn: 'Date', columns: {},
    dynamic: { sheet: kind === 'habits' ? 'HabitDefinitions' : 'WorkoutDefinitions', defaultType: kind === 'habits' ? 'boolean' : 'sets',
      codecs: kind === 'habits' ? { boolean: column.boolean, numeric: column.number } : {
        sets: header => column.custom<WorkoutSet[]>(header, { id: 'workout-sets:v1', encode: formatWorkoutSets, decode: parseWorkoutSets }),
      } } };
}
