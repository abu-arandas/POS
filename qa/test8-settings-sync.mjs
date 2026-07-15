import { launch, gotoApp, login, lock, typePin, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-main');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';
const MOCK = 'http://127.0.0.1:54321';
// The mock ignores auth; against a real project set SUPABASE_ANON_KEY in the env.
const ANON = process.env.SUPABASE_ANON_KEY || 'mock-anon-key';

async function nav(id) {
  await page.locator(`#nav-btn-${id}`).click();
  await page.waitForTimeout(600);
}
async function mockState(table) {
  return await (await fetch(`${MOCK}/__state/${table}`)).json();
}
async function mockLog() {
  return await (await fetch(`${MOCK}/__log`)).json();
}

try {
  await gotoApp(page);
  await page.waitForTimeout(1500);
  if (await page.locator('#lockscreen-root').isVisible().catch(() => false)) {
    await login(page, 'Admin', '1234');
  } else if (!/admin/i.test(await page.locator('#sidebar-user-card').innerText().catch(() => ''))) {
    await lock(page);
    await login(page, 'Admin', '1234');
  }
  await page.waitForSelector(V + '#register-root', { timeout: 15000 });

  /* ===== A. Store profile: live store-name update ===== */
  await nav('settings');
  await page.waitForTimeout(600);
  const nameInput = page.locator(V + 'input[type="text"]').first();
  await nameInput.fill('EA POS QA');
  await page.waitForTimeout(400);
  const brand = await page.locator('#brand-header').innerText();
  check('Store name edit updates sidebar live', /EA POS QA/.test(brand), brand.replace(/\n/g, ' '));
  await nameInput.fill('EA POS');
  await page.waitForTimeout(300);

  /* ===== B. Dark mode: class only applied on rehydrate (BUG) ===== */
  await page.locator('#sidebar-container').getByRole('button', { name: /dark ?mode/i }).click();
  await page.waitForTimeout(600);
  const darkImmediately = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check(
    'FINDING (bug): toggling Dark Mode does NOT apply .dark class in-session',
    darkImmediately === true,
    `html.dark right after toggle = ${darkImmediately}`,
  );
  await shot(page, '08-01a-dark-no-reload');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const darkAfterReload = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check('.dark IS applied after full reload (rehydrate-only wiring)', darkAfterReload === true, `after reload = ${darkAfterReload}`);
  await nav('settings');
  await page.waitForTimeout(600);
  const settingsBg = await page
    .locator(V + '.bg-white')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
    .catch(() => 'n/a');
  check(
    'FINDING: Settings panels stay WHITE even in real dark mode (missing dark: classes)',
    settingsBg !== 'rgb(255, 255, 255)',
    `panel bg in dark mode = ${settingsBg}`,
  );
  await shot(page, '08-01b-settings-darkmode');
  await page.locator('#sidebar-container').getByRole('button', { name: /light ?mode/i }).click();
  await page.waitForTimeout(400);

  /* ===== C. Arabic / RTL ===== */
  await page.locator(V + 'select').first().selectOption('ar');
  await page.waitForTimeout(800);
  const dir = await page.evaluate(() => document.documentElement.dir);
  const sidebarAr = await page.locator('#sidebar-navigation').innerText();
  check('Arabic switches document to RTL', dir === 'rtl', `dir=${dir}`);
  check('Sidebar labels localized to Arabic', /[؀-ۿ]/.test(sidebarAr), sidebarAr.split('\n')[0]);
  await shot(page, '08-02-arabic-rtl');
  await page.locator(V + 'select').first().selectOption('en');
  await page.waitForTimeout(600);

  /* ===== D. Supabase config: test connection ===== */
  await page.locator(V + '#settings-root, ' + V).getByRole('button', { name: /supabase/i }).first().click();
  await page.waitForTimeout(500);
  await page.locator(V + 'input[type="url"]').fill(MOCK);
  await page.locator(V + 'input[type="password"]').fill(ANON);
  await page.getByRole('button', { name: /save config/i }).click();
  await page.waitForTimeout(400);
  check('Save Config alert', /saved/i.test(dialogs.slice(-1)[0] || ''), dialogs.slice(-1)[0]);

  await page.getByRole('button', { name: /test connection/i }).click();
  await page.waitForTimeout(1500);
  check('Test Connection succeeds', /success/i.test(dialogs.slice(-1)[0] || ''), dialogs.slice(-1)[0]);
  const statusBadge = await page.locator(V + 'span').filter({ hasText: /status/i }).first().innerText();
  check('Status badge shows Connected', /connected/i.test(statusBadge), statusBadge);
  await shot(page, '08-03-connected');

  // enable live sync
  await page.locator(V + 'input[type="checkbox"]').check();
  await page.waitForTimeout(300);

  /* ===== E. Push All to cloud ===== */
  await page.getByRole('button', { name: /push/i }).click();
  await page.waitForTimeout(2500);
  check('Push All succeeds', /success|pushed/i.test(dialogs.slice(-1)[0] || ''), dialogs.slice(-1)[0]);
  const prods = await mockState('products');
  const users = await mockState('user_accounts');
  const txs = await mockState('transactions');
  const custs = await mockState('customers');
  const esp = prods.find((p) => p.id === 'prod-espresso');
  const sarah = custs.find((c) => c.name === 'Sarah Jenkins');
  check('Cloud now has full catalog incl. QA Test Widget', prods.length >= 12 && prods.some((p) => p.name === 'QA Test Widget'), `products=${prods.length}`);
  check('Cloud espresso stock matches local (115)', esp && Number(esp.stock) === 115, `stock=${esp?.stock}`);
  check('Cloud Sarah points = 59', sarah && Number(sarah.points) === 59, `points=${sarah?.points}`);
  check(
    'FINDING: user_accounts now MIXED — 3 plaintext (seeded) + 3 hashed (pushed)',
    users.length === 6 &&
      users.filter((u) => String(u.pin).length === 4).length === 3 &&
      users.filter((u) => String(u.pin).length === 64).length === 3,
    `users=${users.length}`,
  );
  check('Transactions pushed to cloud', txs.length > 50, `tx=${txs.length}`);

  /* ===== F. Live sale syncs incrementally ===== */
  await nav('register');
  await page.waitForTimeout(500);
  await page.locator(V + '#products-grid > div').filter({ hasText: 'Classic Espresso' }).first().click({ force: true });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal', { timeout: 5000 });
  await page.locator('#pay-method-card').click();
  await page.getByRole('button', { name: /complete order/i }).click();
  await page.waitForSelector('#receipt-modal', { timeout: 5000 });
  const receiptTxt = await page.locator('#thermal-receipt').innerText();
  const newTxId = (receiptTxt.match(/TX-\d+/) || [''])[0];
  await page.getByRole('button', { name: /new sale/i }).click();
  await page.waitForTimeout(2000);

  const txsAfter = await mockState('transactions');
  const prodsAfter = await mockState('products');
  const espAfter = prodsAfter.find((p) => p.id === 'prod-espresso');
  check(`Live sync: sale ${newTxId} pushed to cloud on checkout`, txsAfter.some((t) => t.id === newTxId), `cloud tx=${txsAfter.length}`);
  check('Live sync: espresso stock 115→114 in cloud', espAfter && Number(espAfter.stock) === 114, `stock=${espAfter?.stock}`);

  /* ===== G. Deletion gap: product delete never reaches cloud ===== */
  await nav('inventory');
  await page.waitForTimeout(600);
  const widgetRow = page.locator(V + '#inventory-table tbody tr').filter({ hasText: 'QA Test Widget' });
  await widgetRow.locator('button[title="Delete product"]').click();
  await page.waitForTimeout(800);
  check('QA Test Widget deleted locally', (await widgetRow.count()) === 0);
  const prodsAfterDelete = await mockState('products');
  const logEntries = await mockLog();
  check(
    'FINDING: deleted product STILL in cloud (no DELETE sync for products)',
    prodsAfterDelete.some((p) => p.name === 'QA Test Widget') &&
      !logEntries.some((l) => l.method === 'DELETE' && l.table === 'products'),
    `cloud products=${prodsAfterDelete.length}`,
  );

  /* ===== H. Pull From Cloud: resurrection + PIN lockout ===== */
  await nav('settings');
  await page.waitForTimeout(500);
  await page.locator(V).getByRole('button', { name: /supabase/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /pull from cloud/i }).click();
  await page.waitForTimeout(2500);
  check('Pull From Cloud succeeds (confirm + success alerts)', /success|replaced|pulled/i.test(dialogs.slice(-1)[0] || ''), dialogs.slice(-2).join(' | '));

  await nav('inventory');
  await page.waitForTimeout(600);
  check(
    'FINDING confirmed live: deleted product RESURRECTED by pull',
    (await page.locator(V + '#inventory-table tbody tr').filter({ hasText: 'QA Test Widget' }).count()) === 1,
  );
  await shot(page, '08-04-resurrected');

  // Lockscreen now lists 6 profiles; plaintext-PIN accounts cannot log in
  await lock(page);
  const profiles = await page.locator('#lockscreen-root button').filter({ hasText: /Role:/i }).allTextContents();
  check('FINDING: lockscreen now shows 6 profiles (3 unusable)', profiles.length === 6, JSON.stringify(profiles));
  await shot(page, '08-05-six-profiles');

  await page.locator('#lockscreen-root button').filter({ hasText: 'Admin Manager' }).first().click();
  await page.waitForTimeout(400);
  await typePin(page, '1234');
  await page.waitForTimeout(500);
  const pinErr = await page.getByText(/incorrect pin/i).isVisible().catch(() => false);
  check(
    'CRITICAL confirmed: seeded account "Admin Manager" PIN 1234 REJECTED (plaintext vs hash)',
    pinErr,
  );
  await shot(page, '08-06-lockout');

  // hashed account still works → recover
  await page.getByRole('button', { name: /back/i }).click();
  await page.waitForTimeout(300);
  await page
    .locator('#lockscreen-root button')
    .filter({ hasText: 'Admin' })
    .filter({ hasNotText: 'Manager' })
    .first()
    .click();
  await page.waitForTimeout(400);
  await typePin(page, '1234');
  await page.waitForTimeout(700);
  const unlocked = await page.locator('#sidebar-container').isVisible().catch(() => false);
  check('Recovery: original hashed "Admin" account still logs in', unlocked);

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors during sync suite', appErrors.length === 0, appErrors.slice(0, 5).join(' || '));
} catch (e) {
  check('Suite crashed', false, e.message);
  await shot(page, '08-XX-crash');
} finally {
  flush('08-settings-sync');
  await context.close();
}
