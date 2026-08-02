import { test, expect, type Page } from '@playwright/test';

// Signs in through the PIN lockscreen as one of the seeded staff accounts.
// The PIN auto-submits once the fourth digit is entered.
async function login(page: Page, name: string, pin: string) {
  await expect(page.locator('#lockscreen-root')).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
  for (const digit of pin.split('')) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(page.locator('#register-root')).toBeVisible();
}

// Adds a product to the cart. Targets the card container by matching its text.
async function addProduct(page: Page, name: string) {
  const productsGrid = page.locator('#products-grid');
  // Wait for the grid to be visible so the product cards have rendered.
  await expect(productsGrid).toBeVisible({ timeout: 10_000 });

  // Use Playwright's :has-text() pseudo-class to find a card that contains the product name.
  const productCard = productsGrid.locator(`> div:has-text("${name}")`).first();

  // Ensure the product card is visible before clicking, and use a longer action timeout.
  await expect(productCard).toBeVisible({ timeout: 10_000 });
  await productCard.click({ timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The app boots to the lockscreen, so the catalog cannot exist yet — waiting
  // for it here would time out every test. login() waits for #register-root and
  // addProduct() waits for #products-grid, which is where those waits belong.
  await expect(page.locator('#lockscreen-root')).toBeVisible({ timeout: 15_000 });
});

test('admin logs in and the register loads with the seeded catalog', async ({ page }) => {
  await login(page, 'Admin', '1234');
  // An admin can reach every screen, including Settings.
  await expect(page.locator('#nav-btn-settings')).toBeVisible();
  await expect(page.getByText('بطاطا ودجز صغير')).toBeVisible();
});

test('a card sale produces a receipt with the taxed total', async ({ page }) => {
  await login(page, 'Admin', '1234');

  await addProduct(page, 'بطاطا ودجز صغير'); // $1.00
  const cart = page.locator('#cart-section');
  await expect(cart.getByText('بطاطا ودجز صغير')).toBeVisible();

  await cart.getByRole('button', { name: /Checkout/i }).click();
  await expect(page.locator('#payment-modal')).toBeVisible();

  // Card is the default tender — no cash amount required.
  await page.getByRole('button', { name: /Complete Order/i }).click();

  const receipt = page.locator('#receipt-modal');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByText(/Payment Successful/i)).toBeVisible();
  await expect(receipt.getByText(/TX-/).first()).toBeVisible();
  // 1.00 + 8.5% tax (0.09) = 1.09
  await expect(receipt.getByText('$1.09').first()).toBeVisible();
});

test('a cash sale calculates change before completing', async ({ page }) => {
  await login(page, 'Admin', '1234');

  await addProduct(page, 'كاسة بطاطا بالجبنة'); // $1.50
  const cart = page.locator('#cart-section');
  await cart.getByRole('button', { name: /Checkout/i }).click();
  await expect(page.locator('#payment-modal')).toBeVisible();

  await page.locator('#pay-method-cash').click();
  await page.locator('#payment-modal input[type="number"]').first().fill('10');
  // 10.00 − (1.50 + 8.5% tax 0.13 = 1.63) = 8.37 change due
  await expect(page.locator('#payment-modal')).toContainText('8.37');

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
