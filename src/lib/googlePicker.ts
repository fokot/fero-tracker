import { getLocale } from '../i18n/locale';
import { t } from '../i18n/messages';
import { getAuthVersion, getValidAccessToken, SessionExpiredError } from './googleOAuth';
import { isSpreadsheetId, type SheetChoice } from './preferences';

interface Picker { setVisible: (visible: boolean) => void; dispose?: () => void }
interface PickerResponse { action?: string; docs?: { id?: string; name?: string }[] }
interface View { setMimeTypes: (types: string) => View }
interface Builder {
  addView: (view: View) => Builder;
  setDeveloperKey: (key: string) => Builder;
  setAppId: (id: string) => Builder;
  setOAuthToken: (token: string) => Builder;
  setOrigin: (origin: string) => Builder;
  setTitle: (title: string) => Builder;
  setLocale: (locale: string) => Builder;
  setCallback: (callback: (data: PickerResponse) => void) => Builder;
  build: () => Picker;
}
interface PickerApi { View: new (id: string) => View; ViewId: { SPREADSHEETS: string }; PickerBuilder: new () => Builder }
interface Gapi { load: (name: string, options: { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }) => void }
const pickerApi = () => (window.google as unknown as { picker?: PickerApi } | undefined)?.picker;
const gapi = () => (window as unknown as { gapi?: Gapi }).gapi;
const key = import.meta.env.VITE_GOOGLE_PICKER_API_KEY?.trim();
const project = import.meta.env.VITE_GOOGLE_PROJECT_NUMBER?.trim();
export const isPickerConfigured = () => !!key && !!project && /^\d+$/.test(project);
let initialization: Promise<void> | null = null;

export function initGooglePicker(): Promise<void> {
  if (!isPickerConfigured()) return Promise.reject(new Error(t('error.pickerConfig')));
  if (pickerApi()) return Promise.resolve();
  if (initialization) return initialization;
  initialization = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const failed = () => finish(new Error(t('error.pickerLoad')));
    const timer = setTimeout(failed, 15000);
    const load = () => {
      try { gapi()?.load('picker', { callback: () => pickerApi() ? finish() : failed(), onerror: failed, timeout: 10000, ontimeout: failed }); }
      catch { failed(); }
    };
    if (gapi()) load();
    else { script.src = 'https://apis.google.com/js/api.js'; script.async = true; script.onload = load; script.onerror = failed; document.head.appendChild(script); }
  }).catch((error: unknown) => { initialization = null; throw error; });
  return initialization;
}

export async function pickGoogleSpreadsheet(): Promise<SheetChoice | null> {
  const version = getAuthVersion();
  const token = getValidAccessToken();
  await initGooglePicker();
  if (version !== getAuthVersion() || token !== getValidAccessToken()) throw new SessionExpiredError();
  const api = pickerApi()!;
  return new Promise((resolve, reject) => {
    let picker: Picker | undefined;
    let settled = false;
    const finish = (choice: SheetChoice | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('google-session-expired', expired);
      try { picker?.setVisible(false); picker?.dispose?.(); } catch { /* Cleanup must not prevent the result from settling. */ }
      if (error) reject(error); else resolve(choice);
    };
    const expired = () => finish(null, new SessionExpiredError());
    const timer = setTimeout(() => finish(null, new Error(t('error.pickerTimeout'))), 180000);
    window.addEventListener('google-session-expired', expired);
    try {
      picker = new api.PickerBuilder().addView(new api.View(api.ViewId.SPREADSHEETS).setMimeTypes('application/vnd.google-apps.spreadsheet'))
        .setDeveloperKey(key!).setAppId(project!).setOAuthToken(token).setOrigin(window.location.origin).setLocale(getLocale()).setTitle(t('settings.select'))
        .setCallback((data) => {
          if (data.action === 'cancel') { finish(null); return; }
          if (data.action !== 'picked') return;
          try {
            if (version !== getAuthVersion() || token !== getValidAccessToken()) throw new SessionExpiredError();
            const file = data.docs?.[0];
            if (!file?.id || !isSpreadsheetId(file.id)) throw new Error(t('error.pickerInvalid'));
            finish({ id: file.id, name: file.name || 'Google Sheet' });
          } catch (error) { finish(null, error instanceof Error ? error : new Error(t('error.pickerFailed'))); }
        }).build();
      picker.setVisible(true);
    } catch (error) { finish(null, error instanceof Error ? error : new Error(t('error.pickerFailed'))); }
  });
}
