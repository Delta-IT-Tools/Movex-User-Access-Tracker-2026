# Manager Approval Tracker

A password-protected, single-page tool for tracking manager sign-offs on
user access lists — who's been sent their list, who's responded, and who's
been reported to auditors — plus JSON export/import and an email-ready
summary generator.

## How the password protection works

Every request to the site passes through a Cloudflare Pages Function
(`functions/_middleware.js`) before anything is served:

- If you have a valid signed session cookie, you're let through.
- Otherwise, you see a login page. Enter the correct password and you're
  redirected back in, with a cookie that keeps you signed in for 30 days.
- The check happens **server-side**, so it can't be bypassed by viewing
  page source — unlike a password baked into client-side JavaScript.
- The actual password is never stored in this repo. It's set as a
  Cloudflare secret (step 4 below), which only you can see or change.

This is intentionally simple: one shared password for anyone who has it,
no individual user accounts, no audit trail of who signed in. That's a
reasonable fit for a small internal tool where everyone with the password
is trusted. If you ever need per-person logins, that's a bigger step up
(e.g. Cloudflare Access, or a proper auth provider).

## One-time setup

You'll need a Cloudflare account (the free tier is fine) and Node.js
installed locally.

### 1. Install dependencies

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window to authorize Wrangler (Cloudflare's CLI)
against your account.

### 3. Create the Pages project

```bash
npx wrangler pages project create manager-approval-tracker
```

Accept the defaults when prompted (production branch `main` is fine).

### 4. Set your password and session secret

These are stored securely by Cloudflare, not in this repo:

```bash
npx wrangler pages secret put SITE_PASSWORD
```
When prompted, type the password you want to use to access the tool.

```bash
npx wrangler pages secret put SESSION_SECRET
```
When prompted, paste in any long random string (this signs your session
cookies — it doesn't need to be memorable). For example, you can generate
one with:
```bash
openssl rand -base64 32
```

### 5. Deploy

```bash
npm run deploy
```

Wrangler will print the `*.pages.dev` URL your site is live at. Visiting
it will prompt for the password; after that, you're signed in for 30 days
(per browser).

## Using it day to day

- Visit your site's URL, enter the password once.
- All the tracker features work as before: mark managers as sent/responded/
  sent-to-auditors with dates, flag someone for review, export/import JSON,
  and generate an email-ready summary.
- Data is stored in your browser via the artifact storage API tied to this
  page, per person — it does not sync between different browsers/devices
  automatically. Use Export/Import if you need to move data between them.
- Click "Log out" at the bottom of the tool to clear your session early.

## Making future changes

If you want Claude to help you update the tool later:
1. Share the current `public/index.html` (or ask Claude to look at your
   repo) and describe the change.
2. Replace `public/index.html` with the updated version Claude gives you.
3. Redeploy:
   ```bash
   npm run deploy
   ```

The password gate in `functions/_middleware.js` shouldn't need to change
unless you want to adjust session length or add features like changing
the password without redeploying.

## Changing the password later

Just re-run:
```bash
npx wrangler pages secret put SITE_PASSWORD
```
and enter the new one. No redeploy needed — it takes effect immediately.
Existing signed-in sessions stay valid until their cookie expires (30 days)
or you rotate `SESSION_SECRET` too, which invalidates all sessions at once.
