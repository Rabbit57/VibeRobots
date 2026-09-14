import { COURSE_BY_ID } from '../game/content/boards';
import { OPTION_BY_ID } from '../game/content/options';
import { PROGRAM_DECK } from '../game/content/programs';
import { resolveTurn } from '../game/engine';
import type { MatchCommand, MatchState, PrivateMatchView, ProgramCard, PublicRobotView } from '../game/types';

const origin = process.env.VIBE_ROBOTS_ORIGIN ?? 'https://vibe-robots.ailocalops.com';
const socketOrigin = origin.replace(/^http/, 'ws');
const timeoutMs = 20_000;

interface SeatCredentials {
  code: string;
  seatId: string;
  seatToken: string;
  view: PrivateMatchView;
}

type WithoutCommandEnvelope<T> = T extends unknown ? Omit<T, 'id' | 'revision'> : never;
type OutboundCommand = WithoutCommandEnvelope<MatchCommand>;

class SeatClient {
  view: PrivateMatchView;
  private socket: WebSocket;
  private messageNumber = 0;
  private waiters: Array<{
    after: number;
    predicate: (view: PrivateMatchView) => boolean;
    resolve: (view: PrivateMatchView) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private credentials: SeatCredentials) {
    this.view = credentials.view;
    this.socket = new WebSocket(`${socketOrigin}/api/rooms/${credentials.code}/socket`);
    this.socket.addEventListener('open', () => {
      this.socket.send(JSON.stringify({ type: 'authenticate', seatId: credentials.seatId, seatToken: credentials.seatToken }));
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { type: string; view?: PrivateMatchView; error?: string };
      this.messageNumber += 1;
      if (message.view) this.view = message.view;
      const pending = this.waiters;
      this.waiters = [];
      for (const waiter of pending) {
        if (message.type === 'rejected') waiter.reject(new Error(message.error ?? 'Command rejected.'));
        else if (this.messageNumber > waiter.after && waiter.predicate(this.view)) waiter.resolve(this.view);
        else this.waiters.push(waiter);
      }
    });
    this.socket.addEventListener('error', () => this.rejectAll(new Error('Production WebSocket failed.')));
    this.socket.addEventListener('close', () => this.rejectAll(new Error('Production WebSocket closed.')));
  }

  waitFor(predicate: (view: PrivateMatchView) => boolean) {
    if (predicate(this.view)) return Promise.resolve(this.view);
    const after = this.messageNumber;
    return new Promise<PrivateMatchView>((resolve, reject) => {
      const waiter = { after, predicate, resolve, reject };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
          reject(new Error('Timed out waiting for an authoritative snapshot.'));
        }
      }, timeoutMs);
    });
  }

  async command(command: OutboundCommand) {
    const before = this.view.public.revision;
    const full = { ...command, id: crypto.randomUUID(), revision: before } as MatchCommand;
    this.socket.send(JSON.stringify({ type: 'command', command: full }));
    return this.waitFor((view) => view.public.revision > before);
  }

  close() {
    this.socket.close(1000, 'Production verification complete');
  }

  private rejectAll(error: Error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}

const created = await post<SeatCredentials>('/api/rooms', { displayName: 'Release Host', robotId: 'hammer-bot' }, 201);
const joined = await post<SeatCredentials>(`/api/rooms/${created.code}/join`, { displayName: 'Release Guest', robotId: 'hulk-x90' }, 201);
const host = new SeatClient(created);
const guest = new SeatClient(joined);

try {
  await Promise.all([
    host.waitFor((view) => view.public.robots.every((robot) => robot.connected)),
    guest.waitFor((view) => view.public.robots.every((robot) => robot.connected)),
  ]);
  await host.command({ type: 'choose-spawn', dock: 7 });
  await guest.command({ type: 'choose-spawn', dock: 5 });
  await host.command({ type: 'start', courseId: 'risky-exchange', fourLifeRule: false });
  await guest.waitFor((view) => view.public.phase === 'programming');
  await guest.command({ type: 'announce-power-down', enabled: true });
  await host.waitFor((view) => view.public.revision === guest.view.public.revision);

  for (let turn = 1; turn <= 40 && host.view.public.phase !== 'complete'; turn += 1) {
    const guestRobot = ownRobot(guest.view);
    let guestPlan: ProgramCard[] | undefined;
    if (!guestRobot.poweredDown && !guestRobot.finishedProgramming) {
      guestPlan = choosePlan(guest.view, host.view, undefined, true);
      await guest.command({ type: 'program', cards: guestPlan.map((card) => card.id) });
      await host.waitFor((view) => view.public.revision === guest.view.public.revision);
    }

    const hostRobot = ownRobot(host.view);
    if (!hostRobot.poweredDown && !hostRobot.finishedProgramming && host.view.public.phase === 'programming') {
      const hostPlan = choosePlan(host.view, guest.view, guestPlan, false);
      await host.command({ type: 'program', cards: hostPlan.map((card) => card.id) });
      await guest.waitFor((view) => view.public.revision === host.view.public.revision);
    }

    const current = ownRobot(host.view);
    console.log(`Turn ${turn}: checkpoint ${current.checkpoint}/3, damage ${current.damage}, lives ${current.lives}, position ${current.position.x},${current.position.y}`);
    if (current.eliminated) throw new Error('Release host was eliminated before completing the course.');
  }

  if (host.view.public.phase !== 'complete' || host.view.public.winnerSeatId !== created.seatId) {
    throw new Error('Production match did not reach a verified victory within 40 turns.');
  }
  console.log(`Full production multiplayer match passed in room ${created.code}; winner reached every checkpoint.`);
} finally {
  host.close();
  guest.close();
}

function choosePlan(player: PrivateMatchView, opponent: PrivateMatchView, opponentPlan: ProgramCard[] | undefined, survivalOnly: boolean) {
  const robot = ownRobot(player);
  const openCount = robot.registers.filter((register) => !register.locked).length;
  if (openCount === 0) return [];
  let best: ProgramCard[] | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of permutations(player.hand, openCount)) {
    const simulated = simulate(player, opponent, candidate, opponentPlan);
    const result = simulated.robots.find((item) => item.seatId === player.seatId)!;
    const course = COURSE_BY_ID.get(simulated.courseId)!;
    const target = course.checkpoints[Math.min(result.checkpoint, course.checkpoints.length - 1)];
    const distance = Math.abs(result.position.x - target.x) + Math.abs(result.position.y - target.y);
    const facingBonus = directionDistance(result.position, result.direction, target) < distance ? 3 : 0;
    const score = result.eliminated
      ? -1_000_000
      : survivalOnly
        ? result.lives * 100_000 - result.damage * 1_000 - (result.destroyed ? 50_000 : 0) - Math.abs(result.position.y - 12)
        : (simulated.winnerSeatId === player.seatId ? 10_000_000 : 0) + result.checkpoint * 1_000_000 + result.lives * 10_000 - (result.destroyed ? 100_000 : 0) - result.damage * 1_000 - distance * 20 + facingBonus;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best) throw new Error('No legal program could be selected.');
  return best;
}

function simulate(player: PrivateMatchView, opponent: PrivateMatchView, playerPlan: ProgramCard[], opponentPlan?: ProgramCard[]) {
  const publicState = structuredClone(player.public);
  const { programDeckCount: _programDeckCount, optionDeckCount: _optionDeckCount, ...base } = publicState;
  const views = new Map([[player.seatId, player], [opponent.seatId, opponent]]);
  const state: MatchState = {
    ...base,
    phase: 'executing',
    rngState: 57,
    programDeck: [...PROGRAM_DECK],
    optionDeck: [],
    hands: Object.fromEntries([...views].map(([seatId, view]) => [seatId, view.hand])),
    recentCommandIds: [],
    robots: publicState.robots.map((robot) => hydrateRobot(robot, views.get(robot.seatId))),
  };
  assignPlan(state, player.seatId, playerPlan);
  if (opponentPlan) assignPlan(state, opponent.seatId, opponentPlan);
  resolveTurn(state);
  return state;
}

function hydrateRobot(robot: PublicRobotView, view?: PrivateMatchView) {
  const { optionCount: _optionCount, revealedOptions: _revealedOptions, ...base } = structuredClone(robot);
  return {
    ...base,
    options: view?.options.map((option) => ({ ...option })) ?? robot.revealedOptions.map((id) => ({ id, charges: OPTION_BY_ID.get(id)?.charges })),
    optionState: {},
  };
}

function assignPlan(state: MatchState, seatId: string, cards: ProgramCard[]) {
  const robot = state.robots.find((item) => item.seatId === seatId)!;
  let cursor = 0;
  for (const register of robot.registers) if (!register.locked) register.card = cards[cursor++] ?? null;
}

function ownRobot(view: PrivateMatchView) {
  return view.public.robots.find((robot) => robot.seatId === view.seatId)!;
}

function* permutations(cards: ProgramCard[], count: number, prefix: ProgramCard[] = [], used = new Set<number>()): Generator<ProgramCard[]> {
  if (prefix.length === count) {
    yield prefix;
    return;
  }
  for (let index = 0; index < cards.length; index += 1) {
    if (used.has(index)) continue;
    used.add(index);
    yield* permutations(cards, count, [...prefix, cards[index]], used);
    used.delete(index);
  }
}

function directionDistance(position: { x: number; y: number }, direction: string, target: { x: number; y: number }) {
  const vector = direction === 'north' ? { x: 0, y: -1 } : direction === 'east' ? { x: 1, y: 0 } : direction === 'south' ? { x: 0, y: 1 } : { x: -1, y: 0 };
  return Math.abs(position.x + vector.x - target.x) + Math.abs(position.y + vector.y - target.y);
}

async function post<T>(path: string, body: Record<string, unknown>, expected: number) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (response.status !== expected) throw new Error(`Production request ${path} failed (${response.status}).`);
  return response.json() as Promise<T>;
}
