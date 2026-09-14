import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addSeat, applyCommand, applyOptionEffect, createLobby, takeDamage } from '../game/engine';
import { OPTION_CARDS } from '../game/content/options';
import type { MatchEvent } from '../game/types';

function fixture(optionId: string) {
  const state = createLobby('OPTIONTEST', { seatId: 'a', robotId: 'hammer-bot', displayName: 'A' }, 1, 99);
  addSeat(state, { seatId: 'b', robotId: 'hulk-x90', displayName: 'B' });
  state.robots.filter((robot) => robot.controller === 'human').forEach((robot, index) => applyCommand(state, robot.seatId, { type: 'choose-spawn', id: `dock-${index}`, revision: state.revision, dock: [7, 5][index] }, 1));
  applyCommand(state, 'a', { type: 'start', id: 'start', revision: state.revision, courseId: 'risky-exchange', fourLifeRule: false });
  const robot = state.robots[0];
  const definition = OPTION_CARDS.find((card) => card.id === optionId)!;
  robot.options = [{ id: optionId, charges: definition.charges }];
  const events: MatchEvent[] = [];
  return { state, robot, other: state.robots[1], events };
}

describe('all 26 Option cards', () => {
  for (const option of OPTION_CARDS) test(`${option.name}: installation, timing, activation, interaction, and survival metadata`, () => {
    const { state, robot, other, events } = fixture(option.id);
    assert.ok(['always', 'programming', 'movement', 'laser', 'damage', 'power-down', 'respawn'].includes(option.timing));
    assert.ok(option.summary.length > 20);
    assert.doesNotThrow(() => applyOptionEffect(state, robot, option.id, { targetSeatId: other.seatId, register: 3, optionId: 'test', direction: 'north', cardId: state.hands[robot.seatId][0]?.id }, events));
    assert.ok(events.some((event) => event.type === 'option-activated'));
  });

  test('Ablative Coat prevents exactly three damage and depletes', () => {
    const { robot, events } = fixture('ablative-coat');
    takeDamage(robot, 2, events, 'test');
    assert.equal(robot.damage, 0);
    assert.equal(robot.options[0].charges, 1);
    takeDamage(robot, 3, events, 'test');
    assert.equal(robot.damage, 2);
    assert.equal(robot.options.length, 0);
  });

  test('Power-Down Shield prevents one point per damage application', () => {
    const { robot, events } = fixture('power-down-shield');
    robot.poweredDown = true;
    takeDamage(robot, 3, events, 'test');
    assert.equal(robot.damage, 2);
  });

  test('Mini Howitzer depletes after five activations', () => {
    const { state, robot, other, events } = fixture('mini-howitzer');
    robot.position = { x: 1, y: 1 };
    other.position = { x: 3, y: 1 };
    for (let i = 0; i < 5; i += 1) {
      other.position = { x: 3, y: 1 };
      applyOptionEffect(state, robot, 'mini-howitzer', { targetSeatId: other.seatId }, events);
    }
    assert.equal(robot.options.some((option) => option.id === 'mini-howitzer'), false);
  });

  test('critical damage destroys one installed Option and costs a life', () => {
    const { robot, events } = fixture('rear-laser');
    robot.damage = 9;
    takeDamage(robot, 1, events, 'test');
    assert.equal(robot.destroyed, true);
    assert.equal(robot.options.length, 0);
    assert.equal(robot.lives, 2);
  });
});
