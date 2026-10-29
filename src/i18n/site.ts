import sk from '../../messages/site.sk.json';
import en from '../../messages/site.en.json';
import { getLocale, interpolate } from './locale';
export type SiteMessageKey = keyof typeof en;
export function siteMessage(key: SiteMessageKey, values?: Record<string, string | number>) {
  return interpolate((getLocale() === 'en' ? en : sk)[key], values);
}
