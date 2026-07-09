/**
 * Supabase Seeder Script
 * Creates the schema tables and seeds all initial data.
 * Run with: node scripts/seed.mjs
 */

const SUPABASE_URL = 'https://rzpyauhymrwonjnkboqf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6cHlhdWh5bXJ3b25qbmtib3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MTUzNTgsImV4cCI6MjA5OTA5MTM1OH0.IEaPkISAezltX5OABvohwlzvPcFJj8fwVEMxzfK_F04';

// ─── Inline Seed Data ────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'cat-bev', name: 'Beverages', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'cat-bak', name: 'Bakery',    color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'cat-snd', name: 'Sandwiches',color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'cat-snk', name: 'Snacks',    color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

const PRODUCTS = [
  { id: 'prod-espresso',   name: 'Classic Espresso',       price: 3.25, cost: 0.65, category: 'cat-bev', sku: 'BEV-ESP-01', stock: 120, min_stock: 20, image: 'https://images.unsplash.com/photo-1510972527409-cef1903972fa?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-latte',      name: 'Caffe Latte',             price: 4.50, cost: 0.90, category: 'cat-bev', sku: 'BEV-LAT-02', stock: 95,  min_stock: 15, image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-greentea',   name: 'Organic Matcha Tea',      price: 4.00, cost: 0.80, category: 'cat-bev', sku: 'BEV-MAT-03', stock: 6,   min_stock: 10, image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-croissant',  name: 'Butter Croissant',        price: 3.75, cost: 1.10, category: 'cat-bak', sku: 'BAK-CRO-01', stock: 45,  min_stock: 10, image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-muffin',     name: 'Blueberry Muffin',        price: 3.50, cost: 0.95, category: 'cat-bak', sku: 'BAK-MUF-02', stock: 30,  min_stock: 8,  image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-choccake',   name: 'Fudge Cake Slice',        price: 5.25, cost: 1.50, category: 'cat-bak', sku: 'BAK-CAK-03', stock: 12,  min_stock: 5,  image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-avotoast',   name: 'Avocado Toast',           price: 8.50, cost: 2.50, category: 'cat-snd', sku: 'SND-AVO-01', stock: 35,  min_stock: 5,  image: 'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-caprese',    name: 'Caprese Panini',          price: 9.25, cost: 3.00, category: 'cat-snd', sku: 'SND-CAP-02', stock: 22,  min_stock: 5,  image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-turkeyswiss',name: 'Turkey Swiss Sandwich',   price: 8.75, cost: 2.75, category: 'cat-snd', sku: 'SND-TRK-03', stock: 4,   min_stock: 5,  image: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-chips',      name: 'Sea Salt Potato Chips',   price: 2.00, cost: 0.50, category: 'cat-snk', sku: 'SNK-CHP-01', stock: 75,  min_stock: 15, image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'prod-fruit',      name: 'Fresh Berry Bowl',        price: 5.50, cost: 1.80, category: 'cat-snk', sku: 'SNK-FRT-02', stock: 18,  min_stock: 5,  image: 'https://images.unsplash.com/photo-1519996521430-02b798c1d881?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
];

const CUSTOMERS = [
  { id: 'cust-1', name: 'Sarah Jenkins',   email: 'sarah.j@gmail.com',        phone: '555-0192', points: 124, created_at: '2026-05-10' },
  { id: 'cust-2', name: 'Marcus Chen',     email: 'mchen99@yahoo.com',         phone: '555-0143', points: 48,  created_at: '2026-06-01' },
  { id: 'cust-3', name: 'Olivia Martinez', email: 'olivia.m@outlook.com',      phone: '555-0177', points: 215, created_at: '2026-04-15' },
  { id: 'cust-4', name: 'David Wilson',    email: 'david.wilson@gmail.com',    phone: '555-0188', points: 10,  created_at: '2026-06-25' },
];

const USER_ACCOUNTS = [
  { id: 'user-admin',   name: 'Admin Manager',        role: 'admin',   pin: '1234', active: true, created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'user-manager', name: 'Sarah Store Manager',  role: 'manager', pin: '5555', active: true, created_at: '2026-01-10T00:00:00.000Z' },
  { id: 'user-cashier', name: 'John Cashier',         role: 'cashier', pin: '0000', active: true, created_at: '2026-01-20T00:00:00.000Z' },
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
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${table}] HTTP ${res.status}: ${body}`);
  }
  return true;
}

// ─── Schema creation via Supabase SQL REST endpoint ───────────────────────────

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  // This may 404 if the function doesn't exist; that's OK — tables may already be created
  return res.ok;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting Supabase seeder...\n');
  console.log(`📡 Target: ${SUPABASE_URL}\n`);

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
