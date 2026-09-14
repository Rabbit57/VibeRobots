import type { CourseDefinition, ProgramKind, PublicRobotView, TileDefinition } from "./types";
import { GEAR_COLORS } from "./board-visuals";
import { courseTile } from "./content/boards";
import { ROBOT_BY_ID } from "./content/robots";

export interface Inspection {
  title: string;
  detail: string;
  eyebrow?: string;
  color?: string;
}

export const PROGRAM_HELP: Record<ProgramKind, string> = {
  move1:
    "Move 1 square in the direction your robot faces. Push robots ahead of you; walls stop movement.",
  move2:
    "Move 2 squares forward, one square at a time. Belts activate after the whole card finishes.",
  move3:
    "Move 3 squares forward, one square at a time. Check your route for walls, robots and pits.",
  backup: "Move 1 square backward without changing the direction your robot faces.",
  left: "Turn 90° counterclockwise in place. Your robot does not move to another square.",
  right: "Turn 90° clockwise in place. Your robot does not move to another square.",
  uturn: "Turn 180° in place to face the opposite direction.",
};

export const TURN_STAGES = [
  {
    id: "program",
    label: "Cards",
    icon: "↑",
    detail: "Robots execute this register in priority order. The highest number goes first.",
  },
  {
    id: "express-conveyor",
    label: "Express",
    icon: "»",
    detail: "Blue express belts move robots one square. This is their extra movement.",
  },
  {
    id: "conveyor",
    label: "All belts",
    icon: "›",
    detail: "All belts move robots one square. Express belts therefore move twice per register.",
  },
  {
    id: "pushers",
    label: "Pushers",
    icon: "⇥",
    detail: "Pushers move robots only on the register numbers printed on their tile.",
  },
  {
    id: "gears",
    label: "Gears",
    icon: "↻",
    detail: "Gears rotate robots 90° in the marked direction.",
  },
  {
    id: "lasers",
    label: "Lasers",
    icon: "⌖",
    detail: "Factory and robot lasers fire. Walls and the first robot stop each beam.",
  },
  {
    id: "sites",
    label: "Flags",
    icon: "⚑",
    detail:
      "Collect the next numbered checkpoint and update archive locations. Repairs happen at the end of the turn.",
  },
  {
    id: "cleanup",
    label: "Reset",
    icon: "↺",
    detail: "After register 5: repair, respawn, resolve power-downs, then deal the next hand.",
  },
] as const;

export function tileInspection(course: CourseDefinition, x: number, y: number): Inspection {
  const dock = course.docks.find((d) => d.x === x && d.y === y);
  const tile: TileDefinition = courseTile(course, x, y) ?? {};
  const titles: string[] = [],
    details: string[] = [];
  let color = "#789485";
  if (dock) {
    titles.push(`Starting dock ${dock.number}`);
    details.push(
      `Robots start here facing ${dock.direction}. This is an initial archive location.`,
    );
  }
  if (tile.pit) {
    titles.push("Open pit");
    details.push(
      "Entering this square destroys your robot and costs one life. It returns at its archive after the turn.",
    );
    color = "#d26b43";
  }
  if (tile.conveyor) {
    const belt = tile.conveyor;
    titles.push(belt.speed === 2 ? "Express conveyor · 2×" : "Conveyor · 1×");
    details.push(
      `Carries your robot ${belt.direction}. ${belt.speed === 2 ? "Moves in both the Express and All belts stages: up to 2 squares per register." : "Moves 1 square during the All belts stage of every register."}${belt.rotate ? ` This bend rotates robots arriving on the curved branch; straight-through arrivals keep their heading.` : ""}`,
    );
    color = belt.speed === 2 ? "#237ab4" : "#b87b29";
  }
  if (tile.gear) {
    titles.push(`${tile.gear === "right" ? "Clockwise" : "Counterclockwise"} gear`);
    details.push(
      `Rotates your robot 90° ${tile.gear === "right" ? "clockwise" : "counterclockwise"} after pushers, every register.`,
    );
    color = GEAR_COLORS[tile.gear];
  }
  if (tile.pusher) {
    titles.push("Mechanical pusher");
    details.push(
      `Pushes ${tile.pusher.direction} on registers ${tile.pusher.activeRegisters.join(", ")}.`,
    );
  }
  if (tile.laser) {
    titles.push(
      `${tile.laser.count === 1 ? "Single" : tile.laser.count === 2 ? "Double" : "Triple"} laser`,
    );
    details.push(
      `Fires ${tile.laser.direction}, dealing ${tile.laser.count} damage to the first robot in its path. Walls block the beam.`,
    );
    color = "#ce5849";
  }
  if (tile.repair) {
    titles.push(tile.optionSite ? "Upgrade workshop" : "Repair station");
    details.push(
      `End your turn here to repair ${tile.repair} damage.${tile.optionSite ? " Also grants an Option upgrade." : ""} Saves your archive location.`,
    );
    color = "#328d6b";
  }
  if (tile.checkpoint) {
    titles.push(`Checkpoint ${tile.checkpoint}`);
    details.push(
      "Visit checkpoints in numbered order. Be here after lasers to collect it. Reach the last checkpoint first to win.",
    );
    color = "#bb8631";
  }
  if (tile.walls?.length) {
    titles.push("Wall");
    details.push(
      `Blocks movement and laser fire on the ${tile.walls.join(", ")} edge${tile.walls.length > 1 ? "s" : ""}.`,
    );
  }
  return {
    title: titles.join(" / ") || "Factory floor",
    detail:
      details.join(" ") ||
      "A safe floor tile. Move, turn or stop here. Robots can push each other into adjacent squares.",
    eyebrow: `TILE ${String.fromCharCode(65 + x)}${y + 1}`,
    color,
  };
}

export function robotInspection(robot: PublicRobotView): Inspection {
  const identity = ROBOT_BY_ID.get(robot.robotId)!;
  return {
    title: robot.displayName,
    eyebrow: `${identity.name} · ${robot.controller === "bot" ? "CPU" : "DRIVER"}`,
    color: identity.color,
    detail: `Facing ${robot.direction} at ${String.fromCharCode(65 + robot.position.x)}${robot.position.y + 1}. ${robot.lives} lives · ${robot.damage}/10 damage · ${robot.checkpoint} checkpoints. ${robot.eliminated ? "Eliminated from this race." : robot.destroyed ? "Waiting to return at its archive." : robot.poweredDown ? "Powered down for repairs." : robot.finishedProgramming ? "Program locked and ready." : "Programming the next five moves."}`,
  };
}
