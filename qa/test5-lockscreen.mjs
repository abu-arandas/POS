import { launch, gotoApp, login, lock, typePin, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors } = await launch('./profile-main');

try {
  await gotoApp(page);
  await page.waitForSelector('#lockscreen-root', { timeout: 15000 });
  await shot(page, '05-01-lockscreen-users');

  // 1) Three default active users listed
  const userCards = page.locator('#lockscreen-root button').filter({ hasText: /Role:/i });
  const names = await userCards.allTextContents();
  check(
    'Lockscreen lists 3 default users (Admin/Manager/Cashier)',
    names.length === 3 && /Admin/.test(names.join()) && /Manager/.test(names.join()) && /Cashier/.test(names.join()),
    JSON.stringify(names),
  );

  // 2) Default PIN hints are shown on the lockscreen (security observation)
  const hint = await page.locator('#lockscreen-root').innerText();
  check('Default PINs are printed on lockscreen (finding: info disclosure)', /1234/.test(hint) && /5555/.test(hint) && /0000/.test(hint));

  // 3) Wrong PIN shows error, stays locked
  await page.locator('#lockscreen-root button').filter({ hasText: 'Admin' }).first().click();
  await page.waitForTimeout(400);
  await typePin(page, '9999');
  await page.waitForTimeout(400);
  const errVisible = await page.getByText(/incorrect pin/i).isVisible().catch(() => false);
  const stillLocked = await page.locator('#lockscreen-root').isVisible();
  check('Wrong PIN (9999) shows error and stays locked', errVisible && stillLocked);
  await shot(page, '05-02-wrong-pin');

  // 4) Correct Admin PIN 1234 unlocks; role chip + nav items
  await typePin(page, '1234');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  const navIds = await page.locator('#sidebar-navigation button').evaluateAll((els) => els.map((e) => e.id));
  check(
    'Admin login (1234) → all 7 nav items',
    navIds.length === 7 && navIds.includes('nav-btn-settings'),
    JSON.stringify(navIds),
  );
  await shot(page, '05-03-admin-register');

  // 5) Lock, login as Cashier 0000 → restricted nav (register + transactions only)
  await lock(page);
  await login(page, 'Cashier', '0000');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  const cashierNav = await page.locator('#sidebar-navigation button').evaluateAll((els) => els.map((e) => e.id));
  check(
    'Cashier login (0000) → only register + transactions',
    cashierNav.length === 2 && cashierNav.includes('nav-btn-register') && cashierNav.includes('nav-btn-history'),
    JSON.stringify(cashierNav),
  );
  await shot(page, '05-04-cashier-nav');

  // 6) Manager 5555 → everything except settings
  await lock(page);
  await login(page, 'Manager', '5555');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  const mgrNav = await page.locator('#sidebar-navigation button').evaluateAll((els) => els.map((e) => e.id));
  check(
    'Manager login (5555) → 6 nav items, no settings',
    mgrNav.length === 6 && !mgrNav.includes('nav-btn-settings'),
    JSON.stringify(mgrNav),
  );

  // 7) Sidebar dark mode label copy check ("DarkMode" typo)
  const sidebarText = await page.locator('#sidebar-container').innerText();
  check('Copy check: "Dark Mode" label spelled correctly', !/DarkMode\b/.test(sidebarText), 'found: ' + (sidebarText.match(/Dark ?Mode/g) || []).join(','));

  // 8) Back to Admin for subsequent suites
  await lock(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });

  check('No console/page errors during lockscreen suite', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));
} catch (e) {
  check('Suite crashed', false, e.message);
  await shot(page, '05-XX-crash');
} finally {
  flush('05-lockscreen');
  await context.close();
}
