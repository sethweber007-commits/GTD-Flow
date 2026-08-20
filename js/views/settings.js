import { DB } from '../db.js';
import { el, toast, formatDateTime } from '../utils.js';
import { Drive } from '../drive.js';
import { Sync } from '../sync.js';
import { GCal } from '../gcal.js';
import { confirmModal } from '../modal.js';
import { CONFIG } from '../config.js';
import { iconSvg } from '../icons.js';

function cardTitle(icon, text) {
  return el('h3', {}, [el('span', { html: iconSvg(icon, 18) }), el('span', {}, text)]);
}
function iconLabel(icon, text, size = 15) {
  return [el('span', { html: iconSvg(icon, size) }), ' ' + text];
}

function root() {
  return document.getElementById('view-root');
}

export async function renderSettings() {
  const r = root();
  r.innerHTML = '';
  r.appendChild(el('div', { class: 'page-header' }, [el('h1', {}, 'Settings')]));

  // --- Google Drive backup ---
  const driveCard = el('div', { class: 'card' }, [cardTitle('cloud', 'Google Drive backup')]);
  const statusRow = el('p', { class: 'item-notes' });
  const btnRow = el('div', { class: 'form-actions form-actions-left' });
  driveCard.appendChild(statusRow);
  driveCard.appendChild(btnRow);
  r.appendChild(driveCard);

  async function paintDriveUI(status) {
    const lastSyncAt = await DB.getMeta('lastSyncAt');
    statusRow.textContent = status.message
      + (lastSyncAt ? ` · Last synced ${formatDateTime(lastSyncAt)}` : (status.lastBackupAt ? ` · Last backup ${formatDateTime(status.lastBackupAt)}` : ''));
    btnRow.innerHTML = '';
    if (!Drive.isConfigured()) {
      btnRow.appendChild(el('p', { class: 'hint' }, 'Add your Google OAuth Client ID in js/config.js to enable this — see SETUP.md.'));
      return;
    }
    if (status.state === 'signed-in' || status.state === 'backing-up' || status.state === 'error') {
      btnRow.appendChild(el('button', { class: 'btn btn-primary', onclick: () => Sync.syncNow().then(() => { toast('Synced'); paintDriveUI(Drive.getStatus()); }).catch(() => toast('Sync failed', 'error')) }, 'Sync now'));
      btnRow.appendChild(el('button', { class: 'btn btn-ghost', onclick: () => Drive.backupNow().then(() => toast('Backed up')).catch(() => toast('Backup failed', 'error')) }, 'Back up now'));
      btnRow.appendChild(
        el('button', { class: 'btn btn-ghost', onclick: async () => {
          if (await confirmModal('This replaces all local data with your latest Drive backup. Continue?')) {
            try { await Drive.restoreLatest(); toast('Restored from Drive'); location.reload(); }
            catch (e) { toast(e.message, 'error'); }
          }
        } }, 'Restore latest backup')
      );
      btnRow.appendChild(el('button', { class: 'btn btn-ghost', onclick: () => Drive.signOut().then(() => toast('Disconnected')) }, 'Disconnect'));
    } else {
      btnRow.appendChild(
        el('button', { class: 'btn btn-primary', onclick: async () => {
          try { await Drive.signIn(); toast('Connected to Google Drive'); }
          catch (e) { toast(e.message, 'error'); }
        } }, 'Connect Google Drive')
      );
    }
  }

  Drive.onStatus(paintDriveUI);

  // --- Google Calendar sync ---
  const gcalCard = el('div', { class: 'card' }, [cardTitle('calendar', 'Google Calendar sync')]);
  const gcalStatusRow = el('p', { class: 'item-notes' });
  const gcalBtnRow = el('div', { class: 'form-actions form-actions-left' });
  gcalCard.appendChild(gcalStatusRow);
  gcalCard.appendChild(el('p', { class: 'hint' }, 'One-way: Scheduled events and Ticklers you create in Calendar & Tickler are pushed to your Google Calendar. Nothing is ever pulled back into this app.'));
  gcalCard.appendChild(gcalBtnRow);
  r.appendChild(gcalCard);

  function paintGCalUI(status) {
    gcalStatusRow.textContent = status.message + (status.lastSyncAt ? ` · Last synced ${formatDateTime(status.lastSyncAt)}` : '');
    gcalBtnRow.innerHTML = '';
    if (!GCal.isConfigured()) {
      gcalBtnRow.appendChild(el('p', { class: 'hint' }, 'Add your Google OAuth Client ID in js/config.js to enable this — see SETUP.md.'));
      return;
    }
    if (status.state === 'signed-in' || status.state === 'syncing' || status.state === 'error') {
      gcalBtnRow.appendChild(el('button', { class: 'btn btn-primary', onclick: () => GCal.syncAll().then(() => toast('Synced')).catch(() => toast('Sync failed', 'error')) }, 'Sync now'));
      gcalBtnRow.appendChild(el('button', { class: 'btn btn-ghost', onclick: () => GCal.signOut().then(() => toast('Disconnected')) }, 'Disconnect'));
    } else {
      gcalBtnRow.appendChild(
        el('button', { class: 'btn btn-primary', onclick: async () => {
          try { await GCal.signIn(); toast('Connected to Google Calendar'); }
          catch (e) { toast(e.message, 'error'); }
        } }, 'Connect Google Calendar')
      );
    }
  }

  GCal.onStatus(paintGCalUI);

  // Settings is "the backup section" — the one place a silent Google
  // reconnect (which can still flash a native browser account UI) is
  // allowed to happen without the user having clicked Connect this
  // session. See Drive.reconnectIfNeeded / GCal.reconnectIfNeeded for why
  // this isn't done on app startup. Sequenced rather than concurrent to
  // avoid two simultaneous hidden-iframe/FedCM requests interfering with
  // each other.
  Drive.reconnectIfNeeded()
    .catch((e) => console.warn('Drive reconnect:', e.message))
    .then(() => GCal.reconnectIfNeeded().catch((e) => console.warn('Calendar reconnect:', e.message)));

  // --- Contexts ---
  const contexts = await DB.getAll('contexts');
  const ctxCard = el('div', { class: 'card' }, [cardTitle('tag', 'Contexts')]);
  const ctxList = el('div', { class: 'chip-list' });
  contexts.forEach((c) => {
    ctxList.appendChild(
      el('span', { class: 'chip' }, [
        c.icon ? `${c.icon} ${c.name}` : c.name,
        el('button', { class: 'chip-remove', onclick: async () => { await DB.remove('contexts', c.id); renderSettings(); } }, '×'),
      ])
    );
  });
  ctxCard.appendChild(ctxList);
  const addCtxForm = el('form', { class: 'inline-form' }, [
    el('input', { type: 'text', name: 'name', placeholder: '@NewContext' }),
    el('button', { class: 'btn btn-small', type: 'submit' }, 'Add'),
  ]);
  addCtxForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addCtxForm);
    const name = fd.get('name')?.toString().trim();
    if (!name) return;
    await DB.add('contexts', { name: name.startsWith('@') ? name : '@' + name, icon: '' });
    renderSettings();
  });
  ctxCard.appendChild(addCtxForm);
  r.appendChild(ctxCard);

  // --- Local backup (belt & suspenders alongside Drive) ---
  const localCard = el('div', { class: 'card' }, [
    cardTitle('save', 'Local backup file'),
    el('p', { class: 'item-notes' }, 'Works with or without Google Drive connected — a good extra safety net.'),
    el('div', { class: 'form-actions form-actions-left' }, [
      el('button', { class: 'btn btn-ghost', onclick: exportLocal }, iconLabel('download', 'Download backup (.json)')),
      el('label', { class: 'btn btn-ghost file-btn' }, ['Restore from file…', el('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: importLocal })]),
    ]),
  ]);
  r.appendChild(localCard);

  // --- Danger zone ---
  const dangerCard = el('div', { class: 'card card-danger' }, [
    cardTitle('alertTriangle', 'Danger zone'),
    el('button', { class: 'btn btn-danger', onclick: async () => {
      if (await confirmModal('This permanently deletes ALL local data (inbox, actions, projects, everything). This cannot be undone unless you have a backup.')) {
        await DB.wipeAll();
        toast('All data cleared');
        location.reload();
      }
    } }, iconLabel('trash', 'Erase all local data')),
  ]);
  r.appendChild(dangerCard);

  // --- About ---
  r.appendChild(
    el('div', { class: 'card about-card' }, [
      cardTitle('info', `About ${CONFIG.APP_NAME}`),
      el('p', { class: 'item-notes' }, [
        'An implementation of the Getting Things Done® (GTD®) workflow: Capture, Clarify, Organize, Reflect, Engage — plus the Horizons of Focus for connecting daily actions to bigger-picture goals and purpose. GTD® and Getting Things Done® are registered trademarks of the David Allen Company; this app is an independent, unofficial implementation of the publicly described methodology and is not affiliated with or endorsed by David Allen or the David Allen Company. See ',
        el('strong', {}, 'Reference'),
        ' in the nav for the classic weekly-review checklist and the in-app filing system this app is modeled on.',
      ]),
      el('p', { class: 'item-notes' }, 'All your data lives on this device (IndexedDB) and, if connected, in a folder named "' + CONFIG.DRIVE_BACKUP_FOLDER + '" in your own Google Drive. Nothing is sent to any other server.'),
    ])
  );
}

async function exportLocal() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gtd-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importLocal(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!(await confirmModal(`Replace all local data with the contents of "${file.name}"?`))) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    await DB.importAll(data, { merge: false });
    toast('Restored from file');
    location.reload();
  } catch (err) {
    toast('Could not read that file', 'error');
  }
}
