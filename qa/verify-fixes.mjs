import { launch, gotoApp, login, lock, shot, check, flush } from './helpers.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-verify');
dialogControl.mode = 'accept';
const MOCK = 'http://127.0.0.1:54321';
const mockState = async (t) => (await fetch(`${MOCK}/__state/${t}`)).json();
const mockLog = async () => (await fetch(`${MOCK}/__log`)).json();

async function addProduct(name, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.locator('#products-grid > div').filter({ hasText: name }).first().click({ force: true });
    await page.waitForTimeout(200);
  }
}

try {
  /* ===== F2 (source): PINs are hashed in seeder + embedded DDL ===== */
  const seedSrc = fs.readFileSync(path.join(REPO, 'scripts/seed.mjs'), 'utf8');
  check(
    'F2: seed.mjs hashes PINs (hashPin used, no plaintext pin literals)',
    /pin:\s*hashPin\('1234'\)/.test(seedSrc) && !/pin:\s*'1234'/.test(seedSrc),
  );
  const ddlSrc = fs.readFileSync(path.join(REPO, 'src/lib/supabase.ts'), 'utf8');
  check(
    'F2: embedded DDL inserts hashed admin PIN (not plaintext 1234)',
    /03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4/.test(ddlSrc) &&
      !/'admin', '1234'/.test(ddlSrc),
  );

  await gotoApp(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#register-root', { timeout: 15000 });
  check('F2: default hashed Admin still logs in', await page.locator('#sidebar-container').isVisible());

  /* ===== F16: Dark Mode label typo ===== */
  const sb = await page.locator('#sidebar-container').innerText();
  check('F16: sidebar reads "Dark Mode" (typo fixed)', /Dark Mode/.test(sb) && !/DarkMode/.test(sb));

  /* ===== F5a: dark toggle applies .dark immediately ===== */
  await page.locator('#sidebar-container').getByRole('button', { name: /dark mode/i }).click();
  await page.waitForTimeout(400);
  const darkNow = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check('F5a: toggling Dark Mode applies .dark in-session (no reload)', darkNow === true);
  await page.locator('#sidebar-container').getByRole('button', { name: /light mode/i }).click();
  await page.waitForTimeout(300);

  /* ===== F6: single mount (no duplicate IDs) ===== */
  const dup = {};
  for (const id of ['register-root', 'cart-section', 'products-grid', 'catalog-section'])
    dup[id] = await page.locator(`[id="${id}"]`).count();
  check('F6: each screen mounted once (unique IDs, one cart)', Object.values(dup).every((c) => c === 1), JSON.stringify(dup));

  /* ===== F11: blocked product images fall back to emoji ===== */
  await page.waitForTimeout(800);
  const coffeeFallbacks = await page.locator('#products-grid > div', { hasText: '☕' }).count();
  check('F11: broken images fall back to ☕ (onError handler)', coffeeFallbacks >= 1, `fallbacks=${coffeeFallbacks}`);

  /* ===== F12: register product search ===== */
  await page.locator('#register-search-input').fill('latte');
  await page.waitForTimeout(300);
  const grid = await page.locator('#products-grid > div').allInnerTexts();
  check('F12: register search filters the grid', grid.length === 1 && /Latte/i.test(grid[0]), `count=${grid.length}`);
  await page.locator('#register-search-input').fill('');
  await page.waitForTimeout(200);

  /* ===== F13: cards not aria-disabled outside edit mode ===== */
  const ariaCount = await page.locator('#products-grid > div[aria-disabled="true"]').count();
  check('F13: product cards are not aria-disabled while browsing', ariaCount === 0, `aria-disabled=${ariaCount}`);

  /* ===== F4: tax itemized in cart + receipt; F7: operator = Admin ===== */
  await addProduct('Classic Espresso', 2);
  await addProduct('Caffe Latte', 1);
  const cartTxt = await page.locator('#cart-pricing-summary').innerText();
  check('F4: cart summary itemizes Tax', /tax/i.test(cartTxt), cartTxt.replace(/\n/g, ' '));
  check('F4: cart total still $11.94 (math intact)', /11\.94/.test(cartTxt));
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal');
  await page.locator('#pay-method-card').click();
  await page.getByRole('button', { name: /complete order/i }).click();
  await page.waitForSelector('#receipt-modal');
  const rcpt = await page.locator('#thermal-receipt').innerText();
  check('F4: register receipt itemizes TAX', /tax/i.test(rcpt));
  check('F7: receipt operator = logged-in Admin', /OPERATOR:\s*Admin/i.test(rcpt.replace(/\n/g, ' ')));
  await shot(page, 'verify-01-receipt-tax');
  await page.getByRole('button', { name: /new sale/i }).click();
  await page.waitForTimeout(500);

  /* ===== F7 (dynamic): cashier sale attributes to Cashier ===== */
  await lock(page);
  await login(page, 'Cashier', '0000');
  await page.waitForSelector('#register-root');
  await addProduct('Classic Espresso', 1);
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal');
  await page.locator('#pay-method-card').click();
  await page.getByRole('button', { name: /complete order/i }).click();
  await page.waitForSelector('#receipt-modal');
  const rcpt2 = await page.locator('#thermal-receipt').innerText();
  check('F7: cashier sale attributes operator = Cashier', /OPERATOR:\s*Cashier/i.test(rcpt2.replace(/\n/g, ' ')));
  await page.getByRole('button', { name: /new sale/i }).click();
  await page.waitForTimeout(400);
  await lock(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#sidebar-container');

  /* ===== F17: dashboard badge reflects sync OFF ===== */
  await page.locator('#nav-btn-dashboard').click();
  await page.waitForTimeout(1200);
  const badge = await page.getByText(/LOCAL DATA ONLY|LIVE METRICS SYNCED/).first().innerText();
  check('F17: dashboard badge shows LOCAL DATA ONLY (sync disabled)', /LOCAL DATA ONLY/.test(badge), badge);

  /* ===== F18: zero-price margin guard ===== */
  await page.locator('#nav-btn-inventory').click();
  await page.waitForSelector('#inventory-table');
  await page.locator('#add-item-trigger-btn').click();
  await page.waitForSelector('#product-form-modal');
  await page.locator('#form-prod-name').fill('QA Zero');
  await page.locator('#form-prod-price').fill('0');
  await page.locator('#form-prod-cost').fill('0');
  await page.locator('#form-prod-stock').fill('3');
  await page.locator('#form-submit-prod-btn').click();
  await page.waitForTimeout(500);
  const zeroRow = (await page.locator('#inventory-table tbody tr').filter({ hasText: 'QA Zero' }).innerText()).replace(/\n/g, ' ');
  check('F18: zero-price margin shows 0% (not NaN%)', !/NaN/.test(zeroRow) && /0%/.test(zeroRow), zeroRow);

  /* ===== F3: delete propagates to the cloud (needs mock-supabase.mjs running) ===== */
  await page.locator('#nav-btn-settings').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /supabase/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[type="url"]').fill(MOCK);
  await page.locator('input[type="password"]').fill('mock-anon-key');
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /save config/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /push/i }).click();
  await page.waitForTimeout(2500);
  const beforeDel = await mockState('products');
  check('F3 setup: QA Zero present in cloud after push', beforeDel.some((p) => p.name === 'QA Zero'), `cloud=${beforeDel.length}`);
  await page.locator('#nav-btn-inventory').click();
  await page.waitForTimeout(500);
  await page.locator('#inventory-table tbody tr').filter({ hasText: 'QA Zero' }).locator('button[title="Delete product"]').click();
  await page.waitForTimeout(1200);
  const afterDel = await mockState('products');
  const log = await mockLog();
  check(
    'F3: deleting a product removes it from the cloud (DELETE synced)',
    !afterDel.some((p) => p.name === 'QA Zero') && log.some((l) => l.method === 'DELETE' && l.table === 'products'),
    `cloud=${afterDel.length}`,
  );

  /* ===== F5b: Settings panels are dark in dark mode ===== */
  await page.locator('#sidebar-container').getByRole('button', { name: /dark mode/i }).click();
  await page.waitForTimeout(400);
  await page.locator('#nav-btn-settings').click();
  await page.waitForTimeout(600);
  const cardBg = await page
    .locator('#desktop-view-container .rounded-2xl.border')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
    .catch(() => 'n/a');
  check('F5b: Settings card is dark (not white) in dark mode', cardBg !== 'rgb(255, 255, 255)' && cardBg !== 'n/a', `card bg=${cardBg}`);
  await shot(page, 'verify-02-settings-dark');
  await page.locator('#sidebar-container').getByRole('button', { name: /light mode/i }).click();

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors during verification', appErrors.length === 0, appErrors.slice(0, 4).join(' || '));
} catch (e) {
  check('verify suite crashed', false, e.message);
  await shot(page, 'verify-crash');
} finally {
  flush('verify-fixes');
  await context.close();
}
