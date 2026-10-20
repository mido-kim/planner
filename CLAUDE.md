# Planner: notes for working on this project

A personal calendar + task PWA for one user (PC Chrome and iPhone Safari).
Plain HTML/CSS/JavaScript ES modules, **no build step, no npm, no framework**.
Keep it that way unless the user decides otherwise. See README.md for features
and setup, CHANGELOG.md for history.

## Map

- `js/main.js`: startup, layout shell, `render()`, navigation, input (clicks,
  click/drag-to-create with the create menu, touch long-press, keyboard),
  toasts, label actions, settings/backup actions, sign-in screen.
- `js/views/timegrid.js` (day/week timeline in px, and the 2-week view as
  two squeezed timelines in %; deadlines as lines, tasks as chips),
  `js/views/month.js` (month grid), `js/views/bars.js` (lanes for
  all-day/multi-day bars and their shapes), `js/views/agenda.js` (the agenda
  panel: every item with full details): each returns an HTML string;
  `main.js` puts it in place.
- Layout (main.js `applyLayout`): the agenda is `.lay-right` / `.lay-bottom`
  on a PC (`settings.panelDock`, resizable by `#splitter`), `.lay-bottom` on
  narrow screens (the lower part), `.lay-sheet` for the month view on narrow
  screens.
- `js/labels.js`: label colors, usage, retire and delete (as write ops).
- `js/holidays.js`: Korean public holidays 2026–2031 (dates → names). Extend
  it each year; working-hours shading skips these days.
- Day and week timelines fit their space (`fitHeight` in `renderTimeGrid`,
  measured in main.js): no vertical scrolling; `settings.hourHeight` is only a
  fallback when an hour would be under 8px.
- The day can run past midnight (`settings.dayEnd` up to 28 = 4 AM):
  `slotOf` in timegrid.js puts the small hours in the previous day's column.
- main.js has swipes (`wireSwipes`: day/week sideways via `move`, 2-week and
  month by a week via `shiftWeek`; a swiped month keeps `state.monthGrid`),
  and the mouse wheel does the same there (one step per `WHEEL_STEP_PX`, at
  most one per `WHEEL_GAP_MS`). `glide` animates the change with the Web
  Animations API: the old panel (`.leaving`, clipped past the fixed hour
  axis / weekday row) and the new one move together by `travel` (a page or
  one week row); only `MOVERS` move; `SETTLE` is a spring as CSS `linear()`.
  `settings.motion` 'fade' fades instead.
- main.js `arrangeLabels` runs after each calendar render: moves task and
  deadline names in a day up or down (`translateY`) until none overlap each
  other or an event's text (the latter only within `NEAR_PX`), timed ones
  first. Long names stay on one line inside their day (faded by
  `fitText`); the user tried spilling into the next day and wrapping, and
  turned both down.
- main.js also has moving by drag (`beginMove` / `updateMove` / `endMove`,
  writes via `moveOps` in series.js) and `fitText`, which fades text that's
  cut off (`.fade` / `.fade-last`); the app never uses "…".
- `js/dialogs.js`: event/deadline editor (repeat presets + custom, shape,
  label picker), scope dialog, task editor, labels manager, create menu,
  settings.
- `js/recurrence.js`: repeat rules: `occurrenceDates`, `expand`,
  `describeRule`, `toRRule`. `js/series.js`: this/following/all edits and
  deletes, returned as write ops.
- `js/store.js` (localStorage) and `js/cloud.js` (Firebase Auth + Firestore,
  SDK pinned to 12.6.0 from gstatic) share `subscribe(fn)` / `apply(ops)`.
- `js/dates.js`: all date math on 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm' strings
  via UTC. Never use local `Date` arithmetic elsewhere.
- `css/app.css`: tokens on `:root` (light + dark), then sections per area.
  Colors are the "Gelato Days" pastels: each item color class sets `--c`
  (pastel), `--ci` (ink for text), `--cl` (mid tone for lines and dots) and
  `--cf` (block fill). The accent is pink (`--accent`, `--accent-strong`,
  `--accent-ink`). Fonts: Instrument Serif for all Latin text (one weight,
  `font-synthesis: none`) and 느좋체 "Neujot" (Pretendard-based, OFL; regular
  and bold, subset to Hangul, `unicode-range`) for Korean. `--font-ui` is the
  stack; `--font-item` (item names, selector list under "Base") is the same
  for now. main.js re-renders on `document.fonts` `loadingdone`, since the
  Korean font only loads once Korean text shows.
- Themes: `js/themes.js` (parts, color math, `builtIn` reads Light/Dark from
  the CSS, `cssVars`, `applyTheme`), `js/theme-boot.js` (classic script in
  `<head>`: sets `data-theme` / the cached variables before first paint).
  `css/app.css` has Light on `:root` and Dark on `:root[data-theme="dark"]`;
  never use `prefers-color-scheme` in CSS. main.js `showTheme` /
  `chosenTheme` / `openThemeMaker`; `settings.theme` is per device ('system',
  'light', 'dark', 'custom' or a saved theme id).
- `sw.js`: offline cache. **Add any new file to `SHELL`.**
- `js/demo.js`: design preview (`?demo`), in-memory sample data. DESIGN.md has
  the Figma workflow, layer names and the URL options.

## Figma

Design file key `52orOIzQZKKVSt9EeObl2X` (see DESIGN.md). Figma variables are
the source of truth for design values: each one's WEB code syntax names the
CSS custom property it maps to (`var(--bg)`, `var(--hh)`, `var(--radius-event)`,
`var(--ink-blue)`, …). Use those exact names in `css/app.css`; some don't exist
in the CSS yet. Figma gotchas met so far: SF Pro can't be used for instance
text; the Figma connector can't use Arial, Pretendard or 느좋체 (all text
styles are Instrument Serif; Korean shows in Figma's fallback); paint opacity on variable-bound fills resets inside
frames with explicit variable modes, so tints are separate layers with layer
opacity. The screens were copied from the live app (?demo, 0.5.5) by script into
instances of the components; event positions there are fixed, not from data.

## Data

Event: `{ id, kind, title, notes, labelId, color, shape, tentative, allDay,
start, end, rrule, exdates, seriesId, originalDate, createdAt, updatedAt }`.
`kind` is 'event' or 'deadline' (a deadline has `end === start`). `shape` is
'block' | 'arrow' | 'line' (bars only). All-day `end` is the inclusive last
date. Times are floating (no time zone). A changed occurrence is its own event
with `seriesId` + `originalDate`, and its date is in the series' `exdates`.

Task: `{ id, title, notes, due, dueTime, labelId, color, done, doneAt,
createdAt, updatedAt }`.

Label: `{ id, name, color, status: 'active' | 'retired', createdAt, updatedAt }`.

Theme: `{ id, name, base: 'light' | 'dark', vars, createdAt, updatedAt }`;
`vars` maps each part's CSS variable name (without `--`) to '#rrggbb', plus
`fill`, `today-tint`, `work` in percent (see `PARTS` / `AMOUNTS`).
An item's `color` is null when it follows its label (`colorOf` in labels.js).
Missing fields mean their default (older data has none of the new ones).

Firestore paths: `users/{uid}/events/{id}`, `users/{uid}/tasks/{id}`,
`users/{uid}/labels/{id}`, `users/{uid}/themes/{id}`.
Display settings are per device in localStorage (`js/settings.js`).

## Working here

- Run: `python -m http.server 5173` in this folder, open http://localhost:5173.
- Tests: http://localhost:5173/tests/ (page title shows PASS/FAIL count). Add
  a test in `tests/tests.js` when changing recurrence, series or export logic.
- With each change: bump `js/version.js`, add a CHANGELOG.md entry.
- Check new UI at phone width (375px) and in dark mode.
- Prefer reading only the files a change touches; this map is meant to save
  exploring the whole project.
