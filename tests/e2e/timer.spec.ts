import { expect, test } from "@playwright/test";
import type { PrivateMatchView } from "../../game/types";

// Exercise the actual Durable Object alarm, including a disconnect while timed.
test("last-player deadline survives reconnect and resolves once when it expires", async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "server behavior is independent of screen size",
  );
  test.setTimeout(90_000);
  const created = await request.post("/api/rooms", {
    data: { displayName: "Timer Ada", robotId: "hammer-bot" },
  });
  const host = await created.json();
  const joins = [];
  for (const [displayName, robotId] of [
    ["Timer Grace", "hulk-x90"],
    ["Timer Lin", "twitch"],
  ]) {
    joins.push(
      await (
        await request.post(`/api/rooms/${host.code}/join`, { data: { displayName, robotId } })
      ).json(),
    );
  }
  const clients = [host, ...joins].map((identity) => ({
    identity,
    socket: undefined as WebSocket | undefined,
    view: identity.view as PrivateMatchView,
    events: [] as PrivateMatchView["events"],
  }));
  const connect = async (client: (typeof clients)[number]) => {
    const url = new URL(
      `/api/rooms/${host.code}/socket`,
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3000"),
    );
    url.protocol = "ws:";
    const socket = new WebSocket(url);
    client.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: "authenticate",
            seatId: client.identity.seatId,
            seatToken: client.identity.seatToken,
          }),
        );
      socket.onerror = () => reject(new Error("Could not connect timer test"));
      socket.onmessage = (message) => {
        const payload = JSON.parse(String(message.data));
        if (payload.view) {
          client.view = payload.view;
          client.events.push(...payload.view.events);
          resolve();
        }
      };
    });
  };
  const command = async (client: (typeof clients)[number], extra: Record<string, unknown>) => {
    const revision = client.view.public.revision;
    client.socket!.send(
      JSON.stringify({ type: "command", command: { ...extra, id: crypto.randomUUID(), revision } }),
    );
    await expect.poll(() => client.view.public.revision).toBeGreaterThan(revision);
    await expect
      .poll(() =>
        clients.every(
          (candidate) => candidate.view.public.revision === client.view.public.revision,
        ),
      )
      .toBe(true);
  };
  try {
    for (const client of clients) await connect(client);
    await command(clients[0], { type: "choose-course", courseId: "dizzy-dash" });
    expect(clients.every((client) => client.view.public.courseId === "dizzy-dash")).toBe(true);
    for (const [index, client] of clients.entries())
      await command(client, { type: "choose-spawn", dock: [7, 5, 3][index] });
    await command(clients[0], { type: "start", courseId: "dizzy-dash", fourLifeRule: false });
    await command(clients[0], {
      type: "program",
      cards: clients[0].view.hand.slice(0, 5).map((card) => card.id),
    });
    expect(clients.every((client) => !client.view.public.timerDeadline)).toBe(true);
    await command(clients[1], {
      type: "program",
      cards: clients[1].view.hand.slice(0, 5).map((card) => card.id),
    });
    const deadline = clients[0].view.public.timerDeadline!;
    expect(deadline - Date.now()).toBeGreaterThan(28_000);
    expect(clients.every((client) => client.view.public.timerDeadline === deadline)).toBe(true);
    clients[2].socket!.close();
    await expect.poll(() => clients[0].view.public.phase).toBe("paused");
    const remaining = clients[0].view.public.timerRemainingMs!;
    expect(remaining).toBeGreaterThan(0);
    expect(clients[0].view.public.timerDeadline).toBeUndefined();
    await connect(clients[2]);
    await expect
      .poll(() => clients.every((client) => client.view.public.phase === "programming"))
      .toBe(true);
    const resumed = clients[0].view.public.timerDeadline!;
    expect(resumed).toBeGreaterThanOrEqual(deadline);
    await expect
      .poll(() => clients[0].events.filter((event) => event.type === "timer-expired").length, {
        timeout: 40_000,
      })
      .toBe(1);
    const result = clients[0].view;
    expect(result.public.timerDeadline).toBeUndefined();
    expect(
      result.events.filter((event) => event.type === "stage" && event.stage === "cleanup"),
    ).toHaveLength(1);
    expect(clients.every((client) => client.view.public.revision === result.public.revision)).toBe(
      true,
    );
  } finally {
    for (const client of clients) client.socket?.close();
  }
});
