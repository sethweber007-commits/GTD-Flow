// ---------------------------------------------------------------------------
// App configuration. The only thing you MUST edit before Google Drive backup
// will work is GOOGLE_CLIENT_ID below. See SETUP.md for the exact steps to
// get one (it's free and takes about 5 minutes).
// ---------------------------------------------------------------------------

export const CONFIG = {
  // Paste your OAuth 2.0 Web Client ID from Google Cloud Console here.
  // Looks like: 123456789012-abc123def456.apps.googleusercontent.com
  GOOGLE_CLIENT_ID: '565445355888-ao51l4ve0j2tn2h94tfdjq85stld72sh.apps.googleusercontent.com',

  // The Drive API scope requested. drive.file only lets this app see/edit
  // files IT creates (never your whole Drive) — keeps the OAuth consent
  // screen simple and avoids Google's app-verification review process.
  GOOGLE_DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.file',

  // Name of the folder created in the user's Drive to hold backups.
  DRIVE_BACKUP_FOLDER: 'GTD PWA Backups',

  // Backup filename inside that folder. A single rolling file is kept up to
  // date; timestamped snapshots are also written on each weekly review.
  DRIVE_BACKUP_FILE: 'gtd-backup-latest.json',

  // Milliseconds to wait after the last data change before pushing a backup.
  BACKUP_DEBOUNCE_MS: 15000,

  // Milliseconds between background sync sweeps while the app is open and
  // Drive is connected — a safety net alongside the event-driven sync
  // (on change, on reconnect, on regaining connectivity, on the app coming
  // back to the foreground) so two devices left open stay caught up with
  // each other even during a long idle stretch with no local edits.
  AUTO_SYNC_INTERVAL_MS: 5 * 60 * 1000,

  // App name shown in the UI.
  APP_NAME: 'GTD Flow',
};
