# Architecture

Fero Tracker is a React/TypeScript application with Zustand stores and a Google Sheets backend owned by the signed-in user. Vite builds two HTML entry points: the app (`index.html`) and a bilingual presentation/documentation site (`docs/index.html`). Both deploy in one static artifact under the same configurable base path.

## Application responsibilities

`src/App.tsx` restores the local profile and manages account authorization. `src/lib/googleOAuth.ts` handles the Google Identity Services popup and in-memory access tokens. `src/lib/googleSheets.ts`, `sheetConnections.ts`, and `sheetSetup.ts` discover, validate, and create the two separate spreadsheet files. Optional `googlePicker.ts` grants access to additional files without widening `drive.file` to all Drive files.

`src/components` contains the calendar, workout editor, settings, appearance, and installation UI. `src/store` holds tracker and synchronization state. Local dates, habit types, set codecs, and stable column IDs belong to the tracker, not the storage SDK.

## Records and synchronization

`src/lib/sheetbase.ts` connects the tracker to the actual `@fokot/sheetbase` client and Google Sheets adapter. IndexedDB contains loaded history, pending operations, and persisted in-flight batches. Writes commit locally before UI acknowledgement. Nearby edits are grouped and absolute-value patches coalesce; structural changes retain their transaction boundary. Synchronization runs while the app is open, online, and authorized for the account and connection.

Account ID, spreadsheet ID, and tab identify a queue. Changing a connection never transfers its old queued edits to a new file. Session metadata and per-account file choices use local storage; OAuth tokens are not persisted. Signing out clears the active profile pointer and pauses synchronization without deleting account queues.

Habits use `Habits` (date rows and habit columns) plus `HabitDefinitions` (ID/name/type). Workouts use a separate file with `Workouts` (date rows and exercise columns containing ordered sets) plus `WorkoutDefinitions` (stable column IDs). The hidden `_Sheetbase` tab contains atomic batch receipts. The adapter refreshes headers and date indices before normal writes and preserves untouched cells and unrelated tabs. Incompatible schemas or duplicate date keys stop synchronization without discarding the queue. Last successful synchronization wins when independent devices write the same cell.

## PWA lifecycle

`src/lib/pwa.ts` captures install events, detects standalone mode, and registers the production worker using Vite's `BASE_URL`. `InstallApp.tsx` offers the native prompt when available and manual browser instructions otherwise. iOS standalone detection includes `navigator.standalone`.

`build/offline.ts` generates the scoped worker from emitted assets and resolved Vite base. Static shell caching is independent of record storage. A worker owns only its full base-path cache namespace, caches known assets, and serves app/documentation HTML from their matching installed version. It never intercepts Google requests or arbitrary application data. A completely downloaded worker activates with `skipWaiting` and claims clients without reloading them. The current and immediately previous static caches are retained so already-open pages can finish their asset requests. The app checks for updates on foreground/online events and offers an explicit reload notice; open dialogs and unfinished local writes block that reload.

Browser record storage is origin-scoped. Separate deployments on different paths of the same origin share the existing tracker's IndexedDB/local storage; only their shell caches are path-isolated. Separate origins, devices, or isolated installed apps do not share local queues. See [deployment operations](DEPLOYMENT.md) before moving hosts.

## Documentation site

`docs/site.css` and `docs/site.js` provide responsive navigation, accessible tabs, copyable commands, and an illustrative habit/workout preview. The preview uses in-memory sample values. It neither connects to Google nor reads the real tracker's IndexedDB/local storage. The documentation itself works without JavaScript.

## Verification

- `npm test` exercises authentication, data codecs, sessions, tracker state, Sheetbase integration, worker behavior, and installation lifecycle.
- `npm run build` type-checks the application and builds app plus docs.
- `npm run test:pwa` builds temporary production artifacts at root and two subpaths and checks resolved HTML/manifest/assets/worker URLs and PNG dimensions.
- `.github/workflows/ci.yml` runs these checks for pull requests and `main`; `pages.yml` validates and publishes the same artifact after Google configuration is supplied.

The tests do not replace physical iPhone/Android installation or end-to-end Google consent and live Sheets verification.

## Localization

`messages/app.{sk,en}.json` and `messages/site.{sk,en}.json` contain the two language catalogs. `src/i18n/locale.ts` shares a saved language across the app and site; labels update without resetting forms or data. Display dates/numbers follow the selected locale while spreadsheet identifiers and serialization stay stable. See [Localization](LOCALIZATION.md).
