# Mobile interface

Design direction: a compact personal training diary. The data, dates and set values carry the screen; the app frame stays quiet. The initial generic card-and-gradient direction was rejected because the margins and repeated containers consumed the width needed by the habit calendar. The final design gives the calendar the entire viewport and uses a narrower sticky name column.

The design follows the user-requested [frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md).

## Tokens

- Canvas: #f5f8fc; surface: #ffffff; ink: #172944.
- Action: #215be8; completion: #138568; dividers: #dce5f0.
- Type: native Apple system text for familiar form rendering; ui-rounded/Avenir Next for compact headings. Tabular numerals for dates, repetitions and weights. Form controls use at least 16px text; touch controls are at least 44px.
- Mobile content gutters: 12px for headings and controls, 0px around the habit table and exercise sections. Habit name column: 112px; date cells: 48px. At 320px, these become 104px and 46px.
- Desktop content starts at 24px from the left; calendar uses the available width. Workouts has a 960px reading width anchored to the same left edge.

## Layout

Mobile: compact account header, page title/action, daily summary, edge-to-edge calendar or daily workout ledger, fixed bottom navigation. The calendar opens around today. The sticky habit name column stays visible while the dates scroll.

```
Fero Tracker                        account
Návyky                         + add habit
today / total                        saved
month / today                     actions
habit name | day | day | today | day | ...
habit name |  ✓  |  ✓  |   ✓   | ...
[ Habits ]                    [ Workouts ]
```

Desktop: the same left alignment, navigation moves below the account header, and editors are centered dialogs. Mobile editors are full-width bottom sheets with scrollable content and reachable save/cancel actions. Workout set numbers are actual sequence numbers, not decorative labels.

## iPhone behavior

`viewport-fit=cover` with safe-area insets protects the Dynamic Island/notch and home indicator. Dynamic viewport heights and VisualViewport events limit editor height and account for an onscreen keyboard. Inputs remain zoomable and text selection is not disabled. Horizontal scrolling is confined to the habit calendar. Reduced motion is respected. Native dialog semantics retain focus and Escape support.

Use a 402×874 CSS-pixel viewport as the primary Pro-sized layout check, plus 320px, 375px, 440px, landscape and desktop widths. Browser emulation does not replace testing on a physical iPhone with Safari and the actual keyboard.

## Verification

Checked the populated Habits and Workouts screens at 320×740, 375×812, 402×874, 440×956, 874×402 and 1280×900. The document width matches the viewport; only the habit calendar scrolls horizontally. Confirmed the sticky name column, today shortcut, 16px form text, full-width mobile dialogs, and visible save actions in the landscape editor. The 320px login screen also fits without horizontal overflow.

Saved a numeric habit change and added a workout set against a local mock of Google Sheets. No browser warnings or errors appeared. All 61 existing tests and the production build pass. Screenshots were reviewed for spacing, hierarchy and clipped controls; the viewport override and temporary mock page were removed after testing. Physical-device keyboard and safe-area behavior still need a Safari check on the actual phone.

## Name management

Touch users hold the habit or exercise name for 550ms to open its editor. A short tap does nothing; movement beyond 10px, leaving the target, pointer cancellation or a disabled control cancels the hold. Mouse clicks and keyboard activation open it directly. Names have no edit icon; a short hint explains the gesture. The native text callout is suppressed only on these name controls, and page/calendar scrolling remains enabled.

Management uses the same bottom sheet as other editors. Rename preserves history and explains that the shared column changes across days. Deleting a habit removes it across all days; deleting a workout exercise clears only the selected day. Both require a second confirmation, initially focused on the safe back action. Browser checks against mock Sheets verified habit rename/refresh/delete, workout rename across days, duplicate-name errors, cancellation and deletion from one day while retaining another. Automated gesture, store and spreadsheet checks bring the suite to 76 passing tests.

## Series editing

Each exercise has one `Upraviť série` action at the right of its name, next to the data it changes. The former add-set action below the table and the add-set button inside the editor are removed. The editor has a dashed empty final row; entering either field automatically appends another empty row without changing the current input's identity. Fully blank rows are skipped, partial rows require both values, and zero kilograms remains a valid saved weight. Existing set removal and failed-save draft retention remain available.

Six draft regressions bring the suite to 82 passing tests. Mobile previews at 402px and 320px verified the single action, saving unchanged sets without an extra set, automatic row creation, blocking incomplete rows, adding a new exercise, preserving zero weight, and reachable save controls. The production build passes.
