/* POST /api/upload  { filename, dataUrl, replace? } — store a product photo.

   The admin panel already squares and compresses the image in the browser, so
   what arrives here is a small JPEG (tens of KB) carried as a data URL. That
   keeps the request plain JSON and avoids multipart parsing entirely. */
import { put, del } from '@vercel/blob';
import { requireAuth } from './_lib/auth.js';

const MAX_BYTES = 6 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAuth(req, res)) { return; }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'No image store configured. Create a Blob store for this project.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body.dataUrl !== 'string') {
    return res.status(400).json({ error: 'Expected { filename, dataUrl }.' });
  }

  const m = /^data:([^;,]+);base64,(.+)$/s.exec(body.dataUrl);
  if (!m) { return res.status(400).json({ error: 'dataUrl must be a base64 data URL.' }); }

  const ext = TYPES[m[1]];
  if (!ext) { return res.status(400).json({ error: 'Only JPEG, PNG or WebP images are allowed.' }); }

  let bytes;
  try { bytes = Buffer.from(m[2], 'base64'); }
  catch { return res.status(400).json({ error: 'Could not decode the image.' }); }
  if (!bytes.length) { return res.status(400).json({ error: 'The image is empty.' }); }
  if (bytes.length > MAX_BYTES) {
    return res.status(413).json({ error: 'That image is too large (limit 6 MB).' });
  }

  const slug = String(body.filename || 'product')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product';

  try {
    const blob = await put(`products/${slug}.${ext}`, bytes, {
      access: 'public',
      contentType: m[1],
      addRandomSuffix: true,          // a fresh URL per upload, so no stale CDN copy
      cacheControlMaxAge: 31536000
    });

    /* Best-effort cleanup of the photo this one replaces. */
    if (body.replace && /^https?:\/\/[^/]*\.blob\.vercel-storage\.com\//.test(body.replace)) {
      del(body.replace).catch((e) => console.warn('blob cleanup failed', e.message));
    }

    res.status(200).json({ url: blob.url, size: bytes.length });
  } catch (err) {
    console.error('POST /api/upload', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
