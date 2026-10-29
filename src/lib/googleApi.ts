import { t } from '../i18n/messages';
import { expireSession, getAuthVersion, getValidAccessToken, SessionExpiredError } from './googleOAuth';

export class GoogleApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function googleRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getValidAccessToken();
  const version = getAuthVersion();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${token}` },
    });
    // A response must not restore data after sign-out or an account switch.
    if (getAuthVersion() !== version || getValidAccessToken() !== token) throw new SessionExpiredError();
    if (response.status === 401) { expireSession(); throw new SessionExpiredError(); }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new GoogleApiError(response.status, t('error.googleResponse')); }
    if (getAuthVersion() !== version || getValidAccessToken() !== token) throw new SessionExpiredError();
    if (!response.ok) {
      const detail = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
      const message = detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string' ? detail.message : t('error.googleRequest');
      throw new GoogleApiError(response.status, message);
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(t('error.googleTimeout'));
    if (error instanceof TypeError) throw new Error(t('error.googleNetwork'));
    throw error;
  } finally { clearTimeout(timeout); }
}
