import assert from "node:assert/strict";
import { test } from "node:test";
import { Euler, Vector3 } from "three";
import { GEAR_COLORS, surfaceRotation } from "../game/board-visuals";
import { BOARD_BY_ID, COURSE_BY_ID, COURSES, courseTile } from "../game/content/boards";
import {
  addSeat,
  applyCommand,
  createLobby,
  expireProgrammingTimer,
  resolveTurn,
} from "../game/engine";
import { PROGRAM_DECK } from "../game/content/programs";
import type { Direction, MatchEvent, TileDefinition } from "../game/types";

const vectors: Record<Direction, [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};
let sequence = 0;
function fixture(tiles: Record<string, TileDefinition> = {}, count = 2) {
  const id = `board-test-${sequence++}`;
  BOARD_BY_ID.set(id, { id, name: id, width: 12, height: 12, tiles });
  const course = {
    ...COURSES[0],
    id,
    boards: [{ boardId: id, offset: { x: 0, y: 0 } }],
    checkpoints: [],
  };
  COURSE_BY_ID.set(id, course);
  const state = createLobby(
    "BOARDTEST1",
    { seatId: "a", robotId: "hammer-bot", displayName: "Ada", connected: true },
    1,
    91,
  );
  const ids = ["hammer-bot", "hulk-x90", "spin-bot", "twonky"];
  for (let i = 1; i < count; i++)
    addSeat(state, {
      seatId: String.fromCharCode(97 + i),
      robotId: ids[i],
      displayName: `Driver ${i}`,
      connected: true,
    });
  for (const [i, robot] of state.robots.entries())
    applyCommand(
      state,
      robot.seatId,
      {
        type: "choose-spawn",
        id: `dock-${i}`,
        revision: state.revision,
        dock: course.docks[i].number,
      },
      1,
    );
  applyCommand(
    state,
    "a",
    { type: "start", id: "start", revision: state.revision, courseId: id, fourLifeRule: false },
    2,
  );
  state.robots.forEach((robot, i) =>
    Object.assign(robot, {
      position: { x: i + 3, y: 3 },
      direction: "north",
      poweredDown: true,
      powerDownNext: true,
    }),
  );
  return { state, course };
}
const first = (events: MatchEvent[], type: string, seat = "a") =>
  events.filter((event) => event.register === 1 && event.type === type && event.seatId === seat);

test("printed arrows agree with north/east/south/west movement vectors", () => {
  for (const [direction, [x, z]] of Object.entries(vectors)) {
    const arrow = new Vector3(0, 1, 0).applyEuler(
      new Euler(...surfaceRotation(direction as Direction)),
    );
    assert.ok(Math.abs(arrow.x - x) < 1e-10, `${direction}: x`);
    assert.ok(Math.abs(arrow.z - z) < 1e-10, `${direction}: z`);
  }
  assert.notEqual(GEAR_COLORS.left, GEAR_COLORS.right);
});

for (const direction of Object.keys(vectors) as Direction[])
  test(`${direction}: normal and express conveyor displacement`, () => {
    for (const speed of [1, 2] as const) {
      const [dx, dy] = vectors[direction];
      const { state } = fixture({
        "3,3": { conveyor: { direction, speed } },
        [`${3 + dx},${3 + dy}`]: { conveyor: { direction, speed } },
      });
      state.robots[1].position = { x: 10, y: 10 };
      const moves = first(resolveTurn(state), "conveyor");
      assert.equal(moves.length, speed);
      assert.deepEqual(moves.at(-1)?.to, { x: 3 + dx * speed, y: 3 + dy * speed });
      assert.equal(state.robots[0].direction, "north");
    }
  });

test("belts move a convoy simultaneously, independent of dock priority", () => {
  const { state } = fixture({
    "3,3": { conveyor: { direction: "east", speed: 1 } },
    "4,3": { conveyor: { direction: "east", speed: 1 } },
  });
  const copy = structuredClone(state);
  copy.dockingOrder.reverse();
  for (const current of [state, copy]) {
    const events = resolveTurn(current);
    assert.deepEqual(first(events, "conveyor")[0]?.to, { x: 4, y: 3 });
    assert.deepEqual(first(events, "conveyor", "b")[0]?.to, { x: 5, y: 3 });
    assert.equal(
      events.some((event) => event.type === "push"),
      false,
    );
  }
  assert.deepEqual(state.robots, copy.robots);
});

test("converging belts, stationary obstacles, head-on swaps and stopped chains do not push", () => {
  const cases: Record<string, TileDefinition>[] = [
    { "3,3": { conveyor: { direction: "east", speed: 1 } } },
    {
      "3,3": { conveyor: { direction: "east", speed: 1 } },
      "4,3": { conveyor: { direction: "west", speed: 1 } },
    },
    {
      "3,3": { conveyor: { direction: "east", speed: 1 } },
      "4,3": { conveyor: { direction: "east", speed: 1 } },
      "5,3": { walls: ["west"] },
    },
  ];
  for (const tiles of cases) {
    const { state } = fixture(tiles);
    assert.equal(
      resolveTurn(state).filter((event) => ["conveyor", "push"].includes(event.type)).length,
      0,
    );
  }
  const { state } = fixture({
    "3,3": { conveyor: { direction: "east", speed: 1 } },
    "5,3": { conveyor: { direction: "west", speed: 1 } },
  });
  state.robots[1].position.x = 5;
  assert.equal(
    resolveTurn(state).some((event) => event.type === "conveyor"),
    false,
  );
});

test("bend rotates curved arrivals, but not straight merges, programmed arrivals or stabilized robots", () => {
  for (const entry of ["curve", "straight", "program", "stabilized"]) {
    const { state } = fixture({
      "3,3": { conveyor: { direction: entry === "straight" ? "north" : "east", speed: 1 } },
      [entry === "straight" ? "3,2" : "4,3"]: {
        conveyor: { direction: "north", speed: 1, rotate: "left" },
      },
    });
    state.robots[1].position = { x: 10, y: 10 };
    if (entry === "stabilized") state.robots[0].optionState.gyroscopicStabilizer = true;
    if (entry === "program") {
      state.robots[0].poweredDown = false;
      state.robots[0].direction = "east";
      state.robots[0].registers[0].card = PROGRAM_DECK.find((card) => card.kind === "move1")!;
    }
    const turns = first(resolveTurn(state), "turn").filter(
      (event) => event.source === "conveyor-bend",
    );
    assert.equal(turns.length, entry === "curve" ? 1 : 0, entry);
    if (entry === "curve") assert.equal(turns[0].toDirection, "west");
  }
});

test("every express loop has four rotating corners, including rotated course boards", () => {
  for (const course of COURSES.filter((course) => course.id !== "risky-exchange")) {
    const loopCorners =
      course.id === "dizzy-dash"
        ? [
            [1, 1],
            [4, 1],
            [4, 4],
            [1, 4],
          ]
        : [
            [1, 13],
            [10, 13],
            [10, 22],
            [1, 22],
          ];
    for (const [x, y] of loopCorners)
      assert.equal(courseTile(course, x, y)?.conveyor?.rotate, "right");
  }
  const tile = courseTile(COURSES[2], 6, 9);
  assert.equal(tile?.conveyor?.direction, "east");
  assert.equal(tile?.conveyor?.rotate, "right");
});

for (const gear of ["left", "right"] as const)
  test(`${gear} gear rotates exactly 90 degrees per register`, () => {
    const { state } = fixture({ "3,3": { gear } });
    const events = first(resolveTurn(state), "gear");
    assert.equal(events.length, 1);
    assert.equal(events[0].fromDirection, "north");
    assert.equal(events[0].toDirection, gear === "right" ? "east" : "west");
  });

test("pushers use printed registers and preserve their stage when pushing chains", () => {
  const { state } = fixture({
    "3,3": { pusher: { direction: "east", activeRegisters: [2, 4] } },
    "4,3": { pusher: { direction: "south", activeRegisters: [2, 4] } },
  });
  state.dockingOrder = ["a", "b"];
  const events = resolveTurn(state);
  assert.equal(
    events.some((event) => event.type === "pusher" && event.register === 1),
    false,
  );
  const push = events.find((event) => event.type === "push");
  assert.equal(push?.stage, "pushers");
  assert.equal(push?.register, 2);
  assert.deepEqual(push?.to, { x: 5, y: 3 });
  assert.equal(
    events.some((event) => event.type === "pusher" && event.seatId === "b" && event.register === 2),
    false,
  );
});

test("factory laser hits its emitter square; first robot and walls stop the beam", () => {
  for (const blocked of ["robot", "wall", "emitter"]) {
    const { state } = fixture({
      "2,3": { laser: { direction: "east", count: 2 }, walls: ["west"] },
      ...(blocked === "wall" ? { "3,3": { walls: ["west" as const] } } : {}),
    });
    if (blocked === "emitter") state.robots[0].position = { x: 2, y: 3 };
    const events = resolveTurn(state);
    const laser = events.find(
      (event) => event.register === 1 && event.type === "laser-fired" && event.source === "factory",
    );
    assert.deepEqual(laser?.path?.at(-1), { x: blocked === "robot" ? 3 : 2, y: 3 });
    const damaged = events.filter((event) => event.type === "damage");
    assert.equal(
      damaged.some((event) => event.seatId === "a"),
      blocked !== "wall",
    );
    assert.equal(
      damaged.some((event) => event.seatId === "b"),
      false,
    );
  }
});

test("repair and upgrades happen only at cleanup; a respawn does not receive a free repair", () => {
  const { state } = fixture({ "3,3": { repair: 1, archive: true, optionSite: true } });
  const robot = state.robots[0];
  Object.assign(robot, { poweredDown: false, powerDownNext: false, damage: 3 });
  const events = resolveTurn(state);
  assert.equal(robot.damage, 2);
  assert.equal(robot.options.length, 1);
  assert.deepEqual(robot.archive, { x: 3, y: 3 });
  assert.equal(events.find((event) => event.type === "option-acquired")?.stage, "cleanup");
  Object.assign(robot, { destroyed: true, damage: 10, options: [] });
  resolveTurn(state);
  assert.equal(robot.damage, 2);
  assert.equal(robot.options.length, 0);
});

test("starting docks remain valid for movement and archive respawn; gaps are still off-board", () => {
  const { state, course } = fixture();
  const robot = state.robots[0];
  robot.destroyed = true;
  robot.poweredDown = false;
  robot.powerDownNext = false;
  robot.optionState = { gyroscopicStabilizer: true };
  const events = resolveTurn(state);
  assert.deepEqual(events.find((event) => event.type === "respawn")?.to, robot.archive);
  assert.deepEqual(robot.optionState, {});
  assert.equal(robot.damage, 2);
  assert.ok(courseTile(course, 0, 12));
  assert.equal(courseTile(course, 2, 12), undefined);
});

test("spawn choices are exclusive, required, retained across courses and determine dock priority", () => {
  const state = createLobby("SPAWNTEST1", {
    seatId: "a",
    robotId: "hammer-bot",
    displayName: "Ada",
  });
  addSeat(state, { seatId: "b", robotId: "hulk-x90", displayName: "Grace" });
  const start = () =>
    applyCommand(state, "a", {
      type: "start",
      id: "start",
      revision: state.revision,
      courseId: "against-the-grain",
      fourLifeRule: false,
    });
  assert.throws(start, /Every player/);
  const choose = (seatId: string, dock: number) =>
    applyCommand(state, seatId, {
      type: "choose-spawn",
      id: `${seatId}-${dock}`,
      revision: state.revision,
      dock,
    });
  choose("a", 8);
  assert.throws(() => choose("b", 8), /already taken/);
  assert.throws(() => choose("b", 99), /marked starting dock/);
  choose("b", 1);
  start();
  assert.deepEqual(state.robots[0].position, { x: 11, y: 24 });
  assert.deepEqual(state.robots[0].archive, state.robots[0].position);
  assert.deepEqual(state.dockingOrder, ["b", "a"]);
  assert.throws(() => choose("a", 2), /before the race/);
});

test("only the last multiplayer programmer starts a shared 30-second timer", () => {
  const { state } = fixture({}, 3);
  state.robots.forEach((robot) =>
    Object.assign(robot, { poweredDown: false, powerDownNext: false }),
  );
  const program = (seatId: string, now: number) =>
    applyCommand(
      state,
      seatId,
      {
        type: "program",
        id: seatId,
        revision: state.revision,
        cards: state.hands[seatId].slice(0, 5).map((card) => card.id),
      },
      now,
    );
  program("a", 1_000);
  assert.equal(state.timerDeadline, undefined);
  program("b", 5_000);
  assert.equal(state.timerDeadline, 35_000);
  assert.equal(expireProgrammingTimer(state, 34_999).events.length, 0);
  const result = expireProgrammingTimer(state, 35_000);
  assert.equal(result.events.filter((event) => event.type === "timer-expired").length, 1);
  assert.equal(
    result.events.filter((event) => event.type === "stage" && event.stage === "cleanup").length,
    1,
  );
  assert.equal(state.timerDeadline, undefined);
  assert.equal(expireProgrammingTimer(state, 60_000).events.length, 0);
  assert.ok(
    result.events.every((event, i, list) => i === 0 || event.revision > list[i - 1].revision),
  );
});

test("solo programming never starts a countdown", () => {
  const { state } = fixture();
  state.mode = "solo";
  state.robots.forEach((robot) =>
    Object.assign(robot, { poweredDown: false, powerDownNext: false }),
  );
  applyCommand(
    state,
    "a",
    {
      type: "program",
      id: "plan",
      revision: state.revision,
      cards: state.hands.a.slice(0, 5).map((card) => card.id),
    },
    100,
  );
  assert.equal(state.timerDeadline, undefined);
});

test("only the host can change the lobby course and dock locations follow it", () => {
  const state = createLobby("COURSETEST", {
    seatId: "a",
    robotId: "hammer-bot",
    displayName: "Ada",
  });
  addSeat(state, { seatId: "b", robotId: "hulk-x90", displayName: "Grace" });
  applyCommand(state, "b", { type: "choose-spawn", id: "dock", revision: state.revision, dock: 8 });
  assert.throws(
    () =>
      applyCommand(state, "b", {
        type: "choose-course",
        id: "bad",
        revision: state.revision,
        courseId: "against-the-grain",
      }),
    /Only the host/,
  );
  applyCommand(state, "a", {
    type: "choose-course",
    id: "course",
    revision: state.revision,
    courseId: "against-the-grain",
  });
  assert.equal(state.courseId, "against-the-grain");
  assert.deepEqual(state.robots[1].position, { x: 11, y: 24 });
  assert.equal(state.robots[1].spawnDock, 8);
});
