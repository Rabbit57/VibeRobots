import { courseTile, COURSE_BY_ID } from './content/boards';
import { ROBOTS } from './content/robots';
import { addSeat, applyCommand, resolveReadyTurn, resolveTurn, shuffled } from './engine';
import type { Direction, MatchEvent, MatchState, Position, ProgramCard, RobotState } from './types';

const BEAM_WIDTH = 32;
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const VECTORS: Record<Direction, Position> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};
const OPPOSITE: Record<Direction, Direction> = {
  north: 'south', east: 'west', south: 'north', west: 'east',
};
const DISTANCE_CACHE = new Map<string, number>();

interface Candidate {
  cards: ProgramCard[];
  score: readonly number[];
  key: string;
}

export function addSoloBots(state: MatchState) {
  if (state.mode !== 'solo') throw new Error('CPU robots can only be added to a solo room.');
  const claimed = new Set(state.robots.map((robot) => robot.robotId));
  const opponents = shuffled(ROBOTS.filter((robot) => !claimed.has(robot.id)), state).slice(0, 3);
  opponents.forEach((robot, index) => addSeat(state, {
    seatId: `cpu-${index + 1}`,
    robotId: robot.id,
    displayName: `${robot.name} CPU`,
    controller: 'bot',
    connected: true,
  }));
}

/**
 * Picks a legal, deterministic program without consulting another driver's
 * unrevealed registers. A small beam keeps Durable Object CPU work bounded.
 */
export function chooseBotProgram(state: MatchState, seatId: string): string[] {
  const robot = state.robots.find((candidate) => candidate.seatId === seatId);
  if (!robot || robot.controller !== 'bot') throw new Error('Bot seat not found.');
  const openCount = robot.registers.filter((register) => !register.locked).length;
  if (openCount === 0) return [];
  const hand = state.hands[seatId] ?? [];
  if (hand.length < openCount) throw new Error('Bot does not have enough cards to program.');

  let beam: Candidate[] = [{ cards: [], score: [], key: '' }];
  for (let depth = 0; depth < openCount; depth += 1) {
    const expanded: Candidate[] = [];
    for (const candidate of beam) {
      const used = new Set(candidate.cards.map((card) => card.id));
      for (const card of hand) {
        if (used.has(card.id)) continue;
        const cards = [...candidate.cards, card];
        expanded.push(evaluateCandidate(state, robot, cards));
      }
    }
    expanded.sort(compareCandidates);
    beam = expanded.slice(0, BEAM_WIDTH);
  }
  const best = beam[0];
  if (!best) throw new Error('No legal bot program could be selected.');
  return best.cards.map((card) => card.id);
}

/** Programs each CPU once. Call only after the human has locked a program or
 * explicitly chosen what to do during a powered-down turn. */
export function programSoloBots(state: MatchState): MatchEvent[] {
  if (state.mode !== 'solo' || state.phase !== 'programming') return [];
  const human = state.robots.find((robot) => robot.controller === 'human');
  if (!human || (!human.finishedProgramming && !human.eliminated && !human.poweredDown)) return [];

  const events: MatchEvent[] = [];
  const waitingBots = state.robots.filter((robot) => robot.controller === 'bot' && !robot.finishedProgramming && !robot.eliminated && !robot.destroyed && !robot.poweredDown);
  for (const bot of waitingBots) {
    const cards = chooseBotProgram(state, bot.seatId);
    const result = applyCommand(state, bot.seatId, {
      type: 'program',
      id: crypto.randomUUID(),
      revision: state.revision,
      cards,
    });
    events.push(...result.events);
    if (state.winnerSeatId || state.completionReason === 'human-eliminated') break;
  }
  if (state.phase === 'programming' && state.robots.every((robot) => robot.eliminated || robot.destroyed || robot.poweredDown || robot.finishedProgramming)) {
    events.push(...resolveReadyTurn(state).events);
  }
  if (state.phase === 'programming') {
    for (const bot of state.robots.filter((robot) => robot.controller === 'bot' && robot.poweredDown && robot.powerDownNext && !robot.eliminated)) {
      const result = applyCommand(state, bot.seatId, {
        type: 'stay-powered-down',
        id: crypto.randomUUID(),
        revision: state.revision,
        enabled: false,
      });
      events.push(...result.events);
    }
  }
  return events;
}

function evaluateCandidate(state: MatchState, robot: RobotState, cards: ProgramCard[]): Candidate {
  const simulated = structuredClone(state);
  simulated.phase = 'executing';
  simulated.timerDeadline = undefined;
  for (const entry of simulated.robots) {
    if (entry.seatId !== robot.seatId) {
      simulated.hands[entry.seatId] = [];
      entry.optionState = {};
    }
    let cursor = 0;
    for (const register of entry.registers) {
      if (register.locked) continue;
      register.card = entry.seatId === robot.seatId ? cards[cursor++] ?? null : null;
    }
  }
  resolveTurn(simulated);
  const result = simulated.robots.find((entry) => entry.seatId === robot.seatId)!;
  const course = COURSE_BY_ID.get(simulated.courseId)!;
  const target = course.checkpoints[Math.min(result.checkpoint, course.checkpoints.length - 1)];
  const distance = simulated.winnerSeatId === result.seatId ? 0 : traversableDistance(course, result.position, target);
  const forward = {
    x: result.position.x + VECTORS[result.direction].x,
    y: result.position.y + VECTORS[result.direction].y,
  };
  const facing = traversableDistance(course, forward, target) < distance ? 1 : 0;
  const score = [
    simulated.winnerSeatId === result.seatId ? 1 : 0,
    result.checkpoint,
    result.eliminated || result.destroyed ? 0 : 1,
    result.lives,
    -result.damage,
    -distance,
    facing,
  ] as const;
  return { cards, score, key: cards.map((card) => card.id).join('|') };
}

function compareCandidates(a: Candidate, b: Candidate) {
  for (let index = 0; index < Math.max(a.score.length, b.score.length); index += 1) {
    const difference = (b.score[index] ?? 0) - (a.score[index] ?? 0);
    if (difference) return difference;
  }
  return a.key.localeCompare(b.key);
}

function traversableDistance(course: NonNullable<ReturnType<typeof COURSE_BY_ID.get>>, start: Position, target: Position) {
  if (start.x === target.x && start.y === target.y) return 0;
  const cacheKey = `${course.id}:${start.x},${start.y}:${target.x},${target.y}`;
  const cached = DISTANCE_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;
  const queue: Array<{ position: Position; distance: number }> = [{ position: start, distance: 0 }];
  const visited = new Set([`${start.x},${start.y}`]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const direction of DIRECTIONS) {
      const vector = VECTORS[direction];
      const next = { x: current.position.x + vector.x, y: current.position.y + vector.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      const tile = courseTile(course, next.x, next.y);
      if (!tile || tile.pit || blockedByWall(course, current.position, direction, next)) continue;
      if (next.x === target.x && next.y === target.y) {
        const distance = current.distance + 1;
        DISTANCE_CACHE.set(cacheKey, distance);
        return distance;
      }
      visited.add(key);
      queue.push({ position: next, distance: current.distance + 1 });
    }
  }
  DISTANCE_CACHE.set(cacheKey, 10_000);
  return 10_000;
}

function blockedByWall(course: NonNullable<ReturnType<typeof COURSE_BY_ID.get>>, from: Position, direction: Direction, to: Position) {
  return Boolean(courseTile(course, from.x, from.y)?.walls?.includes(direction) || courseTile(course, to.x, to.y)?.walls?.includes(OPPOSITE[direction]));
}
