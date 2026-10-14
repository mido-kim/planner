import { readJSON, writeJSON } from './util.js';

// Display settings are kept per device, so the phone and the PC can differ.
const KEY = 'planner.settings.v1';

export const DEFAULTS = {
  dayStart: 7, // first hour shown in day and week views
  dayEnd: 24, // last hour shown (24 = midnight)
  weekStart: 0, // 0 = Sunday, 1 = Monday
  h24: false,
  hourHeight: 30, // pixels per hour
  view: 'week',
};

export const HOUR_HEIGHTS = [30, 40, 52, 68];

export function loadSettings() {
  const saved = readJSON(KEY, {});
  // Before 0.3.0 the default hour height was 52, and it was saved along with
  // any other setting, so devices still on it move to the new default.
  if (!saved.rev) {
    if (saved.hourHeight === 52) delete saved.hourHeight;
    saved.rev = 2;
  }
  return { ...DEFAULTS, ...saved };
}
export const saveSettings = (s) => writeJSON(KEY, s);
