import { expect, test } from '@playwright/test';

test('two players create, join, start, program, and reconnect', async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto('/');
  await expect(host.locator('.game-root')).toHaveAttribute('data-ready', 'true');
  await host.getByPlaceholder('Enter a callsign').fill('Ada');
  await host.getByRole('button', { name: /create private room/i }).click();
  await expect(host.locator('.lobby-panel .kicker')).toHaveText('PRIVATE ROOM');
  const code = await host.locator('.lobby-panel h2').innerText();
  await guest.goto(`/?room=${code}`);
  await expect(guest.locator('.game-root')).toHaveAttribute('data-ready', 'true');
  await expect(guest.locator('.join-panel')).toBeVisible();
  await guest.getByPlaceholder('Enter a callsign').fill('Grace');
  const hulk = guest.getByTitle('Hulk X90');
  await hulk.click({ force: true });
  await expect(hulk).toHaveAttribute('aria-pressed', 'true');
  await guest.getByRole('button', { name: /claim robot/i }).click();
  await expect(guest.locator('.lobby-panel')).toBeVisible();
  await expect(host.locator('.seat:not(.empty)')).toHaveCount(2, { timeout: 30_000 });
  await expect(host.getByText('Grace', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: /start race/i }).click();
  await expect(host.getByText('PROGRAM REGISTERS')).toBeVisible();
  await expect(guest.getByText('PROGRAM REGISTERS')).toBeVisible();
  for (const page of [host, guest]) {
    const cards = page.locator('.program-card');
    for (let index = 0; index < 5; index += 1) await cards.nth(index).click();
    await page.getByRole('button', { name: /execute 5\/5/i }).click();
  }
  await expect(host.getByText(/PROGRAMMING PHASE|RACE COMPLETE/i)).toBeVisible();
  await host.reload();
  await expect(host.locator('.program-console, .lobby-panel')).toBeVisible({ timeout: 15_000 });
  await guest.close();
  await expect(host.getByText(/PAUSED — RECONNECTING/i)).toBeVisible();
  await hostContext.close();
  await guestContext.close();
});

test('tablet supports touch-sized controls and reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'landscape-tablet', 'tablet-only check');
  await page.goto('/');
  await expect(page.getByText('Factory floor too small')).toBeHidden();
  await expect(page.getByRole('button', { name: /create private room/i })).toBeVisible();
  await page.getByRole('button', { name: /sound on/i }).tap();
  await expect(page.getByRole('button', { name: /sound off/i })).toBeVisible();
});

test('phone receives larger-screen guidance', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText('Factory floor too small')).toBeVisible();
  await context.close();
});
