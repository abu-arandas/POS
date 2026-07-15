import { launch, gotoApp, login, lock, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-b2');
dialogControl.mode = 'accept';
const MOCK = 'http://127.0.0.1:54321';
const mockState = async (t) => (await fetch(`${MOCK}/__state/${t}`)).json();

async function addProduct(name, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.locator('#products-grid > div').filter({ hasText: name }).first().click({ force: true });
    await page.waitForTimeout(200);
  }
}
async function cardSaleReceipt() {
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal');
  await page.locator('#pay-method-card').click();
  await page.getByRole('button', { name: /complete order/i }).click();
  await page.waitForSelector('#receipt-modal');
  const txt = await page.locator('#thermal-receipt').innerText();
  await page.getByRole('button', { name: /new sale/i }).click();
  await page.waitForTimeout(500);
  return txt;
}

try {
  await gotoApp(page);
  // F15 (dev): default-PIN hint shows in dev before login
  const lockTxt = await page.locator('#lockscreen-root').innerText();
  check('F15: default-PIN hint shown in DEV build', /1234/.test(lockTxt) && /5555/.test(lockTxt), '');

  await login(page, 'Admin', '1234');
  await page.waitForSelector('#register-root', { timeout: 15000 });

  /* ===== F8: unique hex receipt IDs ===== */
  await addProduct('Classic Espresso', 1);
  const r1 = await cardSaleReceipt();
  await addProduct('Caffe Latte', 1);
  const r2 = await cardSaleReceipt();
  const id1 = (r1.match(/TX-[0-9A-F]+/) || [''])[0];
  const id2 = (r2.match(/TX-[0-9A-F]+/) || [''])[0];
  check('F8: receipt IDs are TX-<8 hex>', /^TX-[0-9A-F]{8}$/.test(id1) && /^TX-[0-9A-F]{8}$/.test(id2), `${id1}, ${id2}`);
  check('F8: consecutive sales get distinct IDs (not TX-10001/2)', id1 !== id2 && !/TX-1000\d/.test(id1), `${id1} vs ${id2}`);

  /* ===== F14: full loyalty redemption → 'loyalty' payment ===== */
  await addProduct('Classic Espresso', 1);
  await page.locator('#cart-customer-header select').selectOption({ label: 'Sarah Jenkins' });
  await page.waitForTimeout(300);
  await page.locator('#cart-promos-box').getByRole('button', { name: /apply/i }).click();
  await page.waitForTimeout(300);
  const cartTotal = await page.locator('#cart-pricing-summary').innerText();
  check('F14: loyalty zeroes the total', /Total\s*\$?0\.00/i.test(cartTotal.replace(/\n/g, ' ')), cartTotal.replace(/\n/g, ' '));
  const rLoyal = await cardSaleReceipt();
  check('F14: $0 sale recorded as LOYALTY, not CARD', /METHOD:\s*LOYALTY/i.test(rLoyal.replace(/\n/g, ' ')) && !/METHOD:\s*CARD/i.test(rLoyal.replace(/\n/g, ' ')), (rLoyal.match(/METHOD:[^\n]*/i) || [''])[0]);
  await shot(page, 'b2-01-loyalty-receipt');

  // History shows the loyalty tx with an award icon row (payment column = loyalty)
  await page.locator('#nav-btn-history').click();
  await page.waitForSelector('#history-table');
  const histTxt = await page.locator('#history-table tbody').innerText();
  check('F14: History lists a loyalty-paid transaction', /loyalty/i.test(histTxt), '');

  /* ===== F1 app guard: empty pull must not wipe local data ===== */
  const productsBefore = await page.locator('#nav-btn-inventory').click().then(async () => {
    await page.waitForSelector('#inventory-table');
    return page.locator('#inventory-table tbody tr').count();
  });
  await page.locator('#nav-btn-settings').click();
  await page.waitForTimeout(400);
  await page.locator('#desktop-view-container').getByRole('button', { name: /supabase/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[type="url"]').fill(MOCK);
  await page.locator('input[type="password"]').fill('mock-anon-key');
  await page.getByRole('button', { name: /save config/i }).click();
  await page.waitForTimeout(300);
  const cloudProducts = (await mockState('products')).length;
  await page.getByRole('button', { name: /pull from cloud/i }).click();
  await page.waitForTimeout(2500);
  await page.locator('#nav-btn-inventory').click();
  await page.waitForSelector('#inventory-table');
  await page.waitForTimeout(400);
  const productsAfter = await page.locator('#inventory-table tbody tr').count();
  check('F1-guard: empty cloud (0 products) does NOT wipe local catalog', cloudProducts === 0 && productsAfter === productsBefore && productsAfter > 0, `before=${productsBefore} cloudProducts=${cloudProducts} after=${productsAfter}`);

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors during batch2 verification', appErrors.length === 0, appErrors.slice(0, 4).join(' || '));
} catch (e) {
  check('batch2 verify crashed', false, e.message);
  await shot(page, 'b2-crash');
} finally {
  flush('batch2');
  await context.close();
}
