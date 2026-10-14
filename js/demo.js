import { addDays, dt, startOfWeek, today } from './dates.js';

// Design preview (open the app with ?demo): sample events and tasks around the
// current week that show every kind of event, kept in memory only. Nothing is
// read from or saved to your real calendar.

export function demoStore(weekStart) {
  const t = today();
  const day = (i) => addDays(startOfWeek(t, weekStart), i);
  const now = Date.now();
  const ev = (id, title, color, start, end, extra = {}) => ({
    id, title, color, start, end, notes: '', tentative: false, allDay: false, rrule: null, exdates: [],
    seriesId: null, originalDate: null, createdAt: now, updatedAt: now, ...extra,
  });
  const at = (i, h, m = 0) => dt(day(i), h * 60 + m);
  const events = [
    ev('demo-lab', 'Lab meeting', 'purple', at(1, 10), at(1, 11, 30), { rrule: { freq: 'weekly', interval: 1, byWeekday: [1, 3], until: null, count: null } }),
    ev('demo-us', 'Ultrasound experiment', 'green', at(2, 13), at(2, 17), { notes: 'Bring the new transducer.' }),
    ev('demo-ta', 'TA office hours', 'orange', at(2, 14), at(2, 15)),
    ev('demo-coffee', 'Coffee chat', 'pink', at(2, 14, 30), at(2, 15)),
    ev('demo-call', 'Quick call', 'gray', at(4, 9), at(4, 9, 15)),
    ev('demo-gym', 'Gym', 'teal', at(4, 6), at(4, 7)),
    ev('demo-seminar', 'Seminar (maybe)', 'blue', at(4, 15), at(4, 16), { tentative: true }),
    ev('demo-writing', 'Paper writing', 'blue', at(3, 19), at(3, 23)),
    ev('demo-conf', 'Conference', 'red', day(5), day(6), { allDay: true }),
    ev('demo-flight', 'Late flight', 'yellow', at(6, 22), at(7, 1, 30)),
    ev('demo-dentist', 'Dentist', 'gray', at(8, 16), at(8, 17)),
    ev('demo-dinner', 'Group dinner', 'orange', at(12, 18, 30), at(12, 21), { tentative: true }),
    ev('demo-trip', 'Field trip', 'teal', day(16), day(16), { allDay: true, tentative: true }),
  ];
  const task = (id, title, due, extra = {}) => ({
    id, title, due, dueTime: null, notes: '', done: false, doneAt: null, createdAt: now, updatedAt: now, ...extra,
  });
  const tasks = [
    task('demo-t1', 'Reply to reviewer 2', addDays(day(0), -3)),
    task('demo-t2', 'Submit IRB amendment', t, { dueTime: '17:00' }),
    task('demo-t3', 'Order PDMS', t, { done: true, doneAt: now }),
    task('demo-t4', 'Grade homework 2', day(5), { notes: 'Due to the professor by Friday.' }),
    task('demo-t5', 'Read the new organoid paper', null),
  ];

  const data = { events: new Map(events.map((e) => [e.id, e])), tasks: new Map(tasks.map((x) => [x.id, x])) };
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn({ events: new Map(data.events), tasks: new Map(data.tasks), pending: false }));
  return {
    kind: 'demo',
    subscribe(fn) {
      subs.add(fn);
      fn({ events: new Map(data.events), tasks: new Map(data.tasks), pending: false });
      return () => subs.delete(fn);
    },
    async apply(ops) {
      for (const o of ops) {
        if (o.op === 'put') data[o.coll].set(o.obj.id, o.obj);
        else data[o.coll].delete(o.id);
      }
      emit();
    },
    // Ids and dates for opening a dialog straight away (?demo&show=...).
    samples: { repeating: ['demo-lab', day(3)], task: 'demo-t4', newEventDate: day(3) },
  };
}
