import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://fwwgksbubwlnfzokflhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3d2drc2J1YndsbmZ6b2tmbGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzA2NjgsImV4cCI6MjEwNDgwNjY2OH0.BSZ5Jxcimp3wlvD3jODjfbM2s2DHF8jQD3LYDYqf2FA';
const DEVICE_EMAIL = 'sjgrill9@gmail.com';
const DEVICE_PASSWORD = 'Sult@n2005';

const CATEGORY_COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-orange-100 text-orange-800 border-orange-200',
];

export async function uploadData() {
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
  const raw = fs.readFileSync(path.join(process.cwd(), 'src/data/installed_device_backup.json'), 'utf-8');
  const backup = JSON.parse(raw);

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

  console.log(`Prepared ${categories.length} categories and ${products.length} products.`);

  // Try pushing categories
  console.log('Pushing categories to Supabase...');
  const catRes = await authedClient.from('categories').upsert(categories);
  if (catRes.error) {
    console.error('❌ Categories push error:', catRes.error.message);
    return { success: false, error: catRes.error.message };
  }
  console.log('✅ Categories successfully uploaded!');

  // Try pushing products
  console.log('Pushing products to Supabase...');
  const prodRes = await authedClient.from('products').upsert(products);
  if (prodRes.error) {
    console.error('❌ Products push error:', prodRes.error.message);
    return { success: false, error: prodRes.error.message };
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
