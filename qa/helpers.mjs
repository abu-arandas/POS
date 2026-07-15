import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export const SHOTS = path.resolve('./shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}
export function flush(suite) {
  const file = path.resolve(`./results-${suite}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n== ${suite}: ${results.length - fails}/${results.length} passed ==`);
}

export async function launch(userDataDir) {
  const opts = {
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: ['--no-sandbox'],
  };
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, opts);
  } catch {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...opts,
      executablePath: '/opt/pw-browsers/chromium',
    });
  }
  const page = context.pages()[0] || (await context.newPage());
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  const dialogs = [];
  const dialogControl = { mode: 'record-dismiss' }; // 'record-dismiss' | 'accept'
  page.on('dialog', async (d) => {
    dialogs.push(`${d.type()}: ${d.message()}`);
    if (dialogControl.mode === 'accept') await d.accept().catch(() => {});
    else await d.dismiss().catch(() => {});
  });
  return { context, page, consoleErrors, dialogs, dialogControl };
}

export async function gotoApp(page) {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
}

// Click keypad digits on the lockscreen PIN pad
export async function typePin(page, pin) {
  for (const d of pin) {
    await page.locator('#lockscreen-root button', { hasText: new RegExp(`^${d}$`) }).click();
    await page.waitForTimeout(120);
  }
}

// Full login: pick user card by visible name, then enter PIN
export async function login(page, userName, pin) {
  await page.waitForSelector('#lockscreen-root', { timeout: 15000 });
  await page
    .locator('#lockscreen-root button')
    .filter({ hasText: userName })
    .first()
    .click();
  await page.waitForTimeout(400);
  await typePin(page, pin);
  await page.waitForTimeout(600);
}

export async function lock(page) {
  await page.locator('#sidebar-user-card button[title="Lock POS Screen"]').click();
  await page.waitForSelector('#lockscreen-root', { timeout: 5000 });
}

export async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}
