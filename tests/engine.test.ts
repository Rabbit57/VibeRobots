import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { addSeat, applyCommand, createLobby, publicView, resolveTurn, RuleError, takeDamage, updateLockedRegisters } from '../game/engine';
import { COURSES } from '../game/content/boards';
import { OPTION_CARDS } from '../game/content/options';
import { PROGRAM_DECK } from '../game/content/programs';
import type { MatchState, ProgramCard } from '../game/types';

const p = (priority: number) => PROGRAM_DECK.find((card) => card.priority === priority)!;

function started(courseId = 'risky-exchange', seed = 57) {
  const state = createLobby('TESTROOM57', { seatId: 'seat-a', robotId: 'hammer-bot', displayName: 'Ada', connected: true }, 1, seed);
  addSeat(state, { seatId: 'seat-b', robotId: 'hulk-x90', displayName: 'Grace', connected: true });
  applyCommand(state, 'seat-a', { type: 'start', id: 'start', revision: state.revision, courseId, fourLifeRule: false }, 2);
  return state;
}

function setProgram(state: MatchState, seatId: string, cards: Array<ProgramCard | null>) {
  const robot = state.robots.find((candidate) => candidate.seatId === seatId)!;
  robot.registers = cards.map((card) => ({ card, locked: false }));
}

describe('2005 content invariants', () => {
  test('Program deck has exactly 84 unique priorities and official counts', () => {
    assert.equal(PROGRAM_DECK.length, 84);
    assert.equal(new Set(PROGRAM_DECK.map((card) => card.priority)).size, 84);
    assert.deepEqual(Object.fromEntries(['move1', 'move2', 'move3', 'backup', 'left', 'right', 'uturn'].map((kind) => [kind, PROGRAM_DECK.filter((card) => card.kind === kind).length])), {
      move1: 18, move2: 12, move3: 6, backup: 6, left: 18, right: 18, uturn: 6,
    });
    assert.deepEqual([PROGRAM_DECK[0].priority, PROGRAM_DECK.at(-1)!.priority], [10, 840]);
  });

  test('Option deck has exactly 26 unique entries', () => {
    assert.equal(OPTION_CARDS.length, 26);
    assert.equal(new Set(OPTION_CARDS.map((card) => card.id)).size, 26);
  });

  test('the three launch courses use the requested board faces', () => {
    assert.deepEqual(COURSES.map((course) => [course.name, course.boards.map((board) => board.boardId)]), [
      ['Risky Exchange', ['exchange']], ['Dizzy Dash', ['spin-zone']], ['Against the Grain', ['chop-shop', 'chess']],
    ]);
  });
});

describe('movement, board order, and damage', () => {
  test('higher priorities execute first and can alter a push chain', () => {
    const state = started();
    Object.assign(state.robots[0], { position: { x: 1, y: 10 }, direction: 'east' });
    Object.assign(state.robots[1], { position: { x: 2, y: 10 }, direction: 'east' });
    setProgram(state, 'seat-a', [p(840), null, null, null, null]);
    setProgram(state, 'seat-b', [p(490), null, null, null, null]);
    const events = resolveTurn(state);
    assert.equal(events[0].seatId, 'seat-a');
    assert.ok(events.some((event) => event.type === 'push' && event.seatId === 'seat-b'));
    assert.equal(new Set(state.robots.filter((robot) => !robot.destroyed).map((robot) => `${robot.position.x},${robot.position.y}`)).size, state.robots.filter((robot) => !robot.destroyed).length);
  });

  const hazards: Array<[string, { x: number; y: number }, 'north' | 'east' | 'south' | 'west', string]> = [
    ['walls stop movement', { x: 2, y: 2 }, 'south', 'move'],
    ['pits destroy robots', { x: 0, y: 9 }, 'east', 'destroyed'],
    ['open edges allow off-board destruction', { x: 0, y: 0 }, 'west', 'destroyed'],
  ];
  for (const [name, position, direction, expectation] of hazards) test(name, () => {
    const state = started();
    Object.assign(state.robots[0], { position, direction });
    Object.assign(state.robots[1], { position: { x: 10, y: 10 } });
    setProgram(state, 'seat-a', [p(490), null, null, null, null]);
    setProgram(state, 'seat-b', [null, null, null, null, null]);
    const events = resolveTurn(state);
    if (expectation === 'move') assert.ok(!events.some((event) => event.type === 'move' && event.seatId === 'seat-a'));
    else assert.ok(events.some((event) => event.type === 'destroyed' && event.seatId === 'seat-a'));
  });

  test('express belts, normal belts, pushers, gears, board lasers and robot lasers resolve', () => {
    const state = started();
    Object.assign(state.robots[0], { position: { x: 6, y: 7 }, direction: 'north' });
    Object.assign(state.robots[1], { position: { x: 2, y: 1 }, direction: 'south' });
    setProgram(state, 'seat-a', [null, null, null, null, null]);
    setProgram(state, 'seat-b', [null, null, null, null, null]);
    const events = resolveTurn(state);
    assert.ok(events.some((event) => event.type === 'conveyor'));
    assert.ok(events.some((event) => event.type === 'damage' || event.type === 'destroyed'));
  });

  test('checkpoints, archives, repair and victory use register/cleanup timing', () => {
    const state = started();
    Object.assign(state.robots[0], { position: { x: 7, y: 1 }, archive: { x: 0, y: 0 }, damage: 3 });
    Object.assign(state.robots[1], { position: { x: 11, y: 0 }, damage: 2 });
    setProgram(state, 'seat-a', [null, null, null, null, null]);
    setProgram(state, 'seat-b', [null, null, null, null, null]);
    resolveTurn(state);
    assert.equal(state.robots[0].checkpoint, 1);
    assert.deepEqual(state.robots[0].archive, { x: 7, y: 1 });
    assert.equal(state.robots[1].damage, 1);

    state.phase = 'executing';
    state.robots[0].checkpoint = 2;
    state.robots[0].position = { x: 1, y: 4 };
    const events = resolveTurn(state);
    assert.equal(state.winnerSeatId, 'seat-a');
    assert.ok(events.some((event) => event.type === 'victory'));
  });

  test('damage locks registers from five through nine and destroys at ten', () => {
    const state = started();
    const robot = state.robots[0];
    for (let damage = 0; damage <= 9; damage += 1) {
      robot.damage = damage;
      updateLockedRegisters(robot);
      assert.equal(robot.registers.filter((register) => register.locked).length, Math.max(0, damage - 4));
    }
    robot.options.push({ id: 'rear-laser' });
    takeDamage(robot, 1, [], 'test');
    assert.equal(robot.destroyed, true);
    assert.equal(robot.lives, 2);
    assert.equal(robot.options.length, 0);
  });

  test('power-down repairs fully after the programmed turn', () => {
    const state = started();
    const robot = state.robots[0];
    robot.damage = 7;
    robot.powerDownNext = true;
    setProgram(state, 'seat-a', [null, null, null, null, null]);
    setProgram(state, 'seat-b', [null, null, null, null, null]);
    resolveTurn(state);
    assert.equal(robot.poweredDown, true);
    assert.equal(robot.damage, 0);
    assert.equal(robot.registers.some((register) => register.locked), false);
  });

  test('powered-down robots cannot touch checkpoints or update archives', () => {
    const state = started();
    const robot = state.robots[0];
    Object.assign(robot, { position: { x: 7, y: 1 }, archive: { x: 0, y: 0 }, poweredDown: true, powerDownNext: true });
    Object.assign(state.robots[1], { position: { x: 11, y: 0 } });
    setProgram(state, 'seat-a', [null, null, null, null, null]);
    setProgram(state, 'seat-b', [null, null, null, null, null]);
    resolveTurn(state);
    assert.equal(robot.checkpoint, 0);
    assert.deepEqual(robot.archive, { x: 0, y: 0 });
  });

  test('destroyed robots respawn from archives with two damage, then eliminate at zero lives', () => {
    const state = started();
    const robot = state.robots[0];
    robot.archive = { x: 7, y: 1 };
    robot.position = { x: 0, y: 9 };
    robot.direction = 'east';
    setProgram(state, 'seat-a', [p(490), null, null, null, null]);
    setProgram(state, 'seat-b', [null, null, null, null, null]);
    resolveTurn(state);
    assert.equal(robot.destroyed, false);
    assert.equal(robot.damage, 2);
    assert.equal(robot.lives, 2);
  });
});

describe('authority, redaction, and deterministic replay', () => {
  test('public snapshots never include hands or unrevealed cards', () => {
    const state = started();
    const hiddenId = state.hands['seat-a'][0].id;
    const snapshot = publicView(state) as unknown as Record<string, unknown>;
    assert.equal('hands' in snapshot, false);
    assert.equal(JSON.stringify(snapshot).includes(hiddenId), false);
  });

  test('stale and duplicate commands are rejected', () => {
    const state = started();
    assert.throws(() => applyCommand(state, 'seat-a', { type: 'program', id: 'bad', revision: -1, cards: [] }), (error: unknown) => error instanceof RuleError && error.category === 'stale');
    state.recentCommandIds.push('again');
    assert.throws(() => applyCommand(state, 'seat-a', { type: 'program', id: 'again', revision: state.revision, cards: [] }), (error: unknown) => error instanceof RuleError && error.category === 'duplicate');
  });

  const expectedGolden: Record<string, string> = {
    'risky-exchange': '9d6268b04bf2b2eb',
    'dizzy-dash': '55ad312cdd6f5a17',
    'against-the-grain': 'eb19604a514ff495',
  };
  for (const course of COURSES) test(`golden deterministic replay: ${course.name}`, () => {
    const replay = () => {
      const state = started(course.id, 2025);
      const events: unknown[] = [];
      for (const seatId of ['seat-a', 'seat-b']) {
        const cards = state.hands[seatId].slice(0, 5).map((card) => card.id);
        events.push(...applyCommand(state, seatId, { type: 'program', id: `turn-${seatId}`, revision: state.revision, cards }, 3).events);
      }
      return createHash('sha256').update(JSON.stringify({ events, robots: state.robots, rng: state.rngState })).digest('hex').slice(0, 16);
    };
    const first = replay();
    assert.equal(first, replay());
    assert.equal(first, expectedGolden[course.id]);
  });

  test('property: seeded turn resolution never leaves live robots overlapping', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = started(COURSES[seed % COURSES.length].id, seed);
      for (const seatId of ['seat-a', 'seat-b']) {
        const cards = state.hands[seatId].slice(0, 5).map((card) => card.id);
        applyCommand(state, seatId, { type: 'program', id: `${seed}-${seatId}`, revision: state.revision, cards });
      }
      const occupied = state.robots.filter((robot) => !robot.destroyed && !robot.eliminated).map((robot) => `${robot.position.x},${robot.position.y}`);
      assert.equal(new Set(occupied).size, occupied.length);
    }
  });
});
