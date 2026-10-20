import { diffDays } from '../dates.js';
import { esc } from '../util.js';

// All-day events and events that cover more than one day are drawn as bars
// across their days: in the all-day row of the timeline, and in the month and
// 2-week grids. Each bar gets a lane (row), so bars that share a day don't
// overlap. A bar that runs past the days shown is cut at the edge.

export const SHAPES = ['block', 'arrow', 'line'];

// items: [{ first, last, title, ... }] with first and last as inclusive dates.
// days: consecutive dates. Returns the pieces that show, as
// { item, a, b, lane, contL, contR } with a and b as day indexes (inclusive),
// plus how many lanes there are and how many each day needs (`used`).
export function layoutBars(items, days) {
  const n = days.length;
  const segs = [];
  for (const item of items) {
    const a = Math.max(0, diffDays(days[0], item.first));
    const b = Math.min(n - 1, diffDays(days[0], item.last));
    if (b < a) continue;
    segs.push({ item, a, b, contL: item.first < days[0], contR: item.last > days[n - 1] });
  }
  // Earlier first, then longer first, so long bars stay on top.
  segs.sort((x, y) => x.a - y.a || y.b - y.a - (x.b - x.a) || (x.item.title || '').localeCompare(y.item.title || ''));
  const laneEnds = [];
  for (const s of segs) {
    let lane = laneEnds.findIndex((end) => end < s.a);
    if (lane < 0) lane = laneEnds.push(-1) - 1;
    laneEnds[lane] = s.b;
    s.lane = lane;
  }
  const used = days.map((_, i) => segs.reduce((m, s) => (s.a <= i && s.b >= i ? Math.max(m, s.lane + 1) : m), 0));
  return { segs, lanes: laneEnds.length, used };
}

// One bar. `top` is a CSS length; `label` is HTML, and `check` the symbol
// that goes in front of it. The shape is the event's choice: a filled block, a
// line with arrowheads at both ends, or a plain line.
export function barHtml(seg, { n, top, label, color, check = '' }) {
  const { occ } = seg.item;
  const ev = occ.ev;
  const shape = SHAPES.includes(ev.shape) ? ev.shape : 'block';
  const cls = ['bar', `c-${color}`, `shape-${shape}`, ev.tentative && 'tent', seg.contL && 'cl', seg.contR && 'cr'].filter(Boolean).join(' ');
  const style = `left:calc(${seg.a} * 100% / ${n} + var(--bar-pad));width:calc(${seg.b - seg.a + 1} * 100% / ${n} - 2 * var(--bar-pad));top:${top}`;
  const title = esc(ev.title || '(No title)');
  return `<div class="${cls}" style="${style}" role="button" tabindex="0" data-id="${esc(ev.id)}" data-date="${occ.date}" title="${title}${ev.tentative ? ' (tentative)' : ''}"><i class="bar-l"></i><span class="bar-t">${check}${label}</span><i class="bar-r"></i></div>`;
}
