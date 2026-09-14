import type { BoardDefinition, CourseDefinition, Direction, TileDefinition } from '../types';

type TilePatch = [number, number, TileDefinition];

const put = (patches: TilePatch[]) =>
  Object.fromEntries(patches.map(([x, y, tile]) => [`${x},${y}`, tile]));

const line = (
  points: Array<[number, number]>,
  direction: Direction,
  speed: 1 | 2,
  rotate?: 'left' | 'right',
): TilePatch[] => points.map(([x, y]) => [x, y, { conveyor: { direction, speed, rotate } }]);

const rectLoop = (x: number, y: number, width: number, height: number, speed: 1 | 2): TilePatch[] => [
  ...line(Array.from({ length: width - 1 }, (_, i) => [x + i, y] as [number, number]), 'east', speed),
  ...line(Array.from({ length: height - 1 }, (_, i) => [x + width - 1, y + i] as [number, number]), 'south', speed),
  ...line(Array.from({ length: width - 1 }, (_, i) => [x + width - 1 - i, y + height - 1] as [number, number]), 'west', speed),
  ...line(Array.from({ length: height - 1 }, (_, i) => [x, y + height - 1 - i] as [number, number]), 'north', speed),
];

const mergeTiles = (...groups: TilePatch[][]): Record<string, TileDefinition> => {
  const tiles: Record<string, TileDefinition> = {};
  for (const [x, y, patch] of groups.flat()) {
    const key = `${x},${y}`;
    const current = tiles[key] ?? {};
    tiles[key] = { ...current, ...patch, walls: [...(current.walls ?? []), ...(patch.walls ?? [])] };
  }
  return tiles;
};

const exchange: BoardDefinition = {
  id: 'exchange',
  name: 'Exchange',
  width: 12,
  height: 12,
  tiles: mergeTiles(
    line([[1, 0], [5, 0], [8, 0], [1, 11], [5, 11], [8, 11]], 'south', 1),
    line([[10, 0], [3, 9], [3, 10], [3, 11], [6, 9], [6, 10]], 'north', 1),
    line([[3, 0], [3, 1], [3, 2], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 7]], 'north', 2),
    line([[0, 1], [11, 1], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [7, 5], [8, 5], [9, 5], [10, 5], [0, 8], [1, 8], [2, 8], [9, 8], [10, 8], [11, 8]], 'west', 1),
    line([[0, 3], [1, 3], [2, 3], [3, 3], [9, 3], [10, 3], [11, 3], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6]], 'east', 1),
    line([[7, 6], [8, 6], [9, 6], [10, 6], [11, 6]], 'east', 2),
    [
      [5, 1, { conveyor: { direction: 'south', speed: 1 } }], [8, 1, { conveyor: { direction: 'south', speed: 1 } }],
      [5, 2, { conveyor: { direction: 'south', speed: 1 } }], [8, 2, { conveyor: { direction: 'south', speed: 1 } }],
      [5, 3, { conveyor: { direction: 'south', speed: 1 } }], [5, 4, { conveyor: { direction: 'south', speed: 1 } }],
      [5, 7, { conveyor: { direction: 'south', speed: 1 } }], [5, 8, { conveyor: { direction: 'south', speed: 1 } }],
      [5, 9, { conveyor: { direction: 'south', speed: 1 } }], [5, 10, { conveyor: { direction: 'south', speed: 1 } }],
      [8, 9, { conveyor: { direction: 'south', speed: 1 } }], [8, 10, { conveyor: { direction: 'south', speed: 1 } }],
      [1, 1, { gear: 'right' }], [10, 1, { gear: 'right' }], [8, 3, { gear: 'left' }], [3, 8, { gear: 'left' }], [8, 8, { gear: 'left' }],
      [11, 0, { repair: 1, archive: true }], [7, 4, { repair: 1, optionSite: true, archive: true }], [0, 11, { repair: 1, archive: true }],
      [1, 9, { pit: true }], [10, 11, { pit: true }],
      [2, 0, { laser: { direction: 'south', count: 1 }, walls: ['north'] }],
      [2, 2, { walls: ['south'] }], [3, 4, { walls: ['east'] }], [4, 4, { walls: ['east', 'south'] }],
      [7, 4, { walls: ['west', 'south'] }], [9, 1, { walls: ['west'] }],
      [0, 2, { walls: ['west'] }], [11, 2, { walls: ['east'] }], [0, 4, { walls: ['west'] }], [11, 4, { walls: ['east'] }],
      [0, 7, { walls: ['west'] }], [4, 7, { walls: ['east', 'north'] }], [7, 7, { walls: ['west', 'north'] }], [11, 7, { walls: ['east'] }],
      [0, 9, { walls: ['west'] }], [10, 9, { walls: ['south'] }], [11, 9, { walls: ['east'] }], [0, 10, { walls: ['west'] }], [10, 10, { walls: ['east'] }],
    ],
  ),
};

const spinZone: BoardDefinition = {
  id: 'spin-zone',
  name: 'Spin Zone',
  width: 12,
  height: 12,
  tiles: mergeTiles(
    rectLoop(1, 1, 4, 4, 2),
    rectLoop(7, 1, 4, 4, 2),
    rectLoop(1, 7, 4, 4, 2),
    rectLoop(7, 7, 4, 4, 2),
    [
      [2, 2, { gear: 'right' }], [3, 3, { gear: 'right' }], [5, 2, { gear: 'left' }],
      [8, 2, { gear: 'right' }], [9, 3, { gear: 'right' }], [6, 4, { gear: 'left' }],
      [4, 5, { gear: 'left' }], [9, 5, { gear: 'left' }], [2, 6, { gear: 'left' }], [7, 6, { gear: 'left' }],
      [2, 8, { gear: 'right' }], [3, 9, { gear: 'right' }], [5, 7, { gear: 'left' }],
      [8, 8, { gear: 'right' }], [8, 9, { gear: 'right' }], [6, 8, { gear: 'left' }],
      [2, 3, { repair: 1, archive: true }], [8, 3, { repair: 1, optionSite: true, archive: true }],
      [3, 8, { repair: 1, optionSite: true, archive: true }], [9, 8, { repair: 1, archive: true }],
      [3, 6, { laser: { direction: 'north', count: 1 }, walls: ['south'] }], [3, 2, { walls: ['south'] }],
      [6, 3, { laser: { direction: 'west', count: 1 }, walls: ['east', 'west'] }],
      [8, 5, { laser: { direction: 'south', count: 1 }, walls: ['north'] }], [8, 8, { walls: ['south'] }],
      [6, 8, { laser: { direction: 'west', count: 1 }, walls: ['east', 'west'] }],
    ],
  ),
};

const chess: BoardDefinition = {
  id: 'chess',
  name: 'Chess',
  width: 12,
  height: 12,
  tiles: mergeTiles(
    rectLoop(1, 1, 10, 10, 2),
    line([[3, 2], [5, 2], [7, 2], [9, 2], [2, 3], [4, 3], [6, 3], [3, 4], [5, 4], [7, 4], [9, 4], [2, 5], [8, 5]], 'south', 1),
    line([[3, 6], [9, 6], [2, 7], [4, 7], [6, 7], [8, 7], [3, 8], [7, 8], [9, 8], [2, 9], [4, 9], [6, 9], [8, 9]], 'north', 1),
    [
      [8, 3, { pit: true }], [4, 5, { pit: true }], [7, 6, { pit: true }], [5, 8, { pit: true }],
      [0, 0, { repair: 1, archive: true }], [6, 5, { repair: 1, optionSite: true, archive: true }], [5, 6, { repair: 1, optionSite: true, archive: true }], [11, 11, { repair: 1, archive: true }],
      [2, 0, { walls: ['south'] }], [4, 0, { walls: ['south'] }], [7, 0, { walls: ['south'] }], [9, 0, { walls: ['south'] }],
      [0, 2, { walls: ['east'] }], [11, 2, { walls: ['west'] }], [0, 4, { walls: ['east'] }], [11, 4, { walls: ['west'] }],
      [0, 7, { walls: ['east'] }], [11, 7, { walls: ['west'] }], [0, 9, { walls: ['east'] }], [11, 9, { walls: ['west'] }],
      [3, 1, { walls: ['south'] }], [5, 1, { walls: ['south'] }], [6, 1, { walls: ['south'] }], [8, 1, { walls: ['south'] }],
      [3, 10, { walls: ['south'] }], [5, 10, { walls: ['south'] }], [6, 10, { walls: ['south'] }], [8, 10, { walls: ['south'] }],
    ],
  ),
};

const chopShop: BoardDefinition = {
  id: 'chop-shop',
  name: 'Chop Shop',
  width: 12,
  height: 12,
  tiles: mergeTiles(
    line([[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]], 'north', 2),
    line([[5, 0], [5, 1], [5, 2]], 'south', 2),
    line([[6, 0], [6, 1], [6, 2], [6, 3]], 'north', 1),
    line([[8, 0], [8, 1], [8, 2], [8, 9], [8, 10], [8, 11], [1, 6], [1, 7], [1, 8], [1, 9], [1, 11]], 'south', 1),
    line([[10, 1], [11, 1], [0, 5], [1, 5], [7, 5], [9, 5], [10, 5], [11, 5], [9, 8], [10, 8], [11, 8]], 'west', 1),
    line([[0, 6], [5, 4]], 'east', 1),
    line([[3, 9], [3, 10], [3, 11]], 'north', 1),
    [
      [4, 2, { conveyor: { direction: 'west', speed: 2 } }], [5, 2, { conveyor: { direction: 'west', speed: 2, rotate: 'right' } }],
      [9, 1, { conveyor: { direction: 'south', speed: 1, rotate: 'left' } }],
      [6, 5, { conveyor: { direction: 'south', speed: 1, rotate: 'right' } }], [1, 6, { conveyor: { direction: 'south', speed: 1, rotate: 'right' } }],
      [8, 5, { gear: 'right' }], [2, 5, { gear: 'right' }], [2, 6, { gear: 'left' }], [4, 8, { gear: 'right' }], [5, 8, { gear: 'left' }], [9, 8, { gear: 'left' }],
      [0, 0, { repair: 1, archive: true }], [5, 5, { repair: 1, optionSite: true, archive: true }], [9, 4, { repair: 1, optionSite: true, archive: true }], [2, 9, { repair: 1, optionSite: true, archive: true }], [11, 11, { repair: 1, archive: true }],
      [1, 1, { pit: true }], [9, 3, { pit: true }], [7, 6, { pit: true }], [5, 9, { pit: true }], [9, 9, { pit: true }],
      [2, 7, { laser: { direction: 'north', count: 1 }, walls: ['south'] }], [2, 1, { walls: ['south'] }],
      [8, 6, { laser: { direction: 'south', count: 1 }, walls: ['south'] }], [8, 4, { walls: ['north'] }],
      [6, 8, { laser: { direction: 'west', count: 2 }, walls: ['east'] }], [3, 8, { walls: ['west'] }],
      [1, 10, { laser: { direction: 'west', count: 3 }, walls: ['west'] }],
      [7, 10, { laser: { direction: 'east', count: 1 }, walls: ['west'] }], [10, 10, { walls: ['west'] }],
    ],
  ),
};

export const BOARDS: BoardDefinition[] = [exchange, spinZone, chess, chopShop];
export const BOARD_BY_ID = new Map(BOARDS.map((board) => [board.id, board]));

const docks = [7, 5, 3, 1, 2, 4, 6, 8].map((number, index) => ({
  number,
  x: [0, 1, 3, 5, 6, 8, 10, 11][index],
  y: 12,
  direction: 'north' as const,
}));

export const COURSES: CourseDefinition[] = [
  {
    id: 'risky-exchange',
    name: 'Risky Exchange',
    difficulty: 'medium',
    boards: [{ boardId: 'exchange', offset: { x: 0, y: 0 }, rotation: 0 }],
    checkpoints: [{ number: 1, x: 7, y: 1 }, { number: 2, x: 9, y: 7 }, { number: 3, x: 1, y: 4 }],
    docks,
  },
  {
    id: 'dizzy-dash',
    name: 'Dizzy Dash',
    difficulty: 'hard',
    boards: [{ boardId: 'spin-zone', offset: { x: 0, y: 0 }, rotation: 0 }],
    checkpoints: [{ number: 1, x: 5, y: 4 }, { number: 2, x: 10, y: 11 }, { number: 3, x: 1, y: 6 }],
    docks,
  },
  {
    id: 'against-the-grain',
    name: 'Against the Grain',
    difficulty: 'hard',
    boards: [
      { boardId: 'chop-shop', offset: { x: 0, y: 0 }, rotation: 180 },
      { boardId: 'chess', offset: { x: 0, y: 12 }, rotation: 0 },
    ],
    checkpoints: [{ number: 1, x: 10, y: 9 }, { number: 2, x: 3, y: 3 }, { number: 3, x: 5, y: 17 }],
    docks: docks.map((dock) => ({ ...dock, y: 24 })),
  },
];

export const COURSE_BY_ID = new Map(COURSES.map((course) => [course.id, course]));

export function courseTile(course: CourseDefinition, x: number, y: number): TileDefinition | undefined {
  const checkpoint = course.checkpoints.find((flag) => flag.x === x && flag.y === y);
  for (const placement of course.boards) {
    const localX = x - placement.offset.x;
    const localY = y - placement.offset.y;
    const board = BOARD_BY_ID.get(placement.boardId);
    if (board && localX >= 0 && localX < board.width && localY >= 0 && localY < board.height) {
      const rotation = placement.rotation ?? 0;
      const source = rotation === 90
        ? { x: localY, y: board.height - 1 - localX }
        : rotation === 180
          ? { x: board.width - 1 - localX, y: board.height - 1 - localY }
          : rotation === 270
            ? { x: board.width - 1 - localY, y: localX }
            : { x: localX, y: localY };
      return { ...rotateTile(board.tiles[`${source.x},${source.y}`] ?? {}, rotation), checkpoint: checkpoint?.number };
    }
  }
  return checkpoint ? { checkpoint: checkpoint.number } : undefined;
}

function rotateTile(tile: TileDefinition, rotation: 0 | 90 | 180 | 270): TileDefinition {
  const turns = rotation / 90;
  const rotateDirection = (direction: Direction) => {
    const directions: Direction[] = ['north', 'east', 'south', 'west'];
    return directions[(directions.indexOf(direction) + turns) % 4];
  };
  return {
    ...tile,
    walls: tile.walls?.map(rotateDirection),
    conveyor: tile.conveyor && { ...tile.conveyor, direction: rotateDirection(tile.conveyor.direction) },
    pusher: tile.pusher && { ...tile.pusher, direction: rotateDirection(tile.pusher.direction) },
    laser: tile.laser && { ...tile.laser, direction: rotateDirection(tile.laser.direction) },
  };
}

export function courseBounds(course: CourseDefinition) {
  return course.boards.reduce(
    (bounds, placement) => {
      const board = BOARD_BY_ID.get(placement.boardId)!;
      return {
        width: Math.max(bounds.width, placement.offset.x + board.width),
        height: Math.max(bounds.height, placement.offset.y + board.height),
      };
    },
    { width: 0, height: 0 },
  );
}

export const BOARD_TILE_EXPORT = put;
