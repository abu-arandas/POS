import { launch, gotoApp, typePin, shot, check, flush } from './helpers.mjs';

const { context, page, dialogs, dialogControl } = await launch('./profile-main');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';
const MOCK = 'http://127.0.0.1:54321';

try {
  await gotoApp(page);
  await page.waitForTimeout(1500);

  // We were left on the lockscreen with 6 profiles. Log in with the HASHED Admin (u-1).
  await page.waitForSelector('#lockscreen-root', { timeout: 15000 });
  await page
    .locator('#lockscreen-root button')
    .filter({ hasText: 'Admin' })
    .filter({ hasNotText: 'Manager' })
    .first()
    .click();
  await page.waitForTimeout(400);
  await typePin(page, '1234');
  await page.waitForTimeout(800);
  check('Recovery: hashed "Admin" account still logs in after pull', await page.locator('#sidebar-container').isVisible());

  /* ---- Cleanup: remove plaintext users + QA widget from mock, pull again ---- */
  const prods = await (await fetch(`${MOCK}/__state/products`)).json();
  const widget = prods.find((p) => p.name === 'QA Test Widget');
  if (widget) await fetch(`${MOCK}/rest/v1/products?id=in.(${widget.id})`, { method: 'DELETE' });
  await fetch(`${MOCK}/rest/v1/user_accounts?id=in.(user-admin,user-manager,user-cashier)`, { method: 'DELETE' });

  await page.locator('#nav-btn-settings').click();
  await page.waitForTimeout(700);
  await page.locator(V).getByRole('button', { name: /supabase/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /pull from cloud/i }).click();
  await page.waitForTimeout(2500);
  check('Cleanup pull succeeds', /replaced/i.test(dialogs.slice(-1)[0] || ''), dialogs.slice(-1)[0]);

  // Disable live sync so the app doesn't point at a dead localhost endpoint later
  await page.locator(V + 'input[type="checkbox"]').uncheck();
  await page.waitForTimeout(400);

  // Final state assertions
  await page.locator('#nav-btn-inventory').click();
  await page.waitForTimeout(700);
  const rows = await page.locator(V + '#inventory-table tbody tr').count();
  const widgetGone = (await page.locator(V + '#inventory-table tbody tr').filter({ hasText: 'QA Test Widget' }).count()) === 0;
  const espTxt = (await page.locator(V + '#inventory-table tbody tr').filter({ hasText: 'Classic Espresso' }).innerText()).replace(/\n/g, ' ');
  check('Final: 11 catalog products, QA widget removed', rows === 11 && widgetGone, `rows=${rows}`);
  check('Final: espresso stock consistent (115)', /\b115\b/.test(espTxt), espTxt);

  // Lockscreen back to 3 hashed profiles
  await page.locator('#sidebar-user-card button[title="Lock POS Screen"]').click();
  await page.waitForTimeout(600);
  const profiles = await page.locator('#lockscreen-root button').filter({ hasText: /Role:/i }).allTextContents();
  check('Final: lockscreen back to 3 working profiles', profiles.length === 3, JSON.stringify(profiles));
  await shot(page, '08-07-final-state');
} catch (e) {
  check('Recovery suite crashed', false, e.message);
  await shot(page, '08b-XX-crash');
} finally {
  flush('08b-recovery');
  await context.close();
}
