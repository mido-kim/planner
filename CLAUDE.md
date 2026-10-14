# Planner: notes for working on this project

A personal calendar + task PWA for one user (PC Chrome and iPhone Safari).
Plain HTML/CSS/JavaScript ES modules, **no build step, no npm, no framework**.
Keep it that way unless the user decides otherwise. See README.md for features
and setup, CHANGELOG.md for history.

## Map

- `js/main.js`: startup, layout shell, `render()`, navigation, input (clicks,
  drag-to-create, keyboard), toasts, settings/backup actions, sign-in screen.
- `js/views/timegrid.js` (day/week/2-week timeline), `js/views/month.js`,
  `js/views/tasks.js`: each returns an HTML string; `main.js` puts it in place.
- `js/dialogs.js`: event editor (repeat presets + custom), scope dialog,
  task editor, settings.
- `js/recurrence.js`: repeat rules: `occurrenceDates`, `expand`,
  `describeRule`, `toRRule`. `js/series.js`: this/following/all edits and
  deletes, returned as write ops.
- `js/store.js` (localStorage) and `js/cloud.js` (Firebase Auth + Firestore,
  SDK pinned to 12.6.0 from gstatic) share `subscribe(fn)` / `apply(ops)`.
- `js/dates.js`: all date math on 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm' strings
  via UTC. Never use local `Date` arithmetic elsewhere.
- `css/app.css`: tokens on `:root` (light + dark), then sections per area.
- `sw.js`: offline cache. **Add any new file to `SHELL`.**
- `js/demo.js`: design preview (`?demo`), in-memory sample data. DESIGN.md has
  the Figma workflow, layer names and the URL options.

## Figma

Design file key `52orOIzQZKKVSt9EeObl2X` (see DESIGN.md). Figma variables are
the source of truth for design values: each one's WEB code syntax names the
CSS custom property it maps to (`var(--bg)`, `var(--hh)`, `var(--radius-event)`,
`var(--ink-blue)`, …). Use those exact names in `css/app.css`; some don't exist
in the CSS yet. Figma gotchas met so far: SF Pro can't be used for instance
text (styles use Inter), and paint opacity on variable-bound fills resets
inside frames with explicit variable modes, so tints are separate layers with
layer opacity.

## Data

Event: `{ id, title, notes, color, tentative, allDay, start, end, rrule,
exdates, seriesId, originalDate, createdAt, updatedAt }`. All-day `end` is the
inclusive last date. Times are floating (no time zone). A changed occurrence is
its own event with `seriesId` + `originalDate`, and its date is in the
series' `exdates`.

Task: `{ id, title, notes, due, dueTime, done, doneAt, createdAt, updatedAt }`.

Firestore paths: `users/{uid}/events/{id}`, `users/{uid}/tasks/{id}`.
Display settings are per device in localStorage (`js/settings.js`).

## Working here

- Run: `python -m http.server 5173` in this folder, open http://localhost:5173.
- Tests: http://localhost:5173/tests/ (page title shows PASS/FAIL count). Add
  a test in `tests/tests.js` when changing recurrence, series or export logic.
- With each change: bump `js/version.js`, add a CHANGELOG.md entry.
- Check new UI at phone width (375px) and in dark mode.
- Prefer reading only the files a change touches; this map is meant to save
  exploring the whole project.
