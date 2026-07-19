import { test, expect, type Page } from '@playwright/test';

// Signs in through the PIN lockscreen as one of the seeded staff accounts.
// The PIN auto-submits once the fourth digit is entered.
async function login(page: Page, name: string, pin: string) {
  await expect(page.locator('#lockscreen-root')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  for (const digit of pin.split('')) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(page.locator('#register-root')).toBeVisible();
}

// Adds a product to the cart. The card's inner text is pointer-events-none
// (the card itself handles the click), so target the card container by name.
async function addProduct(page: Page, name: string) {
  await page.locator('#products-grid > div').filter({ hasText: name }).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('admin logs in and the register loads with the seeded catalog', async ({ page }) => {
  await login(page, 'Admin', '1234');
  // An admin can reach every screen, including Settings.
  await expect(page.locator('#nav-btn-settings')).toBeVisible();
  await expect(page.getByText('Classic Espresso')).toBeVisible();
});

test('a card sale produces a receipt with the taxed total', async ({ page }) => {
  await login(page, 'Admin', '1234');

  await addProduct(page, 'Classic Espresso'); // $3.25
  const cart = page.locator('#cart-section');
  await expect(cart.getByText('Classic Espresso')).toBeVisible();

  await cart.getByRole('button', { name: /Checkout/i }).click();
  await expect(page.locator('#payment-modal')).toBeVisible();

  // Card is the default tender — no cash amount required.
  await page.getByRole('button', { name: /Complete Order/i }).click();

  const receipt = page.locator('#receipt-modal');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByText(/Payment Successful/i)).toBeVisible();
  await expect(receipt.getByText(/TX-/).first()).toBeVisible();
  // 3.25 + 8.5% tax (0.28) = 3.53
  await expect(receipt.getByText('$3.53').first()).toBeVisible();
});

test('a cash sale calculates change before completing', async ({ page }) => {
  await login(page, 'Admin', '1234');

  await addProduct(page, 'Caffe Latte'); // $4.50
  const cart = page.locator('#cart-section');
  await cart.getByRole('button', { name: /Checkout/i }).click();
  await expect(page.locator('#payment-modal')).toBeVisible();

  await page.locator('#pay-method-cash').click();
  await page.locator('#payment-modal input[type="number"]').first().fill('10');
  // 10.00 − (4.50 + 8.5% tax 0.38 = 4.88) = 5.12 change due
  await expect(page.locator('#payment-modal')).toContainText('5.12');

  await page.getByRole('button', { name: /Complete Order/i }).click();
  await expect(page.locator('#receipt-modal').getByText(/TX-/).first()).toBeVisible();
});

test('a cashier cannot see manager-only navigation', async ({ page }) => {
  await login(page, 'Cashier', '0000');
  // Register and history stay available to cashiers…
  await expect(page.locator('#nav-btn-register')).toBeVisible();
  // …but the access map hides Settings and the Dashboard from them.
  await expect(page.locator('#nav-btn-settings')).toHaveCount(0);
  await expect(page.locator('#nav-btn-dashboard')).toHaveCount(0);
});
