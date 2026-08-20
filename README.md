# GTD Flow

A complete, installable Progressive Web App implementing David Allen's
**Getting Things Done®** methodology — capture, clarify, organize, reflect,
and engage — plus the full **Horizons of Focus** altitude model for
connecting daily actions to long-term goals and purpose.

No build step, no backend, no account required to use it. Your data lives
in your browser (IndexedDB) and, optionally, is backed up automatically to
a folder in your own Google Drive.

## What's included

**Core workflow**
- **Inbox** — frictionless quick-capture for anything on your mind.
- **Clarify** — a guided, step-by-step version of the classic GTD workflow
  diagram (Is it actionable? → Project or single action? → 2-minute rule →
  Delegate / Defer / Do) so every inbox item gets processed correctly. At
  any point where the item is (or belongs to) a project, you can link it to
  an **existing project** instead of always creating a new one — for both
  single actions and multi-step items. Delegating an item captures a
  **Waiting On** entry inline, right in the wizard, with no extra dialog.
  Non-actionable items can also be filed as **Project Info** against an
  existing project.
- **Next Actions** — grouped by context: just type a context (e.g. `@Calls`,
  `@Errands`) into an action's Context field — there's no fixed list to
  manage, contexts are whatever you've actually used, with autocomplete from
  previous ones as you type.
- **Projects** — any outcome needing more than one step. Each project page
  is organized into three subsections — **Next Actions**, **Waiting On**,
  and **Project Info** (for non-actionable reference material tied to that
  project, e.g. confirmation numbers or account details) — each with its
  own "+ Add" button. The first action added to a project is placed
  straight onto the Next Actions list automatically; once a project already
  has an active action, further ones start off the list until you tap
  "Activate" — so a project is never left stalled for want of its one
  action being switched on. The project list shows a "stalled" warning when
  an active project has no open next action or waiting-on item (project
  info doesn't count). From Clarify, turning an inbox item into a project
  defaults the project title to the item's text, and lets you add its
  first next action immediately or leave it for later.
- **Waiting For** — things delegated or expected from other people,
  capturable straight from Clarify or added directly to a project.
- **Someday/Maybe** — ideas parked for later, with an optional tickler
  date, one-click "Activate" into a real next action, custom **sections**
  for grouping ideas, and a "Export .md" button to save the whole list as a
  Markdown file.
- **Calendar & Tickler** — for anything with a specific date and time, you
  choose its **Kind**: a **Scheduled event** (a hard commitment, listed
  under Scheduled) or a **Tickler** (a reminder to revisit, listed under
  Tickler alongside Someday/Maybe items whose revisit date has arrived).
  Both kinds are fully actionable — check off, edit, or delete either one
  directly. This choice is available anywhere a dated item is created or
  edited: Clarify's "dated" step, the Calendar page's "Add dated item"
  button, and when editing an existing item. Also exportable to Markdown.
- **Reference** — a searchable, categorized filing system for
  non-actionable material you want to keep (see *References*, below).
  Marking an inbox item as Reference during Clarify immediately opens the
  editor so you can name its category; also exportable to Markdown.
- **Weekly Review** — the full classic GTD weekly review checklist (Get
  Clear / Get Current / Get Creative), with history tracking.

**Horizons of Focus** — condensed into a single tab with each altitude
level as an expandable section, so you can see the whole picture at once:
- **Purpose & Principles** (40,000 ft)
- **Vision** (30,000 ft)
- **Goals** (20,000 ft)
- **Areas of Focus & Accountability** (10,000 ft)
- *(Projects and Next Actions above serve as the Runway and Ground level.)*

**Sync & Backup**
- Automatic two-way sync to Google Drive (via your own free OAuth client —
  see `SETUP.md`) using the narrow `drive.file` scope, so the app can only
  ever touch files it created. Once connected, it syncs on its own — after
  every change, whenever the app regains connectivity or comes back to the
  foreground, and every few minutes in the background — so multiple devices
  signed into the same Drive stay caught up with each other with no manual
  step.
- Manual "Sync now" / "Back up now" / "Restore latest backup" in Settings
  for an immediate, on-demand sync.
- A local export/import `.json` file as a second safety net, independent
  of Drive.

**PWA essentials**
- Live item-count badges in the left nav for Inbox, Next Actions, Projects,
  and Waiting For, so you can see at a glance how much is on each list
  without opening it.
- Installable to your home screen / desktop (`manifest.json` + install
  button), with a modern "GTD" lettermark as the app icon/logo.
- A cohesive set of sleek inline-SVG line icons throughout the nav and UI
  (no emoji, no external icon font — stays fully offline-capable).
- Fully offline-capable after first load (`service-worker.js` precaches
  the whole app shell).
- Responsive layout for phone, tablet, and desktop.

## References

This app is an independent, unofficial implementation of the **Getting
Things Done®** methodology as publicly described by David Allen. It is not
affiliated with, endorsed by, or reviewed by David Allen or the David Allen
Company. "Getting Things Done" and "GTD" are registered trademarks of the
David Allen Company.

- David Allen, *Getting Things Done: The Art of Stress-Free Productivity*
  (Penguin, rev. ed. 2015) — the original source for the five-step
  workflow (Capture, Clarify, Organize, Reflect, Engage), the Horizons of
  Focus model, the weekly review, and the "2-minute rule."
- David Allen, *Making It All Work: Winning at the Game of Work and the
  Business of Life* (Penguin, 2008) — source for the expanded Horizons of
  Focus / "runway to 50,000 ft" framing used in this app's navigation.
- [gettingthingsdone.com](https://gettingthingsdone.com) — the David Allen
  Company's official site, for the canonical workflow diagram this app's
  **Clarify** wizard is modeled on.

Within the app itself, the **Reference** section (in the left nav) is
where *your own* non-actionable material gets filed by topic — that's the
GTD "Reference" component of the Organize step, separate from this
bibliography.

## Project structure

```
gtd-pwa/
├── index.html            App shell / layout
├── manifest.json          PWA manifest
├── service-worker.js       Offline caching
├── css/styles.css
├── icons/                 App icons (generated)
├── js/
│   ├── app.js              Bootstraps the app, routing, nav
│   ├── router.js            Tiny hash router
│   ├── db.js                IndexedDB data layer
│   ├── drive.js              Google Drive backup
│   ├── sync.js                Two-way Drive sync (merge + auto-sync triggers)
│   ├── gcal.js                  One-way Google Calendar sync
│   ├── config.js              ← put your Google Client ID here
│   ├── seed.js                 First-run data
│   ├── modal.js                 Reusable modal + item/project/section forms
│   ├── utils.js                  Small shared helpers (incl. .md export)
│   ├── icons.js                   Inline-SVG icon set
│   └── views/
│       ├── workflow.js            Inbox, Clarify, Next Actions, Projects,
│       │                          Waiting For, Someday, Calendar, Reference,
│       │                          Weekly Review
│       ├── horizons.js             Purpose/Vision/Goals/Areas, one accordion tab
│       └── settings.js              Drive backup UI, contexts, data tools
├── SETUP.md                Hosting + Google Drive OAuth setup (read this first)
└── README.md               This file
```

## Getting started

See **`SETUP.md`** — it walks through hosting the app and (optionally)
enabling automatic Google Drive backup.
