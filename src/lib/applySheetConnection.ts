import { t } from '../i18n/messages';
import { getAuthVersion } from './googleOAuth';
import { prepareSheetConnection } from './sheetConnections';
import { saveSheetChoice, type SheetChoice, type TrackerKind } from './preferences';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { canSynchronize, openTracker, synchronizeRecord } from './sheetbase';

export async function applySheetConnection(kind: TrackerKind, file: SheetChoice): Promise<boolean | null> {
  const habits = useHabitStore.getState(), workouts = useWorkoutStore.getState();
  const user = habits.user;
  if (!user || habits.pendingWrites || workouts.pendingWrites) throw new Error(t('error.waitSave'));
  if (!canSynchronize(user.id)) throw new Error(t('error.connectChange'));
  const other = kind === 'habits' ? workouts.spreadsheetId : habits.spreadsheetId;
  if (file.id === other) throw new Error(t('error.separateSheets'));
  const version = getAuthVersion();
  await prepareSheetConnection(kind, file.id);
  if (version !== getAuthVersion() || useHabitStore.getState().user?.id !== user.id || !canSynchronize(user.id)) return null;
  if (useHabitStore.getState().pendingWrites || useWorkoutStore.getState().pendingWrites) throw new Error(t('error.waitRetry'));
  const remembered = saveSheetChoice(user.id, kind, file);
  if (kind === 'habits') useHabitStore.getState().setSession(user, file.id);
  else useWorkoutStore.getState().setSpreadsheet(file.id);
  const table = await openTracker(user.id, kind, file.id);
  await synchronizeRecord(table.key, true);
  return remembered;
}
