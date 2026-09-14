import { directionAngle } from "./presentation";
import type { Direction } from "./types";

export const GEAR_COLORS = { right: "#b85424", left: "#6944b4" } as const;

// Shared vector artwork for the 3D enamel face and the tactical map.
export const GEAR_OUTLINE =
  Array.from({ length: 12 }, (_, tooth) => {
    const step = Math.PI / 6;
    return [
      [-0.5, 103],
      [-0.3, 103],
      [-0.23, 120],
      [0.23, 120],
      [0.3, 103],
      [0.5, 103],
    ]
      .map(([offset, radius], index) => {
        const angle = (tooth + offset) * step;
        return `${tooth === 0 && index === 0 ? "M" : "L"}${(128 + Math.cos(angle) * radius).toFixed(2)} ${(128 + Math.sin(angle) * radius).toFixed(2)}`;
      })
      .join(" ");
  }).join(" ") + " Z";
export const GEAR_ARROW_ARC = "M75 88 A66 66 0 0 1 194 126";
export const GEAR_ARROW_HEAD = "M209 111 L193 146 L174 112 Z";

// A canvas arrow points up (+Y); on the board that must point north (-Z).
// Preserve the yaw sign when rotating the printed plane into world space.
export function surfaceRotation(direction: Direction | number): [number, number, number] {
  return [-Math.PI / 2, 0, typeof direction === "number" ? direction : directionAngle(direction)];
}
