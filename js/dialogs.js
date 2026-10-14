import { absMin, addDays, dateOf, diffDays, dt, fmt, fromAbsMin, minOf, parseTime, parts, timeValue, weekday } from './dates.js';
import { icons } from './icons.js';
import { describeRule, inLastWeekOfMonth, nthOf, ORDINALS, ruleKey, WEEKDAYS, WEEKDAYS_SHORT } from './recurrence.js';
import { COLORS, esc } from './util.js';
import { VERSION } from './version.js';

// Shows a dialog and resolves with the value passed to `finish`, or null when
// it's dismissed with Escape (or a backdrop click, if allowed).
function run(className, html, setup, { backdropCloses = false } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = className;
  dlg.innerHTML = html;
  document.body.append(dlg);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    if (backdropCloses) dlg.addEventListener('click', (e) => e.target === dlg && finish(null));
    dlg.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => finish(null)));
    setup(dlg, finish);
    dlg.showModal();
  });
}

const fieldRow = (label, control, cls = '') =>
  `<div class="field-row ${cls}"><span class="lbl">${label}</span><div class="ctl">${control}</div></div>`;

// ---------------------------------------------------------------- Repeat presets

function repeatOptions(date) {
  const wd = WEEKDAYS[weekday(date)];
  const nth = nthOf(date);
  const opts = [
    ['none', 'Does not repeat'],
    ['daily', 'Every day'],
    ['weekly', `Every week on ${wd}`],
    ['weekdays', 'Every weekday (Mon–Fri)'],
    ['monthly-day', `Every month on day ${parts(date).d}`],
  ];
  if (nth <= 4) opts.push(['monthly-nth', `Every month on the ${ORDINALS[nth]} ${wd}`]);
  if (inLastWeekOfMonth(date)) opts.push(['monthly-last', `Every month on the last ${wd}`]);
  opts.push(['yearly', `Every year on ${fmt(date, { month: 'long', day: 'numeric' })}`], ['custom', 'Custom…']);
  return opts;
}

function presetRule(key, date) {
  switch (key) {
    case 'daily': return { freq: 'daily', interval: 1 };
    case 'weekly': return { freq: 'weekly', interval: 1, byWeekday: [weekday(date)] };
    case 'weekdays': return { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    case 'monthly-day': return { freq: 'monthly', interval: 1, monthlyBy: 'day' };
    case 'monthly-nth': return { freq: 'monthly', interval: 1, monthlyBy: 'nth', nth: nthOf(date) };
    case 'monthly-last': return { freq: 'monthly', interval: 1, monthlyBy: 'nth', nth: -1 };
    case 'yearly': return { freq: 'yearly', interval: 1 };
  }
  return null;
}

function presetKeyOf(rule, date) {
  if (!rule) return 'none';
  const ends = { until: rule.until || null, count: rule.count || null };
  for (const [key] of repeatOptions(date)) {
    const p = presetRule(key, date);
    if (p && ruleKey({ ...p, ...ends }) === ruleKey(rule)) return key;
  }
  return 'custom';
}

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v) || lo));

// ---------------------------------------------------------------- Event editor

// Resolves with { action: 'save', form, scope } or { action: 'delete', scope },
// or null if cancelled. `scope` is null unless the event repeats.
export function eventEditor({ initial, isNew, repeating, settings }) {
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + settings.weekStart) % 7);
  const html = `
  <form class="dlg editor" novalidate>
    <div class="dlg-head">
      <input class="title-input" name="title" placeholder="Add title" autocomplete="off" maxlength="200" aria-label="Title">
      <button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button>
    </div>
    <div class="dlg-body">
      <label class="field-row toggle-row"><span class="lbl">All day</span><input type="checkbox" name="allDay" class="switch"></label>
      <label class="field-row toggle-row"><span class="lbl">Tentative <span class="hint">(shown lightly, dashed outline)</span></span><input type="checkbox" name="tentative" class="switch"></label>
      ${fieldRow('Starts', '<input type="date" name="startDate" required><input type="time" name="startTime" class="time">', 'dt-row')}
      ${fieldRow('Ends', '<input type="date" name="endDate" required><input type="time" name="endTime" class="time">', 'dt-row')}
      ${fieldRow('Repeat', '<select name="repeat"></select>')}
      <div class="repeat-more">
        <div class="custom">
          ${fieldRow('Every', `<input type="number" name="interval" min="1" max="99" inputmode="numeric" class="num">
            <select name="freq"><option value="daily">day(s)</option><option value="weekly">week(s)</option><option value="monthly">month(s)</option><option value="yearly">year(s)</option></select>`)}
          ${fieldRow('On', `<div class="wd-group">${order.map((i) => `<button type="button" class="wd" data-wd="${i}" title="${WEEKDAYS[i]}">${WEEKDAYS_SHORT[i].slice(0, 2)}</button>`).join('')}</div>`, 'weekly-row')}
          ${fieldRow('On', '<select name="monthlyBy"></select>', 'monthly-row')}
        </div>
        ${fieldRow('Ends', `<select name="endType"><option value="never">Never</option><option value="until">On date</option><option value="count">After</option></select>
          <input type="date" name="until"><span class="count-wrap"><input type="number" name="count" min="1" max="999" inputmode="numeric" class="num"> times</span>`)}
        <p class="hint repeat-summary"></p>
      </div>
      ${fieldRow('Color', `<div class="swatches">${COLORS.map((c) => `<label class="swatch c-${c}" title="${c}"><input type="radio" name="color" value="${c}"><span></span></label>`).join('')}</div>`)}
      <textarea name="notes" rows="3" placeholder="Notes" aria-label="Notes"></textarea>
      <p class="form-error" role="alert" hidden></p>
    </div>
    <div class="dlg-foot">
      ${isNew ? '' : '<button type="button" class="btn danger-text" data-delete>Delete</button>'}
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>`;

  return run('sheet', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    const el = (n) => f.elements[n];
    const rule0 = initial.rrule || null;
    let touched = false;

    el('title').value = initial.title || '';
    el('allDay').checked = !!initial.allDay;
    el('tentative').checked = !!initial.tentative;
    el('startDate').value = dateOf(initial.start);
    el('endDate').value = dateOf(initial.end);
    el('startTime').value = timeValue(initial.allDay ? 9 * 60 : minOf(initial.start));
    el('endTime').value = timeValue(initial.allDay ? 10 * 60 : minOf(initial.end));
    (f.querySelector(`input[name=color][value="${initial.color}"]`) || f.querySelector('input[name=color]')).checked = true;
    el('notes').value = initial.notes || '';

    const startDate = () => el('startDate').value || dateOf(initial.start);
    const startAbs = () => absMin(dt(el('startDate').value, parseTime(el('startTime').value)));
    const endAbs = () => absMin(dt(el('endDate').value, parseTime(el('endTime').value)));
    // Kept so that moving the start moves the end with it.
    const dur = { min: Math.max(15, endAbs() - startAbs()), days: Math.max(0, diffDays(el('startDate').value, el('endDate').value)) };

    // Custom repeat state, filled from the event's rule.
    let weekdays = new Set(rule0?.freq === 'weekly' && rule0.byWeekday?.length ? rule0.byWeekday : [weekday(startDate())]);
    let monthly = rule0?.freq === 'monthly' && rule0.monthlyBy === 'nth' ? (rule0.nth === -1 ? 'last' : 'nth') : 'day';
    el('interval').value = rule0?.interval || 1;
    el('freq').value = rule0?.freq || 'weekly';
    el('endType').value = rule0?.until ? 'until' : rule0?.count ? 'count' : 'never';
    el('until').value = rule0?.until || addDays(startDate(), 90);
    el('count').value = rule0?.count || 10;

    let repeatKey = presetKeyOf(rule0, startDate());
    const fillRepeat = () => {
      const opts = repeatOptions(startDate());
      if (!opts.some(([k]) => k === repeatKey)) repeatKey = repeatKey === 'monthly-last' ? 'monthly-nth' : 'custom';
      el('repeat').innerHTML = opts.map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('');
      el('repeat').value = repeatKey;
    };

    const currentRule = () => {
      if (repeatKey === 'none') return null;
      const d = startDate();
      let r;
      if (repeatKey === 'custom') {
        r = { freq: el('freq').value, interval: clampInt(el('interval').value, 1, 99) };
        if (r.freq === 'weekly') r.byWeekday = weekdays.size ? [...weekdays].sort((a, b) => a - b) : [weekday(d)];
        if (r.freq === 'monthly') {
          r.monthlyBy = monthly === 'day' ? 'day' : 'nth';
          if (r.monthlyBy === 'nth') r.nth = monthly === 'last' || nthOf(d) > 4 ? -1 : nthOf(d);
        }
      } else r = presetRule(repeatKey, d);
      const endType = el('endType').value;
      r.until = endType === 'until' ? el('until').value || null : null;
      r.count = endType === 'count' ? clampInt(el('count').value, 1, 999) : null;
      return r;
    };

    const updateRepeatUI = () => {
      const d = startDate();
      f.classList.toggle('repeats', repeatKey !== 'none');
      f.classList.toggle('custom-repeat', repeatKey === 'custom');
      f.dataset.freq = el('freq').value;
      f.dataset.end = el('endType').value;
      f.querySelectorAll('.wd').forEach((b) => b.setAttribute('aria-pressed', weekdays.has(+b.dataset.wd)));
      const wd = WEEKDAYS[weekday(d)];
      const mopts = [['day', `On day ${parts(d).d}`]];
      if (nthOf(d) <= 4) mopts.push(['nth', `On the ${ORDINALS[nthOf(d)]} ${wd}`]);
      if (inLastWeekOfMonth(d)) mopts.push(['last', `On the last ${wd}`]);
      if (!mopts.some(([k]) => k === monthly)) monthly = mopts[mopts.length - 1][0];
      el('monthlyBy').innerHTML = mopts.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
      el('monthlyBy').value = monthly;
      f.querySelector('.repeat-summary').textContent = repeatKey === 'none' ? '' : describeRule(currentRule(), d);
    };

    f.classList.toggle('all-day', el('allDay').checked);
    fillRepeat();
    updateRepeatUI();

    const fail = (msg) => {
      const p = f.querySelector('.form-error');
      p.textContent = msg;
      p.hidden = false;
      return null;
    };

    // ---- inputs
    el('allDay').addEventListener('change', () => f.classList.toggle('all-day', el('allDay').checked));

    const onStartChange = (prevDate) => {
      if (!el('startDate').value) return;
      if (el('allDay').checked) el('endDate').value = addDays(el('startDate').value, dur.days);
      else {
        const e = fromAbsMin(startAbs() + dur.min);
        el('endDate').value = dateOf(e);
        el('endTime').value = timeValue(minOf(e));
      }
      // A one-day weekly pattern follows the start date.
      if (prevDate && weekdays.size === 1 && weekdays.has(weekday(prevDate))) weekdays = new Set([weekday(startDate())]);
      fillRepeat();
      updateRepeatUI();
    };
    let lastStart = startDate();
    el('startDate').addEventListener('change', () => {
      onStartChange(lastStart);
      lastStart = startDate();
    });
    el('startTime').addEventListener('change', () => onStartChange(null));

    const onEndChange = () => {
      if (!el('endDate').value) return;
      const days = diffDays(el('startDate').value, el('endDate').value);
      if (days >= 0) dur.days = days;
      const m = endAbs() - startAbs();
      if (m > 0) dur.min = m;
    };
    el('endDate').addEventListener('change', onEndChange);
    el('endTime').addEventListener('change', onEndChange);

    el('repeat').addEventListener('change', () => {
      const prev = repeatKey;
      repeatKey = el('repeat').value;
      touched = true;
      if (repeatKey === 'custom' && prev !== 'custom') {
        // Start the custom editor from whatever was picked before.
        const r = presetRule(prev, startDate()) || { freq: 'weekly', byWeekday: [weekday(startDate())] };
        el('freq').value = r.freq;
        el('interval').value = 1;
        weekdays = new Set(r.byWeekday || [weekday(startDate())]);
        monthly = r.monthlyBy === 'nth' ? (r.nth === -1 ? 'last' : 'nth') : 'day';
      }
      updateRepeatUI();
    });
    for (const n of ['interval', 'freq', 'endType', 'until', 'count']) {
      el(n).addEventListener('input', () => {
        touched = true;
        updateRepeatUI();
      });
    }
    el('monthlyBy').addEventListener('change', () => {
      monthly = el('monthlyBy').value;
      touched = true;
      updateRepeatUI();
    });
    f.querySelector('.wd-group').addEventListener('click', (e) => {
      const b = e.target.closest('.wd');
      if (!b) return;
      const wd = +b.dataset.wd;
      if (weekdays.has(wd)) weekdays.delete(wd);
      else weekdays.add(wd);
      touched = true;
      updateRepeatUI();
    });

    // ---- save / delete
    const collect = () => {
      const allDay = el('allDay').checked;
      const sd = el('startDate').value;
      const ed = el('endDate').value;
      if (!sd || !ed) return fail('Pick a start and end date.');
      let start;
      let end;
      if (allDay) {
        if (ed < sd) return fail('The end date is before the start date.');
        start = sd;
        end = ed;
      } else {
        start = dt(sd, parseTime(el('startTime').value));
        end = dt(ed, parseTime(el('endTime').value));
        if (absMin(end) <= absMin(start)) return fail('The event has to end after it starts.');
      }
      const rrule = currentRule();
      if (rrule?.until && rrule.until < sd) return fail('The repeat end date is before the event starts.');
      return {
        title: el('title').value.trim(),
        notes: el('notes').value.trim(),
        color: f.elements.color.value || 'blue',
        tentative: el('tentative').checked,
        allDay,
        start,
        end,
        rrule,
      };
    };

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = collect();
      if (!form) return;
      let scope = null;
      if (!isNew && repeating) {
        const ruleChanged = touched && ruleKey(form.rrule) !== ruleKey(rule0);
        scope = await askScope('save', { allowThis: !ruleChanged });
        if (!scope) return;
      }
      finish({ action: 'save', form, scope });
    });

    f.querySelector('[data-delete]')?.addEventListener('click', async () => {
      let scope = null;
      if (repeating) {
        scope = await askScope('delete');
        if (!scope) return;
      }
      finish({ action: 'delete', scope });
    });

    if (isNew) setTimeout(() => el('title').focus(), 50);
  });
}

// "This event / This and following / All events". Resolves with the choice or null.
export function askScope(kind, { allowThis = true } = {}) {
  const del = kind === 'delete';
  const opts = [allowThis && ['this', 'This event'], ['following', 'This and following events'], ['all', 'All events']].filter(Boolean);
  const html = `
  <form class="dlg scope">
    <div class="dlg-body">
      <h3>${del ? 'Delete repeating event' : 'Save repeating event'}</h3>
      ${allowThis ? '' : '<p class="hint">You changed how it repeats, so this applies to more than one event.</p>'}
      ${opts.map(([v, l], i) => `<label class="radio-row"><input type="radio" name="scope" value="${v}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}
    </div>
    <div class="dlg-foot">
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn ${del ? 'danger' : 'primary'}">${del ? 'Delete' : 'Save'}</button>
    </div>
  </form>`;
  return run('small', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(f.elements.scope.value);
    });
  }, { backdropCloses: true });
}

// ---------------------------------------------------------------- Task editor

// Resolves with { action: 'save', fields } or { action: 'delete' }, or null.
export function taskEditor(task) {
  const html = `
  <form class="dlg editor" novalidate>
    <div class="dlg-head">
      <input class="title-input" name="title" placeholder="Task" autocomplete="off" maxlength="200" aria-label="Task">
      <button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button>
    </div>
    <div class="dlg-body">
      <label class="field-row toggle-row"><span class="lbl">Done</span><input type="checkbox" name="done" class="switch"></label>
      ${fieldRow('Due', '<input type="date" name="due"><input type="time" name="dueTime" class="time">', 'dt-row')}
      <p class="hint">Leave the date empty to keep it under “No date”.</p>
      <textarea name="notes" rows="4" placeholder="Notes" aria-label="Notes"></textarea>
      <p class="form-error" role="alert" hidden></p>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn danger-text" data-delete>Delete</button>
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>`;
  return run('sheet', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    f.elements.title.value = task.title;
    f.elements.done.checked = !!task.done;
    f.elements.due.value = task.due || '';
    f.elements.dueTime.value = task.dueTime || '';
    f.elements.notes.value = task.notes || '';
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = f.elements.title.value.trim();
      if (!title) {
        const p = f.querySelector('.form-error');
        p.textContent = 'Give the task a name.';
        p.hidden = false;
        return;
      }
      const due = f.elements.due.value || null;
      finish({
        action: 'save',
        fields: {
          title,
          done: f.elements.done.checked,
          due,
          dueTime: due ? f.elements.dueTime.value || null : null,
          notes: f.elements.notes.value.trim(),
        },
      });
    });
    f.querySelector('[data-delete]').addEventListener('click', () => finish({ action: 'delete' }));
  });
}

// ---------------------------------------------------------------- Settings

// Changes apply as they're made through `onChange`; buttons call `actions`.
export function settingsDialog({ settings, sync, lastBackup, onChange, actions }) {
  const hour = (h) => (settings.h24 ? `${String(h).padStart(2, '0')}:00` : `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`);
  const hours = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map((h) => `<option value="${h}">${h === 24 ? `${hour(24)} (midnight)` : hour(h)}</option>`).join('');
  const syncHtml = sync.kind === 'cloud'
    ? `<p class="sync-line">${icons.cloud}<span>Signed in as <b>${esc(sync.email || '')}</b>. Changes sync to your other devices.</span></p>
       <button type="button" class="btn" data-act="signOut">Sign out</button>`
    : `<p class="sync-line">${icons.device}<span>Saved on this device only. To use the same planner on your phone and PC, turn on sync (see “Turn on sync” in README.md).</span></p>`;
  const html = `
  <form class="dlg settings">
    <div class="dlg-head"><h2>Settings</h2><button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button></div>
    <div class="dlg-body">
      <section>
        <h3>Calendar</h3>
        ${fieldRow('Day starts at', `<select name="dayStart">${hours(0, 12)}</select>`)}
        ${fieldRow('Day ends at', `<select name="dayEnd">${hours(13, 24)}</select>`)}
        ${fieldRow('Week starts on', '<select name="weekStart"><option value="0">Sunday</option><option value="1">Monday</option></select>')}
        ${fieldRow('Time format', '<select name="h24"><option value="0">12-hour (1:30 PM)</option><option value="1">24-hour (13:30)</option></select>')}
        ${fieldRow('Hour height', '<select name="hourHeight"><option value="40">Compact</option><option value="52">Normal</option><option value="68">Large</option></select>')}
      </section>
      <section>
        <h3>Sync</h3>
        ${syncHtml}
      </section>
      <section>
        <h3>Backup</h3>
        <p class="hint">${lastBackup ? `Last backup from this device: ${fmt(new Date(lastBackup).toISOString().slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'No backup saved from this device yet.'}
          A backup holds all your events and tasks, and can be restored into this app later.</p>
        <div class="btn-stack">
          <button type="button" class="btn" data-act="backup">Download backup (.json)</button>
          <button type="button" class="btn" data-act="ics">Export events for other calendars (.ics)</button>
          <button type="button" class="btn" data-act="restore">Restore from a backup…</button>
          <input type="file" name="restoreFile" accept=".json,application/json" hidden>
        </div>
      </section>
      <p class="hint shortcuts">Keyboard: <kbd>T</kbd> today · <kbd>←</kbd> <kbd>→</kbd> move · <kbd>D</kbd> <kbd>W</kbd> <kbd>2</kbd> <kbd>M</kbd> views · <kbd>N</kbd> new event</p>
      <p class="hint">Planner v${VERSION}</p>
    </div>
  </form>`;
  return run('sheet', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    f.elements.dayStart.value = settings.dayStart;
    f.elements.dayEnd.value = settings.dayEnd;
    f.elements.weekStart.value = settings.weekStart;
    f.elements.h24.value = settings.h24 ? 1 : 0;
    f.elements.hourHeight.value = [40, 52, 68].includes(settings.hourHeight) ? settings.hourHeight : 52;
    f.addEventListener('change', (e) => {
      if (e.target.name === 'restoreFile') return;
      onChange({
        dayStart: +f.elements.dayStart.value,
        dayEnd: +f.elements.dayEnd.value,
        weekStart: +f.elements.weekStart.value,
        h24: f.elements.h24.value === '1',
        hourHeight: +f.elements.hourHeight.value,
      });
    });
    f.addEventListener('submit', (e) => e.preventDefault());
    f.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'restore') f.elements.restoreFile.click();
      else if (act === 'signOut') {
        finish(null);
        actions.signOut();
      } else if (act) actions[act]();
    });
    f.elements.restoreFile.addEventListener('change', async () => {
      const file = f.elements.restoreFile.files[0];
      if (!file) return;
      const text = await file.text();
      f.elements.restoreFile.value = '';
      finish(null);
      actions.restore(text);
    });
  }, { backdropCloses: true });
}
