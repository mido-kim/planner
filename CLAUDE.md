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
  one week row); only `MOVERS` move (with `will-change` while gliding). The
  spring is baked into keyframes by `springFrames` (WebKit animates those
  smoothly); a swipe passes `{ from, v }` so the glide sets off at the
  finger's speed (`SWIPE_DAMPING`), and `render(true)` draws the agenda only
  after `GLIDE_MS`. The wheel and buttons use `DAMPING` from rest; the user
  loves how that feels on a PC, so leave it. `settings.motion` 'fade' fades
  instead.
- main.js `arrangeLabels` runs after each calendar render: moves task and
  deadline names in a day up or down (`translateY`) until none overlap each
  other or an event's text (the latter only within `NEAR_PX`), timed ones
  first. Long names stay on one line inside their day (faded by
  `fitText`); the user tried spilling into the next day and wrapping, and
  turned both down.
- Making by drag (main.js `beginSelection` / `extendSelection` /
  `chooseAndCreate`): a time selection is `anchor` / `cur` ([date, minute
  on that day's timeline]) and can cross days and weeks (`timeSpan`,
  `drawGhosts`: a block per day); a days selection (month cells, all-day
  rows) is `from` / `to`. `dayAt` finds the day under any point in any view.
  The `.sel` / `.drop` colors sit after the views in css so they beat the
  weekend, today and hover shading. `squeezeMinis` marks 2-week blocks too
  short for a line as `.short` (text centered).
- main.js also has moving by drag (`beginMove` / `updateMove` / `endMove`,
  writes via `moveOps` in series.js) and `fitText`, which fades text that's
  cut off (`.fade` / `.fade-last`); the app never uses "…".
- `js/dialogs.js`: event/deadline editor (repeat presets + custom, shape,
  label picker, symbol picker), scope dialog, task editor, labels manager,
  create menu, settings (with the working hours list).
- Stickers (`js/stickers.js`: `BUILT_IN` (files in `stickers/`),
  `makeSticker` (canvas: `clearBackground` flood-fills the edge color away,
  `visibleBox` trims, ≤320px, WebP or PNG data URL), `stickerBox` (S/M/L:
  hours tall on timelines, share of a day box in the month), `onOccurrence`).
  main.js "Stickers": the tray (`drawTray`, `#stk-tray`), `drawStickers`
  fills each view's `.stk-layer` (absolutely placed over the day columns /
  month weeks, in the grid; a glide mover) after every calendar render,
  `anchorAt` turns a drop point into a placement (asks `askScope('sticker')`
  on a repeating event), `wireStickers` drags (tray: right away; stuck: mouse
  right away, touch after LONG_PRESS_MS) and the tap menu. Event notes:
  `.ev-n` in timegrid.js blocks, fitted to whole lines in `fitText`.
- `js/symbols.js`: the check-off symbols (outline → filled; parts `s` / `d` /
  `k` in each SVG, styled in css under `.sym`), `symbolOf` (event's own, its
  label's, else 'check'; deadlines 'flag'), `isDone`, `doneOps`,
  `checkButton` (used by every view; main.js handles `[data-check]` clicks).
  'none' shows nothing. series.js carries `doneDates` along like `exdates`,
  and has `taskToDeadlineOps` / `deadlineToTaskOps` (one date of a repeating
  deadline becomes a task).
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
- Themes: `js/themes.js` (`PRESETS`: seven editor-palette themes built by
  `preset` from a palette's surfaces, accent and nine item colors, and
  fifteen light pastel ones built by `pastel` from five or six colors and an
  accent: tinted surfaces, item colors keep their hues but take the
  palette's softness and its own colors where close (`GELATO` holds Gelato
  Days' fills and inks); `cssVars`, `applyTheme`), `js/theme-boot.js` (classic script in `<head>`: sets
  `data-theme` / the cached variables before first paint). `css/app.css` has
  Light on `:root` and Dark on `:root[data-theme="dark"]`; never use
  `prefers-color-scheme` in CSS. main.js `showTheme` / `chosenTheme`;
  `settings.theme` is per device ('system', 'light', 'dark', a preset id, or
  'custom' / a saved theme id from the theme maker that 0.8.0 removed). Light
  and Dark are shown as "Gelato Days" and "Gelato Nights"; the user loves them
  as they are: don't change them.
- Working hours: `settings.workRanges` ([from, to] hours, any number);
  `workSpans` in settings.js sorts and joins them, timegrid.js `workBand`
  shades each.
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

Event: `{ id, kind, title, notes, labelId, color, shape, symbol, tentative,
allDay, start, end, rrule, exdates, doneDates, seriesId, originalDate,
createdAt, updatedAt }`. `symbol` is null to follow the label; `doneDates`
are the occurrence dates checked off.
`kind` is 'event' or 'deadline' (a deadline has `end === start`). `shape` is
'block' | 'arrow' | 'line' (bars only). All-day `end` is the inclusive last
date. Times are floating (no time zone). A changed occurrence is its own event
with `seriesId` + `originalDate`, and its date is in the series' `exdates`.

Task: `{ id, title, notes, due, dueTime, labelId, color, done, doneAt,
createdAt, updatedAt }`.

Label: `{ id, name, color, symbol, status: 'active' | 'retired', createdAt,
updatedAt }`.

Theme: `{ id, name, base: 'light' | 'dark', vars, createdAt, updatedAt }`;
`vars` maps each part's CSS variable name (without `--`) to '#rrggbb', plus
`fill`, `today-tint`, `work` in percent (see `KEYS` and `preset` in themes.js).
Saved themes come only from the old theme maker; they still show and sync.
An item's `color` is null when it follows its label (`colorOf` in labels.js).
Missing fields mean their default (older data has none of the new ones).

Sticker: `{ id, name, src, w, h, createdAt, updatedAt }` (`src` a data URL).
Placement: `{ id, stickerId, size: 's' | 'm' | 'l', at, … }`: at 'time'
`{ date, min, x }`, at 'event' `{ eventId, date (repeating only), following,
col, fx, fy }`, at 'month' `{ date, fx, fy }` (see stickers.js).

Firestore paths: `users/{uid}/events/{id}`, `users/{uid}/tasks/{id}`,
`users/{uid}/labels/{id}`, `users/{uid}/themes/{id}`,
`users/{uid}/stickers/{id}`, `users/{uid}/placements/{id}`.
Display settings are per device in localStorage (`js/settings.js`).

## Working here

- Run: `python -m http.server 5173` in this folder, open http://localhost:5173.
- Tests: http://localhost:5173/tests/ (page title shows PASS/FAIL count). Add
  a test in `tests/tests.js` when changing recurrence, series or export logic.
- With each change: bump `js/version.js`, add a CHANGELOG.md entry.
- Check new UI at phone width (375px) and in dark mode.
- Prefer reading only the files a change touches; this map is meant to save
  exploring the whole project.
