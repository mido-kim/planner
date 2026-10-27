// Stickers: little pictures stuck anywhere on the calendar.
//
// A sticker is a picture: { id, name, src, w, h } in the `stickers`
// collection (`src` a data URL), or one of BUILT_IN, which ship with the app.
// A placement says where one is stuck: { id, stickerId, size, at, … } in the
// `placements` collection, where `at` is
//   'time'  on the timelines (day, week and 2 weeks): on day `date`, at `min`
//           (minutes on that day's timeline) and `x` (0–1 across the day);
//   'event' on an event's block, `fx` and `fy` across and down it (0–1, or
//           past its edges), on any of the event's blocks, or for a repeating
//           event the one on `date` (`following`: that one and all later
//           ones); `col` is how many days after the event's date the block
//           is, for an event that runs past midnight;
//   'month' on the month view's day `date`, `fx` and `fy` across and down its
//           box.
// `rot` is how far it's turned, clockwise in degrees (steps of 15; none if
// missing).
// A timeline sticker is so many hours tall, so it grows and shrinks with the
// events and keeps its place among them in every timeline view. A month
// sticker goes with the size of the day boxes and shows only in the month
// view.

export const BUILT_IN = [
  { id: 'builtin-glitter-star', name: 'Glitter star', src: 'stickers/glitter-star.webp', w: 320, h: 307 },
];

export const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
const HOURS = { s: 0.6, m: 1, l: 2 }; // timelines: how many hours tall
const CELL = { s: 0.22, m: 0.35, l: 0.55 }; // month: share of a day box's height

// Width and height on screen: `unit` is an hour (timelines) or a day box's
// height (month), in pixels. The longer side gets the size.
export function stickerBox(sticker, size, unit, month = false) {
  const side = (month ? CELL : HOURS)[size in HOURS ? size : 'm'] * unit;
  const k = side / Math.max(sticker.w || 1, sticker.h || 1);
  return [(sticker.w || 1) * k, (sticker.h || 1) * k];
}

// Whether a placement stuck on an event goes on the block of `ev` for the
// occurrence on `date`. An occurrence changed by itself is its own event,
// still known by its series and original date.
export function onOccurrence(p, ev, date) {
  const when = (d) => !p.date || (p.following ? d >= p.date : d === p.date);
  if (p.eventId === ev.id) return when(date);
  return !!(p.date && ev.seriesId && ev.seriesId === p.eventId && when(ev.originalDate));
}

// ---------------------------------------------------------------- Pictures

// Makes the background of a picture see-through: the color along its edges,
// spreading inward through pixels close to it, with a soft edge where the
// picture begins. Works on canvas pixel data (RGBA) in place; returns false
// when the edges are already see-through (nothing to do).
export function clearBackground(data, w, h, { near = 28, soft = 90 } = {}) {
  const at = (x, y) => (y * w + x) * 4;
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(at(x, 0), at(x, h - 1));
  for (let y = 0; y < h; y++) edge.push(at(0, y), at(w - 1, y));
  if (edge.filter((i) => data[i + 3] < 32).length > edge.length / 2) return false;
  const middle = (k) => edge.map((i) => data[i + k]).sort((a, b) => a - b)[edge.length >> 1];
  const [r, g, b] = [middle(0), middle(1), middle(2)];
  const seen = new Uint8Array(w * h);
  const todo = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) return;
    seen[y * w + x] = 1;
    todo.push(x, y);
  };
  for (let x = 0; x < w; x++) visit(x, 0), visit(x, h - 1);
  for (let y = 0; y < h; y++) visit(0, y), visit(w - 1, y);
  while (todo.length) {
    const y = todo.pop();
    const x = todo.pop();
    const i = at(x, y);
    const d = Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b);
    if (d <= near) {
      data[i + 3] = 0;
      visit(x + 1, y), visit(x - 1, y), visit(x, y + 1), visit(x, y - 1);
    } else if (d < soft) {
      data[i + 3] = Math.min(data[i + 3], Math.round((255 * (d - near)) / (soft - near)));
    }
  }
  return true;
}

// The box around the part of a picture that shows: [x, y, w, h].
export function visibleBox(data, w, h) {
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? [0, 0, w, h] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

const MAX_SIDE = 320; // pixels kept: sharp at the largest size, small to sync

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('That file couldn’t be opened as a picture.'));
  };
  img.src = url;
});

// A picture file made into a sticker: its background cleared (unless
// `clear` is false), cut to what shows, and at most MAX_SIDE pixels.
// Resolves with { src, w, h, cleared }.
export async function makeSticker(file, clear = true) {
  const img = await loadImage(file);
  const k = Math.min(1, (MAX_SIDE * 2) / Math.max(img.naturalWidth, img.naturalHeight));
  const [w, h] = [Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k))];
  const work = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const wc = work.getContext('2d', { willReadFrequently: true });
  wc.drawImage(img, 0, 0, w, h);
  const px = wc.getImageData(0, 0, w, h);
  const cleared = clear && clearBackground(px.data, w, h);
  wc.putImageData(px, 0, 0);
  const [bx, by, bw, bh] = visibleBox(px.data, w, h);
  const s = Math.min(1, MAX_SIDE / Math.max(bw, bh));
  const out = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bw * s)), height: Math.max(1, Math.round(bh * s)) });
  const oc = out.getContext('2d');
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(work, bx, by, bw, bh, 0, 0, out.width, out.height);
  // WebP is much smaller; browsers that can't write it give PNG.
  let src = out.toDataURL('image/webp', 0.9);
  if (!src.startsWith('data:image/webp')) src = out.toDataURL('image/png');
  return { src, w: out.width, h: out.height, cleared };
}
