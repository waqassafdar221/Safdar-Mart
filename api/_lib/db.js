/* Neon Postgres access for the board.
   Lazily created so importing this file never throws at build time, before
   the Marketplace integration has injected DATABASE_URL. */
import { neon } from '@neondatabase/serverless';

let _sql = null;
let _ready = null;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — add the Neon integration to this project.');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

/* Create the tables on first use. Cheap enough to run per cold start and it
   keeps the project free of a migration toolchain for two small tables. */
export function ready() {
  if (!_ready) {
    const q = sql();
    _ready = (async () => {
      await q`
        CREATE TABLE IF NOT EXISTS products (
          id               BIGSERIAL PRIMARY KEY,
          position         INTEGER     NOT NULL DEFAULT 0,
          name             TEXT        NOT NULL,
          size             TEXT,
          category         TEXT,
          image            TEXT,
          old_price        NUMERIC(12,2),
          new_price        NUMERIC(12,2) NOT NULL,
          discount_percent INTEGER,
          currency         TEXT        NOT NULL DEFAULT 'Rs.',
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await q`CREATE INDEX IF NOT EXISTS products_position_idx ON products (position)`;
      await q`
        CREATE TABLE IF NOT EXISTS settings (
          id         INTEGER PRIMARY KEY DEFAULT 1,
          data       JSONB       NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT settings_single_row CHECK (id = 1)
        )`;
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/* DB row -> the shape products.json and the board already use */
function toProduct(r) {
  const p = {
    name: r.name,
    newPrice: Number(r.new_price),
    currency: r.currency || 'Rs.'
  };
  if (r.size) p.size = r.size;
  if (r.category) p.category = r.category;
  if (r.image) p.image = r.image;
  if (r.old_price !== null && r.old_price !== undefined) p.oldPrice = Number(r.old_price);
  if (r.discount_percent !== null && r.discount_percent !== undefined) {
    p.discountPercent = Number(r.discount_percent);
  }
  return p;
}

export async function listProducts() {
  await ready();
  const rows = await sql()`
    SELECT * FROM products ORDER BY position ASC, id ASC`;
  return rows.map(toProduct);
}

/* The admin always sends the whole ordered list, so replace it in one
   transaction — that keeps `position` consistent with no reordering dance. */
export async function replaceProducts(items) {
  await ready();
  const q = sql();
  const rows = items.map((p, i) => ({
    position: i,
    name: String(p.name || '').slice(0, 200),
    size: p.size ? String(p.size).slice(0, 60) : null,
    category: p.category ? String(p.category).slice(0, 80) : null,
    image: p.image ? String(p.image).slice(0, 600) : null,
    old_price: num(p.oldPrice),
    new_price: num(p.newPrice),
    discount_percent: p.discountPercent == null ? null : Math.round(Number(p.discountPercent)),
    currency: p.currency ? String(p.currency).slice(0, 12) : 'Rs.'
  }));

  await q.transaction([
    q`DELETE FROM products`,
    ...rows.map((r) => q`
      INSERT INTO products
        (position, name, size, category, image, old_price, new_price, discount_percent, currency)
      VALUES
        (${r.position}, ${r.name}, ${r.size}, ${r.category}, ${r.image},
         ${r.old_price}, ${r.new_price}, ${r.discount_percent}, ${r.currency})`)
  ]);

  return rows.length;
}

export async function getSettings() {
  await ready();
  const rows = await sql()`SELECT data FROM settings WHERE id = 1`;
  return rows.length ? rows[0].data : null;
}

export async function saveSettings(data) {
  await ready();
  await sql()`
    INSERT INTO settings (id, data, updated_at) VALUES (1, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}
