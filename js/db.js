// IndexedDB data layer for the GTD PWA.
// Single database, several object stores. A tiny pub/sub lets other modules
// (like the Google Drive backup module) react whenever data changes.

const DB_NAME = 'gtd-pwa-db';
const DB_VERSION = 3;

const STORES = {
  items: { keyPath: 'id', indexes: ['type', 'context', 'projectId', 'tickleDate', 'calendarDate', 'completed', 'category', 'sectionId'] },
  projects: { keyPath: 'id', indexes: ['status', 'areaOfFocusId'] },
  sections: { keyPath: 'id', indexes: ['view'] },
  areasOfFocus: { keyPath: 'id', indexes: [] },
  goals: { keyPath: 'id', indexes: ['areaOfFocusId', 'status'] },
  vision: { keyPath: 'id', indexes: [] },
  purpose: { keyPath: 'id', indexes: [] },
  reviews: { keyPath: 'id', indexes: [] },
  meta: { keyPath: 'key', indexes: [] },
  // Delete records, kept separately from their original store so a
  // deletion can be told apart from "never existed" when reconciling two
  // devices' data during sync (see js/sync.js). Not read by the UI.
  tombstones: { keyPath: 'id', indexes: [] },
};

let dbPromise = null;
const listeners = new Set();

function ensureSchema(db, upgradeTx) {
  for (const [name, cfg] of Object.entries(STORES)) {
    let store;
    if (!db.objectStoreNames.contains(name)) {
      store = db.createObjectStore(name, { keyPath: cfg.keyPath });
    } else {
      // Store already exists from an earlier version — just make sure
      // any indexes added since then get created too.
      store = upgradeTx.objectStore(name);
    }
    for (const idx of cfg.indexes) {
      if (!store.indexNames.contains(idx)) {
        store.createIndex(idx, idx, { unique: false });
      }
    }
  }
}

function schemaComplete(db) {
  return Object.keys(STORES).every((name) => db.objectStoreNames.contains(name));
}

// Opens the database at an explicit version, running our additive
// (never-destructive) schema-ensuring logic if a version change is needed.
function openWithVersion(version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => ensureSchema(req.result, req.transaction);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Another open tab of this app is holding the database at an older
    // version — the upgrade transaction can't proceed until it closes.
    req.onblocked = () => console.warn('IndexedDB upgrade blocked — close other tabs/windows of this app and reload.');
  });
}

// Finds the database's current stored version without triggering an
// upgrade (resolves null if the database doesn't exist yet).
function probeVersion() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => resolve(null);
  });
}

async function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    // Some browser profiles can end up with a stored database version
    // higher than DB_VERSION below — e.g. from a previous deploy, a
    // different build tested on the same origin, or the same database name
    // reused by something else. Opening with a version LOWER than what's
    // already stored throws a VersionError and blocks the whole app from
    // starting ("the requested version is less than the existing version").
    // To make this self-healing regardless of how it happened: never
    // request a version below what's already there, and if the existing
    // database turns out to be missing a store/index our code needs, bump
    // one version past it to force an upgrade that backfills it.
    const existingVersion = await probeVersion();
    const target = existingVersion == null ? DB_VERSION : Math.max(DB_VERSION, existingVersion);
    let db = await openWithVersion(target);
    if (!schemaComplete(db)) {
      const nextVersion = db.version + 1;
      db.close();
      db = await openWithVersion(nextVersion);
    }
    return db;
  })();
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function emitChange(store, action, payload) {
  for (const fn of listeners) {
    try { fn({ store, action, payload }); } catch (e) { console.error(e); }
  }
}

export const DB = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async init() {
    await openDB();
  },

  async add(store, obj) {
    const now = new Date().toISOString();
    const record = { id: obj.id || cryptoId(), createdAt: obj.createdAt || now, updatedAt: obj.updatedAt || now, ...obj };
    record.id = record.id || cryptoId();
    const s = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = s.add(record);
      req.onsuccess = () => { emitChange(store, 'add', record); resolve(record); };
      req.onerror = () => reject(req.error);
    });
  },

  async put(store, obj) {
    obj.updatedAt = new Date().toISOString();
    const s = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = s.put(obj);
      req.onsuccess = () => { emitChange(store, 'put', obj); resolve(obj); };
      req.onerror = () => reject(req.error);
    });
  },

  async remove(store, id) {
    const db = await openDB();
    // Delete and record a tombstone in the same transaction, so a device
    // that deletes something offline can tell sync (js/sync.js) "this was
    // deleted at time T" rather than the id just quietly disappearing —
    // otherwise a later merge could resurrect it from a device that hasn't
    // seen the delete yet.
    const transaction = db.transaction([store, 'tombstones'], 'readwrite');
    const s = transaction.objectStore(store);
    const tombstones = transaction.objectStore('tombstones');
    // Fetch the record before deleting it so listeners get the full record,
    // not just its id.
    const existing = await new Promise((resolve) => {
      const getReq = s.get(id);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    });
    s.delete(id);
    if (store !== 'tombstones') tombstones.put({ id, store, deletedAt: new Date().toISOString() });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    emitChange(store, 'remove', existing || { id });
    return true;
  },

  async get(store, id) {
    const s = await tx(store);
    return new Promise((resolve, reject) => {
      const req = s.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(store) {
    const s = await tx(store);
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async getByIndex(store, indexName, value) {
    const s = await tx(store);
    return new Promise((resolve, reject) => {
      const req = s.index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async setMeta(key, value) {
    return this.put('meta', { key, value });
  },

  async getMeta(key) {
    const r = await this.get('meta', key);
    return r ? r.value : null;
  },

  // Full snapshot for Drive backup / restore.
  async exportAll() {
    const data = { version: DB_VERSION, exportedAt: new Date().toISOString(), stores: {} };
    for (const name of Object.keys(STORES)) {
      data.stores[name] = await this.getAll(name);
    }
    return data;
  },

  async importAll(data, { merge = false } = {}) {
    if (!data || !data.stores) throw new Error('Invalid backup file');
    const db = await openDB();
    const storeNames = Object.keys(STORES).filter((n) => data.stores[n]);
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      const store = transaction.objectStore(name);
      if (!merge) {
        await new Promise((res, rej) => {
          const r = store.clear();
          r.onsuccess = res; r.onerror = () => rej(r.error);
        });
      }
      for (const record of data.stores[name]) {
        store.put(record);
      }
    }
    await new Promise((res, rej) => {
      transaction.oncomplete = res;
      transaction.onerror = () => rej(transaction.error);
    });
    emitChange('*', 'import', {});
  },

  // Replaces the contents of the given stores with an already-merged result
  // (see js/sync.js's mergeSnapshots) — same clear-then-repopulate mechanics
  // as importAll, but for a computed winning set rather than a raw file, and
  // scoped to just the stores passed in (sync never touches 'meta', which
  // holds per-device state like driveFileId).
  async applyMerged(storesData) {
    const db = await openDB();
    const storeNames = Object.keys(storesData);
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      const store = transaction.objectStore(name);
      await new Promise((res, rej) => {
        const r = store.clear();
        r.onsuccess = res; r.onerror = () => rej(r.error);
      });
      for (const record of storesData[name]) {
        store.put(record);
      }
    }
    await new Promise((res, rej) => {
      transaction.oncomplete = res;
      transaction.onerror = () => rej(transaction.error);
    });
    emitChange('*', 'sync', {});
  },

  async wipeAll() {
    const db = await openDB();
    const storeNames = Object.keys(STORES);
    const transaction = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) transaction.objectStore(name).clear();
    await new Promise((res, rej) => {
      transaction.oncomplete = res;
      transaction.onerror = () => rej(transaction.error);
    });
    emitChange('*', 'wipe', {});
  },
};

function cryptoId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
