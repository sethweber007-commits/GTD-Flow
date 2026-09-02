# CLAUDE.md

## Service worker cache versioning

`service-worker.js` precaches a fixed list of files (`PRECACHE`) under a
single cache keyed by `CACHE_VERSION`. Installed PWA clients only fetch
fresh files when `CACHE_VERSION` changes — otherwise they keep serving
whatever was cached before, indefinitely.

**Whenever a commit changes the contents of any file listed in `PRECACHE`**
(currently: `index.html`, `manifest.json`, `css/styles.css`, and everything
under `js/`, plus the icon files), bump `CACHE_VERSION` in the same commit.
Increment the trailing number (e.g. `gtd-flow-v14` → `gtd-flow-v15`).

Adding a new file to `PRECACHE` itself also requires a bump, same reason.
