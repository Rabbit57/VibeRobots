import type { ProgramCard, ProgramKind } from '../types';

function card(kind: ProgramKind, priority: number): ProgramCard {
  if (kind.startsWith('move')) {
    return { id: `program-${priority}`, kind, priority, distance: Number(kind.slice(-1)) };
  }
  if (kind === 'backup') return { id: `program-${priority}`, kind, priority, distance: -1 };
  return {
    id: `program-${priority}`,
    kind,
    priority,
    rotation: kind === 'left' ? -1 : kind === 'right' ? 1 : -2,
  };
}

/** The complete 2005 Program deck, expressed as original data rather than card artwork. */
export const PROGRAM_DECK: ProgramCard[] = [
  ...Array.from({ length: 6 }, (_, i) => card('uturn', 10 + i * 10)),
  ...Array.from({ length: 18 }, (_, i) => card(i % 2 === 0 ? 'left' : 'right', 70 + i * 10)),
  ...Array.from({ length: 18 }, (_, i) => card(i % 2 === 0 ? 'left' : 'right', 250 + i * 10)),
  ...Array.from({ length: 6 }, (_, i) => card('backup', 430 + i * 10)),
  ...Array.from({ length: 18 }, (_, i) => card('move1', 490 + i * 10)),
  ...Array.from({ length: 12 }, (_, i) => card('move2', 670 + i * 10)),
  ...Array.from({ length: 6 }, (_, i) => card('move3', 790 + i * 10)),
];

export const PROGRAM_BY_ID = new Map(PROGRAM_DECK.map((program) => [program.id, program]));

export const PROGRAM_LABELS: Record<ProgramKind, string> = {
  move1: 'Move 1',
  move2: 'Move 2',
  move3: 'Move 3',
  backup: 'Back Up',
  left: 'Rotate Left',
  right: 'Rotate Right',
  uturn: 'U-Turn',
};
