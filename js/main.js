import { backupFile, icsFile, parseBackup, saveFile } from './backup.js';
import { firebaseConfig } from './config.js';
import {
  addDays, addMonths, dateOf, daysFrom, diffDays, dt, fmt, nowMin, parts, shiftDays, startOfMonth, startOfWeek, today,
} from './dates.js';
import { askScope, eventEditor, settingsDialog, taskEditor } from './dialogs.js';
import { icons } from './icons.js';
import { expand } from './recurrence.js';
import { deleteOps, isRepeating, masterOf, saveOps } from './series.js';
import { loadSettings, saveSettings } from './settings.js';
import { localStore, readLocalData } from './store.js';
import { $, esc, readJSON, uid, writeJSON } from './util.js';
import { renderMonth } from './views/month.js';
import { renderTaskList, tasksInView } from './views/tasks.js';
import { renderTimeGrid } from './views/timegrid.js';

const DAY_MS = 86400000;
const BACKUP_KEY = 'planner.backup.v1'; // { last, snoozeUntil, firstSeen } for this device
const WIDE = 900; // at this width and up, the task list sits beside the calendar

const app = $('#app');
let settings = loadSettings();
const state = {
  view: settings.view,
  date: today(),
  events: new Map(),
  tasks: new Map(),
  pending: false,
  sheetOpen: false, // task list on narrow screens
  showDone: false,
};
let store = null;
let cloud = null;
let unsubscribe = null;
let demo = false; // design preview: sample data, nothing saved

// Display settings are saved per device, except in the design preview.
const persist = () => !demo && saveSettings(settings);
let lastRangeKey = '';
let lastToday = today();

boot();

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  wireEvents();
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) return startDemo(params);
  if (!firebaseConfig) return start(localStore());
  showMessage('Loading…');
  try {
    const { connectCloud } = await import('./cloud.js');
    cloud = await connectCloud(firebaseConfig);
  } catch (err) {
    console.error(err);
    return showMessage('Couldn’t load sync. Check your connection, then reload.');
  }
  cloud.onUser((user) => (user ? start(cloud.storeFor(user, onSyncError)) : showSignIn()));
}

function start(s) {
  unsubscribe?.();
  store = s;
  lastRangeKey = '';
  renderShell();
  let first = true;
  unsubscribe = store.subscribe((snap) => {
    state.events = snap.events;
    state.tasks = snap.tasks;
    state.pending = snap.pending;
    render();
    if (first && store.kind === 'cloud') setTimeout(offerLocalCopy, 300);
    first = false;
  });
}

// Design preview: ?demo, optionally with &view=day|week|2week|month and
// &show=tasks|event|new-event|delete|task|settings to open one part of the UI.
async function startDemo(params) {
  demo = true;
  const { demoStore } = await import('./demo.js');
  const s = demoStore(settings.weekStart);
  if (['day', 'week', '2week', 'month'].includes(params.get('view'))) state.view = params.get('view');
  start(s);
  const [id, date] = s.samples.repeating;
  switch (params.get('show')) {
    case 'tasks':
      state.sheetOpen = true;
      render();
      break;
    case 'event': editEventAt(id, date); break;
    case 'new-event': newEventAt(s.samples.newEventDate, 10 * 60, 11 * 60); break;
    case 'delete': askScope('delete'); break;
    case 'task': editTask(s.samples.task); break;
    case 'settings': openSettings(); break;
  }
}

function showMessage(text) {
  app.innerHTML = `<div class="center-msg">${esc(text)}</div>`;
}

// ---------------------------------------------------------------- Layout

function renderShell() {
  app.innerHTML = `
  <header class="topbar">
    <button class="btn today-btn" data-action="today">Today</button>
    <div class="arrows">
      <button class="icon-btn" data-action="prev" aria-label="Previous">${icons.prev}</button>
      <button class="icon-btn" data-action="next" aria-label="Next">${icons.next}</button>
    </div>
    <div class="title-wrap">
      <h1 class="range-title" id="range-title"></h1>
      <input type="date" class="jump" id="jump" aria-label="Go to date">
    </div>
    <div class="seg" role="group" aria-label="View">
      <button data-view="day">Day</button><button data-view="week">Week</button><button data-view="2week" aria-label="2 weeks"><span class="lg">2 Weeks</span><span class="sm">2 Wk</span></button><button data-view="month">Month</button>
    </div>
    <button class="icon-btn tasks-btn" data-action="toggle-tasks" aria-label="Tasks">${icons.tasks}<span class="badge" id="task-badge" hidden></span></button>
    <button class="icon-btn settings-btn" data-action="settings" aria-label="Settings">${icons.settings}<span class="sync-dot" id="sync-dot" hidden></span></button>
    <button class="btn primary new-btn" data-action="new-event" aria-label="New event">${icons.plus}<span>New</span></button>
  </header>
  <div class="main">
    <section class="cal" id="cal"></section>
    <div class="scrim" data-action="toggle-tasks"></div>
    <aside class="tasks" id="tasks" aria-label="Tasks">
      <div class="tasks-head">
        <div><h2>Tasks</h2><p class="sub" id="tasks-range"></p></div>
        <button class="icon-btn tasks-close" data-action="toggle-tasks" aria-label="Close tasks">${icons.close}</button>
      </div>
      <form class="task-add" id="task-add" autocomplete="off">
        <input name="title" placeholder="Add a task" enterkeyhint="done" maxlength="200" aria-label="New task">
        <input type="date" name="due" aria-label="Due date">
        <button class="icon-btn add" aria-label="Add task">${icons.plus}</button>
      </form>
      <div class="tasks-list" id="task-list"></div>
    </aside>
  </div>
  <div class="banner" id="banner" hidden></div>
  <div class="toast" id="toast" role="status" hidden></div>`;
}

function viewRange() {
  const d = state.date;
  const ws = settings.weekStart;
  switch (state.view) {
    case 'day':
      return { from: d, to: addDays(d, 1), days: [d] };
    case '2week': {
      const s = startOfWeek(d, ws);
      return { from: s, to: addDays(s, 14), days: daysFrom(s, 14) };
    }
    case 'month': {
      const s = startOfMonth(d);
      const e = addMonths(s, 1);
      const gridFrom = startOfWeek(s, ws);
      const weeks = Math.ceil(diffDays(gridFrom, e) / 7);
      return { from: s, to: e, gridFrom, gridTo: addDays(gridFrom, weeks * 7), weeks };
    }
    default: {
      const s = startOfWeek(d, ws);
      return { from: s, to: addDays(s, 7), days: daysFrom(s, 7) };
    }
  }
}

function spanLabel(a, b) {
  const A = parts(a);
  const B = parts(b);
  if (A.y !== B.y) return `${fmt(a, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  if (A.m !== B.m) return `${fmt(a, { month: 'short', day: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric' })}, ${A.y}`;
  return `${fmt(a, { month: 'short', day: 'numeric' })} – ${B.d}, ${A.y}`;
}

function rangeTitle(r) {
  if (state.view === 'day') {
    return fmt(r.from, innerWidth < 600 ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (state.view === 'month') return fmt(r.from, { month: 'long', year: 'numeric' });
  return spanLabel(r.from, addDays(r.to, -1));
}

function occurrencesIn(from, to) {
  const out = [];
  for (const ev of state.events.values()) out.push(...expand(ev, from, to));
  return out;
}

function render() {
  if (!store) return;
  const r = viewRange();
  const key = `${state.view}|${r.from}|${settings.weekStart}`;
  const rangeChanged = key !== lastRangeKey;
  lastRangeKey = key;
  $('#range-title').textContent = rangeTitle(r);
  $('#jump').value = state.date;
  app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
  app.classList.toggle('sheet-open', state.sheetOpen);
  app.classList.toggle('tasks-hidden', !!settings.hideTasks);
  renderCalendar(r, rangeChanged);
  renderTasks(r, rangeChanged);
  const dot = $('#sync-dot');
  dot.hidden = !(store.kind === 'cloud' && (state.pending || !navigator.onLine));
  dot.title = navigator.onLine ? 'Syncing…' : 'Offline — changes will sync later';
  updateBanner();
}

function renderCalendar(r, rangeChanged) {
  const cal = $('#cal');
  const old = cal.querySelector('.tg');
  const prev = old ? { top: old.scrollTop, left: old.scrollLeft } : null;

  if (state.view === 'month') {
    const cellH = ((cal.clientHeight || 600) - 28) / r.weeks;
    const chipLimit = Math.max(1, Math.floor((cellH - 26) / 19));
    cal.innerHTML = renderMonth({ range: r, occs: occurrencesIn(r.gridFrom, r.gridTo), settings, chipLimit });
    return;
  }

  cal.innerHTML = renderTimeGrid({ days: r.days, occs: occurrencesIn(r.from, r.to), settings });
  const tg = cal.querySelector('.tg');
  if (prev) tg.scrollTop = prev.top;
  else if (!demo) {
    // First time: bring the current time into view.
    const n = nowMin();
    const H0 = settings.dayStart * 60;
    if (r.days.includes(today()) && n > H0) tg.scrollTop = Math.max(0, ((n - H0) * settings.hourHeight) / 60 - tg.clientHeight / 3);
  }
  if (tg.scrollWidth > tg.clientWidth) {
    // Narrow screens scroll sideways: keep the place, or show the picked day.
    if (prev && !rangeChanged) tg.scrollLeft = prev.left;
    else {
      const i = r.days.indexOf(r.days.includes(today()) ? today() : state.date);
      const col = tg.querySelectorAll('.tg-col')[i];
      const axis = tg.querySelector('.tg-axis').offsetWidth;
      if (col) tg.scrollLeft = Math.max(0, col.offsetLeft - axis);
    }
  }
}

function renderTasks(r, rangeChanged) {
  $('#tasks-range').textContent =
    state.view === 'month' ? fmt(r.from, { month: 'long', year: 'numeric' })
      : state.view === 'day' ? fmt(r.from, { weekday: 'long', month: 'short', day: 'numeric' })
        : spanLabel(r.from, addDays(r.to, -1));
  $('#task-list').innerHTML = renderTaskList({ tasks: state.tasks, from: r.from, to: r.to, h24: settings.h24, showDone: state.showDone });
  // New tasks default to today if it's on screen, else the picked day.
  const due = $('#task-add').elements.due;
  const inView = (d) => d >= r.from && d < r.to;
  if (rangeChanged && document.activeElement !== due) due.value = inView(today()) ? today() : inView(state.date) ? state.date : r.from;
  const n = tasksInView(state.tasks, r.from, r.to).filter((x) => !x.done).length;
  const badge = $('#task-badge');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : n;
}

// ---------------------------------------------------------------- Writes

// Applies writes and, for deletes, offers to undo them.
function commit(ops, undoLabel) {
  if (!ops.length) return;
  const seen = new Set();
  const undo = [];
  for (const o of ops) {
    const id = o.op === 'put' ? o.obj.id : o.id;
    if (seen.has(o.coll + id)) continue;
    seen.add(o.coll + id);
    const prev = state[o.coll].get(id);
    undo.push(prev ? { op: 'put', coll: o.coll, obj: prev } : { op: 'remove', coll: o.coll, id });
  }
  Promise.resolve()
    .then(() => store.apply(ops))
    .then(() => undoLabel && toast(undoLabel, () => store.apply(undo)))
    .catch((err) => {
      console.error(err);
      toast(`Couldn’t save: ${err.message || err}`);
    });
}

async function newEventAt(date, startMin, endMin) {
  if (startMin == null) {
    // The next whole hour today, otherwise 9 AM (or when the day view starts).
    startMin = date === today() ? Math.min(Math.ceil((nowMin() + 1) / 60) * 60, 23 * 60) : Math.max(settings.dayStart * 60, 9 * 60);
    endMin = startMin + 60;
  }
  const initial = { title: '', notes: '', color: 'blue', tentative: false, allDay: false, start: dt(date, startMin), end: dt(date, endMin ?? startMin + 60), rrule: null };
  const res = await eventEditor({ initial, isNew: true, repeating: false, settings });
  if (res?.action === 'save') commit(saveOps(state.events, null, null, res.form, null));
}

async function editEventAt(id, date) {
  const ev = state.events.get(id);
  if (!ev) return;
  const master = masterOf(state.events, ev);
  // The editor shows this occurrence's own date and times.
  const k = diffDays(dateOf(ev.start), date);
  const initial = { ...ev, start: shiftDays(ev.start, k), end: shiftDays(ev.end, k), rrule: ev.rrule || master?.rrule || null };
  const res = await eventEditor({ initial, isNew: false, repeating: isRepeating(state.events, ev), settings });
  if (!res) return;
  if (res.action === 'save') commit(saveOps(state.events, ev, date, res.form, res.scope));
  else commit(deleteOps(state.events, ev, date, res.scope), res.scope && res.scope !== 'this' ? 'Events deleted' : 'Event deleted');
}

function addTask(title, due) {
  const now = Date.now();
  commit([{ op: 'put', coll: 'tasks', obj: { id: uid(), title, notes: '', due: due || null, dueTime: null, done: false, doneAt: null, createdAt: now, updatedAt: now } }]);
}

function toggleTask(id, done) {
  const t = state.tasks.get(id);
  if (t) commit([{ op: 'put', coll: 'tasks', obj: { ...t, done, doneAt: done ? Date.now() : null, updatedAt: Date.now() } }]);
}

async function editTask(id) {
  const t = state.tasks.get(id);
  if (!t) return;
  const res = await taskEditor(t);
  if (res?.action === 'save') {
    const doneAt = res.fields.done ? t.doneAt || Date.now() : null;
    commit([{ op: 'put', coll: 'tasks', obj: { ...t, ...res.fields, doneAt, updatedAt: Date.now() } }]);
  } else if (res?.action === 'delete') commit([{ op: 'remove', coll: 'tasks', id }], 'Task deleted');
}

// ---------------------------------------------------------------- Navigation

function move(dir) {
  const v = state.view;
  state.date = v === 'day' ? addDays(state.date, dir)
    : v === 'week' ? addDays(state.date, 7 * dir)
      : v === '2week' ? addDays(state.date, 14 * dir)
        : addMonths(state.date, dir);
  render();
}

function setView(view) {
  state.view = view;
  settings.view = view;
  persist();
  render();
}

function toggleTasks() {
  if (innerWidth >= WIDE) {
    settings.hideTasks = !settings.hideTasks;
    persist();
  } else state.sheetOpen = !state.sheetOpen;
  render();
}

const actions = {
  today: () => {
    state.date = today();
    render();
  },
  prev: () => move(-1),
  next: () => move(1),
  'toggle-tasks': toggleTasks,
  'new-event': () => newEventAt(state.date),
  'toggle-done': () => {
    state.showDone = !state.showDone;
    renderTasks(viewRange(), false);
  },
  settings: openSettings,
  backup: doBackup,
  snooze: () => {
    writeJSON(BACKUP_KEY, { ...readJSON(BACKUP_KEY, {}), snoozeUntil: Date.now() + 14 * DAY_MS });
    updateBanner();
  },
};

// ---------------------------------------------------------------- Input

let drag = null; // creating an event by clicking or dragging on the timeline

function minuteAt(col, y) {
  const r = col.getBoundingClientRect();
  const m = settings.dayStart * 60 + ((y - r.top) * 60) / settings.hourHeight;
  return Math.min(settings.dayEnd * 60, Math.max(settings.dayStart * 60, m));
}

function drawGhost(d) {
  const a = Math.floor(Math.min(d.start, d.end) / 15) * 15;
  const b = Math.max(a + 15, Math.ceil(Math.max(d.start, d.end) / 15) * 15);
  if (!d.ghost) {
    d.ghost = document.createElement('div');
    d.ghost.className = 'ghost';
    d.col.append(d.ghost);
  }
  const ppm = settings.hourHeight / 60;
  d.ghost.style.top = `${(a - settings.dayStart * 60) * ppm}px`;
  d.ghost.style.height = `${(b - a) * ppm}px`;
  return [a, b];
}

function wireEvents() {
  app.addEventListener('click', (e) => {
    const t = e.target;
    const act = t.closest('[data-action]');
    if (act) return actions[act.dataset.action]?.();
    const view = t.closest('[data-view]');
    if (view) return setView(view.dataset.view);
    const ev = t.closest('[data-id][data-date]');
    if (ev) return editEventAt(ev.dataset.id, ev.dataset.date);
    const go = t.closest('[data-goto]');
    if (go) {
      state.date = go.dataset.goto;
      return setView('day');
    }
    const task = t.closest('[data-edit-task]');
    if (task) return editTask(task.dataset.editTask);
    if (t.id === 'jump') openDatePicker();
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.toggle) toggleTask(t.dataset.toggle, t.checked);
    else if (t.id === 'jump' && t.value) {
      state.date = t.value;
      render();
    }
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'task-add') return;
    e.preventDefault();
    const f = e.target;
    const title = f.elements.title.value.trim();
    if (!title) return;
    addTask(title, f.elements.due.value);
    f.elements.title.value = '';
  });

  app.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  app.addEventListener('pointerdown', (e) => {
    const col = e.target.closest('.tg-col');
    if (!col || e.target.closest('.ev') || e.button !== 0) return;
    const m = minuteAt(col, e.clientY);
    drag = { col, date: col.dataset.date, start: m, end: m, x: e.clientX, y: e.clientY, t: Date.now(), touch: e.pointerType !== 'mouse', moved: false };
    if (!drag.touch) {
      col.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  app.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientY - drag.y) > 6 || Math.abs(e.clientX - drag.x) > 6) drag.moved = true;
    if (drag.touch || !drag.moved) return; // on touch screens, moving scrolls
    drag.end = minuteAt(drag.col, e.clientY);
    drawGhost(drag);
  });
  app.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.touch && (d.moved || Date.now() - d.t > 600)) return;
    let a;
    let b;
    if (d.moved && !d.touch) [a, b] = drawGhost(d);
    else {
      a = Math.floor(d.start / 30) * 30;
      b = a + 60;
    }
    d.ghost?.remove();
    newEventAt(d.date, a, b);
  });
  app.addEventListener('pointercancel', () => {
    drag?.ghost?.remove();
    drag = null;
  });

  document.addEventListener('keydown', (e) => {
    if (!store || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const keys = {
      t: actions.today, ArrowLeft: actions.prev, ArrowRight: actions.next, n: actions['new-event'],
      d: () => setView('day'), w: () => setView('week'), 2: () => setView('2week'), m: () => setView('month'),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });

  let lastW = innerWidth;
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!store) return;
      const r = viewRange();
      $('#range-title').textContent = rangeTitle(r);
      if (state.view === 'month' || innerWidth !== lastW) renderCalendar(r, false);
      lastW = innerWidth;
    }, 150);
  });

  // Keep "now" and "today" current.
  const tick = () => {
    if (!store || document.hidden || drag) return;
    if (today() !== lastToday) {
      if (state.date === lastToday) state.date = today();
      lastToday = today();
      render();
    } else if (state.view !== 'month') renderCalendar(viewRange(), false);
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', tick);
  addEventListener('online', () => store && render());
  addEventListener('offline', () => store && render());
}

function openDatePicker() {
  const input = $('#jump');
  try {
    input.showPicker();
  } catch {
    input.focus();
  }
}

// ---------------------------------------------------------------- Messages

let toastTimer;
function toast(message, undo) {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = `<span>${esc(message)}</span>${undo ? '<button class="toast-btn">Undo</button>' : ''}`;
  t.hidden = false;
  t.querySelector('.toast-btn')?.addEventListener('click', () => {
    undo();
    t.hidden = true;
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

function updateBanner() {
  const banner = $('#banner');
  if (demo) return void (banner.hidden = true);
  const meta = readJSON(BACKUP_KEY, {});
  if (!meta.firstSeen) writeJSON(BACKUP_KEY, { ...meta, firstSeen: Date.now() });
  const since = meta.last || meta.firstSeen || Date.now();
  const show = state.events.size + state.tasks.size > 0 && Date.now() - since > 30 * DAY_MS && Date.now() > (meta.snoozeUntil || 0);
  banner.hidden = !show;
  if (!show) return;
  const days = Math.floor((Date.now() - since) / DAY_MS);
  banner.innerHTML = `<span>${meta.last ? `Your last backup from this device was ${days} days ago.` : 'You haven’t saved a backup from this device yet.'}</span>
    <button class="btn primary" data-action="backup">Download backup</button><button class="btn" data-action="snooze">Later</button>`;
}

function onSyncError(err) {
  console.error(err);
  toast(err.code === 'permission-denied' ? 'Sync was refused by the database rules (see README: Turn on sync).' : `Sync problem: ${err.message || err.code}`);
}

// ---------------------------------------------------------------- Settings & backups

function openSettings() {
  settingsDialog({
    settings,
    sync: { kind: store.kind, email: store.email },
    lastBackup: readJSON(BACKUP_KEY, {}).last,
    onChange: (changes) => {
      settings = { ...settings, ...changes };
      if (settings.dayEnd <= settings.dayStart) settings.dayEnd = Math.min(24, settings.dayStart + 1);
      persist();
      render();
    },
    actions: {
      backup: doBackup,
      ics: () => saveFile('planner-events.ics', icsFile(state.events), 'text/calendar'),
      restore: restoreBackup,
      signOut: () => cloud?.signOut(),
    },
  });
}

async function doBackup() {
  const { name, text } = backupFile(state.events, state.tasks);
  if (await saveFile(name, text, 'application/json')) {
    writeJSON(BACKUP_KEY, { ...readJSON(BACKUP_KEY, {}), last: Date.now() });
    updateBanner();
    toast('Backup saved');
  }
}

function restoreBackup(text) {
  let data;
  try {
    data = parseBackup(text);
  } catch (err) {
    return toast(err.message);
  }
  const when = data.exportedAt ? ` from ${new Date(data.exportedAt).toLocaleDateString()}` : '';
  const ok = confirm(`Restore ${data.events.length} events and ${data.tasks.length} tasks${when}?\n\nItems in the backup replace their current versions. Anything added since the backup stays.`);
  if (!ok) return;
  commit([
    ...data.events.map((obj) => ({ op: 'put', coll: 'events', obj })),
    ...data.tasks.map((obj) => ({ op: 'put', coll: 'tasks', obj })),
  ], 'Backup restored');
}

// After the first sign-in on a device, offers to copy what was saved locally.
function offerLocalCopy() {
  const flag = `planner.copied.${store.uid}`;
  if (readJSON(flag, false)) return;
  writeJSON(flag, true);
  const local = readLocalData();
  const events = Object.values(local.events);
  const tasks = Object.values(local.tasks);
  if (!events.length && !tasks.length) return;
  if (confirm(`This device has ${events.length} events and ${tasks.length} tasks from before sync was turned on. Copy them to your account?`)) {
    commit([
      ...events.map((obj) => ({ op: 'put', coll: 'events', obj })),
      ...tasks.map((obj) => ({ op: 'put', coll: 'tasks', obj })),
    ]);
  }
}

// ---------------------------------------------------------------- Sign-in

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/email-already-in-use': 'There’s already an account with this email. Sign in instead.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/missing-password': 'Enter a password.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Sign-in needs the internet the first time.',
  'auth/operation-not-allowed': 'Email sign-in isn’t turned on in Firebase yet (see README: Turn on sync).',
};

function showSignIn() {
  unsubscribe?.();
  unsubscribe = null;
  store = null;
  app.innerHTML = `
  <div class="signin">
    <form class="card" id="signin" novalidate>
      <div class="logo"><img src="icons/icon.svg" alt="" width="56" height="56"></div>
      <h1>Planner</h1>
      <p class="hint">Sign in to keep your calendar in step across your devices.</p>
      <label>Email<input type="email" name="email" autocomplete="username" inputmode="email" required></label>
      <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
      <p class="form-error" role="alert" hidden></p>
      <p class="form-note" hidden></p>
      <button class="btn primary wide" type="submit">Sign in</button>
      <button class="btn wide" type="button" data-signup>Create account</button>
      <button class="link" type="button" data-reset>Forgot password?</button>
    </form>
  </div>`;
  const f = $('#signin');
  const err = f.querySelector('.form-error');
  const note = f.querySelector('.form-note');
  const show = (e) => {
    err.textContent = AUTH_ERRORS[e.code] || e.message || String(e);
    err.hidden = false;
    note.hidden = true;
  };
  const creds = () => [f.elements.email.value.trim(), f.elements.password.value];
  const busy = (on) => f.querySelectorAll('button').forEach((b) => (b.disabled = on));
  const attempt = async (fn) => {
    err.hidden = true;
    busy(true);
    try {
      await fn();
    } catch (e) {
      show(e);
    } finally {
      busy(false);
    }
  };
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    attempt(() => cloud.signIn(...creds()));
  });
  f.querySelector('[data-signup]').addEventListener('click', () => {
    f.elements.password.autocomplete = 'new-password';
    attempt(() => cloud.signUp(...creds()));
  });
  f.querySelector('[data-reset]').addEventListener('click', () => {
    const [email] = creds();
    if (!email) return show({ message: 'Enter your email first, then tap “Forgot password?”.' });
    attempt(async () => {
      await cloud.resetPassword(email);
      note.textContent = `If there’s an account for ${email}, a reset link is on its way.`;
      note.hidden = false;
    });
  });
}
