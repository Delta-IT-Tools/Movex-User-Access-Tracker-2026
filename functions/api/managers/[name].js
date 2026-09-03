// PATCH /api/managers/:name  -> body is a partial update, e.g. { "sent": true, "sentDate": "2026-09-03" }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rowToManager(row) {
  return {
    name: row.name,
    sent: !!row.sent,
    sentDate: row.sent_date,
    received: !!row.received,
    receivedDate: row.received_date,
    auditors: !!row.auditors,
    auditorsDate: row.auditors_date,
    reviewRequired: !!row.review_required,
  };
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

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const name = decodeURIComponent(params.name);
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
