import { launch, gotoApp, login, lock, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-main');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';

async function nav(id) {
  await page.locator(`#nav-btn-${id}`).click();
  await page.waitForTimeout(600);
}

try {
  await gotoApp(page);
  await page.waitForTimeout(1500);
  // Ensure we're Admin regardless of persisted session state
  if (await page.locator('#lockscreen-root').isVisible().catch(() => false)) {
    await login(page, 'Admin', '1234');
  } else {
    const who = await page.locator('#sidebar-user-card').innerText().catch(() => '');
    if (!/admin/i.test(who)) {
      await lock(page);
      await login(page, 'Admin', '1234');
    }
  }
  await page.waitForSelector(V + '#register-root', { timeout: 15000 });

  /* ===== CUSTOMERS: delete QA Tester precisely (shallow ancestor walk) ===== */
  await nav('customers');
  await page.waitForTimeout(600);
  const dir = page.locator(V + '#customer-directory-section');
  const delBtnId = await page.evaluate(() => {
    const scope = document.querySelector('#desktop-view-container');
    const btns = [...scope.querySelectorAll('[id^="del-cust-"]')];
    for (const b of btns) {
      let el = b.parentElement;
      for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
        const txt = el.textContent || '';
        if (txt.includes('QA Tester')) return b.id;
        if (/Sarah|Marcus|Olivia|David/.test(txt)) break; // walked into another row/list
      }
    }
    return null;
  });
  check('Located QA Tester delete control (row-scoped)', !!delBtnId, delBtnId || 'not found');
  if (delBtnId) {
    const before = dialogs.length;
    await page.locator(`${V}[id="${delBtnId}"]`).click();
    await page.waitForTimeout(600);
    const msg = dialogs.slice(-1)[0] || '';
    check(
      'Delete targets QA Tester and removes record',
      /QA Tester/.test(msg) && !/QA Tester/.test(await dir.innerText()) && dialogs.length > before,
      msg,
    );
  }

  /* ===== CASHIER override ===== */
  await lock(page);
  await login(page, 'Cashier', '0000');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  await nav('history');
  await page.waitForSelector(V + '#history-table', { timeout: 8000 });
  await page.locator(V + '#history-table tbody tr').filter({ hasText: /paid/i }).first().click();
  await page.waitForTimeout(500);
  await page.locator(V + '#refund-action-btn').click();
  await page.waitForTimeout(500);
  const overrideInput = page.locator('input[placeholder="••••"]');
  check('Cashier refund → manager-override PIN modal', await overrideInput.isVisible());
  await shot(page, '07e-01-override');

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
  await shot(page, '07e-02-authorized');

  /* ===== DASHBOARD + QR ===== */
  await lock(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  await nav('dashboard');
  await page.waitForTimeout(1500);
  const dashTxt = await page.locator('#desktop-view-container').innerText();
  check('Dashboard renders KPIs', /revenue/i.test(dashTxt) && /order/i.test(dashTxt));
  const svgCount = await page.locator(V + 'svg.recharts-surface').count();
  check('Dashboard charts render (recharts)', svgCount >= 2, `svg=${svgCount}`);
  await shot(page, '07e-03-dashboard');

  await nav('qrmenu');
  await page.waitForTimeout(700);
  const qrTxt = await page.locator('#desktop-view-container').innerText();
  const qrSvg = await page.locator(V + 'svg').count();
  check('QR Menu renders QR + :3001 link', qrSvg >= 1 && /:3001/.test(qrTxt), (qrTxt.match(/http[^\s]*/) || [''])[0]);
  await shot(page, '07e-04-qrmenu');

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors across screens', appErrors.length === 0, appErrors.slice(0, 5).join(' || '));
} catch (e) {
  check('Suite crashed', false, e.message);
  await shot(page, '07e-XX-crash');
} finally {
  flush('07e-screens');
  await context.close();
}
