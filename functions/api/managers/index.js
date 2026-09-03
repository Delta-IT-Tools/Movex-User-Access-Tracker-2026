// GET  /api/managers        -> { "Name": { sent, sentDate, ... }, ... }
// POST /api/managers        -> body { name }, creates a new manager row

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

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT name, sent, sent_date, received, received_date, auditors, auditors_date, review_required FROM managers ORDER BY created_at ASC, rowid ASC"
  ).all();

  const managers = {};
  for (const row of results) {
    managers[row.name] = rowToManager(row);
  }
  return json(managers);
}

export async function onRequestPost(context) {
  const { request, env } = context;
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
