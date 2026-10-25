import { useEffect, useState } from 'react';
import { initGoogleAuth } from '../lib/googleOAuth';
import { errorMessage } from '../lib/types';

export function GoogleButton({ onLogin, busy }: { onLogin: () => void; busy: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void initGoogleAuth().then(() => {
      if (cancelled) return;
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!cancelled) { setError(errorMessage(reason)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [attempt]);

  return <div className="mt-4">
    {loading && <p role="status" className="text-sm text-gray-600">Načítavam prihlásenie…</p>}
    <button type="button" onClick={onLogin} disabled={loading || !!error || busy} aria-busy={busy}
      style={{ fontFamily: '"Google Sans", Roboto, Arial, sans-serif' }}
      className="w-full max-w-xs mx-auto flex items-center justify-center gap-3 h-12 px-3 rounded-lg border border-[#747775] bg-white text-sm font-medium text-[#1f1f1f] hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-wait">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z" />
        <path fill="#FBBC05" d="M10.53 28.59C10.05 27.14 9.78 25.6 9.78 24s.27-3.14.75-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19Z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
      </svg>
      <span>{busy ? 'Prihlasujem…' : 'Prihlásiť sa cez Google'}</span>
    </button>
    {error && <div role="alert" className="text-sm text-red-700">
      <p>{error}</p>
      <button onClick={() => setAttempt((value) => value + 1)} className="mt-2 underline">Skúsiť znova</button>
    </div>}
  </div>;
}
