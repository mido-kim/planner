import { addDays, daysFrom, fmt, minOf, parseTime, parts, today, weekday } from '../dates.js';
import { icons } from '../icons.js';
import { holidayName } from '../holidays.js';
import { colorOf } from '../labels.js';
import { spanDays, WEEKDAYS_SHORT } from '../recurrence.js';
import { esc } from '../util.js';
import { barHtml, layoutBars } from './bars.js';

// Month view: a grid of days. All-day events and events that run
// into another day are bars across their days; under them, each day lists its
// other events, deadlines and tasks in time order, with date-only tasks last.
// Clicking a date opens that day on the timeline.
//
// `rows` is how many item rows fit under the date in a cell.

export function renderMonth({ range, occs, tasks = [], labels = new Map(), settings, rows }) {
  const t = today();
  const h24 = settings.h24;
  const color = (item, fallback) => colorOf(item, labels, fallback);
  const days = daysFrom(range.gridFrom, range.weeks * 7);
  const byDay = new Map(days.map((d) => [d, []]));
  const bars = [];
  for (const occ of occs) {
    const ev = occ.ev;
    const span = spanDays(ev);
    if (ev.kind !== 'deadline' && (ev.allDay || span > 0)) {
      bars.push({ occ, first: occ.date, last: addDays(occ.date, span), title: ev.title || '' });
    } else {
      const html = ev.kind === 'deadline' ? deadlineChip(occ, h24, color(ev)) : eventChip(occ, h24, color(ev));
      // Date-only deadlines go at the end of the day, like date-only tasks.
      const min = ev.kind === 'deadline' && ev.allDay ? 1440 : minOf(occ.start);
      byDay.get(occ.date)?.push({ min, kind: ev.kind === 'deadline' ? 1 : 0, title: ev.title || '', html });
    }
  }
  for (const task of tasks) {
    // Date-only tasks go at the end of the day.
    byDay.get(task.due)?.push({ min: task.dueTime ? parseTime(task.dueTime) : 1440, kind: 2, title: task.title, html: taskChip(task, h24, color(task, 'none')) });
  }

  const head = daysFrom(range.gridFrom, 7)
    .map((d) => `<div class="mv-dow">${WEEKDAYS_SHORT[weekday(d)]}</div>`)
    .join('');

  const weeks = [];
  for (let w = 0; w < range.weeks; w++) {
    const week = days.slice(w * 7, w * 7 + 7);
    const { segs, lanes, used } = layoutBars(bars, week);
    const lists = week.map((d) => byDay.get(d).sort(order));
    // Everything fits, or the last row of a full cell says "+N more".
    const fits = lanes <= rows && lists.every((items, i) => items.length <= rows - used[i]);
    const shownLanes = fits ? lanes : Math.min(lanes, rows - 1);
    const cells = week.map((d, i) => {
      const items = lists[i];
      const top = Math.min(used[i], shownLanes);
      const hiddenBars = segs.filter((s) => s.lane >= shownLanes && s.a <= i && s.b >= i).length;
      const free = rows - top;
      const shown = !hiddenBars && items.length <= free ? items.length : Math.max(0, free - 1);
      const more = hiddenBars + items.length - shown;
      const { d: dayNum } = parts(d);
      const cls = [
        'mv-cell',
        (d < range.from || d >= range.to) && 'out',
        d === t && 'today',
        (weekday(d) === 0 || weekday(d) === 6) && 'wkend',
        holidayName(d) && 'holiday',
      ].filter(Boolean).join(' ');
      const hol = holidayName(d);
      const label = dayNum === 1 ? fmt(d, { month: 'short', day: 'numeric' }) : dayNum;
      return `<div class="${cls}" data-date="${d}">
        <div class="mv-num"><span role="button" tabindex="0" data-goto="${d}" aria-label="${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}${hol ? `, ${esc(hol)}` : ''}"${hol ? ` title="${esc(hol)}"` : ''}>${label}</span></div>
        ${top ? `<div class="mv-lanes" style="height:calc(${top} * var(--mrow) - 1px)"></div>` : ''}
        ${items.slice(0, shown).map((x) => x.html).join('')}
        ${more ? `<div class="mv-more" role="button" tabindex="0" data-goto="${d}">+${more} more</div>` : ''}
      </div>`;
    });
    const barsHtml = segs.filter((s) => s.lane < shownLanes).map((s) => {
      const ev = s.item.occ.ev;
      const time = !ev.allDay && !s.contL ? `<span class="bt">${shortTime(minOf(s.item.occ.start), h24)}</span> ` : '';
      return barHtml(s, { n: 7, top: `calc(var(--mtop) + ${s.lane} * var(--mrow))`, label: time + esc(ev.title || '(No title)'), color: color(ev) });
    });
    weeks.push(`<div class="mv-week">${cells.join('')}${barsHtml.join('')}</div>`);
  }

  return `<div class="mv" style="--weeks:${range.weeks}"><div class="mv-head">${head}</div>${weeks.join('')}</div>`;
}

// By time; at the same time events, then deadlines, then tasks.
const order = (x, y) => x.min - y.min || x.kind - y.kind || x.title.localeCompare(y.title);

function shortTime(min, h24) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h24) return `${h}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
}

const attrs = (occ) => `role="button" tabindex="0" data-id="${esc(occ.ev.id)}" data-date="${occ.date}"`;

function eventChip(occ, h24, color) {
  const ev = occ.ev;
  return `<div class="mchip c-${color}${ev.tentative ? ' tent' : ''}" ${attrs(occ)}><i class="dot"></i><span class="mt">${shortTime(minOf(occ.start), h24)}</span><span class="mtt">${esc(ev.title || '(No title)')}</span></div>`;
}

function deadlineChip(occ, h24, color) {
  const title = esc(occ.ev.title || '(No title)');
  const time = occ.ev.allDay ? '' : `<span class="mt">${shortTime(minOf(occ.start), h24)}</span>`;
  return `<div class="mchip dline c-${color}" ${attrs(occ)} title="Deadline: ${title}">${icons.flag}${time}<span class="mtt">${title}</span></div>`;
}

function taskChip(task, h24, color) {
  const title = esc(task.title || '(No title)');
  return `<div class="mchip mtask c-${color}${task.done ? ' done' : ''}" role="button" tabindex="0" data-task="${esc(task.id)}" title="Task: ${title}"><input type="checkbox" data-toggle="${esc(task.id)}" ${task.done ? 'checked' : ''} aria-label="Done">${task.dueTime ? `<span class="mt">${shortTime(parseTime(task.dueTime), h24)}</span>` : ''}<span class="mtt">${title}</span></div>`;
}
