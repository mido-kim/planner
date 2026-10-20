import { COLORS } from './util.js';

// Themes: the built-in Light and Dark (css/app.css, picked by data-theme on
// <html>), and themes you make in the theme maker. A theme you make is
// { id, name, base: 'light' | 'dark', vars, createdAt, updatedAt }, where
// `vars` has a color ('#rrggbb') for each part below and a percent for each
// amount. Saved themes are kept with your data, so they sync; which theme a
// device shows is one of its display settings.

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// [group, [[css variable, name], …]]
export const PARTS = [
  ['Surfaces', [['bg', 'Background'], ['bg-2', 'Panels and weekends'], ['bg-3', 'Buttons and tracks'], ['line', 'Lines']]],
  ['Text', [['fg', 'Text'], ['fg-2', 'Secondary text'], ['fg-3', 'Faint text'], ['danger', 'Overdue and delete']]],
  ['Accent', [['accent', 'Accent (buttons, today)'], ['accent-fg', 'Text on the accent'], ['accent-strong', 'Switches and focus'], ['accent-ink', 'Links and accent text'], ['now', 'Now line']]],
  ['Item colors', COLORS.flatMap((c) => [[`c-${c}`, `${cap(c)}`], [`ink-${c}`, `${cap(c)} text`]])],
];
// [css variable, name, min, max] in percent
export const AMOUNTS = [['fill', 'Item fill strength', 0, 100], ['today-tint', 'Today highlight', 0, 40], ['work', 'Working hours shade', 0, 12]];
const KEYS = PARTS.flatMap(([, parts]) => parts.map(([k]) => k));

// ---------------------------------------------------------------- Colors

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// '#rgb', '#rrggbb' or 'rgb(a)(…)' → '#rrggbb'
export function toHex(css) {
  const s = String(css).trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return `#${m.slice(1, 4).map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
}

// '#rrggbb' → { h: 0–360, s: 0–100, l: 0–100 }
export function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }) {
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}

// A dark background makes a dark theme: native controls (date pickers,
// scrollbars) and shadows follow it.
export const baseOf = (vars) => (hexToHsl(vars.bg).l < 50 ? 'dark' : 'light');

// ---------------------------------------------------------------- Applying

// The colors of the built-in Light or Dark theme, as a starting point.
export function builtIn(base) {
  const root = document.documentElement;
  const style = root.getAttribute('style');
  const was = root.dataset.theme;
  root.removeAttribute('style');
  root.dataset.theme = base;
  const cs = getComputedStyle(root);
  const read = (k) => cs.getPropertyValue(`--${k}`).trim();
  const vars = Object.fromEntries(KEYS.map((k) => [k, toHex(read(k))]));
  vars.fill = parseFloat(read('fill'));
  vars['today-tint'] = parseFloat(read('today-tint'));
  vars.work = Math.round(parseFloat(read('work').split(',')[3] || '0.04') * 1000) / 10;
  if (was) root.dataset.theme = was;
  else delete root.dataset.theme;
  if (style !== null) root.setAttribute('style', style);
  return vars;
}

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
