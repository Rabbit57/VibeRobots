import { expect, test } from '@playwright/test';

const states = ['home', 'lobby', 'programming', 'laser', 'destruction', 'respawn', 'victory'] as const;

test.describe('deterministic presentation gallery', () => {
  for (const state of states) {
    test(`${state} visual state`, async ({ page }) => {
      await page.goto(`/?visual=${state}`);
      await expect(page.locator('.game-root')).toHaveAttribute('data-visual', state);
      if (state !== 'home') await expect(page.locator('canvas')).toBeVisible();
      await page.waitForTimeout(state === 'home' ? 250 : 1_000);
      await expect(page).toHaveScreenshot(`${state}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.04,
      });
    });
  }
});
