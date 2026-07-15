import { launch, gotoApp, login, lock, check, flush } from './helpers.mjs';

const { context, page, dialogs, dialogControl } = await launch('./profile-main');
dialogControl.mode = 'accept';
const V = '#desktop-view-container ';

try {
  await gotoApp(page);
  await page.waitForTimeout(1500);
  if (await page.locator('#lockscreen-root').isVisible().catch(() => false)) {
    await login(page, 'Admin', '1234');
  } else {
    const who = await page.locator('#sidebar-user-card').innerText().catch(() => '');
    if (!/admin/i.test(who)) {
      await lock(page);
      await login(page, 'Admin', '1234');
    }
  }
  await page.locator('#nav-btn-customers').click();
  await page.waitForTimeout(700);
  const dir = page.locator(V + '#customer-directory-section');

  // Delete every remaining QA Tester record
  for (let round = 0; round < 4; round++) {
    const delBtnId = await page.evaluate(() => {
      const scope = document.querySelector('#desktop-view-container');
      for (const b of scope.querySelectorAll('[id^="del-cust-"]')) {
        let el = b.parentElement;
        for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
          const txt = el.textContent || '';
          if (txt.includes('QA Tester')) return b.id;
          if (/Sarah|Marcus|Olivia|David/.test(txt)) break;
        }
      }
      return null;
    });
    if (!delBtnId) break;
    await page.locator(`${V}[id="${delBtnId}"]`).click();
    await page.waitForTimeout(600);
  }
  check('All QA Tester records removed', !/QA Tester/.test(await dir.innerText()), dialogs.join(' | '));

  const custList = await dir.innerText();
  check('Remaining customers: Sarah/Marcus/Olivia (David deleted during QA)',
    /Sarah/.test(custList) && /Marcus/.test(custList) && /Olivia/.test(custList),
    custList.match(/Sarah|Marcus|Olivia|David/g)?.join(',') || '');
} catch (e) {
  check('Cleanup crashed', false, e.message);
} finally {
  flush('07f-cleanup');
  await context.close();
}
