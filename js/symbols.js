import { esc } from './util.js';

// The little symbol in front of an event's name: tap it to check the event
// off (went, done, attended). Outline until then, filled in after. A label
// can have a symbol for its events, and one event can have its own; without
// either it's a square check box. A deadline's symbol is always its flag.
//
// Checked events and deadlines keep the dates they were checked on in
// `doneDates`, so each date of a repeating one is checked separately.
//
// Each symbol is drawn in a 24-unit square from up to three kinds of parts:
//   s: the shape, filled in once checked
//   d: lines inside the shape, which turn light once it's filled
//   k: a tick inside the shape, only once checked
//   (no class): lines outside the shape, always drawn

const SYM = {
  check: ['Check box', '<rect class="s" x="4" y="4" width="16" height="16" rx="4"/><path class="k" d="M8.5 12.5l2.5 2.5 4.5-5"/>'],
  circle: ['Circle', '<circle class="s" cx="12" cy="12" r="8"/><path class="k" d="M8.5 12.5l2.5 2.5 4.5-5"/>'],
  heart: ['Heart', '<path class="s" d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>'],
  star: ['Star', '<path class="s" d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'],
  sparkle: ['Sparkle', '<path class="s" d="M12 3.5c.7 4.6 2.6 6.5 7.5 7.5-4.9 1-6.8 2.9-7.5 7.5-.7-4.6-2.6-6.5-7.5-7.5 4.9-1 6.8-2.9 7.5-7.5z"/>'],
  chat: ['Speech bubble', '<path class="s" d="M6 5h12a2.5 2.5 0 0 1 2.5 2.5v6.5a2.5 2.5 0 0 1-2.5 2.5h-6.5L7 20v-3.5H6A2.5 2.5 0 0 1 3.5 14V7.5A2.5 2.5 0 0 1 6 5z"/>'],
  book: ['Book', '<path class="s" d="M3.5 6c2.8-1.4 5.7-1.3 8.5.6 2.8-1.9 5.7-2 8.5-.6v13c-2.8-1.4-5.7-1.3-8.5.6-2.8-1.9-5.7-2-8.5-.6z"/><path class="d" d="M12 6.6v12.8"/>'],
  bulb: ['Light bulb', '<path class="s" d="M9 16c0-1.7-.7-2.7-1.7-3.9a5.3 5.3 0 1 1 9.4 0c-1 1.2-1.7 2.2-1.7 3.9z"/><path d="M9.5 19h5M10.5 21.5h3"/>'],
  beaker: ['Beaker', '<path class="s" d="M10 3.5h4v5.3l4.8 8.7a2.3 2.3 0 0 1-2 3.5H7.2a2.3 2.3 0 0 1-2-3.5L10 8.8z"/><path d="M8.5 3.5h7"/><path class="d" d="M7.3 15h9.4"/>'],
  bolt: ['Lightning', '<path class="s" d="M13.5 3L5 13.5h6.2L10.5 21 19 10.5h-6.2z"/>'],
  music: ['Music', '<path d="M9 17.5V5.5l10-2v12"/><circle class="s" cx="6.5" cy="17.5" r="2.5"/><circle class="s" cx="16.5" cy="15.5" r="2.5"/>'],
  coffee: ['Coffee', '<path class="s" d="M4.5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M15.5 10.5h1.3a2.5 2.5 0 0 1 0 5h-1.6M8 3.5v2.5M11.5 3.5v2.5"/>'],
  leaf: ['Leaf', '<path class="s" d="M5 19.5C4.5 10 9.5 5 20 4.5c-.3 10.3-5.5 15.4-15 15z"/><path class="d" d="M5 19.5c3.5-5 7-8.5 11-11"/>'],
  dumbbell: ['Dumbbell', '<path d="M8 12h8"/><rect class="s" x="3" y="7.5" width="5" height="9" rx="1.5"/><rect class="s" x="16" y="7.5" width="5" height="9" rx="1.5"/>'],
  smile: ['Smile', '<circle class="s" cx="12" cy="12" r="8.5"/><path class="d" d="M9 10v.5M15 10v.5M8.5 14a4.5 4.5 0 0 0 7 0"/>'],
  bookmark: ['Bookmark', '<path class="s" d="M7 3.5h10v17l-5-3.6-5 3.6z"/>'],
  flag: ['Flag', '<path d="M5.5 21V4"/><path class="s" d="M5.5 4.5h11.5l-2.4 4.3 2.4 4.2H5.5z"/>'],
};

// Symbols to pick from, in order (the flag is for deadlines only).
export const SYMBOLS = Object.keys(SYM).filter((k) => k !== 'flag');
export const symbolName = (key) => SYM[key]?.[0] || 'Check box';

export const symbolSvg = (key, size = 14) =>
  `<svg class="sym-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(SYM[key] || SYM.check)[1]}</svg>`;

// The symbol an event shows: its own, its label's, or the check box.
export function symbolOf(ev, labels) {
  if (ev.kind === 'deadline') return 'flag';
  const own = SYM[ev.symbol] ? ev.symbol : null;
  const label = ev.labelId ? labels.get(ev.labelId) : null;
  return own || (SYM[label?.symbol] ? label.symbol : 'check');
}

export const isDone = (occ) => !!occ.ev.doneDates?.includes(occ.date);

// The write that checks an occurrence off, or un-checks it.
export function doneOps(ev, date, done) {
  const dates = new Set(ev.doneDates || []);
  if (done) dates.add(date);
  else dates.delete(date);
  return [{ op: 'put', coll: 'events', obj: { ...ev, doneDates: [...dates].sort(), updatedAt: Date.now() } }];
}

// The tappable symbol for an occurrence.
export function checkButton(occ, labels, size = 14) {
  const key = symbolOf(occ.ev, labels);
  const done = isDone(occ);
  const what = occ.ev.kind === 'deadline' ? 'Done' : symbolName(key);
  return `<button type="button" class="sym${done ? ' on' : ''}" data-check="${esc(occ.ev.id)}" data-date="${occ.date}" aria-pressed="${done}" aria-label="${what}" title="${done ? 'Checked off' : 'Check off'}">${symbolSvg(key, size)}</button>`;
}
