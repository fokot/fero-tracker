import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useHabitStore } from '../store/useHabitStore';
import { dateKey, visibleDates } from '../lib/dates';
import type { HabitType } from '../lib/types';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { EditableName } from './EditableName';
import { ManageItemModal } from './ManageItemModal';

export function HabitGrid() {
  const { habits, habitValues, toggleHabit, setNumericValue, spreadsheetId,
    loadHabitsAndValues, addHabit, renameHabit, deleteHabit, isLoading, hasLoaded, pendingWrites, error } = useHabitStore();
  const [today, setToday] = useState(() => dateKey(new Date()));
  const dates = useMemo(() => {
    const [year, month, day] = today.split('-').map(Number);
    return visibleDates(new Date(year, month - 1, day, 12));
  }, [today]);
  const calendar = useRef<HTMLDivElement>(null);
  const initialScroll = useRef(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<HabitType>('boolean');
  const [editing, setEditing] = useState<{ name: string; date: string } | null>(null);
  const [number, setNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const managingHabit = habits.find((habit) => habit.id === managingId);
  const syncing = isLoading || pendingWrites > 0;
  const busy = syncing || !hasLoaded;
  const completed = habits.filter((habit) => !!habitValues[today]?.[habit.name]).length;
  const status = isLoading ? 'Načítavam…' : pendingWrites ? 'Ukladám…' : error ? 'Zápis zlyhal' : hasLoaded ? 'Uložené' : 'Pripájam…';

  const showToday = (smooth = false) => {
    const element = calendar.current;
    const cell = element?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!element || !cell) return;
    const nameColumn = element.querySelector<HTMLElement>('.habit-name');
    const width = cell.getBoundingClientRect().width;
    const left = element.scrollLeft + cell.getBoundingClientRect().left - element.getBoundingClientRect().left;
    element.scrollTo({ left: Math.max(0, left - (nameColumn?.offsetWidth ?? 112) - width * 2), behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  };
  const goToToday = () => {
    const currentDate = dateKey(new Date());
    if (currentDate !== today) setToday(currentDate);
    else showToday(true);
  };
  useEffect(() => {
    const update = () => setToday(dateKey(new Date()));
    const timer = setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    initialScroll.current = false;
    if (spreadsheetId) void loadHabitsAndValues(dates[0], dates[dates.length - 1]);
  }, [spreadsheetId, dates, loadHabitsAndValues]);
  useEffect(() => {
    if (habits.length && !initialScroll.current) { showToday(); initialScroll.current = true; }
  }, [habits.length, today]);

  const close = () => { if (!useHabitStore.getState().pendingWrites) { setAdding(false); setEditing(null); setManagingId(null); setFormError(null); } };
  const submitHabit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (await addHabit(name, type)) { setAdding(false); setName(''); setType('boolean'); }
    else setFormError(useHabitStore.getState().error ?? 'Návyk sa nepodarilo uložiť. Skús to znova.');
  };
  const submitNumber = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setFormError(null);
    if (await setNumericValue(editing.name, editing.date, number)) setEditing(null);
    else setFormError(useHabitStore.getState().error ?? 'Hodnotu sa nepodarilo uložiť. Skús to znova.');
  };

  return <main id="main-content" className="habits-page">
    <div className="page-heading">
      <div><h1>Návyky</h1><p className="page-description">Malé kroky. Každý deň.</p></div>
      <button className="primary-button heading-action" onClick={() => { setAdding(true); setFormError(null); }} disabled={busy} aria-label="Add habit"><Icon name="plus" size={19} /><span>Pridať návyk</span></button>
    </div>
    <div className="habit-summary">
      <p><strong>{completed}<span>/{habits.length}</span></strong><span> dnes zaznamenané</span></p>
      <span role="status" aria-live="polite" className={`sync-status ${error ? 'has-error' : ''}`}><span className={`status-dot ${syncing ? 'is-pending' : ''}`} />{status}</span>
    </div>
    <div className="calendar-toolbar">
      <div className="calendar-period"><strong>{dates[30].toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' })}</strong><button type="button" onClick={goToToday} className="today-button" title="Prejsť na dnešný dátum"><Icon name="today" size={17} />Dnes</button></div>
      <div className="toolbar-actions">
        {spreadsheetId && <a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`} target="_blank" rel="noreferrer" className="icon-button" aria-label="Open Google Sheet" title="Otvoriť Google Sheet"><Icon name="external" size={18} /></a>}
        <button disabled={syncing} onClick={() => void loadHabitsAndValues(dates[0], dates[dates.length - 1])} className="icon-button" aria-label="Refresh" title="Obnoviť"><Icon name="refresh" size={18} /></button>
      </div>
    </div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {!habits.length ? <div className="empty-state"><Icon name="habits" size={32} /><h2>{!spreadsheetId ? 'Pripoj svoju tabuľku' : hasLoaded ? 'Začni jedným návykom' : error ? 'Skús obnoviť svoje návyky' : 'Načítavam návyky…'}</h2>{!spreadsheetId ? <p>V nastaveniach vyber Google Sheet alebo vytvor nový.</p> : hasLoaded && <p>Pridaj to, čomu chceš venovať čas každý deň.</p>}</div> :
      <div ref={calendar} className="habit-calendar" tabIndex={0} aria-label="Habit calendar, scroll horizontally for more dates">
        <table className="habit-table">
          <caption className="sr-only">Daily habits, from {dateKey(dates[0])} to {dateKey(dates[dates.length - 1])}</caption>
          <thead><tr>
            <th scope="col" className="habit-name habit-corner">Tvoje návyky</th>
            {dates.map((date) => { const key = dateKey(date); return <th key={key} scope="col" aria-current={key === today ? 'date' : undefined} className={`habit-date ${key === today ? 'is-today' : ''}`}>
              <time dateTime={key}><span>{date.toLocaleDateString('sk-SK', { weekday: 'short' }).replace('.', '')}</span><strong>{date.getDate()}</strong></time>
            </th>; })}
          </tr></thead>
          <tbody>{habits.map((habit) => <tr key={habit.id}>
            <th scope="row" className="habit-name"><EditableName name={habit.name} kind="návyk" disabled={busy} onOpen={() => setManagingId(habit.id)} /></th>
            {dates.map((date) => {
              const key = dateKey(date), value = habitValues[key]?.[habit.name] ?? '';
              return <td key={key} className={key === today ? 'is-today' : ''}>
                <button disabled={busy} aria-label={`${habit.name}, ${key}: ${value || 'empty'}`} aria-pressed={habit.type === 'boolean' ? value === '✓' : undefined}
                  onClick={() => {
                    if (habit.type === 'boolean') void toggleHabit(habit.name, key);
                    else { setEditing({ name: habit.name, date: key }); setNumber(value); setFormError(null); }
                  }} className={`habit-cell ${value === '✓' ? 'is-checked' : value ? 'has-value' : ''}`}>
                  {value === '✓' ? <Icon name="check" size={19} /> : value || <span className="empty-mark">·</span>}
                </button>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>}
    {!!habits.length && <p className="calendar-hint">Posunutím do strán zobrazíš ďalšie dni. <span className="edit-hint-touch">Podrž názov návyku pre úpravu.</span><span className="edit-hint-mouse">Klikni na názov návyku pre úpravu.</span></p>}
    {managingHabit && <ManageItemModal name={managingHabit.name} kind="návyk" busy={syncing} onClose={close}
      renameHelp="Nový názov sa použije vo všetkých dňoch. Záznamy zostanú zachované."
      deleteHelp="Vymaže sa tento návyk aj všetky jeho záznamy zo všetkých dní. Ostatné návyky zostanú zachované." deleteLabel="Vymazať návyk"
      onRename={async (nextName) => { if (!await renameHabit(managingHabit.id, nextName)) throw new Error(useHabitStore.getState().error ?? 'Návyk sa nepodarilo premenovať.'); }}
      onDelete={async () => { if (!await deleteHabit(managingHabit.id)) throw new Error(useHabitStore.getState().error ?? 'Návyk sa nepodarilo vymazať.'); }} />}
    {adding && <Modal title="Pridať návyk" onClose={close}>
      <form onSubmit={(event) => void submitHabit(event)}>
        <label htmlFor="habit-name" className="field-label">Názov návyku</label>
        <input id="habit-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoFocus disabled={busy} className="form-input" placeholder="Napr. Ranná prechádzka" />
        <label htmlFor="habit-type" className="field-label">Typ návyku</label>
        <select id="habit-type" value={type} onChange={(event) => setType(event.target.value as HabitType)} disabled={busy} className="form-input"><option value="boolean">Zaškrtnutie</option><option value="numeric">Číslo</option></select>
        {formError && <p role="alert" className="form-error">{formError}</p>}
        <div className="form-actions"><button type="button" onClick={close} disabled={busy} className="secondary-button">Zrušiť</button><button disabled={busy || !name.trim()} className="primary-button">{pendingWrites ? 'Ukladám…' : 'Pridať návyk'}</button></div>
      </form>
    </Modal>}
    {editing && <Modal title={editing.name} onClose={close}>
      <form onSubmit={(event) => void submitNumber(event)}>
        <p className="form-context">{editing.date}</p><label htmlFor="habit-value" className="field-label">Hodnota</label>
        <input id="habit-value" type="number" inputMode="decimal" step="any" autoFocus value={number} onChange={(event) => setNumber(event.target.value)} disabled={busy} className="form-input" />
        <p className="field-help">Prázdne pole vymaže uloženú hodnotu.</p>
        {formError && <p role="alert" className="form-error">{formError}</p>}
        <div className="form-actions"><button type="button" onClick={close} disabled={busy} className="secondary-button">Zrušiť</button><button disabled={busy} className="primary-button">{pendingWrites ? 'Ukladám…' : 'Uložiť'}</button></div>
      </form>
    </Modal>}
  </main>;
}
