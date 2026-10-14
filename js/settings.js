import { readJSON, writeJSON } from './util.js';

// Display settings are kept per device, so the phone and the PC can differ.
const KEY = 'planner.settings.v1';

export const DEFAULTS = {
  dayStart: 7, // first hour shown in day and week views
  dayEnd: 24, // last hour shown (24 = midnight)
  weekStart: 0, // 0 = Sunday, 1 = Monday
  h24: false,
  hourHeight: 52, // pixels per hour
  view: 'week',
};

export const loadSettings = () => ({ ...DEFAULTS, ...readJSON(KEY, {}) });
export const saveSettings = (s) => writeJSON(KEY, s);
