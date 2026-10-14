import { addDays, dateOf, daysInMonth, diffDays, fmt, parts, shiftDays, weekday, ymd } from './dates.js';

// A repeat rule looks like:
//   { freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
//     interval: 1,               // every N days / weeks / months / years
//     byWeekday: [1, 3],         // weekly only; 0 = Sunday
//     monthlyBy: 'day' | 'nth',  // monthly only
//     nth: 2,                    // with monthlyBy 'nth': 1-4, or -1 for "last"
//     until: 'YYYY-MM-DD' | null,
//     count: number | null }
// The weekday, day of month and month all come from the series' start date.

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };

const MAX_STEPS = 50000;

export const nthOf = (date) => Math.ceil(parts(date).d / 7);

export function inLastWeekOfMonth(date) {
  const { y, m, d } = parts(date);
  return d + 7 > daysInMonth(y, m);
}

export function nthWeekdayOfMonth(y, m, wd, nth) {
  const dim = daysInMonth(y, m);
  if (nth === -1) {
    const last = ymd(y, m, dim);
    return addDays(last, -((weekday(last) - wd + 7) % 7));
  }
  const day = 1 + ((wd - weekday(ymd(y, m, 1)) + 7) % 7) + (nth - 1) * 7;
  return day <= dim ? ymd(y, m, day) : null;
}

// Every occurrence date of a series starting on `start`, in order, before
// `stop` (exclusive). Dates in `exdates` are still returned and still count
// toward `count`, as in the iCalendar standard.
export function occurrenceDates(rule, start, stop) {
  const out = [];
  const interval = Math.max(1, Math.floor(rule.interval) || 1);
  const afterUntil = rule.until ? addDays(rule.until, 1) : null;
  const end = afterUntil && afterUntil < stop ? afterUntil : stop;
  const count = rule.count > 0 ? rule.count : Infinity;
  // Returns false once the series is over.
  const take = (d) => {
    if (d < start) return true;
    if (d >= end || out.length >= count) return false;
    out.push(d);
    return true;
  };
  const { y, m, d: dayOfMonth } = parts(start);
  const wd = weekday(start);

  switch (rule.freq) {
    case 'daily':
      for (let d = start, i = 0; i < MAX_STEPS && take(d); i++) d = addDays(d, interval);
      break;
    case 'weekly': {
      const days = [...new Set(rule.byWeekday?.length ? rule.byWeekday : [wd])].sort((a, b) => a - b);
      let week = addDays(start, -wd);
      outer: for (let i = 0; i < MAX_STEPS; i++, week = addDays(week, 7 * interval)) {
        for (const day of days) if (!take(addDays(week, day))) break outer;
      }
      break;
    }
    case 'monthly':
    case 'yearly': {
      const step = rule.freq === 'monthly' ? interval : 12 * interval;
      const byNth = rule.freq === 'monthly' && rule.monthlyBy === 'nth';
      for (let i = 0; i < MAX_STEPS; i++) {
        const mi = m - 1 + i * step;
        const yy = y + Math.floor(mi / 12);
        const mm = (mi % 12) + 1;
        if (ymd(yy, mm, 1) >= end) break;
        // Months without the day (the 31st, Feb 29) are skipped.
        const d = byNth
          ? nthWeekdayOfMonth(yy, mm, wd, rule.nth || nthOf(start))
          : dayOfMonth <= daysInMonth(yy, mm) ? ymd(yy, mm, dayOfMonth) : null;
        if (d && !take(d)) break;
      }
      break;
    }
  }
  return out;
}

// How many days after its start date an event still shows up.
export function spanDays(ev) {
  if (ev.allDay) return Math.max(0, diffDays(ev.start, ev.end));
  const days = diffDays(dateOf(ev.start), dateOf(ev.end));
  return ev.end.endsWith('T00:00') && days > 0 ? days - 1 : days;
}

// The occurrences of `ev` that show up on any day in [from, to).
export function expand(ev, from, to) {
  const startDate = dateOf(ev.start);
  const span = spanDays(ev);
  const make = (date) => {
    const k = diffDays(startDate, date);
    return { ev, date, start: shiftDays(ev.start, k), end: shiftDays(ev.end, k) };
  };
  if (!ev.rrule) return startDate < to && addDays(startDate, span) >= from ? [make(startDate)] : [];
  const skip = new Set(ev.exdates || []);
  const first = addDays(from, -span);
  return occurrenceDates(ev.rrule, startDate, to)
    .filter((d) => d >= first && !skip.has(d))
    .map(make);
}

// Moves a weekly series' start forward to its first matching weekday, so the
// start date is always an occurrence.
export function alignStart(ev) {
  const rule = ev.rrule;
  if (!rule || rule.freq !== 'weekly' || !rule.byWeekday?.length) return ev;
  const wd = weekday(dateOf(ev.start));
  if (rule.byWeekday.includes(wd)) return ev;
  const k = Math.min(...rule.byWeekday.map((d) => (d - wd + 7) % 7));
  return { ...ev, start: shiftDays(ev.start, k), end: shiftDays(ev.end, k) };
}

// The parts of a rule that matter, for comparing two rules.
export function ruleKey(rule) {
  if (!rule) return 'none';
  const r = { f: rule.freq, i: Math.max(1, rule.interval || 1), u: rule.until || null, c: rule.count || null };
  if (rule.freq === 'weekly') r.w = [...(rule.byWeekday || [])].sort().join();
  if (rule.freq === 'monthly') r.m = rule.monthlyBy === 'nth' ? `nth${rule.nth}` : 'day';
  return JSON.stringify(r);
}

export function describeRule(rule, start) {
  if (!rule) return 'Does not repeat';
  const date = dateOf(start);
  const n = Math.max(1, rule.interval || 1);
  const every = (unit, one) => (n === 1 ? one : `Every ${n} ${unit}`);
  let s = '';
  switch (rule.freq) {
    case 'daily':
      s = every('days', 'Daily');
      break;
    case 'weekly': {
      const days = [...new Set(rule.byWeekday?.length ? rule.byWeekday : [weekday(date)])].sort((a, b) => a - b);
      if (n === 1 && days.join() === '1,2,3,4,5') s = 'Every weekday (Mon–Fri)';
      else s = `${every('weeks', 'Weekly')} on ${days.length === 1 ? WEEKDAYS[days[0]] : days.map((d) => WEEKDAYS_SHORT[d]).join(', ')}`;
      break;
    }
    case 'monthly':
      s = every('months', 'Monthly') +
        (rule.monthlyBy === 'nth'
          ? ` on the ${ORDINALS[rule.nth || nthOf(date)]} ${WEEKDAYS[weekday(date)]}`
          : ` on day ${parts(date).d}`);
      break;
    case 'yearly':
      s = `${every('years', 'Annually')} on ${fmt(date, { month: 'long', day: 'numeric' })}`;
      break;
  }
  if (rule.until) s += `, until ${fmt(rule.until, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  else if (rule.count) s += `, ${rule.count} time${rule.count === 1 ? '' : 's'}`;
  return s;
}

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// The rule as an iCalendar RRULE value, for .ics export.
export function toRRule(rule, start, allDay) {
  const date = dateOf(start);
  const wd = weekday(date);
  const p = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) p.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly') {
    const days = [...new Set(rule.byWeekday?.length ? rule.byWeekday : [wd])].sort((a, b) => a - b);
    p.push(`BYDAY=${days.map((d) => ICS_DAYS[d]).join(',')}`, 'WKST=SU');
  }
  if (rule.freq === 'monthly') {
    p.push(rule.monthlyBy === 'nth' ? `BYDAY=${rule.nth || nthOf(date)}${ICS_DAYS[wd]}` : `BYMONTHDAY=${parts(date).d}`);
  }
  if (rule.until) p.push(`UNTIL=${rule.until.replaceAll('-', '')}${allDay ? '' : 'T235959'}`);
  else if (rule.count) p.push(`COUNT=${rule.count}`);
  return p.join(';');
}
