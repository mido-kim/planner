import { icsFile } from '../js/backup.js';
import { addDays, diffDays, fmtTimeRange, weekday } from '../js/dates.js';
import { alignStart, describeRule, expand, occurrenceDates, toRRule } from '../js/recurrence.js';
import { deleteOps, saveOps } from '../js/series.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push([true, name]);
  } catch (err) {
    results.push([false, name, err.message]);
  }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  expected ${b}\n  got      ${a}`);
}

const ev = (over) => ({
  id: 'm', title: 'T', notes: '', color: 'blue', allDay: false,
  start: '2026-10-12T09:00', end: '2026-10-12T10:00', rrule: null, exdates: [], seriesId: null, originalDate: null,
  ...over,
});
const map = (...evs) => new Map(evs.map((e) => [e.id, e]));
const puts = (ops) => ops.filter((o) => o.op === 'put').map((o) => o.obj);
const removes = (ops) => ops.filter((o) => o.op === 'remove').map((o) => o.id);

// ---- dates
test('dates: add/diff across year end, weekday', () => {
  eq(addDays('2026-12-30', 3), '2027-01-02');
  eq(diffDays('2026-12-30', '2027-01-02'), 3);
  eq(weekday('2026-10-14'), 3);
});
test('dates: time ranges', () => {
  eq(fmtTimeRange(540, 630, false), '9 – 10:30 AM');
  eq(fmtTimeRange(660, 780, false), '11 AM – 1 PM');
  eq(fmtTimeRange(1380, 1440, false), '11 PM – 12 AM');
  eq(fmtTimeRange(540, 630, true), '09:00 – 10:30');
});

// ---- repeat rules
test('daily every 2 days, 3 times', () => {
  eq(occurrenceDates({ freq: 'daily', interval: 2, count: 3 }, '2026-10-14', '2027-01-01'), ['2026-10-14', '2026-10-16', '2026-10-18']);
});
test('weekly Mon+Wed until a date', () => {
  eq(occurrenceDates({ freq: 'weekly', interval: 1, byWeekday: [1, 3], until: '2026-10-21' }, '2026-10-12', '2027-01-01'),
    ['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
});
test('every 2 weeks on Tuesday, 3 times', () => {
  eq(occurrenceDates({ freq: 'weekly', interval: 2, byWeekday: [2], count: 3 }, '2026-10-13', '2027-01-01'), ['2026-10-13', '2026-10-27', '2026-11-10']);
});
test('monthly on the 31st skips short months', () => {
  eq(occurrenceDates({ freq: 'monthly', interval: 1, monthlyBy: 'day' }, '2026-01-31', '2026-08-01'),
    ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31']);
});
test('monthly on the second Tuesday', () => {
  eq(occurrenceDates({ freq: 'monthly', interval: 1, monthlyBy: 'nth', nth: 2, count: 3 }, '2026-10-13', '2027-06-01'), ['2026-10-13', '2026-11-10', '2026-12-08']);
});
test('monthly on the last Friday', () => {
  eq(occurrenceDates({ freq: 'monthly', interval: 1, monthlyBy: 'nth', nth: -1, count: 3 }, '2026-10-30', '2027-06-01'), ['2026-10-30', '2026-11-27', '2026-12-25']);
});
test('yearly on Feb 29 only in leap years', () => {
  eq(occurrenceDates({ freq: 'yearly', interval: 1 }, '2024-02-29', '2033-01-01'), ['2024-02-29', '2028-02-29', '2032-02-29']);
});
test('stop date cuts the list off', () => {
  eq(occurrenceDates({ freq: 'daily', interval: 1 }, '2026-10-14', '2026-10-17'), ['2026-10-14', '2026-10-15', '2026-10-16']);
});

// ---- expanding into a date range
test('expand: removed dates are skipped but still count', () => {
  const e = ev({ start: '2026-10-14T09:00', end: '2026-10-14T10:00', rrule: { freq: 'daily', interval: 1, count: 3 }, exdates: ['2026-10-15'] });
  eq(expand(e, '2026-10-01', '2026-11-01').map((o) => o.date), ['2026-10-14', '2026-10-16']);
});
test('expand: overnight event shows on the next day', () => {
  const e = ev({ start: '2026-10-14T22:00', end: '2026-10-15T02:00' });
  eq(expand(e, '2026-10-15', '2026-10-16').length, 1);
});
test('expand: event ending at midnight stays on its day', () => {
  const e = ev({ start: '2026-10-14T23:00', end: '2026-10-15T00:00' });
  eq(expand(e, '2026-10-15', '2026-10-16').length, 0);
  eq(expand(e, '2026-10-14', '2026-10-15').length, 1);
});
test('expand: occurrence times move with the date', () => {
  const e = ev({ rrule: { freq: 'weekly', interval: 1, byWeekday: [1] } });
  const [o] = expand(e, '2026-10-19', '2026-10-20');
  eq([o.start, o.end], ['2026-10-19T09:00', '2026-10-19T10:00']);
});
test('expand: multi-day all-day event', () => {
  const e = ev({ allDay: true, start: '2026-10-14', end: '2026-10-16' });
  eq(expand(e, '2026-10-16', '2026-10-17').length, 1);
  eq(expand(e, '2026-10-17', '2026-10-18').length, 0);
});
test('alignStart moves a weekly series to its first matching day', () => {
  const e = alignStart(ev({ start: '2026-10-13T09:00', end: '2026-10-13T10:00', rrule: { freq: 'weekly', interval: 1, byWeekday: [1, 3] } }));
  eq([e.start, e.end], ['2026-10-14T09:00', '2026-10-14T10:00']);
});

// ---- deleting
const weekly = ev({ rrule: { freq: 'weekly', interval: 1, byWeekday: [1], until: null, count: null } });

test('delete this event: adds a removed date', () => {
  const ops = deleteOps(map(weekly), weekly, '2026-10-19', 'this');
  eq(puts(ops)[0].exdates, ['2026-10-19']);
});
test('delete this and following: series ends the day before', () => {
  const ops = deleteOps(map(weekly), weekly, '2026-10-26', 'following');
  eq(puts(ops)[0].rrule.until, '2026-10-25');
  eq(expand(puts(ops)[0], '2026-10-01', '2026-12-01').map((o) => o.date), ['2026-10-12', '2026-10-19']);
});
test('delete this and following from the first one deletes everything', () => {
  const d = ev({ id: 'd', seriesId: 'm', originalDate: '2026-10-19', start: '2026-10-19T11:00', end: '2026-10-19T12:00' });
  const ops = deleteOps(map(weekly, d), weekly, '2026-10-12', 'following');
  eq(removes(ops).sort(), ['d', 'm']);
});
test('delete all: removes the series and its changed occurrences', () => {
  const d = ev({ id: 'd', seriesId: 'm', originalDate: '2026-10-19' });
  eq(removes(deleteOps(map(weekly, d), d, '2026-10-19', 'all')).sort(), ['d', 'm']);
});
test('delete a changed occurrence with "this event"', () => {
  const m = { ...weekly, exdates: ['2026-10-19'] };
  const d = ev({ id: 'd', seriesId: 'm', originalDate: '2026-10-19' });
  eq(deleteOps(map(m, d), d, '2026-10-19', 'this'), [{ op: 'remove', coll: 'events', id: 'd' }]);
});

// ---- editing
const form = (over) => ({ title: 'T', notes: '', color: 'blue', allDay: false, start: '2026-10-19T09:00', end: '2026-10-19T10:00', rrule: weekly.rrule, ...over });

test('edit this event: series skips it, a separate event replaces it', () => {
  const ops = saveOps(map(weekly), weekly, '2026-10-19', form({ title: 'Moved', start: '2026-10-19T14:00', end: '2026-10-19T15:00' }), 'this');
  const [master, detached] = puts(ops);
  eq(master.exdates, ['2026-10-19']);
  eq([detached.title, detached.start, detached.seriesId, detached.originalDate, detached.rrule], ['Moved', '2026-10-19T14:00', 'm', '2026-10-19', null]);
});
test('edit all events: moving one occurrence a day later moves the series', () => {
  const rule = { freq: 'weekly', interval: 1, byWeekday: [2], until: null, count: null };
  const ops = saveOps(map(weekly), weekly, '2026-10-19', form({ start: '2026-10-20T09:00', end: '2026-10-20T10:00', rrule: rule }), 'all');
  const [m] = puts(ops);
  eq([m.start, m.rrule.byWeekday], ['2026-10-13T09:00', [2]]);
});
test('edit this and following: splits the series and keeps the count right', () => {
  const daily = ev({ start: '2026-10-01T09:00', end: '2026-10-01T10:00', rrule: { freq: 'daily', interval: 1, until: null, count: 10 } });
  const ops = saveOps(map(daily), daily, '2026-10-05', form({ title: 'New', start: '2026-10-05T08:00', end: '2026-10-05T09:00', rrule: daily.rrule }), 'following');
  const [old, next] = puts(ops);
  eq([old.rrule.until, old.rrule.count], ['2026-10-04', null]);
  eq([next.title, next.start, next.rrule.count], ['New', '2026-10-05T08:00', 6]);
  const all = [...expand(old, '2026-09-01', '2027-01-01'), ...expand(next, '2026-09-01', '2027-01-01')];
  eq(all.length, 10);
});
test('edit this and following: changed occurrences move to the new series', () => {
  const d = ev({ id: 'd', seriesId: 'm', originalDate: '2026-11-02' });
  const ops = saveOps(map({ ...weekly, exdates: ['2026-11-02'] }, d), weekly, '2026-10-19', form({ title: 'X' }), 'following');
  const moved = puts(ops).find((o) => o.id === 'd');
  const next = puts(ops).find((o) => o.id !== 'm' && o.id !== 'd');
  eq(moved.seriesId, next.id);
});
test('edit a changed occurrence with "all events" folds it back in', () => {
  const m = { ...weekly, exdates: ['2026-10-19'] };
  const d = ev({ id: 'd', seriesId: 'm', originalDate: '2026-10-19', start: '2026-10-19T14:00', end: '2026-10-19T15:00' });
  const ops = saveOps(map(m, d), d, '2026-10-19', form({ title: 'Renamed', start: '2026-10-19T09:00', end: '2026-10-19T10:00' }), 'all');
  eq(removes(ops), ['d']);
  const master = puts(ops).find((o) => o.id === 'm');
  eq([master.title, master.exdates], ['Renamed', []]);
});
test('a new weekly event starts on its first matching day', () => {
  const ops = saveOps(new Map(), null, null, form({ start: '2026-10-13T09:00', end: '2026-10-13T10:00', rrule: { freq: 'weekly', interval: 1, byWeekday: [4] } }), null);
  eq(puts(ops)[0].start, '2026-10-15T09:00');
});

// ---- text and export
test('describe rules', () => {
  eq(describeRule({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }, '2026-10-14'), 'Every weekday (Mon–Fri)');
  eq(describeRule({ freq: 'weekly', interval: 2, byWeekday: [1, 3], count: 5 }, '2026-10-12'), 'Every 2 weeks on Mon, Wed, 5 times');
  eq(describeRule({ freq: 'monthly', interval: 1, monthlyBy: 'nth', nth: -1 }, '2026-10-30'), 'Monthly on the last Friday');
  eq(describeRule({ freq: 'yearly', interval: 1, until: '2030-10-14' }, '2026-10-14'), 'Annually on October 14, until Oct 14, 2030');
});
test('RRULE text for export', () => {
  eq(toRRule({ freq: 'weekly', interval: 2, byWeekday: [3, 1], until: '2026-12-31' }, '2026-10-12T09:00', false), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU;UNTIL=20261231T235959');
  eq(toRRule({ freq: 'monthly', interval: 1, monthlyBy: 'nth', nth: 2, count: 4 }, '2026-10-13', true), 'FREQ=MONTHLY;BYDAY=2TU;COUNT=4');
});
test('.ics export: series, removed date, changed occurrence', () => {
  const m = { ...weekly, exdates: ['2026-10-19', '2026-10-26'], title: 'Lab meeting, weekly' };
  const d = ev({ id: 'd', seriesId: 'm', originalDate: '2026-10-26', start: '2026-10-27T09:00', end: '2026-10-27T10:00' });
  const ics = icsFile(map(m, d));
  for (const line of ['RRULE:FREQ=WEEKLY;BYDAY=MO;WKST=SU', 'EXDATE:20261019T090000', 'RECURRENCE-ID:20261026T090000', 'SUMMARY:Lab meeting\\, weekly']) {
    if (!ics.includes(line)) throw new Error(`missing ${line}`);
  }
  if (ics.includes('EXDATE:20261026')) throw new Error('changed occurrence should not also be an EXDATE');
});
test('.ics export marks tentative events', () => {
  if (!icsFile(map(ev({ tentative: true }))).includes('STATUS:TENTATIVE')) throw new Error('missing STATUS:TENTATIVE');
  if (icsFile(map(ev())).includes('STATUS:')) throw new Error('confirmed event should have no STATUS');
});

// ---- report
const failed = results.filter((r) => !r[0]);
document.title = failed.length ? `FAIL ${failed.length}/${results.length}` : `PASS ${results.length}/${results.length}`;
document.getElementById('out').textContent = [
  `${results.length - failed.length} passed, ${failed.length} failed`,
  '',
  ...results.map(([ok, name, msg]) => `${ok ? 'ok  ' : 'FAIL'} ${name}${msg ? `\n${msg}` : ''}`),
].join('\n');
