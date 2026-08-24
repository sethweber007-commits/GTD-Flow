// Auto-purges old completed data so IndexedDB, and the Drive sync snapshot
// built from it, don't grow forever with done-and-forgotten work.
//
// Scope: completed Next Actions / Waiting On items (completed + completedAt),
// and completed projects (status: 'completed' + completedAt) — both untouched
// once they're a month old. Deleting goes through DB.remove(), same as any
// manual delete, so a tombstone is recorded and the removal propagates to
// other synced devices instead of the record quietly disappearing on this
// one only. A project being purged first unlinks (not deletes) any items
// still pointing at it — same as the manual "Delete project" button — so an
// open action doesn't vanish just because its old completed project aged out.

import { DB } from './db.js';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // "older than a month"
// Belt-and-suspenders check cadence for an app left open a long time — the
// actual gate on doing real work is the once-a-day guard in _maybeRun, same
// pattern as Sync's periodic sweep in js/sync.js.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isOld(isoString, cutoff) {
  return !!isoString && new Date(isoString).getTime() < cutoff;
}

export const Cleanup = {
  async pruneOldCompleted() {
    const cutoff = Date.now() - RETENTION_MS;

    // completedAt is missing on records completed before this feature
    // existed — updatedAt (set on every DB.put) is the closest available
    // stand-in for "when did this stop changing", so those aren't stuck
    // permanently exempt. A record edited since completion just gets a
    // later effective date, never an earlier one, so this can only delay a
    // deletion, never cause a premature one.
    const items = await DB.getAll('items');
    for (const item of items) {
      if (item.completed && isOld(item.completedAt || item.updatedAt, cutoff)) {
        await DB.remove('items', item.id);
      }
    }

    const projects = await DB.getAll('projects');
    for (const project of projects) {
      if (project.status !== 'completed' || !isOld(project.completedAt || project.updatedAt, cutoff)) continue;
      // Re-fetched fresh (not from the `items` snapshot above) so it
      // reflects any completed items the loop just removed — otherwise
      // re-saving a stale, already-deleted item here would resurrect it.
      const linked = await DB.getByIndex('items', 'projectId', project.id);
      for (const it of linked) await DB.put('items', { ...it, projectId: null });
      await DB.remove('projects', project.id);
    }
  },

  init() {
    if (this._wired) return;
    this._wired = true;
    this._maybeRun();
    setInterval(() => this._maybeRun(), CHECK_INTERVAL_MS);
  },

  async _maybeRun() {
    const last = await DB.getMeta('lastPruneAt');
    if (last && Date.now() - new Date(last).getTime() < CHECK_INTERVAL_MS) return;
    try {
      await this.pruneOldCompleted();
    } catch (e) {
      console.error('Cleanup sweep failed', e);
    } finally {
      await DB.setMeta('lastPruneAt', new Date().toISOString());
    }
  },
};
