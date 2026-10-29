import { setLocale } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { t } from '../i18n/messages';

export function LanguageSwitcher() {
  const locale = useLocale();
  return <div className="language-switcher" role="group" aria-label={t('language.choose')}>
    <button type="button" lang="sk" aria-label={t('language.slovak')} aria-pressed={locale === 'sk'} onClick={() => setLocale('sk')}>{t('language.skShort')}</button>
    <button type="button" lang="en" aria-label={t('language.english')} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{t('language.enShort')}</button>
  </div>;
}
