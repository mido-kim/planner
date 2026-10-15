import { absMin, addDays, dateOf, diffDays, fromAbsMin, shiftDays, weekday } from './dates.js';
import { alignStart, occurrenceDates } from './recurrence.js';
import { uid } from './util.js';

// Saving and deleting repeating events. A series is one stored event with an
// `rrule`. Deleting one occurrence adds its date to the series' `exdates`.
// Changing one occurrence does that too and stores a separate "detached" event
// that points back at the series through `seriesId` and `originalDate`.
//
// Each function returns a list of writes ({ op, coll, obj | id }) for the store
// to apply together. `date` is the date of the occurrence the user picked.

const put = (obj) => ({ op: 'put', coll: 'events', obj });
const remove = (id) => ({ op: 'remove', coll: 'events', id });
const touch = (obj) => ({ ...obj, updatedAt: Date.now() });

export const masterOf = (events, ev) => (ev.seriesId ? events.get(ev.seriesId) || null : null);
export const isRepeating = (events, ev) => !!(ev.rrule || masterOf(events, ev));

const detachedOf = (events, id) => [...events.values()].filter((e) => e.seriesId === id);

function withExdate(ev, date) {
  return touch({ ...ev, exdates: [...new Set([...(ev.exdates || []), date])] });
}

// The series as it was, ending the day before `date`.
function endBefore(ev, date) {
  return touch({
    ...ev,
    rrule: { ...ev.rrule, until: addDays(date, -1), count: null },
    exdates: (ev.exdates || []).filter((d) => d < date),
  });
}

// scope: 'this' | 'following' | 'all'
export function deleteOps(events, ev, date, scope) {
  const master = masterOf(events, ev);
  if (master) {
    if (scope === 'this') return [remove(ev.id)];
    return deleteOps(events, master, ev.originalDate, scope);
  }
  if (!ev.rrule || scope === 'all' || (scope === 'following' && date <= dateOf(ev.start))) {
    return [remove(ev.id), ...detachedOf(events, ev.id).map((e) => remove(e.id))];
  }
  if (scope === 'this') return [put(withExdate(ev, date))];
  return [
    put(endBefore(ev, date)),
    ...detachedOf(events, ev.id).filter((e) => e.originalDate >= date).map((e) => remove(e.id)),
  ];
}

// `form` holds the edited fields: title, notes, color, allDay, start, end and
// rrule, with start and end set to the edited occurrence's times.
export function saveOps(events, ev, date, form, scope) {
  const now = Date.now();
  if (!ev) {
    return [put(alignStart({ id: uid(), ...form, exdates: [], seriesId: null, originalDate: null, createdAt: now, updatedAt: now }))];
  }

  const master = masterOf(events, ev);
  if (master) {
    if (scope === 'this') return [put(touch({ ...ev, ...form, rrule: null }))];
    // Fold this occurrence back into its series, then edit the series.
    const restored = { ...master, exdates: (master.exdates || []).filter((d) => d !== ev.originalDate) };
    const others = new Map(events);
    others.delete(ev.id);
    others.set(master.id, restored);
    return [...saveOps(others, restored, ev.originalDate, form, scope), remove(ev.id)];
  }

  if (!ev.rrule) return [put(alignStart(touch({ ...ev, ...form })))];

  if (scope === 'this') {
    return [
      put(withExdate(ev, date)),
      put({ ...ev, ...form, id: uid(), rrule: null, exdates: [], seriesId: ev.id, originalDate: date, createdAt: now, updatedAt: now }),
    ];
  }

  // How far the user moved this occurrence, in days.
  const moved = diffDays(date, dateOf(form.start));

  if (scope === 'all' || date <= dateOf(ev.start)) {
    // Move the whole series by the same amount.
    const back = diffDays(date, dateOf(ev.start));
    const next = touch({
      ...ev,
      ...form,
      start: shiftDays(form.start, back),
      end: shiftDays(form.end, back),
      exdates: form.rrule ? (ev.exdates || []).map((d) => addDays(d, moved)) : [],
    });
    const ops = [put(alignStart(next))];
    // A series that stops repeating leaves its changed occurrences standing alone.
    if (!form.rrule) {
      for (const e of detachedOf(events, ev.id)) ops.push(put(touch({ ...e, seriesId: null, originalDate: null })));
    }
    return ops;
  }

  // This and following: end the old series here and start a new one.
  let rrule = form.rrule;
  if (rrule?.count && !rrule.until && rrule.count === ev.rrule.count) {
    const before = occurrenceDates(ev.rrule, dateOf(ev.start), date).length;
    rrule = { ...rrule, count: Math.max(1, rrule.count - before) };
  }
  const id = uid();
  const ops = [
    put(endBefore(ev, date)),
    put(alignStart({
      ...ev,
      ...form,
      rrule,
      id,
      exdates: rrule ? (ev.exdates || []).filter((d) => d >= date).map((d) => addDays(d, moved)) : [],
      seriesId: null,
      originalDate: null,
      createdAt: now,
      updatedAt: now,
    })),
  ];
  for (const e of detachedOf(events, ev.id)) {
    if (e.originalDate < date) continue;
    ops.push(put(touch(rrule
      ? { ...e, seriesId: id, originalDate: addDays(e.originalDate, moved) }
      : { ...e, seriesId: null, originalDate: null })));
  }
  return ops;
}

// Moving the occurrence on `date` by `minutes` (whole days for all-day
// events), as a save with `scope`. Moving a weekly series to other days
// moves its weekdays along with it.
export function moveOps(events, ev, date, minutes, scope) {
  const master = masterOf(events, ev);
  const k = diffDays(dateOf(ev.start), date);
  const start = shiftDays(ev.start, k);
  const end = shiftDays(ev.end, k);
  const shift = (v) => (v.length > 10 ? fromAbsMin(absMin(v) + minutes) : addDays(v, Math.round(minutes / 1440)));
  const days = diffDays(dateOf(start), dateOf(shift(start)));
  let rrule = ev.rrule || master?.rrule || null;
  if (rrule && scope !== 'this' && rrule.freq === 'weekly' && days % 7) {
    const from = rrule.byWeekday?.length ? rrule.byWeekday : [weekday(dateOf(start))];
    rrule = { ...rrule, byWeekday: from.map((d) => (((d + days) % 7) + 7) % 7) };
  }
  return saveOps(events, ev, date, { start: shift(start), end: shift(end), rrule }, scope);
}
