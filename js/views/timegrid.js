import { absMin, fmt, fmtTime, fmtTimeRange, minOf, nowMin, pad, parts, today, weekday } from '../dates.js';
import { icons } from '../icons.js';
import { esc } from '../util.js';

// Day, week and two-week views: days side by side on a timeline, where each
// event sits at its start time and is as tall as it is long. Events that
// overlap share the width of the column.

const MIN_PX = 20; // shortest an event block can be drawn, so it stays tappable

export function renderTimeGrid({ days, occs, settings }) {
  const H0 = settings.dayStart * 60;
  const H1 = settings.dayEnd * 60;
  const ppm = settings.hourHeight / 60;
  const t = today();
  const cols = new Map(days.map((d) => [d, { allDay: [], early: [], late: [], segs: [] }]));

  for (const occ of occs) {
    if (occ.ev.allDay) {
      for (const d of days) if (d >= occ.date && d <= occ.end) cols.get(d).allDay.push(occ);
      continue;
    }
    // Cut the event into one piece per day it touches.
    const s = absMin(occ.start);
    const e = Math.max(absMin(occ.end), s + 15);
    for (const d of days) {
      const ds = absMin(d);
      const a = Math.max(s, ds) - ds;
      const b = Math.min(e, ds + 1440) - ds;
      if (b <= a) continue;
      const col = cols.get(d);
      if (b <= H0) col.early.push({ occ, a });
      else if (a >= H1) col.late.push({ occ, a });
      else {
        col.segs.push({
          occ,
          va: Math.max(a, H0),
          vb: Math.min(b, H1),
          contTop: s < ds || a < H0,
          contBottom: e > ds + 1440 || b > H1,
        });
      }
    }
  }

  const heads = days.map((d) => {
    const cls = ['tg-dayhead', d === t && 'today', d < t && 'past'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-goto="${d}" aria-label="${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}"><span class="dow">${fmt(d, { weekday: 'short' })}</span><span class="dom">${parts(d).d}</span></button>`;
  });

  const allDays = days.map((d) => {
    const { allDay, early, late } = cols.get(d);
    allDay.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.ev.title || '').localeCompare(y.ev.title || '')));
    const sortByTime = (x, y) => x.a - y.a;
    const chips = [
      ...allDay.map((o) => chip(o, 'allday', esc(o.ev.title || '(No title)'))),
      ...early.sort(sortByTime).map((x) => chip(x.occ, 'oor', `${icons.up}<b>${fmtTime(x.a, settings.h24)}</b> ${esc(x.occ.ev.title || '(No title)')}`)),
      ...late.sort(sortByTime).map((x) => chip(x.occ, 'oor', `${icons.down}<b>${fmtTime(x.a, settings.h24)}</b> ${esc(x.occ.ev.title || '(No title)')}`)),
    ];
    return `<div class="tg-allday${isWeekend(d) ? ' wkend' : ''}">${chips.join('')}</div>`;
  });

  const bodies = days.map((d) => {
    const { segs } = cols.get(d);
    layout(segs, MIN_PX / ppm);
    const blocks = segs.map((seg) => eventBlock(seg, H0, ppm, settings.h24));
    let now = '';
    if (d === t) {
      const n = nowMin();
      if (n >= H0 && n < H1) now = `<div class="now" style="top:${(n - H0) * ppm}px"></div>`;
    }
    const cls = ['tg-col', d === t && 'today', isWeekend(d) && 'wkend'].filter(Boolean).join(' ');
    return `<div class="${cls}" data-date="${d}">${blocks.join('')}${now}</div>`;
  });

  const labels = [];
  for (let h = settings.dayStart; h < settings.dayEnd; h++) {
    const label = settings.h24 ? `${pad(h)}:00` : `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
    labels.push(`<span style="top:${(h * 60 - H0) * ppm}px">${label}</span>`);
  }

  return `<div class="tg n${days.length}" style="--hh:${settings.hourHeight}px">
    <div class="tg-grid" style="grid-template-columns:var(--axis-w) repeat(${days.length}, minmax(var(--col-min), 1fr))">
      <div class="tg-corner"></div>${heads.join('')}
      <div class="tg-adlabel">all-day</div>${allDays.join('')}
      <div class="tg-axis" style="height:${(H1 - H0) * ppm}px">${labels.join('')}</div>${bodies.join('')}
    </div>
  </div>`;
}

const isWeekend = (d) => weekday(d) === 0 || weekday(d) === 6;

function chip(occ, cls, html) {
  return `<div class="chip c-${occ.ev.color || 'blue'} ${cls}${occ.ev.tentative ? ' tent' : ''}" role="button" tabindex="0" data-id="${esc(occ.ev.id)}" data-date="${occ.date}">${html}</div>`;
}

// Splits overlapping events into side-by-side columns. Each event gets a
// column, the number of columns in its overlap group, and how many columns it
// can stretch across to the right.
function layout(segs, minMinutes) {
  for (const s of segs) s.end = Math.max(s.vb, s.va + minMinutes);
  segs.sort((x, y) => x.va - y.va || y.end - x.end);
  let group = [];
  let groupEnd = -Infinity;
  const place = () => {
    const colEnds = [];
    for (const s of group) {
      let c = colEnds.findIndex((end) => end <= s.va);
      if (c < 0) c = colEnds.push(0) - 1;
      colEnds[c] = s.end;
      s.col = c;
    }
    for (const s of group) {
      s.cols = colEnds.length;
      s.span = 1;
      for (let c = s.col + 1; c < s.cols; c++) {
        if (group.some((o) => o.col === c && o.va < s.end && o.end > s.va)) break;
        s.span++;
      }
    }
  };
  for (const s of segs) {
    if (group.length && s.va >= groupEnd) {
      place();
      group = [];
      groupEnd = -Infinity;
    }
    group.push(s);
    groupEnd = Math.max(groupEnd, s.end);
  }
  if (group.length) place();
}

function eventBlock(seg, H0, ppm, h24) {
  const { occ } = seg;
  const ev = occ.ev;
  const top = (seg.va - H0) * ppm;
  const height = Math.max((seg.vb - seg.va) * ppm, MIN_PX);
  const short = height < 36;
  const title = esc(ev.title || '(No title)');
  const time = fmtTimeRange(minOf(occ.start), minOf(occ.end), h24);
  const repeat = ev.rrule || ev.seriesId ? `<span class="ev-rep" title="Repeats">${icons.repeat}</span>` : '';
  const cls = ['ev', `c-${ev.color || 'blue'}`, ev.tentative && 'tent', short && 'short', seg.contTop && 'ct', seg.contBottom && 'cb'].filter(Boolean).join(' ');
  // Events with something beside them stretch partly under it, so narrow
  // columns stay readable; later columns are drawn on top.
  const left = (seg.col / seg.cols) * 100;
  const own = (seg.span / seg.cols) * 100;
  const width = seg.col + seg.span < seg.cols ? Math.min(100 - left, own * 1.7) : own;
  const style = `top:${top}px;height:${height}px;left:calc(${left}% + 1px);width:calc(${width}% - 3px);z-index:${1 + seg.col}`;
  const body = short
    ? `<span class="ev-t">${title}</span><span class="ev-m">${fmtTime(minOf(occ.start), h24)}</span>`
    : `<span class="ev-t">${title}</span><span class="ev-m">${time}${repeat}</span>`;
  return `<div class="${cls}" style="${style}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}" title="${title}, ${time}${ev.tentative ? ' (tentative)' : ''}">${body}</div>`;
}
