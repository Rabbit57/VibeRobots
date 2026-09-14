import type { MatchEvent, PrivateMatchView, ProgramCard, PublicRobotView } from './types';

export type VisualMode = 'home' | 'lobby' | 'programming' | 'laser' | 'destruction' | 'respawn' | 'victory';

export interface VisualFixture {
  mode: VisualMode;
  screen: 'home' | 'lobby' | 'match';
  view?: PrivateMatchView;
  activeEvent?: MatchEvent;
}

const cards: ProgramCard[] = [
  { id: 'move-1', kind: 'move1', priority: 490, distance: 1 },
  { id: 'right-1', kind: 'right', priority: 270, rotation: 1 },
  { id: 'move-2', kind: 'move2', priority: 680, distance: 2 },
  { id: 'left-1', kind: 'left', priority: 110, rotation: -1 },
  { id: 'backup-1', kind: 'backup', priority: 430, distance: -1 },
  { id: 'move-3', kind: 'move3', priority: 810, distance: 3 },
  { id: 'uturn-1', kind: 'uturn', priority: 30, rotation: -2 },
  { id: 'move-4', kind: 'move1', priority: 520, distance: 1 },
  { id: 'right-2', kind: 'right', priority: 330, rotation: 1 },
];

function robot(seatId: string, robotId: string, displayName: string, x: number, y: number): PublicRobotView {
  return {
    seatId, robotId, displayName, position: { x, y }, direction: seatId === 'ada' ? 'east' : 'west', archive: { x, y },
    damage: seatId === 'ada' ? 2 : 5, lives: 3, checkpoint: seatId === 'ada' ? 2 : 1,
    registers: Array.from({ length: 5 }, () => ({ card: null, locked: false })),
    optionCount: seatId === 'ada' ? 1 : 0, revealedOptions: seatId === 'ada' ? ['gyroscopic-stabilizer'] : [],
    poweredDown: false, powerDownNext: false, destroyed: false, eliminated: false, connected: true, finishedProgramming: false,
  };
}

function view(phase: PrivateMatchView['public']['phase'], robots: PublicRobotView[], events: MatchEvent[] = []): PrivateMatchView {
  return {
    public: {
      roomCode: 'COZYBOTS42', revision: 42, eventRevision: 87, phase, courseId: 'risky-exchange', fourLifeRule: false,
      hostSeatId: 'ada', dockingOrder: ['ada', 'grace'], robots, registerIndex: phase === 'lobby' ? 0 : 3,
      programDeckCount: 66, optionDeckCount: 22, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_010_000,
      winnerSeatId: phase === 'complete' ? 'ada' : undefined,
    },
    seatId: 'ada', hand: phase === 'lobby' ? [] : cards, options: [{ id: 'gyroscopic-stabilizer' }], events,
  };
}

function event(type: string, message: string, extra: Partial<MatchEvent>): MatchEvent {
  return { revision: 87, ordinal: 6, type, message, public: true, register: 3, stage: 'lasers', ...extra };
}

export function makeVisualFixture(candidate: string): VisualFixture | undefined {
  const mode = candidate as VisualMode;
  if (!['home', 'lobby', 'programming', 'laser', 'destruction', 'respawn', 'victory'].includes(mode)) return;
  if (mode === 'home') return { mode, screen: 'home' };
  const ada = robot('ada', 'hammer-bot', 'Ada', 3, 8);
  const grace = robot('grace', 'twitch', 'Grace', 8, 6);
  if (mode === 'lobby') return { mode, screen: 'lobby', view: view('lobby', [ada, grace]) };
  if (mode === 'programming') return { mode, screen: 'match', view: view('programming', [ada, grace]) };
  if (mode === 'laser') {
    const activeEvent = event('laser-fired', 'A warm little laser crosses the factory.', { source: 'factory-laser', path: [{ x: 3, y: 6 }, { x: 8, y: 6 }], to: { x: 8, y: 6 } });
    return { mode, screen: 'match', view: view('executing', [ada, grace]), activeEvent };
  }
  if (mode === 'destruction') {
    grace.damage = 10;
    grace.destroyed = true;
    grace.lives = 2;
    const activeEvent = event('destroyed', 'Grace bursts into a shower of harmless toy sparks.', { seatId: 'grace', robotId: 'twitch', source: 'factory-laser', from: { x: 8, y: 6 }, to: { x: 8, y: 6 }, damage: 5 });
    return { mode, screen: 'match', view: view('executing', [ada, grace]), activeEvent };
  }
  if (mode === 'respawn') {
    grace.damage = 2;
    grace.lives = 2;
    grace.position = { x: 9, y: 10 };
    const activeEvent = event('respawn', 'Grace pops back onto the last archive marker.', { seatId: 'grace', robotId: 'twitch', stage: 'cleanup', from: { x: 8, y: 6 }, to: { x: 9, y: 10 } });
    return { mode, screen: 'match', view: view('executing', [ada, grace]), activeEvent };
  }
  ada.checkpoint = 4;
  const activeEvent = event('victory', 'Ada reaches the final flag!', { seatId: 'ada', robotId: 'hammer-bot', stage: 'sites', to: { x: 3, y: 8 } });
  return { mode, screen: 'match', view: view('complete', [ada, grace]), activeEvent };
}
