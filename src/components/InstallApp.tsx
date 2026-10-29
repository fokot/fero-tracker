import { t } from '../i18n/messages';
import { useState } from 'react';
import { useInstallStore } from '../lib/pwa';

export function InstallApp() {
  const { prompt, installed } = useInstallStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const guide = <a className="text-button" href={`${import.meta.env.BASE_URL}docs/`}>{t('install.docs')}</a>;
  if (installed) return <section className="install-section" aria-label={t('install.documentation')}>{guide}</section>;
  const install = async () => {
    if (!prompt || busy) return;
    setBusy(true); setError(false);
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setError(true); }
    finally { useInstallStore.setState({ prompt: null }); setBusy(false); }
  };
  return <section className="install-section" aria-label={t('install.label')}>
    <h2>{t('install.title')}</h2>
    <p>{t('install.description')}</p>
    {prompt && <button type="button" className="primary-button" disabled={busy} onClick={() => void install()}>{busy ? t('install.opening') : t('install.button')}</button>}
    {error && <p role="status">{t('install.error')}</p>}
    <details><summary>{t('install.how')}</summary>
      <p><strong>iPhone / iPad:</strong>  {t('install.apple')}</p>
      <p><strong>Android:</strong>  {t('install.android')}</p>
      <p>{t('install.help')}</p>
    </details>
    {guide}
  </section>;
}
