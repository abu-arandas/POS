/**
 * Supabase Seeder Script
 * Seeds all initial data (run scripts/schema.sql in the SQL editor first).
 * Run with: node scripts/seed.mjs
 *
 * Requires SUPABASE_URL and a key, provided via environment variables or a
 * local .env file (see .env.example). The recommended schema enables Row
 * Level Security with authenticated-only policies, so the public anon key
 * CANNOT insert rows — use SUPABASE_SERVICE_ROLE_KEY (server-side only,
 * never ship it in the app). SUPABASE_ANON_KEY works only if you disabled
 * RLS for a throwaway demo. Credentials must never be committed.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

// The app authenticates by comparing SHA-256(entered PIN) against the stored
// value (see src/lib/hash.ts), so seeded PINs must be stored as hashes too —
// storing them in plaintext makes the account impossible to log into.
const hashPin = (pin) => createHash('sha256').update(pin).digest('hex');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '❌ Missing SUPABASE_URL or a key. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) in a .env file (see .env.example) or export them before running.',
  );
  process.exit(1);
}

// ─── Inline Seed Data ────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'cat-bev', name: 'Beverages', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'cat-bak', name: 'Bakery',    color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'cat-snd', name: 'Sandwiches',color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'cat-snk', name: 'Snacks',    color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

// Self-contained SVG thumbnails (category gradient + emoji) so seeded products
// render offline with no external image host — mirrors src/data/seedData.ts.
const CATEGORY_GRADIENT = {
  'cat-bev': ['#38bdf8', '#2563eb'],
  'cat-bak': ['#fbbf24', '#d97706'],
  'cat-snd': ['#34d399', '#059669'],
  'cat-snk': ['#a78bfa', '#7c3aed'],
};
const productThumb = (category, emoji) => {
  const [from, to] = CATEGORY_GRADIENT[category] || ['#94a3b8', '#475569'];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="400" height="400" fill="url(#g)"/>` +
    `<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-size="210">${emoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const PRODUCTS = [
  { id: 'prod-espresso',   name: 'Classic Espresso',       price: 3.25, cost: 0.65, category: 'cat-bev', sku: 'BEV-ESP-01', stock: 120, min_stock: 20, image: productThumb('cat-bev', '☕') },
  { id: 'prod-latte',      name: 'Caffe Latte',             price: 4.50, cost: 0.90, category: 'cat-bev', sku: 'BEV-LAT-02', stock: 95,  min_stock: 15, image: productThumb('cat-bev', '🥛') },
  { id: 'prod-greentea',   name: 'Organic Matcha Tea',      price: 4.00, cost: 0.80, category: 'cat-bev', sku: 'BEV-MAT-03', stock: 6,   min_stock: 10, image: productThumb('cat-bev', '🍵') },
  { id: 'prod-croissant',  name: 'Butter Croissant',        price: 3.75, cost: 1.10, category: 'cat-bak', sku: 'BAK-CRO-01', stock: 45,  min_stock: 10, image: productThumb('cat-bak', '🥐') },
  { id: 'prod-muffin',     name: 'Blueberry Muffin',        price: 3.50, cost: 0.95, category: 'cat-bak', sku: 'BAK-MUF-02', stock: 30,  min_stock: 8,  image: productThumb('cat-bak', '🧁') },
  { id: 'prod-choccake',   name: 'Fudge Cake Slice',        price: 5.25, cost: 1.50, category: 'cat-bak', sku: 'BAK-CAK-03', stock: 12,  min_stock: 5,  image: productThumb('cat-bak', '🍰') },
  { id: 'prod-avotoast',   name: 'Avocado Toast',           price: 8.50, cost: 2.50, category: 'cat-snd', sku: 'SND-AVO-01', stock: 35,  min_stock: 5,  image: productThumb('cat-snd', '🥑') },
  { id: 'prod-caprese',    name: 'Caprese Panini',          price: 9.25, cost: 3.00, category: 'cat-snd', sku: 'SND-CAP-02', stock: 22,  min_stock: 5,  image: productThumb('cat-snd', '🥪') },
  { id: 'prod-turkeyswiss',name: 'Turkey Swiss Sandwich',   price: 8.75, cost: 2.75, category: 'cat-snd', sku: 'SND-TRK-03', stock: 4,   min_stock: 5,  image: productThumb('cat-snd', '🥪') },
  { id: 'prod-chips',      name: 'Sea Salt Potato Chips',   price: 2.00, cost: 0.50, category: 'cat-snk', sku: 'SNK-CHP-01', stock: 75,  min_stock: 15, image: productThumb('cat-snk', '🍟') },
  { id: 'prod-fruit',      name: 'Fresh Berry Bowl',        price: 5.50, cost: 1.80, category: 'cat-snk', sku: 'SNK-FRT-02', stock: 18,  min_stock: 5,  image: productThumb('cat-snk', '🍓') },
];

const CUSTOMERS = [
  { id: 'cust-1', name: 'Sarah Jenkins',   email: 'sarah.j@gmail.com',        phone: '555-0192', points: 124, created_at: '2026-05-10' },
  { id: 'cust-2', name: 'Marcus Chen',     email: 'mchen99@yahoo.com',         phone: '555-0143', points: 48,  created_at: '2026-06-01' },
  { id: 'cust-3', name: 'Olivia Martinez', email: 'olivia.m@outlook.com',      phone: '555-0177', points: 215, created_at: '2026-04-15' },
  { id: 'cust-4', name: 'David Wilson',    email: 'david.wilson@gmail.com',    phone: '555-0188', points: 10,  created_at: '2026-06-25' },
];

const USER_ACCOUNTS = [
  { id: 'user-admin',   name: 'Admin Manager',        role: 'admin',   pin: hashPin('1234'), active: true, created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'user-manager', name: 'Sarah Store Manager',  role: 'manager', pin: hashPin('5555'), active: true, created_at: '2026-01-10T00:00:00.000Z' },
  { id: 'user-cashier', name: 'John Cashier',         role: 'cashier', pin: hashPin('0000'), active: true, created_at: '2026-01-20T00:00:00.000Z' },
];

const SETTINGS_TAX_RATE = 8.5;
const LOYALTY_POINT_VALUE = 0.05;

// ─── Transaction Generator ────────────────────────────────────────────────────

function generateTransactions() {
  const transactions = [];
  const paymentMethods = ['card', 'card', 'cash', 'mobile', 'card'];
  const today = new Date();
  let txCounter = 10001;

  for (let d = 7; d >= 0; d--) {
    const saleDate = new Date(today);
    saleDate.setDate(today.getDate() - d);

    const isWeekend = saleDate.getDay() === 0 || saleDate.getDay() === 6;
    const salesCount = isWeekend ? 15 + Math.floor(Math.random() * 10) : 8 + Math.floor(Math.random() * 8);

    for (let s = 0; s < salesCount; s++) {
      const hour = 7 + Math.floor(Math.random() * 11);
      const minute = Math.floor(Math.random() * 60);
      const txDate = new Date(saleDate);
      txDate.setHours(hour, minute, 0, 0);

      const itemCount = 1 + Math.floor(Math.random() * 4);
      const selectedIds = new Set();
      while (selectedIds.size < itemCount) {
        const prod = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
        selectedIds.add(prod.id);
      }

      const items = Array.from(selectedIds).map(prodId => {
        const prod = PRODUCTS.find(p => p.id === prodId);
        const qty = 1 + (Math.random() > 0.8 ? 1 : 0);
        return {
          productId: prod.id,
          productName: prod.name,
          price: prod.price,
          cost: prod.cost,
          quantity: qty,
          total: Number((prod.price * qty).toFixed(2)),
        };
      });

      const subtotal = Number(items.reduce((sum, i) => sum + i.total, 0).toFixed(2));

      let customer_id = null;
      let customer_name = null;
      let discount_type = 'none';
      let discount_value = 0;
      let discount = 0;

      if (Math.random() < 0.4) {
        const cust = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
        customer_id = cust.id;
        customer_name = cust.name;

        const discRand = Math.random();
        if (discRand < 0.3) {
          discount_type = 'loyalty';
          discount_value = Math.min(cust.points, 20);
          discount = Number((discount_value * LOYALTY_POINT_VALUE).toFixed(2));
        } else if (discRand < 0.6) {
          discount_type = 'percentage';
          discount_value = 10;
          discount = Number((subtotal * 0.1).toFixed(2));
        }
      }

      const taxable = Math.max(0, subtotal - discount);
      const tax = Number((taxable * (SETTINGS_TAX_RATE / 100)).toFixed(2));
      const total = Number((taxable + tax).toFixed(2));
      const payment_method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

      let cash_paid = null;
      let cash_change = null;
      if (payment_method === 'cash') {
        const bills = [5, 10, 20, 50, 100];
        const payVal = bills.find(b => b >= total) || Math.ceil(total / 10) * 10;
        cash_paid = payVal;
        cash_change = Number((payVal - total).toFixed(2));
      }

      const isRefunded = d > 0 && Math.random() < 0.03;

      transactions.push({
        id: `TX-${txCounter++}`,
        date: txDate.toISOString(),
        items: items,
        subtotal,
        discount,
        discount_type,
        discount_value,
        tax,
        total,
        payment_method,
        cash_paid,
        cash_change,
        customer_id,
        customer_name,
        status: isRefunded ? 'refunded' : 'completed',
        refund_date: isRefunded ? new Date(txDate.getTime() + 4 * 60 * 60 * 1000).toISOString() : null,
      });
    }
  }

  return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── Supabase REST Helper ─────────────────────────────────────────────────────

async function supabaseUpsert(table, records) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records),
  });

  if (!res.ok) {
    const body = await res.text();
    if ((res.status === 401 || res.status === 403) && !usingServiceRole) {
      throw new Error(
        `[${table}] HTTP ${res.status}: ${body}\n` +
          '   ℹ️  The anon key cannot write when RLS is enabled (the default schema). ' +
          'Set SUPABASE_SERVICE_ROLE_KEY in .env and re-run.',
      );
    }
    throw new Error(`[${table}] HTTP ${res.status}: ${body}`);
  }
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting Supabase seeder...\n');
  console.log(`📡 Target: ${SUPABASE_URL}`);
  console.log(`🔑 Key: ${usingServiceRole ? 'service role' : 'anon (works only without RLS)'}\n`);

  // Step 1 — Upsert categories
  process.stdout.write('📦 Seeding categories... ');
  await supabaseUpsert('categories', CATEGORIES);
  console.log(`✅ ${CATEGORIES.length} records`);

  // Step 2 — Upsert products
  process.stdout.write('🛒 Seeding products... ');
  await supabaseUpsert('products', PRODUCTS);
  console.log(`✅ ${PRODUCTS.length} records`);

  // Step 3 — Upsert customers
  process.stdout.write('👥 Seeding customers... ');
  await supabaseUpsert('customers', CUSTOMERS);
  console.log(`✅ ${CUSTOMERS.length} records`);

  // Step 4 — Upsert user accounts
  process.stdout.write('🔑 Seeding user accounts... ');
  await supabaseUpsert('user_accounts', USER_ACCOUNTS);
  console.log(`✅ ${USER_ACCOUNTS.length} records`);

  // Step 5 — Generate & upsert transactions
  process.stdout.write('🧾 Generating & seeding transactions... ');
  const transactions = generateTransactions();
  // Push in batches of 100 to avoid payload limits
  const BATCH = 100;
  for (let i = 0; i < transactions.length; i += BATCH) {
    await supabaseUpsert('transactions', transactions.slice(i, i + BATCH));
  }
  console.log(`✅ ${transactions.length} records`);

  console.log('\n🎉 All seed data successfully pushed to Supabase!');
  console.log('ℹ️  You can now delete src/data/seedData.ts safely.\n');
}

main().catch(err => {
  console.error('\n❌ Seeder failed:', err.message);
  process.exit(1);
});
