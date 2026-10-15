# Changelog

Each version lists what changed for you as a user. The version number also
appears at the bottom of Settings.

## 0.5.5 (2026-10-15)

- Tasks and deadlines have no background any more, on the calendar and in the
  agenda: just the round tick box or flag, and the name in its color. Event
  cards in the agenda keep their pastel.
- Deadline names may run on over the next day too. A task or deadline name
  only does so when that spot is free on the next day; otherwise it wraps onto
  more lines in its own day (in the month view it's cut and faded).
- Tasks and deadlines without a time now sit around midnight (11:59 PM –
  12 AM) instead of at the very end of the day (2 AM). One that would land on
  another task or deadline moves a little up or down so their names don't
  overlap.
- Korean names break between words, not in the middle of one.

## 0.5.4 (2026-10-15)

- Smoother swipes: the calendar follows your finger, and when you let go past
  about a quarter of the way (or flick) it glides out while the next dates
  glide in; a short drag springs back. With Reduce Motion on (iPhone Settings →
  Accessibility → Motion) the dates fade instead of sliding.
- Tasks on the calendar: a small round tick box instead of a square, no
  outline, and the title in the task's color. The agenda uses the same round
  tick box.
- In the week, 2-week and month views, a task's title may run on over the
  next day instead of being cut at its own day's edge.

## 0.5.3 (2026-10-15)

- The Day and Week views now fit the whole day on the screen, so the timeline
  no longer scrolls up and down (and a sideways swipe can't nudge it). How tall
  an hour is follows the space there is; on a squeezed day only every other
  hour is labelled. To give each hour more room, show fewer hours (Settings →
  Day starts at / Day ends at). The Hour height setting is gone.

## 0.5.2 (2026-10-15)

- Swipe to move through dates on a phone: left or right in the Day and Week
  views for the next or previous day or week; up or down in the 2-week and
  Month views to move a week later or earlier. The month's name follows the
  month that fills most of the screen, and the arrows still go a month at a
  time. New dates slide in from the side they came from.

## 0.5.1 (2026-10-15)

- New font: Instrument Serif for the app itself (the dates at the top, view
  buttons, day numbers, hours, times, headings and buttons). Names of events,
  deadlines and tasks stay in Arial for now. Korean text keeps its usual font.

## 0.5.0 (2026-10-15)

- Working hours (10 AM – 9 PM, Monday to Friday) are very lightly shaded on
  the timelines, except on Korean public holidays. Change the hours or turn
  the shading off in Settings.
- Korean public holidays from 2026 to 2031 are built in, with substitute
  holidays, 노동절, 제헌절 and election days. Their dates show in red, with the
  holiday's name when you point at them.
- The day now runs until 2 AM the next morning (Settings → Day ends at). Things
  after midnight show at the bottom of the evening before.
- Deadlines and tasks can lose their time: tap the × next to the time. A
  deadline without a time is due any time that day and shows at the day's end.
- Text that doesn't fit is cut off and fades out toward the end, instead of
  ending in "…".
- Drag events, deadlines and tasks to another time or day (on a phone, hold
  one for a moment first). Repeating events ask whether to move just that one,
  the following ones or all. Undo is offered after each move.

## 0.4.0 (2026-10-14)

- New "Gelato Days" colors: soft pastel pink, green, yellow, blue, purple and
  peach (plus matching mint, coral and stone) for events, labels and the app
  itself, with pink as the main color. Your items keep their colors, in the new
  shades.
- The task list is now the Agenda: every event, deadline and task in the
  dates on screen with its full details (time, label, how it repeats,
  tentative, notes), plus overdue tasks and tasks with no date.
- On a PC the agenda can sit at the right or at the bottom (button in its
  header), can be resized by dragging its edge (double-click to reset), and
  hidden with × or the agenda button at the top.
- On a phone, the Day, Week and 2-week views show the calendar in the top half
  and the agenda in the bottom half. Drag the bar between them to change the
  split; the agenda button hides it. Month keeps the whole screen, with the
  agenda as a sheet.
- The 2-week view shows two short timelines (one per week), so items sit at
  their times and both weeks fit on screen. Click or drag on them to create.

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
