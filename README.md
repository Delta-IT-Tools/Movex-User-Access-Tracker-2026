# Manager Approval Tracker

A password-protected, shared tool for tracking manager sign-offs on user
access lists — who's been sent their list, who's responded, and who's been
reported to auditors — plus JSON export/import and an email-ready summary
generator.

Data is stored in a Cloudflare D1 database (SQLite), so everyone who has
the password sees and edits the same live data, from any device.

## How it fits together

- `public/index.html` — the tool itself. All UI logic lives here; it talks
  to the API below instead of storing anything locally.
- `functions/_middleware.js` — password gate. Runs in front of every
  request (including API calls) and requires a valid signed session
  cookie, or shows a login page.
- `functions/api/managers/index.js` — `GET` lists all managers, `POST`
  adds a new one.
- `functions/api/managers/[name].js` — `PATCH` updates one manager's
  fields (used every time someone clicks a status button or edits a date).
- `functions/api/managers/replace.js` — `POST` wipes and reloads the whole
  table (used by the "Import JSON" button).
- `schema.sql` / `seed.sql` — the database table definition and optional
  starter data.

The tool polls the server every 20 seconds and also refreshes when the
browser tab regains focus, so people generally see each other's updates
without needing to manually reload. It's not truly real-time (no
WebSockets) — if two people click the same button at the exact same
moment, the last write wins.

## How the password protection works

- Every request passes through `functions/_middleware.js` first.
- Valid session cookie → let through. Otherwise → show login page.
- The check happens server-side, so it can't be bypassed by viewing page
  source.
- The password itself is never stored in this repo — it's a Cloudflare
  secret (step 6 below).

This is one shared password for anyone who has it — no individual user
accounts, no audit trail of who did what. Reasonable for a small internal
tool among trusted people.

## One-time setup

You'll need a Cloudflare account (free tier is fine) and Node.js installed.

### 1. Install dependencies

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the D1 database

```bash
npx wrangler d1 create manager-approval-tracker-db
```

This prints a `database_id`. Copy it into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_DATABASE_ID`.

### 4. Create the table (and optionally seed it)

```bash
npx wrangler d1 execute manager-approval-tracker-db --remote --file=./schema.sql
```

If you want to start with the original nine managers already marked as
sent today, also run:

```bash
npx wrangler d1 execute manager-approval-tracker-db --remote --file=./seed.sql
```

Skip `seed.sql` if you'd rather start with an empty tracker and add people
yourself using the "Add a manager" box in the tool.

### 5. Create the Pages project

```bash
npx wrangler pages project create manager-approval-tracker
```

Accept the defaults (production branch `main` is fine).

### 6. Set your password and session secret

```bash
npx wrangler pages secret put SITE_PASSWORD
```
Type the password you want to use to access the tool.

```bash
npx wrangler pages secret put SESSION_SECRET
```
Paste in any long random string (signs session cookies). Generate one with:
```bash
openssl rand -base64 32
```

### 7. Deploy

```bash
npm run deploy
```

Wrangler prints the `*.pages.dev` URL your site is live at.

## Using it day to day

- Visit the site, enter the password once — you'll stay signed in for 30
  days per browser.
- Mark managers as sent / responded / sent-to-auditors, each with an
  editable date; flag anyone for review; export or import the full dataset
  as JSON; generate a copy-paste-ready email summary.
- Since data lives in the shared D1 database, anyone with the password and
  the URL sees the same live tracker — no separate copies per device.
- Click "Log out" at the bottom to end your session early.

## Making future changes

Share the current files with Claude (or point it at your repo), describe
the change, then redeploy:

```bash
npm run deploy
```

If a change adds new fields to a manager, you'll also need a small
migration against the `managers` table (Claude can write that SQL for you)
— run it the same way as `schema.sql`:

```bash
npx wrangler d1 execute manager-approval-tracker-db --remote --file=./your-migration.sql
```

## Changing the password later

```bash
npx wrangler pages secret put SITE_PASSWORD
```
No redeploy needed. To invalidate everyone's existing sessions at once,
also rotate `SESSION_SECRET` the same way.

## Backing up your data

The database is the source of truth. To pull a full backup at any time:

```bash
npx wrangler d1 export manager-approval-tracker-db --remote --output=backup.sql
```

Or use the "Export JSON" button in the tool itself for a lighter-weight,
human-readable snapshot.
