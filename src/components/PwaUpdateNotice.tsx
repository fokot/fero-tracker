import { useState } from 'react';
import { useLocale } from '../i18n/react';
import { t } from '../i18n/messages';
import { reloadUpdatedApp, useUpdateStore } from '../lib/pwa';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';

export function PwaUpdateNotice() {
  useLocale();
  const available = useUpdateStore(state => state.available);
  const habitsSaving = useHabitStore(state => state.pendingWrites);
  const workoutsSaving = useWorkoutStore(state => state.pendingWrites);
  const [blocked, setBlocked] = useState(false);
  if (!available) return null;
  return <section className="pwa-update-notice" aria-label={t('update.title')}>
    <p role="status"><strong>{t('update.title')}</strong><span>{t(blocked ? 'update.closeEditor' : 'update.help')}</span></p>
    <button type="button" className="secondary-button" disabled={habitsSaving + workoutsSaving > 0} onClick={() => setBlocked(!reloadUpdatedApp(useHabitStore.getState().pendingWrites + useWorkoutStore.getState().pendingWrites > 0))}>{t('update.reload')}</button>
  </section>;
}
