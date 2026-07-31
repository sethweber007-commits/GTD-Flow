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

  // The Calendar API scope requested for Calendar & Tickler sync. This is a
  // "sensitive" scope (it can create/edit/delete events), unlike drive.file
  // — it works the same way in Google Cloud Console though: enable the
  // Calendar API, add this scope on the same OAuth consent screen, and the
  // same GOOGLE_CLIENT_ID above is reused. See SETUP.md.
  GOOGLE_CALENDAR_SCOPE: 'https://www.googleapis.com/auth/calendar.events',

  // Which calendar to sync into. 'primary' is the user's main calendar.
  GOOGLE_CALENDAR_ID: 'primary',

  // How long (in minutes) a synced Calendar & Tickler item's event block is,
  // since GTD items are a single point in time rather than a start/end range.
  GCAL_EVENT_DURATION_MINUTES: 30,

  // App name shown in the UI.
  APP_NAME: 'GTD Flow',
};
