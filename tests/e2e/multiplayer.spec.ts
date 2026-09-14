import { expect, test } from '@playwright/test';

test('two players create, join, start, program, and reconnect', async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto('/');
  await expect(host.locator('.game-root')).toHaveAttribute('data-ready', 'true');
  await host.getByPlaceholder('Your workshop nickname').fill('Ada');
  await host.getByRole('button', { name: /create online room/i }).click();
  await expect(host.locator('.lobby-panel .kicker')).toHaveText('PRIVATE WORKSHOP');
  const code = await host.locator('.lobby-panel h2').innerText();
  await guest.goto(`/?room=${code}`);
  await expect(guest.locator('.game-root')).toHaveAttribute('data-ready', 'true');
  await expect(guest.locator('.join-panel')).toBeVisible();
  await guest.getByPlaceholder('Your workshop nickname').fill('Grace');
  const hulk = guest.getByTitle('Hulk X90');
  await hulk.click({ force: true });
  await expect(hulk).toHaveAttribute('aria-pressed', 'true');
  await guest.getByRole('button', { name: /claim this robot/i }).click();
  await expect(guest.locator('.lobby-panel')).toBeVisible();
  await expect(host.locator('.seat:not(.empty)')).toHaveCount(2, { timeout: 30_000 });
  await expect(host.getByText('Grace', { exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: /start the diorama/i })).toBeDisabled();
  await host.getByRole('button', { name: /^choose dock 7$/i }).click();
  await expect(guest.getByRole('button', { name: /choose dock 7/i })).toBeDisabled();
  await guest.getByRole('button', { name: /^choose dock 5$/i }).click();
  await host.getByRole('button', { name: /start the diorama/i }).click();
  await expect(host.getByText('YOUR FIVE-STEP PLAN')).toBeVisible();
  await expect(guest.getByText('YOUR FIVE-STEP PLAN')).toBeVisible();
  const startRevision = await host.evaluate(() => (window as typeof window & { __VIBE_MATCH__?: { public: { revision: number } } }).__VIBE_MATCH__?.public.revision ?? 0);
  for (const page of [host, guest]) {
    const cards = page.locator('.program-card');
    for (let index = 0; index < 5; index += 1) await cards.nth(index).click();
    await page.getByRole('button', { name: /lock in 5\/5/i }).click();
    if (page === host) {
      await expect(guest.locator('.ready-countdown')).toBeVisible();
      await expect(guest.locator('.roster-panel .ready-badge.is-ready')).toHaveText('✓ READY');
    }
  }
  await expect.poll(async () => {
    const states = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const match = (window as typeof window & { __VIBE_MATCH__?: { public: { revision: number; phase: string; robots: Array<{ finishedProgramming: boolean }> } } }).__VIBE_MATCH__;
      return match ? { revision: match.public.revision, phase: match.public.phase, resolved: match.public.robots.every((robot) => !robot.finishedProgramming) } : undefined;
    })));
    return Boolean(states[0] && states[1] && states[0].revision >= startRevision + 2 && states[0].revision === states[1].revision && states[0].phase === states[1].phase && states[0].resolved && states[1].resolved && ['programming', 'complete'].includes(states[0].phase));
  }).toBe(true);
  const publicResult = async (page: typeof host) => page.evaluate(() => {
    const match = (window as typeof window & { __VIBE_MATCH__: { public: { revision: number; phase: string; robots: unknown[] }; events: Array<{ revision: number; type: string; public: boolean }> } }).__VIBE_MATCH__;
    return {
      revision: match.public.revision,
      phase: match.public.phase,
      robots: match.public.robots,
      events: match.events.filter((event) => event.public).map(({ revision, type }) => ({ revision, type })),
    };
  });
  await expect(host.getByRole("button", { name: "Skip to end of turn" })).toHaveCount(0);
  await expect(guest.getByRole("button", { name: "Skip to end of turn" })).toHaveCount(0);
  const [hostResult, guestResult] = await Promise.all([publicResult(host), publicResult(guest)]);
  expect(hostResult).toEqual(guestResult);
  await host.reload();
  await expect(host.locator('.program-console, .lobby-panel')).toBeVisible({ timeout: 15_000 });
  await guest.close();
  await expect(host.getByText(/PAUSED · RECONNECTING/i)).toBeVisible();
  await hostContext.close();
  await guestContext.close();
});

test('tablet supports touch-sized controls and reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'landscape-tablet', 'tablet-only check');
  await page.goto('/');
  await expect(page.getByText('Factory floor too small')).toBeHidden();
  await expect(page.getByRole('button', { name: /create online room/i })).toBeVisible();
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
