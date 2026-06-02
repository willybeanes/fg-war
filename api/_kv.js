// Thin wrapper around Vercel KV's REST API (Upstash Redis).
// Works without npm packages — uses fetch against the REST endpoint directly.
// Falls back to a no-op if KV env vars aren't set (e.g. local dev).

const KV_URL   = () => process.env.KV_REST_API_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN;

export async function kvGet(key) {
  const url = KV_URL(), token = KV_TOKEN();
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result } = await r.json();
    return result != null ? JSON.parse(result) : null;
  } catch { return null; }
}

export async function kvSet(key, value, ttlSeconds) {
  const url = KV_URL(), token = KV_TOKEN();
  if (!url || !token) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]),
    });
  } catch { /* non-fatal */ }
}
