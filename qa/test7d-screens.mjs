import { launch, gotoApp, login, lock, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-main');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';

async function nav(id) {
  await page.locator(`#nav-btn-${id}`).click();
  await page.waitForTimeout(600);
}
const invRow = (name) => page.locator(V + '#inventory-table tbody tr').filter({ hasText: name });

try {
  await gotoApp(page);
  await page.waitForSelector(V + '#register-root', { timeout: 15000 });

  /* ===== CUSTOMERS: delete QA Tester (created in prior run, 100 pts) ===== */
  await nav('customers');
  await page.waitForTimeout(600);
  const dir = page.locator(V + '#customer-directory-section');
  const delBtnId = await page.evaluate(() => {
    const scope = document.querySelector('#desktop-view-container');
    const btns = [...scope.querySelectorAll('[id^="del-cust-"]')];
    for (const b of btns) {
      let el = b;
      for (let i = 0; i < 8 && el; i++) {
        el = el.parentElement;
        if (el && el.textContent.includes('QA Tester')) return b.id;
      }
    }
    return null;
  });
  check('Located QA Tester delete control', !!delBtnId, delBtnId || 'not found');
  const delCount = dialogs.length;
  await page.locator(`${V}[id="${delBtnId}"]`).click();
  await page.waitForTimeout(600);
  check(
    'Delete customer removes record (confirm accepted)',
    !/QA Tester/.test(await dir.innerText()) && dialogs.length > delCount,
    dialogs.slice(-1)[0] || 'no dialog',
  );

  /* ===== HISTORY: admin refund + stock restore + bulk delete ===== */
  await nav('history');
  await page.waitForSelector(V + '#history-table', { timeout: 8000 });

  const cashRow = page.locator(V + '#history-table tbody tr').filter({ hasText: '3.53' }).first();
  const cashRowId = await cashRow.getAttribute('id');
  await cashRow.click();
  await page.waitForTimeout(500);
  const receiptPanel = await page.locator(V + '#receipt-view-section').innerText();
  check('Row click opens audit receipt', /3\.53/.test(receiptPanel), cashRowId || '');
  check(
    'Audit receipt itemizes TAX (register receipt does not — inconsistent)',
    /tax/i.test(receiptPanel),
    (receiptPanel.match(/tax[^\n]*/i) || [''])[0],
  );

  const espStockBefore = await (async () => {
    await nav('inventory');
    await page.waitForTimeout(400);
    const txt = (await invRow('Classic Espresso').innerText()).replace(/\n/g, ' ');
    const m = txt.match(/\b(\d{2,3})\s*GOOD LEVEL/i) || txt.match(/\$0\.65\s*\d+%?\s*(\d+)/);
    await nav('history');
    await page.waitForTimeout(400);
    return m ? parseInt(m[1]) : NaN;
  })();

  await page.locator(`${V}[id="${cashRowId}"]`).click();
  await page.waitForTimeout(400);
  const dlgBefore = dialogs.length;
  await page.locator(V + '#refund-action-btn').click();
  await page.waitForTimeout(700);
  check('Admin refund: confirm accepted', dialogs.length > dlgBefore, dialogs.slice(-1)[0]);
  const rowAfter = (await page.locator(`${V}[id="${cashRowId}"]`).innerText()).replace(/\n/g, ' ');
  check('Transaction marked REFUNDED', /refunded/i.test(rowAfter), rowAfter);
  await shot(page, '07d-01-refunded');

  await nav('inventory');
  await page.waitForTimeout(500);
  const espAfterTxt = (await invRow('Classic Espresso').innerText()).replace(/\n/g, ' ');
  const espAfter = parseInt((espAfterTxt.match(/\b(\d{2,3})\s*GOOD LEVEL/i) || [])[1] || 'NaN');
  check(
    `Refund restores stock (+1: ${espStockBefore} → ${espStockBefore + 1})`,
    espAfter === espStockBefore + 1,
    `before=${espStockBefore} after=${espAfter}`,
  );
  await nav('history');
  await page.waitForTimeout(500);

  const refRow = page.locator(`${V}[id="${cashRowId}"]`);
  await refRow.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(300);
  await page.locator(V + '#transaction-list-section').getByRole('button', { name: /delete/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /delete now/i }).click();
  await page.waitForTimeout(600);
  check('Bulk delete removes transaction', (await page.locator(`${V}[id="${cashRowId}"]`).count()) === 0);

  /* ===== CASHIER: manager override for refunds ===== */
  await lock(page);
  await login(page, 'Cashier', '0000');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  await nav('history');
  await page.waitForSelector(V + '#history-table', { timeout: 8000 });
  await page.locator(V + '#history-table tbody tr').filter({ hasText: /completed/i }).first().click();
  await page.waitForTimeout(500);
  await page.locator(V + '#refund-action-btn').click();
  await page.waitForTimeout(500);
  const overrideInput = page.locator('input[placeholder="••••"]');
  check('Cashier refund → manager-override PIN modal', await overrideInput.isVisible());
  await shot(page, '07d-02-override');

  await overrideInput.fill('0000');
  await page.getByRole('button', { name: /authorize/i }).click();
  await page.waitForTimeout(500);
  const invalidShown = await page.getByText(/invalid/i).first().isVisible().catch(() => false);
  check('Cashier PIN 0000 rejected for override', invalidShown && (await overrideInput.isVisible()));

  await overrideInput.fill('5555');
  const dCount = dialogs.length;
  await page.getByRole('button', { name: /authorize/i }).click();
  await page.waitForTimeout(800);
  check('Manager PIN 5555 authorizes refund', dialogs.length > dCount, dialogs.slice(-1)[0]);

  /* ===== DASHBOARD + QR MENU ===== */
  await lock(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  await nav('dashboard');
  await page.waitForTimeout(1500);
  const dashTxt = await page.locator('#desktop-view-container').innerText();
  check('Dashboard renders KPIs', /revenue/i.test(dashTxt) && /order/i.test(dashTxt));
  const svgCount = await page.locator(V + 'svg.recharts-surface').count();
  check('Dashboard charts render (recharts)', svgCount >= 2, `svg=${svgCount}`);
  await shot(page, '07d-03-dashboard');

  await nav('qrmenu');
  await page.waitForTimeout(700);
  const qrTxt = await page.locator('#desktop-view-container').innerText();
  const qrSvg = await page.locator(V + 'svg').count();
  check('QR Menu renders QR + :3001 link', qrSvg >= 1 && /:3001/.test(qrTxt), (qrTxt.match(/http[^\s]*/) || [''])[0]);
  await shot(page, '07d-04-qrmenu');

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors across screens', appErrors.length === 0, appErrors.slice(0, 5).join(' || '));
} catch (e) {
  check('Suite crashed', false, e.message);
  await shot(page, '07d-XX-crash');
} finally {
  flush('07d-screens');
  await context.close();
}
