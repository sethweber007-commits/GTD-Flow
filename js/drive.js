// Google Drive backup integration.
//
// Uses Google Identity Services (GIS) for OAuth (token client / implicit
// flow — appropriate for a client-only PWA with no backend) and talks to
// the Drive REST API directly with fetch. Scope is drive.file, which only
// grants access to files this app itself creates, never the user's whole
// Drive — this keeps the OAuth consent screen "unverified-app friendly".
//
// Everything here degrades gracefully: if CONFIG.GOOGLE_CLIENT_ID hasn't
// been set, or the network is unavailable, the rest of the app keeps
// working fully offline against IndexedDB.

import { CONFIG } from './config.js';
import { DB } from './db.js';
import { debounce } from './utils.js';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_TOKEN_CACHE_KEY = 'gtd-pwa-drive-token';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
const statusListeners = new Set();
let status = { state: 'signed-out', message: 'Not connected', lastBackupAt: null };

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of statusListeners) fn(status);
}

export const Drive = {
  onStatus(fn) {
    statusListeners.add(fn);
    fn(status);
    return () => statusListeners.delete(fn);
  },

  getStatus() {
    return status;
  },

  isConfigured() {
    return !!CONFIG.GOOGLE_CLIENT_ID && !CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE');
  },

  async init() {
    const lastBackupAt = await DB.getMeta('lastBackupAt');
    if (lastBackupAt) setStatus({ lastBackupAt });

    if (!this.isConfigured()) {
      setStatus({ state: 'unconfigured', message: 'Add a Google Client ID in js/config.js to enable backup' });
      return;
    }

    // Fast path: reuse a still-valid access token cached in localStorage
    // from earlier — possibly a much earlier browser session. This is what
    // makes both a plain page refresh AND fully closing/reopening the app
    // NOT require signing in again (as long as the token's own ~1 hour
    // validity hasn't actually elapsed) — it needs no network call at all
    // and doesn't depend on Google's silent-refresh machinery, which (even
    // with FedCM) isn't reliable enough to use as the ONLY mechanism for
    // "stay signed in." loadCachedToken() itself refuses anything past its
    // real expiry, so this can never hand back a stale/invalid token.
    const cached = loadCachedToken(DRIVE_TOKEN_CACHE_KEY);
    if (cached) {
      accessToken = cached.accessToken;
      tokenExpiresAt = cached.expiresAt;
      setStatus({ state: 'signed-in', message: 'Connected to Google Drive' });
      this._wireAutoBackup();
      this._scheduleProactiveRefresh();
    }

    await waitForGis();
    tokenClient = initTokenClient(CONFIG.GOOGLE_DRIVE_SCOPE);

    if (cached) return;

    // No usable cached token (first load, or it's been long enough that
    // sessionStorage was cleared / the token expired) — fall back to a
    // silent (no-popup) refresh attempt if the user previously signed in.
    const previouslySignedIn = await DB.getMeta('driveSignedIn');
    if (previouslySignedIn) {
      try {
        await this._requestToken({ prompt: '' });
        setStatus({ state: 'signed-in', message: 'Connected to Google Drive' });
        this._wireAutoBackup();
        this._scheduleProactiveRefresh();
      } catch (e) {
        setStatus({ state: 'signed-out', message: 'Sign in to resume Drive backup' });
      }
    } else {
      setStatus({ state: 'signed-out', message: 'Not connected' });
    }

    onAppVisible(() => this._checkOnVisible());
  },

  // Runs whenever the app/tab comes back to the foreground (see
  // onAppVisible above) — catches a token that quietly expired while
  // backgrounded, and also gives a cold-start silent-reconnect that failed
  // (e.g. Google's identity script hadn't finished loading yet, or the
  // network hiccuped) another chance without requiring a full reload.
  async _checkOnVisible() {
    if (!this.isConfigured() || !tokenClient) return;
    if (status.state === 'signed-in' && Date.now() < tokenExpiresAt) return; // still good
    const previouslySignedIn = await DB.getMeta('driveSignedIn');
    if (!previouslySignedIn) return;
    try {
      await this._requestToken({ prompt: '' });
      if (status.state !== 'signed-in') {
        setStatus({ state: 'signed-in', message: 'Connected to Google Drive' });
        this._wireAutoBackup();
      }
      this._scheduleProactiveRefresh();
    } catch (e) {
      if (status.state === 'signed-in') {
        // Had a token, couldn't silently renew it — only now actually
        // drop to signed-out (rather than leaving a stale "Connected"
        // status that would fail the next real Drive call).
        setStatus({ state: 'signed-out', message: 'Sign in to resume Drive backup' });
      }
    }
  },

  async signIn() {
    if (!this.isConfigured()) {
      throw new Error('Set GOOGLE_CLIENT_ID in js/config.js first — see SETUP.md');
    }
    await waitForGis();
    if (!tokenClient) tokenClient = initTokenClient(CONFIG.GOOGLE_DRIVE_SCOPE);
    setStatus({ state: 'connecting', message: 'Waiting for Google sign-in…' });
    // If this browser has connected before and still has an active Google
    // session, a silent request usually succeeds with no dialog at all —
    // only fall back to the full account-chooser/consent screen when that's
    // not the case (first-ever connect, revoked access, or no session).
    // This is what makes tapping "Connect" after the cached token has
    // simply expired feel instant rather than like signing in from scratch.
    const previouslySignedIn = await DB.getMeta('driveSignedIn');
    if (previouslySignedIn) {
      try {
        await this._requestToken({ prompt: '' });
      } catch (e) {
        await this._requestToken({ prompt: 'consent' });
      }
    } else {
      await this._requestToken({ prompt: 'consent' });
    }
    await DB.setMeta('driveSignedIn', true);
    setStatus({ state: 'signed-in', message: 'Connected to Google Drive' });
    this._wireAutoBackup();
    this._scheduleProactiveRefresh();
    await this.backupNow();
  },

  async signOut() {
    if (accessToken && google.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    clearTimeout(this._refreshTimer);
    clearCachedToken(DRIVE_TOKEN_CACHE_KEY);
    await DB.setMeta('driveSignedIn', false);
    setStatus({ state: 'signed-out', message: 'Disconnected' });
  },

  _requestToken({ prompt }) {
    return requestTokenFrom(tokenClient, prompt, (resp) => {
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000 - 30000;
      saveCachedToken(DRIVE_TOKEN_CACHE_KEY, accessToken, tokenExpiresAt);
    });
  },

  async _ensureToken() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    await this._requestToken({ prompt: '' });
    return accessToken;
  },

  // Refreshes the token in the background a few minutes before it actually
  // expires, while the app is open, so an active session never hits a
  // suddenly-expired token mid-action and reopening the app shortly after
  // closing it finds a still-fresh token already in hand.
  _scheduleProactiveRefresh() {
    clearTimeout(this._refreshTimer);
    if (!tokenExpiresAt) return;
    const delay = Math.max(tokenExpiresAt - Date.now() - 5 * 60 * 1000, 30000);
    this._refreshTimer = setTimeout(async () => {
      try {
        await this._requestToken({ prompt: '' });
      } catch (e) {
        console.warn('Drive background token refresh failed:', e.message || e);
      }
      this._scheduleProactiveRefresh();
    }, delay);
  },

  _wireAutoBackup() {
    if (this._wired) return;
    this._wired = true;
    const trigger = debounce(() => this.backupNow().catch((e) => console.error('Auto-backup failed', e)), CONFIG.BACKUP_DEBOUNCE_MS);
    DB.onChange(({ store }) => {
      if (store === 'meta') return; // avoid feedback loop from lastBackupAt writes
      if (status.state === 'signed-in') trigger();
    });
  },

  async _findOrCreateFolder(token) {
    let folderId = await DB.getMeta('driveFolderId');
    if (folderId) return folderId;

    const q = encodeURIComponent(`name='${CONFIG.DRIVE_BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const searchResp = await fetch(`${DRIVE_FILES_URL}?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchResp.json();
    if (searchData.files && searchData.files.length) {
      folderId = searchData.files[0].id;
    } else {
      const createResp = await fetch(DRIVE_FILES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: CONFIG.DRIVE_BACKUP_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
      });
      const created = await createResp.json();
      folderId = created.id;
    }
    await DB.setMeta('driveFolderId', folderId);
    return folderId;
  },

  async _findOrCreateFile(token, folderId) {
    let fileId = await DB.getMeta('driveFileId');
    if (fileId) return fileId;

    const q = encodeURIComponent(`name='${CONFIG.DRIVE_BACKUP_FILE}' and '${folderId}' in parents and trashed=false`);
    const searchResp = await fetch(`${DRIVE_FILES_URL}?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchResp.json();
    if (searchData.files && searchData.files.length) {
      fileId = searchData.files[0].id;
      await DB.setMeta('driveFileId', fileId);
    }
    return fileId || null;
  },

  async backupNow() {
    if (!this.isConfigured()) return;
    try {
      setStatus({ state: 'backing-up', message: 'Backing up to Drive…' });
      const token = await this._ensureToken();
      const folderId = await this._findOrCreateFolder(token);
      const snapshot = await DB.exportAll();
      const body = JSON.stringify(snapshot, null, 2);
      let fileId = await this._findOrCreateFile(token, folderId);

      if (fileId) {
        await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
        });
      } else {
        const boundary = 'gtdpwa' + Date.now();
        const metadata = { name: CONFIG.DRIVE_BACKUP_FILE, parents: [folderId] };
        const multipartBody =
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const createResp = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipartBody,
        });
        const created = await createResp.json();
        await DB.setMeta('driveFileId', created.id);
      }

      const now = new Date().toISOString();
      await DB.setMeta('lastBackupAt', now);
      setStatus({ state: 'signed-in', message: 'Connected to Google Drive', lastBackupAt: now });
    } catch (err) {
      console.error('Drive backup failed', err);
      setStatus({ state: 'error', message: 'Backup failed — will retry on next change' });
      throw err;
    }
  },

  // Writes an extra timestamped snapshot (used after each weekly review) so
  // there is always some history to fall back to, beyond the rolling file.
  async snapshotNow(label = 'weekly-review') {
    if (!this.isConfigured()) return;
    const token = await this._ensureToken();
    const folderId = await this._findOrCreateFolder(token);
    const snapshot = await DB.exportAll();
    const name = `gtd-snapshot-${label}-${new Date().toISOString().slice(0, 10)}.json`;
    const boundary = 'gtdpwa' + Date.now();
    const metadata = { name, parents: [folderId] };
    const body = JSON.stringify(snapshot, null, 2);
    const multipartBody =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartBody,
    });
  },

  async restoreLatest() {
    const token = await this._ensureToken();
    const folderId = await this._findOrCreateFolder(token);
    const fileId = await this._findOrCreateFile(token, folderId);
    if (!fileId) throw new Error('No backup found in Drive yet.');
    const resp = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error('Could not download backup file.');
    const data = await resp.json();
    await DB.importAll(data, { merge: false });
    return data;
  },
};

export function waitForGis() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(iv);
        resolve();
      } else if (tries > 100) {
        clearInterval(iv);
        reject(new Error('Google Identity Services failed to load (are you offline?)'));
      }
    }, 100);
  });
}

// Shared by drive.js and gcal.js — each keeps its own independent token
// client (separate scope/consent), but both should be set up the same way.
//
// use_fedcm_for_prompt opts into the FedCM-based flow for silent
// (prompt: '') token requests. Without it, silent refresh depends on a
// hidden iframe reading a third-party cookie on accounts.google.com, which
// an increasing number of browsers (including recent Chrome, on desktop and
// Android) restrict or block by default — causing the "signed in" state to
// silently fail to resume on every reload even though the user never
// explicitly signed out. FedCM uses the browser's native account-chooser
// API instead, which keeps working under third-party-cookie restrictions.
export function initTokenClient(scope) {
  return google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope,
    use_fedcm_for_prompt: true,
    callback: () => {}, // overridden per-call by requestTokenFrom()
  });
}

// Wraps tokenClient.requestAccessToken in a promise that is GUARANTEED to
// settle. Previously only the success/error `callback` was wired up; if
// Google instead invoked `error_callback` (which happens for FedCM-specific
// failures like the user having no Google session, or FedCM being disabled)
// neither callback fired and the returned promise hung forever — which,
// from init()'s try/catch, looked identical to "still signed in" because
// the surrounding await never resolved. A hung promise here was a likely
// contributor to the app appearing to need sign-in again on next reload:
// the silent refresh attempt never actually failed-fast into the
// "signed-out" fallback state. A hard timeout is a last-resort safety net
// in case a future GIS version adds yet another silent failure path.
export function requestTokenFrom(tokenClient, prompt, onSuccess) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    tokenClient.callback = (resp) => {
      if (resp.error) return settle(reject, resp);
      onSuccess(resp);
      settle(resolve, resp);
    };
    tokenClient.error_callback = (err) => settle(reject, err);
    const timer = setTimeout(() => settle(reject, new Error('Google sign-in timed out')), 12000);
    try {
      tokenClient.requestAccessToken({ prompt });
    } catch (err) {
      settle(reject, err);
    }
  });
}

// Shared localStorage cache for a live access token — see the comment in
// Drive.init() for why this exists: it's what makes reopening the app not
// require signing in again, independent of and more reliable than Google's
// own silent-refresh/FedCM mechanism.
//
// This used to use sessionStorage, on the theory that its lifetime (cleared
// when the tab/installed-app window is fully closed) was a good match for
// the token's own ~1 hour lifetime. In practice that was the actual bug:
// closing and reopening an installed PWA (or a fresh tab) starts a brand
// new browsing session, so sessionStorage was empty on essentially every
// open — the exact "prompted to sign in every time I open the app" report.
// localStorage persists across those opens, and loadCachedToken() below
// still refuses to hand back a token past its real expiresAt, so this
// doesn't extend how long a token is trusted — it just stops throwing away
// a still-valid one for no reason.
export function saveCachedToken(key, accessToken, expiresAt) {
  try {
    localStorage.setItem(key, JSON.stringify({ accessToken, expiresAt }));
  } catch (e) {
    // localStorage can throw (e.g. disabled in some private-browsing
    // configurations) — losing the cache just means falling back to the
    // normal silent-refresh path, so this is safe to ignore.
  }
}

export function loadCachedToken(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.accessToken || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function clearCachedToken(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    // ignore
  }
}

// The proactive-refresh setTimeout in Drive/GCal is only reliable while the
// tab/app stays in the foreground — mobile browsers (and installed PWAs
// especially) routinely freeze or heavily throttle timers for a backgrounded
// page, so a token due to expire while the app is sitting unused in the
// background often doesn't get refreshed until well after the fact. Rather
// than wait for that stale timer to eventually fire, every registered
// callback runs again immediately whenever the page becomes visible —
// catching an about-to-expire (or already-expired) token right at the
// moment the user actually reopens/resumes the app, which is exactly when
// it matters. Registered once per callback; safe to call from both
// drive.js and gcal.js.
const visibilityCallbacks = new Set();
let visibilityWired = false;
export function onAppVisible(fn) {
  visibilityCallbacks.add(fn);
  if (!visibilityWired) {
    visibilityWired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      for (const cb of visibilityCallbacks) {
        try {
          cb();
        } catch (e) {
          console.warn('onAppVisible callback failed:', e.message || e);
        }
      }
    });
  }
}
