import { t } from '../i18n/messages';
import { useAppearanceStore } from '../store/useAppearanceStore';
import { Icon } from './Icon';

export function Appearance() {
  const { preference, setPreference } = useAppearanceStore();
  return <section className="settings-section" aria-labelledby="appearance-title">
    <h2 id="appearance-title">{t('appearance.title')}</h2>
    <p className="field-help">{t('appearance.help')}</p>
    <div role="group" aria-label={t('appearance.label')} className="appearance-options">
      {([{ value: 'system', label: t('appearance.system'), icon: 'system' }, { value: 'light', label: t('appearance.light'), icon: 'sun' }, { value: 'dark', label: t('appearance.dark'), icon: 'moon' }] as const).map((item) => <button key={item.value} type="button" aria-pressed={preference === item.value} onClick={() => setPreference(item.value)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}
    </div>
  </section>;
}
