// Verifies F9 (admin UIs): user management + printer config in Settings.
// Requires the app running on :3000. Run from qa/ (node_modules symlinked).
import { launch, gotoApp, login, lock, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-f9');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';

async function openSettingsTab(name) {
  await page.locator('#nav-btn-settings').click();
  await page.waitForTimeout(500);
  await page.locator(V).getByRole('button', { name }).first().click();
  await page.waitForTimeout(400);
}

try {
  await gotoApp(page);
  await login(page, 'Admin', '1234');
  await page.waitForSelector('#sidebar-container', { timeout: 15000 });

  /* ===== Users tab lists default staff ===== */
  await openSettingsTab(/^users$/i);
  const listTxt = await page.locator(V + '[id^="user-row-"]').allInnerTexts();
  check('F9a: Users tab lists 3 default staff', listTxt.length === 3 && /Admin/.test(listTxt.join()) && /Manager/.test(listTxt.join()) && /Cashier/.test(listTxt.join()), `rows=${listTxt.length}`);
  await shot(page, 'f9-01-users-list');

  /* ===== PIN validation ===== */
  await page.locator('#add-user-btn').click();
  await page.waitForSelector('#user-modal');
  await page.locator('#user-name-input').fill('QA Clerk');
  await page.locator('#user-role-select').selectOption('cashier');
  await page.locator('#user-pin-input').fill('432');
  const dBefore = dialogs.length;
  await page.locator('#user-save-btn').click();
  await page.waitForTimeout(400);
  check('F9a: 3-digit PIN rejected (pinMustBe4)', dialogs.length > dBefore && /4 digits/i.test(dialogs.slice(-1)[0]) && (await page.locator('#user-modal').isVisible()), dialogs.slice(-1)[0]);

  /* ===== Add a real user ===== */
  await page.locator('#user-pin-input').fill('4321');
  await page.locator('#user-save-btn').click();
  await page.waitForTimeout(600);
  const afterAdd = await page.locator(V + '[id^="user-row-"]').allInnerTexts();
  check('F9a: new user "QA Clerk" (cashier) added', afterAdd.length === 4 && /QA Clerk/.test(afterAdd.join()), `rows=${afterAdd.length}`);
  await shot(page, 'f9-02-user-added');

  /* ===== Hashed-PIN round-trip: log in as the new user ===== */
  await lock(page);
  const clerkVisible = await page.locator('#lockscreen-root button').filter({ hasText: 'QA Clerk' }).isVisible();
  check('F9a: new user appears on lockscreen', clerkVisible);
  await login(page, 'QA Clerk', '4321');
  await page.waitForSelector('#sidebar-container', { timeout: 8000 });
  const clerkNav = await page.locator('#sidebar-navigation button').evaluateAll((els) => els.map((e) => e.id));
  check('F9a: QA Clerk logs in with 4321 and gets cashier nav (register+transactions)', clerkNav.length === 2 && clerkNav.includes('nav-btn-register') && clerkNav.includes('nav-btn-history'), JSON.stringify(clerkNav));

  /* ===== Edit user: promote to manager ===== */
  await lock(page);
  await login(page, 'Admin', '1234');
  await openSettingsTab(/^users$/i);
  const clerkRow = page.locator(V + '[id^="user-row-"]').filter({ hasText: 'QA Clerk' });
  await clerkRow.getByTitle(/edit/i).click();
  await page.waitForSelector('#user-modal');
  await page.locator('#user-role-select').selectOption('manager');
  await page.locator('#user-save-btn').click();
  await page.waitForTimeout(500);
  const promoted = (await page.locator(V + '[id^="user-row-"]').filter({ hasText: 'QA Clerk' }).innerText()).replace(/\n/g, ' ');
  check('F9a: edit promotes QA Clerk to manager', /manager/i.test(promoted), promoted);

  /* ===== Guard: cannot delete self / last admin ===== */
  const adminRow = page.locator(V + '[id^="user-row-"]').filter({ hasText: 'Admin' }).first();
  const dSelf = dialogs.length;
  await adminRow.getByTitle('Delete').click();
  await page.waitForTimeout(400);
  const adminStill = await page.locator(V + '[id^="user-row-"]').filter({ hasText: 'Admin' }).count();
  check('F9a: cannot delete the signed-in / last admin account', dialogs.length > dSelf && /cannot delete|admin account is required/i.test(dialogs.slice(-1)[0]) && adminStill >= 1, dialogs.slice(-1)[0]);

  /* ===== Delete the clerk ===== */
  await clerkRow.getByTitle('Delete').click();
  await page.waitForTimeout(600);
  const afterDel = await page.locator(V + '[id^="user-row-"]').allInnerTexts();
  check('F9a: delete removes QA Clerk', afterDel.length === 3 && !/QA Clerk/.test(afterDel.join()), `rows=${afterDel.length}`);

  /* ===== Printer tab: edit + persist across reload ===== */
  await openSettingsTab(/^printer$/i);
  await page.locator('#printer-type').selectOption('network');
  await page.waitForTimeout(200);
  const ipVisible = await page.locator(V + 'input[placeholder="192.168.1.50"]').isVisible();
  check('F9b: network type reveals IP address field', ipVisible);
  await page.locator(V + 'input[placeholder="192.168.1.50"]').fill('10.0.0.42');
  await page.locator('#printer-type').selectOption('system');
  await page.waitForTimeout(150);
  await page.locator(V + 'select').nth(1).selectOption('58mm'); // paper size = 2nd select in printer panel
  await page.locator(V + 'input[type="text"]').last().fill('QA Footer Line');
  await shot(page, 'f9-03-printer');
  await page.locator('#save-printer-btn').click();
  await page.waitForTimeout(400);
  check('F9b: save printer shows confirmation', /printer settings saved/i.test(dialogs.slice(-1)[0] || ''), dialogs.slice(-1)[0]);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openSettingsTab(/^printer$/i);
  const paperVal = await page.locator(V + 'select').nth(1).inputValue();
  const footerVal = await page.locator(V + 'input[type="text"]').last().inputValue();
  check('F9b: printer settings persist across reload', paperVal === '58mm' && footerVal === 'QA Footer Line', `paper=${paperVal} footer="${footerVal}"`);

  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors during F9 verification', appErrors.length === 0, appErrors.slice(0, 4).join(' || '));
} catch (e) {
  check('F9 verify crashed', false, e.message);
  await shot(page, 'f9-crash');
} finally {
  flush('f9');
  await context.close();
}
