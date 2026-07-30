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
- **Clarify** — a fast, menu-first way to process your inbox one item at a
  time. Each item starts on a single 5-option menu: **New item**, **Add to
  project**, **Reference**, **Someday/Maybe**, or **Schedule/Tickler**.
  - **New item** opens to **Action**, **Project**, or **Waiting on**.
    Choosing Action still asks the classic **2-minute rule** question — do
    it now and it's marked complete on the spot, or takes longer and the
    full editor opens. Choosing Project offers to create the project and
    immediately add its first next action, or just create the project for
    later. Choosing Waiting on captures who/what you're waiting on inline,
    no extra dialog.
  - **Add to project** lets you pick an existing project, then choose
    **Action**, **Waiting on**, or **Info** for it — mirroring a project's
    three subsections. If you don't have any projects yet, it offers to
    create one from the current item instead.
  - **Reference** and **Someday/Maybe** file the item and immediately open
    the editor with the cursor already in the category/section field —
    since the title's already filled in from the inbox item, you can start
    typing (or picking) the category right away with no extra tap.
  - **Schedule/Tickler** files the item and opens the editor with the
    Scheduled-event/Tickler **Kind** field so you can set its date on the
    spot.
  - A small trash icon on the item card lets you discard anything that
    doesn't need processing at all, with a confirmation prompt.
- **Next Actions** — grouped by context (@Calls, @Computer, @Errands, @Home,
  @Office, @Anywhere, @Agendas, @Waiting, or your own custom contexts), and
  further groupable into your own custom **sections** (e.g. "Deep Work",
  "Quick Wins") via "+ Add section". Actions linked to a project show the
  project name as its own line directly above the action title, at the same
  size as the title, so it's immediately clear which project each action
  belongs to. The star, moon, edit, and delete icon buttons sit on their own
  row below the title/notes (not squeezed beside them), so a long title
  always gets the full row width and never gets cramped or forced to wrap
  early. A star button marks an action **important** — it gets a
  highlighted border and floats to the top of its context group; tap again
  to unmark it. A crescent-moon button sends an action straight to
  Someday/Maybe — a quick prompt asks which Someday/Maybe section to file it
  under (pick an existing one, create a new one on the spot, leave it
  unsorted, or Cancel to back out) and then it's gone from Next Actions.
  Completed actions move into a collapsed **Completed** section at the
  bottom (tap to expand) instead of just disappearing — each shows its
  completion date, and unchecking one there sends it straight back to your
  open Next Actions.
- **Projects** — any outcome needing more than one step. Each project page
  is organized into three subsections — **Next Actions**, **Waiting On**,
  and **Project Info** (for non-actionable reference material tied to that
  project, e.g. confirmation numbers or account details) — each with its
  own "+ Add" button. A new action linked to a project shows up in that
  project's own Next Actions subsection immediately, but stays off the
  global **Next Actions** list — flagged "Not on Next Actions yet" with an
  Activate button — until you deliberately Activate it, so brainstorming a
  project's actions doesn't flood your daily list with things you're not
  ready to actually work yet. A standalone action (no project) is unaffected
  and shows up on Next Actions right away, same as always; attaching a
  project to an action later gates it the same way, and detaching a project
  from an already-gated action un-gates it. Within each status group
  (Active / On Hold / Completed), projects with no open next action or
  waiting-on item sort to
  the top — the ones most needing attention surface first instead of
  getting buried below projects that already have next actions lined up.
  Active projects with none also get a "stalled" warning badge (project
  info items don't count toward either). From Clarify, turning an inbox
  item into a project
  defaults the project title to the item's text, and lets you add its
  first next action immediately or leave it for later. A crescent-moon
  button — on the Projects list, and on the project's own detail page —
  sends an active project to Someday/Maybe: the same section prompt as
  Next Actions asks where to file it, then the project moves entirely off
  the Projects page and onto the Someday/Maybe page (see *Someday/Maybe*
  below), keeping every linked Next Action, Waiting On, and Project Info
  item fully intact. "Reactivate" (from either the Someday/Maybe page or
  the project's own detail page) brings it straight back to Active and
  back onto the Projects page.
- **Waiting For** — things delegated or expected from other people,
  capturable straight from Clarify or added directly to a project.
- **Someday/Maybe** — ideas parked for later, with an optional tickler
  date, one-click "Activate" into a real next action, custom **sections**
  for grouping ideas, and a "Export .md" button to save the whole list as a
  Markdown file. Sections are collapsible — click a section heading to fold
  it away, the same as Reference's categories — and an "Unsorted" section
  automatically appears for anything without one. Filing an inbox item as
  Someday/Maybe during Clarify immediately opens the editor and prompts you
  to pick or create a **category** for it (the same sections system, just
  labeled "Category" for this list) — mirroring how Reference prompts for a
  category. Existing Next Actions and Projects sent here from elsewhere (see
  *Next Actions* and *Projects* above) land in whichever section you picked
  in that quick prompt. Parked projects show up right alongside idea items
  in their section, using a project-style row — open-action count, tap to
  open the full project page, and a **Reactivate** button instead of the
  usual edit/delete — so you can tell at a glance which entries are
  projects versus plain ideas.
- **Calendar & Tickler** — for anything with a specific date, you choose its
  **Kind**: a **Scheduled event** (a hard commitment, listed under
  Scheduled) or a **Tickler** (a reminder to revisit, listed under Tickler
  alongside Someday/Maybe items whose revisit date has arrived). The Date
  field shows which day of the week it falls on right next to it, updating
  live as you change the date. Time is optional — leave it blank for an
  all-day item (its date badge just won't show a time), or set one for
  anything at a specific hour. Both kinds are fully actionable — check off,
  edit, or delete either one directly. This choice is available anywhere a
  dated item is created or edited: Clarify's "Schedule/Tickler" option, the
  Calendar page's "Add dated item" button, and when editing an existing
  item. Also exportable to Markdown.
  Optionally syncs one-way to your real **Google Calendar** — see *Google
  Calendar sync*, below.
- **Reference** — a searchable, categorized filing system for
  non-actionable material you want to keep (see *References*, below).
  Marking an inbox item as Reference during Clarify immediately opens the
  editor so you can name its category; also exportable to Markdown.
  Categories are collapsible — click a category heading to fold it away,
  handy once you've filed a lot of material.
- **Weekly Review** — the full classic GTD weekly review checklist (Get
  Clear / Get Current / Get Creative), with history tracking.

**Horizons of Focus** — condensed into a single tab with each altitude
level as an expandable section, so you can see the whole picture at once:
- **Purpose & Principles** (40,000 ft)
- **Vision** (30,000 ft)
- **Goals** (20,000 ft)
- **Areas of Focus & Accountability** (10,000 ft)
- *(Projects and Next Actions above serve as the Runway and Ground level.)*

**Backup**
- Automatic, debounced backup to Google Drive (via your own free OAuth
  client — see `SETUP.md`) using the narrow `drive.file` scope, so the app
  can only ever touch files it created.
- Manual "Back up now" / "Restore latest backup" in Settings.
- A local export/import `.json` file as a second safety net, independent
  of Drive.

**Google Calendar sync**
- One-way: Scheduled events and Ticklers you create in Calendar & Tickler
  are automatically pushed to (and kept up to date on, and removed from) a
  real Google Calendar of your choice. Nothing is ever pulled back into the
  app — the app stays the single source of truth, so there's nothing to
  reconcile or conflict. Items with a time sync as normal timed events;
  items left without a time sync as proper all-day events on your calendar.
- Independent of Google Drive backup: its own "Connect Google Calendar"
  button in Settings, its own OAuth scope and consent, its own connect/
  disconnect state — you can use either, both, or neither.
- Manual "Sync now" in Settings pushes everything again (useful right after
  connecting, so items created before you signed in also land on your
  calendar).
- Both connections survive a page reload — **and fully closing and
  reopening the app** — with **zero re-prompting and zero network round
  trip**, as long as your last sign-in hasn't actually expired (~1 hour):
  the live access token is cached in the browser's `localStorage` the
  moment you connect, so reopening the app restores the connection
  instantly, without depending on Google's own silent-refresh mechanism at
  all. Once that cached token does expire, they fall back to Google's
  FedCM-based silent refresh, initialize one after another instead of
  racing each other, never hang indefinitely on a failed silent attempt,
  and proactively refresh the access token a few minutes ahead of expiry
  while the app is open. That proactive refresh now runs both on a timer
  *and* immediately whenever you bring the app back to the foreground —
  covering the case where the timer itself got frozen or throttled by the
  OS/browser while the app sat in the background, which is common on
  mobile. And if you do end up needing to tap "Connect" again after the
  cached token has lapsed, it quietly tries the same silent reconnect
  first and only falls back to the full Google consent screen if that
  doesn't work — so most reconnects are a single instant tap, not a full
  re-sign-in.
  \
  \
  All of that said: a fully invisible, indefinitely-lived connection isn't
  possible for a backend-less app like this one. Google only issues
  long-lived refresh tokens to apps with a server to hold them securely;
  without one, every access token is short-lived (~1 hour) by design, and
  silently renewing it depends on your browser still having an active
  Google session it's willing to share with this site (via FedCM or the
  older third-party-cookie iframe approach). Chromium-based browsers
  (Chrome, Edge, etc.) generally do this well. **Safari — including every
  browser on iOS, since Apple requires them all to use WebKit — doesn't
  implement FedCM at all**, and blocks third-party cookies by default, so
  silent renewal is far less reliable there; if you're seeing the Google
  consent screen often, an iOS/Safari browser is the most likely reason,
  and there's no code-side fix for that without adding a backend to hold a
  real refresh token — a bigger change than this app currently makes. On
  browsers where silent renewal does work, you should now see it happen
  invisibly far more often than before.

**PWA essentials**
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
│   ├── gcal.js                Google Calendar sync (Calendar & Tickler)
│   ├── config.js              ← put your Google Client ID here
│   ├── seed.js                 Default contexts / first-run data
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
