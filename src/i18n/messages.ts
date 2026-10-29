import sk from '../../messages/app.sk.json';
import en from '../../messages/app.en.json';
import { getLocale, interpolate } from './locale';
export type MessageKey = keyof typeof sk;
export function t(key: MessageKey, values?: Record<string, string | number>): string {
  return interpolate((getLocale() === 'en' ? en : sk)[key], values);
}
// Stored errors may have been raised before a language change. Translate known
// app messages at render time too; keep external API diagnostics verbatim.
const messageKeys = Object.keys(sk) as MessageKey[];
export function translateError(message: string): string {
  const key = messageKeys.find(key => sk[key] === message || en[key] === message);
  return key ? t(key) : message;
}
export function plural(noun: 'exercise' | 'set', count: number) {
  const category = new Intl.PluralRules(getLocale()).select(count);
  return t(`workouts.${noun}.${category === 'one' || category === 'few' ? category : 'other'}`);
}
