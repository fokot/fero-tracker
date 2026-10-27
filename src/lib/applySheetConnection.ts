import { getAuthVersion } from './googleOAuth';
import { prepareSheetConnection } from './sheetConnections';
import { saveSheetChoice, type SheetChoice, type TrackerKind } from './preferences';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { canSynchronize } from './localSync';
import { invalidateRemote } from './remoteSync';

export async function applySheetConnection(kind: TrackerKind, file: SheetChoice): Promise<boolean | null> {
  const habits = useHabitStore.getState(), workouts = useWorkoutStore.getState();
  const user = habits.user;
  if (!user || habits.pendingWrites || workouts.pendingWrites) throw new Error('Počkaj na dokončenie ukladania.');
  if (!canSynchronize(user.id)) throw new Error('Na zmenu tabuľky sa pripoj na internet a prihlás cez Google.');
  const other = kind === 'habits' ? workouts.spreadsheetId : habits.spreadsheetId;
  if (file.id === other) throw new Error('Pre návyky a tréningy vyber dve rôzne tabuľky.');
  const version = getAuthVersion();
  await prepareSheetConnection(kind, file.id);
  if (version !== getAuthVersion() || useHabitStore.getState().user?.id !== user.id || !canSynchronize(user.id)) return null;
  if (useHabitStore.getState().pendingWrites || useWorkoutStore.getState().pendingWrites) throw new Error('Počkaj na dokončenie ukladania a skús to znova.');
  const remembered = saveSheetChoice(user.id, kind, file);
  invalidateRemote(file.id);
  if (kind === 'habits') useHabitStore.getState().setSession(user, file.id);
  else useWorkoutStore.getState().setSpreadsheet(file.id);
  return remembered;
}
