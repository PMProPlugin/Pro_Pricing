// /api/save.js
// Save entire app data to GitHub Gist
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

async function saveGistJSON(data){
  const body = {
    files: {
      [FILE_NAME]: { content: JSON.stringify(data, null, 2) }
    }
  };
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>'');
    throw new Error(`GitHub Gist save failed: ${r.status} ${t}`);
  }
  return true;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!GIST_ID || !GITHUB_TOKEN) return res.status(500).json({ error: 'Missing GIST_ID or GITHUB_TOKEN' });
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid payload' });

    const normalized = normalize(data);
    await saveGistJSON(normalized);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
