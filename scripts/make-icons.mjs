// Cuts every committed icon raster from src/assets/logo-mark.svg, so a logo change
// edits that one drawing (and src/components/Logo.tsx) and then runs:
//
//   node scripts/make-icons.mjs
//
// from the project root. The transparent button goes where nothing crops it (the
// browser tab, the Windows exe and taskbar); the full-bleed tile (the button
// reversed out of a denim square) goes where the system cuts its own shape (the
// iPhone/iPad home-screen icon). Needs Playwright's Chromium; nothing it makes
// ships as code.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const mark = readFileSync('src/assets/logo-mark.svg', 'utf8');
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" fill="#2B4C8C"/>
  <g transform="translate(20.4 20.4) scale(0.66)">
    <circle cx="60" cy="60" r="52" fill="#F7F5F0"/>
    <circle cx="60" cy="60" r="43" fill="none" stroke="#2B4C8C" stroke-opacity=".25" stroke-width="3"/>
    <rect x="38" y="38" width="19" height="19" rx="6" fill="#2B4C8C"/>
    <rect x="63" y="38" width="19" height="19" rx="6" fill="#EE7B30"/>
    <rect x="38" y="63" width="19" height="19" rx="6" fill="#2B4C8C"/>
    <rect x="63" y="63" width="19" height="19" rx="6" fill="#2B4C8C"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function png(svg, size, transparent) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  return page.screenshot({
    omitBackground: transparent,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}

// One .ico holding PNG images (read by Windows Vista and later).
function ico(images, sizes) {
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(images[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

function save(path, data) {
  writeFileSync(path, data);
  console.log('Wrote', path);
}

save('public/favicon.svg', mark);
save('public/favicon-32.png', await png(mark, 32, true));
save('public/apple-touch-icon.png', await png(tile, 180, false));
// One page renders every size, so the sizes are drawn one after another.
async function sizes(svg, list) {
  const images = [];
  for (const size of list) images.push(await png(svg, size, true));
  return ico(images, list);
}
save('public/favicon.ico', await sizes(mark, [16, 32, 48]));
save('buildResources/icon.png', await png(mark, 512, true));
save('buildResources/icon.ico', await sizes(mark, [16, 24, 32, 48, 64, 128, 256]));

await browser.close();
