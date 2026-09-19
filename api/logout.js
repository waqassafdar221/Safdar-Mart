/* POST /api/logout — end the admin session. */
import { clearSessionCookie } from './_lib/auth.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
