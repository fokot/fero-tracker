import { useEffect, useRef, useState } from 'react';
import { GoogleButton } from './components/GoogleButton';
import { Tracker } from './components/Tracker';
import { signInWithGoogle, signOut } from './lib/googleOAuth';
import { getAuthorizedUser, getOrCreateUserSheet } from './lib/googleSheets';
import { errorMessage } from './lib/types';
import { useHabitStore } from './store/useHabitStore';
import { useWorkoutStore } from './store/useWorkoutStore';
import { readSheetChoices } from './lib/preferences';
import { readLocalSession, saveLocalSession } from './lib/session';
import { authorizeSynchronization, pauseSynchronization } from './lib/sheetbase';
import { useSyncStore } from './store/useSyncStore';
import { InstallApp } from './components/InstallApp';

function App() {
  const user = useHabitStore((state) => state.user);
  const habitsId = useHabitStore((state) => state.spreadsheetId);
  const workoutsId = useWorkoutStore((state) => state.spreadsheetId);
  const { authorizedUserId, online } = useSyncStore();
  const [restoring, setRestoring] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void readLocalSession().then((session) => {
      if (cancelled || !session) return;
      useWorkoutStore.getState().setUser(session.user);
      if (session.workoutsId) useWorkoutStore.getState().setSpreadsheet(session.workoutsId);
      useHabitStore.getState().setSession(session.user, session.habitsId);
    }).catch((reason) => { if (!cancelled) setError(errorMessage(reason)); })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!restoring) void saveLocalSession(user ? { user, habitsId, workoutsId } : null).catch((reason) => setError(errorMessage(reason)));
  }, [restoring, user, habitsId, workoutsId]);
  useEffect(() => {
    const expired = () => { pauseSynchronization(); setConnecting(false); setError(null); };
    window.addEventListener('google-session-expired', expired);
    return () => { window.removeEventListener('google-session-expired', expired); };
  }, []);

  const cancelLogin = () => {
    attempt.current++; inFlight.current = false; signOut(); pauseSynchronization(); setConnecting(false);
  };
  const handleLogin = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++attempt.current;
    // Invalidate requests from a previous authorization before opening another account.
    signOut(); pauseSynchronization(); setConnecting(true); setError(null);
    try {
      await signInWithGoogle();
      if (current !== attempt.current) return;
      const authorized = await getAuthorizedUser();
      if (current !== attempt.current) return;
      const sameUser = useHabitStore.getState().user?.id === authorized.id;
      const choices = readSheetChoices(authorized.id);
      let spreadsheetId = (sameUser ? useHabitStore.getState().spreadsheetId : null) ?? choices.habits?.id ?? null;
      const workoutId = (sameUser ? useWorkoutStore.getState().spreadsheetId : null) ?? choices.workouts?.id ?? null;
      let sheetError: string | null = null;
      if (!spreadsheetId) {
        try { spreadsheetId = await getOrCreateUserSheet(authorized.email); }
        catch (reason) { sheetError = errorMessage(reason); }
      }
      if (current !== attempt.current) return;
      useWorkoutStore.getState().setUser(authorized);
      if (workoutId) useWorkoutStore.getState().setSpreadsheet(workoutId);
      useHabitStore.getState().setSession(authorized, spreadsheetId);
      authorizeSynchronization(authorized.id, [spreadsheetId, workoutId].filter((id): id is string => !!id));
      if (sheetError) useHabitStore.setState({ error: sheetError });
    } catch (reason) {
      if (current === attempt.current) { signOut(); pauseSynchronization(); setError(errorMessage(reason)); }
    } finally {
      if (current === attempt.current) { inFlight.current = false; setConnecting(false); }
    }
  };
  const handleSignOut = async () => {
    try {
      await saveLocalSession(null);
      cancelLogin(); useHabitStore.getState().clearUser(); useWorkoutStore.getState().clearUser(); setError(null);
    } catch (reason) { setError(errorMessage(reason)); }
  };
  if (restoring) return <div className="login-page"><p role="status">Otváram tvoje záznamy…</p></div>;
  if (user) return <Tracker onSignOut={() => void handleSignOut()} connection={<>
    {authorizedUserId !== user.id && <section className="connection-banner" aria-label="Synchronizácia s Googlom">
      <p><strong>{online ? 'Záznamy máš v tomto zariadení.' : 'Si offline. Zapisuj ďalej.'}</strong><span>{online ? 'Pre odoslanie zmien do Google Sheets sa prihlás.' : 'Zmeny sa odošlú po pripojení a prihlásení do Googlu.'}</span></p>
      {online && <GoogleButton onLogin={() => void handleLogin()} busy={connecting} />}
      {connecting && <button className="text-button" onClick={cancelLogin}>Zrušiť prihlásenie</button>}
    </section>}
    {error && <p role="alert" className="error-banner">{error}</p>}
  </>} />;
  return <div className="login-page"><main className="login-panel">
    <h1 className="login-title">Fero Tracker</h1>
    <p className="login-description">Návyky aj tréning. Tvoj každodenný prehľad.</p>
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    <GoogleButton onLogin={() => void handleLogin()} busy={connecting} />
    {connecting && <><p role="status" className="text-sm text-gray-600 mt-3">Pripájam Google a načítavam tracker…</p><button onClick={cancelLogin} className="mt-4 text-sm underline text-gray-600">Zrušiť</button></>}
    <p className="login-footnote">Záznamy sa ukladajú v tomto prehliadači a synchronizujú do tvojich Google tabuliek.</p>
    <InstallApp />
  </main></div>;
}
export default App;
