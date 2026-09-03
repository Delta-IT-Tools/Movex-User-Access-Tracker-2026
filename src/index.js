// Manager Approval Tracker — Cloudflare Worker (with static assets + D1)
//
// This is the Worker-native version of the tool: a single script handles
// routing for everything (password gate, login/logout, the JSON API, and
// falling through to static assets for the tool's HTML/CSS/JS).
//
// Secrets used (set via the Cloudflare dashboard: Settings → Variables and
// Secrets — never committed):
//   SITE_PASSWORD   — the shared password for the tool
//   SESSION_SECRET  — a random string used to sign session cookies
//
// Bindings used (see wrangler.toml):
//   DB      — D1 database
//   ASSETS  — static files in ./public (wired automatically by [assets])

const COOKIE_NAME = "mat_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/logout") {
      return handleLogout();
    }

    if (url.pathname === "/login" && request.method === "POST") {
      return handleLoginPost(request, env);
    }

    if (!(await isAuthenticated(request, env))) {
      const justFailed = url.pathname === "/login";
      return renderLoginPage(justFailed);
    }

    // Authenticated from here on.
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

// ---------- API routing ----------

async function handleApi(request, env, url) {
  const path = url.pathname;

  if (path === "/api/managers" && request.method === "GET") {
    return apiListManagers(env);
  }
  if (path === "/api/managers" && request.method === "POST") {
    return apiAddManager(request, env);
  }
  if (path === "/api/managers/replace" && request.method === "POST") {
    return apiReplaceManagers(request, env);
  }
  const patchMatch = path.match(/^\/api\/managers\/([^/]+)$/);
  if (patchMatch && request.method === "PATCH") {
    return apiPatchManager(request, env, decodeURIComponent(patchMatch[1]));
  }

  return json({ error: "Not found" }, 404);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rowToManager(row) {
  return {
    sent: !!row.sent,
    sentDate: row.sent_date,
    received: !!row.received,
    receivedDate: row.received_date,
    auditors: !!row.auditors,
    auditorsDate: row.auditors_date,
    reviewRequired: !!row.review_required,
  };
}

async function apiListManagers(env) {
  const { results } = await env.DB.prepare(
    "SELECT name, sent, sent_date, received, received_date, auditors, auditors_date, review_required FROM managers ORDER BY created_at ASC, rowid ASC"
  ).all();

  const managers = {};
  for (const row of results) {
    managers[row.name] = rowToManager(row);
  }
  return json(managers);
}

async function apiAddManager(request, env) {
  const body = await request.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return json({ error: "Missing manager name" }, 400);
  }

  try {
    await env.DB.prepare(
      "INSERT INTO managers (name, sent, sent_date, received, received_date, auditors, auditors_date, review_required) VALUES (?, 0, NULL, 0, NULL, 0, NULL, 0)"
    ).bind(name).run();
  } catch (e) {
    return json({ error: "A manager with that name already exists" }, 409);
  }

  return json({
    name,
    sent: false,
    sentDate: null,
    received: false,
    receivedDate: null,
    auditors: false,
    auditorsDate: null,
    reviewRequired: false,
  });
}

const FIELD_TO_COLUMN = {
  sent: { col: "sent", bool: true },
  sentDate: { col: "sent_date", bool: false },
  received: { col: "received", bool: true },
  receivedDate: { col: "received_date", bool: false },
  auditors: { col: "auditors", bool: true },
  auditorsDate: { col: "auditors_date", bool: false },
  reviewRequired: { col: "review_required", bool: true },
};

async function apiPatchManager(request, env, name) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sets = [];
  const values = [];
  for (const [key, meta] of Object.entries(FIELD_TO_COLUMN)) {
    if (key in body) {
      let val = body[key];
      if (meta.bool) val = val ? 1 : 0;
      sets.push(`${meta.col} = ?`);
      values.push(val);
    }
  }

  if (sets.length === 0) {
    return json({ error: "No valid fields to update" }, 400);
  }

  values.push(name);
  const result = await env.DB.prepare(
    `UPDATE managers SET ${sets.join(", ")} WHERE name = ?`
  ).bind(...values).run();

  if (!result.meta || result.meta.changes === 0) {
    return json({ error: "Manager not found" }, 404);
  }

  const row = await env.DB.prepare(
    "SELECT name, sent, sent_date, received, received_date, auditors, auditors_date, review_required FROM managers WHERE name = ?"
  ).bind(name).first();

  return json(rowToManager(row));
}

async function apiReplaceManagers(request, env) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Expected an object of managers keyed by name" }, 400);
  }

  const names = Object.keys(body);
  const statements = [env.DB.prepare("DELETE FROM managers")];

  for (const name of names) {
    const m = body[name] || {};
    statements.push(
      env.DB.prepare(
        "INSERT INTO managers (name, sent, sent_date, received, received_date, auditors, auditors_date, review_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        name,
        m.sent ? 1 : 0,
        m.sent ? m.sentDate || null : null,
        m.received ? 1 : 0,
        m.received ? m.receivedDate || null : null,
        m.auditors ? 1 : 0,
        m.auditors ? m.auditorsDate || null : null,
        m.reviewRequired ? 1 : 0
      )
    );
  }

  await env.DB.batch(statements);
  return json({ ok: true, count: names.length });
}

// ---------- Password gate ----------

async function isAuthenticated(request, env) {
  if (!env.SITE_PASSWORD || !env.SESSION_SECRET) {
    // Secrets not configured yet — fail closed (show login) rather than
    // silently letting everyone through.
    return false;
  }
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiryStr, sig] = parts;

  const expected = await hmac(env.SESSION_SECRET, expiryStr);
  if (!timingSafeEqual(sig, expected)) return false;

  const expiry = parseInt(expiryStr, 10);
  if (Number.isNaN(expiry) || Date.now() > expiry) return false;

  return true;
}

async function handleLoginPost(request, env) {
  if (!env.SITE_PASSWORD || !env.SESSION_SECRET) {
    return new Response(
      "Server is missing SITE_PASSWORD / SESSION_SECRET secrets. Set them in the Cloudflare dashboard under Settings.",
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const password = String(formData.get("password") || "").trim();
  const expectedPassword = String(env.SITE_PASSWORD || "").trim();

  if (!timingSafeEqual(password, expectedPassword)) {
    return renderLoginPage(true);
  }

  const expiry = Date.now() + SESSION_DURATION_MS;
  const sig = await hmac(env.SESSION_SECRET, String(expiry));
  const token = `${expiry}.${sig}`;

  const headers = new Headers();
  headers.set("Location", "/");
  headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(
      SESSION_DURATION_MS / 1000
    )}`
  );
  return new Response(null, { status: 302, headers });
}

function handleLogout() {
  const headers = new Headers();
  headers.set("Location", "/");
  headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  return new Response(null, { status: 302, headers });
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) {
    let dummy = 0;
    for (let i = 0; i < a.length; i++) dummy |= a.charCodeAt(i);
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function renderLoginPage(showError) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in &#8212; Manager Approval Tracker</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; height: 100%;
    background: linear-gradient(180deg, #9AC6E2 0%, #263138 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  body { display: flex; align-items: center; justify-content: center; }
  .card {
    background: #334249;
    border-radius: 16px;
    padding: 32px 28px;
    width: 100%;
    max-width: 340px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  }
  .title { color: #fff; font-size: 19px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em; }
  .subtitle { color: #a9b7c0; font-size: 13px; margin: 0 0 22px; }
  label { display: block; font-size: 11.5px; font-weight: 700; color: #b9c4cc; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 6px; }
  input[type="password"] {
    width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #4a5a63;
    background: rgba(255,255,255,0.06); color: #fff; font-size: 14px; outline: none;
    margin-bottom: 16px;
  }
  input[type="password"]::placeholder { color: #7c8a92; }
  button {
    width: 100%; padding: 11px; border-radius: 8px; border: none;
    background: #9AC6E2; color: #1e2532; font-size: 14px; font-weight: 700;
    cursor: pointer; font-family: inherit;
  }
  button:hover { filter: brightness(0.96); }
  .error {
    background: #fdeceb; border: 1px solid #f2c6c0; color: #c0392b;
    border-radius: 8px; padding: 8px 12px; font-size: 12.5px; margin-bottom: 16px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="title">Manager Approval Tracker</div>
    <div class="subtitle">Enter the password to continue</div>
    ${showError ? '<div class="error">Incorrect password &#8212; please try again.</div>' : ""}
    <form method="POST" action="/login">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;" autofocus required>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: showError ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
