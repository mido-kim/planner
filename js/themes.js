import { COLORS } from './util.js';

// Themes: the app's own Light and Dark (css/app.css, picked by data-theme on
// <html>), seven more made from well-loved color palettes (PRESETS), and any
// saved in the data by an earlier version's theme maker. A theme other than
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
