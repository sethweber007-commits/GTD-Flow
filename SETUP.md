# GTD Flow — Setup Guide

This app is a set of plain HTML/CSS/JS files — there's no build step, no
server, and no database to install. Everything runs in your browser and
your data lives on your device (IndexedDB), with an optional automatic
copy backed up to your own Google Drive.

There are two things to do before it's fully ready:

1. **Host it somewhere with HTTPS** (required for installability and for
   Google sign-in to work).
2. **Create a free Google OAuth Client ID** (required only if you want the
   automatic Drive backup — the app works fully offline without it).

---

## 1. Hosting it (pick one)

Google sign-in and "Add to Home Screen" both require the app to be served
over `https://` (or `http://localhost` while testing). Opening `index.html`
directly from disk (`file://`) will run the core GTD workflow fine, but
skip installability and Drive backup.

### Quick local test (no account needed)
From inside the `gtd-pwa` folder:
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your browser. `localhost` counts as a
secure origin, so install + sign-in both work here for testing.

### Free permanent hosting — GitHub Pages
1. Create a new **public** GitHub repo and push the contents of this folder
   to it.
2. Repo Settings → Pages → Source: deploy from the `main` branch, `/root`.
3. GitHub gives you a URL like `https://yourname.github.io/your-repo/`.
   That's your app's permanent address.

### Free permanent hosting — Netlify (drag & drop)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the whole `gtd-pwa` folder onto the page.
3. Netlify gives you a `https://random-name.netlify.app` URL instantly. You
   can rename it or add a custom domain later, for free.

Either way, once it's live, open it, and your browser will offer to
**install** it (or use the "⬇ Install app" button in the top bar / your
browser's "Add to Home Screen").

---

## 2. Enabling automatic Google Drive backup

The app writes a JSON snapshot of all your GTD data to a folder named
**"GTD PWA Backups"** in your own Google Drive, automatically, a few
seconds after you make a change (and always right after a Weekly Review).
It only ever touches files it created itself — it can never see or modify
anything else in your Drive.

To turn this on, you need your own free OAuth Client ID from Google Cloud.
This is a one-time, ~5 minute setup:

1. Go to **[console.cloud.google.com](https://console.cloud.google.com/)**
   and sign in with the Google account whose Drive you want backups to go
   to.
2. Click the project dropdown (top left) → **New Project**. Name it
   anything (e.g. "GTD Flow") → **Create**. Wait a few seconds, then make
   sure it's selected.
3. In the left menu, go to **APIs & Services → Library**. Search for
   **"Google Drive API"** and click **Enable**.
4. Go to **APIs & Services → OAuth consent screen**.
   - User Type: **External** → Create.
   - Fill in an App name (e.g. "GTD Flow"), your email as the support
     email, and your email again under Developer contact → **Save and
     Continue**.
   - Scopes: click **Add or Remove Scopes**, search for `drive.file`,
     check `.../auth/drive.file` → **Update** → **Save and Continue**.
   - Test users: click **Add Users** and add your own Google account's
     email → **Save and Continue**. (Because this is a personal app that
     hasn't gone through Google's public-app review, only accounts listed
     here can sign in — that's fine, just add yourself and anyone else who
     will use the app.)
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
   - Application type: **Web application**.
   - Name: anything.
   - Under **Authorized JavaScript origins**, add the exact URL(s) you'll
     use the app from, e.g.:
     - `http://localhost:8080` (for local testing)
     - `https://yourname.github.io` (for GitHub Pages — origin only, no
       path)
     - `https://your-app-name.netlify.app` (for Netlify)
   - Leave "Authorized redirect URIs" empty — it isn't needed for this
     flow.
   - Click **Create**. Copy the **Client ID** shown (ends in
     `.apps.googleusercontent.com`).
6. Open `js/config.js` in this folder and paste it in:
   ```js
   GOOGLE_CLIENT_ID: 'PASTE-YOUR-CLIENT-ID-HERE.apps.googleusercontent.com',
   ```
7. Reload the app, go to **Settings → ☁️ Google Drive backup → Connect
   Google Drive**, and approve the consent screen. You'll see a warning
   that says "Google hasn't verified this app" — that's expected for a
   personal project only you (and whoever you added as a test user) can
   use; click **Continue**.

That's it — from then on, every change auto-backs-up in the background,
and you can also trigger a manual backup or restore from Settings at any
time.

> **Note:** Test-user OAuth consent screens allow up to 100 test users and
> never expire the way "unverified" personal-use apps used to. If you ever
> want anyone to sign in without being added as a test user, you'd submit
> the app for Google's verification review — not necessary for personal or
> family use.

---

## 3. Enabling Google Calendar sync

Calendar & Tickler can push Scheduled events and Ticklers to a real Google
Calendar automatically. It's a completely separate connection from Drive
backup — its own "Connect Google Calendar" button in Settings, its own
consent screen — but it reuses the **same OAuth Client ID** you already
created in step 2 above. If you haven't done step 2 yet, do that first; you
only need to create one OAuth client for the whole app.

1. Back in **[console.cloud.google.com](https://console.cloud.google.com/)**,
   with the same project selected, go to **APIs & Services → Library**.
   Search for **"Google Calendar API"** and click **Enable** (this is a
   separate API from Drive — you need both enabled).
2. Go to **APIs & Services → OAuth consent screen** → **Audience** (or
   **Scopes**, depending on the current console layout) → **Add or Remove
   Scopes**. Search for `calendar.events`, check
   `.../auth/calendar.events` → **Update** → **Save**.
   - Unlike `drive.file`, this scope is considered "sensitive" by Google —
     it can create, edit, and delete events. That doesn't change anything
     about this setup: it still works the same way for the test users
     you've already added, with the same "Google hasn't verified this app"
     click-through. It would only require Google's formal verification
     review if you later published the app for the general public.
3. That's it for Cloud Console — no new OAuth client needed, no new
   redirect URIs. `js/config.js` already points at the right scope
   (`GOOGLE_CALENDAR_SCOPE`) and calendar (`GOOGLE_CALENDAR_ID: 'primary'`,
   your main calendar) by default.
4. Reload the app, go to **Settings → 📅 Google Calendar sync → Connect
   Google Calendar**, and approve the consent screen — you'll see the same
   "unverified app" click-through as Drive; that's expected. Approving it
   immediately pushes any existing Scheduled events/Ticklers to your
   calendar, and every new one from then on syncs automatically.

To disconnect later, use **Disconnect** in that same card — it only revokes
this app's access token; it does not delete any events already created on
your calendar.

---

## Updating the app later

Just edit the files and re-deploy (re-push to GitHub / re-drag to
Netlify). Bump `CACHE_VERSION` at the top of `service-worker.js` any time
you change a file, so installed copies pick up the update.

---

## Troubleshooting

**"Something went wrong starting the app: the requested version (N) is less
than the existing version (M)"** — this means the browser already has local
data for this app (on this device/origin) stored at a newer version than the
app code expects, which can happen after testing an intermediate build or
redeploying an older copy over a newer one. The app now detects and
self-heals this automatically on load — you shouldn't see it anymore. If you
still hit a startup error of any kind, the error screen has two buttons:
**Reload** (try again — fixes it if another open tab was briefly holding the
database open) and **Erase local data & start fresh** (deletes this app's
local data on this device only; your Google Drive backup, if connected, is
untouched — reconnect and use "Restore latest backup" in Settings to bring
your data back).

**"This app has not completed the Google verification process" (hard block,
no "Continue" option)** — this happens for both the Drive and Calendar
connections and almost always means the Google account you're signing in
with isn't on the **Test users** list for the OAuth consent screen. Go to
**APIs & Services → OAuth consent screen → Audience** and add that exact
email. If it's a work/school Google account rather than a personal one,
your organization's admin may block unverified third-party apps entirely —
try a personal `@gmail.com` account instead. Separately, make sure whatever
URL you're testing from (`http://localhost:8080`, your GitHub Pages/Netlify
URL, etc.) is listed under **Authorized JavaScript origins** on the OAuth
client in **APIs & Services → Credentials**.

**Calendar events aren't showing up after connecting** — click **Sync now**
in the Google Calendar sync card in Settings; it re-pushes everything.
If that doesn't help, check the browser console for errors — a common cause
is forgetting to enable the **Google Calendar API** itself (separate toggle
from adding the `calendar.events` scope) in step 3 above.

**Keeps asking to sign in to Google again** — as of this version, staying
signed in across a page reload no longer depends on Google's own
silent-refresh at all: your access token is cached in the browser's
`sessionStorage` the moment you connect, so reloading the app (same tab or
installed-app window) restores the connection instantly with no network
round trip and no chance of Google's silent flow failing. You should now
only ever see the sign-in screen again after fully closing the tab/app (this
clears `sessionStorage`) and reopening it later — and even then, the app
first tries a silent Google reconnect (using FedCM) before falling back to
asking you to click "Connect" again. If a page reload is still forcing a
full sign-in after updating to this version, that's a bug — check the
browser console for errors, and note that private/incognito windows clear
`sessionStorage` more aggressively in some browsers, which can defeat this.
Also, since this app has no backend, Google never issues it a long-lived
refresh token — the access token itself still expires roughly every hour;
the app refreshes it automatically in the background while open, but after
the app has been fully closed for a long stretch, one fresh consent click is
normal and expected, not a bug.
