import { addDays, fmt, fmtTime, parseTime, today } from '../dates.js';
import { colorOf } from '../labels.js';
import { esc } from '../util.js';

// The task list beside the calendar: tasks due in the dates on screen, grouped
// by day, plus anything overdue and tasks with no date.

const byTime = (a, b) =>
  (a.dueTime || '99') < (b.dueTime || '99') ? -1 : (a.dueTime || '99') > (b.dueTime || '99') ? 1 : (a.createdAt || 0) - (b.createdAt || 0);

export function tasksInView(tasks, from, to) {
  const t = today();
  const showOverdue = t >= from && t < to;
  return [...tasks.values()].filter((x) =>
    x.due ? (x.due >= from && x.due < to) || (showOverdue && !x.done && x.due < from) : !x.done);
}

export function renderTaskList({ tasks, from, to, h24, showDone, labels = new Map() }) {
  const t = today();
  const all = [...tasks.values()];
  const groups = [];
  let hiddenDone = 0;
  const visible = (x) => {
    if (x.done && !showDone) {
      hiddenDone++;
      return false;
    }
    return true;
  };

  if (t >= from && t < to) {
    const overdue = all.filter((x) => !x.done && x.due && x.due < from).sort((a, b) => (a.due < b.due ? -1 : 1));
    if (overdue.length) groups.push({ title: 'Overdue', cls: 'overdue', items: overdue, showDate: true });
  }
  for (let d = from; d < to; d = addDays(d, 1)) {
    const items = all.filter((x) => x.due === d && visible(x)).sort((a, b) => a.done - b.done || byTime(a, b));
    if (!items.length) continue;
    const label = fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
    groups.push({ title: d === t ? `Today · ${label}` : label, cls: d === t ? 'today' : '', items });
  }
  const undated = all.filter((x) => !x.due && visible(x)).sort((a, b) => a.done - b.done || (a.createdAt || 0) - (b.createdAt || 0));
  if (undated.length) groups.push({ title: 'No date', cls: 'nodate', items: undated });

  const rows = (g) =>
    g.items.map((x) => {
      const late = !x.done && x.due && x.due < t;
      const meta = [
        g.showDate ? fmt(x.due, { month: 'short', day: 'numeric' }) : late && 'Overdue',
        x.dueTime && fmtTime(parseTime(x.dueTime), h24),
      ].filter(Boolean).join(' · ');
      const color = colorOf(x, labels, null);
      const label = x.labelId && labels.get(x.labelId);
      const tag = color ? `<span class="task-label c-${color}"><i></i>${label ? esc(label.name) : ''}</span>` : '';
      return `<div class="task${x.done ? ' done' : ''}${late ? ' late' : ''}">
        <input type="checkbox" data-toggle="${esc(x.id)}" ${x.done ? 'checked' : ''} aria-label="Done">
        <button class="task-title" data-edit-task="${esc(x.id)}"><span>${esc(x.title)}</span>${meta ? `<span class="task-meta">${meta}</span>` : ''}${tag}${x.notes ? '<span class="task-note-dot" title="Has notes"></span>' : ''}</button>
      </div>`;
    }).join('');

  const body = groups.length
    ? groups.map((g) => `<section class="tgroup ${g.cls}"><h3>${esc(g.title)}</h3>${rows(g)}</section>`).join('')
    : '<p class="empty">No tasks for these dates.</p>';
  const foot = hiddenDone
    ? `<button class="link" data-action="toggle-done">Show ${hiddenDone} completed</button>`
    : showDone ? '<button class="link" data-action="toggle-done">Hide completed</button>' : '';
  return body + (foot ? `<div class="tasks-foot">${foot}</div>` : '');
}
