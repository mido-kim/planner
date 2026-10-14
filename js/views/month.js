import { absMin, addDays, daysFrom, fmt, minOf, parts, today, weekday } from '../dates.js';
import { spanDays, WEEKDAYS_SHORT } from '../recurrence.js';
import { esc } from '../util.js';

// Month view: a grid of days, each listing its events in time order. Clicking
// a day opens it on the timeline.

export function renderMonth({ range, occs, settings, chipLimit }) {
  const t = today();
  const days = daysFrom(range.gridFrom, range.weeks * 7);
  const byDay = new Map(days.map((d) => [d, []]));
  for (const occ of occs) {
    const last = addDays(occ.date, spanDays(occ.ev));
    for (let d = occ.date; d <= last; d = addDays(d, 1)) byDay.get(d)?.push({ occ, first: d === occ.date });
  }

  const head = daysFrom(range.gridFrom, 7)
    .map((d) => `<div class="mv-dow">${WEEKDAYS_SHORT[weekday(d)]}</div>`)
    .join('');

  const weeks = [];
  for (let w = 0; w < range.weeks; w++) {
    const cells = days.slice(w * 7, w * 7 + 7).map((d) => {
      const items = byDay.get(d).sort(order);
      const shown = items.length > chipLimit ? chipLimit - 1 : items.length;
      const { d: dayNum } = parts(d);
      const cls = [
        'mv-cell',
        (d < range.from || d >= range.to) && 'out',
        d === t && 'today',
        (weekday(d) === 0 || weekday(d) === 6) && 'wkend',
      ].filter(Boolean).join(' ');
      const label = dayNum === 1 ? fmt(d, { month: 'short', day: 'numeric' }) : dayNum;
      return `<div class="${cls}" data-goto="${d}">
        <div class="mv-num"><span>${label}</span></div>
        ${items.slice(0, shown).map((x) => monthChip(x, settings.h24)).join('')}
        ${items.length > shown ? `<div class="mv-more">+${items.length - shown} more</div>` : ''}
      </div>`;
    });
    weeks.push(`<div class="mv-week">${cells.join('')}</div>`);
  }

  return `<div class="mv" style="--weeks:${range.weeks}"><div class="mv-head">${head}</div>${weeks.join('')}</div>`;
}

// All-day and continuing events first, then by start time.
function order(x, y) {
  const bar = (i) => i.occ.ev.allDay || !i.first;
  if (bar(x) !== bar(y)) return bar(x) ? -1 : 1;
  return absMin(x.occ.start) - absMin(y.occ.start) || (x.occ.ev.title || '').localeCompare(y.occ.ev.title || '');
}

function shortTime(min, h24) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h24) return `${h}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
}

function monthChip({ occ, first }, h24) {
  const ev = occ.ev;
  const title = esc(ev.title || '(No title)');
  const attrs = `role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}"`;
  const cls = `c-${ev.color || 'blue'}${ev.tentative ? ' tent' : ''}`;
  if (ev.allDay || !first) return `<div class="mchip fill ${cls}" ${attrs}>${title}</div>`;
  return `<div class="mchip ${cls}" ${attrs}><i class="dot"></i><span class="mt">${shortTime(minOf(occ.start), h24)}</span><span class="mtt">${title}</span></div>`;
}
