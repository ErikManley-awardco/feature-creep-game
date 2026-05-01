import { EventBus } from "../events/eventBus";
import type { GameSessionState } from "../types/game";
import type { EnemyProjectile, GridPoint, Heading, LeaderboardEntry, ObstacleRect } from "../types/game";
import { SeededRng } from "./seededRng";
import { headingToVector } from "./direction";
import { insertScore, readLeaderboard, writeLeaderboard } from "./leaderboard";
import { FeatureScheduler } from "../features/scheduler";
import type { FeatureId } from "../features/types";
import { applyControlAction, mapKeyToControlAction, type ControlAction } from "./controls";

const SNAKE_RADIUS = 0.35;
const FOOD_RADIUS = 0.42;
const POINTS_PER_CELL = 8;
const MIN_TRAIL_POINTS = 24;
const FOOD_EVADE_MODIFIER = "food-evade";
const FOOD_EVADE_CELLS_PER_SECOND = 3.8;
const FOOD_EVADE_DIRECTION_SAMPLES = 20;
const FOOD_EVADE_DETECTION_RANGE = 8;
const FOOD_WANDER_RETARGET_MIN_TICKS = 12;
const FOOD_WANDER_RETARGET_MAX_TICKS = 36;
const FOOD_WANDER_NOISE_RADIANS = Math.PI / 10;
const FOOD_POST_WRAP_LOCK_TICKS = 10;
const COMBO_WINDOW_TICKS = 120;
const TAX_TICK_INTERVAL = 180;
const TAX_GRACE_TICKS = 240;
const DRIFT_MAX_TURN_PER_TICK = Math.PI / 26;
const MOUSE_CONTROL_MAX_TURN_PER_TICK = Math.PI / 22;
const CHARGED_FOOD_PERIOD_TICKS = 90;
const FRAGILE_DECAY_TICKS = 90;
const BONUS_FOOD_SPAWN_INTERVAL_TICKS = 180;
const BONUS_FOOD_SPAWN_ACCELERATION_TICKS = 120;
const BONUS_FOOD_MAX_COUNT = 4;
const PORTAL_RADIUS = 0.62;
const PORTAL_COOLDOWN_TICKS = 14;
const GRAVITY_TURN_RATE_PER_TICK = Math.PI / 280;
const LASER_SWEEP_PERIOD_TICKS = 360;
const LASER_SWEEP_WIDTH = 0.35;
const LASER_DASH_BAND = 3.2;
const MINE_TRIGGER_RADIUS = 0.25;
const CHASER_ORB_SPEED = 2.2;
const ENEMY_ORB_SPEED = 1.4;
const ENEMY_ORB_SHOT_INTERVAL_TICKS = 75;
const ENEMY_ORB_RESPAWN_INTERVAL_TICKS = 900;
const ENEMY_PROJECTILE_SPEED = 6;
const CRUMBLE_RESPAWN_TICKS = 240;
const DOMINO_SHIFT_TICKS = 120;
const MAGNET_FOOD_PULL = 1.6;
const GRAVITY_WELL_PULL = 1.8;
const GRAVITY_WELL_FALLOFF_EXPONENT = 2.5;
const GRAVITY_WELL_TURN_RANGE = 12;
const GRAVITY_WELL_MIN_TURN_PER_TICK = Math.PI / 340;
const GRAVITY_WELL_MAX_TURN_PER_TICK = Math.PI / 60;
const ROTATING_LASER_FAN_ARMS = 3;
const ROTATING_LASER_FAN_RADIUS = 14;
// Width of each laser arm in radians. 0.4 rad = ~23 degrees per arm, leaving ~97 degree gaps.
const ROTATING_LASER_FAN_WIDTH = 0.4;
const DELAYED_INPUT_TICKS = 30;
const WIND_TUNNEL_MAX_SPEED = 2.2;
const CONVEYOR_MAX_SPEED = 1.8;
const SHRINKING_ZONE_PENALTY_TICKS = 45;
const SPOIL_START_TICKS = 540;
const SPOIL_EXPIRE_TICKS = 990;
const JACKPOT_CHANCE = 0.14;
const KEYBOARD_SCRAMBLE_PERIOD_TICKS = 15 * 60;

function distance(a: GridPoint, b: GridPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function circleIntersectsRect(center: GridPoint, radius: number, rect: ObstacleRect): boolean {
  const nearestX = Math.max(rect.x, Math.min(center.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(center.y, rect.y + rect.height));
  const dx = center.x - nearestX;
  const dy = center.y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function pointToRectDistance(point: GridPoint, rect: ObstacleRect): number {
  const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return Math.hypot(dx, dy);
}

function normalizeAngle(angle: number): number {
  let value = angle;
  while (value <= -Math.PI) {
    value += Math.PI * 2;
  }
  while (value > Math.PI) {
    value -= Math.PI * 2;
  }
  return value;
}

export class GameSession {
  readonly state: GameSessionState;
  private readonly rng: SeededRng;
  private readonly featureScheduler: FeatureScheduler;
  private pendingHeading: Heading | null = null;
  private immunityEndsTick = 0;
  private bonusFoodLockedDirectionsBytick: Map<number, { x: number; y: number; ticksRemaining: number }> = new Map();
  private foodWanderAngle = 0;
  private foodWanderRetargetTick = 0;
  private foodLockedDirectionTicks = 0;
  private foodLockedDirection = { x: 0, y: 0 };
  private throttleMultiplier = 1;
  private comboStreak = 0;
  private lastFoodConsumedTick = -99999;
  private mouseTarget: GridPoint | null = null;
  private portalCooldownTicks = 0;
  private delayedActions: Array<{ executeTick: number; action: ControlAction }> = [];
  private foodSpawnedTick = 0;
  private jackpotFoodActive = false;
  // Track features that were replaced/removed for re-insertion
  private retiredFeatures: Set<FeatureId> = new Set();

  constructor(
    readonly seed: string,
    private readonly eventBus: EventBus,
  ) {
    this.rng = new SeededRng(seed);
    this.featureScheduler = new FeatureScheduler();
    this.foodWanderAngle = this.rng.nextFloat() * Math.PI * 2;

    const worldWidth = 40;
    const worldHeight = 30;
    const initialSnake: GridPoint[] = [
      { x: 20, y: 15 },
      { x: 19.875, y: 15 },
      { x: 19.75, y: 15 },
    ];
    const initialFood = this.spawnFood(initialSnake, worldWidth, worldHeight, []);

    this.state = {
      seed,
      tick: 0,
      elapsedMs: 0,
      score: 0,
      totalPointsEarned: 0,
      isGameOver: false,
      deathCause: "none",
      baseCellsPerSecond: 8,
      speedMultiplier: 1,
      snake: initialSnake,
      heading: 0,
      food: initialFood,
      bonusFoods: [],
      minefield: [],
      portalPair: null,
      chaserOrb: null,
      enemyOrb: null,
      enemyProjectiles: [],
      obstacles: [],
      world: {
        mode: "bounded",
        hasWalls: true,
        width: worldWidth,
        height: worldHeight,
      },
      camera: {
        x: 0,
        y: 0,
      },
      activeFeatures: [],
      activeModifiers: [],
      featureAnnouncement: null,
      featureChoice: null,
      featureReplacement: null,
      featureSkipsRemaining: 1,
      difficultyBudget: 0,
      metrics: {
        ticksSurvived: 0,
        featuresAdded: 0,
      },
      leaderboard: readLeaderboard(),
    };
  }

  queueHeading(nextHeading: Heading): void {
    if (this.state.isGameOver) {
      return;
    }

    this.pendingHeading = nextHeading;
  }

  handleControlKey(rawKey: string): boolean {
    if (this.state.isGameOver) {
      return false;
    }

    let mappedKey = rawKey;
    if (this.isKeyboardScrambleSwapped()) {
      const normalized = mappedKey.toLowerCase();
      if (normalized === "a") {
        mappedKey = "d";
      } else if (normalized === "d") {
        mappedKey = "a";
      }
    }

    if (this.state.activeModifiers.includes("mirror-world")) {
      const normalized = mappedKey.toLowerCase();
      if (normalized === "a") {
        mappedKey = "d";
      } else if (normalized === "d") {
        mappedKey = "a";
      }
    }

    let action = mapKeyToControlAction(mappedKey);
    if (action === "ignored") {
      return false;
    }

    if (this.state.activeModifiers.includes("delayed-input-queue")) {
      this.delayedActions.push({
        executeTick: this.state.tick + DELAYED_INPUT_TICKS,
        action,
      });
      return true;
    }

    this.queueHeading(applyControlAction(this.state.heading, action));
    return true;
  }

  isKeyboardScrambleSwapped(): boolean {
    if (!this.state.activeModifiers.includes("keyboard-scramble")) {
      return false;
    }
    return Math.floor(this.state.tick / KEYBOARD_SCRAMBLE_PERIOD_TICKS) % 2 === 1;
  }

  isFoodSpoiled(): boolean {
    if (!this.state.activeModifiers.includes("spoiling-food")) {
      return false;
    }
    return this.state.tick - this.foodSpawnedTick >= SPOIL_START_TICKS;
  }

  isJackpotFoodActive(): boolean {
    return this.state.activeModifiers.includes("jackpot-fruit") && this.jackpotFoodActive;
  }

  currentSafeZoneRadius(): number {
    const maxRadius = Math.min(this.state.world.width, this.state.world.height) * 0.48;
    const minRadius = Math.min(this.state.world.width, this.state.world.height) * 0.22;
    const shrink = this.state.tick / 900;
    return Math.max(minRadius, maxRadius - shrink);
  }

  setSpeedControlInput(mode: "fast" | "slow" | "neutral"): void {
    if (!this.state.activeModifiers.includes("speed-control")) {
      this.throttleMultiplier = 1;
      return;
    }

    if (mode === "fast") {
      this.throttleMultiplier = 1.5;
      return;
    }

    if (mode === "slow") {
      this.throttleMultiplier = 0.5;
      return;
    }

    this.throttleMultiplier = 1;
  }

  setMouseTarget(target: GridPoint | null): void {
    this.mouseTarget = target;
  }

  isChargedFoodDangerous(): boolean {
    return this.state.activeModifiers.includes("charged-food") &&
      Math.floor(this.state.tick / CHARGED_FOOD_PERIOD_TICKS) % 2 === 1;
  }

  currentWallInset(): number {
    if (!this.state || !this.state.activeModifiers.includes("moving-walls")) {
      return 0;
    }

    const wave = (Math.sin(this.state.tick / 90) + 1) / 2;
    return 0.6 + (1 - wave) * 2.2;
  }

  chooseFeatureOption(optionIndex: number): boolean {
    if (!this.state.featureChoice) {
      return false;
    }

    const option = this.state.featureChoice.options[optionIndex] as FeatureId;
    if (!option) {
      return false;
    }

    this.state.featureChoice = null;
    return this.applyFeature(option);
  }

  skipPendingFeatureChoice(): boolean {
    if (!this.state.featureChoice || this.state.featureSkipsRemaining <= 0) {
      return false;
    }

    this.state.featureSkipsRemaining -= 1;
    this.state.featureChoice = null;
    return true;
  }

  continuePendingFeature(): boolean {
    if (!this.state.featureAnnouncement) {
      return false;
    }

    const incoming = this.state.featureAnnouncement.incomingFeatureId as FeatureId;
    this.state.featureAnnouncement = null;
    return this.applyFeature(incoming);
  }

  skipPendingFeatureAnnouncement(): boolean {
    if (!this.state.featureAnnouncement || this.state.featureSkipsRemaining <= 0) {
      return false;
    }

    this.state.featureSkipsRemaining -= 1;
    this.state.featureAnnouncement = null;
    return true;
  }

  chooseFeatureReplacementSlot(slotIndex: number): boolean {
    if (!this.state.featureReplacement) {
      return false;
    }

    const existing = this.state.activeFeatures[slotIndex];
    if (!existing) {
      return false;
    }

    // Mark replaced feature as eligible for future selection
    this.retiredFeatures.add(existing.id as FeatureId);
    this.removeActiveFeature(existing.id);
    const incoming = this.state.featureReplacement.incomingFeatureId as FeatureId;
    this.state.featureReplacement = null;
    return this.applyFeature(incoming);
  }

  skipPendingFeature(): boolean {
    if (!this.state.featureReplacement || this.state.featureSkipsRemaining <= 0) {
      return false;
    }

    this.state.featureSkipsRemaining -= 1;
    this.state.featureReplacement = null;
    return true;
  }

  debugApplyFeature(featureId: FeatureId): void {
    this.applyFeature(featureId);
  }

  advanceTick(deltaMs: number): void {
    if (this.state.isGameOver) {
      return;
    }

    this.state.tick += 1;
    const adjustedDeltaMs = this.adjustedDeltaMs(deltaMs);
    this.state.elapsedMs += adjustedDeltaMs;
    this.state.metrics.ticksSurvived = this.state.tick;
    this.resolveFeatureCadence();
    this.processDelayedActions();

    this.moveForward(adjustedDeltaMs);
    this.updateCamera();
    this.updateMovingBonusFoods(adjustedDeltaMs);
    this.eventBus.emit("tick-advanced", { tick: this.state.tick });
  }

  private adjustedDeltaMs(deltaMs: number): number {
    if (!this.state.activeModifiers.includes("time-dilation-burst")) {
      return deltaMs;
    }
    const phase = Math.floor(this.state.tick / 240) % 2;
    return phase === 0 ? deltaMs * 0.7 : deltaMs * 1.35;
  }

  private processDelayedActions(): void {
    if (this.delayedActions.length === 0) {
      return;
    }

    const ready = this.delayedActions.filter((entry) => entry.executeTick <= this.state.tick);
    this.delayedActions = this.delayedActions.filter((entry) => entry.executeTick > this.state.tick);
    for (const entry of ready) {
      this.queueHeading(applyControlAction(this.state.heading, entry.action));
    }
  }

  private resolveFeatureCadence(): void {
    if (!this.featureScheduler.shouldTriggerFeature(this.state.tick)) {
      return;
    }

    if (this.featureScheduler.isFeatureChoiceModeActive(this.state.activeFeatures)) {
      const choice = this.featureScheduler.pickFeatureChoices(
        (minInclusive, maxExclusive) => this.rng.nextInt(minInclusive, maxExclusive),
        this.state.activeFeatures,
        3,
        this.retiredFeatures,
      );
      this.state.featureChoice = {
        offeredAtTick: this.state.tick,
        options: choice.options,
      };

      this.eventBus.emit("feature-choice-offered", {
        tick: this.state.tick,
        options: choice.options,
      });

      return;
    }

    const featureId = this.featureScheduler.pickRandomFeature(
      (minInclusive, maxExclusive) => this.rng.nextInt(minInclusive, maxExclusive),
      this.state.activeFeatures,
      this.retiredFeatures,
    );
    const feature = this.featureScheduler.featureById(featureId);
    this.state.featureAnnouncement = {
      incomingFeatureId: feature.id,
      incomingFeatureName: feature.name,
      incomingFeatureIcon: feature.icon,
      incomingFeatureDescription: feature.description,
      offeredAtTick: this.state.tick,
    };
  }

  private featureContext() {
    return {
      state: this.state,
      currentTick: this.state.tick,
      randomInt: (minInclusive: number, maxExclusive: number) =>
        this.rng.nextInt(minInclusive, maxExclusive),
    };
  }

  private applyFeature(featureId: FeatureId): boolean {
    const feature = this.featureScheduler.featureById(featureId);
    const conflicts = this.featureScheduler.conflictingFeatures(this.state.activeFeatures, feature);
    if (conflicts.length > 0) {
      for (const conflictId of conflicts) {
        this.retiredFeatures.add(conflictId as FeatureId);
        this.removeActiveFeature(conflictId);
      }
    }

    if (this.state.activeFeatures.length >= this.featureScheduler.maxConcurrentFeatures()) {
      this.state.featureReplacement = {
        incomingFeatureId: feature.id,
        incomingFeatureIcon: feature.icon,
        offeredAtTick: this.state.tick,
      };
      return false;
    }

    feature.apply(this.featureContext());
    this.immunityEndsTick = this.state.tick + 90;

    if (feature.id === "spoiling-food") {
      this.foodSpawnedTick = this.state.tick;
    }
    if (feature.id === "jackpot-fruit") {
      this.jackpotFoodActive = this.rng.nextFloat() < JACKPOT_CHANCE;
    }

    this.state.activeFeatures.push({
      id: feature.id,
      icon: feature.icon,
      tags: feature.tags,
      startedTick: this.state.tick,
    });
    this.state.metrics.featuresAdded += 1;

    // If this feature was previously retired, remove from retired pool
    this.retiredFeatures.delete(feature.id);

    this.eventBus.emit("feature-added", { tick: this.state.tick, featureId: feature.id });
    return true;
  }

  private removeActiveFeature(featureId: string): void {
    const existing = this.featureScheduler.featureById(featureId as FeatureId);
    existing.remove(this.featureContext());
    this.state.activeFeatures = this.state.activeFeatures.filter((entry) => entry.id !== featureId);
    if (!this.state.activeModifiers.includes("speed-control")) {
      this.throttleMultiplier = 1;
    }
    // Make feature available for future selection
    this.retiredFeatures.add(featureId as FeatureId);

    if (featureId === "delayed-input-queue") {
      this.delayedActions = [];
    }
    if (featureId === "jackpot-fruit") {
      this.jackpotFoodActive = false;
    }

    this.eventBus.emit("feature-removed", {
      tick: this.state.tick,
      featureId,
    });
  }

  private moveForward(deltaMs: number): void {
    const head = this.state.snake[0];

    if (this.state.activeModifiers.includes("mouse-control") && this.mouseTarget) {
      this.pendingHeading = Math.atan2(this.mouseTarget.y - head.y, this.mouseTarget.x - head.x);
    }

    if (this.pendingHeading !== null) {
      if (this.state.activeModifiers.includes("drift-turn") || this.state.activeModifiers.includes("mouse-control")) {
        const maxTurn = this.state.activeModifiers.includes("mouse-control")
          ? MOUSE_CONTROL_MAX_TURN_PER_TICK
          : DRIFT_MAX_TURN_PER_TICK;
        const delta = normalizeAngle(this.pendingHeading - this.state.heading);
        const clamped = Math.max(-maxTurn, Math.min(maxTurn, delta));
        this.state.heading = normalizeAngle(this.state.heading + clamped);
        if (Math.abs(delta) <= maxTurn + 0.0001) {
          this.pendingHeading = null;
        }
      } else {
        this.state.heading = this.pendingHeading;
        this.pendingHeading = null;
      }
    }

    if (this.state.activeModifiers.includes("gravity-field")) {
      const southHeading = Math.PI / 2;
      const deltaToSouth = normalizeAngle(southHeading - this.state.heading);
      const turn = Math.max(-GRAVITY_TURN_RATE_PER_TICK, Math.min(GRAVITY_TURN_RATE_PER_TICK, deltaToSouth));
      this.state.heading = normalizeAngle(this.state.heading + turn);
    }

    if (this.state.activeModifiers.includes("gravity-wells")) {
      this.state.heading = this.applyGravityWellTurn(this.state.heading, head, deltaMs);
    }

    const speed = this.state.baseCellsPerSecond * this.state.speedMultiplier * this.throttleMultiplier;
    const travelDistance = speed * (deltaMs / 1000);
    const direction = headingToVector(this.state.heading);
    let nextHead: GridPoint = {
      x: head.x + direction.x * travelDistance,
      y: head.y + direction.y * travelDistance,
    };

    if (this.state.activeModifiers.includes("gravity-wells")) {
      nextHead = this.applyGravityWellsPull(nextHead, deltaMs);
    }

    if (this.state.activeModifiers.includes("wind-tunnel")) {
      const gust = Math.sin(this.state.tick / 45) * WIND_TUNNEL_MAX_SPEED * (deltaMs / 1000);
      nextHead = {
        x: nextHead.x + gust,
        y: nextHead.y,
      };
    }

    if (this.state.activeModifiers.includes("conveyor-lanes")) {
      nextHead = this.applyConveyorShift(nextHead, deltaMs);
    }

    if (this.state.world.mode === "infinite") {
      nextHead = this.wrapPoint(nextHead);
    }

    nextHead = this.applyPortalTeleport(nextHead, direction);
    this.updateDynamicHazards(deltaMs);

    this.tryConsumeEnemyOrb(nextHead);

    if (this.isFeatureHazardCollision(nextHead)) {
      this.endRun("feature-hazard");
      return;
    }

    if (this.isWallCollision(nextHead)) {
      const bounced = this.tryElasticWallBounce(nextHead);
      if (!bounced) {
        this.endRun("wall");
        return;
      }
      nextHead = bounced;
    }

    if (this.isObstacleCollision(nextHead)) {
      this.endRun("wall");
      return;
    }

    this.maybeSpawnBonusFood();
    this.maybeExpireSpoiledFood();
    const foodConsumption = this.consumeFoodAt(nextHead);
    const ateFood = foodConsumption.ate;

    if (this.isSelfCollision(nextHead)) {
      this.endRun("self");
      return;
    }

    this.state.snake.unshift(nextHead);

    const targetTrailPoints = this.targetTrailPointCount();
    if (!ateFood) {
      while (this.state.snake.length > targetTrailPoints) {
        this.state.snake.pop();
      }

      this.updateMovingFood(deltaMs);
      this.applyTaxation();
      this.applyShrinkingSafeZonePenalty(nextHead);
      return;
    }

    if (this.isChargedFoodDangerous()) {
      this.state.score = Math.max(0, this.state.score - 1);
      this.comboStreak = 0;
      this.lastFoodConsumedTick = this.state.tick;
      while (this.state.snake.length > Math.max(MIN_TRAIL_POINTS - 8, 10)) {
        this.state.snake.pop();
      }
      this.state.food = this.spawnFood(
        this.state.snake,
        this.state.world.width,
        this.state.world.height,
        this.state.obstacles,
        [this.state.food, ...this.state.bonusFoods],
      );
      return;
    }

    if (this.state.activeModifiers.includes("combo-food")) {
      if (this.state.tick - this.lastFoodConsumedTick <= COMBO_WINDOW_TICKS) {
        this.comboStreak += 1;
      } else {
        this.comboStreak = 1;
      }
    } else {
      this.comboStreak = 1;
    }
    this.lastFoodConsumedTick = this.state.tick;

    if (foodConsumption.consumedPrimary && this.isFoodSpoiled()) {
      this.state.score = Math.max(0, this.state.score - 1);
      this.comboStreak = 0;
    } else {
      let awardedPoints = this.comboStreak;
      if (foodConsumption.consumedPrimary && this.isJackpotFoodActive()) {
        awardedPoints += 5;
        this.clearNearbyHazards(nextHead, 4.5);
      }
      this.awardScore(awardedPoints);
    }
    this.eventBus.emit("food-consumed", {
      tick: this.state.tick,
      score: this.state.score,
      foodX: this.state.food.x,
      foodY: this.state.food.y,
    });

    if (foodConsumption.consumedPrimary) {
      this.state.food = this.spawnFood(
        this.state.snake,
        this.state.world.width,
        this.state.world.height,
        this.state.obstacles,
        [this.state.food, ...this.state.bonusFoods],
      );
      this.foodSpawnedTick = this.state.tick;
      this.jackpotFoodActive =
        this.state.activeModifiers.includes("jackpot-fruit") && this.rng.nextFloat() < JACKPOT_CHANCE;
    }

    this.applyShrinkingSafeZonePenalty(nextHead);
  }

  private maybeSpawnBonusFood(): void {
    if (!this.state.activeModifiers.includes("spawning-food")) {
      return;
    }
    
    const timeSinceLastSpawn = this.state.tick - this.foodSpawnedTick;
    const effectiveInterval = this.state.bonusFoods.length > 0 
      ? BONUS_FOOD_SPAWN_ACCELERATION_TICKS 
      : BONUS_FOOD_SPAWN_INTERVAL_TICKS;
    
    if (timeSinceLastSpawn % effectiveInterval !== 0) {
      return;
    }
    if (this.state.bonusFoods.length >= BONUS_FOOD_MAX_COUNT) {
      return;
    }

    const candidate = this.spawnFood(
      this.state.snake,
      this.state.world.width,
      this.state.world.height,
      this.state.obstacles,
      [this.state.food, ...this.state.bonusFoods],
    );
    this.state.bonusFoods.push(candidate);
    this.foodSpawnedTick = this.state.tick;
  }

  private consumeFoodAt(nextHead: GridPoint): { ate: boolean; consumedPrimary: boolean } {
    if (distance(nextHead, this.state.food) <= SNAKE_RADIUS + FOOD_RADIUS) {
      return { ate: true, consumedPrimary: true };
    }

    const bonusIndex = this.state.bonusFoods.findIndex(
      (foodPoint) => distance(nextHead, foodPoint) <= SNAKE_RADIUS + FOOD_RADIUS,
    );
    if (bonusIndex >= 0) {
      this.state.bonusFoods.splice(bonusIndex, 1);
      return { ate: true, consumedPrimary: false };
    }

    return { ate: false, consumedPrimary: false };
  }

  private applyPortalTeleport(nextHead: GridPoint, direction: GridPoint): GridPoint {
    if (this.portalCooldownTicks > 0) {
      this.portalCooldownTicks -= 1;
      return nextHead;
    }

    if (!this.state.activeModifiers.includes("portal-pair") || !this.state.portalPair) {
      return nextHead;
    }

    const { a, b } = this.state.portalPair;
    if (distance(nextHead, a) <= PORTAL_RADIUS) {
      this.portalCooldownTicks = PORTAL_COOLDOWN_TICKS;
      return this.normalizeFoodPoint({
        x: b.x + direction.x * 0.9,
        y: b.y + direction.y * 0.9,
      });
    }
    if (distance(nextHead, b) <= PORTAL_RADIUS) {
      this.portalCooldownTicks = PORTAL_COOLDOWN_TICKS;
      return this.normalizeFoodPoint({
        x: a.x + direction.x * 0.9,
        y: a.y + direction.y * 0.9,
      });
    }

    return nextHead;
  }

  private applyConveyorShift(point: GridPoint, deltaMs: number): GridPoint {
    const lane = Math.floor(point.y / 3);
    const direction = lane % 2 === 0 ? 1 : -1;
    const distance = CONVEYOR_MAX_SPEED * (deltaMs / 1000);
    return {
      x: point.x + direction * distance,
      y: point.y,
    };
  }

  private tryElasticWallBounce(nextHead: GridPoint): GridPoint | null {
    if (!this.state.activeModifiers.includes("elastic-walls")) {
      return null;
    }
    if (this.state.world.mode === "infinite") {
      return null;
    }

    const inset = this.currentWallInset();
    const minX = inset + 0.01;
    const maxX = this.state.world.width - inset - 0.01;
    const minY = inset + 0.01;
    const maxY = this.state.world.height - inset - 0.01;

    let bounced = false;
    let heading = this.state.heading;
    let x = nextHead.x;
    let y = nextHead.y;

    if (x < minX || x >= maxX) {
      heading = normalizeAngle(Math.PI - heading);
      x = Math.max(minX, Math.min(maxX, x));
      bounced = true;
    }
    if (y < minY || y >= maxY) {
      heading = normalizeAngle(-heading);
      y = Math.max(minY, Math.min(maxY, y));
      bounced = true;
    }

    if (!bounced) {
      return null;
    }

    this.state.heading = heading;
    this.pendingHeading = null;
    this.state.score = Math.max(0, this.state.score - 1);
    return { x, y };
  }

  private updateMovingBonusFoods(deltaMs: number): void {
    if (!this.state.activeModifiers.includes(FOOD_EVADE_MODIFIER)) {
      return;
    }

    const head = this.state.snake[0];
    const travelDistance = FOOD_EVADE_CELLS_PER_SECOND * (deltaMs / 1000);

    this.state.bonusFoods = this.state.bonusFoods.map((current) => {
      const foodId = `${current.x},${current.y}`;
      const lockState = this.bonusFoodLockedDirectionsBytick.get(this.state.tick);

      if (lockState && lockState.ticksRemaining > 0) {
        lockState.ticksRemaining -= 1;
        const moved = this.moveFoodAlongDirection(
          current,
          lockState.x,
          lockState.y,
          travelDistance,
        );
        if (!this.isFoodPointBlocked(moved.point)) {
          if (moved.wrapped) {
            lockState.ticksRemaining = FOOD_POST_WRAP_LOCK_TICKS;
          }
          return moved.point;
        }
        return current;
      }

      const distanceToHead = distance(current, head);
      const isThreatened = distanceToHead <= FOOD_EVADE_DETECTION_RANGE;
      const awayX = current.x - head.x;
      const awayY = current.y - head.y;
      const baseAwayAngle = Math.atan2(awayY, awayX);

      const candidates: Array<{ point: GridPoint; score: number }> = [];
      const prioritizedAngles = isThreatened
        ? [baseAwayAngle, baseAwayAngle + Math.PI / 2, baseAwayAngle - Math.PI / 2]
        : [
            baseAwayAngle,
            baseAwayAngle + Math.PI / 4,
            baseAwayAngle - Math.PI / 4,
          ];

      for (const angle of prioritizedAngles) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const moved = this.moveFoodAlongDirection(current, cos, sin, travelDistance);
        if (!this.isFoodPointBlocked(moved.point)) {
          const afterMove = distance(moved.point, head);
          const improved = afterMove > distanceToHead;
          candidates.push({ point: moved.point, score: improved ? 1 : -1 });
        }
      }

      if (candidates.length === 0) return current;
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0];
      if (chosen) {
        this.bonusFoodLockedDirectionsBytick.set(this.state.tick + 1, {
          x: Math.cos(prioritizedAngles[0]),
          y: Math.sin(prioritizedAngles[0]),
          ticksRemaining: 2,
        });
        return chosen.point;
      }
      return current;
    });
  }

  private maybeExpireSpoiledFood(): void {
    if (!this.state.activeModifiers.includes("spoiling-food")) {
      return;
    }
    if (this.state.tick - this.foodSpawnedTick < SPOIL_EXPIRE_TICKS) {
      return;
    }

    this.state.food = this.spawnFood(
      this.state.snake,
      this.state.world.width,
      this.state.world.height,
      this.state.obstacles,
      [this.state.food, ...this.state.bonusFoods],
    );
    this.foodSpawnedTick = this.state.tick;
    this.jackpotFoodActive =
      this.state.activeModifiers.includes("jackpot-fruit") && this.rng.nextFloat() < JACKPOT_CHANCE;
  }

  private applyShrinkingSafeZonePenalty(head: GridPoint): void {
    if (!this.state.activeModifiers.includes("shrinking-safe-zone")) {
      return;
    }
    if (this.state.tick % SHRINKING_ZONE_PENALTY_TICKS !== 0) {
      return;
    }

    const center = { x: this.state.world.width / 2, y: this.state.world.height / 2 };
    if (distance(head, center) > this.currentSafeZoneRadius()) {
      this.state.score = Math.max(0, this.state.score - 1);
    }
  }

  private clearNearbyHazards(origin: GridPoint, radius: number): void {
    this.state.minefield = this.state.minefield.filter((mine) => distance(mine, origin) > radius);
    this.state.enemyProjectiles = this.state.enemyProjectiles.filter((projectile) => distance(projectile, origin) > radius);
  }

  private updateDynamicHazards(deltaMs: number): void {
    if (
      this.state.activeModifiers.includes("crumble-blocks") &&
      (this.state.obstacles.length === 0 || this.state.tick % CRUMBLE_RESPAWN_TICKS === 0)
    ) {
      this.randomizeCrumbleObstacles();
    }

    if (this.state.activeModifiers.includes("domino-blocks") && this.state.tick % DOMINO_SHIFT_TICKS === 0) {
      this.state.obstacles = this.state.obstacles.map((obstacle, idx) => {
        const shift = idx % 2 === 0 ? 1 : -1;
        const newX = Math.max(1, Math.min(this.state.world.width - obstacle.width - 1, obstacle.x + shift));
        return {
          ...obstacle,
          x: newX,
        };
      });
    }

    const head = this.state.snake[0];

    if (this.state.activeModifiers.includes("chaser-orb")) {
      if (!this.state.chaserOrb) {
        this.state.chaserOrb = { x: Math.max(1, head.x - 5), y: head.y };
      }

      const orb = this.state.chaserOrb;
      const toHeadX = head.x - orb.x;
      const toHeadY = head.y - orb.y;
      const len = Math.hypot(toHeadX, toHeadY);
      if (len > 0.0001) {
        const step = CHASER_ORB_SPEED * (deltaMs / 1000);
        orb.x += (toHeadX / len) * Math.min(step, len);
        orb.y += (toHeadY / len) * Math.min(step, len);
      }
      if (this.state.world.mode === "infinite") {
        this.state.chaserOrb = this.wrapPoint(orb);
      }

      if (this.state.activeModifiers.includes("magnet-food")) {
        this.pullPointTowardFood(this.state.chaserOrb, deltaMs, MAGNET_FOOD_PULL * 0.8);
      }
    }

    if (this.state.activeModifiers.includes("enemy-orb")) {
      if (!this.state.enemyOrb || this.state.tick % ENEMY_ORB_RESPAWN_INTERVAL_TICKS === 0) {
        this.state.enemyOrb = {
          x: this.rng.nextFloat() > 0.5 ? 2 : this.state.world.width - 2,
          y: 2 + this.rng.nextFloat() * (this.state.world.height - 4),
        };
      }

      const orb = this.state.enemyOrb;
      const toHeadX = head.x - orb.x;
      const toHeadY = head.y - orb.y;
      const len = Math.hypot(toHeadX, toHeadY);
      if (len > 0.0001) {
        const step = ENEMY_ORB_SPEED * (deltaMs / 1000);
        orb.x += (toHeadX / len) * Math.min(step, len);
        orb.y += (toHeadY / len) * Math.min(step, len);
      }

      if (this.state.tick % ENEMY_ORB_SHOT_INTERVAL_TICKS === 0 && len > 0.0001) {
        this.state.enemyProjectiles.push({
          x: orb.x,
          y: orb.y,
          vx: (toHeadX / len) * ENEMY_PROJECTILE_SPEED,
          vy: (toHeadY / len) * ENEMY_PROJECTILE_SPEED,
        });
      }

      if (this.state.activeModifiers.includes("magnet-food")) {
        this.pullPointTowardFood(this.state.enemyOrb, deltaMs, MAGNET_FOOD_PULL * 0.7);
      }
    }

    if (this.state.enemyProjectiles.length > 0) {
      this.state.enemyProjectiles = this.state.enemyProjectiles
        .map((projectile) => {
          const next: EnemyProjectile = {
            x: projectile.x + projectile.vx * (deltaMs / 1000),
            y: projectile.y + projectile.vy * (deltaMs / 1000),
            vx: projectile.vx,
            vy: projectile.vy,
          };

          if (this.state.activeModifiers.includes("magnet-food")) {
            this.pullPointTowardFood(next, deltaMs, MAGNET_FOOD_PULL);
          }
          if (this.state.activeModifiers.includes("gravity-wells")) {
            const pulled = this.applyGravityWellsPull(next, deltaMs);
            next.x = pulled.x;
            next.y = pulled.y;
          }

          if (this.state.activeModifiers.includes("conveyor-lanes")) {
            const shifted = this.applyConveyorShift(next, deltaMs);
            next.x = shifted.x;
            next.y = shifted.y;
          }
          if (this.state.world.mode === "infinite") {
            const wrapped = this.wrapPoint(next);
            next.x = wrapped.x;
            next.y = wrapped.y;
          }
          return next;
        })
        .filter((projectile) => {
          if (this.state.world.mode === "infinite") {
            return true;
          }
          return projectile.x >= 0 && projectile.x < this.state.world.width && projectile.y >= 0 && projectile.y < this.state.world.height;
        });
    }
  }

  private randomizeCrumbleObstacles(): void {
    const rectangles: ObstacleRect[] = [];
    const count = 8;
    const margin = 2;
    for (let i = 0; i < count; i += 1) {
      const width = 1 + this.rng.nextInt(0, 3);
      const height = 1 + this.rng.nextInt(0, 3);
      let placed = false;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const x = margin + this.rng.nextFloat() * Math.max(1, this.state.world.width - margin * 2 - width);
        const y = margin + this.rng.nextFloat() * Math.max(1, this.state.world.height - margin * 2 - height);
        const rect = { x, y, width, height };

        const overlapsSnake = this.state.snake.some((segment) => circleIntersectsRect(segment, SNAKE_RADIUS, rect));
        const overlapsFood = circleIntersectsRect(this.state.food, FOOD_RADIUS, rect);
        const overlapsExisting = rectangles.some((existing) => {
          return !(
            rect.x + rect.width < existing.x ||
            rect.x > existing.x + existing.width ||
            rect.y + rect.height < existing.y ||
            rect.y > existing.y + existing.height
          );
        });
        if (!overlapsSnake && !overlapsFood && !overlapsExisting) {
          rectangles.push(rect);
          placed = true;
          break;
        }
      }
      if (!placed) {
        continue;
      }
    }
    this.state.obstacles = rectangles;
  }

  private laserSweepX(): number {
    const t = (this.state.tick % LASER_SWEEP_PERIOD_TICKS) / LASER_SWEEP_PERIOD_TICKS;
    return t * this.state.world.width;
  }

  private isFeatureHazardCollision(nextHead: GridPoint): boolean {
    if (this.state.tick < this.immunityEndsTick) {
      return false;
    }

    if (this.state.activeModifiers.includes("laser-sweep")) {
      const sweepX = this.laserSweepX();
      const inBeam = Math.abs(nextHead.x - sweepX) <= LASER_SWEEP_WIDTH;
      const yBand = Math.floor(nextHead.y / LASER_DASH_BAND);
      const inDashedSolid = yBand % 2 === 0;
      if (inBeam && inDashedSolid) {
        return true;
      }
    }

    if (this.state.activeModifiers.includes("rotating-laser-fan")) {
      const head = this.state.snake[0];
      if (this.isRotatingLaserFanHit(head)) {
        return true;
      }
    }

    if (this.state.activeModifiers.includes("minefield")) {
      const onMine = this.state.minefield.some((mine) => distance(mine, nextHead) <= MINE_TRIGGER_RADIUS + SNAKE_RADIUS);
      if (onMine) {
        return true;
      }
    }

    if (this.state.activeModifiers.includes("chaser-orb") && this.state.chaserOrb) {
      if (distance(this.state.chaserOrb, nextHead) <= SNAKE_RADIUS + 0.5) {
        return true;
      }
    }

    if (this.state.activeModifiers.includes("enemy-orb") && this.state.enemyOrb) {
      const hitByProjectile = this.state.enemyProjectiles.some(
        (projectile) => distance(projectile, nextHead) <= SNAKE_RADIUS + 0.22,
      );
      if (hitByProjectile) {
        return true;
      }
    }

    return false;
  }

  private rotatingLaserFanAngle(): number {
    return this.state.tick / 85;
  }

  private distanceFromPointToLineSegment(point: GridPoint, lineStart: GridPoint, lineEnd: GridPoint): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      // Line segment is actually a point
      return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    }
    
    // Project point onto the line, clamped to the segment
    let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;
    return Math.hypot(point.x - closestX, point.y - closestY);
  }

  private isRotatingLaserFanHit(point: GridPoint): boolean {
    const center = { x: this.state.world.width / 2, y: this.state.world.height / 2 };
    const base = this.rotatingLaserFanAngle();
    
    // Each arm is a line segment from near-center to outer radius
    const ARM_START_RADIUS = 1.2;
    const LINE_WIDTH = 0.3; // Collision buffer matching visual line thickness
    
    // Dash pattern: 8px dash, 90px gap, 20px per world unit
    const DASH_WIDTH_WORLD = 8 / 20; // 0.4 world units
    const DASH_GAP_WORLD = 90 / 20; // 4.5 world units
    const DASH_PERIOD_WORLD = DASH_WIDTH_WORLD + DASH_GAP_WORLD; // 4.9 world units
    
    // Check each of the 3 rotating arms (120 degrees apart)
    for (let i = 0; i < ROTATING_LASER_FAN_ARMS; i += 1) {
      const armAngle = base + (Math.PI * 2 * i) / ROTATING_LASER_FAN_ARMS;
      
      // Calculate the line segment endpoints for this arm
      const startX = center.x + Math.cos(armAngle) * ARM_START_RADIUS;
      const startY = center.y + Math.sin(armAngle) * ARM_START_RADIUS;
      const endX = center.x + Math.cos(armAngle) * ROTATING_LASER_FAN_RADIUS;
      const endY = center.y + Math.sin(armAngle) * ROTATING_LASER_FAN_RADIUS;
      
      const lineStart = { x: startX, y: startY };
      const lineEnd = { x: endX, y: endY };
      
      // Check if the point (snake head) collides with this line segment
      const distToLine = this.distanceFromPointToLineSegment(point, lineStart, lineEnd);
      if (distToLine <= SNAKE_RADIUS + LINE_WIDTH) {
        // Calculate the distance along the arm from start to end
        const armLength = ROTATING_LASER_FAN_RADIUS - ARM_START_RADIUS;
        
        // Project the point onto the line to find where along the arm it is
        const dx = endX - startX;
        const dy = endY - startY;
        const lengthSq = dx * dx + dy * dy;
        let t = ((point.x - startX) * dx + (point.y - startY) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t)); // Clamp to segment
        
        const distanceAlongArm = t * armLength;
        const positionInPeriod = distanceAlongArm % DASH_PERIOD_WORLD;
        
        // Only collide if we're in the visible dash part
        if (positionInPeriod < DASH_WIDTH_WORLD) {
          return true;
        }
      }
    }

    return false;
  }

  private gravityWellPoints(): GridPoint[] {
    const cx = this.state.world.width / 2;
    const cy = this.state.world.height / 2;
    return [
      {
        x: cx + Math.cos(this.state.tick / 90) * 9,
        y: cy + Math.sin(this.state.tick / 75) * 6,
      },
      {
        x: cx + Math.cos(this.state.tick / 110 + Math.PI) * 8,
        y: cy + Math.sin(this.state.tick / 95 + Math.PI / 2) * 5,
      },
    ];
  }

  private applyGravityWellTurn(heading: Heading, head: GridPoint, deltaMs: number): Heading {
    let strongestCloseness = 0;
    let targetWell: GridPoint | null = null;

    for (const well of this.gravityWellPoints()) {
      const d = Math.hypot(well.x - head.x, well.y - head.y);
      const closeness = Math.max(0, 1 - d / GRAVITY_WELL_TURN_RANGE);
      if (closeness > strongestCloseness) {
        strongestCloseness = closeness;
        targetWell = well;
      }
    }

    if (!targetWell || strongestCloseness <= 0) {
      return heading;
    }

    const desiredHeading = Math.atan2(targetWell.y - head.y, targetWell.x - head.x);
    const delta = normalizeAngle(desiredHeading - heading);
    const closenessStrength = strongestCloseness * strongestCloseness;
    const maxTurnPerTick =
      GRAVITY_WELL_MIN_TURN_PER_TICK +
      (GRAVITY_WELL_MAX_TURN_PER_TICK - GRAVITY_WELL_MIN_TURN_PER_TICK) * closenessStrength;
    const deltaScale = deltaMs / (1000 / 60);
    const maxTurn = maxTurnPerTick * deltaScale;
    const clampedTurn = Math.max(-maxTurn, Math.min(maxTurn, delta));
    return normalizeAngle(heading + clampedTurn);
  }

  private applyGravityWellsPull(point: GridPoint, deltaMs: number): GridPoint {
    const seconds = deltaMs / 1000;
    let x = point.x;
    let y = point.y;
    for (const well of this.gravityWellPoints()) {
      const dx = well.x - x;
      const dy = well.y - y;
      const d = Math.max(0.7, Math.hypot(dx, dy));
      const pull = (GRAVITY_WELL_PULL / Math.pow(d, GRAVITY_WELL_FALLOFF_EXPONENT)) * seconds;
      x += (dx / d) * pull;
      y += (dy / d) * pull;
    }
    return { x, y };
  }

  private pullPointTowardFood(point: GridPoint | null, deltaMs: number, strength: number): void {
    if (!point) {
      return;
    }

    const dx = this.state.food.x - point.x;
    const dy = this.state.food.y - point.y;
    const d = Math.max(0.5, Math.hypot(dx, dy));
    const seconds = deltaMs / 1000;
    const pull = (strength / d) * seconds;
    point.x += (dx / d) * pull;
    point.y += (dy / d) * pull;
  }

  private tryConsumeEnemyOrb(nextHead: GridPoint): void {
    if (!this.state.activeModifiers.includes("enemy-orb") || !this.state.enemyOrb) {
      return;
    }

    if (distance(this.state.enemyOrb, nextHead) > SNAKE_RADIUS + 0.48) {
      return;
    }

    const consumedOrb = this.state.enemyOrb;
    this.state.enemyOrb = null;
    this.state.enemyProjectiles = [];
    this.awardScore(2);
    this.lastFoodConsumedTick = this.state.tick;

    this.eventBus.emit("food-consumed", {
      tick: this.state.tick,
      score: this.state.score,
      foodX: consumedOrb.x,
      foodY: consumedOrb.y,
    });
  }

  private applyTaxation(): void {
    if (!this.state.activeModifiers.includes("taxation")) {
      return;
    }

    if (this.state.tick % TAX_TICK_INTERVAL !== 0) {
      return;
    }

    if (this.state.tick - this.lastFoodConsumedTick <= TAX_GRACE_TICKS) {
      return;
    }

    this.state.score = Math.max(0, this.state.score - 1);
  }

  private awardScore(points: number): void {
    if (points <= 0) {
      return;
    }

    const previousTotalPointsEarned = this.state.totalPointsEarned;
    this.state.score += points;
    this.state.totalPointsEarned += points;

    const previousSkipThreshold = Math.floor(previousTotalPointsEarned / 10);
    const currentSkipThreshold = Math.floor(this.state.totalPointsEarned / 10);
    const additionalSkips = currentSkipThreshold - previousSkipThreshold;
    if (additionalSkips > 0) {
      this.state.featureSkipsRemaining += additionalSkips;
    }
  }

  private updateMovingFood(deltaMs: number): void {
    if (!this.state.activeModifiers.includes(FOOD_EVADE_MODIFIER)) {
      return;
    }

    const head = this.state.snake[0];
    const current = this.state.food;
    const distanceToHead = distance(current, head);
    const isThreatened = distanceToHead <= FOOD_EVADE_DETECTION_RANGE;
    const awayX = current.x - head.x;
    const awayY = current.y - head.y;
    const travelDistance = FOOD_EVADE_CELLS_PER_SECOND * (deltaMs / 1000);

    if (this.foodLockedDirectionTicks > 0) {
      const lockedCandidate = this.tryMoveFoodAlongDirection(
        current,
        this.foodLockedDirection.x,
        this.foodLockedDirection.y,
        travelDistance,
      );
      this.foodLockedDirectionTicks -= 1;
      if (lockedCandidate) {
        this.state.food = lockedCandidate.point;
        if (lockedCandidate.wrapped) {
          this.foodLockedDirectionTicks = FOOD_POST_WRAP_LOCK_TICKS;
        }
      }
      return;
    }

    if (this.state.activeModifiers.includes("gravity-field")) {
      const gravityDistance = 0.95 * (deltaMs / 1000);
      const gravityMoved = this.moveFoodAlongDirection(
        current,
        0,
        1,
        gravityDistance,
      );
      if (!this.isFoodPointBlocked(gravityMoved.point)) {
        this.state.food = gravityMoved.point;
      }
    }

    const baseAwayAngle = Math.atan2(awayY, awayX);
    const preferredAngle = isThreatened ? baseAwayAngle : this.getWanderHeading();
    const startDistanceFromHead = distance(current, head);
    const candidates: Array<{ point: GridPoint; score: number }> = [];

    const prioritizedAngles = isThreatened
      ? [preferredAngle, preferredAngle + Math.PI / 2, preferredAngle - Math.PI / 2]
      : [
          preferredAngle,
          preferredAngle + FOOD_WANDER_NOISE_RADIANS,
          preferredAngle - FOOD_WANDER_NOISE_RADIANS,
        ];

    for (const angle of prioritizedAngles) {
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const moved = this.moveFoodAlongDirection(current, dirX, dirY, travelDistance);
      const candidate = moved.point;
      const score = this.scoreFoodCandidate(
        candidate,
        current,
        head,
        startDistanceFromHead,
        isThreatened,
        preferredAngle,
      );
      if (score !== Number.NEGATIVE_INFINITY) {
        candidates.push({ point: candidate, score: moved.wrapped ? score + 0.2 : score });
      }
    }

    const sweepOffset = (this.rng.nextFloat() - 0.5) * (Math.PI / FOOD_EVADE_DIRECTION_SAMPLES);
    for (let i = 0; i < FOOD_EVADE_DIRECTION_SAMPLES; i += 1) {
      const ratio = i / FOOD_EVADE_DIRECTION_SAMPLES;
      const angleSpan = isThreatened ? Math.PI : Math.PI * 0.85;
      const angle = preferredAngle + (ratio * 2 - 1) * angleSpan + sweepOffset;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const moved = this.moveFoodAlongDirection(current, dirX, dirY, travelDistance);
      const candidate = moved.point;
      const score = this.scoreFoodCandidate(
        candidate,
        current,
        head,
        startDistanceFromHead,
        isThreatened,
        preferredAngle,
      );
      if (score !== Number.NEGATIVE_INFINITY) {
        candidates.push({ point: candidate, score: moved.wrapped ? score + 0.2 : score });
      }
    }

    if (candidates.length === 0) {
      return;
    }

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, Math.min(4, candidates.length));
    const minScore = topCandidates[topCandidates.length - 1].score;
    const weighted = topCandidates.map((entry) => ({
      point: entry.point,
      weight: entry.score - minScore + 0.05,
    }));
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.rng.nextFloat() * totalWeight;
    for (const option of weighted) {
      roll -= option.weight;
      if (roll <= 0) {
        const moveX = option.point.x - current.x;
        const moveY = option.point.y - current.y;
        const moveLength = Math.hypot(moveX, moveY);
        if (moveLength > 0.0001) {
          this.foodLockedDirection = { x: moveX / moveLength, y: moveY / moveLength };
        }
        if (this.state.world.mode === "infinite" && this.didFoodWrap(current, option.point)) {
          this.foodLockedDirectionTicks = FOOD_POST_WRAP_LOCK_TICKS;
        }
        this.state.food = option.point;
        if (!isThreatened) {
          this.foodWanderAngle = Math.atan2(option.point.y - current.y, option.point.x - current.x);
        }
        return;
      }
    }

    const fallback = weighted[0].point;
    const fallbackMoveX = fallback.x - current.x;
    const fallbackMoveY = fallback.y - current.y;
    const fallbackLength = Math.hypot(fallbackMoveX, fallbackMoveY);
    if (fallbackLength > 0.0001) {
      this.foodLockedDirection = { x: fallbackMoveX / fallbackLength, y: fallbackMoveY / fallbackLength };
    }
    if (this.state.world.mode === "infinite" && this.didFoodWrap(current, fallback)) {
      this.foodLockedDirectionTicks = FOOD_POST_WRAP_LOCK_TICKS;
    }
    this.state.food = fallback;
    if (!isThreatened) {
      this.foodWanderAngle = Math.atan2(
        fallback.y - current.y,
        fallback.x - current.x,
      );
    }
  }

  private getWanderHeading(): number {
    if (this.state.tick >= this.foodWanderRetargetTick) {
      const jitter = (this.rng.nextFloat() - 0.5) * (Math.PI * 0.9);
      this.foodWanderAngle = normalizeAngle(this.foodWanderAngle + jitter);
      this.foodWanderRetargetTick =
        this.state.tick + this.rng.nextInt(FOOD_WANDER_RETARGET_MIN_TICKS, FOOD_WANDER_RETARGET_MAX_TICKS);
    }

    const noise = (this.rng.nextFloat() - 0.5) * FOOD_WANDER_NOISE_RADIANS;
    return normalizeAngle(this.foodWanderAngle + noise);
  }

  private scoreFoodCandidate(
    candidate: GridPoint,
    current: GridPoint,
    snakeHead: GridPoint,
    startDistanceFromHead: number,
    isThreatened: boolean,
    preferredAngle: number,
  ): number {
    if (this.isFoodPointBlocked(candidate)) {
      return Number.NEGATIVE_INFINITY;
    }

    const endDistanceFromHead = distance(candidate, snakeHead);
    const progressAway = endDistanceFromHead - startDistanceFromHead;

    let closestSnake = Number.POSITIVE_INFINITY;
    for (const segment of this.state.snake) {
      closestSnake = Math.min(closestSnake, distance(candidate, segment));
    }

    let closestObstacle = Number.POSITIVE_INFINITY;
    for (const obstacle of this.state.obstacles) {
      closestObstacle = Math.min(closestObstacle, pointToRectDistance(candidate, obstacle));
    }
    if (!Number.isFinite(closestObstacle)) {
      closestObstacle = 6;
    }

    const edgeClearance = this.edgeClearance(candidate);
    const movementDelta = distance(candidate, current);
    const jitter = (this.rng.nextFloat() - 0.5) * 0.6;
    const moveAngle = Math.atan2(candidate.y - current.y, candidate.x - current.x);
    const angleDelta = Math.abs(normalizeAngle(moveAngle - preferredAngle));
    const directionBias = 1 - Math.min(1, angleDelta / Math.PI);

    let score: number;
    if (isThreatened) {
      score =
        progressAway * 5.8 +
        Math.min(closestSnake, 8) * 1.8 +
        Math.min(closestObstacle, 8) * 1.5 +
        edgeClearance * 2.4 +
        movementDelta * 0.9 +
        directionBias * 1.1 +
        jitter;
    } else {
      score =
        Math.min(closestSnake, 8) * 0.8 +
        Math.min(closestObstacle, 8) * 1.9 +
        edgeClearance * 2.8 +
        movementDelta * 1.1 +
        directionBias * 3.2 +
        jitter;
    }

    if (this.state.world.mode !== "infinite" && edgeClearance < FOOD_RADIUS * 1.8) {
      score -= isThreatened ? 5 : 8;
    }

    return score;
  }

  private edgeClearance(point: GridPoint): number {
    if (this.state.world.mode === "infinite") {
      return 5;
    }

    const inset = this.currentWallInset();
    const toLeft = point.x - inset;
    const toRight = this.state.world.width - inset - point.x;
    const toTop = point.y - inset;
    const toBottom = this.state.world.height - inset - point.y;
    return Math.min(toLeft, toRight, toTop, toBottom);
  }

  private moveFoodAlongDirection(
    current: GridPoint,
    dirX: number,
    dirY: number,
    travelDistance: number,
  ): { point: GridPoint; wrapped: boolean } {
    const raw = {
      x: current.x + dirX * travelDistance,
      y: current.y + dirY * travelDistance,
    };

    if (this.state.world.mode === "infinite") {
      const wrapped = raw.x < 0 || raw.x >= this.state.world.width || raw.y < 0 || raw.y >= this.state.world.height;
      return {
        point: this.wrapPoint(raw),
        wrapped,
      };
    }

    return {
      point: this.normalizeFoodPoint(raw),
      wrapped: false,
    };
  }

  private tryMoveFoodAlongDirection(
    current: GridPoint,
    dirX: number,
    dirY: number,
    travelDistance: number,
  ): { point: GridPoint; wrapped: boolean } | null {
    const attempts = [0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4];
    for (const offset of attempts) {
      const cos = Math.cos(offset);
      const sin = Math.sin(offset);
      const testX = dirX * cos - dirY * sin;
      const testY = dirX * sin + dirY * cos;
      const moved = this.moveFoodAlongDirection(current, testX, testY, travelDistance);
      if (!this.isFoodPointBlocked(moved.point)) {
        const magnitude = Math.hypot(testX, testY);
        if (magnitude > 0.0001) {
          this.foodLockedDirection = { x: testX / magnitude, y: testY / magnitude };
        }
        return moved;
      }
    }

    return null;
  }

  private didFoodWrap(previous: GridPoint, next: GridPoint): boolean {
    if (this.state.world.mode !== "infinite") {
      return false;
    }

    const width = this.state.world.width;
    const height = this.state.world.height;
    return Math.abs(next.x - previous.x) > width / 2 || Math.abs(next.y - previous.y) > height / 2;
  }

  private normalizeFoodPoint(point: GridPoint): GridPoint {
    if (this.state.world.mode === "infinite") {
      return this.wrapPoint(point);
    }

    const margin = FOOD_RADIUS + 0.05 + this.currentWallInset();
    return {
      x: Math.max(margin, Math.min(this.state.world.width - margin, point.x)),
      y: Math.max(margin, Math.min(this.state.world.height - margin, point.y)),
    };
  }

  private isFoodPointBlocked(point: GridPoint): boolean {
    const intersectsSnake = this.state.snake.some(
      (segment) => distance(segment, point) <= SNAKE_RADIUS + FOOD_RADIUS + 0.12,
    );
    if (intersectsSnake) {
      return true;
    }

    return this.state.obstacles.some((obstacle) => circleIntersectsRect(point, FOOD_RADIUS, obstacle));
  }

  private targetTrailPointCount(): number {
    let estimatedCells = 3 + this.state.score;
    let minTrailPoints = MIN_TRAIL_POINTS;
    if (this.state.activeModifiers.includes("fragile-body")) {
      const elapsedSinceFood = Math.max(0, this.state.tick - Math.max(0, this.lastFoodConsumedTick));
      const decayCells = Math.floor(elapsedSinceFood / FRAGILE_DECAY_TICKS);
      estimatedCells = Math.max(2, estimatedCells - decayCells);
      minTrailPoints = 10;
    }
    return Math.max(minTrailPoints, Math.floor(estimatedCells * POINTS_PER_CELL));
  }

  private isWallCollision(point: GridPoint): boolean {
    if (!this.state.world.hasWalls || this.state.world.mode === "infinite") {
      return false;
    }

    const inset = this.currentWallInset();
    return (
      point.x < inset ||
      point.y < inset ||
      point.x >= this.state.world.width - inset ||
      point.y >= this.state.world.height - inset
    );
  }

  private isObstacleCollision(point: GridPoint): boolean {
    return this.state.obstacles.some((obstacle) => circleIntersectsRect(point, SNAKE_RADIUS, obstacle));
  }

  private isSelfCollision(point: GridPoint): boolean {
    for (let i = 12; i < this.state.snake.length; i += 1) {
      const segment = this.state.snake[i];
      if (distance(segment, point) <= SNAKE_RADIUS * 1.4) {
        return true;
      }
    }

    return false;
  }

  private spawnFood(
    snake: GridPoint[],
    width: number,
    height: number,
    obstacles: ObstacleRect[],
    avoidPoints: GridPoint[] = [],
  ): GridPoint {
    const inset = this.currentWallInset();
    const spawnMinX = 1 + inset;
    const spawnMaxX = width - 1 - inset;
    const spawnMinY = 1 + inset;
    const spawnMaxY = height - 1 - inset;

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const candidate = {
        x: spawnMinX + this.rng.nextFloat() * Math.max(0.2, spawnMaxX - spawnMinX),
        y: spawnMinY + this.rng.nextFloat() * Math.max(0.2, spawnMaxY - spawnMinY),
      };

      const onSnake = snake.some((segment) => distance(segment, candidate) <= SNAKE_RADIUS + FOOD_RADIUS + 0.15);
      const onObstacle = obstacles.some((obstacle) => circleIntersectsRect(candidate, FOOD_RADIUS, obstacle));
      const onExistingFood = avoidPoints.some((foodPoint) => distance(candidate, foodPoint) <= FOOD_RADIUS * 2.1);
      if (!onSnake && !onObstacle && !onExistingFood) {
        return candidate;
      }
    }

    return {
      x: Math.max(spawnMinX, Math.min(spawnMaxX, width / 2)),
      y: Math.max(spawnMinY, Math.min(spawnMaxY, height / 2)),
    };
  }

  private updateCamera(): void {
    const head = this.state.snake[0];
    if (this.state.world.mode === "infinite" || !this.state.world.hasWalls) {
      this.state.camera.x = head.x;
      this.state.camera.y = head.y;
      return;
    }

    this.state.camera.x = 0;
    this.state.camera.y = 0;
  }

  private wrapPoint(point: GridPoint): GridPoint {
    const width = this.state.world.width;
    const height = this.state.world.height;

    let x = point.x;
    let y = point.y;

    if (x < 0) {
      x += width;
    } else if (x >= width) {
      x -= width;
    }

    if (y < 0) {
      y += height;
    } else if (y >= height) {
      y -= height;
    }

    return { x, y };
  }

  private endRun(cause: "wall" | "self" | "feature-hazard"): void {
    this.state.isGameOver = true;
    this.state.deathCause = cause;
    this.eventBus.emit("collision", { tick: this.state.tick, cause });

    const entry: LeaderboardEntry = {
      score: this.state.score,
      survivedTicks: this.state.tick,
      seed: this.seed,
      timestampMs: Date.now(),
    };

    const updated = insertScore(this.state.leaderboard, entry);
    this.state.leaderboard = updated;
    writeLeaderboard(updated);

    this.eventBus.emit("leaderboard-updated", {
      bestScore: updated[0]?.score ?? 0,
      entries: updated.length,
    });

    this.eventBus.emit("run-ended", { tick: this.state.tick, cause });
  }
}
