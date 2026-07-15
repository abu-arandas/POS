import { launch, gotoApp, login, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogControl } = await launch('./profile-polish');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';

async function nav(id) {
  await page.locator(`#nav-btn-${id}`).click();
  await page.waitForTimeout(700);
}

try {
  await gotoApp(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#register-root', { timeout: 15000 });

  /* ===== F21: lazy screens load on demand (Suspense) ===== */
  await nav('dashboard');
  const svgCount = await page.locator(V + 'svg.recharts-surface').count();
  check('F21: Dashboard (lazy recharts chunk) renders after navigation', svgCount >= 2, `svg=${svgCount}`);
  await nav('qrmenu');
  await page.locator(V + 'svg').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  const qrInput = await page.locator(V + 'input').first().inputValue().catch(() => '');
  const qrSvg = await page.locator(V + 'svg').count();
  check('F21: QR Menu (lazy qrcode chunk) renders after navigation', /:3001/.test(qrInput) && qrSvg >= 1, `url="${qrInput}" svg=${qrSvg}`);

  /* ===== F10: new product gets a UUID-based id ===== */
  await nav('inventory');
  await page.waitForSelector(V + '#inventory-table');
  await page.locator(V + '#add-item-trigger-btn').click();
  await page.waitForSelector('#product-form-modal');
  await page.locator('#form-prod-name').fill('Polish Widget');
  await page.locator('#form-prod-price').fill('4');
  await page.locator('#form-prod-cost').fill('1');
  await page.locator('#form-prod-stock').fill('7');
  await page.locator('#form-submit-prod-btn').click();
  await page.waitForTimeout(500);
  const newProdId = await page.locator(V + '#inventory-table tbody tr').filter({ hasText: 'Polish Widget' }).getAttribute('id');
  check('F10: new product ID is prod-<uuid8> (not prod-NNNN)', /^inventory-row-prod-[0-9a-f]{8}$/.test(newProdId || ''), newProdId);

  /* ===== F10: new customer gets a UUID-based id ===== */
  await nav('customers');
  await page.waitForTimeout(400);
  await page.locator(V + '#add-customer-trigger-btn').click();
  await page.waitForSelector('#form-cust-name');
  await page.locator('#form-cust-name').fill('Polish Person');
  await page.locator('#form-submit-cust-btn').click();
  await page.waitForTimeout(500);
  // Seed customers are cust-1..4; a new one gets cust-<uuid8>. Assert such an id exists.
  const custIds = await page.$$eval('#desktop-view-container [id^="del-cust-"]', (els) => els.map((e) => e.id));
  const uuidCustId = custIds.find((id) => /^del-cust-cust-[0-9a-f]{8}$/.test(id));
  check('F10: new customer ID is cust-<uuid8>', !!uuidCustId, JSON.stringify(custIds));
  // cleanup customer
  if (uuidCustId) { await page.locator(`${V}[id="${uuidCustId}"]`).click(); await page.waitForTimeout(400); }

  /* ===== F19: low-stock badge readable (dark text on solid amber, no shimmer) ===== */
  await nav('register');
  await page.waitForSelector('#products-grid');
  // Matcha (stock 6, min 10) is low-stock → its tile shows the "Only X left" badge
  const badge = page.locator('#products-grid > div').filter({ hasText: 'Matcha' }).locator('span', { hasText: /left/i }).first();
  const styles = await badge.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, bg: s.backgroundColor, cls: el.className };
  }).catch(() => null);
  check('F19: low-stock badge uses solid amber + dark text, no shimmer', !!styles && !/shimmer/.test(styles.cls) && !/rgba\(.*0\.9\)/.test(styles.bg), JSON.stringify(styles));
  await shot(page, 'polish-01-lowstock-badge');

  // cleanup product
  await nav('inventory');
  await page.waitForTimeout(400);
  const widgetDel = page.locator(V + '#inventory-table tbody tr').filter({ hasText: 'Polish Widget' }).locator('button[title="Delete product"]');
  if (await widgetDel.count()) { await widgetDel.click(); await page.waitForTimeout(400); }

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors during polish verification', appErrors.length === 0, appErrors.slice(0, 4).join(' || '));
} catch (e) {
  check('polish verify crashed', false, e.message);
  await shot(page, 'polish-crash');
} finally {
  flush('polish');
  await context.close();
}
