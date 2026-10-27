import { absMin, addDays, fmt, fmtTime, fmtTimeRange, minOf, nowMin, pad, parseTime, parts, today, weekday } from '../dates.js';
import { icons } from '../icons.js';
import { colorOf } from '../labels.js';
import { spanDays } from '../recurrence.js';
import { holidayName } from '../holidays.js';
import { workSpans } from '../settings.js';
import { checkButton, isDone } from '../symbols.js';
import { esc } from '../util.js';
import { barHtml, layoutBars } from './bars.js';

// Timelines. Day and week: days side by side, where each event sits at its
// start time and is as tall as it is long, and overlapping events share the
// column. Two weeks: two short timelines stacked, with the hours squeezed to
// fit, so both weeks show at once.
//
// A deadline is a line across its day at its time; a task with a time is a
// small checkbox chip at that time, and a task with only a date sits at the
// bottom of its day. All-day events and events of 24 hours or more are bars
// in the all-day row, across the days they cover.

const MIN_PX = 20; // shortest an event block can be drawn, so it stays tappable

// Which kinds show their notes on the calendar: set from the settings at the
// start of each render.
let notesOn = { events: true, tasks: false, deadlines: false };
const readNotes = (s) => {
  notesOn = { events: s.notesEvents !== false, tasks: !!s.notesTasks, deadlines: !!s.notesDeadlines };
};
const MIN_HOUR_PX = 8; // below this, a day too long for the screen scrolls after all
const TASK_PX = 18; // height of a task chip
const TAG_PX = 16; // height of a deadline's title tag
const AD_ROW = 22; // all-day row: one bar plus the gap below it
const MINI_AD_ROW = 18; // the same in the 2-week view
const MINI_TASK_PX = 16;

// Where a moment goes on a day's timeline: above the hours shown ('early'),
// below them ('late'), or `top` down the column, in units of `scale` per
// minute (pixels, or percent of the column).
export function placeAt(min, H0, H1, scale) {
  if (min < H0) return { where: 'early' };
  if (min >= H1) return { where: 'late' };
  return { where: 'grid', top: (min - H0) * scale };
}

// A task with a time sits at that time; one with only a date, at the bottom.
export const taskPlace = (task, H0, H1, scale) =>
  (task.dueTime ? placeAt(parseTime(task.dueTime), H0, H1, scale) : { where: 'bottom' });

// Events drawn as bars in the all-day row instead of on the timeline.
export const isBarEvent = (occ) => occ.ev.kind !== 'deadline' && (occ.ev.allDay || absMin(occ.end) - absMin(occ.start) >= 1440);

const isWeekend = (d) => weekday(d) === 0 || weekday(d) === 6;

// The day can run past midnight (a day end of 26:00 is 2 AM the next
// morning), so a moment before then belongs to the day before.
export function slotOf(date, min, H1) {
  const off = Math.max(0, H1 - 1440);
  return min < off ? { day: addDays(date, -1), min: min + 1440 } : { day: date, min };
}

// Working hours on weekdays that aren't public holidays, very lightly shaded:
// a band for each stretch.
function workBand(d, settings, H0, H1, scale, unit) {
  if (!settings.showWork || isWeekend(d) || holidayName(d)) return '';
  return workSpans(settings.workRanges).map(([from, to]) => {
    const a = Math.max(from * 60, H0);
    const b = Math.min(to * 60, H1);
    return b > a ? `<div class="work" style="top:${(a - H0) * scale}${unit};height:${(b - a) * scale}${unit}"></div>` : '';
  }).join('');
}

// A day header: weekday and date; public holidays get their name as a tooltip.
function dayHead(d, cls, t, dom) {
  const hol = holidayName(d);
  const c = [cls, d === t && 'today', d < t && 'past', hol && 'holiday'].filter(Boolean).join(' ');
  return `<button class="${c}" data-goto="${d}" aria-label="${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}${hol ? `, ${esc(hol)}` : ''}"${hol ? ` title="${esc(hol)}"` : ''}><span class="dow">${fmt(d, { weekday: 'short' })}</span><span class="dom">${dom}</span></button>`;
}

// The hour column shows bare numbers: 7, 8 … 12, 1 (13, 14 … in 24-hour time).
const hourText = (h, h24) => String(h24 ? h % 24 : h % 24 % 12 || 12);

// A time as bare as that: 10, 2:30 (14:30 in 24-hour time).
const bareTime = (min, h24) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h24 ? h : h % 12 || 12}${m ? `:${pad(m)}` : ''}`;
};

// Sorts out what goes where for `days`: per day, the event pieces on the
// timeline (segs), deadlines and timed tasks (marks, with `top` in `scale`
// units), date-only tasks and deadlines (bottom, endLines) and chips for
// things outside the hours shown (oor); plus the bars for the all-day row.
// Each day runs from its first shown hour to H1, which may be past midnight;
// the small hours before that belong to the day before.
function collect(days, occs, tasks, { H0, H1, scale, h24, color, labels }) {
  const cols = new Map(days.map((d) => [d, { oor: [], segs: [], marks: [], bottom: [], endLines: [] }]));
  const bars = [];
  const off = Math.max(0, H1 - 1440);
  const oor = (col, where, min, html) => col.oor.push({ order: where === 'early' ? 0 : 1, min, html });
  const arrow = (where) => (where === 'early' ? icons.up : icons.down);
  // Where a moment goes: its day's column, or, when that day isn't shown (the
  // small hours of the first day), an early chip on the day itself.
  const spot = (date, min) => {
    const sl = slotOf(date, min, H1);
    const col = cols.get(sl.day);
    if (col) return { col, p: placeAt(sl.min, H0, H1, scale) };
    const own = cols.get(date);
    return own ? { col: own, p: { where: 'early' } } : null;
  };

  for (const occ of occs) {
    const ev = occ.ev;
    if (ev.kind === 'deadline') {
      if (ev.allDay) {
        cols.get(occ.date)?.endLines.push(occ);
        continue;
      }
      const min = minOf(occ.start);
      const at = spot(occ.date, min);
      if (!at) continue;
      if (at.p.where === 'grid') at.col.marks.push({ occ, top: at.p.top });
      else oor(at.col, at.p.where, min, (style) => chip(occ, color(ev), 'oor dl-chip', `${arrow(at.p.where)}<b>${fmtTime(min, h24)}</b>${checkButton(occ, labels, 11)}<span class="ct">${esc(ev.title || '(No title)')}</span>`, style));
      continue;
    }
    if (isBarEvent(occ)) {
      bars.push({ occ, first: occ.date, last: addDays(occ.date, spanDays(ev)), title: ev.title || '' });
      continue;
    }
    // Cut the event into one piece per day it touches.
    const s = absMin(occ.start);
    const e = Math.max(absMin(occ.end), s + 15);
    days.forEach((d, i) => {
      const ds = absMin(d);
      const lo = ds + (i === 0 ? 0 : off);
      const hi = ds + 1440 + off;
      const a = Math.max(s, lo) - ds;
      const b = Math.min(e, hi) - ds;
      if (b <= a) return;
      const col = cols.get(d);
      const label = (where) => (style) => chip(occ, color(ev), 'oor', `${arrow(where)}<b>${fmtTime(a, h24)}</b> ${checkButton(occ, labels, 11)}<span class="ct">${esc(ev.title || '(No title)')}</span>`, style);
      if (b <= H0) oor(col, 'early', a, label('early'));
      else if (a >= H1) oor(col, 'late', a, label('late'));
      else {
        col.segs.push({
          occ,
          va: Math.max(a, H0),
          vb: Math.min(b, H1),
          contTop: s < lo || a < H0,
          contBottom: e > hi || b > H1,
        });
      }
    });
  }

  for (const task of tasks) {
    if (!task.dueTime) {
      cols.get(task.due)?.bottom.push(task);
      continue;
    }
    const min = parseTime(task.dueTime);
    const at = spot(task.due, min);
    if (!at) continue;
    if (at.p.where === 'grid') at.col.marks.push({ task, top: at.p.top });
    else oor(at.col, at.p.where, min, (style) => taskChip(task, color(task, 'none'), 'chip oor tk-chip', `${arrow(at.p.where)}<b>${fmtTime(min, h24)}</b>`, style));
  }
  return { cols, bars };
}

// The all-day row: one strip across the days, with bars in lanes and each
// day's out-of-hours chips under its bars. Returns its HTML and height.
function allDayStrip(days, cols, bars, { rowH, h24, color, labels, cls }) {
  const n = days.length;
  const { segs, used } = layoutBars(bars, days);
  const strip = days.map((d, i) =>
    `<div class="ad-day${isWeekend(d) ? ' wkend' : ''}" data-date="${d}" style="left:calc(${i} * 100% / ${n});width:calc(100% / ${n})"></div>`);
  for (const s of segs) {
    const ev = s.item.occ.ev;
    const time = !ev.allDay && !s.contL ? `<b>${fmtTime(minOf(s.item.occ.start), h24)}</b> ` : '';
    strip.push(barHtml(s, { n, top: `${2 + s.lane * rowH}px`, label: time + esc(ev.title || '(No title)'), color: color(ev), check: checkButton(s.item.occ, labels, 12) }));
  }
  let rows = 0;
  days.forEach((d, i) => {
    const list = cols.get(d).oor.sort((x, y) => x.order - y.order || x.min - y.min);
    list.forEach((x, k) => strip.push(x.html(`left:calc(${i} * 100% / ${n} + 2px);width:calc(100% / ${n} - 4px);top:${2 + (used[i] + k) * rowH}px`)));
    rows = Math.max(rows, used[i] + list.length);
  });
  const height = Math.max(cls === 'tg-allday' ? 24 : 6, rows * rowH + 4);
  return { html: `<div class="${cls}" style="height:${height}px">${strip.join('')}</div>`, height };
}

const byDoneThenCreated = (a, b) => a.done - b.done || (a.createdAt || 0) - (b.createdAt || 0);

// Where things with a date but no time go: midnight, when the day runs past
// it; otherwise the bottom of the day.
export const dayEndAt = (H0, H1, colH, ppm) => (H1 > 1440 && H0 < 1440 ? (1440 - H0) * ppm : colH - 1);

// `fitHeight`: the room for the whole view, in pixels. The day is then
// squeezed to fit it, so nothing scrolls up and down; `headH` is the height
// of the day headers. Without it, an hour is `settings.hourHeight` tall.
export function renderTimeGrid({ days, occs, tasks = [], labels = new Map(), settings, fitHeight = 0, headH = 52 }) {
  readNotes(settings);
  const H0 = settings.dayStart * 60;
  const H1 = settings.dayEnd * 60;
  const h24 = settings.h24;
  const n = days.length;
  const t = today();
  const color = (item, fallback) => colorOf(item, labels, fallback);
  const now = slotOf(t, nowMin(), H1);

  const heads = days.map((d) => dayHead(d, 'tg-dayhead', t, parts(d).d));
  const pre = collect(days, occs, tasks, { H0, H1, scale: 1, h24, color, labels });
  const strip = allDayStrip(days, pre.cols, pre.bars, { rowH: AD_ROW, h24, color, labels, cls: 'tg-allday' });
  let ppm = settings.hourHeight / 60;
  let fit = false;
  if (fitHeight) {
    const fitted = (fitHeight - headH - strip.height - 1) / (H1 - H0);
    if (fitted * 60 >= MIN_HOUR_PX) {
      ppm = fitted;
      fit = true;
    }
  }
  const colH = (H1 - H0) * ppm;
  // Short events stay tappable, but on a tightly squeezed day less so.
  const minPx = Math.min(MIN_PX, Math.max(12, ppm * 30));
  const { cols } = collect(days, occs, tasks, { H0, H1, scale: ppm, h24, color, labels });

  const bodies = days.map((d) => {
    const { segs, marks, bottom, endLines } = cols.get(d);
    layout(segs, minPx / ppm);
    const html = [workBand(d, settings, H0, H1, ppm, 'px'), ...segs.map((seg) => eventBlock(seg, H0, ppm, h24, color(seg.occ.ev), minPx, labels))];
    // Deadlines and timed tasks, top to bottom. A deadline's tag sits above its
    // line, or below it when there's no room; task chips that would overlap
    // move down.
    marks.sort((x, y) => x.top - y.top);
    let taskFloor = -Infinity;
    let tagFloor = -Infinity;
    const tags = []; // [top, bottom] of each deadline tag
    for (const m of marks) {
      if (m.occ) {
        const below = m.top - TAG_PX < Math.max(0, tagFloor);
        tagFloor = below ? m.top + TAG_PX : m.top;
        tags.push(below ? [m.top - 1, m.top + TAG_PX] : [m.top - TAG_PX, m.top + 1]);
        html.push(deadlineLine(m.occ, `${m.top}px`, h24, color(m.occ.ev), below, labels));
      } else {
        const top = Math.max(m.top, taskFloor);
        taskFloor = top + TASK_PX + 2;
        html.push(taskChip(m.task, color(m.task, 'none'), 'tchip', '', `top:${top}px`));
      }
    }
    // A date but no time: around midnight. Deadlines are lines at 12 AM with
    // their tag above; tasks sit just after it, or just before when there's
    // no room. (main.js then moves them clear of other labels.)
    const mid = dayEndAt(H0, H1, colH, ppm);
    endLines.forEach((occ, k) => html.push(deadlineLine(occ, `${mid - k * (TAG_PX + 2)}px`, h24, color(occ.ev), false, labels)));
    const below = colH - mid >= bottom.length * (TASK_PX + 2) + 2;
    bottom.sort(byDoneThenCreated).forEach((task, k) => {
      const top = below ? mid + 2 + k * (TASK_PX + 2) : mid - (endLines.length ? TAG_PX : 0) - (k + 1) * (TASK_PX + 2);
      html.push(taskChip(task, color(task, 'none'), 'tchip', '', `top:${top}px`));
    });
    if (d === now.day && now.min >= H0 && now.min < H1) html.push(`<div class="now" style="top:${(now.min - H0) * ppm}px"></div>`);
    const cls = ['tg-col', d === t && 'today', isWeekend(d) && 'wkend'].filter(Boolean).join(' ');
    return `<div class="${cls}" data-date="${d}">${html.join('')}</div>`;
  });

  const labelsHtml = [];
  // With little room per hour, every other hour is labelled.
  const step = ppm * 60 < 16 ? 2 : 1;
  for (let h = settings.dayStart; h < settings.dayEnd; h += step) {
    labelsHtml.push(`<span${h >= 24 ? ' class="next"' : ''} style="top:${(h * 60 - H0) * ppm}px">${hourText(h, h24)}</span>`);
  }

  const cls = ['tg', `n${n}`, fit && 'fit', ppm * 60 < 24 && 'tight'].filter(Boolean).join(' ');
  return `<div class="${cls}" style="--hh:${ppm * 60}px">
    <div class="tg-grid" style="grid-template-columns:var(--axis-w) repeat(${n}, minmax(var(--col-min), 1fr))">
      <div class="tg-corner"></div>${heads.join('')}
      <div class="tg-adlabel" style="height:${strip.height}px">all-day</div>${strip.html}
      <div class="tg-axis" style="height:${colH}px">${labelsHtml.join('')}</div>${bodies.join('')}
      <div class="stk-layer" aria-hidden="true"></div>
    </div>
  </div>`;
}

// Two weeks as two short timelines, one above the other. Positions are in
// percent of each day column, so the hours stretch to whatever room there is.
export function renderTwoWeeks({ days, occs, tasks = [], labels = new Map(), settings }) {
  readNotes(settings);
  const H0 = settings.dayStart * 60;
  const H1 = settings.dayEnd * 60;
  const pct = 100 / (H1 - H0);
  const h24 = settings.h24;
  const t = today();
  const color = (item, fallback) => colorOf(item, labels, fallback);
  const now = slotOf(t, nowMin(), H1);

  // Hour labels every three hours.
  const axis = [];
  for (let h = Math.ceil(settings.dayStart / 3) * 3; h < settings.dayEnd; h += 3) {
    if (h * 60 - H0 < 60 || H1 - h * 60 < 60) continue;
    axis.push(`<span style="top:${(h * 60 - H0) * pct}%">${hourText(h, h24)}</span>`);
  }

  const weeks = [days.slice(0, 7), days.slice(7, 14)].map((week, w) => {
    const { cols, bars } = collect(week, occs, tasks, { H0, H1, scale: pct, h24, color, labels });
    const heads = week.map((d) =>
      dayHead(d, 'tw-dayhead', t, parts(d).d === 1 || (w === 0 && d === week[0]) ? fmt(d, { month: 'short', day: 'numeric' }) : parts(d).d));
    const strip = allDayStrip(week, cols, bars, { rowH: MINI_AD_ROW, h24, color, labels, cls: 'tw-allday' });
    const bodies = week.map((d) => {
      const { segs, marks, bottom, endLines } = cols.get(d);
      layout(segs, 20);
      const html = [workBand(d, settings, H0, H1, pct, '%'), ...segs.map((seg) => miniBlock(seg, H0, pct, h24, color(seg.occ.ev), labels))];
      marks.sort((x, y) => x.top - y.top);
      let lastTask = -Infinity;
      let stack = 0;
      for (const m of marks) {
        if (m.occ) html.push(deadlineLine(m.occ, `${m.top}%`, h24, color(m.occ.ev), m.top < 8, labels));
        else {
          // Tasks close together stack downwards.
          stack = m.top - lastTask < 6 ? stack + 1 : 0;
          lastTask = m.top;
          html.push(taskChip(m.task, color(m.task, 'none'), 'tchip', '', `top:calc(${m.top}% + ${stack * MINI_TASK_PX}px)`));
        }
      }
      const mid = H1 > 1440 && H0 < 1440 ? `${(1440 - H0) * pct}%` : '100% - 1px';
      endLines.forEach((occ, k) => html.push(deadlineLine(occ, `calc(${mid} - ${k * 14}px)`, h24, color(occ.ev), false, labels)));
      bottom.sort(byDoneThenCreated).forEach((task, k) =>
        html.push(taskChip(task, color(task, 'none'), 'tchip', '', `top:calc(${mid} + ${2 + k * MINI_TASK_PX}px)`)));
      if (d === now.day && now.min >= H0 && now.min < H1) html.push(`<div class="now" style="top:${(now.min - H0) * pct}%"></div>`);
      const cls = ['tw-col', d === t && 'today', isWeekend(d) && 'wkend'].filter(Boolean).join(' ');
      return `<div class="${cls}" data-date="${d}">${html.join('')}</div>`;
    });
    return `<div class="tw-week">
      <div class="tw-corner"></div>${heads.join('')}
      <div class="tw-adlabel" style="height:${strip.height}px"></div>${strip.html}
      <div class="tw-axis">${axis.join('')}</div>${bodies.join('')}
      <div class="stk-layer" aria-hidden="true"></div>
    </div>`;
  });
  return `<div class="tw" style="--hours:${(H1 - H0) / 60}">${weeks.join('')}</div>`;
}

function chip(occ, color, cls, html, style) {
  return `<div class="chip c-${color} ${cls}${occ.ev.tentative ? ' tent' : ''}" style="${style}" role="button" tabindex="0" data-id="${esc(occ.ev.id)}" data-date="${occ.date}">${html}</div>`;
}

// A task with a tick box. Ticking marks it done; anywhere else opens it.
function taskChip(task, color, cls, before, style) {
  const title = esc(task.title || '(No title)');
  // On the timelines, its notes on one line below (when they're shown).
  const notes = cls === 'tchip' && notesOn.tasks && task.notes?.trim() ? `<span class="tk-n">${esc(task.notes.trim())}</span>` : '';
  return `<div class="${cls} c-${color}${task.done ? ' done' : ''}${notes ? ' has-n' : ''}" style="${style}" role="button" tabindex="0" data-task="${esc(task.id)}"${task.dueTime ? '' : ' data-notime'} title="${title}${task.done ? ' (done)' : ''}">${before}<input type="checkbox" data-toggle="${esc(task.id)}" ${task.done ? 'checked' : ''} aria-label="Done"><span class="tk-t">${title}</span>${notes}</div>`;
}

// A deadline's flag checks it off, which crosses its name out.
function deadlineLine(occ, top, h24, color, below, labels) {
  const ev = occ.ev;
  const title = esc(ev.title || '(No title)');
  const due = ev.allDay ? 'due that day' : `due ${fmtTime(minOf(occ.start), h24)}`;
  const cls = ['dl', `c-${color}`, below && 'below', ev.allDay && 'day-end', isDone(occ) && 'done'].filter(Boolean).join(' ');
  // Its notes on one line under its name (when they're shown).
  const notes = notesOn.deadlines && ev.notes?.trim() ? `<span class="dl-n">${esc(ev.notes.trim())}</span>` : '';
  return `<div class="${cls}" style="top:${top}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}" title="${title}, ${due}"><span class="dl-tag${notes ? ' has-n' : ''}">${checkButton(occ, labels, 11)}<span class="ct">${title}</span>${notes}</span></div>`;
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

// Left and width of an event beside others. Events with something beside them
// stretch partly under it, so narrow columns stay readable; later columns are
// drawn on top.
function across(seg) {
  const left = (seg.col / seg.cols) * 100;
  const own = (seg.span / seg.cols) * 100;
  const width = seg.col + seg.span < seg.cols ? Math.min(100 - left, own * 1.7) : own;
  return `left:calc(${left}% + 1px);width:calc(${width}% - 3px);z-index:${1 + seg.col}`;
}

function eventBlock(seg, H0, ppm, h24, color, minPx = MIN_PX, labels = new Map()) {
  const { occ } = seg;
  const ev = occ.ev;
  const top = (seg.va - H0) * ppm;
  const height = Math.max((seg.vb - seg.va) * ppm, minPx);
  const short = height < 40;
  const title = esc(ev.title || '(No title)');
  const time = fmtTimeRange(minOf(occ.start), minOf(occ.end), h24);
  const repeat = ev.rrule || ev.seriesId ? `<span class="ev-rep" title="Repeats">${icons.repeat}</span>` : '';
  const cls = ['ev', `c-${color}`, ev.tentative && 'tent', short && 'short', seg.contTop && 'ct', seg.contBottom && 'cb'].filter(Boolean).join(' ');
  const style = `top:${top}px;height:${height}px;${across(seg)}`;
  // Short blocks put the title first and give it the room; the time only
  // shows in what's left over. Taller ones have the notes in the room left
  // below the time.
  const body = short
    ? `<span class="ev-t">${checkButton(occ, labels, 12)}${title}</span><span class="ev-m">${fmtTime(minOf(occ.start), h24)}</span>`
    : `<span class="ev-t">${checkButton(occ, labels, 12)}${title}</span><span class="ev-m">${time}${repeat}</span>${notesHtml(ev)}`;
  return `<div class="${cls}" style="${style}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}" title="${title}, ${time}${ev.tentative ? ' (tentative)' : ''}">${body}</div>`;
}

// An event's notes, in what room its block has left (main.js fitText fades
// them where they're cut off).
const notesHtml = (ev) => (notesOn.events && ev.notes?.trim() ? `<span class="ev-n">${esc(ev.notes.trim())}</span>` : '');

// In the 2-week view an event is a small block with its title and start time
// (on the next line when the title fills the first), then its notes.
function miniBlock(seg, H0, pct, h24, color, labels) {
  const { occ } = seg;
  const ev = occ.ev;
  const title = esc(ev.title || '(No title)');
  const time = fmtTimeRange(minOf(occ.start), minOf(occ.end), h24);
  const cls = ['ev', 'mini', `c-${color}`, ev.tentative && 'tent', seg.contTop && 'ct', seg.contBottom && 'cb'].filter(Boolean).join(' ');
  const style = `top:${(seg.va - H0) * pct}%;height:${(seg.vb - seg.va) * pct}%;${across(seg)}`;
  return `<div class="${cls}" style="${style}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}" title="${title}, ${time}${ev.tentative ? ' (tentative)' : ''}"><span class="ev-t">${checkButton(occ, labels, 9)}${title}</span><span class="ev-m">${bareTime(minOf(occ.start), h24)}</span>${notesHtml(ev)}</div>`;
}
