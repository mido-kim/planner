// Wall-clock date helpers. A date is a 'YYYY-MM-DD' string, a date-time is
// 'YYYY-MM-DDTHH:mm', and a time of day is minutes after midnight. Events are
// stored without a time zone, so 9:00 stays 9:00 wherever you are. All
// arithmetic goes through UTC so daylight-saving changes can't shift a day.

const DAY_MS = 86400000;

export const pad = (n) => String(n).padStart(2, '0');

const toMs = (date) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

function fromMs(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// m is 1-12; out-of-range days and months roll over like Date does.
export const ymd = (y, m, d) => fromMs(Date.UTC(y, m - 1, d));
export const parts = (date) => ({ y: +date.slice(0, 4), m: +date.slice(5, 7), d: +date.slice(8, 10) });
export const addDays = (date, n) => fromMs(toMs(date) + n * DAY_MS);
export const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS); // b - a
export const weekday = (date) => new Date(toMs(date)).getUTCDay(); // 0 = Sunday
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const startOfWeek = (date, weekStart = 0) => addDays(date, -((weekday(date) - weekStart + 7) % 7));
export const startOfMonth = (date) => date.slice(0, 8) + '01';

export function addMonths(date, n) {
  const { y, m, d } = parts(date);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const yy = first.getUTCFullYear();
  const mm = first.getUTCMonth() + 1;
  return ymd(yy, mm, Math.min(d, daysInMonth(yy, mm)));
}

export function daysFrom(date, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(addDays(date, i));
  return out;
}

export function today() {
  const n = new Date();
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function nowMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

export const dateOf = (dt) => dt.slice(0, 10);
export const minOf = (dt) => (dt.length > 10 ? +dt.slice(11, 13) * 60 + +dt.slice(14, 16) : 0);

// Minutes since 1970-01-01T00:00, for comparing and measuring date-times.
export const absMin = (dt) => toMs(dateOf(dt)) / 60000 + minOf(dt);

export function fromAbsMin(abs) {
  const day = Math.floor(abs / 1440);
  const min = abs - day * 1440;
  return `${fromMs(day * DAY_MS)}T${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

// A date-time `min` minutes after midnight of `date` (may roll into later days).
export const dt = (date, min) => fromAbsMin(toMs(date) / 60000 + min);

// Moves a date or date-time by whole days, keeping the time of day.
export const shiftDays = (value, n) => (value.length > 10 ? addDays(value.slice(0, 10), n) + value.slice(10) : addDays(value, n));

export const timeValue = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; // for <input type=time>
export const parseTime = (s) => (s ? +s.slice(0, 2) * 60 + +s.slice(3, 5) : 0);

const formatters = new Map();
export function fmt(date, opts) {
  const key = JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })));
  return f.format(new Date(toMs(date)));
}

// 9:30 AM / 9 AM, or 09:30 with the 24-hour clock. `bare` drops AM/PM.
export function fmtTime(min, h24, bare = false) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h24) return `${pad(h)}:${pad(m)}`;
  const t = `${h % 12 || 12}${m ? ':' + pad(m) : ''}`;
  return bare ? t : `${t} ${h < 12 ? 'AM' : 'PM'}`;
}

// 9 – 10:30 AM, 11 AM – 1 PM, or 09:00 – 10:30.
export function fmtTimeRange(a, b, h24) {
  if (h24) return `${fmtTime(a, true)} – ${fmtTime(b, true)}`;
  const sameHalf = Math.floor((a % 1440) / 720) === Math.floor((b % 1440) / 720) && b - a < 720;
  return `${fmtTime(a, false, sameHalf)} – ${fmtTime(b, false)}`;
}
