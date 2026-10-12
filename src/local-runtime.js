// MHUB local runtime: gives the Hub the same data API it uses on Claude,
// backed by this browser's storage (localStorage), so the app runs on any website.
(function () {
  const KEY = 'mhub-db-v1';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
  store.__ts = store.__ts || {};   // full doc path -> last local change (ms)
  store.__del = store.__del || {}; // full doc path -> deletion time (ms)
  let saveTimer = null;
  const writeHooks = [];
  function touched(fullPath, deleted) { const t = Date.now(); store.__ts[fullPath] = t; if (deleted) store.__del[fullPath] = t; else delete store.__del[fullPath]; writeHooks.forEach(h => h(fullPath)); }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(store)); }
      catch (e) { window.dispatchEvent(new CustomEvent('mhub-storage-full')); }
    }, 80);
  }
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  function deepMerge(a, b) { const out = isObj(a) ? { ...a } : {}; for (const k of Object.keys(b)) out[k] = isObj(b[k]) && isObj(out[k]) ? deepMerge(out[k], b[k]) : clone(b[k]); return out; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function split(path) { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; }
  const listeners = new Set();
  function notify(colPath) { setTimeout(() => listeners.forEach(l => { if (l.col === colPath) l.fire(); }), 0); }
  function snapDoc(id, data) { const d = data === undefined ? undefined : Object.freeze(clone(data)); return { id, exists: d !== undefined, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function err(code, message) { const e = new Error(message); e.code = code; return e; }

  function docRef(path) {
    const [c, id] = split(path);
    return {
      id, path,
      async get() { return snapDoc(id, (store[c] || {})[id]); },
      async set(data) { if (!isObj(data)) throw err('invalid_argument', 'body must be an object'); (store[c] = store[c] || {})[id] = clone(data); touched(path); persist(); notify(c); },
      async update(data) { const cur = (store[c] || {})[id]; if (cur === undefined) throw err('invalid_argument', 'document does not exist'); store[c][id] = deepMerge(cur, data); touched(path); persist(); notify(c); },
      async delete() { if (store[c]) { delete store[c][id]; } touched(path, true); persist(); notify(c); },
      onSnapshot(next) { const l = { col: c, fire: () => next(snapDoc(id, (store[c] || {})[id])) }; listeners.add(l); setTimeout(l.fire, 0); return () => listeners.delete(l); },
      collection(sub) { return colRef(path + '/' + sub); }
    };
  }
  function colRef(path) {
    const query = (filters = [], order = null, lim = 0) => ({
      where(f, op, v) { return query([...filters, [f, op, v]], order, lim); },
      orderBy(f, dir = 'asc') { return query(filters, [f, dir], lim); },
      limit(n) { return query(filters, order, n); },
      _run() {
        let docs = Object.entries(store[path] || {}).map(([id, d]) => ({ id, d }));
        const ops = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, in: (a, b) => b.includes(a), 'not-in': (a, b) => !b.includes(a), 'array-contains': (a, b) => Array.isArray(a) && a.includes(b) };
        filters.forEach(([f, op, v]) => { docs = docs.filter(x => ops[op] && ops[op](x.d[f], v)); });
        if (order) docs.sort((a, b) => { const x = a.d[order[0]], y = b.d[order[0]]; const r = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1; return order[1] === 'desc' ? -r : r; });
        else docs.sort((a, b) => a.id < b.id ? -1 : 1);
        if (lim) docs = docs.slice(0, lim);
        const out = docs.map(x => snapDoc(x.id, x.d));
        return { docs: out, size: out.length, empty: !out.length, docChanges: () => out.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } };
      },
      async get() { return this._run(); },
      onSnapshot(next) { const self = this; const l = { col: path, fire: () => next(self._run()) }; listeners.add(l); setTimeout(l.fire, 0); return () => listeners.delete(l); }
    });
    const q = query();
    return Object.assign(q, {
      path,
      doc(id) { return docRef(path + '/' + (id || ('x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)))); },
      async add(data) { const r = this.doc(); await r.set(data); return r; }
    });
  }
  const db = { doc: docRef, collection: colRef };
  const profile = { name: '' };
  const user = { async id() { return 'local'; }, async me() { return { name: profile.name }; }, async can() { return true; }, isOwner() { return true; }, canEdit() { return true; } };
  const isMeta = k => k.startsWith('__');
  // Hooks the account sync layer uses
  window.MHUB_LOCAL = {
    onWrite(fn) { writeHooks.push(fn); },
    setName(n) { profile.name = n || ''; },
    owner() { return store.__owner || null; },
    setOwner(uid) { store.__owner = uid; persist(); },
    // every local doc: [{path, data, deleted, ts}]
    allDocs() {
      const out = [];
      Object.keys(store).filter(k => !isMeta(k)).forEach(c => Object.keys(store[c] || {}).forEach(id => { const p = c + '/' + id; out.push({ path: p, data: store[c][id], deleted: false, ts: store.__ts[p] || 0 }); }));
      Object.keys(store.__del).forEach(p => out.push({ path: p, data: null, deleted: true, ts: store.__del[p] }));
      return out;
    },
    doc(p) { const [c, id] = split(p); const d = (store[c] || {})[id]; return d !== undefined ? { path: p, data: d, deleted: false, ts: store.__ts[p] || 0 } : store.__del[p] ? { path: p, data: null, deleted: true, ts: store.__del[p] } : null; },
    localTs(p) { return store.__ts[p] || 0; },
    // apply a remote row without marking it as a local change
    applyRemote(row) {
      const [c, id] = split(row.path);
      if (row.deleted) { if (store[c]) delete store[c][id]; store.__del[row.path] = row.ts; }
      else { (store[c] = store[c] || {})[id] = row.data; delete store.__del[row.path]; }
      store.__ts[row.path] = row.ts;
    },
    commit() { persist(); Object.keys(store).filter(k => !isMeta(k)).forEach(notify); listeners.forEach(l => l.fire()); },
    clear() { store = { __ts: {}, __del: {} }; try { localStorage.removeItem(KEY); } catch (e) {} listeners.forEach(l => l.fire()); }
  };
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = filename || 'mhub.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };
  const caps = { db, user, downloads };
  window.claude = { use: async (name) => caps[name] || null };
  window.addEventListener('mhub-storage-full', () => { const t = document.getElementById('toast'); if (t) { t.textContent = 'This browser’s storage is full. Download a backup and remove old decks.'; t.hidden = false; } });
})();
