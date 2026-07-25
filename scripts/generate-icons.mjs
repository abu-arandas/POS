/**
 * Regenerates every raster icon from the single SVG source.
 *
 *   node scripts/generate-icons.mjs
 *
 * Source:  src/assets/logo-mark.svg
 * Outputs: buildResources/icon.png   (Electron app icon, 512²)
 *          buildResources/icon.ico   (Windows installer/exe icon)
 *          public/favicon.svg        (copy of the source)
 *          public/favicon.ico        (16/32/48)
 *          public/favicon-32.png
 *          public/apple-touch-icon.png (180²)
 *
 * To swap in a different logo, replace src/assets/logo-mark.svg and re-run.
 * If you have a raster logo instead, point SOURCE at the PNG — sharp reads both.
 *
 * Requires `sharp` and `png-to-ico`, which are not project dependencies (this is
 * a one-off asset step, not part of the build):
 *   npm i -D sharp png-to-ico
 */
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'src/assets/logo-mark.svg');

let sharp, pngToIco;
try {
  ({ default: sharp } = await import('sharp'));
  ({ default: pngToIco } = await import('png-to-ico'));
} catch {
  console.error(
    'Missing image tooling. Install the one-off dev deps first:\n' +
      '  npm i -D sharp png-to-ico',
  );
  process.exit(1);
}

const png = (size) => sharp(SOURCE, { density: 384 }).resize(size, size).png().toBuffer();

await mkdir(resolve(root, 'buildResources'), { recursive: true });
await mkdir(resolve(root, 'public'), { recursive: true });

await writeFile(resolve(root, 'buildResources/icon.png'), await png(512));
await writeFile(
  resolve(root, 'buildResources/icon.ico'),
  await pngToIco(await Promise.all([16, 24, 32, 48, 64, 128, 256].map(png))),
);
await copyFile(SOURCE, resolve(root, 'public/favicon.svg'));
await writeFile(
  resolve(root, 'public/favicon.ico'),
  await pngToIco(await Promise.all([16, 32, 48].map(png))),
);
await writeFile(resolve(root, 'public/favicon-32.png'), await png(32));
await writeFile(resolve(root, 'public/apple-touch-icon.png'), await png(180));

console.log('Icons regenerated from', SOURCE);
