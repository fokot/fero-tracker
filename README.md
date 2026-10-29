# Fero's Habit Tracker

React, TypeScript and Zustand habit tracker backed by the signed-in user's Google Sheet.

## Local setup

1. Use Node.js 20.11 or newer and install dependencies with `npm ci`.
2. In one Google Cloud project, enable **Google Sheets API** and **Google Drive API**.
3. Configure the OAuth consent screen. For an external app in Testing, add your Google account as a test user.
4. Create an OAuth client of type **Web application**. Add `http://localhost:5173` to **Authorized JavaScript origins** (and add any other exact host/port you use). This app uses popup callbacks and does not require a redirect URI.
5. Configure the `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file` scopes. The Drive scope limits file access to files created by or explicitly opened with this app.
6. Copy `.env.example` to `.env.local`, set `VITE_GOOGLE_CLIENT_ID`, and run `npm run dev`. Restart Vite after changing environment variables.
7. Open `http://localhost:5173` and click **Prihlásiť sa cez Google**. One Google OAuth flow handles account selection and spreadsheet permission, then opens the tracker directly. Google still asks for any permissions you have not granted yet; there is no separate Connect Google Sheets step in the app.

No client secret is used. Login, creating sheets and choosing files already accessible to the app do not need an API key. Client IDs are public configuration. Access tokens are held only in memory and are cleared at sign-out or expiry. The app obtains the signed-in account directly from Google's userinfo API using the OAuth access token before opening a spreadsheet. It does not run a separate ID-token sign-in flow or force consent for permissions already granted.

## Settings and appearance

Open the gear button in the header for **Nastavenia**. Appearance defaults to **Podľa zariadenia**, follows live changes to the system's light/dark mode, and can be overridden with **Svetlý** or **Tmavý**. The preference is saved in this browser and is applied before the first render, including on the login screen. Storage restrictions do not prevent switching the current page's theme.

Habits and Workouts have independent spreadsheet connections. Settings can list editable Sheets already granted to the app, verify a URL/ID, or create a new spreadsheet. A selected existing file is reviewed before connecting. The app uses its own `Habits`/`HabitDefinitions` or `Workouts` tabs, creates missing tabs, and never overwrites unrelated tabs or incompatible populated headers. Switching does not copy, merge or delete data in the previous file. Failed validation retains the previous connection. Files must be different for the two trackers. Choices are saved per Google account in this browser and restored on the next login; custom file names do not affect reconnection. Without a saved selection, the original automatic file discovery continues. If automatic habit discovery fails, the signed-in user can still open Settings and choose another file.

### Optional full Google Drive file browser

The **Prehliadať Disk Google** button uses Google Picker to grant access to an additional file without widening the existing `drive.file` OAuth scope. Configure the same Google Cloud project as the OAuth client:

1. **APIs & Services → Library → Google Picker API → Enable**.
2. **APIs & Services → Credentials → Create credentials → API key**.
3. Restrict the key under **Application restrictions → Websites** to your app's website referrers (for local development, `http://localhost:5173/*`) and `https://docs.google.com/*`. Under **API restrictions → Restrict key**, select **Google Picker API** and **Google Drive API**.
4. Find the **Project number** under **IAM & Admin → Settings**.
5. Set `VITE_GOOGLE_PICKER_API_KEY` and `VITE_GOOGLE_PROJECT_NUMBER` in `.env.local`, then restart Vite. These are public browser configuration, not a client secret.

See the [official Google Picker setup](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample). Without this optional configuration, settings still offer creation and app-accessible sheets; pasting a URL cannot grant access to an arbitrary Drive file by itself.

## Data and synchronization

The app finds its spreadsheet on Google Drive by the existing `Habits_<email hash>` name and reuses it across sign-ins and devices using the same OAuth project. Do not rename this file if you want automatic discovery. It creates a file only when no matching accessible file exists. If several old copies exist, the oldest is selected; they are not automatically merged or deleted.

- `Habits`: **one row per date, one column per habit**. Column A is `Date`; row 1 contains habit names. For example:

  | Date | Run | Read | Sleep |
  | --- | --- | --- | --- |
  | 2026-10-25 | ✓ | 0 | 7.5 |
  | 2026-10-26 | | 10 | 8 |

  Editing a habit changes only its cell. Multiple habits recorded on the same date share the same row. A new habit immediately adds a column, even before recording a value. The grid expands automatically when it needs more rows or columns.
- `HabitDefinitions`: internal ID, Name, Type metadata. Types remain stable even when all recorded values are cleared.

Existing three-column trackers (`Date`, `Habit Name`, `Value`) are converted automatically on sign-in, refresh, or the next edit. The original `Habits` tab is duplicated as `Habits_Legacy_Backup` (with a suffix if that name exists), and the active tab is converted in the same atomic Google Sheets batch. The tab ID and links stay the same. Failed conversion leaves the original intact. Dates are consolidated; for duplicate date/habit records, the last record wins, including explicit clears. Unused habits and their types are preserved. Invalid legacy dates or missing habit names stop the conversion with an error instead of silently discarding records.

Edits commit to IndexedDB first, including a durable outbox, and update the UI after the local transaction completes. A network failure does not roll back a locally saved value. The cached profile, sheet IDs, all loaded history and pending edits survive reloads; OAuth tokens are never persisted. A restored session can edit cached data immediately, but must sign in to Google before uploading. Explicit sign-out clears the active profile pointer and keeps each account’s queued records isolated. A sheet must be loaded online once before editing it offline; opening Workouts for the first time also requires a connection.

The storage and synchronization engine is [Sheetbase](https://github.com/fokot/sheetbase). It is installed directly from GitHub at the exact commit recorded in `package.json` and `package-lock.json`; the adjacent local checkout is only for developing the library. The app retains OAuth, file discovery/selection, its data codecs and legacy migrations. It does not implement a second IndexedDB outbox, retry scheduler, operation compactor, cell-write planner or receipt ledger.

Sheetbase groups nearby edits (650 ms) into batches of approximately 100 operations. Unsent patches coalesce to their last absolute value, including explicit clears. Structural transactions and persisted in-flight batches remain intact. Adding a new exercise and its first sets uses one local transaction and one remote Sheets batch, even at the batch boundary.

The existing spreadsheet layout stays the same. `HabitDefinitions` stores stable habit IDs, names and types; `WorkoutDefinitions` gives exercise columns stable IDs that survive renaming. The hidden `_Sheetbase` tab stores receipts committed atomically with changes. Ordinary value writes read current headers, date rows, column definitions and receipts, then change only touched cells. Structural changes use the full table snapshot. Duplicate dates retain the old tracker policy: the last physical row wins, including clears, and edits update all matching date rows. Sorting or inserting rows before synchronization is handled using a fresh index. Unrelated tabs and trailing rows with blank dates are preserved.

The first launch imports each legacy IndexedDB cache and outbox into `feros-tracker-sheetbase` without discarding pending changes or replacing an existing migrated queue. Frozen batch IDs remain unchanged. The Google adapter recognizes the old `FeroTrackerSync` receipts so a previously committed edit is not applied again. The original database is retained for migration and recovery; the local backup includes both new records and legacy data. Keep receipt tabs while devices may have pending changes.

Cached day changes, calendar scrolling and reentering either tracker use local history. Full history refreshes on login for active connections, first loading, connection changes and the refresh button. Sheetbase resumes pending work on connectivity/focus changes with bounded retries. Web Locks coordinate tabs, with renewable IndexedDB leases as a fallback. An expired login suspends uploads and leaves local editing available. Queues remain isolated by account, spreadsheet and tab; changing the selected file keeps old queued changes attached to the original file. Settings lists outstanding files and downloads a JSON backup. A local storage failure rejects the edit instead of claiming it was saved.

Google Sheets does not transactionally lock independent devices. Concurrent writes to the same cell use the last successful synchronization. A schema conflict stops uploading and retains the queue for retry and backup. Direct changes to other cells become visible on a full refresh. A new OAuth project cannot automatically access files created by a different project under `drive.file`.

To manage a habit, hold its name for 550ms on a touch screen or click its name with a mouse. Keyboard activation also opens the editor. A short tap or scrolling does not open it. Renaming changes the column header and definition atomically, preserving the ID, type and every recorded value. Deletion asks for confirmation, then removes that habit's column and definitions across all days; other habits and dates remain intact.

## Workouts

The **Workouts** tab shows one selected training day, with a card for each exercise performed that day. One **Upraviť série** button beside the exercise name handles both adding and editing sets. The editor always has an empty final row; starting to fill it adds another empty row automatically. Completely empty rows are ignored on save, while partially filled sets require both repetitions and weight. Weights are in kilograms, including decimals and zero for unweighted exercises. Existing exercise names are offered for reuse on other days. Save commits all sets for that exercise together; a failed save retains the draft for retry. Saving an existing exercise without any sets removes it from the selected day while keeping its column for future use. A new exercise requires at least one completed set.

Workouts are stored in a **separate spreadsheet file**, `Workouts_<email hash>`, created lazily on the first visit to Workouts and reused afterwards. It uses the same Google authorization as habits. Its `Workouts` sheet contains one row per date and one column per exercise:

| Date | Bench press | Drep |
| --- | --- | --- |
| 2026-10-25 | 5×100, 3×120, 1×125 | 8×80 |
| 2026-10-26 | 5×102.5 | |

Set order is preserved, with every set of an exercise/day serialized into one cell. New exercise headers and their first values are saved atomically. Habit data and its migration remain in the habits spreadsheet. Do not rename the workout spreadsheet or its `Workouts` sheet if you want automatic discovery to continue working.

Exercise names use the same hold/click gesture. Renaming changes the shared exercise column across all days, keeping its sets. **Vymazať z tohto dňa** asks for confirmation and clears only the selected day's cell, retaining other days and the exercise suggestion for future use. A name already used by another habit or exercise is rejected rather than merging their histories.

## Checks

- `npm test`: regression tests for auth, file discovery, legacy migrations, tracker state and integration with the actual Sheetbase client/Google adapter. Sheetbase separately tests its own storage, batching and receipt contracts.
- `npm run build`: TypeScript checks and production build.
- `npm run preview`: preview the production build.

The production build includes a service worker that precaches the app shell, manifest and icon for reopening offline after a completed online visit. Google API responses, access tokens and third-party content are not cached by the worker. Serve production over HTTPS (localhost also works); the Vite development server deliberately does not register it. Use `npm run build` followed by `npm run preview` to verify the offline shell locally.

On iOS and other browsers, synchronization runs while the app is open or when it is opened again. It cannot guarantee uploads after the browser closes. Google token expiry may require another sign-in, without interrupting local editing. Clearing site data, private browsing cleanup or browser eviction can remove unsynchronized local data; use the backup button when needed.
