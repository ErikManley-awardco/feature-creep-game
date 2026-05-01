export const TURN_STEP_RADIANS = Math.PI / 2;

export function rotateLeft(headingRadians: number): number {
  return headingRadians - TURN_STEP_RADIANS;
}

export function rotateRight(headingRadians: number): number {
  return headingRadians + TURN_STEP_RADIANS;
}

export function headingToVector(headingRadians: number): { x: number; y: number } {
  return {
    x: Math.cos(headingRadians),
    y: Math.sin(headingRadians),
  };
}
