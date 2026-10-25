// Encrypted vault for Micro Cards.
//
// The server never sees a key or any readable content. A record body is a
// ciphertext produced in the browser (AES-GCM 256), and the vault id is a hash
// of the sync code, so this Worker cannot derive the key from it either.
//
// Stored per record: the ciphertext string and the client's updatedAt stamp.

const MAX_BODY = 24 * 1024 * 1024; // KV allows 25 MB per value
const RAW_LIMIT = 20;              // records returned by the plain GET
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const REC_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS }
});

async function listAll(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    out.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!env.VAULT) return json({ error: 'The vault storage is not bound to this deployment.' }, 500);

  const seg = [].concat(params.path || []).filter(Boolean);
  const [id, rec] = seg;
  if (!id || !ID_RE.test(id)) return json({ error: 'Bad vault id.' }, 400);
  if (rec !== undefined && !REC_RE.test(rec)) return json({ error: 'Bad record id.' }, 400);
  const prefix = id + ':';

  // ---- one record
  if (rec) {
    const key = prefix + rec;
    if (request.method === 'GET') {
      const got = await env.VAULT.getWithMetadata(key);
      if (got.value === null) return json({ error: 'No such record.' }, 404);
      return json({ record: rec, updatedAt: (got.metadata && got.metadata.u) || 0, enc: got.value });
    }
    if (request.method === 'PUT') {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json({ error: 'Record too large.' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Body must be JSON.' }, 400); }
      const enc = body && body.enc, u = Number(body && body.updatedAt) || 0;
      if (typeof enc !== 'string' || !enc) return json({ error: 'Missing enc.' }, 400);
      await env.VAULT.put(key, enc, { metadata: { u } });
      return json({ ok: true, record: rec, updatedAt: u });
    }
    if (request.method === 'DELETE') {
      await env.VAULT.delete(key);
      return json({ ok: true, record: rec });
    }
    return json({ error: 'Method not allowed.' }, 405);
  }

  // ---- whole vault
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const keys = await listAll(env.VAULT, prefix);
  const meta = keys.map(k => ({
    record: k.name.slice(prefix.length),
    updatedAt: (k.metadata && k.metadata.u) || 0
  }));

  // ?meta=1 is what the app uses to work out what changed.
  if (new URL(request.url).searchParams.get('meta') === '1') return json({ records: meta });

  // The plain GET is the "look at the raw data yourself" view: it returns what
  // is actually stored, capped so a large vault does not freeze the browser.
  const take = meta.slice(0, RAW_LIMIT);
  const records = [];
  for (const m of take) {
    records.push({ ...m, enc: await env.VAULT.get(prefix + m.record) });
  }
  return json({
    note: 'This is exactly what the server holds. "enc" is ciphertext; the server has no key and cannot read it.',
    total: meta.length,
    showing: records.length,
    records
  });
}
