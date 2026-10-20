import { COLORS } from './util.js';

// Themes: the app's own Gelato Days and Gelato Nights (Light and Dark in
// css/app.css, picked by data-theme on <html>), more made from color palettes
// (PRESETS: seven from well-loved editor palettes, and light pastel ones),
// and any saved in the data by an earlier version's theme maker. A theme other than
// Light and Dark is { base: 'light' | 'dark', vars }, where `vars` has a
// color ('#rrggbb') for each CSS variable in KEYS and a percent for `fill`,
// `today-tint` and `work`; they go on <html> over the base's own. Which theme
// a device shows is one of its display settings.

export const KEYS = [
  'bg', 'bg-2', 'bg-3', 'line', 'fg', 'fg-2', 'fg-3', 'danger',
  'accent', 'accent-fg', 'accent-strong', 'accent-ink', 'now',
  ...COLORS.flatMap((c) => [`c-${c}`, `ink-${c}`]),
];

// ---------------------------------------------------------------- Colors

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// `a` moved `t` of the way to `b` (both '#rrggbb').
export function mix(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// '#rrggbb' to [hue 0–360, saturation 0–100, lightness 0–100], and back.
export function toHsl(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l * 100];
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, (d / (1 - Math.abs(2 * l - 1))) * 100, l * 100];
}
export function fromHsl(h, s, l) {
  s = Math.min(Math.max(s, 0), 100) / 100;
  l = Math.min(Math.max(l, 0), 100) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}
const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// ---------------------------------------------------------------- Pastel palettes

// Gelato Days' item colors (css/app.css :root): each one's pastel fill and its
// ink for text. A pastel theme starts from these.
const GELATO = {
  blue: ['#bcd8ec', '#2f5f84'], teal: ['#bfe6dd', '#23695c'], green: ['#d6e5bd', '#4d6b2a'],
  yellow: ['#f9e1a8', '#7a5a06'], orange: ['#ffdab4', '#8a4e14'], red: ['#ffc2ba', '#a33a2e'],
  pink: ['#ffcbe1', '#a3366a'], purple: ['#dcccec', '#6243a0'], gray: ['#ddd7d3', '#5e5853'],
};

// A light theme from a pastel palette (five or six colors) and its signature
// color, `accent`:
// - backgrounds and lines: near-white, tinted with its lightest color;
// - text: a deep shade of its darkest color;
// - each item color keeps its own hue, so labels stay easy to tell apart, but
//   is as soft as the palette's colors are, and takes the palette's own color
//   where one is close in hue (each palette color goes to one item color at
//   most, and only so close that the colors keep their order).
function pastel(id, name, palette, accent) {
  const cols = palette.map((hex) => ({ hex, hsl: toHsl(hex) }));
  const byL = [...cols].sort((a, b) => a.hsl[2] - b.hsl[2]);
  const [th, ts] = byL[byL.length - 1].hsl;
  const [dh, ds] = byL[0].hsl;
  const tint = (l, s) => fromHsl(th, Math.min(ts, s), l);
  const deep = (l, s) => fromHsl(dh, Math.min(ds, s), l);
  const colored = cols.filter(({ hsl: [, s, l] }) => s >= 12 && l >= 40 && l <= 95);
  const avgS = colored.reduce((n, c) => n + c.hsl[1], 0) / (colored.length || 1);
  const mood = Math.min(Math.max(avgS / 66, 0.5), 1);

  const hues = COLORS.filter((c) => c !== 'gray').map((c) => ({ c, h: toHsl(GELATO[c][0])[0] }));
  const reach = (f) => Math.min(22, ...hues.filter((g) => g !== f).map((g) => hueGap(f.h, g.h) / 2));
  // Only colors light enough to fill a block but not so light they're a
  // background; nearer in hue first, then nearer a pastel's lightness.
  const pairs = hues.flatMap((f) => cols.filter((p) => p.hsl[1] >= 25 && p.hsl[2] >= 55 && p.hsl[2] <= 90 && hueGap(f.h, p.hsl[0]) <= reach(f))
    .map((p) => ({ c: f.c, p, score: hueGap(f.h, p.hsl[0]) + Math.abs(p.hsl[2] - 84) / 4 })));
  const taken = new Map();
  for (const { c, p } of pairs.sort((a, b) => a.score - b.score)) {
    if (!taken.has(c) && ![...taken.values()].includes(p)) taken.set(c, p);
  }

  const [ah, as, al] = toHsl(accent);
  const accentFill = al >= 78 ? accent : fromHsl(ah, Math.max(as, 25), 82);
  const items = {};
  for (const c of COLORS) {
    const [fh, fs, fl] = toHsl(GELATO[c][0]);
    const [, is, il] = toHsl(GELATO[c][1]);
    if (c === 'gray') {
      // A truly neutral light color of the palette's, or a gray warmed by
      // its tint.
      const n = cols.filter(({ hsl: [, s2, l2] }) => s2 < 12 && l2 >= 70 && l2 <= 92).sort((a, b) => a.hsl[1] - b.hsl[1])[0];
      const [h, sat, l] = n ? n.hsl : [th, Math.min(ts * 0.5, 14), 84];
      items['c-gray'] = fromHsl(h, sat, l);
      items['ink-gray'] = fromHsl(h, Math.min(sat, 10), il);
      continue;
    }
    const p = taken.get(c);
    const [h, sat, l] = p ? [p.hsl[0], p.hsl[1], Math.min(Math.max(p.hsl[2], 76), 90)] : [fh, fs * mood, fl];
    // Colors not from the palette share a little of its accent, so they sit
    // together with it.
    items[`c-${c}`] = p ? fromHsl(h, sat, l) : mix(fromHsl(h, sat, l), accentFill, 0.15);
    items[`ink-${c}`] = fromHsl(h, is * Math.max(mood, 0.6), il);
  }

  const vars = {
    bg: tint(99.2, 60), 'bg-2': tint(97, 55), 'bg-3': tint(93.5, 38), line: tint(90.5, 28),
    fg: deep(16, 14), 'fg-2': deep(40, 10), 'fg-3': deep(61, 9),
    danger: '#c93a55',
    accent: accentFill,
    'accent-fg': fromHsl(ah, Math.min(Math.max(as, 40), 50), 20),
    'accent-strong': fromHsl(ah, Math.min(Math.max(as, 40), 70), 70),
    'accent-ink': fromHsl(ah, Math.min(Math.max(as, 45), 60), 38),
    now: fromHsl(ah, Math.min(Math.max(as, 55), 80), 60),
    ...items,
    fill: 100, 'today-tint': 14, work: 4,
  };
  return { id, name, base: 'light', pastel: true, vars };
}

// ---------------------------------------------------------------- Presets

// A preset from its palette: the surfaces and text, an accent color, and one
// palette color for each item color. On a light theme an item's fill is a
// pale tint of its color and its text a deep shade of it; on a dark one the
// color itself is both (as in Dark).
function preset(id, name, base, p) {
  const light = base === 'light';
  const accent = light
    ? { accent: mix(p.accent, '#ffffff', 0.7), 'accent-fg': mix(p.accent, '#000000', 0.55), 'accent-strong': mix(p.accent, '#ffffff', 0.25), 'accent-ink': p.accent }
    : { accent: p.accent, 'accent-fg': p.bg, 'accent-strong': p.accent, 'accent-ink': p.accent };
  const items = Object.fromEntries(COLORS.flatMap((c) => {
    const col = p.items[c];
    return light ? [[`c-${c}`, mix(col, '#ffffff', 0.68)], [`ink-${c}`, mix(col, '#000000', 0.35)]] : [[`c-${c}`, col], [`ink-${c}`, col]];
  }));
  const vars = {
    bg: p.bg, 'bg-2': p.bg2, 'bg-3': p.bg3, line: p.line, fg: p.fg, 'fg-2': p.fg2, 'fg-3': p.fg3,
    danger: p.danger, now: p.now, ...accent, ...items,
    fill: light ? 100 : 30, 'today-tint': light ? 14 : 8, work: light ? 4 : 3,
  };
  return { id, name, base, vars };
}

const ITEMS = (blue, teal, green, yellow, orange, red, pink, purple, gray) => ({ blue, teal, green, yellow, orange, red, pink, purple, gray });

// Palettes: Catppuccin (catppuccin.com), Rosé Pine (rosepinetheme.com), Nord
// (nordtheme.com), Everforest and Tokyo Night. Where a palette has no color
// for one of the nine, a neighbor is mixed in.
export const PRESETS = [
  preset('preset-latte', 'Latte', 'light', {
    bg: '#eff1f5', bg2: '#e6e9ef', bg3: '#dce0e8', line: '#ccd0da', fg: '#4c4f69', fg2: '#6c6f85', fg3: '#9ca0b0',
    danger: '#d20f39', now: '#e64553', accent: '#8839ef',
    items: ITEMS('#1e66f5', '#179299', '#40a02b', '#df8e1d', '#fe640b', '#d20f39', '#ea76cb', '#8839ef', '#8c8fa1'),
  }),
  preset('preset-dawn', 'Rosé Dawn', 'light', {
    bg: '#fffaf3', bg2: '#faf4ed', bg3: '#f2e9e1', line: '#dfdad9', fg: '#575279', fg2: '#797593', fg3: '#9893a5',
    danger: '#b4637a', now: '#b4637a', accent: '#d7827e',
    items: ITEMS('#286983', '#56949f', '#6d8f5e', '#ea9d34', mix('#ea9d34', '#d7827e', 0.5), '#b4637a', '#d7827e', '#907aa9', '#9893a5'),
  }),
  preset('preset-nord-light', 'Nord Snow', 'light', {
    bg: '#eceff4', bg2: '#e5e9f0', bg3: '#d8dee9', line: '#d0d7e2', fg: '#2e3440', fg2: '#4c566a', fg3: '#7b8394',
    danger: '#bf616a', now: '#bf616a', accent: '#5e81ac',
    items: ITEMS('#5e81ac', '#8fbcbb', '#a3be8c', '#ebcb8b', '#d08770', '#bf616a', mix('#b48ead', '#bf616a', 0.4), '#b48ead', '#4c566a'),
  }),
  preset('preset-mocha', 'Mocha', 'dark', {
    bg: '#1e1e2e', bg2: '#181825', bg3: '#313244', line: '#2a2b3c', fg: '#cdd6f4', fg2: '#a6adc8', fg3: '#6c7086',
    danger: '#f38ba8', now: '#f38ba8', accent: '#cba6f7',
    items: ITEMS('#89b4fa', '#94e2d5', '#a6e3a1', '#f9e2af', '#fab387', '#f38ba8', '#f5c2e7', '#cba6f7', '#9399b2'),
  }),
  preset('preset-rose-pine', 'Rosé Pine', 'dark', {
    bg: '#191724', bg2: '#1f1d2e', bg3: '#26233a', line: '#2a2739', fg: '#e0def4', fg2: '#908caa', fg3: '#6e6a86',
    danger: '#eb6f92', now: '#eb6f92', accent: '#ebbcba',
    items: ITEMS('#9ccfd8', mix('#31748f', '#9ccfd8', 0.5), '#b5c99a', '#f6c177', mix('#f6c177', '#eb6f92', 0.45), '#eb6f92', '#ebbcba', '#c4a7e7', '#908caa'),
  }),
  preset('preset-everforest', 'Everforest', 'dark', {
    bg: '#2d353b', bg2: '#343f44', bg3: '#3d484d', line: '#414b50', fg: '#d3c6aa', fg2: '#9da9a0', fg3: '#7a8478',
    danger: '#e67e80', now: '#e69875', accent: '#a7c080',
    items: ITEMS('#7fbbb3', '#83c092', '#a7c080', '#dbbc7f', '#e69875', '#e67e80', mix('#d699b6', '#ffffff', 0.25), '#d699b6', '#9da9a0'),
  }),
  preset('preset-tokyo', 'Tokyo Night', 'dark', {
    bg: '#1a1b26', bg2: '#16161e', bg3: '#292e42', line: '#24283b', fg: '#c0caf5', fg2: '#a9b1d6', fg3: '#565f89',
    danger: '#f7768e', now: '#ff9e64', accent: '#7aa2f7',
    items: ITEMS('#7aa2f7', '#73daca', '#9ece6a', '#e0af68', '#ff9e64', '#f7768e', mix('#bb9af7', '#f7768e', 0.5), '#bb9af7', '#a9b1d6'),
  }),
  // Light themes from pastel palettes, each with its signature color as the
  // accent (most from Design Pixie; Blues is ColorBrewer's).
  pastel('preset-lazy-days', 'Lazy Days', ['#97b3ae', '#d2e0d3', '#f0ddd6', '#f2c3b9', '#d6cbbf', '#f0eeea'], '#f2c3b9'),
  pastel('preset-lilac-dreamer', 'Lilac Dreamer', ['#c8ceee', '#e8daf0', '#f3e4f5', '#fcdce1', '#d8bee5', '#a7abde'], '#d8bee5'),
  pastel('preset-summer-energy', 'Summer Energy', ['#ffcce1', '#f2f1ed', '#cde5d9', '#f2ebcc', '#c6e2e7', '#f7dde8'], '#c6e2e7'),
  pastel('preset-feeling-fall', 'Feeling Fall', ['#ffd4d9', '#deb499', '#f9ede1', '#ffcabe', '#fce0d2', '#f7c5ad'], '#f7c5ad'),
  pastel('preset-sweet-sunset', 'Sweet Sunset', ['#fec3e1', '#ffceda', '#ffdad5', '#ffe7cf', '#fef1c8', '#f9f1eb'], '#fec3e1'),
  pastel('preset-sophisticated-city', 'Sophisticated City', ['#9babbe', '#d0d9e2', '#c3c2d5', '#ebe2dd', '#d9c8bf', '#dedde7'], '#9babbe'),
  pastel('preset-in-the-sunshine', 'In The Sunshine', ['#f0e2c3', '#dcece9', '#f2eae0', '#f6c7b3', '#c3dedd', '#82b2c0'], '#f6c7b3'),
  pastel('preset-garden-party', 'Garden Party', ['#f9c7d4', '#859e91', '#c3d0a8', '#f0eee2', '#f7e0e4', '#99ac73'], '#c3d0a8'),
  pastel('preset-periwinkle-cloud', 'Periwinkle Cloud', ['#a7abde', '#f5e8e1', '#f9f4f8', '#ced1f8', '#bcc0d3', '#e2e3f2'], '#a7abde'),
  pastel('preset-enchanting-forest', 'Enchanting Forest', ['#c3dcd8', '#efd1d4', '#fbe8ed', '#dbd9da', '#c5bd96', '#93b0ac'], '#c3dcd8'),
  pastel('preset-toned-down', 'Toned Down', ['#f5e8e1', '#e5d6cd', '#f7f2ef', '#dcc3b4', '#d2dae3', '#e8ebee'], '#dcc3b4'),
  pastel('preset-smoothie-bar', 'Smoothie Bar', ['#ffd8d7', '#fff2f1', '#ffa7a6', '#ffdcdb', '#d4e0ee', '#b0c7e3'], '#ffa7a6'),
  pastel('preset-blues', 'Blues', ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'], '#6baed6'),
  pastel('preset-cafe-mocha', 'Cafe Mocha', ['#f2e7db', '#dec4af', '#c0a189', '#9f7c63', '#735741', '#4b3727'], '#dec4af'),
  pastel('preset-pastel-coffee-shop', 'Pastel Coffee Shop', ['#f2a6ab', '#c1dcc7', '#fbfae4', '#f4ceae', '#c1938a'], '#f2a6ab'),
];
export const presetOf = (id) => PRESETS.find((p) => p.id === id) || null;

// ---------------------------------------------------------------- Applying

// The CSS variables a theme sets on <html>. The hover, soft and line tones are
// mixed from its colors.
export function cssVars(base, vars) {
  const out = {};
  const num = (k) => Number.isFinite(vars[k]);
  for (const k of KEYS) if (vars[k]) out[k] = vars[k];
  if (num('fill')) out.fill = `${vars.fill}%`;
  if (num('today-tint')) out['today-tint'] = `${vars['today-tint']}%`;
  if (num('work')) out.work = `color-mix(in srgb, var(--fg) ${vars.work}%, transparent)`;
  out['bg-hover'] = 'color-mix(in srgb, var(--bg-3) 50%, var(--bg))';
  out['line-soft'] = 'color-mix(in srgb, var(--line) 50%, var(--bg))';
  out['accent-soft'] = `color-mix(in srgb, var(--accent) ${base === 'dark' ? 15 : 40}%, var(--bg))`;
  return out;
}

// Shows a theme: Light or Dark alone, or with a theme's own variables (from
// cssVars) on top.
export function applyTheme(base, css) {
  const root = document.documentElement;
  root.dataset.theme = base;
  root.removeAttribute('style');
  for (const [k, v] of Object.entries(css || {})) root.style.setProperty(`--${k}`, v);
  // The phone's status bar matches the background.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.removeAttribute('media');
    m.content = bg;
  }
}
