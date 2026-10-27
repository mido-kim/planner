import { readJSON, writeJSON } from './util.js';

// Display settings are kept per device, so the phone and the PC can differ.
const KEY = 'planner.settings.v1';

export const DEFAULTS = {
  dayStart: 7, // first hour shown in day and week views
  dayEnd: 26, // last hour shown; past 24 runs into the next morning (26 = 2 AM)
  weekStart: 0, // 0 = Sunday, 1 = Monday
  h24: false,
  hourHeight: 30, // pixels per hour, only when the day can't fit the screen
  view: 'week',
  // Working hours, shaded on weekdays that aren't public holidays: any number
  // of stretches, each [from, to] in hours.
  showWork: true,
  workRanges: [[10, 12], [13, 18], [19, 21]],
  // The agenda panel. On a PC it sits at the right or the bottom, and can be
  // hidden; on a phone it fills the bottom part of the screen (except in the
  // month view, where it comes up as a sheet).
  panelDock: 'right', // 'right' | 'bottom'
  panelW: 320, // width at the right, in pixels
  panelH: 0.4, // height at the bottom on a PC, as a share of the space
  splitH: 0.5, // height at the bottom on a phone
  hideTasks: false, // hidden on a PC
  hideSplit: false, // hidden on a phone
  // 'system' (light or dark, as the device is set), 'light', 'dark', 'custom'
  // (made here and not saved: customTheme) or the id of a saved theme.
  theme: 'system',
  motion: 'slide', // moving to other dates: 'slide' (glides and settles) or 'fade'
  stickerSize: 'm', // stickers from the tray are stuck at 's', 'm' or 'l'
  stickerSet: 'mine', // the tray's category
  // Notes written on the calendar (day, week and 2 weeks), by kind.
  notesEvents: true,
  notesTasks: false,
  notesDeadlines: false,
  customTheme: null, // { base, vars }
  themeCache: null, // { base, vars, css } of a made theme, for theme-boot.js
};

export function loadSettings() {
  const saved = readJSON(KEY, {});
  // Before 0.3.0 the default hour height was 52, and it was saved along with
  // any other setting, so devices still on it move to the new default.
  if (!saved.rev) {
    if (saved.hourHeight === 52) delete saved.hourHeight;
    saved.rev = 2;
  }
  // 0.5.0: the day runs to 2 AM unless it was set to end earlier.
  if (saved.rev < 3) {
    if (saved.dayEnd === 24) delete saved.dayEnd;
    saved.rev = 3;
  }
  // 0.8.0: working hours became a list of stretches (one start and end
  // before), and every device starts on the new default.
  if (saved.rev < 4) {
    delete saved.workStart;
    delete saved.workEnd;
    saved.rev = 4;
  }
  return { ...DEFAULTS, ...saved };
}

// Working hours in order, with stretches that overlap or meet joined.
export function workSpans(ranges) {
  const out = [];
  for (const [a, b] of (ranges || []).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
export const saveSettings = (s) => writeJSON(KEY, s);
