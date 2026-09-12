import { test, expect, type Page } from '@playwright/test';

// The Settings screen is mounted as a flex item of <main id="desktop-view-container">,
// and that <main> is `overflow-hidden`. A flex item defaults to `min-width: auto`,
// which means it refuses to shrink below its content's intrinsic minimum — so
// when the Settings root lacked `min-w-0`, it measured 973px inside a 390px
// viewport and the extra 583px was CLIPPED rather than scrollable. The tab strip
// ran off one edge, the Pull/Push buttons off the other, and nothing on the page
// could reach either.
//
// Nothing in the unit suite could see this: it is a layout fact that only exists
// once a real browser has resolved the flex sizing at a real viewport width.

/** Signs in through the PIN lockscreen as the seeded admin. */
async function login(page: Page) {
  await expect(page.locator('#lockscreen-root')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Admin/ }).first().click();
  for (const digit of '1234') {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(page.locator('#register-root')).toBeVisible();
}

/**
 * Opens Settings. Below the `lg` breakpoint the desktop sidebar is hidden, so
 * the only way in is the mobile header's menu — which is the path these tests
 * care about anyway.
 */
async function openSettings(page: Page, viaMobileMenu: boolean) {
  if (viaMobileMenu) {
    await page.getByRole('button', { name: /menu/i }).first().click();
    await page
      .getByRole('button', { name: /settings/i })
      .first()
      .click();
  } else {
    await page.locator('#nav-btn-settings').click();
  }
  await expect(page.getByRole('tab').first()).toBeVisible();
}

/**
 * The width the Settings screen actually occupies, and how far its clipping
 * container would have to scroll to show all of it. On a correct layout both
 * equal the viewport width.
 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('#desktop-view-container');
    const root = main?.firstElementChild;
    if (!main || !root) throw new Error('Settings screen not mounted');
    return {
      rootWidth: Math.round(root.getBoundingClientRect().width),
      mainClientWidth: main.clientWidth,
      mainScrollWidth: main.scrollWidth,
    };
  });
}

for (const width of [360, 390, 414]) {
  test(`Settings fits a ${width}px viewport without clipping`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await login(page);
    await openSettings(page, true);

    const { rootWidth, mainClientWidth, mainScrollWidth } = await measure(page);
    expect(rootWidth).toBe(mainClientWidth);
    // The decisive one. `scrollWidth > clientWidth` on an overflow-hidden
    // container is content that exists and cannot be reached by any means.
    expect(mainScrollWidth).toBe(mainClientWidth);
  });
}

test('every Settings tab stays within a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await login(page);
  await openSettings(page, true);

  const tabs = await page.getByRole('tab').all();
  expect(tabs.length).toBeGreaterThan(1);

  for (const tab of tabs) {
    const label = (await tab.textContent())?.trim() ?? '?';
    await tab.click();
    const { mainClientWidth, mainScrollWidth } = await measure(page);
    expect(mainScrollWidth, `"${label}" tab overflows its container`).toBe(mainClientWidth);
  }
});

// Deliberately NOT tested here: "the tab strip can be scrolled to reach the last
// tab". It cannot tell the two states apart. `scrollIntoViewIfNeeded()` will
// scroll an `overflow: hidden` container programmatically, so the last tab comes
// into view — and `toBeInViewport()` passes — even with the root stuck at 973px,
// where a human has no way to get there. Verified: that assertion passed against
// the broken layout. `scrollWidth === clientWidth` above is the honest invariant.
