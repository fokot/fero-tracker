import { useEffect } from 'react';
import { googleAuth, initGoogleAuth } from '../lib/googleOAuth';

export function GoogleButton() {
  useEffect(() => {
    const init = async () => {
      try {
        await initGoogleAuth();
      } catch (error) {
        console.error('Failed to init:', error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const renderButton = async () => {
      try {
        await googleAuth();
      } catch (error) {
        console.error('Failed to render button:', error);
      }
    };
    renderButton();
  }, []);

  return (
    <div id="google-button" className="w-full max-w-xs mx-auto mt-4"></div>
  );
}
