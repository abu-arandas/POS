import { launch, gotoApp, shot, check, flush } from './helpers.mjs';

const { context, page, consoleErrors, dialogs, dialogControl } = await launch('./profile-main');
const money = (s) => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));

async function addProduct(name, times = 1) {
  for (let i = 0; i < times; i++) {
    await page
      .locator('#desktop-view-container #products-grid > div')
      .filter({ hasText: name })
      .first()
      .click({ force: true }); // cards are aria-disabled (dnd-kit) — a11y finding
    await page.waitForTimeout(200);
  }
}
async function cartSummary() {
  const txt = await page.locator('#desktop-view-container #cart-pricing-summary').innerText();
  return txt;
}
async function readTotal() {
  const t = await page.locator('#desktop-view-container #cart-pricing-summary').innerText();
  const m = t.match(/(?:^|\n)Total\s*\n?\$([0-9.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}
async function closeReceipt() {
  await page.getByRole('button', { name: /new sale/i }).click();
  await page.waitForSelector('#receipt-modal', { state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
}

try {
  await gotoApp(page);
  // Session persists from suite 5 (Admin logged in)
  await page.waitForSelector('#desktop-view-container #register-root', { timeout: 15000 });

  const ariaDisabledCount = await page
    .locator('#desktop-view-container #products-grid > div[aria-disabled="true"]')
    .count()
    .catch(() => 0);
  check(
    'FINDING (a11y): product cards expose aria-disabled="true" outside edit mode',
    ariaDisabledCount === 0,
    `${ariaDisabledCount} cards aria-disabled`,
  );

  // Snapshot espresso stock before sales (from persisted store)
  const stockBefore = await page.evaluate(async () => {
    const { get } = await import('https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm').catch(() => ({}));
    return null; // fallback below
  }).catch(() => null);

  // 1) Add items: 2x Espresso (3.25), 1x Latte (4.50) → subtotal 11.00
  await addProduct('Classic Espresso', 2);
  await addProduct('Caffe Latte', 1);
  const sum1 = await cartSummary();
  check('Cart subtotal = $11.00 (2×3.25 + 4.50)', /11\.00/.test(sum1), sum1.replace(/\n/g, ' '));

  // 2) Tax silently added: total should be 11.94 (8.5% tax) but NO tax row shown
  const total1 = await readTotal();
  check('Total includes 8.5% tax → $11.94', Math.abs(total1 - 11.94) < 0.001, `total=${total1}`);
  check(
    'FINDING: tax line is NOT itemized in cart summary',
    !/tax/i.test(sum1),
    'cart summary text: ' + sum1.replace(/\n/g, ' '),
  );
  await shot(page, '06-01-cart-11');

  // 3) Qty minus: espresso row - decrease → subtotal 7.75, then plus back
  const espRow = page.locator('#desktop-view-container #cart-items-container > div').filter({ hasText: 'Classic Espresso' });
  await espRow.locator('button').nth(0).click(); // minus
  await page.waitForTimeout(200);
  let t2 = await readTotal();
  check('Qty − works (total drops to $8.41)', Math.abs(t2 - 8.41) < 0.011, `total=${t2}`);
  await espRow.locator('button').nth(1).click(); // plus
  await page.waitForTimeout(200);

  // 4) Percentage discount 10% → discount 1.10, total 10.74
  await page.getByRole('button', { name: /Add %/i }).click();
  await page.locator('#desktop-view-container #cart-promos-box input[type="number"]').fill('10');
  await page.locator('#desktop-view-container #cart-promos-box').getByRole('button', { name: /apply/i }).click();
  await page.waitForTimeout(300);
  const sum2 = await cartSummary();
  const total2 = await readTotal();
  check('10% discount → -$1.10 shown', /1\.10/.test(sum2), sum2.replace(/\n/g, ' '));
  check('Discounted+taxed total = $10.74', Math.abs(total2 - 10.74) < 0.001, `total=${total2}`);
  await shot(page, '06-02-discount10');

  // 5) Checkout with card
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal', { timeout: 5000 });
  const modalTxt = await page.locator('#payment-modal').innerText();
  check('Payment modal shows amount $10.74', /10\.74/.test(modalTxt));
  await page.locator('#pay-method-card').click();
  await page.getByRole('button', { name: /complete order/i }).click();
  await page.waitForSelector('#receipt-modal', { timeout: 5000 });
  const receipt = await page.locator('#thermal-receipt').innerText();
  check('Receipt shows subtotal 11.00, discount 1.10, total 10.74',
    /11\.00/.test(receipt) && /1\.10/.test(receipt) && /10\.74/.test(receipt),
    receipt.replace(/\n/g, ' | ').slice(0, 300));
  check('FINDING: receipt has NO tax line (tax charged but hidden)', !/tax/i.test(receipt));
  check('FINDING: receipt operator hardcoded "Admin"', /OPERATOR:\s*Admin/i.test(receipt.replace(/\n/g, ' ')));
  const rcptId = (receipt.match(/TX-\d+/) || [null])[0];
  await shot(page, '06-03-receipt');
  await closeReceipt();

  // 6) Stock decremented: espresso card should show stock reduced by 2 (via cart limit check later in inventory suite)

  // 7) Cash flow: 1x Espresso → total 3.53; insufficient cash disables button; pay $5 → change 1.47
  await addProduct('Classic Espresso', 1);
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal', { timeout: 5000 });
  await page.locator('#pay-method-cash').click();
  await page.waitForTimeout(300);
  const completeBtn = page.getByRole('button', { name: /complete order/i });
  check('Cash: complete disabled with empty tendered', await completeBtn.isDisabled());
  await page.locator('#payment-modal input[type="number"]').fill('2');
  check('Cash: complete disabled when tendered < total', await completeBtn.isDisabled());
  await page.locator('#payment-modal input[type="number"]').fill('5');
  await page.waitForTimeout(200);
  const changeTxt = await page.locator('#payment-modal').innerText();
  check('Cash: change due $1.47 on $5 for $3.53', /1\.47/.test(changeTxt), changeTxt.match(/RETURN[^$]*\$[0-9.]+/i)?.[0] || '');
  await shot(page, '06-04-cash');
  await completeBtn.click();
  await page.waitForSelector('#receipt-modal', { timeout: 5000 });
  const receipt2 = await page.locator('#thermal-receipt').innerText();
  check('Cash receipt shows tendered 5.00 / change 1.47', /5\.00/.test(receipt2) && /1\.47/.test(receipt2));
  await closeReceipt();

  // 8) Loyalty: link Sarah Jenkins (124 pts), 1x Espresso, apply loyalty → free sale ($0.00)
  await addProduct('Classic Espresso', 1);
  await page.locator('#desktop-view-container #cart-customer-header select').selectOption({ label: 'Sarah Jenkins' });
  await page.waitForTimeout(300);
  const loyaltyBox = await page.locator('#desktop-view-container #cart-promos-box').innerText();
  check('Loyalty banner offers saving $3.25 (65 pts × $0.05)', /3\.25/.test(loyaltyBox), loyaltyBox.replace(/\n/g, ' '));
  await page.locator('#desktop-view-container #cart-promos-box').getByRole('button', { name: /apply/i }).click();
  await page.waitForTimeout(300);
  const totalLoyal = await readTotal();
  check('EDGE: loyalty discount can zero the sale → total $0.00', Math.abs(totalLoyal - 0) < 0.001, `total=${totalLoyal}`);
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.waitForSelector('#payment-modal', { timeout: 5000 });
  await page.locator('#pay-method-card').click();
  await page.getByRole('button', { name: /complete order/i }).click();
  await page.waitForSelector('#receipt-modal', { timeout: 5000 });
  const receipt3 = await page.locator('#thermal-receipt').innerText();
  check('EDGE: $0.00 card sale completes (no minimum guard)', /\$0\.00/.test(receipt3));
  await shot(page, '06-05-zero-sale');
  await closeReceipt();

  // 9) Sarah's points after: 124 - 65 + floor(0*1) = 59 → verify in cart header after relink
  await addProduct('Caffe Latte', 1);
  await page.locator('#desktop-view-container #cart-customer-header select').selectOption({ label: 'Sarah Jenkins' });
  await page.waitForTimeout(300);
  const custHdr = await page.locator('#desktop-view-container #cart-customer-header').innerText();
  check('Loyalty points deducted correctly (124→59)', /\b59\b/.test(custHdr), custHdr.replace(/\n/g, ' '));
  // clear cart
  await page.locator('#cart-pricing-summary button[title="Clear entire cart"]').click();
  await page.waitForTimeout(200);
  const emptyCart = await page.locator('#desktop-view-container #cart-items-container').innerText();
  check('Clear cart empties items', /empty/i.test(emptyCart), emptyCart.trim());

  check('No unexpected dialogs', dialogs.length === 0, dialogs.join(' || '));
  const appErrors = consoleErrors.filter((e) => !/ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/i.test(e));
  check('No app console/page errors (excluding blocked image CDN)', appErrors.length === 0, appErrors.slice(0, 5).join(' || '));
} catch (e) {
  check('Suite crashed', false, e.message);
  await shot(page, '06-XX-crash');
} finally {
  flush('06-register');
  await context.close();
}
