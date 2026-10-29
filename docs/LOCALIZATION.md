# Localization

The tracker and documentation website support Slovak (`sk`) and English (`en`). Both use the same browser preference, `fero-tracker:locale` in local storage. Without a saved choice, the first supported browser language is selected; otherwise Slovak is the fallback. A blocked storage API does not prevent switching for the current page.

## Message catalogs

- `messages/app.sk.json` and `messages/app.en.json`: app labels, help, status text, validation, accessibility labels, and errors.
- `messages/site.sk.json` and `messages/site.en.json`: presentation/documentation content, navigation, metadata, and the interactive preview.

Keys describe the purpose of the message and remain stable when copy changes. Add a key to both languages. Do not use translated strings as identifiers.

```tsx
import { t } from '../i18n/messages';

<button>{t('workouts.saveSets')}</button>
<input aria-label={t('workouts.repsLabel', { number: index + 1 })} />
```

Use named `{parameters}` for complete phrases. Keep the same parameter names in both languages. `plural('exercise', count)` and `plural('set', count)` use `Intl.PluralRules`, including Slovak's one/few/other forms. Display dates and numbers use `localeTag()`. Spreadsheet serialization retains its stable machine format.

## Runtime

`src/i18n/locale.ts` is independent of React. It detects, persists, and broadcasts language changes. `startLocale()` updates the document's `lang` and follows storage events from other tabs. The React app subscribes through `useLocale()` at its root so switching rerenders labels without remounting editors or discarding drafts. `LanguageSwitcher` is available on login and in Settings. The habit/workout header has no language switcher.

The website imports the same locale module. Elements declare `data-message="key"`, `data-message-aria-label="key"`, or `data-message-content="key"`. The document title, metadata, static content, preview labels and current status all update when switching; the preview's values, active tab and offline checkbox remain intact.

`build/localization.ts` resolves `{{site.key}}` slots to English when Vite serves/builds HTML, so the documentation remains readable and indexed without JavaScript. `{{app.key}}` supplies Slovak app metadata before the selected language is applied at startup. URLs and section IDs are the same in both languages. Static Markdown reference files are maintained in English; the full web guide is bilingual.

Website catalog values may contain the existing trusted inline markup (`strong`, `em`, `code`, links and spans). Only checked-in catalog content is used as HTML; do not interpolate untrusted user input into those values. React app messages render as ordinary text. Known app errors are retranslated when switching; diagnostic strings returned by Google or Sheetbase remain in the upstream service's language.

## Data boundaries

Language changes never rename habits or exercises, edit spreadsheets, reconnect accounts, or clear local queues. `Habits`, `HabitDefinitions`, `Workouts`, `WorkoutDefinitions`, `_Sheetbase`, `Date`, codec IDs, storage keys and date keys are technical identifiers and must remain untranslated. New user-facing spreadsheet file titles can use the selected language, but internal tab titles remain stable.

## Checks

`npm test` verifies catalog key/parameter parity, browser-language detection, saved choices, blocked storage, cross-tab updates, plural forms, form translations, error translation, and stable spreadsheet schemas/serialization in both languages. `npm run test:pwa` also builds app and website under root and nested paths and checks that all HTML localization slots were resolved.

For a manual check, switch on the website, follow **Open tracker**, and confirm the selected language. Sign in, change it in Settings, reload, and return to the website. On a phone, confirm the switcher and menu fit the screen. Existing PWA installations download updates normally; save and close drafts, then use **Load new version**, or close and reopen the app.
