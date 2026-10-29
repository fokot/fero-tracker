import { t } from '../i18n/messages';
interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string }
interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string; scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: (error: { type: string }) => void;
      }): { requestAccessToken(config: { prompt: string }): void };
    };
  };
}
declare global { interface Window { google?: GoogleIdentity } }

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
// Limit access to files created by or explicitly opened with this app.
const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let initialization: Promise<void> | null = null;
let accessToken: string | null = null;
let expiresAt = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let authorizationPending = false;
let cancelAuthorization: (() => void) | null = null;
let authVersion = 0;

export class SessionExpiredError extends Error {
  constructor() { super(t('error.sessionExpired')); }
}

export function initGoogleAuth(): Promise<void> {
  if (!CLIENT_ID || /YOUR_|your_/i.test(CLIENT_ID) || !CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    return Promise.reject(new Error(t('error.clientId')));
  }
  if (initialization) return initialization;
  initialization = new Promise<void>((resolve, reject) => {
    const ready = () => {
      try {
        if (!window.google?.accounts.oauth2?.initTokenClient) throw new Error(t('error.googleUnavailable'));
        resolve();
      } catch (error) { reject(error); }
    };
    if (window.google?.accounts.oauth2?.initTokenClient) { ready(); return; }
    const script = document.createElement('script');
    let finished = false;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timeout = setTimeout(() => {
      finished = true;
      script.remove();
      reject(new Error(t('error.googleLoadTimeout')));
    }, 15000);
    script.onload = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      ready();
    };
    script.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.remove();
      reject(new Error(t('error.googleLoad')));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => { initialization = null; throw error; });
  return initialization;
}

function clearAccessToken() {
  accessToken = null;
  expiresAt = 0;
  clearTimeout(expiryTimer);
}
export function expireSession() {
  clearAccessToken();
  window.dispatchEvent(new Event('google-session-expired'));
}
export function getValidAccessToken(): string {
  if (accessToken && Date.now() >= expiresAt) expireSession();
  if (!accessToken || Date.now() >= expiresAt) throw new SessionExpiredError();
  return accessToken;
}

export function getAuthVersion(): number { return authVersion; }

// Call directly from a click handler to preserve the browser's user gesture.
export function signInWithGoogle(): Promise<void> {
  if (!window.google?.accounts.oauth2 || !CLIENT_ID) return Promise.reject(new Error(t('error.googleNotReady')));
  if (authorizationPending) return Promise.reject(new Error(t('error.authInProgress')));
  authorizationPending = true;
  const version = authVersion;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      authorizationPending = false;
      cancelAuthorization = null;
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error(t('error.authTimeout'))), 120000);
    cancelAuthorization = () => finish(new Error(t('error.authCancelled')));
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: `openid email profile ${FILE_SCOPE}`,
        callback: (response) => {
          if (settled || version !== authVersion) return;
          if (response.error || !response.access_token) {
            finish(new Error(response.error === 'access_denied' ? t('error.authDenied') : t('error.authFailed')));
            return;
          }
          if (!response.scope?.split(' ').includes(FILE_SCOPE)) {
            finish(new Error(t('error.drivePermission')));
            return;
          }
          if (!Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 0) {
            finish(new Error(t('error.tokenExpiry'))); return;
          }
          clearAccessToken();
          accessToken = response.access_token;
          const duration = Number(response.expires_in) * 1000;
          expiresAt = Date.now() + duration;
          expiryTimer = setTimeout(expireSession, duration);
          finish();
        },
        error_callback: (error) => finish(new Error(error.type === 'popup_closed' ? t('error.popupClosed') : t('error.popupBlocked'))),
      });
      client.requestAccessToken({ prompt: '' });
    } catch { finish(new Error(t('error.authStart'))); }
  });
}

export function signOut() {
  authVersion += 1;
  cancelAuthorization?.();
  clearAccessToken();
}
