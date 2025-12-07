// /api/health.js
// Basic diagnostics for environment and Gist access
const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const FILE_NAME = process.env.GIST_FILE || 'proplugin_data.json';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

async function fetchGistJSON(){
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!r.ok) return null;
  const gist = await r.json();
  return gist;
}

export default async function handler(req, res) {
  const out = {
    env: {
      GIST_ID: !!GIST_ID,
      GITHUB_TOKEN: !!GITHUB_TOKEN,
      GIST_FILE: FILE_NAME,
      RESEND_API_KEY: RESEND_API_KEY ? 'set' : 'missing',
    },
    gist_ok: false,
  };
  try {
    if (!GIST_ID || !GITHUB_TOKEN) throw new Error('Missing ENV');
    const raw = await fetchGistJSON();
    out.gist_ok = !!raw;
  } catch (e) {
    out.gist_ok = false;
  }
  return res.status(200).json(out);
}
