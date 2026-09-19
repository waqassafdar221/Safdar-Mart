/* POST /api/login  { password } — start an admin session. */
import {
  checkPassword, makeToken, setSessionCookie, isConfigured,
  tooManyAttempts, noteFailure, clearAttempts, clientIp
} from './_lib/auth.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Admin is not configured. Set ADMIN_PASSWORD and SESSION_SECRET on the project.'
    });
  }

  const ip = clientIp(req);
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait ten minutes and try again.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  await sleep(400);                                  // blunt the guessing rate

  if (!checkPassword(body.password)) {
    noteFailure(ip);
    return res.status(401).json({ error: 'Wrong password.' });
  }

  clearAttempts(ip);
  setSessionCookie(res, makeToken());
  res.status(200).json({ ok: true });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
