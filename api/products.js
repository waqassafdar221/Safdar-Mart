/* GET  /api/products  — the product list the TV board renders (public)
   PUT  /api/products  — replace the whole ordered list (admin only)      */
import { listProducts, replaceProducts, hasDatabase } from './_lib/db.js';
import { requireAuth } from './_lib/auth.js';

const MAX_PRODUCTS = 200;

export default async function handler(req, res) {
  if (req.method === 'GET') { return get(req, res); }
  if (req.method === 'PUT') { return put(req, res); }
  res.setHeader('Allow', 'GET, PUT');
  res.status(405).json({ error: 'Method not allowed' });
}

async function get(req, res) {
  if (!hasDatabase()) {
    /* No database yet — let the board fall back to the bundled products.json
       instead of showing an error screen in the shop. */
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'No database configured', fallback: true });
  }
  try {
    const products = await listProducts();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    res.status(200).json(products);
  } catch (err) {
    console.error('GET /api/products', err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: 'Could not read products', fallback: true });
  }
}

async function put(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) { return; }

  /* Validate the request before reporting on the service, so a malformed save
     gets a useful 400 rather than a misleading "no database". */
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const items = Array.isArray(body) ? body : body?.products;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Expected an array of products.' });
  }
  if (items.length > MAX_PRODUCTS) {
    return res.status(400).json({ error: `Too many products (max ${MAX_PRODUCTS}).` });
  }

  for (let i = 0; i < items.length; i++) {
    const p = items[i] || {};
    if (!p.name || !String(p.name).trim()) {
      return res.status(400).json({ error: `Product ${i + 1} has no name.` });
    }
    if (!Number.isFinite(Number(p.newPrice))) {
      return res.status(400).json({ error: `Product ${i + 1} ("${p.name}") has no valid price.` });
    }
  }

  if (!hasDatabase()) {
    return res.status(503).json({ error: 'No database configured. Add the Neon integration.' });
  }

  try {
    const n = await replaceProducts(items);
    res.status(200).json({ ok: true, count: n });
  } catch (err) {
    console.error('PUT /api/products', err);
    res.status(500).json({ error: 'Could not save products: ' + err.message });
  }
}
