// Where events and tasks are kept. The local store (this file) and the cloud
// store (cloud.js) share one small interface, so the rest of the app doesn't
// care which is in use, and either could be swapped for another service:
//
//   subscribe(fn)  calls fn({ events, tasks, labels, themes, stickers,
//                  placements, pending }) now and after every change; each
//                  collection is a Map keyed by id
//   apply(ops)     applies [{ op: 'put' | 'remove', coll, obj | id }] together

export const LOCAL_KEY = 'planner.data.v1';

export function readLocalData() {
  try {
    const d = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (d && typeof d.events === 'object' && typeof d.tasks === 'object') {
      // Labels (0.3.0), themes (0.6.0) and stickers (0.10.0) came later, so
      // older data has none.
      const coll = (c) => (d[c] && typeof d[c] === 'object' ? d[c] : {});
      return { ...d, labels: coll('labels'), themes: coll('themes'), stickers: coll('stickers'), placements: coll('placements') };
    }
  } catch {
    // Unreadable data is treated as empty.
  }
  return { events: {}, tasks: {}, labels: {}, themes: {}, stickers: {}, placements: {} };
}

export function localStore() {
  let data = readLocalData();
  const subs = new Set();
  const snapshot = () => ({
    events: new Map(Object.entries(data.events)),
    tasks: new Map(Object.entries(data.tasks)),
    labels: new Map(Object.entries(data.labels)),
    themes: new Map(Object.entries(data.themes)),
    stickers: new Map(Object.entries(data.stickers)),
    placements: new Map(Object.entries(data.placements)),
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
