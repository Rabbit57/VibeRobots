import { courseBounds, courseTile, COURSE_BY_ID, COURSES } from './content/boards';
import { OPTION_BY_ID, OPTION_CARDS } from './content/options';
import { PROGRAM_BY_ID, PROGRAM_DECK } from './content/programs';
import { ROBOT_BY_ID } from './content/robots';
import type {
  CourseDefinition,
  Direction,
  MatchCommand,
  MatchEvent,
  MatchMode,
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
  controller?: 'human' | 'bot';
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

export function createLobby(roomCode: string, host: SeatSetup, now = Date.now(), seed = cryptoSeed(), mode: MatchMode = 'multiplayer'): MatchState {
  return {
    roomCode,
    mode,
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
    controller: setup.controller ?? 'human',
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
  // Lobby selections are validated against current dock availability and host ownership.
  // Accept older snapshots so rapid selections and different players' choices can coexist.
  const concurrentLobbyChoice = state.phase === 'lobby' && command.revision >= 0 && command.revision < state.revision && (command.type === 'choose-spawn' || command.type === 'choose-course');
  if (command.revision !== state.revision && !concurrentLobbyChoice) throw new RuleError('stale', 'The room changed. Refreshing from the server.');
  if (state.recentCommandIds.includes(command.id)) throw new RuleError('duplicate', 'That command was already accepted.');
  if (state.phase === 'paused') throw new RuleError('out-of-turn', 'The match is paused while a player reconnects.');

  const events: MatchEvent[] = [];
  if (command.type === 'start') startMatch(state, seatId, command.courseId, command.fourLifeRule, events);
  else if (command.type === 'choose-spawn') chooseSpawn(state, seatId, command.dock, events);
  else if (command.type === 'choose-course') chooseCourse(state, seatId, command.courseId, events);
  else if (command.type === 'program') submitProgram(state, seatId, command.cards, events, now);
  else if (command.type === 'announce-power-down') announcePowerDown(state, seatId, command.enabled, events);
  else if (command.type === 'stay-powered-down') stayPoweredDown(state, seatId, command.enabled, events);
  else if (command.type === 'option') activateOption(state, seatId, command.optionId, command.payload ?? {}, events);
  else resolveDecision(state, seatId, command.choice, events);

  state.revision += 1;
  state.updatedAt = now;
  state.recentCommandIds = [...state.recentCommandIds.slice(-127), command.id];
  return { state, events: finalizeEvents(state, events) };
}

function chooseCourse(state: MatchState, seatId: string, courseId: string, events: MatchEvent[]) {
  if (state.phase !== 'lobby') throw new RuleError('out-of-turn', 'The course cannot change during a race.');
  if (state.hostSeatId !== seatId) throw new RuleError('unauthorized', 'Only the host can choose the course.');
  const course = COURSE_BY_ID.get(courseId);
  if (!course) throw new RuleError('illegal', 'Unknown course.');
  state.courseId = courseId;
  for (const robot of state.robots) {
    const dock = course.docks.find((candidate) => candidate.number === robot.spawnDock);
    if (dock) {
      robot.position = { x: dock.x, y: dock.y };
      robot.archive = { ...robot.position };
      robot.direction = dock.direction;
    } else robot.spawnDock = undefined;
  }
  events.push(event('course-chosen', `The crew will race on ${course.name}.`));
}

function chooseSpawn(state: MatchState, seatId: string, dockNumber: number, events: MatchEvent[]) {
  if (state.phase !== 'lobby') throw new RuleError('out-of-turn', 'Starting docks can only be chosen before the race.');
  const dock = requireCourse(state).docks.find((candidate) => candidate.number === dockNumber);
  if (!dock) throw new RuleError('illegal', 'Choose a marked starting dock.');
  if (state.robots.some((robot) => robot.seatId !== seatId && robot.spawnDock === dockNumber)) throw new RuleError('illegal', 'That starting dock is already taken.');
  const robot = robotFor(state, seatId);
  robot.spawnDock = dockNumber;
  robot.position = { x: dock.x, y: dock.y };
  robot.archive = { ...robot.position };
  robot.direction = dock.direction;
  events.push(event('spawn-chosen', `${robot.displayName} chose dock ${dockNumber}.`, robot));
}

function startMatch(state: MatchState, seatId: string, courseId: string, fourLifeRule: boolean, events: MatchEvent[]) {
  if (state.phase !== 'lobby') throw new RuleError('out-of-turn', 'The match has already started.');
  if (state.hostSeatId !== seatId) throw new RuleError('unauthorized', 'Only the host can start the match.');
  if (state.mode === 'multiplayer' && state.robots.length < 2) throw new RuleError('illegal', 'At least two players are required.');
  if (state.mode === 'solo' && (state.robots.filter((robot) => robot.controller === 'human').length !== 1 || state.robots.filter((robot) => robot.controller === 'bot').length !== 3)) {
    throw new RuleError('illegal', 'Solo races require one driver and three CPU robots.');
  }
  const course = COURSE_BY_ID.get(courseId);
  if (!course) throw new RuleError('illegal', 'Unknown course.');
  if (fourLifeRule && state.robots.length < 5) throw new RuleError('illegal', 'The four-life rule is available with five or more players.');
  if (state.robots.some((robot) => robot.controller === 'human' && !robot.spawnDock)) throw new RuleError('illegal', 'Every player must choose a starting dock.');

  state.courseId = courseId;
  state.fourLifeRule = fourLifeRule;
  const available = course.docks.filter((dock) => !state.robots.some((robot) => robot.spawnDock === dock.number));
  for (const robot of state.robots) if (!robot.spawnDock) robot.spawnDock = available.shift()!.number;
  state.dockingOrder = [...state.robots].sort((a, b) => a.spawnDock! - b.spawnDock!).map((robot) => robot.seatId);
  state.programDeck = shuffled(PROGRAM_DECK, state);
  state.optionDeck = shuffled(OPTION_CARDS.map((option) => option.id), state);
  state.robots.forEach((robot) => {
    const dock = course.docks.find((candidate) => candidate.number === robot.spawnDock)!;
    robot.position = { x: dock.x, y: dock.y };
    robot.archive = { ...robot.position };
    robot.direction = dock.direction;
    robot.lives = fourLifeRule ? 4 : 3;
  });
  state.phase = 'programming';
  dealHands(state);
  events.push(event('match-started', `${state.robots.length} robots entered ${course.name}.`));
}

function submitProgram(state: MatchState, seatId: string, cardIds: string[], events: MatchEvent[], now: number) {
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
  if (state.mode === 'multiplayer' && unfinished.length === 1 && !state.timerDeadline) state.timerDeadline = now + 30_000;
  if (unfinished.length === 0) resolveTurn(state, events);
}

/** One shared deadline fills every unfinished program, then resolves exactly one turn. */
export function expireProgrammingTimer(state: MatchState, now = Date.now()): CommandResult {
  const events: MatchEvent[] = [];
  if (state.mode !== 'multiplayer' || state.phase !== 'programming' || !state.timerDeadline || now < state.timerDeadline) return { state, events };
  const unfinished = state.robots.filter((robot) => !robot.finishedProgramming && !robot.eliminated && !robot.destroyed && !robot.poweredDown);
  for (const robot of unfinished) {
    const count = robot.registers.filter((register) => !register.locked).length;
    const cards = shuffled(state.hands[robot.seatId] ?? [], state).slice(0, count).map((card) => card.id);
    events.push(event('timer-expired', `${robot.displayName}'s program was filled at random when time ran out.`, robot));
    submitProgram(state, robot.seatId, cards, events, now);
  }
  state.revision += 1;
  state.updatedAt = now;
  return { state, events: finalizeEvents(state, events) };
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
  if (state.pendingDecision.kind === 'respawn-location') {
    const [square, direction] = choice.split('|');
    const [x, y] = square.split(',').map(Number);
    respawnRobot(robotFor(state, seatId), { x, y }, direction as Direction, events);
    state.pendingDecision = undefined;
    state.respawnQueue?.shift();
    continueRespawns(state, requireCourse(state), events);
    return;
  }
  state.pendingDecision = undefined;
  state.phase = 'programming';
  events.push(event('decision', 'A pending choice was resolved.', robotFor(state, seatId)));
}

export function resolveTurn(state: MatchState, events: MatchEvent[] = []): MatchEvent[] {
  const course = requireCourse(state);
  state.phase = 'executing';
  state.timerDeadline = undefined;
  for (let registerIndex = 0; registerIndex < 5; registerIndex += 1) {
    state.registerIndex = registerIndex;
    const movers = liveRobots(state)
      .filter((robot) => !robot.poweredDown && robot.registers[registerIndex].card)
      .sort((a, b) => b.registers[registerIndex].card!.priority - a.registers[registerIndex].card!.priority);
    const stage = (id: MatchEvent['stage'], message: string) => events.push({ ...event('stage', message), register: registerIndex + 1, stage: id });
    stage('program', `Register ${registerIndex + 1}: robots execute cards in priority order.`);
    for (const robot of movers) if (!robot.destroyed && !robot.eliminated) executeProgram(state, course, robot, robot.registers[registerIndex].card!, events);
    stage('express-conveyor', 'Express belts take their extra step.');
    moveConveyors(state, course, 2, true, events);
    stage('conveyor', 'All conveyor belts advance one square.');
    moveConveyors(state, course, 1, false, events);
    stage('pushers', 'Active pushers extend.');
    activatePushers(state, course, registerIndex + 1, events);
    stage('gears', 'Gears rotate robots.');
    rotateGears(state, course, events);
    stage('lasers', 'Factory and robot lasers fire.');
    fireLasers(state, course, events);
    stage('sites', 'Check flags and save archive locations.');
    touchBoardSites(state, course, events);
    if (!state.winnerSeatId && finishSoloDefeat(state, events)) break;
    if (state.winnerSeatId) break;
  }
  if (!state.winnerSeatId && state.completionReason !== 'human-eliminated') {
    events.push({ ...event('stage', 'Turn complete: repair, respawn and deal new cards.'), register: 5, stage: 'cleanup' });
    cleanup(state, course, events);
  }
  return events;
}

export function resolveReadyTurn(state: MatchState, now = Date.now()): CommandResult {
  if (state.phase !== 'programming') throw new RuleError('out-of-turn', 'The factory is not ready to execute.');
  const unfinished = state.robots.filter((robot) => !robot.eliminated && !robot.destroyed && !robot.poweredDown && !robot.finishedProgramming);
  if (unfinished.length) throw new RuleError('out-of-turn', 'A robot still needs to finish programming.');
  const events = resolveTurn(state);
  state.revision += 1;
  state.updatedAt = now;
  return { state, events: finalizeEvents(state, events) };
}

function executeProgram(state: MatchState, course: CourseDefinition, robot: RobotState, card: ProgramCard, events: MatchEvent[]) {
  events.push({ ...event('program', `${robot.displayName}: ${card.kind} ${card.priority}.`, robot), register: state.registerIndex + 1, stage: 'program', data: { card } });
  if (card.rotation) {
    const fromDirection = robot.direction;
    turnRobot(robot, card.rotation);
    events.push({ ...event('turn', `${robot.displayName} rotated.`, robot), register: state.registerIndex + 1, stage: 'program', to: { ...robot.position }, fromDirection, toDirection: robot.direction, source: 'program' });
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

function moveRobot(state: MatchState, course: CourseDefinition, robot: RobotState, direction: Direction, events: MatchEvent[], source: string, movementStage?: MatchEvent['stage']): boolean {
  if (robot.destroyed || robot.eliminated || blockedByWall(course, robot.position, direction)) return false;
  const vector = VECTORS[direction];
  const destination = { x: robot.position.x + vector.x, y: robot.position.y + vector.y };
  const occupant = robotAt(state, destination, robot.seatId);
  const inheritedStage = movementStage ?? (source === 'pusher' ? 'pushers' : 'program');
  if (occupant && !moveRobot(state, course, occupant, direction, events, 'push', inheritedStage)) return false;
  const from = { ...robot.position };
  robot.position = destination;
  const movementType = source === 'program' ? 'move' : source === 'express-conveyor' ? 'conveyor' : source;
  const stage: MatchEvent['stage'] = movementStage ?? (source === 'program' || source === 'push'
    ? 'program'
    : source === 'express-conveyor'
      ? 'express-conveyor'
      : source === 'conveyor'
      ? 'conveyor'
      : 'pushers');
  events.push({ ...event(movementType, `${robot.displayName} moved.`, robot), register: state.registerIndex + 1, stage, source, from, to: { ...destination }, path: [from, { ...destination }], fromDirection: robot.direction, toDirection: robot.direction });
  if (hasOption(robot, 'ramming-gear') && occupant) takeDamage(occupant, 1, events, 'Ramming Gear');
  if (!insideCourse(course, destination) || courseTile(course, destination.x, destination.y)?.pit) destroyRobot(robot, events, 'factory hazard');
  return true;
}

function moveConveyors(state: MatchState, course: CourseDefinition, speed: 1 | 2, expressOnly: boolean, events: MatchEvent[]) {
  // Snapshot all intentions before moving anyone. Belts never push robots.
  const live = liveRobots(state);
  const moves = live.flatMap((robot) => {
    const belt = courseTile(course, robot.position.x, robot.position.y)?.conveyor;
    if (!belt || (expressOnly ? belt.speed !== 2 : belt.speed < speed) || blockedByWall(course, robot.position, belt.direction)) return [];
    const from = { ...robot.position };
    return [{ robot, belt, from, to: { x: from.x + VECTORS[belt.direction].x, y: from.y + VECTORS[belt.direction].y } }];
  });
  const blocked = new Set<string>();
  for (const move of moves) {
    if (moves.some((other) => other !== move && samePosition(other.to, move.to))) blocked.add(move.robot.seatId);
    // Head-on swaps are collisions, not passes through each other.
    if (moves.some((other) => other !== move && samePosition(other.to, move.from) && samePosition(other.from, move.to))) blocked.add(move.robot.seatId);
  }
  // A stopped robot also stops every belt feeding into its occupied square.
  let changed = true;
  while (changed) {
    changed = false;
    for (const move of moves) {
      if (blocked.has(move.robot.seatId)) continue;
      const occupant = live.find((robot) => samePosition(robot.position, move.to));
      if (occupant && (!moves.some((other) => other.robot === occupant) || blocked.has(occupant.seatId))) {
        blocked.add(move.robot.seatId);
        changed = true;
      }
    }
  }
  const stage = expressOnly ? 'express-conveyor' : 'conveyor';
  for (const { robot, belt, from, to } of moves) {
    if (blocked.has(robot.seatId)) continue;
    robot.position = to;
    events.push({ ...event('conveyor', `${robot.displayName} rode the belt ${belt.direction}.`, robot), register: state.registerIndex + 1, stage, source: stage, from, to: { ...to }, path: [from, { ...to }], fromDirection: robot.direction, toDirection: robot.direction });
    if (!insideCourse(course, to) || courseTile(course, to.x, to.y)?.pit) {
      destroyRobot(robot, events, 'factory hazard');
      continue;
    }
    const landed = courseTile(course, to.x, to.y)?.conveyor;
    // At a merge, entering along the straight branch must not rotate the robot.
    const delta = landed ? (DIRECTIONS.indexOf(landed.direction) - DIRECTIONS.indexOf(belt.direction) + 4) % 4 : 0;
    if (landed?.rotate && (delta === 1 || delta === 3) && robot.optionState.gyroscopicStabilizer !== true) {
      const fromDirection = robot.direction;
      turnRobot(robot, delta === 1 ? 1 : -1);
      events.push({ ...event('turn', `${robot.displayName} turned ${delta === 1 ? 'right' : 'left'} with the belt.`, robot), register: state.registerIndex + 1,
        stage, source: 'conveyor-bend', fromDirection, toDirection: robot.direction, to: { ...to } });
    }
  }
}

function activatePushers(state: MatchState, course: CourseDefinition, register: number, events: MatchEvent[]) {
  const active = orderByDock(state, liveRobots(state)).map((robot) => ({ robot, from: { ...robot.position }, pusher: courseTile(course, robot.position.x, robot.position.y)?.pusher }));
  for (const { robot, from, pusher } of active) {
    if (pusher?.activeRegisters.includes(register) && samePosition(robot.position, from)) moveRobot(state, course, robot, pusher.direction, events, 'pusher');
  }
}

function rotateGears(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  for (const robot of liveRobots(state)) {
    const gear = courseTile(course, robot.position.x, robot.position.y)?.gear;
    if (gear && robot.optionState.gyroscopicStabilizer !== true) {
      turnRobot(robot, gear === 'right' ? 1 : -1);
      const toDirection = robot.direction;
      const fromDirection = DIRECTIONS[(DIRECTIONS.indexOf(toDirection) + (gear === 'right' ? 3 : 1)) % 4];
      events.push({ ...event('gear', `${robot.displayName} was rotated by a gear.`, robot), register: state.registerIndex + 1, stage: 'gears', fromDirection, toDirection, source: `gear-${gear}` });
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
    const forward = traceLaser(state, course, shooter.position, facing, shooter.seatId, hasOption(shooter, 'high-power-laser') ? 1 : 0);
    events.push({ ...event('laser-fired', `${shooter.displayName} fired.`, shooter), register: state.registerIndex + 1, stage: 'lasers', source: 'robot', path: forward.path, from: { ...shooter.position }, toDirection: facing, data: { count: hasOption(shooter, 'double-barrel-laser') ? 2 : 1 } });
    forward.hits.forEach((target) => queueDamage(target, hasOption(shooter, 'double-barrel-laser') ? 2 : 1, facing));
    if (hasOption(shooter, 'rear-laser')) {
      const direction = OPPOSITE[shooter.direction];
      const rear = traceLaser(state, course, shooter.position, direction, shooter.seatId);
      events.push({ ...event('laser-fired', `${shooter.displayName} fired its rear laser.`, shooter), register: state.registerIndex + 1, stage: 'lasers', source: 'rear-laser', path: rear.path, from: { ...shooter.position }, toDirection: direction, data: { count: 1 } });
      rear.hits.forEach((target) => queueDamage(target, 1, direction));
    }
  }
  const bounds = courseBounds(course);
  for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
    const laser = courseTile(course, x, y)?.laser;
    if (laser) {
      const origin = { x, y };
      const beam = traceLaser(state, course, origin, laser.direction);
      events.push({ ...event('laser-fired', 'A factory laser fired.'), register: state.registerIndex + 1, stage: 'lasers', source: 'factory', path: beam.path, from: origin, toDirection: laser.direction, data: { count: laser.count } });
      beam.hits.slice(0, 1).forEach((target) => queueDamage(target, laser.count, laser.direction));
    }
  }
  for (const [seatId, hit] of damage) takeDamage(robotFor(state, seatId), hit.amount, events, 'laser', hit.incoming);
}

function traceLaser(state: MatchState, course: CourseDefinition, origin: Position, direction: Direction, ignoreSeat?: string, penetration = 0): { hits: RobotState[]; path: Position[] } {
  const hits: RobotState[] = [];
  const path: Position[] = [{ ...origin }];
  let position = { ...origin };
  const atEmitter = !ignoreSeat && robotAt(state, origin);
  if (atEmitter) return { hits: [atEmitter], path };
  for (let guard = 0; guard < 32; guard += 1) {
    if (blockedByWall(course, position, direction)) {
      if (penetration <= 0) break;
      penetration -= 1;
    }
    position = { x: position.x + VECTORS[direction].x, y: position.y + VECTORS[direction].y };
    if (!insideCourse(course, position)) break;
    path.push({ ...position });
    const target = robotAt(state, position, ignoreSeat);
    if (target) {
      hits.push(target);
      if (penetration <= 0) break;
      penetration -= 1;
    }
  }
  return { hits, path };
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
      events.push({ ...event('checkpoint', `${robot.displayName} reached checkpoint ${needed}.`, robot), register: state.registerIndex + 1, stage: 'sites', to: { ...robot.position }, source: 'checkpoint' });
      if (needed === course.checkpoints.length && !state.winnerSeatId) {
        state.phase = 'complete'; state.winnerSeatId = robot.seatId; state.completionReason = 'checkpoint'; state.completedAt = Date.now();
        events.push({ ...event('victory', `${robot.displayName} wins the race!`, robot), register: state.registerIndex + 1, stage: 'sites', to: { ...robot.position }, source: 'checkpoint' });
      }
    }
    if (tile?.archive || tile?.checkpoint) robot.archive = { ...robot.position };
  }
}

function finishSoloDefeat(state: MatchState, events: MatchEvent[]) {
  if (state.mode !== 'solo') return false;
  const human = state.robots.find((robot) => robot.controller === 'human');
  if (!human?.eliminated) return false;
  state.phase = 'complete';
  state.completionReason = 'human-eliminated';
  state.completedAt = Date.now();
  events.push({ ...event('defeat', `${human.displayName} is out of archive copies.`, human), register: state.registerIndex + 1, stage: 'cleanup', source: 'elimination' });
  return true;
}

function cleanup(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  for (const robot of state.robots) {
    if (robot.destroyed || robot.eliminated) continue;
    const cleanupTile = courseTile(course, robot.position.x, robot.position.y);
    const repair = cleanupTile?.repair;
    if (repair) {
      robot.damage = Math.max(0, robot.damage - repair);
      if (cleanupTile?.optionSite && state.optionDeck.length) {
        const optionId = state.optionDeck.shift()!;
        const definition = OPTION_BY_ID.get(optionId)!;
        robot.options.push({ id: optionId, charges: definition.charges });
        events.push({ ...event('option-acquired', `${robot.displayName} installed ${definition.name}.`, robot), stage: 'cleanup', to: { ...robot.position }, source: 'option-site' });
      }
    }
  }
  const destroyed = events.filter((item) => item.type === 'destroyed');
  state.respawnQueue = orderByDock(state, state.robots)
    .filter((robot) => robot.destroyed && !robot.eliminated)
    .sort((a, b) => {
      const first = destroyed.findIndex((item) => item.seatId === a.seatId);
      const second = destroyed.findIndex((item) => item.seatId === b.seatId);
      const firstEvent = destroyed[first];
      const secondEvent = destroyed[second];
      // Conveyor hazards and laser damage can destroy robots simultaneously.
      // The official FAQ breaks those ties using starting-dock order.
      const simultaneousStage = firstEvent?.data?.deathStage;
      if (firstEvent && secondEvent && ['express-conveyor', 'conveyor', 'lasers'].includes(String(simultaneousStage)) && simultaneousStage === secondEvent.data?.deathStage && firstEvent.register === secondEvent.register && firstEvent.source === secondEvent.source) return 0;
      return (first < 0 ? Infinity : first) - (second < 0 ? Infinity : second);
    })
    .map((robot) => robot.seatId);
  continueRespawns(state, course, events);
}

function continueRespawns(state: MatchState, course: CourseDefinition, events: MatchEvent[]) {
  while (state.respawnQueue?.length) {
    const robot = robotFor(state, state.respawnQueue[0]);
    const choices = respawnChoices(state, course, robot);
    if (!choices.length) {
      state.respawnQueue.shift();
      continue;
    }
    if (robot.controller === 'human') {
      state.pendingDecision = {
        seatId: robot.seatId,
        kind: 'respawn-location',
        choices,
        context: { archive: { ...robot.archive }, occupied: Boolean(robotAt(state, robot.archive, robot.seatId)) },
      };
      state.phase = 'decision';
      return;
    }
    const [square, direction] = choices[0].split('|');
    const [x, y] = square.split(',').map(Number);
    respawnRobot(robot, { x, y }, direction as Direction, events);
    state.respawnQueue.shift();
  }
  state.respawnQueue = undefined;
  // Reset every surviving replacement without granting it a site reward.
  for (const robot of orderByDock(state, state.robots)) {
    if (robot.destroyed || robot.eliminated) continue;
    updateLockedRegisters(robot);
    const flywheelCard = robot.optionState.flywheelCard as string | undefined;
    if (flywheelCard && robot.registers.some((register) => register.card?.id === flywheelCard)) delete robot.optionState.flywheelCard;
    robot.optionState = robot.optionState.flywheelCard ? { flywheelCard: robot.optionState.flywheelCard } : {};
    if (robot.poweredDown) robot.poweredDown = robot.powerDownNext;
    if (robot.powerDownNext) {
      robot.poweredDown = true;
      robot.damage = 0;
      robot.registers.forEach((register) => { register.locked = false; register.card = null; });
      events.push({ ...event('power-down', `${robot.displayName} powered down and repaired fully.`, robot), stage: 'cleanup', to: { ...robot.position }, source: 'power-down' });
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
  if (applied) events.push({ ...event('damage', `${robot.displayName} took ${applied} damage from ${source}.`, robot), damage: applied, source, to: { ...robot.position } });
  if (robot.damage >= 10) destroyRobot(robot, events, 'critical damage');
}

function destroyRobot(robot: RobotState, events: MatchEvent[], cause: string) {
  if (robot.destroyed || robot.eliminated) return;
  robot.destroyed = true;
  robot.lives -= 1;
  if (robot.options.length) robot.options.splice(0, 1);
  if (robot.lives <= 0) robot.eliminated = true;
  const activeStage = [...events].reverse().find((item) => item.type === 'stage');
  events.push({ ...event(robot.eliminated ? 'eliminated' : 'destroyed', `${robot.displayName} was ${robot.eliminated ? 'eliminated' : 'destroyed'} by ${cause}.`, robot), register: activeStage?.register, stage: 'cleanup', from: { ...robot.position }, source: cause, data: { lives: robot.lives, deathStage: activeStage?.stage } });
}

function respawnChoices(state: MatchState, course: CourseDefinition, robot: RobotState): string[] {
  const archiveFree = insideCourse(course, robot.archive) && !courseTile(course, robot.archive.x, robot.archive.y)?.pit && !robotAt(state, robot.archive, robot.seatId);
  if (archiveFree) return DIRECTIONS.map((direction) => `${robot.archive.x},${robot.archive.y}|${direction}`);
  const bounds = courseBounds(course);
  for (let radius = 1; radius <= Math.max(bounds.width, bounds.height); radius += 1) {
    const choices: string[] = [];
    for (let y = robot.archive.y - radius; y <= robot.archive.y + radius; y += 1)
      for (let x = robot.archive.x - radius; x <= robot.archive.x + radius; x += 1) {
        if (Math.max(Math.abs(x - robot.archive.x), Math.abs(y - robot.archive.y)) !== radius) continue;
        const position = { x, y };
        if (!insideCourse(course, position) || courseTile(course, x, y)?.pit || robotAt(state, position, robot.seatId)) continue;
        for (const direction of DIRECTIONS) {
          let visible = false;
          let cursor = position;
          for (let distance = 1; distance <= 3; distance += 1) {
            if (blockedByWall(course, cursor, direction)) break;
            cursor = { x: cursor.x + VECTORS[direction].x, y: cursor.y + VECTORS[direction].y };
            if (!insideCourse(course, cursor)) break;
            if (robotAt(state, cursor, robot.seatId)) { visible = true; break; }
          }
          if (!visible) choices.push(`${x},${y}|${direction}`);
        }
      }
    if (choices.length) return choices;
  }
  return [];
}

function respawnRobot(robot: RobotState, position: Position, direction: Direction, events: MatchEvent[]) {
  const from = { ...robot.position };
  const fromDirection = robot.direction;
  robot.position = { ...position };
  robot.direction = direction;
  robot.destroyed = false;
  robot.damage = hasOption(robot, 'superior-archive-copy') ? 0 : 2;
  robot.registers.forEach((register) => { register.card = null; register.locked = false; });
  robot.options = robot.options.filter((option) => option.id !== 'superior-archive-copy');
  events.push({ ...event('respawn', `${robot.displayName} returned from its archive copy facing ${direction}.`, robot), stage: 'cleanup', source: 'archive-copy', data: { damage: robot.damage, lives: robot.lives }, from, to: { ...position }, path: [from, { ...position }], fromDirection, toDirection: direction });
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
  const {
    hands: _hands,
    programDeck,
    optionDeck,
    recentCommandIds: _commands,
    rngState: _rngState,
    pendingDecision: _pendingDecision,
    respawnQueue: _respawnQueue,
    robots,
    ...publicState
  } = state;
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
  const decision = state.pendingDecision?.seatId === seatId ? state.pendingDecision : undefined;
  return { public: publicView(state), seatId, hand: state.hands[seatId] ?? [], options: robot.options, decision, events: events.filter((item) => item.public || item.seatId === seatId) };
}

function finalizeEvents(state: MatchState, events: MatchEvent[]) {
  for (const [ordinal, item] of events.entries()) {
    item.revision = ++state.eventRevision;
    item.ordinal = ordinal;
  }
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
function insideCourse(course: CourseDefinition, position: Position) { return courseTile(course, position.x, position.y) !== undefined; }
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
