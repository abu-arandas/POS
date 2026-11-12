// Guards the two ways a translation silently breaks, and fails when either happens:
//
//   * a key that one language has and the other does not. i18next does not throw on a missing key: it renders
//     the key itself, so the till shows `settings.storeName` where a label should be, and only someone reading
//     that screen in that language ever finds out;
//   * a `t('…')` call in src/ whose key is not in the English catalogue.
//
// Run from the project root:   node scripts/check_locales.mjs
//
// Reads the catalogues by importing each src/locales/<lang>/<namespace>.ts (Node strips the types), and the
// call sites as source text. Only the static form `t('a.b')` is checked; a template-literal key such as
// t(`receiptCfg.tg_${key}`) cannot be resolved without running it.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = path.resolve('src');
const LOCALES = path.join(SRC, 'locales');

/** Every leaf path in a nested catalogue: `settings.storeName`, … */
function flatten(value, prefix, out) {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out.add(prefix);
  }
  return out;
}

async function catalogue(locale) {
  const keys = new Set();
  const files = readdirSync(path.join(LOCALES, locale)).filter(
    (f) => f.endsWith('.ts') && f !== 'index.ts',
  );
  for (const file of files) {
    const module = await import(pathToFileURL(path.join(LOCALES, locale, file)).href);
    for (const [name, value] of Object.entries(module)) flatten(value, name, keys);
  }
  return { files: files.sort(), keys };
}

// i18next resolves `history.deleteBody` through `deleteBody_one` / `deleteBody_other`, and Arabic carries
// `_zero`, `_two`, `_few` and `_many` that English does not, so both sides are compared on the stem.
const stem = (key) => key.replace(/_(zero|one|two|few|many|other)$/, '');
const stems = (keys) => new Set([...keys].map(stem));

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const en = await catalogue('en');
const ar = await catalogue('ar');
const enStems = stems(en.keys);
const arStems = stems(ar.keys);

const problems = [];
const report = (title, items) => {
  if (items.length)
    problems.push(`${title} (${items.length}):\n${items.map((i) => `  ${i}`).join('\n')}`);
};

// A guard on the guard: if the walk ever stopped finding keys, every comparison below would pass.
if (en.keys.size < 500)
  problems.push(`Only ${en.keys.size} English keys found: the catalogue walk is broken.`);
report('Namespace files in one language only', [
  ...en.files.filter((f) => !ar.files.includes(f)).map((f) => `en/${f}`),
  ...ar.files.filter((f) => !en.files.includes(f)).map((f) => `ar/${f}`),
]);
report('English keys with no Arabic', [...enStems].filter((k) => !arStems.has(k)).sort());
report('Arabic keys with no English', [...arStems].filter((k) => !enStems.has(k)).sort());

const used = new Map();
for (const file of sourceFiles(SRC)) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
    if (!used.has(match[1])) used.set(match[1], path.relative(SRC, file));
  }
}
if (used.size < 500)
  problems.push(`Only ${used.size} t('…') calls found: the source sweep is broken.`);
report(
  "t('…') keys not in the English catalogue",
  [...used]
    .filter(([key]) => !en.keys.has(key) && !enStems.has(key))
    .map(([key, file]) => `${key} (${file})`)
    .sort(),
);

if (problems.length) {
  console.log(problems.join('\n\n'));
  process.exit(1);
}
console.log(
  `ok: ${en.keys.size} English and ${ar.keys.size} Arabic keys match, and all ${used.size} t('…') keys resolve`,
);
