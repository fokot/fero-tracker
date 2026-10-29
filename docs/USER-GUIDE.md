# Fero Tracker user guide

Fero Tracker records daily habits and exercise sets. The interface supports Slovak and English; this Markdown guide is in English. Use SK/EN on login or in Settings to switch the app language. The habit and workout views have no language switcher. The website shares the same remembered language preference. Open the [documentation website](https://fokot.github.io/fero-tracker/docs/) for a visual introduction and an in-memory sample preview.

## First use

1. Open the deployed app with an internet connection and choose **Prihlásiť sa cez Google**.
2. Choose your Google account and grant the requested permissions. The app finds or creates a habits spreadsheet in your account.
3. Add your habits and record today's values. Open **Workouts** online once to create or load its separate spreadsheet.
4. Install the app from your browser and open it from the new icon. On platforms with separate installed-app storage, sign in and load each tracker again inside that app.

## Install on your phone

The production app must use HTTPS. A development server over a phone's local network address is not a substitute for a deployed PWA.

**iPhone / iPad:** open the app in Safari → Share → Add to Home Screen → keep Open as Web App enabled if offered → Add. Start the app from its icon.

**Android:** open the app in Chrome → use **Nainštalovať aplikáciu** on the login screen or in Settings when offered. Alternatively use Chrome's ⋮ menu → Install app / Add to Home screen. Confirm installation.

Chrome and Edge on desktop also offer installation from their menu or address bar. Browser wording and prompt availability vary. A missing in-app button does not prevent using the browser's installation menu.

## Habits

Use **+** to add a checkmark or numeric habit. Record values in the day grid. A number can be zero; clearing a value is different from entering zero. Move between dates to review history.

To manage a name, hold it for about half a second on touch screens, click it with a mouse, or activate it with the keyboard. Renaming preserves the habit ID, type, and values. Deleting asks for confirmation and removes that habit across all days.

## Workouts

Choose a day in **Workouts**. Add an exercise or reuse an existing name, then choose **Upraviť série** to edit its sets. Every completed row needs repetitions and weight in kilograms. Decimal and zero weights are allowed. An empty final row grows as you type; entirely empty rows are ignored. Save commits all sets for that exercise and day together.

Saving an existing exercise with no sets clears it for that day. **Vymazať z tohto dňa** also clears only the selected day, after confirmation. The exercise remains available for other days. Renaming an exercise changes its column across its history.

## Settings

Open the gear icon for **Nastavenia**.

- Choose light (**Svetlý**), dark (**Tmavý**), or system (**Podľa zariadenia**) appearance.
- Create or select separate spreadsheets for Habits and Workouts. Changing a connection does not copy or delete the previous file. Pending edits stay attached to their original file.
- Open the connected file directly in Google Sheets.
- Inspect outstanding local changes and download a JSON backup in the local storage section. This backup is an export; there is currently no automatic import/restore flow.
- Find installation instructions and a link to the bilingual documentation.

An existing file must already be accessible to the app, or you must explicitly grant it with the optional Google Picker. Pasting a URL alone does not grant access. The app checks managed headers before connecting and preserves unrelated tabs.

## Offline and synchronization

A successful edit is committed to IndexedDB, with its queued operation, before the interface reports success. After a completed first online visit, the service worker makes the application shell available offline. A selected sheet must have been loaded online before it can be edited offline.

A restored local profile can edit cached records without a fresh Google sign-in. Uploads require a connection and Google authorization. Open the app and sign in again if authorization expired. Sync runs while the app is open; do not assume it will upload after you close it.

The queue survives reloads. Explicit sign-out clears the active profile pointer, keeps accounts isolated, and requires an online sign-in to return to the account. Do not sign out just to work offline.

## Updates and troubleshooting

Updates download during online visits and are checked again when the app returns to the foreground. After the download completes, a new opening uses the latest shell, even if another tab remains open. An already open app offers **Load new version**; save and close open forms before using it. There are no forced reloads, and unfinished local writes prevent an update reload. On older installed versions that lack the notice, open online to download the update, fully close the app, and reopen.

If the first offline visit fails, open the production app online and allow it to finish loading. Installation alone does not fetch every spreadsheet. If Google reports an origin error, ask the deployment owner to check the OAuth origins. If a schema conflict stops synchronization, download a backup and correct duplicate dates or managed headers before retrying.

Browser storage can be cleared or evicted. Private browsing is not durable storage. Back up pending changes before clearing site data, uninstalling, or moving to another browser or host. Installed apps, especially on iOS, can have separate storage from browser tabs. Across devices, conflicting writes to the same cell use the last successful synchronization. Use refresh to load direct spreadsheet edits.
