// /api/otp.js
// Request & verify OTP; reset password using Resend for email delivery
import { Resend } from 'resend';

const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const FILE_NAME = process.env.GIST_FILE || 'proplugin_data.json';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'ProPricing <noreply@proplugin.com>';

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
  if (!file) return normalize({});
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

async function saveGistJSON(data){
  const body = {
    files: { [FILE_NAME]: { content: JSON.stringify(data, null, 2) } }
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

function sha256Hex(str){
  // Node 18+ crypto via global web crypto
  const enc = new TextEncoder();
  const data = enc.encode(str);
  return globalThis.crypto.subtle.digest('SHA-256', data).then(buf =>
    Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
  );
}

function nowISO(){ return new Date().toISOString(); }

function addLog(data, user, action, meta=''){
  data.logs ??= [];
  data.logs.unshift({ ts: nowISO(), user, action, meta });
  if (data.logs.length > 3000) data.logs.pop();
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!GIST_ID || !GITHUB_TOKEN) return res.status(500).json({ error: 'Missing GIST_ID or GITHUB_TOKEN' });

    const { action, email, otp, newPasswordHash } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Missing action' });

    const data = normalize(await fetchGistJSON());

    if (action === 'request') {
      if (!RESEND_API_KEY) return res.status(500).json({ error: 'Missing RESEND_API_KEY' });
      const target = String(email || '').trim().toLowerCase();
      if (!target) return res.status(400).json({ error: 'Email required' });
      const user = (data.users || []).find(u => (u.email||'').toLowerCase() === target);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const code = Math.floor(100000 + Math.random()*900000).toString();
      const codeHash = await sha256Hex(code);
      const exp = Date.now() + 10*60*1000; // 10 minutes

      data.otps[target] = { codeHash, exp };
      addLog(data, user.username || target, 'OTP_REQUEST', target);
      await saveGistJSON(data);

      const resend = new Resend(RESEND_API_KEY);
      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111">
          <h2 style="margin:0 0 8px">Your ProPricing OTP</h2>
          <p>Use this 6-digit code to reset your password. It expires in 10 minutes.</p>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</div>
          <p style="color:#666">If you didn't request this, you can ignore this email.</p>
        </div>`;
      await resend.emails.send({
        from: MAIL_FROM,
        to: [ target ],
        subject: 'Your OTP Code',
        html
      });

      return res.status(200).json({ ok: true });
    }

    if (action === 'reset') {
      const target = String(email || '').trim().toLowerCase();
      if (!target) return res.status(400).json({ error: 'Email required' });
      if (!otp) return res.status(400).json({ error: 'OTP required' });
      if (!newPasswordHash) return res.status(400).json({ error: 'newPasswordHash required' });

      const entry = data.otps?.[target];
      if (!entry) return res.status(400).json({ error: 'No OTP requested' });
      if (Date.now() > Number(entry.exp)) return res.status(400).json({ error: 'OTP expired' });

      const gotHash = await sha256Hex(String(otp));
      if (gotHash !== entry.codeHash) return res.status(400).json({ error: 'Invalid OTP' });

      const idx = (data.users||[]).findIndex(u => (u.email||'').toLowerCase() === target);
      if (idx === -1) return res.status(404).json({ error: 'User not found' });
      data.users[idx].passwordHash = newPasswordHash;

      delete data.otps[target];
      addLog(data, data.users[idx].username || target, 'PASSWORD_RESET', target);
      await saveGistJSON(data);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unsupported action' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
