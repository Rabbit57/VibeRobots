import type { Direction, MatchEvent, PublicRobotView } from "./types";

export type PlaybackSpeed = "normal" | "fast";

export interface PresentationStep {
  event: MatchEvent;
  durationMs: number;
}

export interface PresentationQueue {
  lastRevision: number;
  steps: PresentationStep[];
}

const VISUAL_EVENT_TYPES = new Set([
  "stage",
  "program",
  "move",
  "push",
  "conveyor",
  "express-conveyor",
  "pusher",
  "turn",
  "gear",
  "laser-fired",
  "damage",
  "destroyed",
  "eliminated",
  "respawn",
  "checkpoint",
  "victory",
  "power-down",
  "option-acquired",
  "option-activated",
]);

export function isVisualEvent(event: MatchEvent): boolean {
  return VISUAL_EVENT_TYPES.has(event.type);
}

export function eventDuration(
  event: MatchEvent,
  speed: PlaybackSpeed,
  reducedMotion: boolean,
): number {
  const duration =
    event.type === "victory"
      ? 1600
      : event.type === "respawn"
        ? 1100
        : event.type === "destroyed" || event.type === "eliminated"
          ? 1000
          : event.type === "checkpoint"
            ? 1000
            : event.type === "damage"
              ? 700
              : event.type === "laser-fired"
                ? 650
                : event.type === "move" ||
                    event.type === "push" ||
                    event.type.includes("conveyor") ||
                    event.type === "pusher"
                  ? 850
                  : event.type === "turn" || event.type === "gear"
                    ? 750
                    : event.type === "program"
                      ? 450
                      : event.type === "stage"
                        ? 320
                        : 600;
  // Reduced motion removes movement, not the time needed to read an action.
  return Math.round(
    (reducedMotion ? Math.min(duration, 450) : duration) * (speed === "fast" ? 0.4 : 1),
  );
}

export function compilePresentation(
  events: MatchEvent[],
  speed: PlaybackSpeed,
  reducedMotion: boolean,
): PresentationStep[] {
  let stage: MatchEvent["stage"];
  let register: number | undefined;
  return [...events]
    .sort((a, b) => a.revision - b.revision)
    .filter(isVisualEvent)
    .map((event) => {
      if (event.type === "stage") {
        stage = event.stage;
        register = event.register;
      }
      const presented = {
        ...event,
        stage: stage ?? event.stage,
        register: event.register ?? register,
      };
      return { event: presented, durationMs: eventDuration(presented, speed, reducedMotion) };
    });
}

export function appendPresentationBatch(
  queue: PresentationQueue,
  events: MatchEvent[],
  speed: PlaybackSpeed,
  reducedMotion: boolean,
): PresentationQueue {
  const fresh = events.filter((event) => event.revision > queue.lastRevision);
  if (fresh.length === 0) return queue;
  return {
    lastRevision: Math.max(queue.lastRevision, ...fresh.map((event) => event.revision)),
    steps: [...queue.steps, ...compilePresentation(fresh, speed, reducedMotion)],
  };
}

export function resetPresentation(
  authoritative: PublicRobotView[],
  eventRevision: number,
): { robots: PublicRobotView[]; queue: PresentationQueue } {
  return {
    robots: reconcilePresentation([], authoritative),
    queue: { lastRevision: eventRevision, steps: [] },
  };
}

export function applyPresentationEvent(
  robots: PublicRobotView[],
  event: MatchEvent,
): PublicRobotView[] {
  if (!event.seatId) return robots;
  return robots.map((robot) => {
    if (robot.seatId !== event.seatId) return robot;
    const next = { ...robot, position: { ...robot.position } };
    if (
      event.to &&
      ["move", "push", "conveyor", "express-conveyor", "pusher", "respawn"].includes(event.type)
    ) {
      next.position = { ...event.to };
    }
    if (
      event.toDirection &&
      [
        "move",
        "push",
        "conveyor",
        "express-conveyor",
        "pusher",
        "turn",
        "gear",
        "respawn",
      ].includes(event.type)
    )
      next.direction = event.toDirection;
    if (event.type === "damage") next.damage = Math.min(10, next.damage + (event.damage ?? 0));
    if (event.type === "destroyed") {
      next.destroyed = true;
      next.lives = Math.max(0, next.lives - 1);
    }
    if (event.type === "eliminated") {
      next.destroyed = true;
      next.eliminated = true;
      next.lives = 0;
    }
    if (event.type === "respawn") {
      next.destroyed = false;
      next.damage = Number(event.data?.damage ?? 2);
    }
    if (event.type === "checkpoint") next.checkpoint += 1;
    if (event.type === "power-down") {
      next.poweredDown = true;
      next.damage = 0;
    }
    return next;
  });
}

export function directionAngle(direction: Direction): number {
  return { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 }[direction];
}

export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta;
}

export function reconcilePresentation(
  _current: PublicRobotView[],
  authoritative: PublicRobotView[],
): PublicRobotView[] {
  return authoritative.map((robot) => ({
    ...robot,
    position: { ...robot.position },
    archive: { ...robot.archive },
    registers: robot.registers.map((register) => ({ ...register })),
  }));
}

// Absolute interpolation prevents frame-rate-dependent drift and overshoot.
export function motionProgress(elapsedMs: number, durationMs: number): number {
  const t = Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs * 0.88)));
  return t * t * (3 - 2 * t);
}
