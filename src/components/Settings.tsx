import { translateError, t } from '../i18n/messages';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useEffect, useRef, useState } from 'react';
import { getAuthVersion } from '../lib/googleOAuth';
import { isPickerConfigured, pickGoogleSpreadsheet } from '../lib/googlePicker';
import { createTrackerSpreadsheet, getSpreadsheetInfo, listAccessibleSheets } from '../lib/sheetConnections';
import { readSheetChoices, spreadsheetIdFromInput, type SheetChoice, type TrackerKind } from '../lib/preferences';
import { applySheetConnection } from '../lib/applySheetConnection';
import { errorMessage } from '../lib/types';
import { useHabitStore } from '../store/useHabitStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { Appearance } from './Appearance';
import { Icon } from './Icon';
import { canSynchronize } from '../lib/sheetbase';
import { useSyncStore } from '../store/useSyncStore';
import { LocalStorageSettings } from './LocalStorageSettings';
import { InstallApp } from './InstallApp';

export function Settings({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const user = useHabitStore((state) => state.user)!;
  const habitId = useHabitStore((state) => state.spreadsheetId);
  const workoutId = useWorkoutStore((state) => state.spreadsheetId);
  const { online, authorizedUserId } = useSyncStore();
  const connected = online && authorizedUserId === user.id;
  const [current, setCurrent] = useState<Partial<Record<TrackerKind, SheetChoice>>>(() => readSheetChoices(user.id));
  const [chooser, setChooser] = useState<TrackerKind | null>(null);
  const [files, setFiles] = useState<SheetChoice[]>([]);
  const [candidate, setCandidate] = useState<SheetChoice | null>(null);
  const [link, setLink] = useState('');
  const [operation, setOperation] = useState<TrackerKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);
  const running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    for (const [kind, id] of [['habits', habitId], ['workouts', workoutId]] as const) if (id && canSynchronize(user.id)) {
      void getSpreadsheetInfo(id).then((file) => { if (!cancelled) setCurrent((state) => ({ ...state, [kind]: file })); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [habitId, workoutId, connected, user.id]);

  const run = async (kind: TrackerKind, action: (isCurrent: () => boolean) => Promise<void>) => {
    if (running.current || useHabitStore.getState().pendingWrites || useWorkoutStore.getState().pendingWrites) return;
    if (!canSynchronize(user.id)) { setError(t('error.connectChange')); return; }
    running.current = true;
    const version = getAuthVersion();
    const isCurrent = () => alive.current && version === getAuthVersion() && useHabitStore.getState().user?.id === user.id;
    setOperation(kind); setError(null); setNotice(null); onBusy(true);
    try { await action(isCurrent); }
    catch (reason) { if (isCurrent()) setError(errorMessage(reason)); }
    finally { running.current = false; if (alive.current) { setOperation(null); onBusy(false); } }
  };
  const connect = async (kind: TrackerKind, file: SheetChoice, isCurrent: () => boolean) => {
    const remembered = await applySheetConnection(kind, file);
    if (remembered === null || !isCurrent()) return;
    setCurrent((state) => ({ ...state, [kind]: file }));
    setChooser(null); setCandidate(null);
    setNotice(remembered ? t('settings.success') : t('settings.rememberFailed'));
  };

  return <main id="main-content" className="settings-page">
    <div className="page-heading"><div><h1>{t('common.settings')}</h1><p className="page-description">{t('settings.description')}</p></div></div>
    <section className="settings-section" aria-labelledby="language-title">
      <h2 id="language-title">{t('language.label')}</h2><p className="field-help">{t('language.help')}</p><LanguageSwitcher />
    </section>
    <Appearance />
    <InstallApp />
    <LocalStorageSettings userId={user.id} />
    <section className="settings-section" aria-labelledby="sheets-title">
      <h2 id="sheets-title">Google Sheets</h2>
      {!connected && <p className="field-help">{t('settings.offlineHelp')}</p>}
      <p className="field-help">{t('settings.separate')}</p>
      {(['habits', 'workouts'] as const).map((kind) => {
        const id = kind === 'habits' ? habitId : workoutId;
        const selected = current[kind]?.id === id ? current[kind] : undefined;
        return <div key={kind} className="sheet-setting" aria-label={kind === 'habits' ? t('settings.habitSheet') : t('settings.workoutSheet')}>
          <div className="sheet-setting-title"><Icon name={kind} size={22} /><h3>{kind === 'habits' ? t('common.habits') : t('common.workouts')}</h3></div>
          <p className="connected-sheet">{id ? selected?.name ?? t('settings.connected') : t('settings.noSheet')}</p>
          <div className="sheet-setting-actions">
            {id && <a className="text-button" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`} target="_blank" rel="noreferrer">{t('settings.open')} <Icon name="external" size={15} /></a>}
            <button type="button" disabled={!!operation} className="secondary-button" onClick={() => void run(kind, async (isCurrent) => {
              setChooser(kind); setCandidate(null); setLink(''); setFiles([]);
              const list = await listAccessibleSheets();
              if (isCurrent()) setFiles(list);
            })}>{id ? t('settings.change') : t('settings.choose')}</button>
            <button type="button" disabled={!!operation} className="text-button" onClick={() => void run(kind, async (isCurrent) => {
              const file = await createTrackerSpreadsheet(kind);
              if (isCurrent()) await connect(kind, file, isCurrent);
            })}>{t('settings.create')}</button>
          </div>
          {chooser === kind && <div className="sheet-chooser">
            <h4>{t('settings.select')}</h4>
            <p className="field-help">{t('settings.accessHelp')}</p>
            {operation === kind && <p role="status" className="field-help">{t('settings.working')}</p>}
            {isPickerConfigured() && <button type="button" disabled={!!operation} className="secondary-button" onClick={() => void run(kind, async (isCurrent) => {
              const picked = await pickGoogleSpreadsheet();
              if (picked && isCurrent()) { const file = await getSpreadsheetInfo(picked.id); if (isCurrent()) setCandidate(file); }
            })}>{t('settings.browse')}</button>}
            <div className="sheet-file-list" role="group" aria-label={t('settings.available')}>
              {files.map((file) => <button type="button" key={file.id} disabled={!!operation} aria-pressed={candidate?.id === file.id} onClick={() => { setCandidate(file); setError(null); }}><Icon name="sheet" size={20} /><span>{file.name}</span>{candidate?.id === file.id && <Icon name="check" size={18} />}</button>)}
              {!files.length && !operation && <p className="field-help">{t('settings.empty')}</p>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void run(kind, async (isCurrent) => { const file = await getSpreadsheetInfo(spreadsheetIdFromInput(link)); if (isCurrent()) setCandidate(file); }); }}>
              <label className="field-label" htmlFor={`sheet-link-${kind}`}>{t('settings.link')}</label>
              <input className="form-input" id={`sheet-link-${kind}`} value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" disabled={!!operation} />
              <p className="field-help">{t('settings.linkHelp')}</p>
              <button className="text-button" disabled={!!operation || !link.trim()}>{t('settings.verify')}</button>
            </form>
            {candidate && <div className="sheet-candidate"><strong>{candidate.name}</strong><p className="field-help">{kind === 'habits' ? t('settings.habitTabs') : t('settings.workoutTabs')}  {t('settings.preserve')}</p><button type="button" className="primary-button" disabled={!!operation} onClick={() => void run(kind, async (isCurrent) => {
              const verified = await getSpreadsheetInfo(candidate.id);
              if (isCurrent()) await connect(kind, verified, isCurrent);
            })}>{t('settings.use')}</button></div>}
            <button type="button" className="text-button" disabled={!!operation} onClick={() => { setChooser(null); setCandidate(null); setError(null); }}>{t('settings.cancel')}</button>
          </div>}
        </div>;
      })}
      {error && <p role="alert" className="form-error">{translateError(error)}</p>}
      {notice && <p role="status" className="field-help">{notice}</p>}
    </section>
  </main>;
}
