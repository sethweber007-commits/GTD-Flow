// Two-way sync across devices, built on top of the Google Drive backup
// plumbing in js/drive.js. Where Drive.backupNow()/restoreLatest() do a
// raw one-way overwrite (local -> Drive, or Drive -> local), syncNow() here
// pulls the current Drive snapshot, merges it against local data record by
// record (last-write-wins on `updatedAt`, with tombstones so deletes
// propagate instead of getting resurrected), applies the merged result
// locally, and pushes it back — so editing on two devices, including while
// offline, converges instead of one side clobbering the other.
//
// Same drive.file OAuth connection as backups — no separate account system,
// no server: the merge happens entirely in the browser, using the user's
// own Drive as the shared meeting point between their devices.

import { DB } from './db.js';
import { Drive, onAppVisible } from './drive.js';
import { debounce } from './utils.js';
import { CONFIG } from './config.js';

// Stores that hold actual GTD data and participate in merge. 'meta' is
// deliberately excluded — it holds per-device state (driveFileId,
// driveFolderId, driveSignedIn, lastBackupAt) that must never be merged or
// overwritten from another device's snapshot.
function dataStoreNames(snapshot) {
  return Object.keys(snapshot.stores).filter((n) => n !== 'meta' && n !== 'tombstones');
}

// ISO 8601 timestamps (as produced by Date#toISOString throughout db.js)
// compare correctly with plain string comparison, so no Date parsing needed.
function recordTs(record) {
  return record.updatedAt || record.createdAt || '1970-01-01T00:00:00.000Z';
}

// Merges a local and remote export (each shaped like DB.exportAll()'s
// output; remote may be null if nothing has been synced from this account
// yet). Per store, keeps whichever copy of each record id has the newer
// timestamp; a tombstone newer than the newest surviving copy of that id
// wins instead, so the record is dropped. Returns { [storeName]: record[] }
// covering every data store plus the merged 'tombstones' — ready to hand to
// DB.applyMerged().
export function mergeSnapshots(local, remote) {
  const tombstonesByStore = new Map();
  for (const snap of [local, remote]) {
    for (const t of snap?.stores?.tombstones || []) {
      const existing = tombstonesByStore.get(t.id);
      if (!existing || t.deletedAt > existing.deletedAt) tombstonesByStore.set(t.id, t);
    }
  }

  const merged = {};
  for (const name of dataStoreNames(local)) {
    const byId = new Map();
    for (const snap of [local, remote]) {
      for (const rec of snap?.stores?.[name] || []) {
        const existing = byId.get(rec.id);
        if (!existing || recordTs(rec) > recordTs(existing)) byId.set(rec.id, rec);
      }
    }
    const winners = [];
    for (const [id, rec] of byId) {
      const tombstone = tombstonesByStore.get(id);
      if (tombstone && tombstone.deletedAt > recordTs(rec)) continue;
      winners.push(rec);
    }
    merged[name] = winners;
  }
  merged.tombstones = Array.from(tombstonesByStore.values());
  return merged;
}

let syncing = null;

export const Sync = {
  // Pulls the current Drive snapshot, merges it with local data, applies
  // the merge locally, then pushes the merged result back. Safe to call
  // repeatedly (e.g. from a debounce, a visibility check, and a manual
  // button all firing close together) — concurrent calls share one in-flight
  // sync rather than racing.
  async syncNow() {
    if (syncing) return syncing;
    syncing = this._run().finally(() => { syncing = null; });
    return syncing;
  },

  async _run() {
    if (!Drive.isConfigured() || Drive.getStatus().state !== 'signed-in') return;
    const token = await Drive._ensureToken();
    const folderId = await Drive._findOrCreateFolder(token);
    const [remote, local] = await Promise.all([
      Drive._downloadSnapshot(token, folderId),
      DB.exportAll(),
    ]);
    const merged = mergeSnapshots(local, remote);
    // The Drive round-trip above can take a noticeable moment, during which
    // the user can keep editing locally. applyMerged() below clears and
    // repopulates every data store from `merged`, so any edit made after
    // `local` was captured but before that write happens would otherwise be
    // silently lost — it exists in neither `local` nor `remote`. Re-snapshot
    // local data right before applying, and fold it into the merge as a
    // third source: mergeSnapshots is last-write-wins on updatedAt (with
    // tombstones for deletes), so this can only ever preserve a newer edit,
    // never discard one. This can't close the window entirely (a fresh edit
    // could still land in the brief gap before applyMerged's own transaction
    // opens), but it shrinks it from "a full Drive network round-trip" down
    // to "one more local IndexedDB round-trip" — worth doing since it's
    // essentially free.
    const latestLocal = await DB.exportAll();
    const finalMerged = mergeSnapshots({ version: latestLocal.version, stores: merged }, latestLocal);
    await DB.applyMerged(finalMerged);
    const body = JSON.stringify({ version: local.version, exportedAt: new Date().toISOString(), stores: finalMerged }, null, 2);
    await Drive._uploadSnapshot(token, folderId, body);
    await DB.setMeta('lastSyncAt', new Date().toISOString());
  },

  // Wires up the "when" for automatic sync: shortly after a local change,
  // whenever the app regains connectivity, whenever it comes back to the
  // foreground, and once right after Drive goes from not-connected to
  // connected (covers app load with a cached token, an explicit "Connect",
  // and a silent reconnect alike — including pulling existing Drive data
  // into a freshly-connected, otherwise-empty device).
  init() {
    if (this._wired) return;
    this._wired = true;

    const trigger = debounce(() => this.syncNow().catch((e) => console.error('Auto-sync failed', e)), CONFIG.BACKUP_DEBOUNCE_MS);
    DB.onChange(({ store, action }) => {
      // 'meta' changes are per-device bookkeeping; 'sync'/'import' are
      // emitted by applyMerged/importAll themselves and would otherwise
      // make a sync (or a restore) immediately re-trigger another sync.
      if (store === 'meta' || action === 'sync' || action === 'import') return;
      trigger();
    });

    let wasSignedIn = false;
    Drive.onStatus((status) => {
      if (status.state === 'signed-in' && !wasSignedIn) {
        this.syncNow().catch((e) => console.error('Sync on connect failed', e));
      }
      wasSignedIn = status.state === 'signed-in';
    });

    window.addEventListener('online', () => {
      this.syncNow().catch((e) => console.error('Online sync failed', e));
    });

    onAppVisible(() => {
      this.syncNow().catch((e) => console.error('Visibility sync failed', e));
    });

    // Belt-and-suspenders periodic sweep: catches drift between devices left
    // open for a long stretch with no local edits, no visibility change, and
    // no online/offline transition on this device to otherwise trigger one.
    // A no-op (and cheap) whenever Drive isn't connected — see _run()'s
    // early return.
    setInterval(() => {
      this.syncNow().catch((e) => console.error('Periodic sync failed', e));
    }, CONFIG.AUTO_SYNC_INTERVAL_MS);
  },
};
