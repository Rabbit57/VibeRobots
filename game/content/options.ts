import type { OptionCard } from '../types';

/** Paraphrased descriptions; identifiers map to the audited 2005 Option set. */
export const OPTION_CARDS: OptionCard[] = [
  { id: 'ablative-coat', name: 'Ablative Coat', timing: 'damage', charges: 3, summary: 'The next three damage are absorbed, then discard this upgrade.' },
  { id: 'abort-switch', name: 'Abort Switch', timing: 'movement', optional: true, summary: 'Replace the current card at random; later registers this turn also become random.' },
  { id: 'brakes', name: 'Brakes', timing: 'movement', optional: true, summary: 'Treat a Move 1 as staying in place.' },
  { id: 'circuit-breaker', name: 'Circuit Breaker', timing: 'power-down', summary: 'Ending a turn at three or more damage schedules a power-down.' },
  { id: 'conditional-program', name: 'Conditional Program', timing: 'programming', optional: true, summary: 'Keep one spare card and swap it into a register before reveal.' },
  { id: 'double-barrel-laser', name: 'Double Barrel Laser', timing: 'laser', summary: 'Your forward laser deals two damage.' },
  { id: 'extra-memory', name: 'Extra Memory', timing: 'programming', summary: 'Receive one additional Program card.' },
  { id: 'fire-control', name: 'Fire Control', timing: 'laser', optional: true, summary: 'After a laser hit, target a register or installed Option.' },
  { id: 'flywheel', name: 'Flywheel', timing: 'programming', optional: true, summary: 'Save one unused Program card for a later turn.' },
  { id: 'fourth-gear', name: 'Fourth Gear', timing: 'movement', optional: true, summary: 'Extend a Move 3 to four spaces.' },
  { id: 'gyroscopic-stabilizer', name: 'Gyroscopic Stabilizer', timing: 'movement', optional: true, summary: 'Ignore conveyor and gear rotation for this turn.' },
  { id: 'high-power-laser', name: 'High Power Laser', timing: 'laser', summary: 'Your laser penetrates the first wall or robot in its path.' },
  { id: 'mechanical-arm', name: 'Mechanical Arm', timing: 'always', summary: 'Touch a checkpoint from an open orthogonally adjacent space.' },
  { id: 'mini-howitzer', name: 'Mini Howitzer', timing: 'laser', optional: true, charges: 5, summary: 'Replace your laser with a damaging shot that pushes its target.' },
  { id: 'power-down-shield', name: 'Power-Down Shield', timing: 'power-down', summary: 'Prevent one point of damage each register while powered down.' },
  { id: 'pressor-beam', name: 'Pressor Beam', timing: 'laser', optional: true, summary: 'Replace your laser with a beam that pushes one robot away.' },
  { id: 'radio-control', name: 'Radio Control', timing: 'laser', optional: true, summary: 'Replace a nearby robot’s remaining program with your program.' },
  { id: 'ramming-gear', name: 'Ramming Gear', timing: 'movement', summary: 'A robot you push suffers one damage.' },
  { id: 'rear-laser', name: 'Rear Laser', timing: 'laser', summary: 'Fire an additional laser behind your robot.' },
  { id: 'recompile', name: 'Recompile', timing: 'programming', optional: true, summary: 'Redraw your whole hand once this turn and suffer one damage.' },
  { id: 'reverse-gears', name: 'Reverse Gears', timing: 'movement', optional: true, summary: 'Back Up may travel two spaces.' },
  { id: 'scrambler', name: 'Scrambler', timing: 'laser', optional: true, summary: 'Replace the target’s next unrevealed card at random.' },
  { id: 'shield', name: 'Shield', timing: 'programming', optional: true, summary: 'Choose a facing; prevent one damage each register from that direction.' },
  { id: 'superior-archive-copy', name: 'Superior Archive Copy', timing: 'respawn', summary: 'Your next replacement robot avoids the usual two damage.' },
  { id: 'tractor-beam', name: 'Tractor Beam', timing: 'laser', optional: true, summary: 'Replace your laser with a beam that pulls a non-adjacent target closer.' },
  { id: 'turret', name: 'Turret', timing: 'programming', optional: true, summary: 'Choose the direction your main laser faces this turn.' },
];

export const OPTION_BY_ID = new Map(OPTION_CARDS.map((option) => [option.id, option]));
