import { DB } from './db.js';
import { seedIfEmpty } from './seed.js';
import { Drive } from './drive.js';
import { Sync } from './sync.js';
import { Cleanup } from './cleanup.js';
import { route, notFound, startRouter, navigate } from './router.js';
import { CONFIG } from './config.js';
import {
  renderInbox,
  renderClarify,
  renderNextActions,
  renderProjects,
  renderProjectDetail,
  renderWaitingFor,
  renderSomeday,
  renderSchedule,
  renderReference,
  renderReview,
} from './views/workflow.js';
import { renderHorizons } from './views/horizons.js';
import { renderSettings } from './views/settings.js';

document.title = CONFIG.APP_NAME;
document.querySelectorAll('.brand-name').forEach((n) => (n.textContent = CONFIG.APP_NAME));

async function main() {
  await DB.init();
  await seedIfEmpty();

  route('/inbox', renderInbox);
  route('/clarify', renderClarify);
  route('/next-actions', renderNextActions);
  route('/projects', renderProjects);
  route('/projects/:id', ({ id }) => renderProjectDetail(id));
  route('/waiting-for', renderWaitingFor);
  route('/someday', renderSomeday);
  route('/calendar', renderSchedule);
  // Old deep link from the section's brief stint as "To-Do Schedule".
  route('/schedule', () => navigate('/calendar'));
  route('/reference', renderReference);
  route('/review', renderReview);
  route('/horizons', renderHorizons);
  // Old deep links from the previous 4-tab layout still land somewhere useful.
  route('/horizons/:level', () => navigate('/horizons'));
  route('/settings', renderSettings);
  notFound(renderInbox);

  startRouter();
  wireNav();
  wireInstallPrompt();
  updateNavBadges();
  DB.onChange(() => updateNavBadges());

  // Boot-safe: init() only ever reuses a still-valid token cached in
  // localStorage from an earlier explicit sign-in — it never requests a
  // new one from Google, so nothing here can show a sign-in prompt of any
  // kind. If there's no valid cached token, the actual (silent) reconnect
  // attempt is deferred to Drive.reconnectIfNeeded(), called only when the
  // user opens Settings — see views/settings.js. That's what keeps a Google
  // sign-in prompt from ever appearing just because the app was opened to
  // some other section. Deliberately NOT awaited here — Google's identity
  // script can be slow or fail to load entirely (offline, blocked, etc.),
  // and that must never delay the rest of app startup, especially
  // registering the service worker that makes the app work offline in the
  // first place.
  Sync.init();
  Drive.init().catch((e) => console.warn('Drive init:', e.message));
  // After Sync.init() so its change listener is already wired — any records
  // this sweep removes/unlinks get picked up by the same debounce that
  // pushes normal edits to Drive.
  Cleanup.init();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((e) => console.warn('SW registration failed', e));
  }
}

function wireNav() {
  const toggle = document.getElementById('nav-toggle');
  const sidebar = document.getElementById('sidebar');
  toggle?.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach((a) =>
    a.addEventListener('click', () => sidebar.classList.remove('open'))
  );
}

function paintBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;
  badge.textContent = count || '';
  badge.style.display = count ? 'inline-block' : 'none';
}

// Sidebar counters: Inbox counts everything waiting to be clarified; Next
// Actions and Waiting For count what's actually open on those lists (same
// filters those views use); Projects counts active projects that are
// stalled — no open next action or waiting-on item — same "stalled" flag
// the Projects page badges onto each row, so the sidebar surfaces exactly
// what needs a next action added;
// Calendar counts items still waiting to be scheduled (same "pending" set
// renderSchedule shows above the fold) — standalone calendar items plus every
// open Next Action, both not yet checked off as scheduled.
async function updateNavBadges() {
  const [inboxItems, allActions, waitingItems, projects, calendarItems] = await Promise.all([
    DB.getByIndex('items', 'type', 'inbox'),
    DB.getByIndex('items', 'type', 'next-action'),
    DB.getByIndex('items', 'type', 'waiting-for'),
    DB.getAll('projects'),
    DB.getByIndex('items', 'type', 'calendar'),
  ]);
  paintBadge('inbox-badge', inboxItems.length);
  paintBadge('next-actions-badge', allActions.filter((i) => !i.completed && i.activated !== false).length);
  paintBadge('waiting-for-badge', waitingItems.filter((i) => !i.completed).length);
  const openProjectItems = [...allActions, ...waitingItems].filter((i) => !i.completed);
  const stalledProjects = projects.filter((p) => p.status === 'active' && !openProjectItems.some((i) => i.projectId === p.id));
  paintBadge('projects-badge', stalledProjects.length);
  const pendingCalendarItems = calendarItems.filter((i) => !i.scheduled).length;
  const pendingFlaggedActions = allActions.filter((i) => !i.completed && !i.scheduled).length;
  paintBadge('calendar-badge', pendingCalendarItems + pendingFlaggedActions);
}

let deferredInstallPrompt = null;
function wireInstallPrompt() {
  const btn = document.getElementById('install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btn) btn.hidden = false;
  });
  btn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    if (btn) btn.hidden = true;
  });
}

main().catch((err) => {
  console.error(err);
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = `
    <p>Something went wrong starting the app: ${err.message}</p>
    <p style="margin-top:8px;">This is usually fixed by closing any other open tabs/windows of this
    app and reloading. If it keeps happening, your browser's local data for
    this app may be in an unexpected state.</p>
  `;
  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'btn btn-primary btn-small';
  reloadBtn.style.marginTop = '10px';
  reloadBtn.textContent = 'Reload';
  reloadBtn.onclick = () => location.reload();
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-danger btn-small';
  resetBtn.style.marginTop = '10px';
  resetBtn.style.marginLeft = '8px';
  resetBtn.textContent = 'Erase local data & start fresh';
  resetBtn.onclick = () => {
    if (!confirm('This permanently deletes all local data for this app on this device (any Google Drive backup is untouched). Continue?')) return;
    indexedDB.deleteDatabase('gtd-pwa-db');
    location.reload();
  };
  box.appendChild(reloadBtn);
  box.appendChild(resetBtn);
  root.appendChild(box);
});
