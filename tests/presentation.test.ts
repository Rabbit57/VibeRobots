import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  appendPresentationBatch,
  applyPresentationEvent,
  compilePresentation,
  directionAngle,
  eventDuration,
  reconcilePresentation,
  resetPresentation,
  shortestAngle,
  motionProgress,
} from "../game/presentation";
import type { MatchEvent, PublicRobotView } from "../game/types";

const robot = (): PublicRobotView => ({
  seatId: "a",
  robotId: "hammer-bot",
  displayName: "Ada",
  controller: "human",
  position: { x: 1, y: 2 },
  direction: "north",
  archive: { x: 0, y: 0 },
  damage: 1,
  lives: 3,
  checkpoint: 0,
  registers: [],
  optionCount: 0,
  revealedOptions: [],
  poweredDown: false,
  powerDownNext: false,
  destroyed: false,
  eliminated: false,
  connected: true,
  finishedProgramming: false,
});

const event = (revision: number, type: string, extra: Partial<MatchEvent> = {}): MatchEvent => ({
  revision,
  type,
  message: type,
  public: true,
  seatId: "a",
  ...extra,
});

describe("presentation compiler", () => {
  test("sorts revisions and omits non-visual chatter", () => {
    const steps = compilePresentation(
      [event(3, "move"), event(1, "program-ready"), event(2, "turn")],
      "normal",
      false,
    );
    assert.deepEqual(
      steps.map((step) => step.event.revision),
      [2, 3],
    );
  });

  test("cinematic timing slows travel while reduced motion keeps actions readable", () => {
    const move = event(1, "move");
    assert.equal(eventDuration(move, "normal", false), 850);
    assert.equal(eventDuration(move, "fast", false), 340);
    assert.equal(eventDuration(move, "normal", true), 450);
  });

  test("applies movement, rotation, damage, destruction, and respawn in order", () => {
    let robots = [robot()];
    robots = applyPresentationEvent(
      robots,
      event(1, "move", {
        to: { x: 2, y: 2 },
        path: [
          { x: 1, y: 2 },
          { x: 2, y: 2 },
        ],
      }),
    );
    robots = applyPresentationEvent(
      robots,
      event(2, "turn", { fromDirection: "north", toDirection: "east" }),
    );
    robots = applyPresentationEvent(robots, event(3, "damage", { damage: 2 }));
    robots = applyPresentationEvent(robots, event(4, "destroyed"));
    assert.deepEqual(robots[0].position, { x: 2, y: 2 });
    assert.equal(robots[0].direction, "east");
    assert.equal(robots[0].damage, 3);
    assert.equal(robots[0].destroyed, true);
    robots = applyPresentationEvent(robots, event(5, "respawn", { to: { x: 0, y: 0 } }));
    assert.equal(robots[0].destroyed, false);
    assert.deepEqual(robots[0].position, { x: 0, y: 0 });
  });

  test("ignores board-only events when updating robots", () => {
    const before = [robot()];
    assert.equal(
      applyPresentationEvent(before, {
        ...event(1, "laser-fired"),
        seatId: undefined,
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      }),
      before,
    );
  });

  test("reconciles to an authoritative snapshot without retaining mutable references", () => {
    const final = [{ ...robot(), position: { x: 7, y: 4 }, direction: "south" as const }];
    const reconciled = reconcilePresentation([robot()], final);
    assert.deepEqual(reconciled[0].position, { x: 7, y: 4 });
    assert.notEqual(reconciled[0], final[0]);
    assert.notEqual(reconciled[0].position, final[0].position);
  });

  test("rotates across the ±π seam by the shortest arc", () => {
    const from = directionAngle("south") - 0.01;
    const target = shortestAngle(from, directionAngle("west"));
    assert.ok(Math.abs(target - from) < Math.PI);
  });

  test("appends back-to-back batches once and preserves revision order", () => {
    const first = appendPresentationBatch(
      { lastRevision: 0, steps: [] },
      [event(1, "move"), event(2, "turn")],
      "normal",
      false,
    );
    const second = appendPresentationBatch(
      first,
      [event(2, "turn"), event(4, "damage"), event(3, "move")],
      "normal",
      false,
    );
    assert.equal(second.lastRevision, 4);
    assert.deepEqual(
      second.steps.map((step) => step.event.revision),
      [1, 2, 3, 4],
    );
  });

  test("reconnect during playback discards stale keyframes and trusts authority", () => {
    const stale = appendPresentationBatch(
      { lastRevision: 0, steps: [] },
      [event(1, "move"), event(2, "damage")],
      "normal",
      false,
    );
    assert.equal(stale.steps.length, 2);
    const authoritative = [{ ...robot(), position: { x: 9, y: 8 }, damage: 4 }];
    const reset = resetPresentation(authoritative, 12);
    assert.equal(reset.queue.lastRevision, 12);
    assert.equal(reset.queue.steps.length, 0);
    assert.deepEqual(reset.robots[0].position, { x: 9, y: 8 });
    assert.equal(reset.robots[0].damage, 4);
  });
});

test("absolute motion reaches its endpoint without overshoot at any frame rate", () => {
  for (const fps of [15, 30, 60, 144]) {
    let previous = 0;
    for (let elapsed = 0; elapsed <= 900; elapsed += 1000 / fps) {
      const current = motionProgress(elapsed, 850);
      assert.ok(current >= previous && current <= 1);
      previous = current;
    }
    assert.equal(motionProgress(850, 850), 1);
  }
});

test("rear lasers never rotate a robot and respawn respects archive repair", () => {
  const before = [robot()];
  const firing = applyPresentationEvent(before, event(1, "laser-fired", { toDirection: "south" }));
  assert.equal(firing[0].direction, "north");
  const returned = applyPresentationEvent(
    firing,
    event(2, "respawn", { to: { x: 4, y: 5 }, toDirection: "west", data: { damage: 0 } }),
  );
  assert.equal(returned[0].direction, "west");
  assert.equal(returned[0].damage, 0);
});

test("damage and destruction keep the active register and factory stage", () => {
  const steps = compilePresentation(
    [
      event(1, "stage", { seatId: undefined, stage: "lasers", register: 3 }),
      event(2, "damage", { damage: 4 }),
      event(3, "destroyed", { stage: "cleanup" }),
    ],
    "normal",
    false,
  );
  assert.ok(steps.every((step) => step.event.stage === "lasers" && step.event.register === 3));
});
