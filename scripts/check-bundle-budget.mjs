import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const assetsDir = path.join(root, 'dist', 'assets');
const budgets = [
  {
    label: 'initial JavaScript',
    pattern: /^index-.*\.js$/,
    maxGzipBytes: 200_000,
  },
  {
    label: 'initial CSS',
    pattern: /^index-.*\.css$/,
    maxGzipBytes: 50_000,
  },
];

if (!fs.existsSync(assetsDir)) {
  throw new Error(
    'dist/assets does not exist; run `npm run build` before checking the bundle budget',
  );
}

const assets = fs.readdirSync(assetsDir);
let failed = false;
for (const budget of budgets) {
  const matches = assets.filter((name) => budget.pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(
      `${budget.label}: expected exactly one hashed entry asset matching ${budget.pattern}, found ${matches.length}`,
    );
  }

  const name = matches[0];
  const raw = fs.readFileSync(path.join(assetsDir, name));
  const gzipBytes = gzipSync(raw, { level: 9 }).byteLength;
  const status = gzipBytes <= budget.maxGzipBytes ? 'PASS' : 'FAIL';
  console.log(
    `${status} ${budget.label}: ${gzipBytes} gzip bytes / ${budget.maxGzipBytes} budget (${name})`,
  );
  if (gzipBytes > budget.maxGzipBytes) failed = true;
}

if (failed) process.exit(1);
