/* Single-admin session auth for the board's admin panel.

   One shop owner, one password — so this is a password in an env var plus an
   HMAC-signed session cookie, not a user-accounts system. If you ever need
   several staff logins with their own identities, swap this for Clerk.

   ADMIN_PASSWORD  the password typed into the admin panel
   SESSION_SECRET  32+ random bytes used to sign session cookies
*/
import crypto from 'node:crypto';

const COOKIE = 'ss_board_session';
const TTL_MS = 12 * 60 * 60 * 1000;         // a 12-hour working day

export function isConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short (use 32+ random bytes).');
  }
  return s;
}

/* Compare digests, not the raw strings, so length never leaks and the
   comparison stays constant-time. */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(candidate) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) { return false; }
  return sameSecret(candidate ?? '', real);
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function makeToken() {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') { return false; }
  const dot = token.indexOf('.');
  if (dot < 1) { return false; }

  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) { return false; }

  const expected = sign(exp);
  if (mac.length !== expected.length) { return false; }
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

function readCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) { return null; }
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}

export function isAuthed(req) {
  try { return verifyToken(readCookie(req, COOKIE)); } catch { return false; }
}

export function setSessionCookie(res, token) {
  const bits = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(TTL_MS / 1000)}`
  ];
  if (process.env.VERCEL) { bits.push('Secure'); }   // localhost dev is http
  res.setHeader('Set-Cookie', bits.join('; '));
}

export function clearSessionCookie(res) {
  const bits = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.VERCEL) { bits.push('Secure'); }
  res.setHeader('Set-Cookie', bits.join('; '));
}

/* Guard for every writing endpoint. Returns true when the request may proceed. */
export function requireAuth(req, res) {
  if (!isConfigured()) {
    res.status(503).json({ error: 'Admin is not configured yet. Set ADMIN_PASSWORD and SESSION_SECRET.' });
    return false;
  }
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not signed in.' });
    return false;
  }
  return true;
}

/* --- crude brute-force brake -------------------------------------------
   Fluid Compute reuses instances, so an in-memory counter does slow down a
   sustained attack, but it is per-instance and resets on cold start. The real
   protection is a long random ADMIN_PASSWORD. */
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;

export function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) { return false; }
  if (Date.now() - rec.first > WINDOW_MS) { attempts.delete(ip); return false; }
  return rec.n >= MAX_TRIES;
}

export function noteFailure(ip) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(ip, { n: 1, first: Date.now() });
  } else {
    rec.n++;
  }
}

export function clearAttempts(ip) { attempts.delete(ip); }

export function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  return (Array.isArray(f) ? f[0] : (f || '')).split(',')[0].trim()
      || req.socket?.remoteAddress || 'unknown';
}
