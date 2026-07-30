import { DB } from './db.js';
import { seedIfEmpty } from './seed.js';
import { Drive } from './drive.js';
import { GCal } from './gcal.js';
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
  renderCalendar,
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
  route('/calendar', renderCalendar);
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
  updateInboxBadge();
  DB.onChange(() => updateInboxBadge());

  // Run these one after another rather than concurrently: both silently
  // request a Google token on load via a hidden iframe, and firing two of
  // those at once has been observed to make one (or both) fail, forcing an
  // unnecessary manual reconnect even though the user is still signed in.
  // Deliberately NOT awaited here — Google's identity script can be slow or
  // fail to load entirely (offline, blocked, etc.), and that must never
  // delay the rest of app startup, especially registering the service
  // worker that makes the app work offline in the first place.
  Drive.init()
    .catch((e) => console.warn('Drive init:', e.message))
    .then(() => GCal.init().catch((e) => console.warn('Calendar sync init:', e.message)));

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

async function updateInboxBadge() {
  const badge = document.getElementById('inbox-badge');
  if (!badge) return;
  const items = await DB.getByIndex('items', 'type', 'inbox');
  badge.textContent = items.length || '';
  badge.style.display = items.length ? 'inline-block' : 'none';
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
