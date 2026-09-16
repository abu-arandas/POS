import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Credentials come from the environment, never from source. This file used to
// carry a live project URL, anon key, device email and device password as
// literals; anything committed here is public the moment the repository is.
// Copy .env.example to .env and fill it in, or export these before running.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEVICE_EMAIL = process.env.SUPABASE_DEVICE_EMAIL;
const DEVICE_PASSWORD = process.env.SUPABASE_DEVICE_PASSWORD;

// Which store these rows belong to. Required on a database that has run
// multi-store-schema.sql: multi-store-rls-enforce.sql declares store_id NOT
// NULL, so an unstamped upsert is rejected outright — and on a multi-store
// database that has not reached the enforcement step, it silently writes rows
// with a NULL store_id that no scoped pull will ever return. The application
// refuses exactly this write for exactly this reason (isSyncBlocked() in
// src/lib/supabase/storeScope.ts); a migration script must not be the back
// door around it. Left empty for a single-store database, which has no store
// dimension to stamp.
const STORE_ID = process.env.SUPABASE_STORE_ID || '';

// The export to import. Defaults to the sample alongside this script, but a
// real migration passes its own: a device backup is a store's live catalogue —
// names, costs, purchase prices, margins — and belongs in a file you point at,
// not one committed to the repository.
const BACKUP_PATH =
  process.argv[2] ||
  process.env.POS_BACKUP_FILE ||
  path.join(import.meta.dirname, 'installed_device_backup.json');

const MISSING = [
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
  ['SUPABASE_DEVICE_EMAIL', DEVICE_EMAIL],
  ['SUPABASE_DEVICE_PASSWORD', DEVICE_PASSWORD],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

const CATEGORY_COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-orange-100 text-orange-800 border-orange-200',
];

/** Turns a bare store_id constraint failure into the instruction that fixes it. */
function storeScopeHint(message) {
  return /store_id/.test(message) && !STORE_ID
    ? `${message} — this database is multi-store: set SUPABASE_STORE_ID in .env to the id of the store you are importing into.`
    : message;
}

export async function uploadData() {
  if (MISSING.length > 0) {
    return {
      success: false,
      error: `Missing required environment variable(s): ${MISSING.join(', ')}. See .env.example.`,
    };
  }
  console.log('Connecting to Supabase at:', SUPABASE_URL);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  console.log('Signing in with device account:', DEVICE_EMAIL);
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: DEVICE_EMAIL,
    password: DEVICE_PASSWORD,
  });

  if (authError) {
    console.error('❌ Sign in failed:', authError.message);
    return { success: false, error: authError.message };
  }

  console.log('✅ Device authenticated! User ID:', authData.user.id);
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await authedClient.auth.setSession(authData.session);

  // Read backup data
  if (!fs.existsSync(BACKUP_PATH)) {
    return {
      success: false,
      error:
        `Backup file not found: ${BACKUP_PATH}. Pass one as the first argument ` +
        '(node scripts/upload_to_supabase.mjs ./my-backup.json) or set POS_BACKUP_FILE.',
    };
  }
  console.log('Reading backup:', BACKUP_PATH);
  console.log('Store scope:', STORE_ID || 'none (single-store database)');
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'));

  // Transform categories
  const categories = (backup.categories || []).map((cat, idx) => ({
    id: `cat-${cat.id}`,
    name: cat.name,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
  }));

  // Map category ids to new format
  const catIdMap = new Map();
  for (const cat of backup.categories || []) {
    catIdMap.set(cat.id, `cat-${cat.id}`);
  }

  // Transform products
  const products = (backup.products || []).map((p) => ({
    id: `prod-${p.id}`,
    name: p.name,
    price: Number(p.sellPrice ?? p.sellPricePlusTax ?? 0),
    cost: Number(p.cost ?? 0),
    category: p.categoryId ? catIdMap.get(p.categoryId) || null : null,
    sku: p.barcode && p.barcode !== '0' ? String(p.barcode) : `SKU-${p.id}`,
    stock: Math.round(Number(p.stock ?? 0)),
    min_stock: Math.round(Number(p.minStockQuantity ?? 0)),
    image: p.image || 'bg-amber-500',
  }));

  // Stamped after mapping, on both tables at once, so neither can be the one
  // that is forgotten when a third is added.
  const scope = (records) =>
    STORE_ID ? records.map((record) => ({ ...record, store_id: STORE_ID })) : records;
  const scopedCategories = scope(categories);
  const scopedProducts = scope(products);

  console.log(`Prepared ${categories.length} categories and ${products.length} products.`);

  // Try pushing categories
  console.log('Pushing categories to Supabase...');
  const catRes = await authedClient.from('categories').upsert(scopedCategories);
  if (catRes.error) {
    console.error('❌ Categories push error:', catRes.error.message);
    return { success: false, error: storeScopeHint(catRes.error.message) };
  }
  console.log('✅ Categories successfully uploaded!');

  // Try pushing products
  console.log('Pushing products to Supabase...');
  const prodRes = await authedClient.from('products').upsert(scopedProducts);
  if (prodRes.error) {
    console.error('❌ Products push error:', prodRes.error.message);
    return { success: false, error: storeScopeHint(prodRes.error.message) };
  }
  console.log('✅ Products successfully uploaded!');

  return { success: true };
}

uploadData()
  .then((res) => {
    if (res.success) {
      console.log('🎉 All data successfully uploaded to Supabase!');
      process.exit(0);
    } else {
      console.error('Upload could not complete:', res.error);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
