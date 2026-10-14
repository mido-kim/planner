import { addDays, dateOf, fmt, fmtTime, fmtTimeRange, minOf, parseTime, today } from '../dates.js';
import { icons } from '../icons.js';
import { colorOf } from '../labels.js';
import { describeRule, spanDays } from '../recurrence.js';
import { esc } from '../util.js';

// The agenda beside or below the calendar: everything in the dates on screen
// (events, deadlines and tasks) day by day with their full details, plus
// overdue tasks and tasks with no date.

// Open tasks counted on the agenda button.
export function tasksInView(tasks, from, to) {
  const t = today();
  const showOverdue = t >= from && t < to;
  return [...tasks.values()].filter((x) =>
    x.due ? (x.due >= from && x.due < to) || (showOverdue && !x.done && x.due < from) : !x.done);
}

const TYPE_ORDER = { event: 0, deadline: 1, task: 2 };

// Which items go under which heading, in order:
//   { groups: [{ kind: 'overdue' | 'day' | 'nodate', day?, items }], hiddenDone }
// Items are { type: 'event' | 'deadline' | 'task', occ | task }. All-day
// events show on each day they cover; timed events on the day they start
// (or the first day shown, if they started before it); done tasks only with
// `showDone`.
export function agendaGroups({ from, to, occs, tasks, showDone, t = today() }) {
  const groups = [];
  let hiddenDone = 0;
  const keep = (x) => {
    if (x.done && !showDone) hiddenDone++;
    return !x.done || showDone;
  };
  if (t >= from && t < to) {
    const overdue = tasks.filter((x) => !x.done && x.due && x.due < from).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    if (overdue.length) groups.push({ kind: 'overdue', items: overdue.map((task) => ({ type: 'task', task, sort: 0 })) });
  }
  const days = new Map();
  for (let d = from; d < to; d = addDays(d, 1)) days.set(d, []);
  for (const occ of occs) {
    if (occ.ev.allDay) {
      const last = addDays(occ.date, spanDays(occ.ev));
      for (let d = occ.date < from ? from : occ.date; d <= last && d < to; d = addDays(d, 1)) days.get(d)?.push({ type: 'event', occ, sort: -2 }); // all-day first
    } else {
      const d = occ.date < from ? from : occ.date;
      days.get(d)?.push({ type: occ.ev.kind === 'deadline' ? 'deadline' : 'event', occ, sort: occ.date < from ? -1 : minOf(occ.start) });
    }
  }
  for (const task of tasks) {
    if (task.due && days.has(task.due) && keep(task)) days.get(task.due).push({ type: 'task', task, sort: task.dueTime ? parseTime(task.dueTime) : 1440 });
  }
  const title = (x) => (x.occ ? x.occ.ev.title : x.task.title) || '';
  for (const [day, items] of days) {
    if (!items.length) continue;
    items.sort((a, b) => a.sort - b.sort || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || title(a).localeCompare(title(b)));
    groups.push({ kind: 'day', day, items });
  }
  const undated = tasks.filter((x) => !x.due && keep(x)).sort((a, b) => a.done - b.done || (a.createdAt || 0) - (b.createdAt || 0));
  if (undated.length) groups.push({ kind: 'nodate', items: undated.map((task) => ({ type: 'task', task, sort: 0 })) });
  return { groups, hiddenDone };
}

export function renderAgenda({ from, to, occs, tasks, events, labels = new Map(), h24, showDone }) {
  const t = today();
  const { groups, hiddenDone } = agendaGroups({ from, to, occs, tasks: [...tasks.values()], showDone, t });
  const short = (d) => fmt(d, { month: 'short', day: 'numeric' });

  const labelTag = (item) => {
    const l = item.labelId && labels.get(item.labelId);
    return l ? `<span class="ag-label c-${l.color}"><i></i>${esc(l.name)}</span>` : '';
  };
  const notes = (item) => (item.notes ? `<p class="ag-notes">${esc(item.notes)}</p>` : '');
  const repeat = (ev) => {
    const rule = ev.rrule || (ev.seriesId && events.get(ev.seriesId)?.rrule);
    if (!rule) return '';
    const start = ev.rrule ? ev.start : events.get(ev.seriesId).start;
    return `<span class="ag-rep">${icons.repeat}${esc(describeRule(rule, start))}${ev.rrule ? '' : ' (changed once)'}</span>`;
  };
  const meta = (parts) => {
    const html = parts.filter(Boolean).join('');
    return html ? `<div class="ag-meta">${html}</div>` : '';
  };

  const eventCard = ({ occ }, day) => {
    const ev = occ.ev;
    let when;
    if (ev.allDay) {
      const last = addDays(occ.date, spanDays(ev));
      when = last > occ.date ? `All day · ${short(occ.date)} – ${short(last)}` : 'All day';
    } else {
      const sd = dateOf(occ.start);
      const ed = dateOf(occ.end);
      const ends = ed !== sd && !(occ.end.endsWith('T00:00') && addDays(sd, 1) === ed);
      when = ends
        ? `${short(sd)}, ${fmtTime(minOf(occ.start), h24)} – ${short(ed)}, ${fmtTime(minOf(occ.end), h24)}`
        : fmtTimeRange(minOf(occ.start), minOf(occ.end), h24);
      if (sd < day) when = `Continues · ${when}`;
    }
    return `<div class="ag c-${colorOf(ev, labels)}${ev.tentative ? ' tent' : ''}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}">
      <i class="ag-dot"></i>
      <div class="ag-main">
        <div class="ag-title">${esc(ev.title || '(No title)')}</div>
        <div class="ag-when">${when}${ev.tentative ? ' · <span class="ag-tent">Tentative</span>' : ''}</div>
        ${meta([labelTag(ev), repeat(ev)])}${notes(ev)}
      </div>
    </div>`;
  };

  const deadlineCard = ({ occ }) => {
    const ev = occ.ev;
    return `<div class="ag dline c-${colorOf(ev, labels)}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}">
      <span class="ag-flag">${icons.flagBtn}</span>
      <div class="ag-main">
        <div class="ag-title">${esc(ev.title || '(No title)')}</div>
        <div class="ag-when">Due ${fmtTime(minOf(occ.start), h24)}</div>
        ${meta([labelTag(ev), repeat(ev)])}${notes(ev)}
      </div>
    </div>`;
  };

  const taskCard = ({ task }, kind) => {
    const late = !task.done && task.due && task.due < t;
    const when = kind === 'overdue'
      ? `Overdue · was due ${short(task.due)}${task.dueTime ? `, ${fmtTime(parseTime(task.dueTime), h24)}` : ''}`
      : late ? `Overdue${task.dueTime ? ` · was due ${fmtTime(parseTime(task.dueTime), h24)}` : ''}`
        : task.dueTime ? `Due ${fmtTime(parseTime(task.dueTime), h24)}` : kind === 'day' ? 'Any time that day' : '';
    return `<div class="ag task c-${colorOf(task, labels, 'none')}${task.done ? ' done' : ''}${late ? ' late' : ''}" role="button" tabindex="0" data-task="${esc(task.id)}">
      <input type="checkbox" data-toggle="${esc(task.id)}" ${task.done ? 'checked' : ''} aria-label="Done">
      <div class="ag-main">
        <div class="ag-title">${esc(task.title)}</div>
        ${when ? `<div class="ag-when">${when}</div>` : ''}
        ${meta([labelTag(task)])}${notes(task)}
      </div>
    </div>`;
  };

  const heading = (g) => {
    if (g.kind === 'overdue') return 'Overdue';
    if (g.kind === 'nodate') return 'Tasks with no date';
    const label = fmt(g.day, { weekday: 'short', month: 'short', day: 'numeric' });
    return g.day === t ? `Today · ${label}` : label;
  };
  const card = (x, g) => (x.type === 'task' ? taskCard(x, g.kind) : x.type === 'deadline' ? deadlineCard(x) : eventCard(x, g.day));

  const body = groups.length
    ? groups.map((g) => `<section class="tgroup ${g.kind === 'day' && g.day === t ? 'today' : g.kind}"><h3>${esc(heading(g))}</h3>${g.items.map((x) => card(x, g)).join('')}</section>`).join('')
    : '<p class="empty">Nothing planned for these dates.</p>';
  const foot = hiddenDone
    ? `<button class="link" data-action="toggle-done">Show ${hiddenDone} completed</button>`
    : showDone ? '<button class="link" data-action="toggle-done">Hide completed</button>' : '';
  return body + (foot ? `<div class="tasks-foot">${foot}</div>` : '');
}
