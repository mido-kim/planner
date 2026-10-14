// Where events and tasks are kept. The local store (this file) and the cloud
// store (cloud.js) share one small interface, so the rest of the app doesn't
// care which is in use, and either could be swapped for another service:
//
//   subscribe(fn)  calls fn({ events, tasks, labels, pending }) now and after
//                  every change; events, tasks and labels are Maps keyed by id
//   apply(ops)     applies [{ op: 'put' | 'remove', coll, obj | id }] together

export const LOCAL_KEY = 'planner.data.v1';

export function readLocalData() {
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (d && typeof d.events === 'object' && typeof d.tasks === 'object') {
      // Labels came later (0.3.0), so older data has none.
      return { ...d, labels: d.labels && typeof d.labels === 'object' ? d.labels : {} };
    }
  } catch {
    // Unreadable data is treated as empty.
  }
  return { events: {}, tasks: {}, labels: {} };
}

export function localStore() {
  let data = readLocalData();
  const subs = new Set();
  const snapshot = () => ({
    events: new Map(Object.entries(data.events)),
    tasks: new Map(Object.entries(data.tasks)),
    labels: new Map(Object.entries(data.labels)),
    pending: false,
  });
  const emit = () => {
    const snap = snapshot();
    subs.forEach((fn) => fn(snap));
  };

  // Keep other open tabs in step.
  addEventListener('storage', (e) => {
    if (e.key === LOCAL_KEY) {
      data = readLocalData();
      emit();
    }
  });

  return {
    kind: 'local',
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    async apply(ops) {
      for (const o of ops) {
        if (o.op === 'put') data[o.coll][o.obj.id] = o.obj;
        else delete data[o.coll][o.id];
      }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      emit();
    },
  };
}
