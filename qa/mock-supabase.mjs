// Minimal PostgREST-compatible test double for supabase-js v2.
// Seeded user_accounts mirror the REAL cloud rows (plaintext PINs) pulled via MCP.
import express from 'express';
import fs from 'fs';

const app = express();
app.use(express.json({ limit: '10mb' }));

// permissive CORS (supabase-js sends apikey/authorization/prefer/profile headers)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS,HEAD');
  res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const TABLES = ['user_accounts', 'categories', 'products', 'customers', 'transactions'];
const db = Object.fromEntries(TABLES.map((t) => [t, new Map()]));

// Seed user_accounts from the repo's own scripts/seed.mjs (same demo rows that
// populated the cloud project) — parsed from source so the mock mirrors what
// `node scripts/seed.mjs` produces without copying live-DB output here.
const seedSrc = fs.readFileSync('/home/user/POS/scripts/seed.mjs', 'utf8');
const userBlock = seedSrc.match(/const USER_ACCOUNTS = \[([\s\S]*?)\];/)[1];
for (const line of userBlock.split('\n')) {
  const m = line.match(/\{([\s\S]*)\}/);
  if (!m) continue;
  const obj = {};
  for (const kv of m[1].matchAll(/(\w+):\s*(?:'([^']*)'|(true|false|\d+))/g)) {
    obj[kv[1]] = kv[2] !== undefined ? kv[2] : kv[3] === 'true' ? true : kv[3] === 'false' ? false : Number(kv[3]);
  }
  if (obj.id) db.user_accounts.set(obj.id, obj);
}

const log = [];
function record(entry) {
  log.push({ ts: new Date().toISOString(), ...entry });
  fs.writeFileSync('./mock-log.json', JSON.stringify(log, null, 2));
}

app.get('/rest/v1/:table', (req, res) => {
  const t = req.params.table;
  if (!db[t]) return res.status(404).json({ message: `relation ${t} does not exist` });
  record({ method: 'GET', table: t, query: req.query });
  let rows = [...db[t].values()];
  if (req.query.order) {
    const [col, dir] = String(req.query.order).split('.');
    rows.sort((a, b) => (a[col] < b[col] ? -1 : 1) * (dir === 'desc' ? -1 : 1));
  }
  if (req.query.limit) rows = rows.slice(0, parseInt(req.query.limit));
  res.json(rows);
});

app.post('/rest/v1/:table', (req, res) => {
  const t = req.params.table;
  if (!db[t]) return res.status(404).json({ message: `relation ${t} does not exist` });
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  rows.forEach((r) => db[t].set(r.id, { ...(db[t].get(r.id) || {}), ...r }));
  record({ method: 'POST(upsert)', table: t, count: rows.length, ids: rows.map((r) => r.id), prefer: req.headers.prefer || null });
  res.status(201).json([]);
});

app.delete('/rest/v1/:table', (req, res) => {
  const t = req.params.table;
  if (!db[t]) return res.status(404).json({ message: `relation ${t} does not exist` });
  const idFilter = req.query.id || '';
  const m = String(idFilter).match(/^in\.\((.*)\)$/);
  const ids = m ? m[1].split(',').map((s) => s.replace(/^"|"$/g, '')) : [];
  ids.forEach((id) => db[t].delete(id));
  record({ method: 'DELETE', table: t, ids });
  res.status(204).end();
});

// inspection endpoints for the test harness
app.get('/__state/:table', (req, res) => res.json([...(db[req.params.table]?.values() || [])]));
app.get('/__log', (req, res) => res.json(log));

app.listen(54321, '127.0.0.1', () => console.log('mock supabase on http://127.0.0.1:54321'));
