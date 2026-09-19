#!/usr/bin/env node
/* Seed the database from the local products.json / settings.json.
 *
 * Run once, after the Neon integration is attached and env vars are pulled:
 *
 *     vercel env pull .env.local
 *     npm run seed
 *
 * Options:
 *   --images   also upload images/ to Vercel Blob and rewrite the paths
 *              (otherwise the bundled images/ files keep being used)
 *   --force    overwrite an already-populated products table
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const WANT_IMAGES = argv.includes('--images');
const FORCE = argv.includes('--force');

/* --- load .env.local without pulling in a dependency --------------------- */
function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { return 0; }
  let n = 0;
  for (let line of fs.readFileSync(p, 'utf8').split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) { continue; }
    const eq = line.indexOf('=');
    if (eq < 1) { continue; }
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) { process.env[k] = v; n++; }
  }
  return n;
}
loadEnv('.env.local') || loadEnv('.env');

const die = (msg) => { console.error('\n✗ ' + msg + '\n'); process.exit(1); };

if (!process.env.DATABASE_URL) {
  die('DATABASE_URL is not set.\n' +
      '  Attach Neon to the project, then:  vercel env pull .env.local');
}
if (WANT_IMAGES && !process.env.BLOB_READ_WRITE_TOKEN) {
  die('BLOB_READ_WRITE_TOKEN is not set, so --images cannot upload.\n' +
      '  Create a Blob store for the project, then:  vercel env pull .env.local');
}

const { listProducts, replaceProducts, saveSettings, getSettings } =
  await import('../api/_lib/db.js');

const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const products = readJSON('products.json');
const settings = readJSON('settings.json');
console.log(`Read ${products.length} products and settings.json`);

/* --- refuse to clobber existing data unless asked ------------------------ */
const existing = await listProducts().catch(() => []);
if (existing.length && !FORCE) {
  die(`The database already holds ${existing.length} products.\n` +
      '  Re-run with --force to replace them.');
}

/* --- optionally move the product photos into Blob ------------------------ */
if (WANT_IMAGES) {
  const { put } = await import('@vercel/blob');
  const TYPE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  let done = 0;

  for (const p of products) {
    if (!p.image || /^https?:\/\//.test(p.image)) { continue; }
    const local = path.join(ROOT, p.image);
    if (!fs.existsSync(local)) {
      console.warn(`  ! missing ${p.image} — leaving the path as it is`);
      continue;
    }
    const ext = path.extname(local).toLowerCase();
    const blob = await put(`products/${path.basename(local, ext)}${ext}`,
                           fs.readFileSync(local), {
      access: 'public',
      contentType: TYPE[ext] || 'application/octet-stream',
      addRandomSuffix: true,
      cacheControlMaxAge: 31536000
    });
    p.image = blob.url;
    done++;
    process.stdout.write(`\r  uploaded ${done} image${done === 1 ? '' : 's'}…`);
  }
  console.log(`\r  uploaded ${done} images to Blob        `);
} else {
  console.log('Keeping the bundled images/ paths (pass --images to move them to Blob)');
}

/* --- write --------------------------------------------------------------- */
const count = await replaceProducts(products);
console.log(`Wrote ${count} products to the database`);

if (!(await getSettings()) || FORCE) {
  await saveSettings(settings);
  console.log('Wrote settings');
} else {
  console.log('Settings already present — left alone (use --force to replace)');
}

console.log('\n✓ Seed complete. Reload the board and the admin panel.\n');
process.exit(0);
