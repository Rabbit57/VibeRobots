import { expect, test } from "@playwright/test";

test("one player races three server-controlled robots and reconnects", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
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
  await page.getByRole("button", { name: /start the diorama/i }).click();
  await expect(page.getByText("YOUR FIVE-STEP PLAN")).toBeVisible();
  const before = await page.evaluate(
    () =>
      (window as typeof window & { __VIBE_MATCH__?: { public: { revision: number } } })
        .__VIBE_MATCH__?.public.revision ?? 0,
  );

  await page.getByRole("button", { name: "1×", exact: true }).click();
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

  // The visual queue must finish too: server completion alone hides timer bugs.
  await expect(page.locator(".action-toast")).toBeHidden({ timeout: 60_000 });
  await expect(cards.first()).toBeEnabled();

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
