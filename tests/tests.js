import { backupFile, icsFile, parseBackup } from '../js/backup.js';
import { addDays, diffDays, fmtTimeRange, weekday } from '../js/dates.js';
import { activeLabels, colorOf, deleteLabelOps, labelUsage, retiredLabels, setLabelStatusOps } from '../js/labels.js';
import { alignStart, describeRule, expand, occurrenceDates, toRRule } from '../js/recurrence.js';
import { deleteOps, moveOps, saveOps } from '../js/series.js';
import { HOLIDAYS } from '../js/holidays.js';
import { agendaGroups } from '../js/views/agenda.js';
import { layoutBars } from '../js/views/bars.js';
import { dayEndAt, isBarEvent, placeAt, renderTimeGrid, slotOf, taskPlace } from '../js/views/timegrid.js';
import { baseOf, cssVars, hexToHsl, hslToHex, toHex } from '../js/themes.js';

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

// ---- deadlines
const deadline = ev({ id: 'dl', kind: 'deadline', start: '2026-10-14T17:00', end: '2026-10-14T17:00' });
test('deadline: one occurrence on its day, none the next', () => {
  eq(expand(deadline, '2026-10-14', '2026-10-15').length, 1);
  eq(expand(deadline, '2026-10-15', '2026-10-16').length, 0);
});
test('deadline: placed at its time on the timeline, or outside the hours shown', () => {
  // 7 AM to midnight at 30 px an hour.
  eq(placeAt(17 * 60, 7 * 60, 24 * 60, 0.5), { where: 'grid', top: 300 });
  eq(placeAt(6 * 60, 7 * 60, 24 * 60, 0.5), { where: 'early' });
  eq(placeAt(23 * 60 + 30, 7 * 60, 22 * 60, 0.5), { where: 'late' });
  eq(placeAt(23 * 60 + 59, 7 * 60, 24 * 60, 0.5).where, 'grid');
});
test('deadline: never a bar, even when repeating', () => {
  const [o] = expand({ ...deadline, rrule: { freq: 'weekly', interval: 1, byWeekday: [3] } }, '2026-10-21', '2026-10-22');
  eq([o.start, isBarEvent(o)], ['2026-10-21T17:00', false]);
});
test('.ics export: a deadline has a start and no end', () => {
  const ics = icsFile(map(deadline));
  if (!ics.includes('DTSTART:20261014T170000')) throw new Error('missing DTSTART');
  if (ics.includes('DTEND')) throw new Error('a deadline should have no DTEND');
});

// ---- tasks on the timeline
test('tasks: a timed task sits at its time, a date-only task at the bottom', () => {
  eq(taskPlace({ due: '2026-10-14', dueTime: '09:30' }, 7 * 60, 24 * 60, 0.5), { where: 'grid', top: 75 });
  eq(taskPlace({ due: '2026-10-14', dueTime: null }, 7 * 60, 24 * 60, 0.5), { where: 'bottom' });
  eq(taskPlace({ due: '2026-10-14', dueTime: '06:00' }, 7 * 60, 24 * 60, 0.5), { where: 'early' });
});

// ---- multi-day bars
test('bars: all-day and 24-hour events are bars; shorter overnight ones are not', () => {
  const [a] = expand(ev({ allDay: true, start: '2026-10-14', end: '2026-10-14' }), '2026-10-14', '2026-10-15');
  const [b] = expand(ev({ start: '2026-10-14T09:00', end: '2026-10-15T09:00' }), '2026-10-14', '2026-10-15');
  const [c] = expand(ev({ start: '2026-10-14T22:00', end: '2026-10-15T01:30' }), '2026-10-14', '2026-10-15');
  eq([isBarEvent(a), isBarEvent(b), isBarEvent(c)], [true, true, false]);
});
test('bars: span their days, cut at the edges, and share lanes when they can', () => {
  const days = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
  const item = (title, first, last) => ({ title, first, last });
  const { segs, lanes, used } = layoutBars([
    item('Trip', '2026-10-09', '2026-10-12'), // starts before the week
    item('Conference', '2026-10-13', '2026-10-15'),
    item('Visit', '2026-10-12', '2026-10-13'),
    item('Move', '2026-10-16', '2026-10-20'), // runs past it
  ], days);
  const by = Object.fromEntries(segs.map((x) => [x.item.title, [x.a, x.b, x.lane, x.contL, x.contR]]));
  eq(by.Trip, [0, 1, 0, true, false]);
  eq(by.Visit, [1, 2, 1, false, false]);
  eq(by.Conference, [2, 4, 0, false, false]);
  eq(by.Move, [5, 6, 0, false, true]);
  eq([lanes, used], [2, [1, 2, 2, 1, 1, 1, 1]]);
});
test('bars: events outside the days shown are left out', () => {
  eq(layoutBars([{ title: 'x', first: '2026-10-01', last: '2026-10-03' }], ['2026-10-11', '2026-10-12']).segs.length, 0);
});

// ---- labels
const labels = new Map([
  ['L1', { id: 'L1', name: 'Research', color: 'purple', status: 'active' }],
  ['L2', { id: 'L2', name: 'Old', color: 'gray', status: 'retired' }],
]);
test('labels: an item takes its label’s color unless it has its own', () => {
  eq(colorOf({ labelId: 'L1', color: null }, labels), 'purple');
  eq(colorOf({ labelId: 'L1', color: 'red' }, labels), 'red');
  eq(colorOf({ labelId: null, color: null }, labels), 'blue');
  eq(colorOf({ labelId: 'gone', color: null }, labels, 'none'), 'none');
  eq(colorOf({ title: 'old event without the new fields', color: 'teal' }, labels), 'teal');
});
test('labels: retiring hides a label from the picker and keeps its items', () => {
  const [op] = setLabelStatusOps(labels.get('L1'), 'retired');
  const after = new Map(labels).set('L1', op.obj);
  eq(activeLabels(after).map((l) => l.id), []);
  eq(retiredLabels(after).map((l) => l.id), ['L2', 'L1']); // by name: Old, Research
  eq(colorOf({ labelId: 'L1', color: null }, after), 'purple');
  eq(setLabelStatusOps(op.obj, 'active')[0].obj.status, 'active');
});
test('labels: deleting a label deletes its events, deadlines and tasks', () => {
  const events = map(ev({ id: 'a', labelId: 'L1' }), { ...deadline, labelId: 'L1' }, ev({ id: 'b', labelId: 'L2' }), ev({ id: 'c' }));
  const tasks = new Map([['t1', { id: 't1', title: 'x', labelId: 'L1' }], ['t2', { id: 't2', title: 'y', labelId: null }]]);
  eq(labelUsage('L1', events, tasks), { events: 1, deadlines: 1, tasks: 1 });
  const ops = deleteLabelOps('L1', events, tasks);
  eq(ops.map((o) => `${o.op} ${o.coll} ${o.id}`), ['remove labels L1', 'remove events a', 'remove events dl', 'remove tasks t1']);
});
test('backup: holds labels, and older backups without them still restore', () => {
  const { text } = backupFile(map(ev()), new Map(), labels);
  eq(parseBackup(text).labels.map((l) => l.id), ['L1', 'L2']);
  eq(parseBackup(JSON.stringify({ app: 'planner', version: 1, events: [], tasks: [] })).labels, []);
});
test('.ics export names the label as a category', () => {
  if (!icsFile(map(ev({ labelId: 'L1' })), labels).includes('CATEGORIES:Research')) throw new Error('missing CATEGORIES');
});

// ---- agenda
test('agenda: overdue first, then each day in time order, date-only tasks last, then undated; what is over only when asked', () => {
  const evs = [
    ev({ id: 'trip', allDay: true, start: '2026-10-13', end: '2026-10-14', title: 'Trip' }),
    ev({ id: 'late', start: '2026-10-12T22:00', end: '2026-10-13T01:00', title: 'Late' }), // started before the range
    ev({ id: 'meet', start: '2026-10-14T09:00', end: '2026-10-14T10:00', title: 'Meet' }),
    { ...deadline, id: 'due', start: '2026-10-14T08:00', end: '2026-10-14T08:00', title: 'Due' },
  ];
  const occs = evs.flatMap((e) => expand(e, '2026-10-13', '2026-10-15'));
  const tasks = [
    { id: 'old', title: 'Old', due: '2026-10-01', done: false },
    { id: 'any', title: 'Any time', due: '2026-10-14', dueTime: null, done: false },
    { id: 'nine', title: 'At nine', due: '2026-10-14', dueTime: '09:00', done: false },
    { id: 'gone', title: 'Done', due: '2026-10-14', done: true },
    { id: 'free', title: 'Someday', due: null, done: false },
  ];
  const all = agendaGroups({ from: '2026-10-13', to: '2026-10-15', occs, tasks, showPast: true, t: '2026-10-14', now: '2026-10-14T09:30' });
  const ids = (g) => g.items.map((x) => (x.occ ? x.occ.ev.id : x.task.id));
  const kinds = (gs) => gs.map((g) => g.kind + (g.day ? ' ' + g.day : ''));
  eq(kinds(all.groups), ['overdue', 'day 2026-10-13', 'day 2026-10-14', 'nodate']);
  eq(ids(all.groups[0]), ['old']);
  eq(ids(all.groups[1]), ['trip', 'late']);
  eq(ids(all.groups[2]), ['trip', 'due', 'meet', 'nine', 'any', 'gone']);
  eq(ids(all.groups[3]), ['free']);
  eq(all.hidden, 0);
  // At 9:30, yesterday, the 8:00 deadline and the done task are left out;
  // the trip still shows today, and the 9:00 meeting is still on.
  const ahead = agendaGroups({ from: '2026-10-13', to: '2026-10-15', occs, tasks, showPast: false, t: '2026-10-14', now: '2026-10-14T09:30' });
  eq(kinds(ahead.groups), ['overdue', 'day 2026-10-14', 'nodate']);
  eq(ids(ahead.groups[1]), ['trip', 'meet', 'nine', 'any']);
  eq(ahead.hidden, 3); // late, due, gone
});

// ---- the day running past midnight
test('day end at 2 AM: the small hours belong to the day before', () => {
  eq(slotOf('2026-10-15', 30, 26 * 60), { day: '2026-10-14', min: 1470 });
  eq(slotOf('2026-10-15', 150, 26 * 60), { day: '2026-10-15', min: 150 });
  eq(slotOf('2026-10-15', 30, 24 * 60), { day: '2026-10-15', min: 30 });
});
test('day end at 2 AM: a 12:30 AM event sits at the bottom of the day before', () => {
  const late = ev({ id: 'night', start: '2026-10-15T00:30', end: '2026-10-15T01:30' });
  const settings = { dayStart: 7, dayEnd: 26, hourHeight: 30, h24: false, showWork: false, workStart: 10, workEnd: 21 };
  const html = renderTimeGrid({ days: ['2026-10-14', '2026-10-15'], occs: expand(late, '2026-10-14', '2026-10-16'), settings });
  const cols = html.split('class="tg-col').slice(1);
  if (!cols[0].includes('data-id="night"') || !cols[0].includes('top:525px')) throw new Error('not at 12:30 AM in the first column');
  if (cols[1].includes('data-id="night"')) throw new Error('also shown on its own date');
});
test('day end at 2 AM: shown as an early chip when the day before is not on screen', () => {
  const late = ev({ id: 'night', start: '2026-10-15T00:30', end: '2026-10-15T01:30' });
  const settings = { dayStart: 7, dayEnd: 26, hourHeight: 30, h24: false, showWork: false, workStart: 10, workEnd: 21 };
  const html = renderTimeGrid({ days: ['2026-10-15'], occs: expand(late, '2026-10-15', '2026-10-16'), settings });
  if (!/chip[^"]*oor[^>]*data-id="night"/.test(html)) throw new Error('no early chip');
});

test('the day fits the space given: no scrolling up and down', () => {
  const settings = { dayStart: 7, dayEnd: 26, hourHeight: 30, h24: false, showWork: false, workStart: 10, workEnd: 21 };
  // 600px of room, 52px of day headers, an empty 24px all-day row: 523px for 19 hours.
  const html = renderTimeGrid({ days: ['2026-10-14'], occs: [], settings, fitHeight: 600, headH: 52 });
  if (!html.includes('class="tg n1 fit') || !html.includes('class="tg-axis" style="height:523px"')) throw new Error('not fitted to 523px');
  // Too little room for a usable hour: it scrolls at the usual hour height instead.
  if (renderTimeGrid({ days: ['2026-10-14'], occs: [], settings, fitHeight: 150, headH: 52 }).includes(' fit')) throw new Error('should not squeeze below 8px an hour');
});

test('no time: tasks and deadlines go at midnight, or at the bottom when the day ends earlier', () => {
  eq(dayEndAt(7 * 60, 26 * 60, 570, 0.5), 510); // 7 AM to 2 AM at 30px an hour: 12 AM is 510px down
  eq(dayEndAt(7 * 60, 24 * 60, 510, 0.5), 509);
  eq(dayEndAt(7 * 60, 22 * 60, 450, 0.5), 449);
});

// ---- holidays and working hours
test('holidays: substitutes, lunar dates in Korea time, 노동절 and 제헌절', () => {
  for (const d of ['2026-12-25', '2027-02-07', '2027-02-09', '2027-05-03', '2027-07-19', '2028-10-05', '2029-09-24', '2030-02-05', '2031-03-03']) {
    if (!HOLIDAYS[d]) throw new Error(`missing ${d}`);
  }
  if (HOLIDAYS['2027-02-05']) throw new Error('설날 2027 is Feb 7 in Korea, so Feb 5 is a working day');
});
test('working hours: shaded on weekdays, not on holidays or weekends', () => {
  const settings = { dayStart: 7, dayEnd: 26, hourHeight: 30, h24: false, showWork: true, workStart: 10, workEnd: 21 };
  const days = ['2026-12-24', '2026-12-25', '2026-12-26'];
  const cols = renderTimeGrid({ days, occs: [], settings }).split('class="tg-col').slice(1);
  eq(cols.map((c) => c.includes('class="work"')), [true, false, false]);
  if (!cols[0].includes('top:90px;height:330px')) throw new Error('band should run 10 AM to 9 PM');
});

// ---- moving by dragging
test('move: an event an hour and a half later', () => {
  const [o] = puts(moveOps(map(ev()), ev(), '2026-10-12', 90, null));
  eq([o.start, o.end], ['2026-10-12T10:30', '2026-10-12T11:30']);
});
test('move: an all-day event two days later', () => {
  const e = ev({ allDay: true, start: '2026-10-12', end: '2026-10-13' });
  const [o] = puts(moveOps(map(e), e, '2026-10-12', 2 * 1440, null));
  eq([o.start, o.end], ['2026-10-14', '2026-10-15']);
});
test('move: one occurrence of a weekly series', () => {
  const ops = moveOps(map(weekly), weekly, '2026-10-19', 60, 'this');
  const [m, d] = puts(ops);
  eq([m.exdates, d.start, d.seriesId, d.rrule], [['2026-10-19'], '2026-10-19T10:00', 'm', null]);
});
test('move: a whole weekly series a day later moves its weekday too', () => {
  const [m] = puts(moveOps(map(weekly), weekly, '2026-10-19', 1440, 'all'));
  eq([m.start, m.rrule.byWeekday], ['2026-10-13T09:00', [2]]);
});
test('.ics export: a deadline with no time is a date', () => {
  const ics = icsFile(map({ ...deadline, allDay: true, start: '2026-10-14', end: '2026-10-14' }));
  if (!ics.includes('DTSTART;VALUE=DATE:20261014') || ics.includes('DTEND')) throw new Error('wrong date-only deadline');
});

// ---- themes and their backups
test('themes: colors survive hex → HSL → hex', () => {
  for (const hex of ['#ffffff', '#000000', '#ffcbe1', '#1a1619', '#2f5f84', '#bfe6dd', '#7a5a06']) eq(hslToHex(hexToHsl(hex)), hex, hex);
  eq([toHex('#abc'), toHex('rgba(70, 60, 66, 0.04)'), toHex(' #FFCBE1')], ['#aabbcc', '#463c42', '#ffcbe1']);
});
test('themes: a dark background makes a dark theme, with its mixes', () => {
  const vars = { bg: '#161a24', fg: '#f3ecef', accent: '#bcd8ec', fill: 30, 'today-tint': 7, work: 3 };
  eq(baseOf(vars), 'dark');
  eq(baseOf({ ...vars, bg: '#fcf6f7' }), 'light');
  const css = cssVars('dark', vars);
  eq([css.bg, css.fill, css['today-tint'], css.work, css['accent-soft']],
    ['#161a24', '30%', '7%', 'color-mix(in srgb, var(--fg) 3% , transparent)'.replace(' ,', ','), 'color-mix(in srgb, var(--accent) 15%, var(--bg))']);
});
test('backup: saved themes go out and come back', () => {
  const theme = { id: 't1', name: 'Night', base: 'dark', vars: { bg: '#161a24' } };
  const { text } = backupFile(new Map(), new Map(), new Map(), new Map([['t1', theme]]));
  eq(parseBackup(text).themes, [theme]);
  eq(parseBackup(JSON.stringify({ app: 'planner', events: [], tasks: [] })).themes, []);
});

// ---- report
const failed = results.filter((r) => !r[0]);
document.title = failed.length ? `FAIL ${failed.length}/${results.length}` : `PASS ${results.length}/${results.length}`;
document.getElementById('out').textContent = [
  `${results.length - failed.length} passed, ${failed.length} failed`,
  '',
  ...results.map(([ok, name, msg]) => `${ok ? 'ok  ' : 'FAIL'} ${name}${msg ? `\n${msg}` : ''}`),
].join('\n');
