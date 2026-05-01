import { rotateLeft, rotateRight } from "./direction";

export type ControlAction = "turn-left" | "turn-right" | "forward" | "ignored";

export function mapKeyToControlAction(key: string): ControlAction {
  const normalized = key.toLowerCase();
  if (normalized === "a") {
    return "turn-left";
  }

  if (normalized === "d") {
    return "turn-right";
  }

  if (normalized === "w") {
    return "forward";
  }

  if (normalized === "s") {
    return "ignored";
  }

  return "ignored";
}

export function applyControlAction(
  headingRadians: number,
  action: ControlAction,
): number {
  if (action === "turn-left") {
    return rotateLeft(headingRadians);
  }

  if (action === "turn-right") {
    return rotateRight(headingRadians);
  }

  return headingRadians;
}
