import type { Plugin } from 'vite';
import site from '../messages/site.en.json';
import app from '../messages/app.sk.json';

// Keep readable, indexed HTML even without JavaScript. The browser applies the
// selected locale to these same message slots without changing URLs or layout.
export function localizedHtml(): Plugin {
  const catalogs = { site, app };
  return {
    name: 'fero-localized-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/\{\{(site|app)\.([\w.]+)\}\}/g, (_token, catalog: keyof typeof catalogs, key: string) => {
          const value = (catalogs[catalog] as Record<string, string>)[key];
          if (value === undefined) throw new Error(`Missing ${catalog} message: ${key}`);
          return value;
        });
      },
    },
  };
}
