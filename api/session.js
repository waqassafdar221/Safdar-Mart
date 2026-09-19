/* GET /api/session — does the browser hold a valid admin session? */
import { isAuthed, isConfigured } from './_lib/auth.js';
import { hasDatabase } from './_lib/db.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.status(200).json({
    api: true,
    configured: isConfigured(),
    database: hasDatabase(),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    authed: isAuthed(req)
  });
}
