# Documentation screenshots

The documentation uses browser captures of the real `Tracker` components and app styles, with fictional data. The capture entry seeds the in-memory stores and replaces the two loading methods so it does not sign in, access Google, or load personal records. It is a development entry, excluded from the production build.

To refresh the images after UI changes:

1. Run `npm run dev -- --host 127.0.0.1`.
2. Open `/scripts/screenshots/?lang=en` in a browser at a 390 × 844 CSS-pixel viewport.
3. Click **Today** to center the calendar and capture the viewport as `public/screenshots/habits-en.jpg`.
4. Open **Workouts** and capture `workouts-en.jpg`.
5. Repeat with `?lang=sk` for `habits-sk.jpg` and `workouts-sk.jpg`.

Capture the actual viewport without adding browser chrome or a simulated phone frame. Dates follow the browser's current day. Keep the image dimensions and filenames aligned with the hero in `docs/index.html` and `docs/site.js`.
