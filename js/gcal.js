// Google Calendar sync for the Calendar & Tickler section.
//
// One-way push: Scheduled events AND Tickler items you create in the app
// get created/updated/deleted in your real Google Calendar automatically.
// Nothing is ever pulled back from Google Calendar into the app — this app
// stays the source of truth, so there's no conflict-resolution to worry
// about. Uses its own Google Identity Services token (separate from the
// Drive backup connection, separate scope, separate consent) so you can
// connect either one independently.
//
// Everything here degrades gracefully: if CONFIG.GOOGLE_CLIENT_ID hasn't
// been set, or the network is unavailable, the rest of the app keeps
// working fully offline against IndexedDB.

import { CONFIG } from './config.js';
import { DB } from './db.js';
import { waitForGis, initTokenClient, requestTokenFrom, saveCachedToken, loadCachedToken, clearCachedToken, onAppVisible } from './drive.js';

function eventsUrl(calendarId) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

// Local (not UTC) yyyy-mm-dd, for Google Calendar's all-day "date" fields —
// using toISOString() here would shift the date near midnight in timezones
// behind UTC, showing the event a day earlier than what was actually picked.
function toDateOnlyString(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const GCAL_TOKEN_CACHE_KEY = 'gtd-pwa-gcal-token';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
const statusListeners = new Set();
let status = { state: 'signed-out', message: 'Not connected', lastSyncAt: null };

// Ids of items we just wrote a googleEventId onto ourselves — the next
// DB.onChange 'put' event for that id is our own echo, not a user edit, so
// it must be swallowed to avoid syncing in an infinite loop.
const pendingSelfWrites = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of statusListeners) fn(status);
}

function isSyncableCalendarItem(item) {
  return item && item.type === 'calendar' && !!item.calendarDate;
}

export const GCal = {
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
    const lastSyncAt = await DB.getMeta('lastCalendarSyncAt');
    if (lastSyncAt) setStatus({ lastSyncAt });

    if (!this.isConfigured()) {
      setStatus({ state: 'unconfigured', message: 'Add a Google Client ID in js/config.js to enable calendar sync' });
      return;
    }

    // Fast path: reuse a still-valid access token cached in localStorage
    // from earlier — see Drive.init() in drive.js for the full explanation.
    // This is what makes both a plain page refresh AND fully reopening the
    // app not require signing in again, as long as the token itself hasn't
    // actually expired.
    const cached = loadCachedToken(GCAL_TOKEN_CACHE_KEY);
    if (cached) {
      accessToken = cached.accessToken;
      tokenExpiresAt = cached.expiresAt;
      setStatus({ state: 'signed-in', message: 'Connected to Google Calendar' });
      this._wireAutoSync();
      this._scheduleProactiveRefresh();
      this._wireVisibilityCheck();
    } else {
      setStatus({ state: 'signed-out', message: 'Not connected' });
    }

    // Constructing the token client is local/offline and never shows
    // anything to the user, so it's safe on every app load. Actually
    // requesting a token is the part that can prompt, and that only
    // happens in reconnectIfNeeded() / signIn(), never from here.
    await waitForGis();
    tokenClient = initTokenClient(CONFIG.GOOGLE_CALENDAR_SCOPE);
  },

  // Attempts a silent (no-popup) reconnect for a user who previously
  // connected Calendar sync but has no valid cached token right now. See
  // Drive.reconnectIfNeeded in drive.js for the full rationale — this is
  // deliberately NOT called on app startup, only from the Settings page
  // ("the ... calendar section") via views/settings.js and from the
  // Calendar & Tickler page itself, so a Google sign-in prompt of any kind
  // never appears just from opening the app to some other section.
  async reconnectIfNeeded() {
    if (!this.isConfigured() || status.state === 'signed-in') return;
    const previouslySignedIn = await DB.getMeta('gcalSignedIn');
    if (!previouslySignedIn) return;
    await waitForGis();
    if (!tokenClient) tokenClient = initTokenClient(CONFIG.GOOGLE_CALENDAR_SCOPE);
    try {
      await this._requestToken({ prompt: '' });
      setStatus({ state: 'signed-in', message: 'Connected to Google Calendar' });
      this._wireAutoSync();
      this._scheduleProactiveRefresh();
      this._wireVisibilityCheck();
    } catch (e) {
      setStatus({ state: 'signed-out', message: 'Sign in to resume Calendar sync' });
    }
  },

  _wireVisibilityCheck() {
    if (this._visibilityHooked) return;
    this._visibilityHooked = true;
    onAppVisible(() => this._checkOnVisible());
  },

  // See Drive._checkOnVisible in drive.js for the full explanation — same
  // idea here, independently, for the Calendar connection.
  async _checkOnVisible() {
    if (!this.isConfigured() || !tokenClient) return;
    if (status.state === 'signed-in' && Date.now() < tokenExpiresAt) return;
    const previouslySignedIn = await DB.getMeta('gcalSignedIn');
    if (!previouslySignedIn) return;
    try {
      await this._requestToken({ prompt: '' });
      if (status.state !== 'signed-in') {
        setStatus({ state: 'signed-in', message: 'Connected to Google Calendar' });
        this._wireAutoSync();
      }
      this._scheduleProactiveRefresh();
    } catch (e) {
      if (status.state === 'signed-in') {
        setStatus({ state: 'signed-out', message: 'Sign in to resume Calendar sync' });
      }
    }
  },

  async signIn() {
    if (!this.isConfigured()) {
      throw new Error('Set GOOGLE_CLIENT_ID in js/config.js first — see SETUP.md');
    }
    await waitForGis();
    if (!tokenClient) tokenClient = initTokenClient(CONFIG.GOOGLE_CALENDAR_SCOPE);
    setStatus({ state: 'connecting', message: 'Waiting for Google sign-in…' });
    // See Drive.signIn in drive.js — try a silent reconnect first for a
    // returning user with a still-active Google session, only falling back
    // to the full consent screen when that's not possible.
    const previouslySignedIn = await DB.getMeta('gcalSignedIn');
    if (previouslySignedIn) {
      try {
        await this._requestToken({ prompt: '' });
      } catch (e) {
        await this._requestToken({ prompt: 'consent' });
      }
    } else {
      await this._requestToken({ prompt: 'consent' });
    }
    await DB.setMeta('gcalSignedIn', true);
    setStatus({ state: 'signed-in', message: 'Connected to Google Calendar' });
    this._wireAutoSync();
    this._scheduleProactiveRefresh();
    this._wireVisibilityCheck();
    await this.syncAll();
  },

  async signOut() {
    if (accessToken && google.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    clearTimeout(this._refreshTimer);
    clearCachedToken(GCAL_TOKEN_CACHE_KEY);
    await DB.setMeta('gcalSignedIn', false);
    setStatus({ state: 'signed-out', message: 'Disconnected' });
  },

  _requestToken({ prompt }) {
    return requestTokenFrom(tokenClient, prompt, (resp) => {
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000 - 30000;
      saveCachedToken(GCAL_TOKEN_CACHE_KEY, accessToken, tokenExpiresAt);
    });
  },

  async _ensureToken() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    await this._requestToken({ prompt: '' });
    return accessToken;
  },

  // See Drive._scheduleProactiveRefresh in drive.js for why.
  _scheduleProactiveRefresh() {
    clearTimeout(this._refreshTimer);
    if (!tokenExpiresAt) return;
    const delay = Math.max(tokenExpiresAt - Date.now() - 5 * 60 * 1000, 30000);
    this._refreshTimer = setTimeout(async () => {
      try {
        await this._requestToken({ prompt: '' });
      } catch (e) {
        console.warn('Calendar background token refresh failed:', e.message || e);
      }
      this._scheduleProactiveRefresh();
    }, delay);
  },

  _wireAutoSync() {
    if (this._wired) return;
    this._wired = true;
    DB.onChange(({ store, action, payload }) => {
      if (store !== 'items') return;
      if (status.state !== 'signed-in') return;

      if (action === 'remove') {
        this._handleRemoved(payload).catch((e) => console.error('Calendar sync (delete) failed', e));
        return;
      }
      if (action === 'put' && pendingSelfWrites.has(payload.id)) {
        // This is our own write of googleEventId echoing back — not a real
        // user edit. Swallow it once so we don't sync in a loop.
        pendingSelfWrites.delete(payload.id);
        return;
      }
      if (!isSyncableCalendarItem(payload)) return;
      this._syncItem(payload).catch((e) => console.error('Calendar sync failed', e));
    });
  },

  _eventBody(item) {
    const start = new Date(item.calendarDate);
    const isTickler = item.calendarKind === 'tickler';
    const footer = 'Synced from GTD Flow' + (isTickler ? ' — this is a tickler reminder, not a hard commitment.' : '.');
    const body = {
      summary: (isTickler ? '[Tickler] ' : '') + item.title,
      description: item.notes ? `${item.notes}\n\n${footer}` : footer,
    };
    if (item.calendarAllDay) {
      // No time was given when scheduling it — sync as an all-day event
      // (Google Calendar's "date" field, no "dateTime") rather than
      // guessing/forcing a time that was never actually set.
      const nextDay = new Date(start.getTime() + 24 * 60 * 60000);
      body.start = { date: toDateOnlyString(start) };
      body.end = { date: toDateOnlyString(nextDay) };
    } else {
      const end = new Date(start.getTime() + (CONFIG.GCAL_EVENT_DURATION_MINUTES || 30) * 60000);
      body.start = { dateTime: start.toISOString() };
      body.end = { dateTime: end.toISOString() };
    }
    return body;
  },

  async _syncItem(item) {
    if (!isSyncableCalendarItem(item)) return;
    const token = await this._ensureToken();
    const calendarId = CONFIG.GOOGLE_CALENDAR_ID || 'primary';
    const body = this._eventBody(item);

    if (item.googleEventId) {
      const resp = await fetch(`${eventsUrl(calendarId)}/${item.googleEventId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.status === 404 || resp.status === 410) {
        // The event was deleted on the Google Calendar side — recreate it.
        await this._createEvent(item, token, calendarId, body);
      } else if (!resp.ok) {
        throw new Error('Calendar update failed: HTTP ' + resp.status);
      }
    } else {
      await this._createEvent(item, token, calendarId, body);
    }
    await DB.setMeta('lastCalendarSyncAt', new Date().toISOString());
    setStatus({ lastSyncAt: new Date().toISOString() });
  },

  async _createEvent(item, token, calendarId, body) {
    const resp = await fetch(eventsUrl(calendarId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('Calendar create failed: HTTP ' + resp.status);
    const created = await resp.json();
    pendingSelfWrites.add(item.id);
    await DB.put('items', { ...item, googleEventId: created.id });
  },

  async _deleteEvent(item) {
    const token = await this._ensureToken();
    const calendarId = CONFIG.GOOGLE_CALENDAR_ID || 'primary';
    const resp = await fetch(`${eventsUrl(calendarId)}/${item.googleEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
      throw new Error('Calendar delete failed: HTTP ' + resp.status);
    }
  },

  async _handleRemoved(removedItem) {
    if (!removedItem || removedItem.type !== 'calendar' || !removedItem.googleEventId) return;
    await this._deleteEvent(removedItem);
  },

  // Pushes every existing, not-yet-completed Calendar & Tickler item — used
  // right after connecting, so anything created before you signed in also
  // lands on your real calendar.
  async syncAll() {
    const items = (await DB.getAll('items')).filter((i) => isSyncableCalendarItem(i) && !i.completed);
    setStatus({ state: 'syncing', message: `Syncing ${items.length} calendar item(s)…` });
    let failures = 0;
    for (const item of items) {
      try {
        await this._syncItem(item);
      } catch (e) {
        failures += 1;
        console.error('Calendar sync failed for', item.title, e);
      }
    }
    setStatus({
      state: 'signed-in',
      message: failures ? `Connected — ${failures} item(s) failed to sync, will retry on next change` : 'Connected to Google Calendar',
      lastSyncAt: new Date().toISOString(),
    });
  },
};
