/* GET /api/settings — board wording, promo lines, timing (public)
   PUT /api/settings — save them (admin only)                        */
import { getSettings, saveSettings, hasDatabase } from './_lib/db.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!hasDatabase()) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'No database configured', fallback: true });
    }
    try {
      const data = await getSettings();
      if (!data) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'Settings not seeded yet', fallback: true });
      }
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
      return res.status(200).json(data);
    } catch (err) {
      console.error('GET /api/settings', err);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: 'Could not read settings', fallback: true });
    }
  }

  if (req.method === 'PUT') {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireAuth(req, res)) { return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Expected a settings object.' });
    }
    if (!hasDatabase()) {
      return res.status(503).json({ error: 'No database configured. Add the Neon integration.' });
    }
    try {
      await saveSettings(body);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('PUT /api/settings', err);
      return res.status(500).json({ error: 'Could not save settings: ' + err.message });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  res.status(405).json({ error: 'Method not allowed' });
}
