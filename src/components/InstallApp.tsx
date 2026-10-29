import { useState } from 'react';
import { useInstallStore } from '../lib/pwa';

export function InstallApp() {
  const { prompt, installed } = useInstallStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const guide = <a className="text-button" href={`${import.meta.env.BASE_URL}docs/`}>Návody a dokumentácia (EN) ↗</a>;
  if (installed) return <section className="install-section" aria-label="Dokumentácia">{guide}</section>;
  const install = async () => {
    if (!prompt || busy) return;
    setBusy(true); setError(false);
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setError(true); }
    finally { useInstallStore.setState({ prompt: null }); setBusy(false); }
  };
  return <section className="install-section" aria-label="Inštalácia aplikácie">
    <h2>Fero Tracker na ploche</h2>
    <p>Otvor tracker jedným ťuknutím, aj bez internetu po prvom načítaní.</p>
    {prompt && <button type="button" className="primary-button" disabled={busy} onClick={() => void install()}>{busy ? 'Otváram inštaláciu…' : 'Nainštalovať aplikáciu'}</button>}
    {error && <p role="status">Inštaláciu otvor cez ponuku prehliadača podľa návodu nižšie.</p>}
    <details><summary>Ako pridať aplikáciu na plochu</summary>
      <p><strong>iPhone / iPad:</strong> otvor túto stránku v Safari, klepni na Zdieľať → Pridať na plochu. Ak sa zobrazí možnosť Otvoriť ako webovú apku, nechaj ju zapnutú.</p>
      <p><strong>Android:</strong> v Chrome otvor ponuku ⋮ → Nainštalovať aplikáciu alebo Pridať na plochu.</p>
      <p>Prvé prihlásenie a načítanie tabuliek potrebuje internet. Na odoslanie offline zmien otvor aplikáciu s pripojením a prihlás sa do Googlu.</p>
    </details>
    {guide}
  </section>;
}
