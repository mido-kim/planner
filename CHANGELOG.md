# Changelog

Each version lists what changed for you as a user. The version number also
appears at the bottom of Settings.

## 0.3.0 (2026-10-14)

- Deadlines: a single date and time, drawn as a line across the day with its
  title, and as a flagged chip in the 2-week and month grids. They can repeat.
- New buttons at the top for a new event, deadline or task. Clicking or
  dragging on the calendar now asks which of the three to make.
- On a phone, hold a finger on the timeline for a moment, then drag to pick a
  time range. A normal swipe still scrolls; a tap still picks an hour.
- Labels: give events, deadlines and tasks a label (Settings → Labels, or
  “Edit labels” in any editor). A label sets the item's color; any item can
  still pick its own color. Retire a label to hide it from the picker (its
  items keep it), restore it later, or delete it together with its items
  (with Undo). Labels sync and are part of backups.
- Tasks with a due date show on the calendar: at their time, or at the end of
  the day when they have no time. Tick them off right there; click to edit.
- The 2-week view is now a grid of two tall week rows, like the month view.
- All-day and multi-day events stretch across their days in the all-day row
  and in the 2-week and month grids, as a block, a line with arrowheads at both
  ends, or a plain line (pick in the event editor). Events of 24 hours or more
  move to the all-day row.
- The app's font is now Arial (with Apple SD Gothic Neo / Malgun Gothic for
  Korean).
- Event boxes no longer have a colored bar on the left.
- Short event boxes show the title first; the time only uses the room left.
- Hour height: 30 px is the new default (also offered in Settings next to 40,
  52 and 68). Devices still on the old default move to 30.

## 0.2.1 (2026-10-14)

- Design preview: add `?demo` to the address to see the app filled with sample
  events and tasks (nothing is saved, your calendar isn't touched). Add
  `&view=day|week|2week|month` or `&show=tasks|event|new-event|delete|task|settings`
  to open a particular screen. Used for designing in Figma.

## 0.2.0 (2026-10-14)

- Tentative events: turn on "Tentative" in the event editor. They're drawn with
  a light tint and a dashed outline in every view, and export to `.ics` as
  tentative.
- The version number is shown in Settings.

## 0.1.0 (2026-10-14)

First version.

- Day, Week, 2 Weeks and Month views. In the first three, events sit on a
  timeline and are as tall as they are long; overlapping events share the
  column. Visible hours are adjustable.
- Repeating events (daily, weekly on chosen days, weekdays, monthly by date or
  weekday, yearly, every N…), ending never, on a date or after N times.
- Edit or delete this event / this and following / all events, with Undo.
- Tasks panel for the dates on screen, plus overdue and undated tasks.
- Works offline. Optional Firebase sync with email sign-in.
- JSON backup and restore, `.ics` export, backup reminder.
- Light and dark mode, installable on iPhone and PC.
