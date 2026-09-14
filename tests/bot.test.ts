import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addSoloBots, chooseBotProgram, programSoloBots } from '../game/bot';
import { PROGRAM_DECK } from '../game/content/programs';
import { applyCommand, createLobby, resolveTurn, updateLockedRegisters } from '../game/engine';
import type { MatchState, ProgramCard } from '../game/types';

const card = (priority: number) => PROGRAM_DECK.find((candidate) => candidate.priority === priority)!;

function solo(seed = 91) {
  const state = createLobby('SOLOBOTS91', { seatId: 'human', robotId: 'hammer-bot', displayName: 'Ada', connected: true }, 1, seed, 'solo');
  addSoloBots(state);
  applyCommand(state, 'human', { type: 'start', id: 'start', revision: state.revision, courseId: 'risky-exchange', fourLifeRule: false }, 2);
  return state;
}

function assignProgram(state: MatchState, seatId: string, cards: ProgramCard[]) {
  const robot = state.robots.find((candidate) => candidate.seatId === seatId)!;
  let cursor = 0;
  for (const register of robot.registers) if (!register.locked) register.card = cards[cursor++] ?? null;
}

describe('single-player CPU racing', () => {
  test('creates exactly three unique, connected CPU opponents', () => {
    const state = solo();
    const bots = state.robots.filter((robot) => robot.controller === 'bot');
    assert.equal(state.mode, 'solo');
    assert.equal(state.robots.filter((robot) => robot.controller === 'human').length, 1);
    assert.equal(bots.length, 3);
    assert.equal(new Set(state.robots.map((robot) => robot.robotId)).size, 4);
    assert.ok(bots.every((robot) => robot.connected && robot.displayName.endsWith(' CPU')));
  });

  test('chooses deterministic, legal programs and respects locked registers', () => {
    const state = solo();
    const bot = state.robots.find((robot) => robot.controller === 'bot')!;
    bot.damage = 6;
    updateLockedRegisters(bot);
    const first = chooseBotProgram(state, bot.seatId);
    const second = chooseBotProgram(structuredClone(state), bot.seatId);
    assert.deepEqual(first, second);
    assert.equal(first.length, 3);
    assert.equal(new Set(first).size, first.length);
    assert.ok(first.every((id) => state.hands[bot.seatId].some((candidate) => candidate.id === id)));
  });

  test('does not inspect the human driver\'s unrevealed program', () => {
    const state = solo(103);
    const bot = state.robots.find((robot) => robot.controller === 'bot')!;
    const baseline = chooseBotProgram(state, bot.seatId);
    assignProgram(state, 'human', [...state.hands.human].reverse().slice(0, 5));
    state.hands.human.reverse();
    state.robots.find((robot) => robot.seatId === 'human')!.optionState = { shieldDirection: 'east', modifiedRegisters: { brakes: [1] } };
    assert.deepEqual(chooseBotProgram(state, bot.seatId), baseline);
  });

  test('avoids an immediate pit when a safe rotation is available', () => {
    const state = solo(117);
    const bot = state.robots.find((robot) => robot.controller === 'bot')!;
    Object.assign(bot, { position: { x: 0, y: 9 }, archive: { x: 0, y: 8 }, direction: 'east' as const });
    state.hands[bot.seatId] = [card(490), card(670), card(80), card(260), card(30)];
    const [firstId] = chooseBotProgram(state, bot.seatId);
    const first = state.hands[bot.seatId].find((candidate) => candidate.id === firstId)!;
    assert.ok(first.rotation, `expected a rotation first, received ${first.kind}`);
  });

  test('programs all CPUs, resolves once, and leaves no bot countdown', () => {
    const state = solo(129);
    const humanCards = state.hands.human.slice(0, 5).map((candidate) => candidate.id);
    applyCommand(state, 'human', { type: 'program', id: 'human-turn', revision: state.revision, cards: humanCards }, 3);
    const revision = state.revision;
    const events = programSoloBots(state);
    assert.equal(events.filter((event) => event.type === 'program-ready' && event.seatId?.startsWith('cpu-')).length, 3);
    assert.equal(state.revision, revision + 3);
    assert.equal(state.phase, 'programming');
    assert.equal(state.timerDeadline, undefined);
  });

  test('runs one CPU turn after a powered-down human chooses to restart', () => {
    const state = solo(135);
    const human = state.robots.find((robot) => robot.controller === 'human')!;
    human.poweredDown = true;
    human.powerDownNext = true;
    human.finishedProgramming = true;
    state.hands.human = [];
    applyCommand(state, human.seatId, { type: 'stay-powered-down', id: 'restart', revision: state.revision, enabled: false }, 3);
    const events = programSoloBots(state);
    assert.ok(events.some((event) => event.type === 'program-ready' && event.seatId?.startsWith('cpu-')));
    assert.equal(state.phase, 'programming');
    assert.equal(human.poweredDown, false);
    assert.equal(state.timerDeadline, undefined);
  });

  test('advances an empty powered-down turn after every CPU is eliminated', () => {
    const state = solo(137);
    const human = state.robots.find((robot) => robot.controller === 'human')!;
    human.poweredDown = true;
    human.powerDownNext = true;
    human.finishedProgramming = true;
    state.hands.human = [];
    for (const bot of state.robots.filter((robot) => robot.controller === 'bot')) {
      bot.eliminated = true;
      bot.finishedProgramming = true;
    }
    applyCommand(state, human.seatId, { type: 'stay-powered-down', id: 'empty-restart', revision: state.revision, enabled: false }, 3);
    const revision = state.revision;
    programSoloBots(state);
    assert.equal(state.revision, revision + 1);
    assert.equal(state.phase, 'programming');
    assert.equal(human.poweredDown, false);
    assert.equal(human.finishedProgramming, false);
  });

  test('ends immediately when the human is eliminated', () => {
    const state = solo(141);
    const human = state.robots.find((robot) => robot.controller === 'human')!;
    Object.assign(human, { position: { x: 0, y: 9 }, direction: 'east' as const, lives: 1 });
    assignProgram(state, human.seatId, [card(490)]);
    for (const bot of state.robots.filter((robot) => robot.controller === 'bot')) assignProgram(state, bot.seatId, []);
    const events = resolveTurn(state);
    assert.equal(human.eliminated, true);
    assert.equal(state.phase, 'complete');
    assert.equal(state.winnerSeatId, undefined);
    assert.equal(state.completionReason, 'human-eliminated');
    assert.ok(events.some((event) => event.type === 'defeat'));
  });

  test('preserves the first robot to touch the final checkpoint', () => {
    const state = solo(153);
    const [human, bot] = [state.robots[0], state.robots[1]];
    Object.assign(human, { position: { x: 1, y: 4 }, checkpoint: 2 });
    Object.assign(bot, { position: { x: 1, y: 4 }, checkpoint: 2 });
    for (const robot of state.robots) assignProgram(state, robot.seatId, []);
    resolveTurn(state);
    assert.equal(state.winnerSeatId, human.seatId);
    assert.equal(state.completionReason, 'checkpoint');
  });
});
