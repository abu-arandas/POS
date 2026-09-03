/**
 * Re-downloads the self-hosted webfonts from Google Fonts into
 * src/assets/fonts/ and prints the @font-face block to paste into
 * src/index.css.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Why self-hosted: this is an offline-first POS. It commonly runs on a café LAN
 * with no internet, so an @import from fonts.googleapis.com is a render-blocking
 * request that fails on every launch — and it sends a request to a third party
 * from a payment terminal. Arabic suffered most: 'Cairo' is the only face behind
 * .font-arabic, with no local fallback.
 *
 * Only the subsets the app renders are fetched (latin + latin-ext everywhere,
 * plus arabic for Cairo), and only upright faces — exactly one label in the UI
 * is italic, so the browser synthesizes an oblique instead of us shipping
 * another 221 KB. Requires network access; the committed woff2 files mean the
 * normal build never does.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'src/assets/fonts');

// Google Fonts serves woff2 (and variable axes) only to a modern browser UA.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const WANTED_SUBSETS = new Set(['latin', 'latin-ext', 'arabic']);

const FAMILIES = [
  ['Inter', 'Inter:wght@400..900'],
  ['JetBrains Mono', 'JetBrains+Mono:wght@400..800'],
  ['Cairo', 'Cairo:wght@400..900'],
];

await mkdir(OUT, { recursive: true });

const faces = [];
for (const [family, spec] of FAMILIES) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`, {
    headers: { 'User-Agent': UA },
  }).then((r) => {
    if (!r.ok) throw new Error(`${family}: HTTP ${r.status}`);
    return r.text();
  });

  // Google emits `/* subset */` immediately before each @font-face.
  for (const block of css.split('/*').slice(1)) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!WANTED_SUBSETS.has(subset)) continue;

    const src = /src:\s*url\((https:[^)]+\.woff2)\)/.exec(block);
    const style = /font-style:\s*([a-z]+)/.exec(block);
    const weight = /font-weight:\s*([\d ]+)/.exec(block);
    const range = /unicode-range:\s*([^;]+);/.exec(block);
    if (!src || style?.[1] !== 'normal') continue;

    const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${subset}-normal.woff2`;
    const bytes = Buffer.from(
      await fetch(src[1], { headers: { 'User-Agent': UA } }).then((r) => r.arrayBuffer()),
    );
    await writeFile(resolve(OUT, file), bytes);
    faces.push({ family, file, weight: weight[1].trim(), range: range[1].trim() });
    console.log(`${file.padEnd(38)} ${(bytes.length / 1024).toFixed(1).padStart(7)} KB`);
  }
}

console.log('\n--- paste into src/index.css, replacing the existing @font-face block ---\n');
console.log(
  faces
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('./assets/fonts/${f.file}') format('woff2');
  unicode-range: ${f.range};
}`,
    )
    .join('\n'),
);
