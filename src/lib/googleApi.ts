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
    catch { throw new GoogleApiError(response.status, 'Google returned an unreadable response. Please retry.'); }
    if (getAuthVersion() !== version || getValidAccessToken() !== token) throw new SessionExpiredError();
    if (!response.ok) {
      const detail = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
      const message = detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string' ? detail.message : 'Google request failed. Please retry.';
      throw new GoogleApiError(response.status, message);
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Google took too long to respond. Check your connection and retry.');
    if (error instanceof TypeError) throw new Error('Could not reach Google. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timeout); }
}
