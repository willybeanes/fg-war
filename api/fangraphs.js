const BASE      = 'https://www.fangraphs.com/api/leaders/major-league/data';
const CACHE_TTL = 12 * 3600; // 12 hours

// ── Vercel KV helpers (REST API, no npm deps) ────────────────────────────────
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result } = await r.json();
    return result != null ? JSON.parse(result) : null;
  } catch { return null; }
}

async function kvSet(key, value, ttl) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ttl]),
    });
  } catch { /* non-fatal */ }
}
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const qs = new URLSearchParams(req.query);

  // Normalise cache key
  const sorted = new URLSearchParams([...qs.entries()].sort());
  const cacheKey = `fg:${sorted.toString()}`;

  // 1. Try cache
  const cached = await kvGet(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  // 2. Fetch via Scrape.do
  const SCRAPE_KEY = process.env.SCRAPE_DO_KEY;
  if (!SCRAPE_KEY) return res.status(500).json({ error: 'SCRAPE_DO_KEY not configured' });
  const fgUrl    = `${BASE}?${qs}`;
  const proxyUrl = `https://api.scrape.do?token=${SCRAPE_KEY}&url=${encodeURIComponent(fgUrl)}`;

  let r;
  try {
    r = await fetch(proxyUrl);
  } catch (err) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: String(err) });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let body;
  try {
    body = await r.json();
  } catch {
    return res.status(502).json({ error: 'upstream returned non-JSON', status: r.status });
  }

  if (r.ok) kvSet(cacheKey, body, CACHE_TTL);

  res.setHeader('X-Cache', 'MISS');
  return res.status(r.ok ? 200 : r.status).json(body);
}
