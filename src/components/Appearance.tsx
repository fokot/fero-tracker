import { useAppearanceStore } from '../store/useAppearanceStore';
import { Icon } from './Icon';

export function Appearance() {
  const { preference, setPreference } = useAppearanceStore();
  return <section className="settings-section" aria-labelledby="appearance-title">
    <h2 id="appearance-title">Vzhľad</h2>
    <p className="field-help">Podľa zariadenia automaticky sleduje svetlý alebo tmavý režim tvojho systému.</p>
    <div role="group" aria-label="Vzhľad aplikácie" className="appearance-options">
      {([{ value: 'system', label: 'Podľa zariadenia', icon: 'system' }, { value: 'light', label: 'Svetlý', icon: 'sun' }, { value: 'dark', label: 'Tmavý', icon: 'moon' }] as const).map((item) => <button key={item.value} type="button" aria-pressed={preference === item.value} onClick={() => setPreference(item.value)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}
    </div>
  </section>;
}
