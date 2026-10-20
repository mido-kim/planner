import { addDays } from './dates.js';
import { toRRule } from './recurrence.js';
import { isIOS } from './util.js';

// Backups (.json, everything, restorable here) and .ics export (events and
// deadlines, opens in Google Calendar, Apple Calendar, Outlook and others).

export function backupFile(events, tasks, labels = new Map(), themes = new Map()) {
  const now = new Date();
  const text = JSON.stringify(
    {
      app: 'planner', version: 1, exportedAt: now.toISOString(),
      events: [...events.values()], tasks: [...tasks.values()], labels: [...labels.values()], themes: [...themes.values()],
    },
    null,
    1,
  );
  return { name: `planner-backup-${now.toISOString().slice(0, 10)}.json`, text };
}

export function parseBackup(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    d = null;
  }
  if (!d || d.app !== 'planner' || !Array.isArray(d.events) || !Array.isArray(d.tasks)) {
    throw new Error('That file isn’t a planner backup.');
  }
  const okEvent = (e) => e && typeof e.id === 'string' && typeof e.start === 'string' && typeof e.end === 'string';
  const okTask = (t) => t && typeof t.id === 'string' && typeof t.title === 'string';
  const okLabel = (l) => l && typeof l.id === 'string' && typeof l.name === 'string';
  const okTheme = (t) => okLabel(t) && t.vars && typeof t.vars === 'object';
  // Backups from before 0.3.0 have no labels, and from before 0.6.0 no themes.
  const labels = Array.isArray(d.labels) ? d.labels.filter(okLabel) : [];
  const themes = Array.isArray(d.themes) ? d.themes.filter(okTheme) : [];
  return { exportedAt: d.exportedAt, events: d.events.filter(okEvent), tasks: d.tasks.filter(okTask), labels, themes };
}

const text = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (d) => d.replaceAll('-', '');
const prop = (name, v, allDay) => (allDay ? `${name};VALUE=DATE:${day(v)}` : `${name}:${day(v.slice(0, 10))}T${v.slice(11, 13)}${v.slice(14, 16)}00`);

// iCalendar lines are at most 75 bytes; longer ones continue after a space.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function icsFile(events, labels = new Map()) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const all = [...events.values()];
  const series = new Map(all.filter((e) => e.rrule).map((e) => [e.id, e]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Personal Planner//EN', 'CALSCALE:GREGORIAN'];
  for (const ev of all) {
    const master = ev.seriesId ? series.get(ev.seriesId) : null;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${master ? master.id : ev.id}@planner`,
      `DTSTAMP:${stamp}`,
      prop('DTSTART', ev.start, ev.allDay),
    );
    // All-day end dates are exclusive in iCalendar. A deadline has no end, which
    // iCalendar reads as an event that takes no time.
    if (ev.kind !== 'deadline') lines.push(prop('DTEND', ev.allDay ? addDays(ev.end, 1) : ev.end, ev.allDay));
    if (master) {
      lines.push(prop('RECURRENCE-ID', master.allDay ? ev.originalDate : ev.originalDate + master.start.slice(10), master.allDay));
    }
    if (ev.rrule) {
      lines.push(`RRULE:${toRRule(ev.rrule, ev.start, ev.allDay)}`);
      // Changed occurrences are exported as overrides, not as removed dates.
      const changed = new Set(all.filter((e) => e.seriesId === ev.id).map((e) => e.originalDate));
      for (const d of ev.exdates || []) {
        if (!changed.has(d)) lines.push(prop('EXDATE', ev.allDay ? d : d + ev.start.slice(10), ev.allDay));
      }
    }
    if (ev.tentative) lines.push('STATUS:TENTATIVE');
    lines.push(`SUMMARY:${text(ev.title || '(No title)')}`);
    if (ev.notes) lines.push(`DESCRIPTION:${text(ev.notes)}`);
    const label = ev.labelId && labels.get(ev.labelId);
    if (label) lines.push(`CATEGORIES:${text(label.name)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Saves a file: the share sheet on iPhone/iPad (where "Save to Files" lives),
// a normal download elsewhere. Resolves false if the user cancels.
export async function saveFile(name, content, type) {
  const file = new File([content], name, { type });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
