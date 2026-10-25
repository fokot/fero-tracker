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

No API key or client secret is needed. Client IDs are public configuration. Access tokens are held only in memory and are cleared at sign-out or expiry. The app obtains the signed-in account directly from Google's userinfo API using the OAuth access token before opening a spreadsheet. It does not run a separate ID-token sign-in flow or force consent for permissions already granted.

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

Writes are serialized within an app instance and, when Web Locks are available, across tabs on the same origin. Failed writes display an error and leave the last saved value intact. Offline edits are not queued: reconnect and retry. Concurrent edits from different browsers are not transactionally locked by Google Sheets; refresh to read external changes. A new OAuth project cannot automatically access files created by a different project under the `drive.file` scope.

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

- `npm test`: regression tests for auth, API failures, spreadsheet data handling, dates and state transitions.
- `npm run build`: TypeScript checks and production build.
- `npm run preview`: preview the production build.

The application includes a web manifest and icon. Offline operation and automatic login restoration are not implemented; sign in again after a page reload or token expiry.
