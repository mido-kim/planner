# Planner

A personal calendar and task planner that runs in the browser and installs like
an app on a PC (Chrome) and an iPhone (Safari).

- **Day, Week, 2 Weeks and Month views.** In Day and Week, events sit on a
  timeline at their start time and are as tall as they are long. Overlapping
  events share the column. 2 Weeks shows two short timelines, one per week.
  Month is a grid of days.
- **Events, deadlines and tasks.** Click or drag on the calendar (on a phone:
  tap, or hold and drag) and pick what to make, or use the three buttons at the
  top. A deadline is a single moment, drawn as a line across its day.
- **All-day and multi-day events** stretch across their days as a block, a line
  with arrowheads, or a plain line.
- **Labels** (e.g. Research, Teaching) color their events, deadlines and tasks.
  Retire a label to hide it, or delete it together with its items.
- **Repeating events:** daily, weekly (any weekdays), every weekday, monthly
  (by date, or "second Tuesday" / "last Friday"), yearly, every N days, weeks,
  months or years. A repeat can end never, on a date, or after N times.
- **Edit or delete** one occurrence, this and following, or all events, with
  Undo after deleting.
- **Agenda** with the full details of every event, deadline and task in the
  dates on screen, plus overdue tasks and tasks with no date. On a PC it sits
  at the right or the bottom (drag its edge to resize, or hide it); on a phone
  it fills the lower half of the screen. Tasks with a date also show on the
  calendar, with a tick box.
- **Gelato colors:** soft pastel colors throughout, in light and dark mode.
- **Drag to move** events, deadlines and tasks to another time or day.
- **Swipe** sideways through days and weeks, and up or down through the 2-week
  and month views a week at a time.
- **Korean public holidays** (2026–2031) built in; working hours are lightly
  shaded on the other weekdays.
- **Works offline.** Optional sync between devices through Firebase.
- **Your data stays portable:** JSON backups that restore into this app, and
  `.ics` export that opens in Google Calendar, Apple Calendar and Outlook.

It's plain HTML, CSS and JavaScript with no build step and nothing to install.
Any static web host can serve it.

## Try it on this PC

From this folder:

```
python -m http.server 5173
```

Then open http://localhost:5173. Without sync turned on, everything is saved in
that browser only.

Logic tests (repeat rules, edit/delete options, labels, export) live at
http://localhost:5173/tests/.

## Use a different font

The app uses Instrument Serif for English letters and numbers and 느좋체 for
Korean letters, everywhere, item names included (both in `fonts/`;
`--font-ui` and `--font-item` in `css/app.css`). To use another font you
downloaded:

1. Check its license allows use on a website ("web font" or OFL; most free
   Korean fonts such as Pretendard and Nanum do).
2. Get it as `.woff2` files if you can (much smaller than `.ttf`/`.otf`).
   Korean fonts are large, so one regular and one bold weight is plenty.
3. Put the files in a `fonts` folder here, and ask Claude to switch the app to
   them. It adds them to `css/app.css` (`@font-face`) and to `sw.js` so they
   work offline. Fonts that are on a font CDN (like Pretendard) need no files:
   just give Claude the font's name.
4. For Figma, install the font on your PC (double-click the file, Install).

## Turn on sync (Firebase, free)

1. Go to https://console.firebase.google.com and create a project (Google
   Analytics isn't needed).
2. **Authentication** → Get started → Sign-in method → **Email/Password** →
   Enable.
3. **Firestore Database** → Create database. Pick a location near you (e.g.
   `asia-northeast3`, Seoul) and start in production mode.
4. In Firestore, open the **Rules** tab, replace everything with the contents
   of [firestore.rules](firestore.rules), and Publish. This lets each account
   reach only its own data.
5. **Project settings** (gear icon) → Your apps → Web (`</>`) → register an
   app. Copy the `firebaseConfig` values it shows into
   [js/config.js](js/config.js), replacing `null`.
6. Open the app and use **Create account**, once. After that, sign in with the
   same email and password on every device.
7. Optional: in Authentication → Settings, if your console offers it, turn off
   "Enable create (sign-up)" so nobody else can make an account in your app.

The config values in `js/config.js` aren't secret: they only name your project.
Your data is protected by your password and the rules from step 4.

The first time you sign in on a device that already has local events, the app
offers to copy them into your account.

## Put it online (GitHub Pages, free)

1. Create a repository on GitHub (e.g. `planner`).
2. From this folder:
   ```
   git init
   git add .
   git commit -m "Planner"
   git branch -M main
   git remote add origin https://github.com/<you>/planner.git
   git push -u origin main
   ```
3. On GitHub: Settings → Pages → Source: "Deploy from a branch" → `main`, root
   folder. The app appears at `https://<you>.github.io/planner/`.
4. If you turned on sync, add `<you>.github.io` in Firebase → Authentication →
   Settings → Authorized domains.

To update the app later, change the files and `git push`. Devices pick up the
new version the next time the app is opened online.

Netlify or Cloudflare Pages work too: drag this folder onto their upload page.

## Install it

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. Always
  open it from that icon. A home-screen app keeps its data reliably, while
  Safari may clear data for websites you haven't visited in a while.
- **PC (Chrome):** open the site → install icon at the right end of the
  address bar (or menu → Cast, save and share → Install).

## Backups

Settings → Backup:

- **Download backup (.json)** saves every event and task. **Restore from a
  backup** loads one back in. Items in the backup replace their current
  versions, and anything added since stays.
- **Export events for other calendars (.ics)** gives a file other calendar
  apps can import, repeat rules included. Tasks aren't part of `.ics`, so keep
  JSON backups too.

If there's been no backup from a device for 30 days, the app shows a reminder.

## How it's put together

| File | What it does |
|---|---|
| `index.html`, `css/app.css` | Page and styles (light and dark) |
| `js/main.js` | App startup, layout, navigation and input |
| `js/views/timegrid.js` | Day / week timeline and the 2-week view |
| `js/views/month.js` | Month grid |
| `js/views/agenda.js` | Agenda (events, deadlines and tasks with details) |
| `js/holidays.js` | Korean public holidays, 2026–2031 |
| `js/dialogs.js` | Event, task, repeat-scope and settings dialogs |
| `js/recurrence.js` | Repeat rules: occurrence dates, descriptions, iCalendar RRULE |
| `js/series.js` | "This / this and following / all" edits and deletes |
| `js/store.js` | Local storage, and the interface any storage must provide |
| `js/cloud.js` | Firebase sign-in and sync |
| `js/backup.js` | JSON backup, `.ics` export, file saving |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and app install |

All database access goes through `js/store.js` and `js/cloud.js`. Moving to a
different service means writing one file with the same two functions,
`subscribe` and `apply`.

Events are stored as plain JSON. Times have no time zone, so 9:00 stays 9:00
wherever you are. A repeating event is one record with a rule. Deleted
occurrences are listed in `exdates`, and changed occurrences are separate
records that point back to the series.
