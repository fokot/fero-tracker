import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleButton } from './components/GoogleButton';
import { Tracker } from './components/Tracker';
import { signInWithGoogle, signOut } from './lib/googleOAuth';
import { getAuthorizedUser, getOrCreateUserSheet } from './lib/googleSheets';
import { errorMessage } from './lib/types';
import { useHabitStore } from './store/useHabitStore';
import { useWorkoutStore } from './store/useWorkoutStore';

function App() {
  const user = useHabitStore((state) => state.user);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    attempt.current += 1;
    inFlight.current = false;
    signOut();
    useHabitStore.getState().clearUser();
    useWorkoutStore.getState().clearUser();
    setConnecting(false);
  }, []);

  useEffect(() => {
    const expired = () => { reset(); setError('Your session has expired. Please sign in again.'); };
    window.addEventListener('google-session-expired', expired);
    return () => { window.removeEventListener('google-session-expired', expired); };
  }, [reset]);

  const handleLogin = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++attempt.current;
    setConnecting(true);
    setError(null);
    try {
      // Start synchronously while the click still authorizes a popup.
      await signInWithGoogle();
      if (current !== attempt.current) return;
      const authorized = await getAuthorizedUser();
      if (current !== attempt.current) return;
      const spreadsheetId = await getOrCreateUserSheet(authorized.email);
      if (current === attempt.current) {
        useWorkoutStore.getState().setUser(authorized);
        useHabitStore.getState().setSession(authorized, spreadsheetId);
      }
    } catch (reason) {
      if (current === attempt.current) { signOut(); setError(errorMessage(reason)); }
    } finally {
      if (current === attempt.current) { inFlight.current = false; setConnecting(false); }
    }
  };

  if (user) return <Tracker onSignOut={() => { reset(); setError(null); }} />;
  return <div className="login-page">
    <main className="login-panel">
      <h1 className="login-title">Fero Tracker</h1>
      <p className="login-description">Návyky aj tréning. Tvoj každodenný prehľad.</p>
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      <GoogleButton onLogin={() => void handleLogin()} busy={connecting} />
      {connecting && <>
        <p role="status" className="text-sm text-gray-600 mt-3">Waiting for Google and loading your tracker…</p>
        <button onClick={() => { reset(); setError(null); }} className="mt-4 text-sm underline text-gray-600">
          Cancel
        </button>
      </>}
      <p className="login-footnote">Tvoje dáta zostávajú v tvojich Google tabuľkách.</p>
    </main>
  </div>;
}
export default App;
