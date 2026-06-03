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

  const COOKIE      = process.env.FANGRAPHS_COOKIE;
  const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
  const fgUrl       = `${BASE}?${qs}`;

  async function fetchDirect() {
    return fetch(fgUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.fangraphs.com/',
        ...(COOKIE ? { 'Cookie': COOKIE } : {}),
      },
    });
  }

  async function fetchViaScraperAPI() {
    if (!SCRAPER_KEY) throw new Error('No SCRAPER_API_KEY configured');
    return fetch(`https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(fgUrl)}`);
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let r;
  try {
    if (COOKIE) {
      r = await fetchDirect();
      if (r.status === 403 && SCRAPER_KEY) {
        console.warn('FanGraphs cookie returned 403 — falling back to ScraperAPI');
        r = await fetchViaScraperAPI();
      }
    } else if (SCRAPER_KEY) {
      r = await fetchViaScraperAPI();
    } else {
      return res.status(500).json({ error: 'No FANGRAPHS_COOKIE or SCRAPER_API_KEY configured' });
    }
  } catch (err) {
    return res.status(502).json({ error: 'upstream fetch failed', detail: String(err) });
  }

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
