import type { Direction, MatchEvent, PublicRobotView } from './types';

export type PlaybackSpeed = 'normal' | 'fast';

export interface PresentationStep {
  event: MatchEvent;
  durationMs: number;
}

export interface PresentationQueue {
  lastRevision: number;
  steps: PresentationStep[];
}

const VISUAL_EVENT_TYPES = new Set([
  'program', 'move', 'push', 'conveyor', 'express-conveyor', 'pusher', 'turn', 'gear',
  'laser-fired', 'damage', 'destroyed', 'eliminated', 'respawn', 'checkpoint', 'victory',
  'power-down', 'option-acquired', 'option-activated',
]);

export function isVisualEvent(event: MatchEvent): boolean {
  return VISUAL_EVENT_TYPES.has(event.type);
}

export function eventDuration(event: MatchEvent, speed: PlaybackSpeed, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const duration = event.type === 'victory' ? 900
    : event.type === 'respawn' ? 560
      : event.type === 'destroyed' || event.type === 'eliminated' ? 480
        : event.type === 'checkpoint' ? 440
          : event.type === 'damage' ? 320
            : event.type === 'laser-fired' ? 280
              : event.type === 'move' || event.type === 'push' || event.type.includes('conveyor') || event.type === 'pusher' ? 260
                : event.type === 'turn' || event.type === 'gear' ? 220
                  : event.type === 'program' ? 100
                    : 160;
  return Math.max(40, Math.round(duration * (speed === 'fast' ? 0.35 : 1)));
}

export function compilePresentation(events: MatchEvent[], speed: PlaybackSpeed, reducedMotion: boolean): PresentationStep[] {
  return [...events]
    .sort((a, b) => a.revision - b.revision)
    .filter(isVisualEvent)
    .map((event) => ({ event, durationMs: eventDuration(event, speed, reducedMotion) }));
}

export function appendPresentationBatch(queue: PresentationQueue, events: MatchEvent[], speed: PlaybackSpeed, reducedMotion: boolean): PresentationQueue {
  const fresh = events.filter((event) => event.revision > queue.lastRevision);
  if (fresh.length === 0) return queue;
  return {
    lastRevision: Math.max(queue.lastRevision, ...fresh.map((event) => event.revision)),
    steps: [...queue.steps, ...compilePresentation(fresh, speed, reducedMotion)],
  };
}

export function resetPresentation(authoritative: PublicRobotView[], eventRevision: number): { robots: PublicRobotView[]; queue: PresentationQueue } {
  return { robots: reconcilePresentation([], authoritative), queue: { lastRevision: eventRevision, steps: [] } };
}

export function applyPresentationEvent(robots: PublicRobotView[], event: MatchEvent): PublicRobotView[] {
  if (!event.seatId) return robots;
  return robots.map((robot) => {
    if (robot.seatId !== event.seatId) return robot;
    const next = { ...robot, position: { ...robot.position } };
    if (event.to && ['move', 'push', 'conveyor', 'express-conveyor', 'pusher', 'respawn'].includes(event.type)) {
      next.position = { ...event.to };
    }
    if (event.toDirection && (event.type === 'turn' || event.type === 'gear')) next.direction = event.toDirection;
    if (event.type === 'damage') next.damage = Math.min(10, next.damage + (event.damage ?? 0));
    if (event.type === 'destroyed') next.destroyed = true;
    if (event.type === 'eliminated') {
      next.destroyed = true;
      next.eliminated = true;
    }
    if (event.type === 'respawn') next.destroyed = false;
    if (event.type === 'checkpoint') next.checkpoint += 1;
    if (event.type === 'power-down') next.poweredDown = true;
    return next;
  });
}

export function directionAngle(direction: Direction): number {
  return ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 })[direction];
}

export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta;
}

export function reconcilePresentation(_current: PublicRobotView[], authoritative: PublicRobotView[]): PublicRobotView[] {
  return authoritative.map((robot) => ({ ...robot, position: { ...robot.position }, archive: { ...robot.archive }, registers: robot.registers.map((register) => ({ ...register })) }));
}
