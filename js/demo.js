import { addDays, dt, startOfWeek, today } from './dates.js';

// Design preview (open the app with ?demo): sample events, deadlines, tasks
// and labels around the current week that show every kind of item, kept in
// memory only. Nothing is read from or saved to your real calendar.

export function demoStore(weekStart) {
  const t = today();
  const day = (i) => addDays(startOfWeek(t, weekStart), i);
  const now = Date.now();
  const label = (id, name, color, symbol, status = 'active') => ({ id, name, color, symbol, status, createdAt: now, updatedAt: now });
  const labels = [
    label('demo-l-research', 'Research', 'purple', 'beaker'),
    label('demo-l-teaching', 'Teaching', 'orange', 'book'),
    label('demo-l-personal', 'Personal', 'teal', 'heart'),
    label('demo-l-old', 'Old project', 'gray', null, 'retired'),
  ];
  const ev = (id, title, color, start, end, extra = {}) => ({
    id, kind: 'event', title, color, labelId: null, shape: 'block', start, end, notes: '', tentative: false, allDay: false, rrule: null, exdates: [],
    seriesId: null, originalDate: null, createdAt: now, updatedAt: now, ...extra,
  });
  const at = (i, h, m = 0) => dt(day(i), h * 60 + m);
  const events = [
    ev('demo-lab', 'Lab meeting', null, at(1, 10), at(1, 11, 30), { labelId: 'demo-l-research', rrule: { freq: 'weekly', interval: 1, byWeekday: [1, 3], until: null, count: null }, doneDates: [day(1)] }),
    ev('demo-us', 'Ultrasound experiment', 'green', at(2, 13), at(2, 17), { labelId: 'demo-l-research', notes: 'Bring the new transducer.\nCalibrate first.' }),
    ev('demo-ta', 'TA office hours', null, at(2, 14), at(2, 15), { labelId: 'demo-l-teaching', symbol: 'chat', doneDates: [day(2)] }),
    ev('demo-coffee', 'Coffee chat', 'pink', at(2, 14, 30), at(2, 15), { symbol: 'coffee' }),
    ev('demo-call', 'Quick call', 'gray', at(4, 9), at(4, 9, 15)),
    ev('demo-gym', 'Gym', null, at(4, 6), at(4, 7), { labelId: 'demo-l-personal', symbol: 'dumbbell' }),
    ev('demo-seminar', 'Seminar (maybe)', 'blue', at(4, 15), at(4, 16), { tentative: true }),
    ev('demo-writing', 'Paper writing', 'blue', at(3, 19), at(3, 23), { notes: 'Methods section, then figures 2–4. 그림 캡션도 다시 보기.' }),
    ev('demo-conf', 'Conference', 'red', day(5), day(6), { allDay: true, shape: 'arrow' }),
    ev('demo-flight', 'Late flight', 'yellow', at(6, 22), at(7, 1, 30)),
    ev('demo-dentist', 'Dentist', 'gray', at(8, 16), at(8, 17)),
    ev('demo-visit', 'Family visit', null, day(9), day(11), { allDay: true, labelId: 'demo-l-personal', shape: 'line' }),
    ev('demo-dinner', 'Group dinner', 'orange', at(12, 18, 30), at(12, 21), { tentative: true }),
    ev('demo-trip', 'Field trip', 'teal', day(16), day(16), { allDay: true, tentative: true }),
    ev('demo-abstract', 'Abstract due', null, at(3, 17), at(3, 17), { kind: 'deadline', labelId: 'demo-l-research', doneDates: [day(3)], notes: 'Through the conference portal.' }),
    ev('demo-hw', 'HW 3 grades due', null, at(5, 23, 59), at(5, 23, 59), { kind: 'deadline', labelId: 'demo-l-teaching' }),
    ev('demo-old', 'Old project report', null, at(10, 12), at(10, 12), { kind: 'deadline', labelId: 'demo-l-old' }),
    ev('demo-ko', '연구실 세미나 준비', null, at(1, 13), at(1, 14, 30), { labelId: 'demo-l-research' }),
    ev('demo-scholar', '장학금 서류 마감', null, day(3), day(3), { kind: 'deadline', allDay: true, labelId: 'demo-l-personal' }),
  ];
  const task = (id, title, due, extra = {}) => ({
    id, title, due, dueTime: null, labelId: null, color: null, notes: '', done: false, doneAt: null, createdAt: now, updatedAt: now, ...extra,
  });
  const tasks = [
    task('demo-t1', 'Reply to reviewer 2', addDays(day(0), -3), { labelId: 'demo-l-research' }),
    task('demo-t2', 'Submit IRB amendment', t, { dueTime: '17:00', labelId: 'demo-l-research' }),
    task('demo-t3', 'Order PDMS', t, { done: true, doneAt: now }),
    task('demo-t4', 'Grade homework 2', day(5), { labelId: 'demo-l-teaching', notes: 'Due to the professor by Friday.' }),
    task('demo-t5', 'Read the new organoid paper', null),
    task('demo-t6', 'Pick up dry cleaning', day(2), { dueTime: '11:00', labelId: 'demo-l-personal' }),
    task('demo-t7', '학회 발표자료 만들기', day(3), { labelId: 'demo-l-research' }),
    task('demo-t8', 'Email the committee', day(3), { dueTime: '23:45', labelId: 'demo-l-teaching' }),
    task('demo-t9', 'Proofread abstract', day(3), { dueTime: '16:30', labelId: 'demo-l-research', notes: 'Check the word limit (250).' }),
  ];

  const data = {
    events: new Map(events.map((e) => [e.id, e])),
    tasks: new Map(tasks.map((x) => [x.id, x])),
    labels: new Map(labels.map((x) => [x.id, x])),
    themes: new Map(),
    stickers: new Map(),
    // The glitter star on the lab meeting and on a free afternoon, and on a
    // day in the month view.
    placements: new Map([
      { id: 'demo-s1', stickerId: 'builtin-glitter-star', size: 'm', at: 'event', eventId: 'demo-lab', date: day(1), following: false, col: 0, fx: 0.92, fy: 0.15 },
      { id: 'demo-s2', stickerId: 'builtin-glitter-star', size: 'l', at: 'time', date: day(5), min: 15 * 60, x: 0.5, rot: 15 },
      { id: 'demo-s3', stickerId: 'builtin-glitter-star', size: 'l', at: 'month', date: day(6), fx: 0.7, fy: 0.62, rot: 345 },
    ].map((p) => [p.id, { ...p, createdAt: now, updatedAt: now }])),
  };
  const snap = () => ({
    events: new Map(data.events), tasks: new Map(data.tasks), labels: new Map(data.labels), themes: new Map(data.themes),
    stickers: new Map(data.stickers), placements: new Map(data.placements), pending: false,
  });
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn(snap()));
  return {
    kind: 'demo',
    subscribe(fn) {
      subs.add(fn);
      fn(snap());
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
    samples: { repeating: ['demo-lab', day(3)], deadline: ['demo-abstract', day(3)], task: 'demo-t4', newEventDate: day(3) },
  };
}
