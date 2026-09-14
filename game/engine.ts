import { courseBounds, courseTile, COURSE_BY_ID, COURSES } from './content/boards';
import { OPTION_BY_ID, OPTION_CARDS } from './content/options';
import { PROGRAM_BY_ID, PROGRAM_DECK } from './content/programs';
import { ROBOT_BY_ID } from './content/robots';
import type {
  CourseDefinition,
  Direction,
  MatchCommand,
  MatchEvent,
  MatchState,
  Position,
  PrivateMatchView,
  ProgramCard,
  PublicMatchView,
  RobotState,
} from './types';

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const VECTORS: Record<Direction, Position> = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};
const OPPOSITE: Record<Direction, Direction> = {
  north: 'south', east: 'west', south: 'north', west: 'east',
};

export class RuleError extends Error {
  constructor(public category: 'stale' | 'duplicate' | 'illegal' | 'out-of-turn' | 'unauthorized', message: string) {
    super(message);
  }
}

export interface SeatSetup {
  seatId: string;
  robotId: string;
  displayName: string;
  connected?: boolean;
}

export interface CommandResult {
  state: MatchState;
  events: MatchEvent[];
}

export function nextRandom(state: { rngState: number }): number {
  state.rngState = (Math.imul(state.rngState, 1_664_525) + 1_013_904_223) >>> 0;
  return state.rngState / 4_294_967_296;
}

export function shuffled<T>(items: readonly T[], state: { rngState: number }): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createLobby(roomCode: string, host: SeatSetup, now = Date.now(), seed = cryptoSeed()): MatchState {
  return {
    roomCode,
    revision: 0,
    eventRevision: 0,
    phase: 'lobby',
    courseId: COURSES[0].id,
    fourLifeRule: false,
    hostSeatId: host.seatId,
    dockingOrder: [],
    robots: [newRobot(host, { x: 0, y: 12 })],
    programDeck: [],
    optionDeck: [],
    hands: {},
    registerIndex: 0,
    rngState: seed >>> 0,
    createdAt: now,
    updatedAt: now,
    recentCommandIds: [],
  };
}

export function addSeat(state: MatchState, setup: SeatSetup): MatchState {
  if (state.phase !== 'lobby') throw new RuleError('out-of-turn', 'The match has already started.');
  if (state.robots.length >= 8) throw new RuleError('illegal', 'This room is full.');
  if (!ROBOT_BY_ID.has(setup.robotId)) throw new RuleError('illegal', 'Unknown robot.');
  if (state.robots.some((robot) => robot.robotId === setup.robotId)) throw new RuleError('illegal', 'That robot is already claimed.');
  state.robots.push(newRobot(setup, { x: 0, y: 12 }));
  state.revision += 1;
  state.updatedAt = Date.now();
  return state;
}

function newRobot(setup: SeatSetup, dock: Position): RobotState {
  return {
    ...setup,
    connected: setup.connected ?? false,
    position: { ...dock },
    direction: 'north',
    archive: { ...dock },
    damage: 0,
    lives: 3,
    checkpoint: 0,
    registers: Array.from({ length: 5 }, () => ({ card: null, locked: false })),
    options: [],
    optionState: {},
    poweredDown: false,
    powerDownNext: false,
    destroyed: false,
    eliminated: false,
    finishedProgramming: false,
  };
}

export function applyCommand(state: MatchState, seatId: string, command: MatchCommand, now = Date.now()): CommandResult {
  if (!state.robots.some((robot) => robot.seatId === seatId)) throw new RuleError('unauthorized', 'Seat does not belong to this room.');
  if (command.revision !== state.revision) throw new RuleError('stale', 'The room changed. Refreshing from the server.');
  if (state.recentCommandIds.includes(command.id)) throw new RuleError('duplicate', 'That command was already accepted.');
  if (state.phase === 'paused') throw new RuleError('out-of-turn', 'The match is paused while a player reconnects.');

  const events: MatchEvent[] = [];
  if (command.type === 'start') startMatch(state, seatId, command.courseId, command.fourLifeRule, events);
  else if (command.type === 'program') submitProgram(state, seatId, command.cards, events);
  else if (command.type === 'announce-power-down') announcePowerDown(state, seatId, command.enabled, events);
  else if (command.type === 'stay-powered-down') stayPoweredDown(state, seatId, command.enabled, events);
  else if (command.type === 'option') activateOption(state, seatId, command.optionId, command.payload ?? {}, events);
  else resolveDecision(state, seatId, command.choice, events);

  state.revision += 1;
  state.updatedAt = now;
  state.recentCommandIds = [...state.recentCommandIds.slice(-127), command.id];
  return { state, events: finalizeEvents(state, events) };
}

function startMatch(state: MatchState, seatId: string, courseId: string, fourLifeRule: boolean, events: MatchEvent[]) {
  if (state.phase !== 'lobby') throw new RuleError('out-of-turn', 'The match has already started.');
  if (state.hostSeatId !== seatId) throw new RuleError('unauthorized', 'Only the host can start the match.');
  if (state.robots.length < 2) throw new RuleError('illegal', 'At least two players are required.');
  const course = COURSE_BY_ID.get(courseId);
  if (!course) throw new RuleError('illegal', 'Unknown course.');
  if (fourLifeRule && state.robots.length < 5) throw new RuleError('illegal', 'The four-life rule is available with five or more players.');

  state.courseId = courseId;
  state.fourLifeRule = fourLifeRule;
  state.dockingOrder = shuffled(state.robots.map((robot) => robot.seatId), state);
  state.programDeck = shuffled(PROGRAM_DECK, state);
  state.optionDeck = shuffled(OPTION_CARDS.map((option) => option.id), state);
  state.robots.forEach((robot, index) => {
    const dock = course.docks[index];
    robot.position = { x: dock.x, y: dock.y };
    robot.archive = { ...robot.position };
    robot.direction = dock.direction;
    robot.lives = fourLifeRule ? 4 : 3;
  });
  state.phase = 'programming';
  dealHands(state);
  events.push(event('match-started', `${state.robots.length} robots entered ${course.name}.`));
}

function submitProgram(state: MatchState, seatId: string, cardIds: string[], events: MatchEvent[]) {
  if (state.phase !== 'programming') throw new RuleError('out-of-turn', 'Programs cannot be submitted now.');
  const robot = robotFor(state, seatId);
  if (robot.eliminated || robot.destroyed || robot.poweredDown) throw new RuleError('out-of-turn', 'This robot is not programming this turn.');
  if (robot.finishedProgramming) throw new RuleError('duplicate', 'This program is already locked in.');
  const open = robot.registers.filter((register) => !register.locked).length;
  if (cardIds.length !== open || new Set(cardIds).size !== cardIds.length) throw new RuleError('illegal', `Choose exactly ${open} different cards.`);
  const handIds = new Set(state.hands[seatId]?.map((card) => card.id));
  if (!cardIds.every((id) => handIds.has(id))) throw new RuleError('illegal', 'A selected card is not in your hand.');
  let cursor = 0;
  for (const register of robot.registers) if (!register.locked) register.card = PROGRAM_BY_ID.get(cardIds[cursor++])!;
  robot.finishedProgramming = true;
  events.push(event('program-ready', `${robot.displayName} locked in a program.`, robot));

  const active = state.robots.filter((candidate) => !candidate.eliminated && !candidate.destroyed && !candidate.poweredDown);
  const unfinished = active.filter((candidate) => !candidate.finishedProgramming);
  state.timerDeadline = unfinished.length === 1 ? Date.now() + 30_000 : undefined;
  if (unfinished.length === 0) resolveTurn(state, events);
}

function announcePowerDown(state: MatchState, seatId: string, enabled: boolean, events: MatchEvent[]) {
  if (state.phase !== 'programming') throw new RuleError('out-of-turn', 'Power-down declarations happen during programming.');
  const robot = robotFor(state, seatId);
  robot.powerDownNext = enabled;
  events.push(event('power-down-announced', `${robot.displayName} ${enabled ? 'announced a power-down' : 'cancelled its power-down'}.`, robot));
}

function stayPoweredDown(state: MatchState, seatId: string, enabled: boolean, events: MatchEvent[]) {
  const robot = robotFor(state, seatId);
  if (!robot.poweredDown) throw new RuleError('out-of-turn', 'This robot is not powered down.');
  robot.powerDownNext = enabled;
  events.push(event('power-down-status', `${robot.displayName} will ${enabled ? 'remain offline' : 'restart next turn'}.`, robot));
}

function activateOption(state: MatchState, seatId: string, optionId: string, payload: Record<string, unknown>, events: MatchEvent[]) {
  const robot = robotFor(state, seatId);
  if (!robot.options.some((option) => option.id === optionId)) throw new RuleError('illegal', 'That Option is not installed.');
  applyOptionEffect(state, robot, optionId, payload, events);
}

function resolveDecision(state: MatchState, seatId: string, choice: string, events: MatchEvent[]) {
  if (!state.pendingDecision || state.pendingDecision.seatId !== seatId) throw new RuleError('out-of-turn', 'No decision is waiting for this seat.');
  if (!state.pendingDecision.choices.includes(choice)) throw new RuleError('illegal', 'That choice is unavailable.');
  state.pendingDecision = undefined;
  state.phase = 'programming';
  events.push(event('decision', 'A pending choice was resolved.', robotFor(state, seatId)));
}

export function resolveTurn(state: MatchState, events: MatchEvent[] = []): MatchEvent[] {
  const course = requireCourse(state);
  state.phase = 'executing';
  for (let registerIndex = 0; registerIndex < 5; registerIndex += 1) {
    state.registerIndex = registerIndex;
    const movers = liveRobots(state)
      .filter((robot) => !robot.poweredDown && robot.registers[registerIndex].card)
      .sort((a, b) => b.registers[registerIndex].card!.priority - a.registers[registerIndex].card!.priority);
    for (const robot of movers) executeProgram(state, course, robot, robot.registers[registerIndex].card!, events);
    moveConveyors(state, course, 2, true, events);
    moveConveyors(state, course, 1, false, events);
    activatePushers(state, course, registerIndex + 1, events);
    rotateGears(state, course, events);
    fireLasers(state, course, events);
    touchBoardSites(state, course, events);
    if (state.winnerSeatId) break;
  }
  if (!state.winnerSeatId) cleanup(state, course, events);
  return events;
}

function executeProgram(state: MatchState, course: CourseDefinition, robot: RobotState, card: ProgramCard, events: MatchEvent[]) {
  events.push({ ...event('program', `${robot.displayName}: ${card.kind} ${card.priority}.`, robot), register: state.registerIndex + 1, data: { card } });
  if (card.rotation) {
    turnRobot(robot, card.rotation);
    events.push({ ...event('turn', `${robot.displayName} rotated.`, robot), to: { ...robot.position } });
    return;
  }
  let steps = Math.abs(card.distance ?? 0);
  const modifiedRegisters = (robot.optionState.modifiedRegisters ?? {}) as Record<string, number[]>;
  if (card.kind === 'move1' && modifiedRegisters['brakes']?.includes(state.registerIndex + 1)) steps = 0;
  if (card.kind === 'move3' && modifiedRegisters['fourth-gear']?.includes(state.registerIndex + 1)) steps = 4;
  if (card.kind === 'backup' && modifiedRegisters['reverse-gears']?.includes(state.registerIndex + 1)) steps = 2;
  const direction = (card.distance ?? 0) < 0 ? OPPOSITE[robot.direction] : robot.direction;
  for (let i = 0; i < steps && !robot.destroyed; i += 1) moveRobot(state, course, robot, direction, events, 'program');
}

function moveRobot(state: MatchState, course: CourseDefinition, robot: RobotState, direction: Direction, events: MatchEvent[], source: string): boolean {
  if (robot.destroyed || robot.eliminated || blockedByWall(course, robot.position, direction)) return false;
  const vector = VECTORS[direction];
  const destination = { x: robot.position.x + vector.x, y: robot.position.y + vector.y };
  const occupant = robotAt(state, destination, robot.seatId);
  if (occupant && !moveRobot(state, course, occupant, direction, events, 'push')) return false;
  const from = { ...robot.position };
  robot.position = destination;
  const movementType = source === 'program' ? 'move' : source;
  events.push({ ...event(movementType, `${robot.displayName} moved.`, robot), from, to: { ...destination } });
  if (hasOption(robot, 'ramming-gear') && occupant) takeDamage(occupant, 1, events, 'Ramming Gear');
  if (!insideCourse(course, destination) || courseTile(course, destination.x, destination.y)?.pit) destroyRobot(robot, events, 'factory hazard');
  return true;
}

function moveConveyors(state: MatchState, course: CourseDefinition, speed: 1 | 2, expressOnly: boolean, events: MatchEvent[]) {
  const candidates = liveRobots(state).filter((robot) => {
    const conveyor = courseTile(course, robot.position.x, robot.position.y)?.conveyor;
    return conveyor && (expressOnly ? conveyor.speed === 2 : conveyor.speed >= speed);
  });
  for (const robot of orderByDock(state, candidates)) {
    const conveyor = courseTile(course, robot.position.x, robot.position.y)?.conveyor;
    if (!conveyor) continue;
    if (moveRobot(state, course, robot, conveyor.direction, events, 'conveyor')) {
      const landed = courseTile(course, robot.position.x, robot.position.y)?.conveyor;
      if (landed?.rotate && robot.optionState.gyroscopicStabilizer !== true) turnRobot(robot, landed.rotate === 'right' ? 1 : -1);
    }
  }
}

function activatePushers(state: MatchState, course: CourseDefinition, register: number, events: MatchEvent[]) {
  for (const robot of orderByDock(state, liveRobots(state))) {
    const pusher = courseTile(course, robot.position.x, robot.position.y)?.pusher;
    if (pusher?.activeRegisters.includes(register)) moveRobot(state, course, robot, pusher.direction, events, 'pusher');
  }
}

function rotateGears(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  for (const robot of liveRobots(state)) {
    const gear = courseTile(course, robot.position.x, robot.position.y)?.gear;
    if (gear && robot.optionState.gyroscopicStabilizer !== true) {
      turnRobot(robot, gear === 'right' ? 1 : -1);
      events.push(event('gear', `${robot.displayName} was rotated by a gear.`, robot));
    }
  }
}

function fireLasers(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  const damage = new Map<string, { amount: number; incoming?: Direction }>();
  const queueDamage = (target: RobotState, amount: number, beamDirection: Direction) => {
    const current = damage.get(target.seatId);
    damage.set(target.seatId, { amount: (current?.amount ?? 0) + amount, incoming: current?.incoming ?? OPPOSITE[beamDirection] });
  };
  for (const shooter of liveRobots(state).filter((robot) => !robot.poweredDown)) {
    const facing = (shooter.optionState.turretDirection as Direction | undefined) ?? shooter.direction;
    traceLaser(state, course, shooter.position, facing, shooter.seatId, hasOption(shooter, 'high-power-laser') ? 1 : 0).forEach((target) => queueDamage(target, hasOption(shooter, 'double-barrel-laser') ? 2 : 1, facing));
    if (hasOption(shooter, 'rear-laser')) traceLaser(state, course, shooter.position, OPPOSITE[shooter.direction], shooter.seatId).forEach((target) => queueDamage(target, 1, OPPOSITE[shooter.direction]));
  }
  const bounds = courseBounds(course);
  for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
    const laser = courseTile(course, x, y)?.laser;
    if (laser) traceLaser(state, course, { x, y }, laser.direction).slice(0, 1).forEach((target) => queueDamage(target, laser.count, laser.direction));
  }
  for (const [seatId, hit] of damage) takeDamage(robotFor(state, seatId), hit.amount, events, 'laser', hit.incoming);
}

function traceLaser(state: MatchState, course: CourseDefinition, origin: Position, direction: Direction, ignoreSeat?: string, penetration = 0): RobotState[] {
  const hits: RobotState[] = [];
  let position = { ...origin };
  for (let guard = 0; guard < 32; guard += 1) {
    if (blockedByWall(course, position, direction)) {
      if (penetration <= 0) break;
      penetration -= 1;
    }
    position = { x: position.x + VECTORS[direction].x, y: position.y + VECTORS[direction].y };
    if (!insideCourse(course, position)) break;
    const target = robotAt(state, position, ignoreSeat);
    if (target) {
      hits.push(target);
      if (penetration <= 0) break;
      penetration -= 1;
    }
  }
  return hits;
}

function touchBoardSites(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  // A powered-down robot remains a physical obstacle and can still be moved or
  // damaged by the board, but it cannot touch checkpoints or update its archive.
  for (const robot of liveRobots(state).filter((candidate) => !candidate.poweredDown)) {
    const tile = courseTile(course, robot.position.x, robot.position.y);
    const needed = robot.checkpoint + 1;
    const adjacentFlag = hasOption(robot, 'mechanical-arm') && course.checkpoints.some((flag) => flag.number === needed && manhattan(flag, robot.position) === 1 && !blockedBetween(course, robot.position, flag));
    if (tile?.checkpoint === needed || adjacentFlag) {
      robot.checkpoint = needed;
      events.push(event('checkpoint', `${robot.displayName} reached checkpoint ${needed}.`, robot));
      if (needed === course.checkpoints.length) {
        state.phase = 'complete'; state.winnerSeatId = robot.seatId; state.completedAt = Date.now();
        events.push(event('victory', `${robot.displayName} wins the race!`, robot));
      }
    }
    if (tile?.archive || tile?.checkpoint) robot.archive = { ...robot.position };
  }
}

function cleanup(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  for (const robot of state.robots) {
    if (robot.destroyed && !robot.eliminated) respawnRobot(state, course, robot, events);
    if (robot.eliminated) continue;
    const cleanupTile = courseTile(course, robot.position.x, robot.position.y);
    const repair = cleanupTile?.repair;
    if (repair) {
      robot.damage = Math.max(0, robot.damage - repair);
      if (cleanupTile?.optionSite && state.optionDeck.length) {
        const optionId = state.optionDeck.shift()!;
        const definition = OPTION_BY_ID.get(optionId)!;
        robot.options.push({ id: optionId, charges: definition.charges });
        events.push(event('option-acquired', `${robot.displayName} installed ${definition.name}.`, robot));
      }
    }
    updateLockedRegisters(robot);
    const flywheelCard = robot.optionState.flywheelCard as string | undefined;
    if (flywheelCard && robot.registers.some((register) => register.card?.id === flywheelCard)) delete robot.optionState.flywheelCard;
    robot.optionState = robot.optionState.flywheelCard ? { flywheelCard: robot.optionState.flywheelCard } : {};
    if (robot.poweredDown) robot.poweredDown = robot.powerDownNext;
    else if (robot.powerDownNext) {
      robot.poweredDown = true;
      robot.damage = 0;
      robot.registers.forEach((register) => { register.locked = false; register.card = null; });
      events.push(event('power-down', `${robot.displayName} powered down and repaired fully.`, robot));
    }
    if (hasOption(robot, 'circuit-breaker') && robot.damage >= 3) robot.powerDownNext = true;
  }
  state.phase = 'programming';
  state.registerIndex = 0;
  state.timerDeadline = undefined;
  dealHands(state);
}

function dealHands(state: MatchState) {
  const reserved = new Set(state.robots.flatMap((robot) => robot.registers.filter((register) => register.locked && register.card).map((register) => register.card!.id)));
  state.programDeck = shuffled(PROGRAM_DECK.filter((card) => !reserved.has(card.id)), state);
  state.hands = {};
  for (const robot of orderByDock(state, state.robots)) {
    robot.finishedProgramming = robot.eliminated || robot.destroyed || robot.poweredDown;
    if (robot.finishedProgramming) { state.hands[robot.seatId] = []; continue; }
    robot.registers.forEach((register) => { if (!register.locked) register.card = null; });
    const count = Math.max(0, 9 - robot.damage + (hasOption(robot, 'extra-memory') ? 1 : 0));
    state.hands[robot.seatId] = state.programDeck.splice(0, count);
    const flywheelCard = robot.optionState.flywheelCard as string | undefined;
    if (flywheelCard) {
      const saved = PROGRAM_BY_ID.get(flywheelCard);
      if (saved && !state.hands[robot.seatId].some((card) => card.id === saved.id)) state.hands[robot.seatId].push(saved);
    }
  }
}

export function takeDamage(robot: RobotState, amount: number, events: MatchEvent[], source: string, incoming?: Direction) {
  let applied = amount;
  const discardId = robot.optionState.preventNextDamage as string | undefined;
  if (discardId && applied > 0 && robot.options.some((option) => option.id === discardId)) {
    robot.options = robot.options.filter((option) => option.id !== discardId);
    delete robot.optionState.preventNextDamage;
    applied -= 1;
  }
  const coat = robot.options.find((option) => option.id === 'ablative-coat');
  if (coat && applied > 0) {
    const absorbed = Math.min(coat.charges ?? 0, applied);
    coat.charges = (coat.charges ?? 0) - absorbed;
    applied -= absorbed;
    if (!coat.charges) robot.options = robot.options.filter((option) => option !== coat);
  }
  if (robot.poweredDown && hasOption(robot, 'power-down-shield')) applied = Math.max(0, applied - 1);
  if (incoming && robot.optionState.shieldDirection === incoming) applied = Math.max(0, applied - 1);
  robot.damage += applied;
  if (applied) events.push({ ...event('damage', `${robot.displayName} took ${applied} damage from ${source}.`, robot), damage: applied });
  if (robot.damage >= 10) destroyRobot(robot, events, 'critical damage');
}

function destroyRobot(robot: RobotState, events: MatchEvent[], cause: string) {
  if (robot.destroyed || robot.eliminated) return;
  robot.destroyed = true;
  robot.lives -= 1;
  if (robot.options.length) robot.options.splice(0, 1);
  if (robot.lives <= 0) robot.eliminated = true;
  events.push(event(robot.eliminated ? 'eliminated' : 'destroyed', `${robot.displayName} was ${robot.eliminated ? 'eliminated' : 'destroyed'} by ${cause}.`, robot));
}

function respawnRobot(state: MatchState, course: CourseDefinition, robot: RobotState, events: MatchEvent[]) {
  const candidates = [robot.archive, ...DIRECTIONS.map((direction) => ({ x: robot.archive.x + VECTORS[direction].x, y: robot.archive.y + VECTORS[direction].y }))];
  const position = candidates.find((candidate) => insideCourse(course, candidate) && !courseTile(course, candidate.x, candidate.y)?.pit && !robotAt(state, candidate, robot.seatId));
  if (!position) return;
  robot.position = { ...position };
  robot.destroyed = false;
  robot.damage = hasOption(robot, 'superior-archive-copy') ? 0 : 2;
  robot.registers.forEach((register) => { register.card = null; register.locked = false; });
  robot.options = robot.options.filter((option) => option.id !== 'superior-archive-copy');
  events.push({ ...event('respawn', `${robot.displayName} returned from its archive copy.`, robot), to: { ...position } });
}

export function updateLockedRegisters(robot: RobotState) {
  const locked = Math.max(0, Math.min(5, robot.damage - 4));
  robot.registers.forEach((register, index) => { register.locked = index >= 5 - locked; });
}

export function applyOptionEffect(state: MatchState, robot: RobotState, optionId: string, payload: Record<string, unknown>, events: MatchEvent[]) {
  const option = robot.options.find((candidate) => candidate.id === optionId);
  if (!option || !OPTION_BY_ID.has(optionId)) throw new RuleError('illegal', 'Unknown or uninstalled Option.');
  const target = typeof payload.targetSeatId === 'string' ? state.robots.find((candidate) => candidate.seatId === payload.targetSeatId) : undefined;
  switch (optionId) {
    case 'brakes':
    case 'fourth-gear':
    case 'reverse-gears': {
      const register = Number(payload.register);
      if (!Number.isInteger(register) || register < 1 || register > 5) throw new RuleError('illegal', 'Choose a register from 1 to 5.');
      const modified = (robot.optionState.modifiedRegisters ?? {}) as Record<string, number[]>;
      robot.optionState.modifiedRegisters = { ...modified, [optionId]: [...(modified[optionId] ?? []), register] };
      break;
    }
    case 'gyroscopic-stabilizer':
      robot.optionState.gyroscopicStabilizer = true;
      break;
    case 'shield':
      if (!DIRECTIONS.includes(payload.direction as Direction)) throw new RuleError('illegal', 'Choose a shield direction.');
      robot.optionState.shieldDirection = payload.direction;
      break;
    case 'turret':
      if (!DIRECTIONS.includes(payload.direction as Direction)) throw new RuleError('illegal', 'Choose a turret direction.');
      robot.optionState.turretDirection = payload.direction;
      break;
    case 'conditional-program': {
      const register = Number(payload.register) - 1;
      const cardId = String(payload.cardId ?? '');
      const card = state.hands[robot.seatId]?.find((candidate) => candidate.id === cardId);
      if (!card || register < 0 || register > 4 || robot.registers[register].locked) throw new RuleError('illegal', 'Choose an unlocked register and a card from your hand.');
      robot.registers[register].card = card;
      break;
    }
    case 'flywheel': {
      const cardId = String(payload.cardId ?? '');
      if (!state.hands[robot.seatId]?.some((candidate) => candidate.id === cardId)) throw new RuleError('illegal', 'Choose an unused card from your hand.');
      robot.optionState.flywheelCard = cardId;
      break;
    }
    case 'radio-control':
      if (!target || manhattan(robot.position, target.position) > 6) throw new RuleError('illegal', 'Choose a robot within six spaces.');
      target.registers = robot.registers.map((register) => ({ ...register }));
      break;
    case 'recompile':
      if (robot.optionState.recompiled) throw new RuleError('duplicate', 'Recompile is limited to once per turn.');
      state.hands[robot.seatId] = shuffled(PROGRAM_DECK.filter((card) => !robot.registers.some((register) => register.locked && register.card?.id === card.id)), state).slice(0, Math.max(0, 9 - robot.damage));
      robot.optionState.recompiled = true;
      takeDamage(robot, 1, events, 'Recompile');
      break;
    case 'fire-control':
      if (target && typeof payload.register === 'number') target.registers[Math.max(0, Math.min(4, payload.register - 1))].locked = true;
      else if (target && typeof payload.optionId === 'string') target.options = target.options.filter((installed) => installed.id !== payload.optionId);
      break;
    case 'scrambler':
      if (target && state.registerIndex < 4) target.registers[state.registerIndex + 1].card = shuffled(PROGRAM_DECK, state)[0];
      break;
    case 'pressor-beam':
    case 'mini-howitzer':
      if (target) {
        const direction = directionFrom(robot.position, target.position);
        if (direction) moveRobot(state, requireCourse(state), target, direction, events, optionId);
        if (optionId === 'mini-howitzer') takeDamage(target, 1, events, 'Mini Howitzer');
      }
      consumeCharge(robot, optionId);
      break;
    case 'tractor-beam':
      if (target && manhattan(robot.position, target.position) > 1) {
        const away = directionFrom(robot.position, target.position);
        if (away) moveRobot(state, requireCourse(state), target, OPPOSITE[away], events, optionId);
      }
      break;
    case 'abort-switch': {
      const replacement = shuffled(PROGRAM_DECK, state)[0];
      robot.registers[state.registerIndex].card = replacement;
      for (let i = state.registerIndex + 1; i < 5; i += 1) robot.registers[i].card = shuffled(PROGRAM_DECK, state)[0];
      break;
    }
    default:
      if (payload.discardToPreventDamage === true) robot.optionState.preventNextDamage = optionId;
      break;
  }
  events.push(event('option-activated', `${robot.displayName} activated ${OPTION_BY_ID.get(optionId)!.name}.`, robot));
}

function consumeCharge(robot: RobotState, id: string) {
  const option = robot.options.find((candidate) => candidate.id === id);
  if (option?.charges !== undefined) {
    option.charges -= 1;
    if (option.charges <= 0) robot.options = robot.options.filter((candidate) => candidate !== option);
  }
}

function updatePublicRobot(state: MatchState, robot: RobotState) {
  const { optionState: _optionState, ...publicRobot } = robot;
  return {
    ...publicRobot,
    registers: robot.registers.map((register, index) => ({
      locked: register.locked,
      card: register.locked || (state.phase === 'executing' && index <= state.registerIndex) ? register.card : null,
    })),
    optionCount: robot.options.length,
    revealedOptions: robot.options.map((option) => option.id),
    options: undefined,
  };
}

export function publicView(state: MatchState): PublicMatchView {
  const { hands: _hands, programDeck, optionDeck, recentCommandIds: _commands, robots, ...publicState } = state;
  return {
    ...publicState,
    robots: robots.map((robot) => {
      const view = updatePublicRobot(state, robot);
      const { options: _options, ...safe } = view;
      return safe;
    }),
    programDeckCount: programDeck.length,
    optionDeckCount: optionDeck.length,
  };
}

export function privateView(state: MatchState, seatId: string, events: MatchEvent[] = []): PrivateMatchView {
  const robot = robotFor(state, seatId);
  return { public: publicView(state), seatId, hand: state.hands[seatId] ?? [], options: robot.options, events: events.filter((item) => item.public || item.seatId === seatId) };
}

function finalizeEvents(state: MatchState, events: MatchEvent[]) {
  for (const item of events) item.revision = ++state.eventRevision;
  return events;
}

function event(type: string, message: string, robot?: RobotState): MatchEvent {
  return { revision: 0, type, message, seatId: robot?.seatId, robotId: robot?.robotId, public: true };
}

function robotFor(state: MatchState, seatId: string) {
  const robot = state.robots.find((candidate) => candidate.seatId === seatId);
  if (!robot) throw new RuleError('unauthorized', 'Unknown seat.');
  return robot;
}

function liveRobots(state: MatchState) { return state.robots.filter((robot) => !robot.destroyed && !robot.eliminated); }
function robotAt(state: MatchState, position: Position, ignoreSeat?: string) { return liveRobots(state).find((robot) => robot.seatId !== ignoreSeat && samePosition(robot.position, position)); }
function samePosition(a: Position, b: Position) { return a.x === b.x && a.y === b.y; }
function manhattan(a: Position, b: Position) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function hasOption(robot: RobotState, id: string) { return robot.options.some((option) => option.id === id); }
function insideCourse(course: CourseDefinition, position: Position) { return course.boards.some((placement) => { const board = courseTile(course, position.x, position.y); return Boolean(board) && position.x >= placement.offset.x && position.x < placement.offset.x + 12 && position.y >= placement.offset.y && position.y < placement.offset.y + 12; }); }
function blockedByWall(course: CourseDefinition, position: Position, direction: Direction) {
  const destination = { x: position.x + VECTORS[direction].x, y: position.y + VECTORS[direction].y };
  return Boolean(courseTile(course, position.x, position.y)?.walls?.includes(direction) || courseTile(course, destination.x, destination.y)?.walls?.includes(OPPOSITE[direction]));
}
function blockedBetween(course: CourseDefinition, from: Position, to: Position) { const direction = directionFrom(from, to); return direction ? blockedByWall(course, from, direction) : true; }
function directionFrom(from: Position, to: Position): Direction | undefined { const dx = to.x - from.x; const dy = to.y - from.y; if (dx && dy) return; if (dx > 0) return 'east'; if (dx < 0) return 'west'; if (dy > 0) return 'south'; if (dy < 0) return 'north'; }
function turnRobot(robot: RobotState, amount: -2 | -1 | 1) { robot.direction = DIRECTIONS[(DIRECTIONS.indexOf(robot.direction) + amount + 4) % 4]; }
function orderByDock(state: MatchState, robots: RobotState[]) { return [...robots].sort((a, b) => state.dockingOrder.indexOf(a.seatId) - state.dockingOrder.indexOf(b.seatId)); }
function requireCourse(state: MatchState) { const course = COURSE_BY_ID.get(state.courseId); if (!course) throw new Error('Course data missing.'); return course; }
function cryptoSeed() { const bytes = new Uint32Array(1); globalThis.crypto?.getRandomValues?.(bytes); return bytes[0] || Date.now(); }
