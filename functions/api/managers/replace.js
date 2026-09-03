// POST /api/managers/replace  -> body is { "Name": { sent, sentDate, ... }, ... }
// Wipes the table and reinserts everything from the given object.
// Used by the tool's "Import JSON" feature.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
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
