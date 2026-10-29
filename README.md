# Movex User Access Trackers

A landing page for all Movex User Access Tracker instances. Pick a **year**, then an **audit** (PwC, BDO, …), and it opens that year's tracker.

Static HTML only, served by a Cloudflare Worker using static assets. No database, no secrets.

## Project layout

```
public/index.html   The landing page (all HTML, CSS and JS in one file)
wrangler.toml       Cloudflare Worker config
package.json        Wrangler scripts
```

## Adding a tracker

Open `public/index.html` and edit the `TRACKERS` list near the bottom:

```js
const TRACKERS = [
  {
    year: 2026,
    audits: [
      { name: "PwC", url: "https://movex-users.delta-it-tools.workers.dev/" },
      { name: "BDO", url: null }            // null = "Tracker not set up yet"
    ]
  },
  {
    year: 2027,
    audits: [
      { name: "PwC", url: "https://..." },
      { name: "BDO", url: "https://..." }
    ]
  }
];
```

- New years show up automatically, newest first.
- Set `url` to `null` for a tracker that isn't deployed yet; the card shows but isn't clickable.
- Each year can be linked directly, e.g. `https://<your-worker>/#y2026`.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npx wrangler login     # first time only
npm run deploy
```

This publishes to `https://movex-access-trackers.<your-subdomain>.workers.dev`. To change that name, edit `name` in `wrangler.toml`.

You can also connect this repo in the Cloudflare dashboard (Workers & Pages → Create → Import a repository) so every push to `main` deploys automatically.
