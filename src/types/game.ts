export type DeathCause = "none" | "wall" | "self" | "feature-hazard";

export type Heading = number;

export type ArenaMode = "bounded" | "infinite";

export interface GridPoint {
  x: number;
  y: number;
}

export interface ObstacleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SessionMetrics {
  ticksSurvived: number;
  featuresAdded: number;
}

export interface LeaderboardEntry {
  score: number;
  survivedTicks: number;
  seed: string;
  timestampMs: number;
}

export interface ActiveFeatureState {
  id: string;
  icon: string;
  tags: string[];
  startedTick: number;
}

export interface FeatureChoiceState {
  offeredAtTick: number;
  options: string[];
}

export interface FeatureReplacementState {
  incomingFeatureId: string;
  incomingFeatureIcon: string;
  offeredAtTick: number;
}

export interface FeatureAnnouncementState {
  incomingFeatureId: string;
  incomingFeatureName: string;
  incomingFeatureIcon: string;
  incomingFeatureDescription: string;
  offeredAtTick: number;
}

export interface GameSessionState {
  seed: string;
  tick: number;
  elapsedMs: number;
  score: number;
  totalPointsEarned: number;
  isGameOver: boolean;
  deathCause: DeathCause;
  baseCellsPerSecond: number;
  speedMultiplier: number;
  snake: GridPoint[];
  heading: Heading;
  food: GridPoint;
  bonusFoods: GridPoint[];
  minefield: GridPoint[];
  portalPair: {
    a: GridPoint;
    b: GridPoint;
  } | null;
  chaserOrb: GridPoint | null;
  enemyOrb: GridPoint | null;
  enemyProjectiles: EnemyProjectile[];
  obstacles: ObstacleRect[];
  world: {
    mode: ArenaMode;
    hasWalls: boolean;
    width: number;
    height: number;
  };
  camera: {
    x: number;
    y: number;
  };
  activeFeatures: ActiveFeatureState[];
  activeModifiers: string[];
  featureAnnouncement: FeatureAnnouncementState | null;
  featureChoice: FeatureChoiceState | null;
  featureReplacement: FeatureReplacementState | null;
  featureSkipsRemaining: number;
  difficultyBudget: number;
  metrics: SessionMetrics;
  leaderboard: LeaderboardEntry[];
}
