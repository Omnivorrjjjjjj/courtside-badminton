import { createState, reduce, normalizeState, encodeFirestore, decodeFirestore } from './model.js';
import { cloudConfig, tournamentId, adminUid } from './config.js';

export function createStore(onChange) {
  const localKey = `courtside-demo-v1:${tournamentId}`;
  const store = { mode: cloudConfig ? 'cloud' : 'demo', state: null, ready: false, connected: false, pending: false, user: null, error: '', isAdmin: false };
  const notify = () => onChange(store);
  let db, auth, api, authApi, reference;
  if (!cloudConfig) {
    try { store.state = normalizeState(JSON.parse(localStorage.getItem(localKey))) } catch { store.state = createState(true); }
    store.ready = true; store.connected = true;
    addEventListener('storage', e => { if (e.key === localKey && e.newValue) { try { store.state = normalizeState(JSON.parse(e.newValue)); notify(); } catch { store.error = '本機儲存資料無法讀取。'; notify(); } } });
  } else {
    (async () => {
      try {
        requireConfig();
        const [appApi, databaseApi, authenticationApi] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
          import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
        ]);
        api = databaseApi; authApi = authenticationApi;
        const app = appApi.initializeApp(cloudConfig);
        db = api.getFirestore(app); auth = authApi.getAuth(app);
        await authApi.setPersistence(auth, authApi.browserSessionPersistence);
        reference = api.doc(db, 'badmintonEvents', tournamentId);
        authApi.onAuthStateChanged(auth, user => { store.user = user; store.isAdmin = !!user && user.uid === adminUid; notify(); });
        api.onSnapshot(reference, { includeMetadataChanges: true }, snap => {
          if (snap.metadata.hasPendingWrites) return; // Keep showing server-confirmed state until commit.
          try {
            if (snap.exists()) store.state = decodeFirestore(snap.data());
            else if (!snap.metadata.fromCache) store.state = null;
            store.error = '';
          }
          catch (error) { store.error = error.message; }
          store.connected = !snap.metadata.fromCache && navigator.onLine;
          if (!snap.metadata.fromCache || snap.exists()) store.ready = true;
          notify();
        }, error => { store.error = readableError(error); store.connected = false; store.ready = true; notify(); });
        addEventListener('offline', () => { store.connected = false; notify(); });
        addEventListener('online', async () => {
          try { const snap = await api.getDocFromServer(reference); store.state = snap.exists() ? decodeFirestore(snap.data()) : null; store.connected = true; store.ready = true; store.error = ''; notify(); } catch { store.connected = false; notify(); }
        });
      } catch (error) { store.error = readableError(error); store.ready = true; notify(); }
    })();
  }
  function requireConfig() {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tournamentId) || !adminUid || !cloudConfig.apiKey || !cloudConfig.appId || !cloudConfig.projectId) throw new Error('雲端設定不完整，請依部署說明填寫賽事與管理者設定。');
  }
  store.login = async (email, password) => {
    if (store.mode === 'demo') { store.isAdmin = true; notify(); return; }
    if (!auth) throw new Error('登入服務尚未準備完成。');
    await authApi.signInWithEmailAndPassword(auth, email, password);
    if (auth.currentUser.uid !== adminUid) { await authApi.signOut(auth); throw new Error('這個帳號沒有此賽事的管理權限。'); }
  };
  store.logout = async () => { if (auth) await authApi.signOut(auth); store.isAdmin = false; notify(); };
  store.initialize = async () => {
    if (store.mode !== 'cloud' || !store.isAdmin || !store.connected || store.pending) throw new Error('請由管理者連線後建立賽事。');
    store.pending = true; notify();
    try {
      await api.runTransaction(db, async transaction => {
        if ((await transaction.get(reference)).exists()) throw new Error('賽事已經建立，請重新載入。');
        const initial = createState(false); initial.revision = 1;
        transaction.set(reference, { ...encodeFirestore(initial), updatedAt: api.serverTimestamp() });
      });
    } finally { store.pending = false; notify(); }
  };
  store.dispatch = async (input) => {
    if (!store.isAdmin) throw new Error('請先登入管理者。');
    if (store.pending) throw new Error('前一筆資料同步中，請稍候。');
    if (!store.state) throw new Error('請先建立賽事。');
    if (!store.connected) throw new Error('連線中斷，請恢復連線後再計分。');
    const expectedRevision = input.baseRevision ?? store.state.revision;
    const action = { ...input, time: Date.now() };
    store.pending = true; notify();
    try {
      if (store.mode === 'demo') {
        const write = () => {
          let latest = store.state;
          const saved = localStorage.getItem(localKey);
          if (saved) latest = normalizeState(JSON.parse(saved));
          if (latest.revision !== expectedRevision) { store.state = latest; throw new Error('另一個視窗已更新資料，請重新開啟表單或確認最新比分後再操作。'); }
          const next = reduce(latest, action);
          localStorage.setItem(localKey, JSON.stringify(next)); store.state = next;
        };
        if (navigator.locks) await navigator.locks.request(localKey, write); else write();
      } else {
        await api.runTransaction(db, async transaction => {
          const snap = await transaction.get(reference);
          if (!snap.exists()) throw new Error('找不到賽事。');
          const latest = decodeFirestore(snap.data());
          if (latest.revision !== expectedRevision) throw new Error('另一位管理者已更新資料，請重新開啟表單或確認最新比分後再操作。');
          const next = reduce(latest, action);
          transaction.set(reference, { ...encodeFirestore(next), updatedAt: api.serverTimestamp() });
        });
      }
    } catch (error) { throw new Error(readableError(error)); }
    finally { store.pending = false; notify(); }
  };
  addEventListener('beforeunload', event => { if (store.mode === 'cloud' && store.pending) { event.preventDefault(); event.returnValue = ''; } });
  return store;
}
export function readableError(error) {
  const code = error?.code || '';
  if (/permission-denied|PERMISSION_DENIED/.test(code + error?.message)) return '沒有資料存取權限，請檢查管理者帳號與資料庫存取規則。';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return '帳號或密碼不正確。';
  if (/too-many-requests/.test(code)) return '嘗試次數過多，請稍後再試。';
  if (/network-request-failed|unavailable/.test(code)) return '網路連線失敗，請檢查網路後再操作。';
  return error?.message || '操作失敗，請稍後再試。';
}
