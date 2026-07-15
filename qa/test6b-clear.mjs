import { launch, gotoApp, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs } = await launch('./profile-main');

try {
  await gotoApp(page);
  await page.waitForSelector('#desktop-view-container #register-root', { timeout: 15000 });

  // Cart should still hold the Caffe Latte from the interrupted run (persisted? no — cart is component state, so it resets on reload)
  const cartTxt = await page.locator('#desktop-view-container #cart-items-container').innerText();
  check(
    'FINDING: cart is component state — lost on reload/refresh mid-sale',
    /empty/i.test(cartTxt),
    'cart after reload: ' + cartTxt.trim().replace(/\n/g, ' '),
  );

  // Add one item then clear cart via desktop button
  await page
    .locator('#desktop-view-container #products-grid > div')
    .filter({ hasText: 'Caffe Latte' })
    .first()
    .click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('#desktop-view-container #cart-pricing-summary button[title="Clear entire cart"]').click();
  await page.waitForTimeout(300);
  const cleared = await page.locator('#desktop-view-container #cart-items-container').innerText();
  check('Clear cart empties items', /empty/i.test(cleared), cleared.trim().replace(/\n/g, ' '));

  // Dual-mount evidence: same-id elements rendered twice (mobile + desktop)
  const dupCounts = {};
  for (const id of ['register-root', 'cart-section', 'products-grid', 'catalog-section']) {
    dupCounts[id] = await page.locator(`[id="${id}"]`).count();
  }
  check(
    'FINDING: duplicate element IDs — every screen mounted twice (mobile + desktop shells)',
    Object.values(dupCounts).every((c) => c === 1),
    JSON.stringify(dupCounts),
  );

  check('No unexpected dialogs', dialogs.length === 0, dialogs.join(' || '));
  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors (excluding blocked image CDN)', appErrors.length === 0, appErrors.slice(0, 5).join(' || '));
} catch (e) {
  check('Suite crashed', false, e.message);
} finally {
  flush('06b-clear');
  await context.close();
}
