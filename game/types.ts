export type Direction = 'north' | 'east' | 'south' | 'west';
export type ProgramKind = 'move1' | 'move2' | 'move3' | 'backup' | 'left' | 'right' | 'uturn';
export type Phase = 'lobby' | 'programming' | 'executing' | 'decision' | 'paused' | 'complete';
export type ExecutionStage = 'program' | 'express-conveyor' | 'conveyor' | 'pushers' | 'gears' | 'lasers' | 'sites' | 'cleanup';
export type MatchMode = 'multiplayer' | 'solo';
export type RobotController = 'human' | 'bot';
export type CompletionReason = 'checkpoint' | 'human-eliminated';

export interface Position {
  x: number;
  y: number;
}

export interface ProgramCard {
  id: string;
  kind: ProgramKind;
  priority: number;
  distance?: number;
  rotation?: -2 | -1 | 1;
}

export type OptionTiming =
  | 'always'
  | 'programming'
  | 'movement'
  | 'laser'
  | 'damage'
  | 'power-down'
  | 'respawn';

export interface OptionCard {
  id: string;
  name: string;
  timing: OptionTiming;
  summary: string;
  charges?: number;
  optional?: boolean;
}

export interface RobotDefinition {
  id: string;
  name: string;
  color: string;
  accent: string;
  marker: string;
  silhouette: 'hammer' | 'tank' | 'spinner' | 'crusher' | 'hauler' | 'antenna' | 'walker' | 'racer';
  modelUrl: string;
  portraitUrl: string;
}

export interface ConveyorDefinition {
  direction: Direction;
  speed: 1 | 2;
  rotate?: 'left' | 'right';
}

export interface PusherDefinition {
  direction: Direction;
  activeRegisters: number[];
}

export interface LaserDefinition {
  direction: Direction;
  count: 1 | 2 | 3;
}

export interface TileDefinition {
  pit?: boolean;
  walls?: Direction[];
  conveyor?: ConveyorDefinition;
  gear?: 'left' | 'right';
  pusher?: PusherDefinition;
  laser?: LaserDefinition;
  repair?: 1 | 2;
  optionSite?: boolean;
  checkpoint?: number;
  archive?: boolean;
}

export interface BoardDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: Record<string, TileDefinition>;
}

export interface BoardPlacement {
  boardId: string;
  offset: Position;
  rotation?: 0 | 90 | 180 | 270;
}

export interface CourseDefinition {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  boards: BoardPlacement[];
  checkpoints: Array<Position & { number: number }>;
  docks: Array<Position & { number: number; direction: Direction }>;
}

export interface ProgramRegister {
  card: ProgramCard | null;
  locked: boolean;
}

export interface RobotState {
  seatId: string;
  robotId: string;
  displayName: string;
  controller: RobotController;
  position: Position;
  direction: Direction;
  archive: Position;
  damage: number;
  lives: number;
  checkpoint: number;
  registers: ProgramRegister[];
  options: Array<{ id: string; charges?: number }>;
  optionState: Record<string, unknown>;
  poweredDown: boolean;
  powerDownNext: boolean;
  destroyed: boolean;
  eliminated: boolean;
  connected: boolean;
  spawnDock?: number;
  finishedProgramming: boolean;
}

export interface PendingDecision {
  seatId: string;
  kind: 'respawn-location' | 'option-target' | 'option-direction';
  choices: string[];
  context?: Record<string, unknown>;
}

export interface MatchState {
  roomCode: string;
  mode: MatchMode;
  revision: number;
  eventRevision: number;
  phase: Phase;
  phaseBeforePause?: Phase;
  courseId: string;
  fourLifeRule: boolean;
  hostSeatId: string;
  dockingOrder: string[];
  robots: RobotState[];
  programDeck: ProgramCard[];
  optionDeck: string[];
  hands: Record<string, ProgramCard[]>;
  registerIndex: number;
  pendingDecision?: PendingDecision;
  respawnQueue?: string[];
  timerDeadline?: number;
  timerRemainingMs?: number;
  rngState: number;
  winnerSeatId?: string;
  completionReason?: CompletionReason;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  recentCommandIds: string[];
}

export type MatchCommand =
  | { type: 'start'; id: string; revision: number; courseId: string; fourLifeRule: boolean }
  | { type: 'choose-spawn'; id: string; revision: number; dock: number }
  | { type: 'choose-course'; id: string; revision: number; courseId: string }
  | { type: 'program'; id: string; revision: number; cards: string[] }
  | { type: 'announce-power-down'; id: string; revision: number; enabled: boolean }
  | { type: 'stay-powered-down'; id: string; revision: number; enabled: boolean }
  | { type: 'option'; id: string; revision: number; optionId: string; payload?: Record<string, unknown> }
  | { type: 'decision'; id: string; revision: number; choice: string };

export interface MatchEvent {
  revision: number;
  type: string;
  message: string;
  seatId?: string;
  robotId?: string;
  register?: number;
  stage?: ExecutionStage;
  ordinal?: number;
  from?: Position;
  to?: Position;
  path?: Position[];
  fromDirection?: Direction;
  toDirection?: Direction;
  source?: string;
  damage?: number;
  public: boolean;
  data?: Record<string, unknown>;
}

export interface PublicRobotView extends Omit<RobotState, 'registers' | 'options' | 'optionState'> {
  registers: Array<{ card: ProgramCard | null; locked: boolean }>;
  optionCount: number;
  revealedOptions: string[];
}

export interface PublicMatchView extends Omit<MatchState, 'hands' | 'programDeck' | 'optionDeck' | 'recentCommandIds' | 'rngState' | 'pendingDecision' | 'respawnQueue' | 'robots'> {
  robots: PublicRobotView[];
  programDeckCount: number;
  optionDeckCount: number;
}

export interface PrivateMatchView {
  public: PublicMatchView;
  seatId: string;
  hand: ProgramCard[];
  options: RobotState['options'];
  decision?: PendingDecision;
  events: MatchEvent[];
}

export const tileKey = ({ x, y }: Position) => `${x},${y}`;
