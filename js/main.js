import { backupFile, icsFile, parseBackup, saveFile } from './backup.js';
import { firebaseConfig } from './config.js';
import {
  absMin, addDays, addMonths, dateOf, daysFrom, diffDays, dt, fmt, fmtTime, fmtTimeRange, fromAbsMin, nowMin, parseTime, parts, shiftDays, startOfMonth,
  startOfWeek, timeValue, today,
} from './dates.js';
import { askScope, createMenu, eventEditor, labelsDialog, settingsDialog, taskEditor } from './dialogs.js';
import { icons } from './icons.js';
import { deleteLabelOps, labelUsage, setLabelStatusOps } from './labels.js';
import { expand, spanDays } from './recurrence.js';
import { deleteOps, isRepeating, masterOf, moveOps, saveOps } from './series.js';
import { loadSettings, saveSettings } from './settings.js';
import { localStore, readLocalData } from './store.js';
import { $, esc, readJSON, uid, writeJSON } from './util.js';
import { renderMonth } from './views/month.js';
import { renderAgenda, tasksInView } from './views/agenda.js';
import { renderTimeGrid, renderTwoWeeks } from './views/timegrid.js';

const DAY_MS = 86400000;
const BACKUP_KEY = 'planner.backup.v1'; // { last, snoozeUntil, firstSeen } for this device
const WIDE = 900; // at this width and up, the agenda can sit beside the calendar
const DEADLINE_TIME = 23 * 60 + 59; // a new deadline without a picked time is due at 11:59 PM
const LONG_PRESS_MS = 450; // on touch screens, hold this long to start selecting

const app = $('#app');
let settings = loadSettings();
const state = {
  view: settings.view,
  date: today(),
  events: new Map(),
  tasks: new Map(),
  labels: new Map(),
  pending: false,
  sheetOpen: false, // agenda over the month view on narrow screens
  monthGrid: null, // { from, weeks } once the month view is swiped a week up or down
  showDone: false,
};
let store = null;
let cloud = null;
let unsubscribe = null;
let demo = false; // design preview: sample data, nothing saved
let refreshOpenDialog = null; // redraws an open labels dialog when data changes
let calObserver = null; // redraws the month grid when its space changes

// Display settings are saved per device, except in the design preview.
const persist = () => !demo && saveSettings(settings);
let lastRangeKey = '';
let lastToday = today();

boot();

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  wireEvents();
  // Text widths change once the web font arrives, so cut text is checked again.
  document.fonts?.ready.then(() => store && fitText(app));
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
    state.labels = snap.labels || new Map();
    state.pending = snap.pending;
    render();
    refreshOpenDialog?.();
    if (first && store.kind === 'cloud') setTimeout(offerLocalCopy, 300);
    first = false;
  });
}

// Design preview: ?demo, optionally with &view=day|week|2week|month and
// &show=tasks|event|deadline|new-event|create|delete|task|labels|settings to
// open one part of the UI.
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
    case 'deadline': editEventAt(...s.samples.deadline); break;
    case 'new-event': newEvent(s.samples.newEventDate, 10 * 60, 11 * 60); break;
    case 'create': chooseAndCreate(innerWidth / 2 - 90, 160, { type: 'days', from: s.samples.newEventDate, to: s.samples.newEventDate, at: s.samples.newEventDate }); break;
    case 'delete': askScope('delete'); break;
    case 'task': editTask(s.samples.task); break;
    case 'labels': manageLabels(); break;
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
    <button class="icon-btn tasks-btn" data-action="toggle-tasks" aria-label="Agenda" title="Show or hide the agenda">${icons.tasks}<span class="badge" id="task-badge" hidden></span></button>
    <button class="icon-btn settings-btn" data-action="settings" aria-label="Settings">${icons.settings}<span class="sync-dot" id="sync-dot" hidden></span></button>
    <div class="new-group" role="group" aria-label="New">
      <button class="nb" data-action="new-event" title="New event (N)" aria-label="New event">${icons.event}<span>Event</span></button>
      <button class="nb" data-action="new-deadline" title="New deadline" aria-label="New deadline">${icons.flagBtn}<span>Deadline</span></button>
      <button class="nb" data-action="new-task" title="New task" aria-label="New task">${icons.task}<span>Task</span></button>
    </div>
  </header>
  <div class="main" id="main">
    <section class="cal" id="cal"></section>
    <div class="splitter" id="splitter" role="separator" tabindex="0" aria-label="Resize the agenda" title="Drag to resize · double-click to reset"></div>
    <div class="scrim" data-action="toggle-tasks"></div>
    <aside class="tasks" id="tasks" aria-label="Agenda">
      <div class="tasks-head">
        <div><h2>Agenda</h2><p class="sub" id="tasks-range"></p></div>
        <button class="icon-btn dock-btn" data-action="dock" id="dock-btn"></button>
        <button class="icon-btn tasks-close" data-action="toggle-tasks" aria-label="Hide the agenda" title="Hide the agenda">${icons.close}</button>
      </div>
      <form class="task-add" id="task-add" autocomplete="off">
        <input name="title" placeholder="Add a task" enterkeyhint="done" maxlength="200" aria-label="New task">
        <input type="date" name="due" aria-label="Due date">
        <button class="icon-btn add" aria-label="Add task">${icons.plus}</button>
      </form>
      <div class="tasks-list" id="task-list"></div>
    </aside>
  </div>
  <div class="banner" id="banner" hidden></div>`;
  calObserver?.disconnect();
  calObserver?.observe($('#cal'));
}

// The month view is a grid of days; the others are timelines.
const isGrid = () => state.view === 'month';

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
      if (state.monthGrid) {
        // Swiped by weeks: the month is the one in the middle row.
        const { from: gridFrom, weeks } = state.monthGrid;
        const s = startOfMonth(addDays(gridFrom, Math.floor(weeks / 2) * 7 + 3));
        return { from: s, to: addMonths(s, 1), gridFrom, gridTo: addDays(gridFrom, weeks * 7), weeks };
      }
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

const tasksIn = (from, to) => [...state.tasks.values()].filter((x) => x.due && x.due >= from && x.due < to);

function render() {
  if (!store) return;
  const r = viewRange();
  const key = `${state.view}|${r.gridFrom || r.from}|${settings.weekStart}`;
  const rangeChanged = key !== lastRangeKey;
  lastRangeKey = key;
  $('#range-title').textContent = rangeTitle(r);
  fitText($('.title-wrap'));
  $('#jump').value = state.date;
  app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
  applyLayout();
  const occs = occurrencesIn(isGrid() ? r.gridFrom : r.from, isGrid() ? r.gridTo : r.to);
  renderCalendar(r, rangeChanged, occs);
  renderTasks(r, rangeChanged, isGrid() ? undefined : occs);
  const dot = $('#sync-dot');
  dot.hidden = !(store.kind === 'cloud' && (state.pending || !navigator.onLine));
  dot.title = navigator.onLine ? 'Syncing…' : 'Offline — changes will sync later';
  updateBanner();
}

function renderCalendar(r, rangeChanged, occs) {
  drawCalendar(r, rangeChanged, occs);
  fitText($('#cal'));
}

// Text that doesn't fit is cut where the box ends rather than shortened with
// "…", and fades out toward its end, so the last letters still show. One-line
// texts fade at the right; titles of several lines fade along their last line.
const ONE_LINE = '.ev.short .ev-t, .bar-t, .ct, .tk-t, .mtt, .range-title';
function fitText(root) {
  if (!root) return;
  for (const el of root.querySelectorAll('.ev:not(.short) .ev-t')) {
    el.style.maxHeight = '';
    // A word too long for a narrow box fades at the right edge; text with
    // more lines than fit fades along its last line.
    const wide = el.scrollWidth > el.clientWidth + 1;
    const tall = el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle('fade', wide);
    el.classList.toggle('fade-last', tall && !wide);
    if (!tall) continue;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 15;
    const lines = Math.max(1, Math.floor((el.clientHeight + 1) / lh));
    el.style.maxHeight = `${lines * lh}px`;
    el.style.setProperty('--lh', `${lh}px`);
  }
  for (const el of root.querySelectorAll(ONE_LINE)) el.classList.toggle('fade', el.scrollWidth > el.clientWidth + 1);
}

function drawCalendar(r, rangeChanged, occs) {
  const cal = $('#cal');
  const old = cal.querySelector('.tg');
  const prev = old ? { top: old.scrollTop, left: old.scrollLeft } : null;

  if (isGrid()) {
    // How many item rows fit under the date in each cell.
    const phone = innerWidth <= 760;
    const cellH = ((cal.clientHeight || 600) - 28) / r.weeks;
    const rows = Math.max(1, Math.floor((cellH - (phone ? 29 : 30)) / (phone ? 17 : 19)));
    cal.innerHTML = renderMonth({
      range: r, occs: occs || occurrencesIn(r.gridFrom, r.gridTo), tasks: tasksIn(r.gridFrom, r.gridTo), labels: state.labels, settings, rows,
    });
    return;
  }
  if (state.view === '2week') {
    cal.innerHTML = renderTwoWeeks({ days: r.days, occs: occs || occurrencesIn(r.from, r.to), tasks: tasksIn(r.from, r.to), labels: state.labels, settings });
    return;
  }

  // The whole day fits the space, so the timeline never scrolls up and down.
  const headH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 52;
  cal.innerHTML = renderTimeGrid({
    days: r.days, occs: occs || occurrencesIn(r.from, r.to), tasks: tasksIn(r.from, r.to), labels: state.labels, settings, fitHeight: cal.clientHeight, headH,
  });
  const tg = cal.querySelector('.tg');
  if (prev && !tg.classList.contains('fit')) tg.scrollTop = prev.top;
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

function renderTasks(r, rangeChanged, occs = occurrencesIn(r.from, r.to)) {
  $('#tasks-range').textContent =
    state.view === 'month' ? fmt(r.from, { month: 'long', year: 'numeric' })
      : state.view === 'day' ? fmt(r.from, { weekday: 'long', month: 'short', day: 'numeric' })
        : spanLabel(r.from, addDays(r.to, -1));
  $('#task-list').innerHTML = renderAgenda({
    from: r.from, to: r.to, occs, tasks: state.tasks, events: state.events, labels: state.labels, h24: settings.h24, showDone: state.showDone,
  });
  // New tasks default to today if it's on screen, else the picked day.
  const due = $('#task-add').elements.due;
  if (rangeChanged && document.activeElement !== due) due.value = defaultDay(r);
  const n = tasksInView(state.tasks, r.from, r.to).filter((x) => !x.done).length;
  const badge = $('#task-badge');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : n;
}

// Today if it's on screen, else the picked day, else the first day shown.
function defaultDay(r = viewRange()) {
  const inView = (d) => d >= r.from && d < r.to;
  return inView(today()) ? today() : inView(state.date) ? state.date : r.from;
}

// ---------------------------------------------------------------- Writes

// Applies writes and, for deletes, offers to undo them. Resolves when saved.
function commit(ops, undoLabel) {
  if (!ops.length) return Promise.resolve();
  const seen = new Set();
  const undo = [];
  for (const o of ops) {
    const id = o.op === 'put' ? o.obj.id : o.id;
    if (seen.has(o.coll + id)) continue;
    seen.add(o.coll + id);
    const prev = state[o.coll].get(id);
    undo.push(prev ? { op: 'put', coll: o.coll, obj: prev } : { op: 'remove', coll: o.coll, id });
  }
  return Promise.resolve()
    .then(() => store.apply(ops))
    .then(() => undoLabel && toast(undoLabel, () => store.apply(undo)))
    .catch((err) => {
      console.error(err);
      toast(`Couldn’t save: ${err.message || err}`);
    });
}

const editorOptions = () => ({ settings, labels: () => state.labels, manageLabels });

async function openNewEvent(over) {
  const initial = { kind: 'event', title: '', notes: '', color: 'blue', labelId: null, shape: 'block', tentative: false, allDay: false, rrule: null, ...over };
  const res = await eventEditor({ initial, isNew: true, repeating: false, ...editorOptions() });
  if (res?.action === 'save') commit(saveOps(state.events, null, null, res.form, null));
}

// A new timed event on `date`; without times, the next whole hour today or
// 9 AM (or when the day view starts) on other days.
function newEvent(date, startMin, endMin) {
  if (startMin == null) {
    startMin = date === today() ? Math.min(Math.ceil((nowMin() + 1) / 60) * 60, 23 * 60) : Math.max(settings.dayStart * 60, 9 * 60);
    endMin = startMin + 60;
  }
  return openNewEvent({ start: dt(date, startMin), end: dt(date, endMin ?? startMin + 60) });
}

function newDeadline(date, min = DEADLINE_TIME) {
  const at = dt(date, min);
  return openNewEvent({ kind: 'deadline', start: at, end: at });
}

async function newTask(due, dueMin = null) {
  const now = Date.now();
  // Past midnight (the day can run to 2 AM) is the next morning.
  if (due && dueMin >= 1440) {
    due = addDays(due, Math.floor(dueMin / 1440));
    dueMin %= 1440;
  }
  const task = { id: uid(), title: '', notes: '', due: due || null, dueTime: due && dueMin != null ? timeValue(dueMin) : null, labelId: null, color: null, done: false, doneAt: null, createdAt: now, updatedAt: now };
  const res = await taskEditor(task, { isNew: true, ...editorOptions() });
  if (res?.action === 'save') commit([{ op: 'put', coll: 'tasks', obj: { ...task, ...res.fields, doneAt: res.fields.done ? now : null } }]);
}

async function editEventAt(id, date) {
  const ev = state.events.get(id);
  if (!ev) return;
  const master = masterOf(state.events, ev);
  // The editor shows this occurrence's own date and times.
  const k = diffDays(dateOf(ev.start), date);
  const initial = { ...ev, start: shiftDays(ev.start, k), end: shiftDays(ev.end, k), rrule: ev.rrule || master?.rrule || null };
  const res = await eventEditor({ initial, isNew: false, repeating: isRepeating(state.events, ev), ...editorOptions() });
  if (!res) return;
  const what = ev.kind === 'deadline' ? 'Deadline' : 'Event';
  if (res.action === 'save') commit(saveOps(state.events, ev, date, res.form, res.scope));
  else commit(deleteOps(state.events, ev, date, res.scope), res.scope && res.scope !== 'this' ? `${what}s deleted` : `${what} deleted`);
}

function addTask(title, due) {
  const now = Date.now();
  commit([{ op: 'put', coll: 'tasks', obj: { id: uid(), title, notes: '', due: due || null, dueTime: null, labelId: null, color: null, done: false, doneAt: null, createdAt: now, updatedAt: now } }]);
}

function toggleTask(id, done) {
  const t = state.tasks.get(id);
  if (t) commit([{ op: 'put', coll: 'tasks', obj: { ...t, done, doneAt: done ? Date.now() : null, updatedAt: Date.now() } }]);
}

async function editTask(id) {
  const t = state.tasks.get(id);
  if (!t) return;
  const res = await taskEditor(t, editorOptions());
  if (res?.action === 'save') {
    const doneAt = res.fields.done ? t.doneAt || Date.now() : null;
    commit([{ op: 'put', coll: 'tasks', obj: { ...t, ...res.fields, doneAt, updatedAt: Date.now() } }]);
  } else if (res?.action === 'delete') commit([{ op: 'remove', coll: 'tasks', id }], 'Task deleted');
}

// ---------------------------------------------------------------- Labels

function manageLabels() {
  return labelsDialog({
    getLabels: () => state.labels,
    usage: (id) => labelUsage(id, state.events, state.tasks),
    act: labelAction,
    bindRefresh: (fn) => (refreshOpenDialog = fn),
  }).finally(() => (refreshOpenDialog = null));
}

function labelAction(type, p) {
  const now = Date.now();
  const label = state.labels.get(p.id);
  switch (type) {
    case 'add':
      return commit([{ op: 'put', coll: 'labels', obj: { id: uid(), name: p.name, color: p.color, status: 'active', createdAt: now, updatedAt: now } }]);
    case 'update':
      return commit([{ op: 'put', coll: 'labels', obj: { ...label, name: p.name, color: p.color, updatedAt: now } }]);
    case 'status':
      return commit(setLabelStatusOps(label, p.status));
    case 'delete':
      return commit(deleteLabelOps(p.id, state.events, state.tasks), `Deleted “${label.name}” and its items`);
  }
  return Promise.resolve();
}

// ---------------------------------------------------------------- Navigation

function move(dir) {
  const v = state.view;
  // A month view swiped by weeks moves on from the month it shows.
  const base = v === 'month' && state.monthGrid ? viewRange().from : state.date;
  state.monthGrid = null;
  state.date = v === 'day' ? addDays(base, dir)
    : v === 'week' ? addDays(base, 7 * dir)
      : v === '2week' ? addDays(base, 14 * dir)
        : addMonths(base, dir);
  render();
  slide(v === 'month' || v === '2week' ? (dir > 0 ? 'up' : 'down') : dir > 0 ? 'left' : 'right');
}

// The 2-week and month views move a week at a time when swiped.
function shiftWeek(dir) {
  if (state.view === 'month') {
    const r = viewRange();
    state.monthGrid = { from: addDays(r.gridFrom, 7 * dir), weeks: r.weeks };
  }
  state.date = addDays(state.date, 7 * dir);
  render();
  slide(dir > 0 ? 'up' : 'down');
}

// The new dates slide in from the side they came from (fade in, with Reduce
// Motion on).
function slide(dir) {
  $('#cal')?.firstElementChild?.classList.add(`slide-${dir}`);
}

// Going straight to a date shows its whole month again.
function goTo(date) {
  state.date = date;
  state.monthGrid = null;
}

function setView(view) {
  state.monthGrid = null;
  state.view = view;
  settings.view = view;
  persist();
  render();
}

// Where the agenda goes: at the right or the bottom on a PC (your choice), at
// the bottom on a phone, or as a sheet over the month view on a phone.
function layoutMode() {
  if (innerWidth >= WIDE) return settings.panelDock === 'bottom' ? 'bottom' : 'right';
  return isGrid() ? 'sheet' : 'bottom';
}

function applyLayout() {
  const mode = layoutMode();
  const wide = innerWidth >= WIDE;
  for (const m of ['right', 'bottom', 'sheet']) app.classList.toggle(`lay-${m}`, mode === m);
  app.classList.toggle('panel-hidden', mode !== 'sheet' && !!(wide ? settings.hideTasks : settings.hideSplit));
  app.classList.toggle('sheet-open', mode === 'sheet' && state.sheetOpen);
  const main = $('#main');
  settings.panelW = Math.round(Math.min(Math.max(settings.panelW, 240), Math.max(240, innerWidth * 0.6)));
  main.style.setProperty('--panel-w', `${settings.panelW}px`);
  main.style.setProperty('--panel-h', `${Math.round((wide ? settings.panelH : settings.splitH) * 1000) / 10}%`);
  const dock = $('#dock-btn');
  const toBottom = settings.panelDock !== 'bottom';
  dock.innerHTML = toBottom ? icons.dockBottom : icons.dockRight;
  dock.setAttribute('aria-label', toBottom ? 'Move the agenda to the bottom' : 'Move the agenda to the right');
  dock.title = dock.getAttribute('aria-label');
  return mode;
}

function toggleTasks() {
  const mode = layoutMode();
  if (mode === 'sheet') state.sheetOpen = !state.sheetOpen;
  else if (innerWidth >= WIDE) settings.hideTasks = !settings.hideTasks;
  else settings.hideSplit = !settings.hideSplit;
  persist();
  render();
}

function toggleDock() {
  settings.panelDock = settings.panelDock === 'bottom' ? 'right' : 'bottom';
  settings.hideTasks = false;
  persist();
  render();
}

// Keeps getting the pointer's moves while it's dragged outside the element.
function capture(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The pointer is already gone; nothing to follow.
  }
}

// Dragging the bar between the calendar and the agenda resizes the agenda.
function wireSplitter() {
  let drag = null;
  const size = (e) => {
    const r = drag.main;
    if (drag.mode === 'right') settings.panelW = Math.round(Math.min(Math.max(r.right - e.clientX, 240), r.width * 0.6));
    else {
      const share = Math.min(Math.max((r.bottom - e.clientY) / r.height, 0.2), 0.8);
      if (innerWidth >= WIDE) settings.panelH = share;
      else settings.splitH = share;
    }
    applyLayout();
  };
  app.addEventListener('pointerdown', (e) => {
    const bar = e.target.closest('#splitter');
    if (!bar || e.button !== 0) return;
    drag = { main: $('#main').getBoundingClientRect(), mode: layoutMode() };
    capture(bar, e.pointerId);
    bar.classList.add('dragging');
    e.preventDefault();
  });
  app.addEventListener('pointermove', (e) => drag && size(e));
  const end = () => {
    if (!drag) return;
    drag = null;
    $('#splitter')?.classList.remove('dragging');
    persist();
  };
  app.addEventListener('pointerup', end);
  app.addEventListener('pointercancel', end);
  app.addEventListener('dblclick', (e) => {
    if (!e.target.closest('#splitter')) return;
    if (layoutMode() === 'right') settings.panelW = 320;
    else if (innerWidth >= WIDE) settings.panelH = 0.4;
    else settings.splitH = 0.5;
    persist();
    applyLayout();
  });
  app.addEventListener('keydown', (e) => {
    if (!e.target.closest('#splitter')) return;
    const mode = layoutMode();
    const grow = { right: { ArrowLeft: 1, ArrowRight: -1 }, bottom: { ArrowUp: 1, ArrowDown: -1 } }[mode]?.[e.key];
    if (!grow) return;
    e.preventDefault();
    if (mode === 'right') settings.panelW += grow * 20;
    else if (innerWidth >= WIDE) settings.panelH = Math.min(0.8, Math.max(0.2, settings.panelH + grow * 0.05));
    else settings.splitH = Math.min(0.8, Math.max(0.2, settings.splitH + grow * 0.05));
    persist();
    applyLayout();
  });
}

const actions = {
  today: () => {
    goTo(today());
    render();
  },
  prev: () => move(-1),
  next: () => move(1),
  'toggle-tasks': toggleTasks,
  dock: toggleDock,
  'new-event': () => newEvent(state.date),
  'new-deadline': () => newDeadline(defaultDay()),
  'new-task': () => newTask(defaultDay()),
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

// ---------------------------------------------------------------- Creating by clicking or dragging

// Clicking or dragging on the calendar selects a time range in one day column
// (day and week views) or a run of days (month and 2-week cells, and the
// all-day row), then asks what to make there. With a mouse, dragging starts
// right away. On touch screens a drag scrolls as usual; hold for a moment
// first to select instead, and a quick tap selects an hour.

let sel = null; // { type: 'time', col, date, start, end } or { type: 'days', anchor, from, to, at }
let mouseDown = false;
let press = null; // a touch that may become a selection

const ITEMS = '.ev, .dl, .tchip, .bar, .chip, .mchip, [data-goto], input, button, a';
const surfaceAt = (target) => (target.closest(ITEMS) ? null : target.closest('.tg-col, .tw-col, .mv-cell, .ad-day'));
const isTimeColumn = (el) => el.classList.contains('tg-col') || el.classList.contains('tw-col');

// The time at height y in a day column (whose top is the day's first hour
// and bottom its last).
function minuteAt(col, y) {
  const r = col.getBoundingClientRect();
  const H0 = settings.dayStart * 60;
  const H1 = settings.dayEnd * 60;
  return Math.min(H1, Math.max(H0, H0 + ((y - r.top) / r.height) * (H1 - H0)));
}

// The range shown, on 15-minute steps, at least 15 minutes long.
function drawGhost(s) {
  const a = Math.floor(Math.min(s.start, s.end) / 15) * 15;
  const b = Math.max(a + 15, Math.ceil(Math.max(s.start, s.end) / 15) * 15);
  if (!s.ghost) {
    s.ghost = document.createElement('div');
    s.ghost.className = 'ghost';
    s.col.append(s.ghost);
  }
  const span = (settings.dayEnd - settings.dayStart) * 60;
  s.ghost.style.top = `${((a - settings.dayStart * 60) / span) * 100}%`;
  s.ghost.style.height = `${((b - a) / span) * 100}%`;
  return [a, b];
}

// The day cell under a point, among cells like `like` (same kind of cell).
function dayAt(like, x, y) {
  const strip = like.classList.contains('ad-day');
  // In an all-day row, only that row's days, by x alone.
  for (const c of (strip ? like.parentNode : app).querySelectorAll(strip ? '.ad-day' : '.mv-cell')) {
    const r = c.getBoundingClientRect();
    if (x >= r.left && x < r.right && (strip || (y >= r.top && y < r.bottom))) return c;
  }
  return null;
}

function markDays() {
  app.querySelectorAll('.mv-cell, .ad-day').forEach((c) => c.classList.toggle('sel', !!sel && sel.type === 'days' && c.dataset.date >= sel.from && c.dataset.date <= sel.to));
}

function beginSelection(surface, x, y) {
  if (isTimeColumn(surface)) {
    const m = minuteAt(surface, y);
    sel = { type: 'time', col: surface, date: surface.dataset.date, start: m, end: m, moved: false, x, y };
  } else {
    const d = surface.dataset.date;
    sel = { type: 'days', cell: surface, anchor: d, from: d, to: d, at: d, moved: false, x, y };
    markDays();
  }
}

function extendSelection(x, y) {
  if (!sel) return;
  if (Math.abs(x - sel.x) > 6 || Math.abs(y - sel.y) > 6) sel.moved = true;
  if (!sel.moved) return;
  if (sel.type === 'time') {
    sel.end = minuteAt(sel.col, y);
    drawGhost(sel);
  } else {
    const d = dayAt(sel.cell, x, y)?.dataset.date;
    if (!d) return;
    sel.at = d;
    [sel.from, sel.to] = d < sel.anchor ? [d, sel.anchor] : [sel.anchor, d];
    markDays();
  }
}

function clearSelection() {
  sel?.ghost?.remove();
  sel = null;
  markDays();
  stopAutoScroll();
}

// Keeps a drag on the day/week timeline going past its top or bottom edge:
// scrolls, then calls `then` with the pointer again.
let scrollTimer = 0;
let lastPoint = null;
let onScroll = null;
function autoScroll(x, y, then) {
  lastPoint = [x, y];
  onScroll = then;
  if (scrollTimer) return;
  const step = () => {
    scrollTimer = 0;
    const tg = $('.tg');
    if (!tg || !onScroll || tg.classList.contains('fit')) return;
    const [px, py] = lastPoint;
    const top = tg.querySelector('.tg-allday').getBoundingClientRect().bottom;
    const bottom = tg.getBoundingClientRect().bottom;
    const dy = py < top + 28 ? -10 : py > bottom - 28 ? 10 : 0;
    if (!dy) return;
    tg.scrollTop += dy;
    onScroll(px, py);
    scrollTimer = requestAnimationFrame(step);
  };
  scrollTimer = requestAnimationFrame(step);
}
const followSelection = (x, y) => sel?.type === 'time' && sel.col.closest('.tg') && autoScroll(x, y, extendSelection);
function stopAutoScroll() {
  cancelAnimationFrame(scrollTimer);
  scrollTimer = 0;
}

async function finishSelection(x, y) {
  stopAutoScroll();
  const s = sel;
  if (!s) return;
  if (s.type === 'time' && !s.moved) {
    // A click (or tap) selects the hour from the half hour before.
    s.start = Math.floor(s.start / 30) * 30;
    s.end = Math.min(s.start + 60, settings.dayEnd * 60);
    s.end = Math.max(s.end, s.start + 15);
  }
  await chooseAndCreate(x, y, s);
}

// Asks what to make for selection `s`, then opens that editor. A deadline or
// task goes where the pointer was let go.
async function chooseAndCreate(x, y, s) {
  sel = s;
  let heading;
  let make;
  let when = '';
  if (s.type === 'time') {
    const [a, b] = drawGhost(s);
    const at = s.moved ? Math.round(Math.min(Math.max(s.end, settings.dayStart * 60), settings.dayEnd * 60 - 1) / 15) * 15 : a;
    heading = `${fmt(s.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTimeRange(a, b, settings.h24)}`;
    make = {
      event: () => newEvent(s.date, a, b),
      deadline: () => newDeadline(s.date, at),
      task: () => newTask(s.date, at),
    };
    when = fmtTime(at, settings.h24);
  } else {
    markDays();
    const one = s.from === s.to;
    heading = one ? fmt(s.from, { weekday: 'short', month: 'short', day: 'numeric' }) : spanLabel(s.from, s.to);
    make = {
      event: () => openNewEvent({ allDay: true, start: s.from, end: s.to }),
      deadline: () => newDeadline(s.at),
      task: () => newTask(s.at),
    };
  }
  const atDay = s.type === 'days' && s.from !== s.to ? ` · ${fmt(s.at, { month: 'short', day: 'numeric' })}` : '';
  const choice = await createMenu({
    x,
    y,
    heading,
    choices: [
      ['event', icons.event, s.type === 'days' ? 'All-day event' : 'Event'],
      ['deadline', icons.flagBtn, `Deadline${s.type === 'time' ? ` · ${when}` : atDay}`],
      ['task', icons.task, `Task${s.type === 'time' ? ` · ${when}` : atDay}`],
    ],
  });
  clearSelection();
  if (choice) make[choice]();
}

// ---------------------------------------------------------------- Moving by dragging

// Drag an event, deadline or task to another time or day. On the timelines
// it moves in 15-minute steps and between days; bars, month chips and
// date-only items move by whole days. With a mouse the move starts once the
// pointer travels a little; on a touch screen, hold the item for a moment
// first (a quick swipe still scrolls). A plain click or tap still opens it.

const MOVABLE = '.ev, .dl, .tchip, .bar, .mchip';
const TIME_COLS = '.tg-col, .tw-col';
let mv = null; // the item being moved
let suppressClickUntil = 0;

const snap15 = (m) => Math.round(m / 15) * 15;
const contains = (el, x, y) => {
  const r = el.getBoundingClientRect();
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
};

// The day cell, all-day row day or day column under a point, among elements
// like the one the move started from.
function dropTarget(m, x, y) {
  const list = [...app.querySelectorAll(m.targets)];
  return list.find((c) => contains(c, x, y))
    // In an all-day row or a column, going above or below it still counts.
    || (m.targets !== '.mv-cell' ? list.find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x < r.right && c.parentNode === m.home;
    }) : null);
}

function beginMove(el, x, y) {
  const kind = el.dataset.task ? 'task' : 'event';
  const item = kind === 'task' ? state.tasks.get(el.dataset.task) : state.events.get(el.dataset.id);
  if (!item) return null;
  const date = el.dataset.date || item.due;
  const col = el.closest(TIME_COLS);
  const timed = col && (kind === 'task' ? !!item.dueTime : !item.allDay);
  const m = { el, kind, item, date };
  if (timed) {
    m.mode = 'time';
    const k = kind === 'event' ? diffDays(dateOf(item.start), date) : 0;
    const start = kind === 'task' ? dt(item.due, parseTime(item.dueTime)) : shiftDays(item.start, k);
    m.startAbs = absMin(start);
    m.dur = kind === 'task' || item.kind === 'deadline' ? 0 : absMin(shiftDays(item.end, k)) - m.startAbs;
    m.offset = absMin(col.dataset.date) + minuteAt(col, y) - m.startAbs;
    m.targets = TIME_COLS;
    m.newStart = m.startAbs;
  } else {
    m.mode = 'day';
    m.targets = el.closest('.mv-week') ? '.mv-cell' : col ? TIME_COLS : '.ad-day';
    const from = [...app.querySelectorAll(m.targets)].find((c) => contains(c, x, y)) || el.closest(TIME_COLS);
    m.home = from?.parentNode;
    m.fromDay = from?.dataset.date || date;
    m.span = kind === 'event' && item.kind !== 'deadline' ? spanDays(item) : 0;
    m.days = 0;
  }
  el.classList.add('moving');
  navigator.vibrate?.(10);
  return m;
}

function updateMove(x, y) {
  const m = mv;
  if (!m) return;
  const target = dropTarget(m, x, y);
  if (m.mode === 'time') {
    if (!target) return;
    const span = (settings.dayEnd - settings.dayStart) * 60;
    const base = absMin(target.dataset.date) + settings.dayStart * 60;
    m.newStart = snap15(base + (minuteAt(target, y) - settings.dayStart * 60) - m.offset);
    if (!m.ghost || m.ghost.parentNode !== target) {
      m.ghost?.remove();
      m.ghost = document.createElement('div');
      m.ghost.className = `ghost move${m.dur ? '' : ' line'}`;
      target.append(m.ghost);
    }
    const top = Math.min(Math.max(m.newStart - base, 0), span);
    m.ghost.style.top = `${(top / span) * 100}%`;
    m.ghost.style.height = m.dur ? `${(Math.min(m.dur, span - top) / span) * 100}%` : '';
    const t = m.newStart - absMin(target.dataset.date);
    m.ghost.textContent = fmtTime(t, settings.h24);
    if (target.closest('.tg')) autoScroll(x, y, updateMove);
  } else {
    if (target) m.days = diffDays(m.fromDay, target.dataset.date);
    const first = addDays(m.date, m.days);
    const last = addDays(first, m.span);
    app.querySelectorAll(m.targets).forEach((c) => c.classList.toggle('drop', c.dataset.date >= first && c.dataset.date <= last));
  }
}

function endMove(drop) {
  const m = mv;
  mv = null;
  if (!m) return;
  stopAutoScroll();
  m.ghost?.remove();
  m.el.classList.remove('moving');
  app.querySelectorAll('.drop').forEach((c) => c.classList.remove('drop'));
  suppressClickUntil = Date.now() + 400;
  if (!drop) return;
  const minutes = m.mode === 'time' ? m.newStart - m.startAbs : m.days * 1440;
  if (minutes) applyMove(m, minutes);
}

async function applyMove(m, minutes) {
  if (m.kind === 'task') {
    const t = m.item;
    let { due, dueTime } = t;
    if (dueTime) {
      const at = fromAbsMin(absMin(dt(due, parseTime(dueTime))) + minutes);
      due = dateOf(at);
      dueTime = at.slice(11);
    } else due = addDays(due, Math.round(minutes / 1440));
    return commit([{ op: 'put', coll: 'tasks', obj: { ...t, due, dueTime, updatedAt: Date.now() } }], 'Task moved');
  }
  const ev = m.item;
  let scope = null;
  if (isRepeating(state.events, ev)) {
    scope = await askScope('save');
    if (!scope) return;
  }
  return commit(moveOps(state.events, ev, m.date, minutes, scope), `${ev.kind === 'deadline' ? 'Deadline' : 'Event'} moved`);
}

function wireMoves() {
  let down = null; // a mouse press on an item that may become a move
  app.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || sel || mv) return;
    const el = e.target.closest(MOVABLE);
    if (!el || e.target.closest('input')) return;
    down = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  app.addEventListener('pointermove', (e) => {
    if (down && !mv && (Math.abs(e.clientX - down.x) > 5 || Math.abs(e.clientY - down.y) > 5)) {
      mv = beginMove(down.el, down.x, down.y);
      if (mv) capture(down.el, down.id);
    }
    if (mv && down) updateMove(e.clientX, e.clientY);
  });
  const up = (drop) => () => {
    down = null;
    if (mv) endMove(drop);
  };
  app.addEventListener('pointerup', up(true));
  app.addEventListener('pointercancel', up(false));
  // After a move, the click that follows doesn't open the item.
  app.addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

// ---------------------------------------------------------------- Swiping

// On touch screens, a quick swipe on the calendar: left or right for the next
// or previous day or week (day and week views), up or down for a week later
// or earlier (2-week and month views). Scrolling, and holding to select or
// move, still work as before.
let gestureUsed = false; // the touch became a selection or a move

// The calendar follows the finger while swiping; let go past a quarter of the
// way (or with a quick flick) and it carries on out while the next dates
// slide in, otherwise it springs back.
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function wireSwipes() {
  let sw = null;
  let busy = false; // a swipe is still finishing its animation
  const reset = (el) => {
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
  };
  const springBack = (s) => {
    s.el.style.transition = `transform 0.3s ${EASE_OUT}`;
    s.el.style.transform = '';
    setTimeout(() => s.el.isConnected && reset(s.el), 320);
  };
  app.addEventListener('touchstart', (e) => {
    sw = null;
    gestureUsed = false;
    if (busy || e.touches.length !== 1 || !e.target.closest('#cal')) return;
    const t = e.touches[0];
    const axis = state.view === 'day' || state.view === 'week' ? 'x' : 'y';
    sw = { x: t.clientX, y: t.clientY, t: Date.now(), d: 0, axis, on: false, el: $('#cal').firstElementChild };
  }, { passive: true });
  app.addEventListener('touchmove', (e) => {
    if (!sw) return;
    if (e.touches.length !== 1 || gestureUsed || sel || mv) {
      if (sw.on) springBack(sw);
      sw = null;
      return;
    }
    const dx = e.touches[0].clientX - sw.x;
    const dy = e.touches[0].clientY - sw.y;
    if (!sw.on) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      // Only a swipe along the view's own direction moves it.
      if ((Math.abs(dx) > Math.abs(dy) ? 'x' : 'y') !== sw.axis) {
        sw = null;
        return;
      }
      sw.on = true;
      sw.el.style.transition = 'none';
      sw.el.style.willChange = 'transform';
    }
    sw.d = sw.axis === 'x' ? dx : dy;
    sw.el.style.transform = `translate${sw.axis.toUpperCase()}(${sw.d}px)`;
  }, { passive: true });
  app.addEventListener('touchend', () => {
    const s = sw;
    sw = null;
    if (!s?.on) return;
    const size = s.axis === 'x' ? s.el.clientWidth : s.el.clientHeight;
    const speed = Math.abs(s.d) / Math.max(1, Date.now() - s.t); // px per ms
    if (Math.abs(s.d) < size * 0.25 && !(speed > 0.4 && Math.abs(s.d) > 30)) return springBack(s);
    const dir = s.d < 0 ? 1 : -1;
    const go = () => (s.axis === 'x' ? move(dir) : shiftWeek(dir));
    // With Reduce Motion on, the old dates fade out where they are instead.
    const still = reducedMotion();
    busy = true;
    s.el.style.transition = still ? 'opacity 0.12s ease-in' : 'transform 0.14s ease-in, opacity 0.14s ease-in';
    if (!still) s.el.style.transform = `translate${s.axis.toUpperCase()}(${-dir * size * 0.45}px)`;
    s.el.style.opacity = '0';
    setTimeout(() => {
      busy = false;
      go();
    }, still ? 120 : 140);
  });
  app.addEventListener('touchcancel', () => {
    if (sw?.on) springBack(sw);
    sw = null;
  });
}

function wireGestures() {
  wireMoves();
  wireSwipes();
  // Mouse and pen: press, drag, let go.
  app.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || sel || mv) return;
    const surface = surfaceAt(e.target);
    if (!surface) return;
    beginSelection(surface, e.clientX, e.clientY);
    mouseDown = true;
    capture(surface, e.pointerId);
    e.preventDefault();
  });
  app.addEventListener('pointermove', (e) => {
    if (!mouseDown) return;
    extendSelection(e.clientX, e.clientY);
    followSelection(e.clientX, e.clientY);
  });
  app.addEventListener('pointerup', (e) => {
    if (!mouseDown) return;
    mouseDown = false;
    finishSelection(e.clientX, e.clientY);
  });
  app.addEventListener('pointercancel', () => {
    if (!mouseDown) return;
    mouseDown = false;
    clearSelection();
  });

  // Touch: tap, or hold and then drag. Moving before the hold is up scrolls.
  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  app.addEventListener('touchstart', (e) => {
    cancelPress();
    if (e.touches.length !== 1 || sel || mv) return;
    const t = e.touches[0];
    const item = e.target.closest(MOVABLE);
    if (item && !e.target.closest('input')) {
      // Hold an item to pick it up; a tap still opens it.
      const p = { item, x: t.clientX, y: t.clientY, active: false };
      p.timer = setTimeout(() => {
        mv = beginMove(item, p.x, p.y);
        p.active = !!mv;
        gestureUsed = p.active;
      }, LONG_PRESS_MS);
      press = p;
      return;
    }
    const surface = surfaceAt(e.target);
    if (!surface) return;
    const p = { surface, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, t: Date.now(), active: false };
    p.timer = setTimeout(() => {
      p.active = true;
      gestureUsed = true;
      beginSelection(surface, p.x, p.y);
      sel.moved = true; // a held finger selects from where it is
      if (sel.type === 'time') {
        sel.end = sel.start + 15;
        drawGhost(sel);
      }
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
    press = p;
  }, { passive: true });
  app.addEventListener('touchmove', (e) => {
    if (!press) return;
    const t = e.touches[0];
    if (!press.active) {
      if (Math.abs(t.clientX - press.x) > 8 || Math.abs(t.clientY - press.y) > 8) cancelPress(); // it's a scroll
      return;
    }
    e.preventDefault(); // keep the page still while selecting or moving
    press.lx = t.clientX;
    press.ly = t.clientY;
    if (press.item) return updateMove(t.clientX, t.clientY);
    extendSelection(t.clientX, t.clientY);
    followSelection(t.clientX, t.clientY);
  }, { passive: false });
  app.addEventListener('touchend', (e) => {
    const p = press;
    cancelPress();
    if (!p) return;
    if (p.item) {
      if (p.active) {
        e.preventDefault(); // no click afterwards
        endMove(true);
      }
      return;
    }
    if (p.active) {
      e.preventDefault(); // no click afterwards
      finishSelection(p.lx, p.ly);
    } else if (Date.now() - p.t < LONG_PRESS_MS) {
      e.preventDefault();
      beginSelection(p.surface, p.x, p.y);
      finishSelection(p.x, p.y);
    }
  }, { passive: false });
  app.addEventListener('touchcancel', () => {
    const p = press;
    cancelPress();
    if (p?.item && p.active) endMove(false);
    else if (p?.active) clearSelection();
  });
  // A long press would otherwise bring up the browser's menu.
  app.addEventListener('contextmenu', (e) => {
    if (press || sel || mv || surfaceAt(e.target)) e.preventDefault();
  });
}

// ---------------------------------------------------------------- Input

function wireEvents() {
  app.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-toggle]')) return; // ticking a task off is handled on change
    const act = t.closest('[data-action]');
    if (act) return actions[act.dataset.action]?.();
    const view = t.closest('[data-view]');
    if (view) return setView(view.dataset.view);
    const ev = t.closest('[data-id][data-date]');
    if (ev) return editEventAt(ev.dataset.id, ev.dataset.date);
    const task = t.closest('[data-task], [data-edit-task]');
    if (task) return editTask(task.dataset.task || task.dataset.editTask);
    const go = t.closest('[data-goto]');
    if (go) {
      goTo(go.dataset.goto);
      return setView('day');
    }
    if (t.id === 'jump') openDatePicker();
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.toggle) toggleTask(t.dataset.toggle, t.checked);
    else if (t.id === 'jump' && t.value) {
      goTo(t.value);
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

  wireGestures();
  wireSplitter();

  document.addEventListener('keydown', (e) => {
    if (!store || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open], .cm-scrim')) return;
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

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => store && !sel && render(), 150);
  });
  // The month grid fits as many items as there's room for, so it's redrawn
  // when its space changes (window size, or the agenda being resized).
  let lastCal = '';
  let calTimer;
  calObserver = new ResizeObserver(([entry]) => {
    const key = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
    if (key === lastCal) return;
    lastCal = key;
    clearTimeout(calTimer);
    // The month grid and the day and week timelines fit their space, so
    // they're redrawn when it changes.
    calTimer = setTimeout(() => store && !sel && !mv && renderCalendar(viewRange(), false), 60);
  });

  // Keep "now" and "today" current.
  const tick = () => {
    if (!store || document.hidden || sel || press || mv) return;
    if (today() !== lastToday) {
      if (state.date === lastToday) state.date = today();
      lastToday = today();
      render();
    } else if (!isGrid()) renderCalendar(viewRange(), false);
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

// Shown above any open dialog, so Undo can be reached from inside one.
let toastTimer;
function toast(message, undo) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.setAttribute('role', 'status');
  }
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (t.parentNode !== host) host.append(t);
  t.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" class="toast-btn">Undo</button>' : ''}`;
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
    labels: () => state.labels,
    onChange: (changes) => {
      settings = { ...settings, ...changes };
      if (settings.dayEnd <= settings.dayStart) settings.dayEnd = Math.min(24, settings.dayStart + 1);
      if (settings.workEnd <= settings.workStart) settings.workEnd = Math.min(24, settings.workStart + 1);
      persist();
      render();
    },
    actions: {
      backup: doBackup,
      ics: () => saveFile('planner-events.ics', icsFile(state.events, state.labels), 'text/calendar'),
      restore: restoreBackup,
      labels: manageLabels,
      signOut: () => cloud?.signOut(),
    },
  });
}

async function doBackup() {
  const { name, text } = backupFile(state.events, state.tasks, state.labels);
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
  const labels = data.labels.length ? `, ${data.tasks.length} tasks and ${data.labels.length} labels` : ` and ${data.tasks.length} tasks`;
  const ok = confirm(`Restore ${data.events.length} events${labels}${when}?\n\nItems in the backup replace their current versions. Anything added since the backup stays.`);
  if (!ok) return;
  commit([
    ...data.events.map((obj) => ({ op: 'put', coll: 'events', obj })),
    ...data.tasks.map((obj) => ({ op: 'put', coll: 'tasks', obj })),
    ...data.labels.map((obj) => ({ op: 'put', coll: 'labels', obj })),
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
  const labels = Object.values(local.labels);
  if (!events.length && !tasks.length) return;
  if (confirm(`This device has ${events.length} events and ${tasks.length} tasks from before sync was turned on. Copy them to your account?`)) {
    commit([
      ...events.map((obj) => ({ op: 'put', coll: 'events', obj })),
      ...tasks.map((obj) => ({ op: 'put', coll: 'tasks', obj })),
      ...labels.map((obj) => ({ op: 'put', coll: 'labels', obj })),
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
