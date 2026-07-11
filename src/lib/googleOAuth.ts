declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let authInstance: any = null;

export async function initGoogleAuth() {
  if (window.google?.apis?.idtoken?.loadClient) {
    return;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  window.google?.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response: any) => handleCredentialResponse(response.credential),
    scope: SCOPES.join(' '),
  });

  authInstance = window.google?.accounts.id;
}

export async function getAccessToken(): Promise<string | null> {
  const client = window.google?.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    callback: (tokenResponse: any) => {
      console.log('Token:', tokenResponse.access_token);
    },
  });

  return new Promise((resolve) => {
    client.requestAccessToken((token: any) => {
      resolve(token.access_token || null);
    });
  });
}

export function googleAuth() {
  return new Promise((resolve, reject) => {
    if (!authInstance) {
      reject(new Error('Google Auth not initialized. Call initGoogleAuth() first.'));
      return;
    }

    authInstance.attachClickHandler(
      document.getElementById('google-button'),
      {},
      (credentialResponse: any) => {
        resolve(credentialResponse.credential);
      },
      (error: any) => {
        reject(error);
      }
    );
  });
}

function handleCredentialResponse(token: string) {
  console.log('Encoded JWT ID token: ' + token);
}

export function signOut() {
  if (authInstance) {
    const config = authInstance.getCurrentClient();
    if (config) {
      authInstance.signOut(config);
    }
  }
}
