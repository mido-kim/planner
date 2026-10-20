import { absMin, addDays, dateOf, diffDays, dt, fmt, fromAbsMin, minOf, parseTime, parts, timeValue, weekday } from './dates.js';
import { icons } from './icons.js';
import { activeLabels, isRetired, retiredLabels, usageText } from './labels.js';
import { describeRule, inLastWeekOfMonth, nthOf, ORDINALS, ruleKey, spanDays, WEEKDAYS, WEEKDAYS_SHORT } from './recurrence.js';
import { AMOUNTS, hexToHsl, hslToHex, PARTS } from './themes.js';
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

const swatches = (colors, name = 'color') =>
  `<div class="swatches">${colors.map((c) => `<label class="swatch c-${c}" title="${c === 'none' ? 'No color' : c}"><input type="radio" name="${name}" value="${c}"><span></span></label>`).join('')}</div>`;

// A small × beside a time field empties it (no time), which the iPhone's time
// picker can't do by itself. The form gets .no-time while the field is empty.
const clearTime = (name, label) =>
  `<button type="button" class="icon-btn sm clear-time" data-clear="${name}" aria-label="${label}" title="${label}">${icons.close}</button>`;
function wireClearTime(f, name) {
  const input = f.elements[name];
  const sync = () => f.classList.toggle('no-time', !input.value);
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  f.querySelector(`[data-clear="${name}"]`).addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  sync();
}

// Checks the radio button `name` with `value`, if there is one.
function check(root, name, value) {
  const input = root.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
  if (input) input.checked = true;
  return !!input;
}

// ---------------------------------------------------------------- Label picker

// Pills for "no label" and each active label (plus the item's own label if
// it's retired), with a link to the label manager. `onPick` gets the label
// picked, or null for none.
function setupLabelPicker(f, { labels, labelId, manageLabels, onPick }) {
  const box = f.querySelector('.label-pills');
  const draw = (cur) => {
    const all = labels();
    const list = activeLabels(all);
    const own = cur ? all.get(cur) : null;
    if (own && isRetired(own)) list.push(own);
    const pill = (l) => `<label class="lpill c-${l.color}${isRetired(l) ? ' retired' : ''}"><input type="radio" name="label" value="${esc(l.id)}"><span><i></i>${esc(l.name)}${isRetired(l) ? ' <em>(retired)</em>' : ''}</span></label>`;
    box.innerHTML = `<label class="lpill none"><input type="radio" name="label" value=""><span>None</span></label>${list.map(pill).join('')}
      <button type="button" class="link small" data-manage-labels>${list.length ? 'Edit labels' : 'Make a label'}</button>`;
    if (!own || !check(f, 'label', cur)) check(f, 'label', '');
  };
  draw(labelId);
  box.addEventListener('change', (e) => {
    if (e.target.name === 'label') onPick(labels().get(e.target.value) || null);
  });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-manage-labels]')) return;
    const cur = f.elements.label.value;
    await manageLabels();
    draw(cur);
    onPick(labels().get(f.elements.label.value) || null, true);
  });
}

// The color to store: none when it's the label's own color, so the item
// follows its label if the label is recolored later.
function pickedColor(f, labels, fallback) {
  const label = labels().get(f.elements.label.value);
  const c = f.elements.color.value;
  if (!c || c === 'none') return label ? null : fallback;
  return label && label.color === c ? null : c;
}

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
export function eventEditor({ initial, isNew, repeating, settings, labels, manageLabels }) {
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + settings.weekStart) % 7);
  const html = `
  <form class="dlg editor" novalidate>
    <div class="dlg-head">
      <input class="title-input" name="title" placeholder="Add title" autocomplete="off" maxlength="200" aria-label="Title">
      <button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button>
    </div>
    <div class="dlg-body">
      <div class="kind-seg" role="radiogroup" aria-label="Type">
        <label><input type="radio" name="kind" value="event"><span>${icons.event}Event</span></label>
        <label><input type="radio" name="kind" value="deadline"><span>${icons.flagBtn}Deadline</span></label>
      </div>
      <label class="field-row toggle-row ev-only"><span class="lbl">All day</span><input type="checkbox" name="allDay" class="switch"></label>
      <label class="field-row toggle-row ev-only"><span class="lbl">Tentative <span class="hint">(shown lightly, dashed outline)</span></span><input type="checkbox" name="tentative" class="switch"></label>
      ${fieldRow('<span class="ev-only">Starts</span><span class="dl-only">Due</span>', `<input type="date" name="startDate" required><input type="time" name="startTime" class="time"><span class="dl-only">${clearTime('startTime', 'No due time')}</span><span class="hint dl-only no-time-hint">Any time that day</span>`, 'dt-row')}
      ${fieldRow('Ends', '<input type="date" name="endDate" required><input type="time" name="endTime" class="time">', 'dt-row ev-only')}
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
      ${fieldRow('Shape', `<div class="shape-pick" role="radiogroup" aria-label="Shape">
          <label><input type="radio" name="shape" value="block"><span><svg class="sp" width="30" height="10" viewBox="0 0 30 10" aria-hidden="true"><rect width="30" height="10" rx="3" fill="currentColor"/></svg>Block</span></label>
          <label><input type="radio" name="shape" value="arrow"><span><svg class="sp" width="30" height="10" viewBox="0 0 30 10" aria-hidden="true"><path d="M5 5h20" stroke="currentColor" stroke-width="2"/><path d="M0 5l7-4.5v9zM30 5l-7-4.5v9z" fill="currentColor"/></svg>Arrows</span></label>
          <label><input type="radio" name="shape" value="line"><span><svg class="sp" width="30" height="10" viewBox="0 0 30 10" aria-hidden="true"><path d="M1 5h28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Line</span></label>
        </div>`, 'shape-row')}
      ${fieldRow('Label', '<div class="label-pills"></div>', 'label-row')}
      ${fieldRow('Color', swatches(COLORS))}
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
    // A deadline has no end; if it's turned into an event, it lasts an hour.
    const deadline0 = initial.kind === 'deadline';
    const end0 = deadline0 ? fromAbsMin(absMin(initial.start) + 60) : initial.end;
    el('endDate').value = dateOf(end0);
    // A deadline without a time is due any time that day.
    el('startTime').value = deadline0 && initial.allDay ? '' : timeValue(initial.allDay ? 9 * 60 : minOf(initial.start));
    el('endTime').value = timeValue(initial.allDay ? 10 * 60 : minOf(end0));
    check(f, 'kind', deadline0 ? 'deadline' : 'event');
    check(f, 'shape', ['arrow', 'line'].includes(initial.shape) ? initial.shape : 'block');
    const label0 = initial.labelId ? labels().get(initial.labelId) : null;
    if (!check(f, 'color', initial.color || label0?.color || 'blue')) check(f, 'color', 'blue');
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

    // Which rows show: a deadline has one date and time; the shape choice is
    // for events drawn as bars (all-day, or running into another day).
    const isDeadline = () => f.elements.kind.value === 'deadline';
    const updateKindUI = () => {
      f.classList.toggle('is-deadline', isDeadline());
      f.classList.toggle('all-day', !isDeadline() && el('allDay').checked);
      const sd = el('startDate').value;
      const ed = el('endDate').value;
      const span = sd && ed ? spanDays({ allDay: false, start: dt(sd, parseTime(el('startTime').value)), end: dt(ed, parseTime(el('endTime').value)) }) : 0;
      f.classList.toggle('bar-like', !isDeadline() && (el('allDay').checked || span > 0));
      f.style.setProperty('--c', `var(--c-${f.elements.color.value || 'blue'})`);
    };
    updateKindUI();
    fillRepeat();
    updateRepeatUI();

    setupLabelPicker(f, {
      labels,
      labelId: initial.labelId,
      manageLabels,
      onPick: (label, redrawn) => {
        if (label && !redrawn) check(f, 'color', label.color);
        updateKindUI();
      },
    });
    f.addEventListener('change', (e) => {
      // An event needs times: one made from a deadline with no time gets 9–10 AM.
      if (e.target.name === 'kind' && !isDeadline() && !el('startTime').value) {
        el('startTime').value = '09:00';
        el('endDate').value = el('startDate').value;
        el('endTime').value = '10:00';
      }
      if (['kind', 'color', 'allDay', 'startDate', 'startTime', 'endDate', 'endTime'].includes(e.target.name)) updateKindUI();
    });
    wireClearTime(f, 'startTime');

    const fail = (msg) => {
      const p = f.querySelector('.form-error');
      p.textContent = msg;
      p.hidden = false;
      return null;
    };

    // ---- inputs

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
      const kind = isDeadline() ? 'deadline' : 'event';
      // A deadline with no time is stored as an all-day deadline.
      const allDay = kind === 'event' ? el('allDay').checked : !el('startTime').value;
      const sd = el('startDate').value;
      const ed = el('endDate').value;
      if (!sd || (kind === 'event' && !ed)) return fail(kind === 'deadline' ? 'Pick a date.' : 'Pick a start and end date.');
      let start;
      let end;
      if (kind === 'deadline') {
        start = allDay ? sd : dt(sd, parseTime(el('startTime').value));
        end = start;
      } else if (allDay) {
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
        kind,
        title: el('title').value.trim(),
        notes: el('notes').value.trim(),
        labelId: f.elements.label.value || null,
        color: pickedColor(f, labels, 'blue'),
        shape: kind === 'event' ? f.elements.shape.value : 'block',
        tentative: kind === 'event' && el('tentative').checked,
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
export function taskEditor(task, { isNew = false, labels, manageLabels }) {
  const html = `
  <form class="dlg editor task-editor" novalidate>
    <div class="dlg-head">
      <input class="title-input" name="title" placeholder="Task" autocomplete="off" maxlength="200" aria-label="Task">
      <button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button>
    </div>
    <div class="dlg-body">
      ${isNew ? '' : '<label class="field-row toggle-row"><span class="lbl">Done</span><input type="checkbox" name="done" class="switch"></label>'}
      ${fieldRow('Due', `<input type="date" name="due"><input type="time" name="dueTime" class="time">${clearTime('dueTime', 'No time')}`, 'dt-row')}
      <p class="hint">With a date it shows on the calendar: at its time, or at the end of the day without one. Leave the date empty to keep it under “No date”.</p>
      ${fieldRow('Label', '<div class="label-pills"></div>', 'label-row')}
      ${fieldRow('Color', swatches(['none', ...COLORS]))}
      <textarea name="notes" rows="4" placeholder="Notes" aria-label="Notes"></textarea>
      <p class="form-error" role="alert" hidden></p>
    </div>
    <div class="dlg-foot">
      ${isNew ? '' : '<button type="button" class="btn danger-text" data-delete>Delete</button>'}
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn primary">${isNew ? 'Add task' : 'Save'}</button>
    </div>
  </form>`;
  return run('sheet', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    f.elements.title.value = task.title || '';
    if (f.elements.done) f.elements.done.checked = !!task.done;
    f.elements.due.value = task.due || '';
    f.elements.dueTime.value = task.dueTime || '';
    wireClearTime(f, 'dueTime');
    f.elements.notes.value = task.notes || '';
    const label0 = task.labelId ? labels().get(task.labelId) : null;
    if (!check(f, 'color', task.color || label0?.color || 'none')) check(f, 'color', 'none');
    const sync = () => f.classList.toggle('has-label', !!f.elements.label.value);
    setupLabelPicker(f, {
      labels,
      labelId: task.labelId,
      manageLabels,
      onPick: (label, redrawn) => {
        if (label && !redrawn) check(f, 'color', label.color);
        else if (!label && f.elements.color.value === 'none') check(f, 'color', 'none');
        sync();
      },
    });
    sync();
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
          done: f.elements.done ? f.elements.done.checked : false,
          due,
          dueTime: due ? f.elements.dueTime.value || null : null,
          labelId: f.elements.label.value || null,
          color: pickedColor(f, labels, null),
          notes: f.elements.notes.value.trim(),
        },
      });
    });
    f.querySelector('[data-delete]')?.addEventListener('click', () => finish({ action: 'delete' }));
    if (isNew) setTimeout(() => f.elements.title.focus(), 50);
  });
}

// ---------------------------------------------------------------- Labels

// Add, rename, recolor, retire, restore and delete labels. `act(type, data)`
// makes a change and resolves once it's saved; the list then redraws from
// `getLabels`. `bindRefresh` receives a function that redraws the list, for
// changes that arrive from elsewhere. Resolves when closed.
export function labelsDialog({ getLabels, usage, act, bindRefresh }) {
  const html = `
  <form class="dlg labels-dlg" novalidate>
    <div class="dlg-head"><h2>Labels</h2><button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button></div>
    <div class="dlg-body">
      <p class="hint">A label colors its events, deadlines and tasks. Any single item can still have a color of its own.</p>
      <div class="label-add">
        <input name="newName" placeholder="New label" maxlength="40" autocomplete="off" aria-label="New label name">
        <button type="submit" class="btn primary">Add</button>
        ${swatches(COLORS, 'newColor')}
      </div>
      <p class="form-error" role="alert" hidden></p>
      <section>
        <h3>Active</h3>
        <ul class="label-list" data-list="active"></ul>
      </section>
      <section>
        <h3>Retired</h3>
        <p class="hint">Retired labels aren’t offered when you pick a label, but items that have one keep it. Restore one any time.</p>
        <ul class="label-list" data-list="retired"></ul>
      </section>
    </div>
  </form>`;
  return run('sheet', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    const err = f.querySelector('.form-error');
    let editing = null;
    check(f, 'newColor', COLORS[getLabels().size % COLORS.length]);

    const fail = (msg) => {
      err.textContent = msg;
      err.hidden = !msg;
      return !msg;
    };
    // Names are unique, ignoring case.
    const nameOk = (name, id) => {
      if (!name) return fail('Give the label a name.');
      const twin = [...getLabels().values()].find((l) => l.id !== id && l.name.trim().toLowerCase() === name.toLowerCase());
      if (twin) return fail(`There’s already a label called “${twin.name}”${isRetired(twin) ? ' (retired). Restore it instead' : ''}.`);
      return fail('');
    };

    const row = (l) => {
      const count = usageText(usage(l.id));
      if (editing === l.id) {
        return `<li class="lrow editing" data-id="${esc(l.id)}">
          <input name="editName" value="${esc(l.name)}" maxlength="40" autocomplete="off" aria-label="Label name">
          <button type="button" class="btn primary sm" data-do="save">Save</button>
          <button type="button" class="btn sm" data-do="cancel">Cancel</button>
          ${swatches(COLORS, 'editColor')}
        </li>`;
      }
      const buttons = isRetired(l)
        ? '<button type="button" class="btn sm" data-do="restore">Restore</button><button type="button" class="btn sm danger-text" data-do="delete">Delete…</button>'
        : `<button type="button" class="icon-btn sm" data-do="edit" aria-label="Rename or recolor">${icons.pencil}</button><button type="button" class="btn sm" data-do="remove">Remove…</button>`;
      return `<li class="lrow c-${l.color}${isRetired(l) ? ' retired' : ''}" data-id="${esc(l.id)}"><i class="ldot"></i><span class="lname">${esc(l.name)}<span class="lcount">${count}</span></span>${buttons}</li>`;
    };
    const draw = () => {
      const all = getLabels();
      const active = activeLabels(all);
      const retired = retiredLabels(all);
      f.querySelector('[data-list=active]').innerHTML = active.map(row).join('') || '<li class="empty">No labels yet. Add one above.</li>';
      f.querySelector('[data-list=retired]').innerHTML = retired.map(row).join('') || '<li class="empty">None.</li>';
      const e = editing && all.get(editing);
      if (e) {
        check(f, 'editColor', e.color);
        f.elements.editName.focus();
      }
    };
    draw();
    bindRefresh(draw);

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (document.activeElement?.name === 'editName') return save(document.activeElement.closest('[data-id]').dataset.id);
      const name = f.elements.newName.value.trim();
      if (!nameOk(name)) return;
      await act('add', { name, color: f.elements.newColor.value || 'blue' });
      f.elements.newName.value = '';
      check(f, 'newColor', COLORS[getLabels().size % COLORS.length]);
      draw();
    });

    const save = async (id) => {
      const name = f.elements.editName.value.trim();
      if (!nameOk(name, id)) return;
      await act('update', { id, name, color: f.elements.editColor.value });
      editing = null;
      draw();
    };

    f.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-do]');
      if (!b) return;
      const id = b.closest('[data-id]').dataset.id;
      const label = getLabels().get(id);
      if (!label) return;
      fail('');
      switch (b.dataset.do) {
        case 'edit': editing = id; break;
        case 'cancel': editing = null; break;
        case 'save': return save(id);
        case 'restore': await act('status', { id, status: 'active' }); break;
        case 'remove':
        case 'delete': {
          const choice = await removeLabelDialog(label, usageText(usage(id)), { allowRetire: b.dataset.do === 'remove' });
          if (choice === 'retire') await act('status', { id, status: 'retired' });
          else if (choice === 'delete') await act('delete', { id });
          break;
        }
      }
      draw();
    });
  }, { backdropCloses: true });
}

// Retire or delete. Resolves with 'retire', 'delete' or null.
function removeLabelDialog(label, used, { allowRetire }) {
  const items = used === 'not used' ? 'No items have it.' : `This also deletes its ${used}, for good.`;
  const html = `
  <form class="dlg scope remove-label">
    <div class="dlg-body">
      <h3>${allowRetire ? 'Remove' : 'Delete'} “${esc(label.name)}”</h3>
      ${allowRetire ? `<label class="radio-row"><input type="radio" name="how" value="retire" checked><span><b>Retire it</b><br><span class="hint">Hide it from the label picker. Its items stay as they are, and you can restore it later.</span></span></label>` : ''}
      <label class="radio-row"><input type="radio" name="how" value="delete" ${allowRetire ? '' : 'checked'}><span><b>Delete it and its items</b><br><span class="hint">${items} You can undo right after.</span></span></label>
    </div>
    <div class="dlg-foot">
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn ${allowRetire ? 'primary' : 'danger'}">${allowRetire ? 'Retire' : 'Delete'}</button>
    </div>
  </form>`;
  return run('small', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    const ok = f.querySelector('[type=submit]');
    f.addEventListener('change', () => {
      const del = f.elements.how.value === 'delete';
      ok.textContent = del ? 'Delete' : 'Retire';
      ok.className = `btn ${del ? 'danger' : 'primary'}`;
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(f.elements.how.value);
    });
  }, { backdropCloses: true });
}

// ---------------------------------------------------------------- Create menu

// A small menu at (x, y) after clicking or dragging on the calendar: what to
// make there. `choices` are [key, icon, label]. Resolves with a key or null.
export function createMenu({ x, y, heading, choices }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'cm-scrim';
    wrap.innerHTML = `<div class="create-menu" role="menu" aria-label="${esc(heading)}">
      <div class="cm-head">${esc(heading)}</div>
      ${choices.map(([k, icon, label]) => `<button type="button" role="menuitem" data-k="${k}">${icon}<span>${label}</span></button>`).join('')}
    </div>`;
    document.body.append(wrap);
    const menu = wrap.firstElementChild;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x + 6, innerWidth - w - 8))}px`;
    menu.style.top = `${y + 10 + h < innerHeight - 8 ? y + 10 : Math.max(8, y - h - 10)}px`;
    const buttons = [...menu.querySelectorAll('button')];
    const done = (value) => {
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(value);
    };
    const onKey = (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'Escape') done(null);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) done(b.dataset.k);
      else if (!menu.contains(e.target)) done(null);
    });
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      done(null);
    });
    buttons[0].focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------- Settings

// Changes apply as they're made through `onChange`; buttons call `actions`.
export function settingsDialog({ settings, sync, lastBackup, labels, themes, onChange, actions }) {
  const hour = (h) => (settings.h24 ? `${String(h).padStart(2, '0')}:00` : `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`);
  const hours = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map((h) => `<option value="${h}">${h === 24 ? `${hour(24)} (midnight)` : h > 24 ? `${hour(h - 24)} (next day)` : hour(h)}</option>`).join('');
  const syncHtml = sync.kind === 'cloud'
    ? `<p class="sync-line">${icons.cloud}<span>Signed in as <b>${esc(sync.email || '')}</b>. Changes sync to your other devices.</span></p>
       <button type="button" class="btn" data-act="signOut">Sign out</button>`
    : sync.kind === 'demo'
      ? `<p class="sync-line">${icons.device}<span>Design preview with sample data. Nothing here is saved, and your real calendar isn’t touched.</span></p>`
      : `<p class="sync-line">${icons.device}<span>Saved on this device only. To use the same planner on your phone and PC, turn on sync (see “Turn on sync” in README.md).</span></p>`;
  const html = `
  <form class="dlg settings">
    <div class="dlg-head"><h2>Settings</h2><button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button></div>
    <div class="dlg-body">
      <section>
        <h3>Appearance</h3>
        ${fieldRow('Theme', '<select name="theme"></select>')}
        <div class="btn-row">
          <button type="button" class="btn" data-act="makeTheme">${icons.palette}Make a theme…</button>
          <button type="button" class="btn" data-act="editTheme">Edit this theme…</button>
        </div>
      </section>
      <section>
        <h3>Calendar</h3>
        ${fieldRow('Day starts at', `<select name="dayStart">${hours(0, 12)}</select>`)}
        ${fieldRow('Day ends at', `<select name="dayEnd">${hours(13, 28)}</select>`)}
        ${fieldRow('Week starts on', '<select name="weekStart"><option value="0">Sunday</option><option value="1">Monday</option></select>')}
        ${fieldRow('Time format', '<select name="h24"><option value="0">12-hour (1:30 PM)</option><option value="1">24-hour (13:30)</option></select>')}
        ${fieldRow('Working hours', `<select name="workStart" aria-label="Working hours start">${hours(0, 23)}</select><span class="hint">to</span><select name="workEnd" aria-label="Working hours end">${hours(1, 24)}</select>`, 'work-row')}
        <label class="field-row toggle-row"><span class="lbl">Shade working hours <span class="hint">(weekdays that aren’t holidays)</span></span><input type="checkbox" name="showWork" class="switch"></label>
      </section>
      <section>
        <h3>Labels</h3>
        <div class="label-preview"></div>
        <div><button type="button" class="btn" data-act="labels">${icons.tag}Manage labels…</button></div>
      </section>
      <section>
        <h3>Sync</h3>
        ${syncHtml}
      </section>
      <section>
        <h3>Backup</h3>
        <p class="hint">${lastBackup ? `Last backup from this device: ${fmt(new Date(lastBackup).toISOString().slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'No backup saved from this device yet.'}
          A backup holds all your events, tasks and labels, and can be restored into this app later.</p>
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
    f.elements.workStart.value = settings.workStart;
    f.elements.workEnd.value = settings.workEnd;
    f.elements.showWork.checked = !!settings.showWork;
    f.elements.weekStart.value = settings.weekStart;
    f.elements.h24.value = settings.h24 ? 1 : 0;
    // Light, Dark, System, this device's unsaved theme, and the saved ones.
    // Only made themes can be edited.
    const editable = () => (f.querySelector('[data-act=editTheme]').hidden = ['system', 'light', 'dark'].includes(f.elements.theme.value));
    const drawThemes = () => {
      const saved = [...themes().values()].sort((a, b) => a.name.localeCompare(b.name));
      const opt = (v, text) => `<option value="${esc(v)}">${esc(text)}</option>`;
      f.elements.theme.innerHTML = opt('system', 'System (as this device is set)') + opt('light', 'Light') + opt('dark', 'Dark')
        + (settings.customTheme ? opt('custom', 'Custom (this device only)') : '')
        + (saved.length ? `<optgroup label="Your themes">${saved.map((t) => opt(t.id, t.name)).join('')}</optgroup>` : '');
      f.elements.theme.value = settings.theme;
      if (f.elements.theme.selectedIndex < 0) f.elements.theme.value = 'system';
      editable();
    };
    drawThemes();
    const drawLabels = () => {
      const list = activeLabels(labels());
      f.querySelector('.label-preview').innerHTML = list.length
        ? list.map((l) => `<span class="lpill static c-${l.color}"><span><i></i>${esc(l.name)}</span></span>`).join('')
        : '<p class="hint">No labels yet. Labels color your events, deadlines and tasks by kind, like “Research” or “Teaching”.</p>';
    };
    drawLabels();
    f.addEventListener('change', (e) => {
      if (e.target.name === 'restoreFile') return;
      onChange({
        theme: f.elements.theme.value,
        dayStart: +f.elements.dayStart.value,
        dayEnd: +f.elements.dayEnd.value,
        weekStart: +f.elements.weekStart.value,
        h24: f.elements.h24.value === '1',
        workStart: +f.elements.workStart.value,
        workEnd: +f.elements.workEnd.value,
        showWork: f.elements.showWork.checked,
      });
      if (e.target.name === 'theme') editable();
    });
    f.addEventListener('submit', (e) => e.preventDefault());
    f.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'restore') f.elements.restoreFile.click();
      else if (act === 'signOut' || act === 'makeTheme' || act === 'editTheme') {
        // The theme maker shows its changes on the app, so Settings closes.
        finish(null);
        actions[act]();
      } else if (act === 'labels') {
        await actions.labels();
        drawLabels();
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

// ---------------------------------------------------------------- Theme maker

// Every part of a theme with hue, saturation and lightness sliders. Changes
// show on the app as they're made (`onPreview(vars)`). `presets` are themes
// to start again from ({ key, label, vars }); `takenNames` the lowercase names
// of other saved themes. Resolves with { action: 'done', name, vars },
// { action: 'delete' } or null.
export function themeMaker({ theme, presets, takenNames, canDelete, onPreview }) {
  const CHANNELS = [['h', 'Hue', 360], ['s', 'Saturation', 100], ['l', 'Lightness', 100]];
  const part = ([k, name]) => `
    <div class="tm-part" data-key="${k}">
      <button type="button" class="tm-row" aria-expanded="false"><i class="tm-sw"></i><span class="tm-name">${name}</span><code class="tm-val"></code></button>
      <div class="tm-sliders" hidden>
        ${CHANNELS.map(([c, label, max]) => `<label class="tm-slider"><span>${label}</span><input type="range" data-ch="${c}" min="0" max="${max}" step="1" aria-label="${name}: ${label}"></label>`).join('')}
      </div>
    </div>`;
  const amount = ([k, name, min, max]) => `
    <label class="tm-amount" data-key="${k}"><span class="tm-name">${name}</span><input type="range" min="${min}" max="${max}" step="${max <= 12 ? 0.5 : 1}" aria-label="${name}"><code class="tm-val"></code></label>`;
  const html = `
  <form class="dlg theme-maker" novalidate>
    <div class="dlg-head"><h2>Theme maker</h2><button type="button" class="icon-btn" data-cancel aria-label="Close">${icons.close}</button></div>
    <div class="dlg-body">
      <div class="tm-top">
        <input name="name" placeholder="Name (to save it)" maxlength="40" autocomplete="off" aria-label="Theme name">
        <select name="from" aria-label="Start again from"><option value="">Start from…</option>${presets.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('')}</select>
      </div>
      <p class="hint">With a name, it’s saved to your themes on all your devices. Without one, it’s used on this device only.</p>
      <p class="form-error" role="alert" hidden></p>
      ${PARTS.map(([group, parts]) => `<section class="tm-group"><h3>${group}</h3>${parts.map(part).join('')}</section>`).join('')}
      <section class="tm-group"><h3>Amounts</h3>${AMOUNTS.map(amount).join('')}</section>
    </div>
    <div class="dlg-foot">
      ${canDelete ? '<button type="button" class="btn danger-text" data-do="delete">Delete</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-cancel>Cancel</button>
      <button type="submit" class="btn primary">Done</button>
    </div>
  </form>`;
  return run('sheet theme-maker-dlg', html, (dlg, finish) => {
    const f = dlg.querySelector('form');
    const err = f.querySelector('.form-error');
    f.elements.name.value = theme.name || '';
    let vars = { ...theme.vars };
    // Kept apart from the hex, so a gray's hue isn't lost along the way.
    let hsl = {};

    const drawPart = (el) => {
      const k = el.dataset.key;
      const { h, s, l } = hsl[k];
      el.querySelector('.tm-sw').style.background = vars[k];
      el.querySelector('.tm-val').textContent = vars[k].toUpperCase();
      const track = {
        // The hue bar always shows bright hues, so it's readable on dark colors.
        h: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((x) => `hsl(${x} 75% 60%)`).join(', ')})`,
        s: `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`,
        l: `linear-gradient(to right, #000, hsl(${h} ${s}% 50%), #fff)`,
      };
      for (const input of el.querySelectorAll('input[data-ch]')) {
        input.value = Math.round(hsl[k][input.dataset.ch]);
        input.style.background = track[input.dataset.ch];
      }
    };
    const drawAmount = (el) => {
      const input = el.querySelector('input');
      input.value = vars[el.dataset.key];
      el.querySelector('.tm-val').textContent = `${vars[el.dataset.key]}%`;
    };
    const drawAll = () => {
      hsl = Object.fromEntries(PARTS.flatMap(([, parts]) => parts.map(([k]) => [k, hexToHsl(vars[k])])));
      f.querySelectorAll('.tm-part').forEach(drawPart);
      f.querySelectorAll('.tm-amount').forEach(drawAmount);
    };
    drawAll();

    // One part open at a time.
    f.addEventListener('click', (e) => {
      const row = e.target.closest('.tm-row');
      if (row) {
        const open = row.getAttribute('aria-expanded') !== 'true';
        f.querySelectorAll('.tm-row').forEach((r) => {
          r.setAttribute('aria-expanded', String(open && r === row));
          r.nextElementSibling.hidden = !(open && r === row);
        });
      } else if (e.target.closest('[data-do=delete]')) finish({ action: 'delete' });
    });
    f.addEventListener('input', (e) => {
      const el = e.target.closest('.tm-part, .tm-amount');
      if (!el) return;
      const k = el.dataset.key;
      if (el.classList.contains('tm-part')) {
        hsl[k][e.target.dataset.ch] = +e.target.value;
        vars[k] = hslToHex(hsl[k]);
        drawPart(el);
      } else {
        vars[k] = +e.target.value;
        drawAmount(el);
      }
      onPreview(vars);
    });
    f.elements.from.addEventListener('change', () => {
      const p = presets.find((x) => x.key === f.elements.from.value);
      f.elements.from.value = '';
      if (!p) return;
      vars = { ...p.vars };
      drawAll();
      onPreview(vars);
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.elements.name.value.trim();
      if (name && takenNames.has(name.toLowerCase())) {
        err.textContent = `There’s already a theme called “${name}”. Pick another name, or edit that one.`;
        err.hidden = false;
        return;
      }
      finish({ action: 'done', name, vars });
    });
  });
}
