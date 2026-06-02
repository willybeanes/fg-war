const BASE = 'https://www.fangraphs.com/api/leaders/major-league/data';

export default async function handler(req, res) {
  const qs = new URLSearchParams(req.query);

  const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
  if (!SCRAPER_KEY) return res.status(500).json({ error: 'SCRAPER_API_KEY not configured' });

  const fgUrl = `${BASE}?${qs}`;
  const scraperUrl = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(fgUrl)}`;

  let r;
  try {
    r = await fetch(scraperUrl);
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

  return res.status(r.ok ? 200 : r.status).json(body);
}
