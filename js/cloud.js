// Sync through Firebase: email sign-in plus a Firestore database that keeps a
// copy on each device, so the app also works offline and catches up later.
// Data lives under users/{uid}/events, …/tasks, …/labels and …/themes.

const SDK = 'https://www.gstatic.com/firebasejs/12.6.0';

export async function connectCloud(config) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });

  return {
    onUser: (fn) => A.onAuthStateChanged(auth, fn),
    signIn: (email, password) => A.signInWithEmailAndPassword(auth, email, password),
    signUp: (email, password) => A.createUserWithEmailAndPassword(auth, email, password),
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),

    storeFor(user, onError) {
      const ref = (coll, id) => F.doc(db, 'users', user.uid, coll, id);
      return {
        kind: 'cloud',
        email: user.email,
        uid: user.uid,
        subscribe(fn) {
          const maps = {};
          const pending = {};
          const colls = ['events', 'tasks', 'labels', 'themes'];
          const emit = () => {
            if (colls.every((c) => maps[c])) fn({ ...maps, pending: colls.some((c) => pending[c]) });
          };
          const unsubs = colls.map((coll) =>
            F.onSnapshot(
              F.collection(db, 'users', user.uid, coll),
              { includeMetadataChanges: true },
              (snap) => {
                const m = new Map();
                snap.forEach((d) => m.set(d.id, d.data()));
                maps[coll] = m;
                pending[coll] = snap.metadata.hasPendingWrites;
                emit();
              },
              (err) => onError?.(err),
            ),
          );
          return () => unsubs.forEach((u) => u());
        },
        async apply(ops) {
          // Writes show up locally right away. The commit only resolves once the
          // server has them, which can be much later when offline, so it isn't
          // awaited.
          for (let i = 0; i < ops.length; i += 400) {
            const batch = F.writeBatch(db);
            for (const o of ops.slice(i, i + 400)) {
              if (o.op === 'put') batch.set(ref(o.coll, o.obj.id), o.obj);
              else batch.delete(ref(o.coll, o.id));
            }
            batch.commit().catch((err) => onError?.(err));
          }
        },
      };
    },
  };
}
