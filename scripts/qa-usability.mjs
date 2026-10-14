import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

async function checkThemes(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const page = await context.newPage();
  const background = () => page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await background(), 'rgb(246, 244, 240)');
    await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark');
    assert.equal(await background(), 'rgb(11, 13, 16)');
    await page.goto(`${base}/articles`, { waitUntil: 'networkidle' });
    assert.equal(await background(), 'rgb(11, 13, 16)');
    assert.equal(await page.getByRole('combobox', { name: 'Color theme' }).inputValue(), 'dark');
    await page.getByRole('combobox', { name: 'Color theme' }).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    assert.equal(await background(), 'rgb(246, 244, 240)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await background(), 'rgb(246, 244, 240)');
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#f6f4f0');
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
      Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await background(), 'rgb(11, 13, 16)');
    await page.getByRole('combobox', { name: 'Color theme' }).selectOption('light');
    assert.equal(await background(), 'rgb(246, 244, 240)');
  } finally {
    await context.close();
  }
}

async function checkMapViewer(page) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#mapSize').click();
    assert.equal(await page.locator('#mapViewer').evaluate((el) => el.open), true);
    const fits = () => page.evaluate(() => {
      const svg = document.querySelector('#mapViewport svg').getBoundingClientRect();
      const viewport = document.querySelector('#mapViewport').getBoundingClientRect();
      return svg.left >= viewport.left && svg.right <= viewport.right && svg.top >= viewport.top && svg.bottom <= viewport.bottom;
    });
    assert.equal(await fits(), true, `whole map fits the ${width}px overlay`);
    const initial = await page.locator('#mapViewport svg').evaluate((el) => el.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert.ok(await page.locator('#mapViewport svg').evaluate((el) => el.getBoundingClientRect().width) > initial);
    await page.getByRole('button', { name: 'Fit map', exact: true }).click();
    assert.equal(await fits(), true);
    await page.keyboard.press('Escape');
    await page.locator('#mapInline svg').waitFor();
    assert.equal(await page.locator('#mapViewer').isVisible(), false);
    assert.equal(await page.locator('#mapSize').evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator('#mapInline svg').count(), 1);
    await page.locator('#mapSize').click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('#mapInline svg').waitFor();
    assert.equal(await page.locator('#mapViewer').isVisible(), false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

// Instance-specific behavior checks: assertions use rendered geometry so CSS
// cannot make an attribute-only filter check pass while cards remain visible.
export async function checkUsability(base) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const assertions = [];
  const check = async (name, run) => {
    try { await run(); assertions.push({ name, pass: true }); }
    catch (error) { assertions.push({ name, pass: false, error: error.stack }); }
  };
  try {
    await check('theme selection, persistence, keyboard use, and unavailable storage', () => checkThemes(browser, base));
    await check('mobile catalog filters, URL state, and return link', async () => {
      await page.goto(base, { waitUntil: 'networkidle' });
      const rows = page.locator('#rows tr:visible');
      const total = await rows.count();
      assert.ok(total > 0);
      await page.locator('#q').fill('zzzz-no-match');
      assert.equal(await rows.count(), 0);
      assert.equal(await page.locator('#empty').isVisible(), true);
      await page.locator('#clearFilters').click();
      assert.equal(await rows.count(), total);
      const category = await page.locator('#rows tr').first().getAttribute('data-cat');
      const expected = await page.locator('#rows tr').evaluateAll((items, cat) => items.filter((r) => r.dataset.cat === cat).length, category);
      await page.locator('#q').fill(category);
      assert.ok(await rows.count() >= expected);
      await page.locator('#clearFilters').click();
      await page.locator('#catFilter').selectOption(category);
      assert.equal(await rows.count(), expected);
      await page.locator('[data-filter="wanted"]').click();
      const wanted = await page.locator('#rows tr').evaluateAll((items, cat) => items.filter((r) => r.dataset.cat === cat && r.dataset.wanted === '1').length, category);
      assert.equal(await rows.count(), wanted);
      assert.equal(await page.locator('[data-filter="wanted"]').getAttribute('aria-pressed'), 'true');
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await rows.count(), wanted);
      await page.locator('[data-filter="all"]').click();
      const filteredUrl = page.url();
      await rows.first().locator('td.name a').click();
      await page.getByRole('link', { name: '← back to catalog' }).click();
      await page.waitForLoadState('networkidle');
      assert.equal(page.url(), filteredUrl);
      assert.equal(await rows.count(), expected);
    });
    await check('historical snapshot identity and current navigation', async () => {
      await page.goto(`${base}/harness`, { waitUntil: 'networkidle' });
      const current = await page.locator('#snapshotVersion').inputValue();
      const other = await page.locator('#snapshotVersion option').evaluateAll((options, value) => options.find((o) => o.value !== value)?.value, current);
      if (!other) return;
      await page.locator('#snapshotVersion').selectOption(other);
      await page.waitForURL(`**/harness?v=${other}`);
      assert.match(await page.locator('h1').innerText(), /historical/);
      await page.getByRole('link', { name: 'view current →' }).click();
      await page.waitForURL(`**/harness?v=${current}`);
      assert.equal(await page.locator('#snapshotVersion').inputValue(), current);
      assert.doesNotMatch(await page.locator('h1').innerText(), /historical/);
      await checkMapViewer(page);
    });
    await check('reading shortlist keyboard controls and explicit preview', async () => {
      await page.goto(`${base}/articles`, { waitUntil: 'networkidle' });
      await page.locator('#cp-name').fill('First reading note');
      await page.locator('#custom-pref button[type=submit]').click();
      await page.locator('#cp-name').fill('Second reading note');
      await page.locator('#custom-pref button[type=submit]').click();
      const second = page.locator('#preferred li').nth(1);
      await second.getByRole('button', { name: 'Move up', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#preferred li').first().innerText(), /Second reading note/);
      await page.locator('details').first().evaluate((el) => { el.open = true; });
      await page.locator('button.preview').first().click();
      assert.equal(await page.locator('#modreader').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#modreader').isVisible(), false);
      assert.equal(await page.locator('button.preview').first().evaluate((el) => el === document.activeElement), true);
    });
    await check('compact mobile header and no overflow in both themes', async () => {
      for (const colorScheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme });
        for (const route of ['/', '/articles', '/harness', '/login']) {
          await page.goto(base + route, { waitUntil: 'networkidle' });
          const layout = await page.evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            headerHeight: document.querySelector('header').getBoundingClientRect().height,
          }));
          assert.ok(layout.scrollWidth <= layout.width, `${colorScheme} ${route}: horizontal overflow`);
          assert.ok(layout.headerHeight <= 160, `${colorScheme} ${route}: header ${layout.headerHeight}px`);
        }
      }
    });
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      await check('Manage mobile layout, search, and unsaved edit guard', async () => {
        await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
        await page.locator('[name=email]').fill(process.env.ADMIN_EMAIL);
        await page.locator('[name=password]').fill(process.env.ADMIN_PASSWORD);
        await page.locator('#loginForm button').click();
        await page.waitForURL('**/admin');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await page.locator('header').evaluate((el) => el.getBoundingClientRect().height <= 160));
        await page.locator('#existingMods').evaluate((el) => { el.open = true; });
        await page.locator('#manageSearch').fill('zzzz-no-match');
        assert.equal(await page.locator('[data-mod-search]:visible').count(), 0);
        await page.locator('#manageSearch').fill('');
        await page.locator('[data-edit]').first().click();
        const title = await page.locator('[name=title]').inputValue();
        assert.ok(title);
        await page.locator('[name=title]').fill('Unsaved draft');
        page.once('dialog', (dialog) => dialog.dismiss());
        await page.locator('#resetBtn').click();
        assert.equal(await page.locator('[name=title]').inputValue(), 'Unsaved draft');
        page.once('dialog', (dialog) => dialog.accept());
        await page.locator('#resetBtn').click();
        assert.equal(await page.locator('[name=title]').inputValue(), '');
        // Exercise pending, failure, retry, and persistent success without
        // mutating the catalog or creating disposable database records.
        await page.locator('[name=title]').fill(title);
        let release;
        const requested = new Promise((resolve) => { release = resolve; });
        let finish;
        const pending = new Promise((resolve) => { finish = resolve; });
        await page.route('**/api/mods', async (route) => {
          release();
          await pending;
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Simulated save failure"}' });
        });
        await page.locator('#saveBtn').click();
        await page.waitForFunction(() => document.querySelector('#saveBtn').disabled);
        assert.equal(await page.locator('#saveBtn').innerText(), 'Saving…');
        await requested;
        finish();
        await page.waitForFunction(() => !document.querySelector('#saveBtn').disabled);
        assert.match(await page.locator('#formStatus').innerText(), /Simulated save failure/);
        assert.equal(await page.locator('[name=title]').inputValue(), title);
        await page.unroute('**/api/mods');
        await page.route('**/api/mods', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
        await page.locator('#saveBtn').click();
        await page.waitForFunction(() => document.querySelector('#formStatus')?.textContent.includes('mirror this change'));
        await page.locator('#logout').click();
        await page.waitForURL(base + '/');
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }
  return { ok: assertions.every((a) => a.pass), assertions, authChecked: Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) };
}
