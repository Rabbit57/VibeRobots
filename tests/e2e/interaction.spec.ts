import { expect, test } from "@playwright/test";

test("course selection changes the live preview and the exact tactical map", async ({ page }) => {
  await page.goto("/?visual=lobby");
  await expect(page.locator(".game-root")).toHaveAttribute("data-visual", "lobby");
  for (const [name, size] of [
    ["Dizzy Dash", "12 × 12"],
    ["Against the Grain", "12 × 24"],
    ["Risky Exchange", "12 × 12"],
  ]) {
    await page.getByRole("radio", { name: new RegExp(name, "i") }).click();
    await expect(page.getByRole("region", { name: `3D view of ${name}` })).toBeVisible();
    await expect(page.locator(".factory-viewport")).toHaveClass(/scene-ready/);
    await expect(page.locator(".course-chip strong")).toHaveText(name);
    await page.getByRole("button", { name: "Explore map ↗" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#map-title")).toHaveText(name);
    await expect(page.locator(".map-modal .kicker")).toContainText(size);
    const express = page
      .locator('.map-grid [role="button"]')
      .filter({ has: page.locator("path") })
      .first();
    await express.focus();
    await expect(page.locator(".map-sidebar .tile-inspector")).toHaveClass(/inspecting/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});

test("cards, factory stages, board tiles and robots explain themselves", async ({ page }) => {
  await page.goto("/?visual=programming");
  await expect(page.locator(".factory-viewport")).toHaveClass(/scene-ready/);
  await page.locator(".program-card.type-move3").hover();
  await expect(page.getByRole("tooltip")).toContainText("Move 3 squares forward");
  await page.locator(".turn-timeline li").nth(1).focus();
  await expect(page.getByRole("tooltip")).toContainText("extra movement");
  // Project a real board coordinate through the actual camera rather than guessing pixels.
  const points = await page.evaluate(() => {
    const perf = (window as any).__VIBE_PERF__;
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    const camera = perf.camera;
    const point = camera.position
      .clone()
      .set(6 - 5.5, 0.15, 3 - 5.5)
      .project(camera);
    const actor = perf.scene.getObjectByName("robot:ada");
    const robot = actor.getWorldPosition(camera.position.clone());
    robot.y += 0.6;
    robot.project(camera);
    return {
      tile: {
        x: rect.left + ((point.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - point.y) * rect.height) / 2,
      },
      robot: {
        x: rect.left + ((robot.x + 1) * rect.width) / 2,
        y: rect.top + ((1 - robot.y) * rect.height) / 2,
      },
    };
  });
  await page.mouse.move(points.tile.x, points.tile.y);
  await expect(page.locator(".factory-viewport > .tile-inspector")).toContainText(
    "Express conveyor",
  );
  await page.mouse.move(points.robot.x, points.robot.y);
  await expect(page.locator(".factory-viewport > .tile-inspector")).toContainText("Ada");
  await page.locator(".roster-panel > div").first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Facing east");
  await page.getByRole("button", { name: "Explore map ↗" }).click();
  await page.getByRole("button", { name: /TILE D1: Express conveyor/ }).focus();
  await expect(page.locator(".map-sidebar .tile-inspector")).toContainText(
    "2 squares per register",
  );
  await page.getByRole("button", { name: /TILE B10: Open pit/ }).focus();
  await expect(page.locator(".map-sidebar .tile-inspector")).toContainText("costs one life");
});

test("the program controls fit and remain readable without scrolling", async ({ page }) => {
  await page.goto("/?visual=programming");
  await expect(page.locator(".game-root")).toHaveAttribute("data-visual", "programming");
  const consoleSize = await page
    .locator(".program-console")
    .evaluate((el) => ({ available: el.clientHeight, used: el.scrollHeight }));
  expect(consoleSize.used).toBeLessThanOrEqual(consoleSize.available + 1);
  await expect(page.getByRole("button", { name: /lock in 0\/5/i })).toBeInViewport();
  const card = page.locator(".program-card").first();
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".card-assigned")).toHaveText("R1 ✓");
  await expect(page.locator(".register.filled")).toHaveCount(1);
});

test("a live robot travels smoothly at the slower default pace", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.getByRole("button", { name: /^choose dock 7$/i }).click();
  await page.getByRole("button", { name: /start the diorama/i }).click();
  await expect(page.locator(".factory-viewport")).toHaveClass(/scene-ready/);
  for (let i = 0; i < 5; i++) await page.locator(".program-card").nth(i).click();
  await page.getByRole("button", { name: /lock in 5\/5/i }).click();
  const samples = await page.evaluate(async () => {
    const w = window as any;
    const end = performance.now() + 25_000;
    const found: Array<{
      revision: number;
      x: number;
      z: number;
      fromX: number;
      fromZ: number;
      toX: number;
      toZ: number;
      duration: number;
    }> = [];
    while (performance.now() < end && found.length < 12) {
      const active = w.__VIBE_PLAYBACK__?.active;
      const event = active?.event;
      if (event?.type === "move" && event.from && event.to) {
        const actor = w.__VIBE_PERF__?.scene?.getObjectByName(`robot:${event.seatId}`);
        if (actor?.userData.motion?.revision === event.revision) {
          if (found.length && found[0].revision !== event.revision) break;
          found.push({
            revision: event.revision,
            x: actor.position.x,
            z: actor.position.z,
            fromX: event.from.x,
            fromZ: event.from.y,
            toX: event.to.x,
            toZ: event.to.y,
            duration: active.durationMs,
            motion: actor.userData.motion,
            now: performance.now(),
          } as any);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return found;
  });
  expect(samples.length).toBeGreaterThanOrEqual(4);
  expect(samples[0].duration).toBeGreaterThanOrEqual(800);
  for (const sample of samples) {
    expect(sample.x).toBeGreaterThanOrEqual(Math.min(sample.fromX, sample.toX) - 0.01);
    expect(sample.x).toBeLessThanOrEqual(Math.max(sample.fromX, sample.toX) + 0.01);
    expect(sample.z).toBeGreaterThanOrEqual(Math.min(sample.fromZ, sample.toZ) - 0.01);
    expect(sample.z).toBeLessThanOrEqual(Math.max(sample.fromZ, sample.toZ) + 0.01);
  }
  const distance = (s: (typeof samples)[number]) => Math.hypot(s.x - s.fromX, s.z - s.fromZ);
  expect(
    samples.some((s) => distance(s) > 0.05 && distance(s) < 0.95),
    JSON.stringify(samples),
  ).toBe(true);
  for (let i = 1; i < samples.length; i++)
    expect(distance(samples[i])).toBeGreaterThanOrEqual(distance(samples[i - 1]) - 0.01);
  // Changing pace mid-playback must let the queue finish and unlock the next hand.
  await page.getByRole("button", { name: "1×", exact: true }).click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-playback", "idle", {
    timeout: 120_000,
  });
});


test("damage tokens, locked programs and lives are explicit", async ({ page }) => {
  await page.goto("/?visual=damage");
  await expect(page.locator(".robot-health .life-hearts")).toHaveAttribute("aria-label", "2 of 3 lives");
  await expect(page.locator(".damage-tokens .hit")).toHaveCount(7);
  await expect(page.locator(".register.locked")).toHaveCount(3);
  await expect(page.locator(".register.locked .lock").first()).toContainText("LOCKED");
  await expect(page.locator(".damage-consequences")).toContainText("3 registers locked");
  await expect(page.locator(".roster-panel .ready-badge.is-ready")).toHaveText("✓ READY");
  await expect(page.locator(".programming-status strong")).toHaveText("1 / 2 READY");
  await page.locator(".program-card").nth(0).click();
  await page.locator(".program-card").nth(1).click();
  await expect(page.getByRole("button", { name: /lock in 2\/2/i })).toBeEnabled();
});
