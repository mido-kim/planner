// Labels group events, deadlines and tasks and give them a color:
//   { id, name, color, status: 'active' | 'retired', createdAt, updatedAt }
// An item points at one through `labelId` (or has none). Its own `color`, when
// set, wins over the label's, so any single item can be recolored. A retired
// label is hidden from the pickers, but items that have it keep it.

export const isRetired = (label) => label?.status === 'retired';

const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
export const activeLabels = (labels) => [...labels.values()].filter((l) => !isRetired(l)).sort(byName);
export const retiredLabels = (labels) => [...labels.values()].filter(isRetired).sort(byName);

// The color an item is drawn in: its own, else its label's, else `fallback`.
export function colorOf(item, labels, fallback = 'blue') {
  return item.color || (item.labelId && labels.get(item.labelId)?.color) || fallback;
}

// How many items have a label. A repeating event counts once.
export function labelUsage(id, events, tasks) {
  const n = { events: 0, deadlines: 0, tasks: 0 };
  for (const e of events.values()) if (e.labelId === id) n[e.kind === 'deadline' ? 'deadlines' : 'events']++;
  for (const t of tasks.values()) if (t.labelId === id) n.tasks++;
  return n;
}

export function usageText({ events, deadlines, tasks }) {
  const part = (k, one) => k && `${k} ${one}${k === 1 ? '' : 's'}`;
  const list = [part(events, 'event'), part(deadlines, 'deadline'), part(tasks, 'task')].filter(Boolean);
  return list.length ? list.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'not used';
}

export const setLabelStatusOps = (label, status) => [{ op: 'put', coll: 'labels', obj: { ...label, status, updatedAt: Date.now() } }];

// Deleting a label also deletes every event, deadline and task that has it.
export function deleteLabelOps(id, events, tasks) {
  return [
    { op: 'remove', coll: 'labels', id },
    ...[...events.values()].filter((e) => e.labelId === id).map((e) => ({ op: 'remove', coll: 'events', id: e.id })),
    ...[...tasks.values()].filter((t) => t.labelId === id).map((t) => ({ op: 'remove', coll: 'tasks', id: t.id })),
  ];
}
