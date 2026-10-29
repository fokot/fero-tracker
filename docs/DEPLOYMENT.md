# Deployment and PWA operations

The app and bilingual documentation are static Vite outputs. No application server or client secret is required. The same artifact supports HTTPS hosts at `/` or an absolute subpath such as `/fero-tracker/` or `/tools/tracker/`.

## GitHub Pages

For this repository, the intended addresses are:

- App: `https://fokot.github.io/fero-tracker/`
- Documentation: `https://fokot.github.io/fero-tracker/docs/`

1. In the GitHub repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The account/repository must support Pages.
2. In **Settings → Secrets and variables → Actions → Variables**, set **VITE_GOOGLE_CLIENT_ID** to your Google Web application OAuth client ID. The deployment intentionally fails if it is missing, rather than publishing a broken login.
3. Optionally set **VITE_GOOGLE_PICKER_API_KEY** and **VITE_GOOGLE_PROJECT_NUMBER** to enable browsing additional Drive files.
4. In that Google project's OAuth client, add **`https://fokot.github.io`** to **Authorized JavaScript origins**. Do not include `/fero-tracker/` in the origin. Forks use their own owner's origin. This app uses Google's popup token flow, not a redirect callback page.
5. Enable **Google Sheets API** and **Google Drive API**, configure consent and the `openid email profile https://www.googleapis.com/auth/drive.file` scopes, and add test users if the consent screen is in Testing.
6. Commit and push the source to `main`. `.github/workflows/pages.yml` runs the regression suite, checks PWA output at several paths, builds, uploads `dist/`, and deploys. You can also run **Deploy app and documentation** manually in Actions after the workflow exists on the default branch.
7. Open the URL reported by the deployment job. Check Google sign-in online, then install and load both trackers from your phone.

The workflow obtains `base_path` from `actions/configure-pages`, so project sites use `/<repository>/` and root/custom-domain sites use `/`. Do not hard-code a second repository name in asset paths or the service worker.

All `VITE_*` values are public build-time browser configuration. Never provide a Google client secret or access token. The workflow uses repository variables so local `.env.local` does not need to be committed. The dependency is pinned by `package-lock.json`; CI uses `npm ci` and Node 24.

If GitHub reports **Your current plan does not support GitHub Pages for this repository**, the private repository is not eligible on the current plan. Either use a plan that supports private-repository Pages, explicitly make the repository public, or publish only the built static artifact in a separate public Pages repository. Do not change source visibility as a side effect of deployment. A separate deployment repository needs its own publish configuration; the included workflow targets the source repository's Pages site.

### Optional Google Picker

Enable **Google Picker API** in the same Google Cloud project as the OAuth client. Restrict the browser API key to Google Picker API and Google Drive API. Website referrers should include your deployment (for example `https://fokot.github.io/fero-tracker/*`) and `https://docs.google.com/*`; retain local referrers only if needed. Use the project's numeric project number for `VITE_GOOGLE_PROJECT_NUMBER`. See the [Google Picker setup](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample).

Keep the same Google Cloud project when changing hosting if you want to retain `drive.file` grants. A new project cannot automatically open files granted to an old one.

## Build and preview locally

```sh
npm ci
cp .env.example .env.local
# Set VITE_GOOGLE_CLIENT_ID in .env.local.
npm test
npm run build -- --base=/fero-tracker/
npm run test:pwa
npm run preview -- --base=/fero-tracker/
```

Open `http://localhost:4173/fero-tracker/` and `/fero-tracker/docs/`. For a sign-in test, also authorize `http://localhost:4173` in Google Cloud; the development origin on port 5173 is separate. The regular development command is `npm run dev` and serves app and docs at the root.

For a custom path, use `npm run build -- --base=/tools/tracker/`. For a root site, use `npm run build -- --base=/`. Use an absolute path with leading and trailing slashes; relative and external URL bases are intentionally unsupported by the worker. Serve the contents of `dist/` at that exact path and retain its directory layout. GitHub Pages automatically redirects directory requests to their trailing-slash URL. Other hosts should do the same for the app and documentation directories.

`vite preview` is for local verification, not production hosting. HTTPS is required in production; localhost is a development exception. `npm run dev` intentionally does not register a service worker. To regenerate the committed PNG icons from the existing checkmark identity, run `npm run icons` (Node built-ins only).

## What is installed

The manifest uses relative `id`, `scope`, `start_url`, and icon URLs, so the installed app launches inside its deployment path. Icons include PNGs at 192 and 512 pixels, a separate maskable icon with safe padding, and an opaque 180-pixel Apple touch icon. The app captures Chromium's install prompt and offers installation on login and in Settings. Browsers without that event receive manual instructions.

The worker is registered at `${BASE_URL}sw.js` with that same scope. Its precache includes the application and documentation documents, emitted scripts/styles, manifest, and icons. It handles only known static assets and the two known documents. Other navigation, Google APIs, account data, credentials, and non-GET requests bypass it. The cached shell stays consistent with its bundled scripts instead of mixing new HTML with an old cache.

Cache names include the full deployment path. Activating `/fero-tracker/sw.js` deletes only older caches for `/fero-tracker/`; it does not delete Sheetbase storage or caches for `/sheetbase/` or another tracker path. Existing legacy root shell caches with timestamp names are cleaned only by a root deployment.

A new worker waits until old controlled windows close. There is no `skipWaiting` and no forced reload, protecting unsaved editor drafts. Save drafts, close all app windows and browser tabs, then reopen to activate an update. After initial setup, a worker can also serve cached documentation offline; its sample preview is in memory and resets on reload.

Browser local storage and IndexedDB are scoped to an **origin**, not a URL path. Subpaths share tracker storage on the same origin even though their service-worker caches are isolated. Changing origin, browser, or installed-app storage creates a different local store; synchronize or export pending changes before moving. This is not a server-side backup of unsent edits.

## Verification checklist

- Open the app and docs at the final HTTPS subpath. Check all icons and assets load without root-path 404s.
- In browser developer tools, confirm manifest start URL/scope and worker script/scope use the deployment path.
- Sign in and load Habits and Workouts online. Install from Chrome on Android and Safari's Add to Home Screen on iPhone. If the installed app uses separate storage, sign in and load there too.
- Disconnect, reopen, edit an existing record, and reopen again. Verify the edit persists. Reconnect and sign in if required; verify the edit reaches the correct Google Sheet.
- Publish another build. Confirm an existing editor is not force-reloaded; close all controlled clients and reopen to get the new version.

Automated checks cover worker request behavior, cache isolation, install-event handling, icon dimensions, manifest URLs, and production output at `/`, `/fero-tracker/`, and `/tools/tracker/`. Physical device installation, Google consent, and live account permissions still need a real browser/account check.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Pages setup fails / returns 404 | Enable Pages with GitHub Actions as source; check repository plan and administrator access. |
| Deployment says client ID is missing | Add the Actions repository variable, then rerun deployment. |
| Google `origin_mismatch` | Authorize the exact scheme + host + port, without a path. |
| Manifest or worker 404 under a repository path | Rebuild with the correct `--base`; deploy all of `dist/` at that path. |
| No install button on iPhone | Use Safari → Share → Add to Home Screen. The Chromium prompt event is not required there. |
| Offline cold start fails | Complete an online production visit and wait for the worker to finish installation. Development mode has no offline shell. |
| First workout visit fails offline | Open Workouts online once in that browser/installed app. |
| Update seems stuck | Save drafts and close every controlled tab/window, then reopen online. |
| Pending changes remain | Keep the app open, reconnect, sign in, and check sync errors. Do not clear storage; export a backup. |

References: [Vite static deployment](https://vite.dev/guide/static-deploy.html), [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Google OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [web app manifests](https://web.dev/learn/pwa/web-app-manifest).
