import type { GameSessionState, GridPoint } from "../types/game";

export type FeatureId =
  | "fallback-stabilizer"
  | "speed-boost"
  | "speed-slow"
  | "speed-control"
  | "delayed-input-queue"
  | "keyboard-scramble"
  | "drift-turn"
  | "mouse-control"
  | "no-walls-infinite"
  | "mirror-world"
  | "inverted-arena-tilt"
  | "moving-walls"
  | "elastic-walls"
  | "wind-tunnel"
  | "conveyor-lanes"
  | "shrinking-safe-zone"
  | "time-dilation-burst"
  | "gravity-field"
  | "obstacle-ring"
  | "portal-pair"
  | "psychedelic-shader"
  | "laser-sweep"
  | "rotating-laser-fan"
  | "crumble-blocks"
  | "domino-blocks"
  | "minefield"
  | "chaser-orb"
  | "enemy-orb"
  | "food-evade"
  | "spawning-food"
  | "magnet-food"
  | "gravity-wells"
  | "jackpot-fruit"
  | "spoiling-food"
  | "charged-food"
  | "combo-food"
  | "taxation"
  | "fragile-body"
  | "feature-choice-mode";

export interface FeatureContext {
  state: GameSessionState;
  currentTick: number;
  randomInt(minInclusive: number, maxExclusive: number): number;
}

export interface FeatureDefinition {
  id: FeatureId;
  name: string;
  icon: string;
  description: string;
  selectionStrength?: number;
  tags: string[];
  replaceOnTagConflict: boolean;
  selectable: boolean;
  apply(context: FeatureContext): void;
  remove(context: FeatureContext): void;
}

export interface FeatureSchedulerConfig {
  intervalTicks: number;
  maxConcurrentFeatures: number;
}

export interface CandidateSelection {
  options: FeatureId[];
  autoPick: FeatureId;
}

export interface ObstacleRingOptions {
  margin: number;
  count: number;
}

export function hasPoint(points: GridPoint[], point: GridPoint): boolean {
  return points.some((p) => p.x === point.x && p.y === point.y);
}
