import { expect, test } from "@playwright/test";

test("solo skips to the authoritative turn result and reconnects", async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.locator(".game-root")).toHaveAttribute("data-ready", "true");
  await page.getByPlaceholder("Your workshop nickname").fill("Solo Ada");
  await page.getByRole("button", { name: /play solo/i }).click();

  await expect(page.locator(".lobby-panel .kicker")).toHaveText("SOLO WORKSHOP");
  await expect(page.locator(".cpu-badge")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /copy invite/i })).toHaveCount(0);
  const code = new URL(page.url()).searchParams.get("room");
  expect(code).toMatch(/^[A-Z0-9]{10}$/);

  const rejectedJoin = await request.post(`/api/rooms/${code}/join`, {
    data: { displayName: "Intruder", robotId: "twonky" },
  });
  expect(rejectedJoin.status()).toBe(409);
  expect(await rejectedJoin.json()).toMatchObject({ error: "Solo workshops cannot be joined." });

  await page.getByRole("radio", { name: /risky exchange/i }).click();
  await page.getByRole("button", { name: /^choose dock 7$/i }).click();
  await page.getByRole("button", { name: /start the diorama/i }).click();
  await expect(page.getByText("YOUR FIVE-STEP PLAN")).toBeVisible();
  const power = page.locator(".robot-health .power-repair-button");
  await power.click();
  await expect(power).toHaveAttribute("aria-pressed", "true");
  await expect(power).toContainText("REPAIR QUEUED");
  await power.click();
  await expect(power).toHaveAttribute("aria-pressed", "false");
  const before = await page.evaluate(
    () =>
      (window as typeof window & { __VIBE_MATCH__?: { public: { revision: number } } })
        .__VIBE_MATCH__?.public.revision ?? 0,
  );

  await page.getByRole("button", { name: "1×", exact: true }).click();
  const skip = page.getByRole("button", { name: "Skip to end of turn" });
  await expect(skip).toHaveCount(0);
  const cards = page.locator(".program-card");
  for (let index = 0; index < 5; index += 1) await cards.nth(index).click();
  await page.getByRole("button", { name: /lock in 5\/5/i }).click();
  await expect
    .poll(async () =>
      page.evaluate((startingRevision) => {
        const match = (
          window as typeof window & {
            __VIBE_MATCH__?: {
              public: { revision: number; phase: string; timerDeadline?: number };
              events: Array<{ type: string; seatId?: string }>;
            };
          }
        ).__VIBE_MATCH__;
        return Boolean(
          match &&
          match.public.revision >= startingRevision + 4 &&
          ["programming", "complete"].includes(match.public.phase) &&
          !match.public.timerDeadline &&
          match.events.filter(
            (event) => event.type === "program-ready" && event.seatId?.startsWith("cpu-"),
          ).length === 3,
        );
      }, before),
    )
    .toBe(true);

  await expect(page.locator(".register.filled")).toHaveCount(5);

  await expect(page.locator(".action-toast")).toHaveCount(0);
  await expect(skip).toBeVisible();
  await expect(skip).toBeInViewport();
  const result = await page.evaluate(() => {
    const match = (window as any).__VIBE_MATCH__;
    return { revision: match.public.revision, robots: match.public.robots };
  });
  await skip.click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-playback", "idle");
  await expect(skip).toHaveCount(0);
  await expect(cards.first()).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => (window as any).__VIBE_PLAYBACK__.robots))
    .toEqual(result.robots);
  expect(await page.evaluate(() => (window as any).__VIBE_MATCH__.public.revision)).toBe(
    result.revision,
  );

  // Skipping clears this queue only; a later turn still has its own animation and skip.
  const open = await page.evaluate(() => {
    const match = (window as any).__VIBE_MATCH__;
    return match.public.robots
      .find((robot: any) => robot.seatId === match.seatId)
      .registers.filter((register: any) => !register.locked).length;
  });
  for (let index = 0; index < open; index++) await cards.nth(index).click();
  await page.getByRole("button", { name: new RegExp(`lock in ${open}/${open}`, "i") }).click();
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.locator(".game-root")).toHaveAttribute("data-playback", "idle");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as any;
        return (
          JSON.stringify(w.__VIBE_PLAYBACK__.robots) ===
          JSON.stringify(w.__VIBE_MATCH__.public.robots)
        );
      }),
    )
    .toBe(true);

  await page.reload();
  await expect(page.locator(".program-console, .result-modal")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".roster-panel > div").filter({ hasText: /CPU/ })).toHaveCount(3);
});

test("room creation rejects an unknown match mode", async ({ request }) => {
  const response = await request.post("/api/rooms", {
    data: { displayName: "Ada", robotId: "hammer-bot", mode: "arcade" },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: "Invalid match mode." });
});
