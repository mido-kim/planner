# Changelog

Each version lists what changed for you as a user. The version number also
appears at the bottom of Settings.

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
