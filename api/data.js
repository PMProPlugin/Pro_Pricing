// /api/data.js
// Return normalized app data from GitHub Gist
// ESM (Next.js API route style): export default async function handler(req, res)
const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const FILE_NAME = process.env.GIST_FILE || 'proplugin_data.json';

function normalize(data = {}){
  data.version ??= 5.1;
  data.users ??= [];
  data.products ??= [];
  data.templates ??= [];
  data.dealerNames ??= { t1: 'Dealer T1', t2: 'Dealer T2', t3: 'Dealer T3' };
  data.brandLogoUrls ??= {};
  data.logoUrl ??= data.logoUrl || '';
  data.logs ??= [];
  data.otps ??= {};
  return data;
}

async function fetchGistJSON(){
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>'');
    throw new Error(`GitHub Gist fetch failed: ${r.status} ${t}`);
  }
  const gist = await r.json();
  const file = gist.files?.[FILE_NAME];
  if (!file) {
    // create empty scaffold if missing
    return normalize({});
  }
  if (file.truncated && file.raw_url){
    const rawRes = await fetch(file.raw_url);
    const rawText = await rawRes.text();
    try { return JSON.parse(rawText); } catch (e) {
      throw new Error('Invalid JSON in Gist file');
    }
  }
  try { return JSON.parse(file.content || '{}'); } catch (e) {
    throw new Error('Invalid JSON in Gist file');
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!GIST_ID || !GITHUB_TOKEN) return res.status(500).json({ error: 'Missing GIST_ID or GITHUB_TOKEN' });

    const raw = await fetchGistJSON();
    const data = normalize(raw);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
