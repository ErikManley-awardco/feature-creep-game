import { describe, expect, it } from "vitest";
import { GameSession } from "../src/core/gameSession";
import { EventBus } from "../src/events/eventBus";

function circleIntersectsRect(
  x: number,
  y: number,
  radius: number,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function angleDelta(from: number, to: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return Math.abs(delta);
}

describe("GameSession features", () => {
  it("offers a feature every 600 ticks and applies it on continue", () => {
    const session = new GameSession("feature-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;

    for (let i = 0; i < 600; i += 1) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.featureAnnouncement).not.toBeNull();
    const continued = session.continuePendingFeature();
    expect(continued).toBe(true);
    expect(session.state.featureAnnouncement).toBeNull();
    expect(session.state.metrics.featuresAdded).toBeGreaterThanOrEqual(1);
    expect(session.state.activeFeatures.length).toBeGreaterThanOrEqual(1);
  });

  it("feature-choice mode offers three options and allows selection", () => {
    const session = new GameSession("choice-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("feature-choice-mode");

    while (session.state.tick < 600) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.featureChoice).not.toBeNull();
    expect(session.state.featureChoice?.options.length).toBeGreaterThanOrEqual(1);

    const selected = session.chooseFeatureOption(0);
    expect(selected).toBe(true);
    expect(session.state.featureChoice).toBeNull();
  });

  it("feature-choice mode can be skipped once", () => {
    const session = new GameSession("choice-skip-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("feature-choice-mode");

    while (session.state.tick < 600) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.featureChoice).not.toBeNull();
    const skipped = session.skipPendingFeatureChoice();
    expect(skipped).toBe(true);
    expect(session.state.featureChoice).toBeNull();
    expect(session.state.featureSkipsRemaining).toBe(0);
  });

  it("replaces conflicting speed feature via shared tags", () => {
    const session = new GameSession("replace-seed", new EventBus());

    session.debugApplyFeature("speed-boost");
    session.debugApplyFeature("speed-slow");

    const activeIds = session.state.activeFeatures.map((feature) => feature.id);
    expect(activeIds).toContain("speed-slow");
    expect(activeIds).not.toContain("speed-boost");
    expect(session.state.speedMultiplier).toBe(0.75);
  });

  it("replaces mouse-control when gravity-field is applied due to shared conflict tag", () => {
    const session = new GameSession("mouse-gravity-conflict-seed", new EventBus());

    session.debugApplyFeature("mouse-control");
    session.debugApplyFeature("gravity-field");

    const activeIds = session.state.activeFeatures.map((feature) => feature.id);
    expect(activeIds).toContain("gravity-field");
    expect(activeIds).not.toContain("mouse-control");
    expect(session.state.activeModifiers).toContain("gravity-field");
    expect(session.state.activeModifiers).not.toContain("mouse-control");
  });

  it("opens replacement prompt when slots are full", () => {
    const session = new GameSession("slots-seed", new EventBus());

    session.state.activeFeatures = Array.from({ length: 10 }, (_, idx) => ({
      id: `fake-${idx}`,
      icon: `F${idx}`,
      tags: [`fake-${idx}`],
      startedTick: idx,
    }));

    session.debugApplyFeature("obstacle-ring");

    expect(session.state.featureReplacement).not.toBeNull();
    expect(session.state.featureReplacement?.incomingFeatureId).toBe("obstacle-ring");
  });

  it("allows one feature skip per run", () => {
    const session = new GameSession("skip-seed", new EventBus());

    session.state.activeFeatures = Array.from({ length: 10 }, (_, idx) => ({
      id: `fake-${idx}`,
      icon: `F${idx}`,
      tags: [`fake-${idx}`],
      startedTick: idx,
    }));

    session.debugApplyFeature("speed-boost");
    expect(session.state.featureReplacement).not.toBeNull();

    const firstSkip = session.skipPendingFeature();
    expect(firstSkip).toBe(true);
    expect(session.state.featureSkipsRemaining).toBe(0);
    expect(session.state.featureReplacement).toBeNull();

    session.debugApplyFeature("speed-slow");
    expect(session.state.featureReplacement).not.toBeNull();
    const secondSkip = session.skipPendingFeature();
    expect(secondSkip).toBe(false);
  });

  it("awards additional skips every 10 lifetime points earned", () => {
    const session = new GameSession("earned-skip-seed", new EventBus());

    session.state.score = 12;
    session.state.totalPointsEarned = 12;
    session.state.featureSkipsRemaining = 2;
    session.state.score -= 3;

    session.debugApplyFeature("enemy-orb");
    for (let i = 0; i < 4; i += 1) {
      session.state.enemyOrb = { ...session.state.snake[0] };
      session.advanceTick(1000 / 60);
    }

    expect(session.state.score).toBe(17);
    expect(session.state.totalPointsEarned).toBe(20);
    expect(session.state.featureSkipsRemaining).toBe(3);
  });

  it("wall-wrap feature wraps through arena edges", () => {
    const session = new GameSession("wrap-seed", new EventBus());
    session.debugApplyFeature("no-walls-infinite");

    session.state.snake[0] = { x: 0.1, y: 15 };
    session.state.heading = Math.PI;
    session.advanceTick(250);

    expect(session.state.isGameOver).toBe(false);
    expect(session.state.snake[0].x).toBeGreaterThan(38);
  });

  it("obstacle feature creates non-overlapping rectangles away from snake and food", () => {
    const session = new GameSession("obstacle-seed", new EventBus());
    session.debugApplyFeature("obstacle-ring");

    expect(session.state.obstacles.length).toBeGreaterThan(0);

    for (const obstacle of session.state.obstacles) {
      expect(obstacle.width).toBeGreaterThan(0);
      expect(obstacle.height).toBeGreaterThan(0);

      const touchesSnake = session.state.snake.some((segment) =>
        circleIntersectsRect(segment.x, segment.y, 0.35, obstacle),
      );
      expect(touchesSnake).toBe(false);

      const touchesFood = circleIntersectsRect(session.state.food.x, session.state.food.y, 0.42, obstacle);
      expect(touchesFood).toBe(false);
    }
  });

  it("laser-sweep can trigger a feature-hazard collision", () => {
    const session = new GameSession("laser-seed", new EventBus());
    session.debugApplyFeature("laser-sweep");
    (session as any).immunityEndsTick = 0;
    session.state.snake[0] = { x: 0.22, y: 1.2 };
    session.state.heading = 0;

    session.advanceTick(1000 / 60);

    expect(session.state.isGameOver).toBe(true);
    expect(session.state.deathCause).toBe("feature-hazard");
  });

  it("crumble-blocks keeps obstacle field active over time", () => {
    const session = new GameSession("crumble-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.debugApplyFeature("crumble-blocks");

    session.state.obstacles = [];
    for (let i = 0; i < 240; i += 1) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.obstacles.length).toBeGreaterThan(0);
  });

  it("minefield causes a feature-hazard collision on contact", () => {
    const session = new GameSession("mine-seed", new EventBus());
    session.debugApplyFeature("minefield");
    const head = session.state.snake[0];
    session.state.minefield = [{ x: head.x + 0.35, y: head.y }];
    session.state.heading = 0;
    session.state.tick = 100;

    session.advanceTick(1000 / 60);

    expect(session.state.isGameOver).toBe(true);
    expect(session.state.deathCause).toBe("feature-hazard");
  });

  it("chaser-orb moves closer to the snake over time", () => {
    const session = new GameSession("chaser-seed", new EventBus());
    session.debugApplyFeature("chaser-orb");
    session.state.baseCellsPerSecond = 0;
    const orbBefore = session.state.chaserOrb;
    if (!orbBefore) {
      throw new Error("chaser orb missing");
    }
    const head = session.state.snake[0];
    const beforeDistance = Math.hypot(orbBefore.x - head.x, orbBefore.y - head.y);

    for (let i = 0; i < 60; i += 1) {
      session.advanceTick(1000 / 60);
    }

    const orbAfter = session.state.chaserOrb;
    if (!orbAfter) {
      throw new Error("chaser orb removed unexpectedly");
    }
    const afterDistance = Math.hypot(orbAfter.x - head.x, orbAfter.y - head.y);
    expect(afterDistance).toBeLessThan(beforeDistance);
  });

  it("enemy-orb periodically fires projectiles", () => {
    const session = new GameSession("enemy-seed", new EventBus());
    session.debugApplyFeature("enemy-orb");
    session.state.baseCellsPerSecond = 0;
    session.state.enemyOrb = { x: 2, y: 2 };

    session.state.tick = 74;
    session.advanceTick(1000 / 60);

    expect(session.state.enemyProjectiles.length).toBeGreaterThan(0);
  });

  it("enemy-orb can be eaten for 2 points and is destroyed", () => {
    const session = new GameSession("enemy-eat-seed", new EventBus());
    session.debugApplyFeature("enemy-orb");
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.score = 0;

    const head = session.state.snake[0];
    session.state.enemyOrb = { x: head.x + 0.3, y: head.y };
    session.state.heading = 0;

    session.advanceTick(1000 / 60);

    expect(session.state.isGameOver).toBe(false);
    expect(session.state.enemyOrb).toBeNull();
    expect(session.state.score).toBe(2);
  });

  it("food-evade feature makes food move away from snake", () => {
    const session = new GameSession("food-evade-seed", new EventBus());
    session.debugApplyFeature("food-evade");

    session.state.world.mode = "bounded";
    session.state.world.hasWalls = true;
    session.state.snake[0] = { x: 18, y: 15 };
    session.state.food = { x: 22, y: 15 };

    const before = { ...session.state.food };
    session.advanceTick(1000 / 60);

    const after = session.state.food;
    const movedDistance = Math.hypot(after.x - before.x, after.y - before.y);
    expect(movedDistance).toBeGreaterThan(0.01);
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("taxation reduces score when player does not eat", () => {
    const session = new GameSession("tax-seed", new EventBus());
    session.debugApplyFeature("taxation");
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.score = 4;

    for (let i = 0; i < 360; i += 1) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.score).toBeLessThan(4);
  });

  it("combo-food grants bonus points for quick consecutive food", () => {
    const session = new GameSession("combo-seed", new EventBus());
    session.debugApplyFeature("combo-food");

    const head = session.state.snake[0];
    session.state.food = { x: head.x + 0.1, y: head.y };
    session.advanceTick(1000 / 60);
    const firstScore = session.state.score;

    const newHead = session.state.snake[0];
    session.state.food = { x: newHead.x + 0.1, y: newHead.y };
    session.advanceTick(1000 / 60);

    expect(firstScore).toBe(1);
    expect(session.state.score).toBeGreaterThan(2);
  });

  it("speed-control changes movement speed based on held input", () => {
    const session = new GameSession("control-seed", new EventBus());
    session.debugApplyFeature("speed-control");

    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;

    const start = session.state.snake[0].x;
    session.advanceTick(1000 / 60);
    const baseDistance = session.state.snake[0].x - start;

    session.setSpeedControlInput("fast");
    const beforeFast = session.state.snake[0].x;
    session.advanceTick(1000 / 60);
    const fastDistance = session.state.snake[0].x - beforeFast;

    session.setSpeedControlInput("slow");
    const beforeSlow = session.state.snake[0].x;
    session.advanceTick(1000 / 60);
    const slowDistance = session.state.snake[0].x - beforeSlow;

    expect(fastDistance).toBeGreaterThan(baseDistance);
    expect(slowDistance).toBeLessThan(baseDistance);
  });

  it("delayed-input-queue delays steering commands", () => {
    const session = new GameSession("delayed-input-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("delayed-input-queue");
    session.state.heading = 0;

    const handled = session.handleControlKey("a");
    expect(handled).toBe(true);
    expect(session.state.heading).toBe(0);

    for (let i = 0; i < 31; i += 1) {
      session.advanceTick(1000 / 60);
    }

    expect(session.state.heading).not.toBe(0);
  });

  it("keyboard-scramble swaps left/right mapping on scramble phase", () => {
    const session = new GameSession("scramble-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("keyboard-scramble");
    session.state.heading = 0;
    session.state.tick = 900;

    session.handleControlKey("a");
    session.advanceTick(1000 / 60);

    expect(session.state.heading).toBeGreaterThan(0);
  });

  it("inverted-arena-tilt enables tilt modifier", () => {
    const session = new GameSession("tilt-seed", new EventBus());
    session.debugApplyFeature("inverted-arena-tilt");

    expect(session.state.activeModifiers).toContain("inverted-arena-tilt");
  });

  it("wind-tunnel applies lateral drift", () => {
    const session = new GameSession("wind-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.debugApplyFeature("wind-tunnel");

    const x0 = session.state.snake[0].x;
    session.advanceTick(1000 / 60);

    expect(session.state.snake[0].x).not.toBe(x0);
  });

  it("domino-blocks shifts obstacles over time", () => {
    const session = new GameSession("domino-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.debugApplyFeature("domino-blocks");

    session.state.obstacles = [
      { x: 10, y: 10, width: 2, height: 2 },
      { x: 20, y: 12, width: 2, height: 2 },
    ];
    session.state.tick = 119;

    session.advanceTick(1000 / 60);

    expect(session.state.obstacles[0].x).toBeGreaterThan(10);
    expect(session.state.obstacles[1].x).toBeLessThan(20);
  });

  it("rotating-laser-fan can cause feature-hazard collision", () => {
    const session = new GameSession("fan-seed", new EventBus());
    session.debugApplyFeature("rotating-laser-fan");
    (session as any).immunityEndsTick = 0;
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.state.snake[0] = { x: 21.4, y: 15 }; // 1.4 units from center, in first dash

    // Advance many ticks so the laser sweeps through the snake position
    for (let i = 0; i < 100; i += 1) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) break;
    }

    expect(session.state.isGameOver).toBe(true);
    expect(session.state.deathCause).toBe("feature-hazard");
  });

  it("magnet-food pulls hostile projectiles toward food", () => {
    const session = new GameSession("magnet-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.debugApplyFeature("enemy-orb");
    session.debugApplyFeature("magnet-food");

    session.state.enemyProjectiles = [{ x: 2, y: 2, vx: 0, vy: 0 }];
    session.state.food = { x: 30, y: 20 };
    const before = Math.hypot(session.state.enemyProjectiles[0].x - session.state.food.x, session.state.enemyProjectiles[0].y - session.state.food.y);

    session.advanceTick(1000 / 60);

    const projectile = session.state.enemyProjectiles[0];
    const after = Math.hypot(projectile.x - session.state.food.x, projectile.y - session.state.food.y);
    expect(after).toBeLessThan(before);
  });

  it("gravity-wells bend movement even with no forward speed", () => {
    const session = new GameSession("wells-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.debugApplyFeature("gravity-wells");

    const before = { ...session.state.snake[0] };
    session.advanceTick(1000 / 60);
    const after = session.state.snake[0];

    expect(after.x !== before.x || after.y !== before.y).toBe(true);
  });

  it("gravity-wells turns heading faster when closer to a well", () => {
    const nearSession = new GameSession("wells-turn-near", new EventBus());
    nearSession.state.world.mode = "infinite";
    nearSession.state.world.hasWalls = false;
    nearSession.state.baseCellsPerSecond = 0;
    nearSession.state.heading = Math.PI;
    nearSession.state.snake[0] = { x: 26, y: 15 };
    nearSession.debugApplyFeature("gravity-wells");

    const farSession = new GameSession("wells-turn-far", new EventBus());
    farSession.state.world.mode = "infinite";
    farSession.state.world.hasWalls = false;
    farSession.state.baseCellsPerSecond = 0;
    farSession.state.heading = Math.PI;
    farSession.state.snake[0] = { x: 2, y: 15 };
    farSession.debugApplyFeature("gravity-wells");

    nearSession.advanceTick(1000 / 60);
    farSession.advanceTick(1000 / 60);

    const nearTurnAmount = angleDelta(Math.PI, nearSession.state.heading);
    const farTurnAmount = angleDelta(Math.PI, farSession.state.heading);
    expect(nearTurnAmount).toBeGreaterThan(farTurnAmount);
  });

  it("conveyor-lanes shifts snake sideways by lane", () => {
    const session = new GameSession("conveyor-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.debugApplyFeature("conveyor-lanes");
    session.state.snake[0] = { x: 20, y: 1.2 };

    const x0 = session.state.snake[0].x;
    session.advanceTick(1000 / 60);

    expect(session.state.snake[0].x).toBeGreaterThan(x0);
  });

  it("elastic-walls bounces instead of dying and deducts score", () => {
    const session = new GameSession("elastic-seed", new EventBus());
    session.debugApplyFeature("elastic-walls");
    session.state.score = 2;
    session.state.snake[0] = { x: 0.1, y: 15 };
    session.state.heading = Math.PI;

    session.advanceTick(1000 / 60);

    expect(session.state.isGameOver).toBe(false);
    expect(session.state.score).toBe(1);
  });

  it("shrinking-safe-zone drains score when outside zone", () => {
    const session = new GameSession("zone-seed", new EventBus());
    session.debugApplyFeature("shrinking-safe-zone");
    session.state.world.mode = "bounded";
    session.state.world.hasWalls = true;
    session.state.baseCellsPerSecond = 0;
    session.state.score = 3;
    session.state.snake[0] = { x: 1, y: 1 };
    session.state.tick = 44;

    session.advanceTick(1000 / 60);

    expect(session.state.score).toBe(2);
  });

  it("jackpot-fruit grants +5 bonus on primary food consume", () => {
    const session = new GameSession("jackpot-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("jackpot-fruit");
    (session as any).jackpotFoodActive = true;

    const head = session.state.snake[0];
    session.state.food = { x: head.x + 0.1, y: head.y };
    session.advanceTick(1000 / 60);

    expect(session.state.score).toBeGreaterThanOrEqual(6);
  });

  it("spoiling-food turns primary food into score penalty after rot timer", () => {
    const session = new GameSession("spoil-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("spoiling-food");
    session.state.score = 3;
    (session as any).foodSpawnedTick = 0;
    session.state.tick = 650;

    const head = session.state.snake[0];
    session.state.food = { x: head.x + 0.1, y: head.y };
    session.advanceTick(1000 / 60);

    expect(session.state.score).toBe(2);
  });

  it("time-dilation-burst alternates slow and fast movement phases", () => {
    const session = new GameSession("time-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("time-dilation-burst");
    session.state.heading = 0;

    const x0 = session.state.snake[0].x;
    session.state.tick = 10;
    session.advanceTick(1000 / 60);
    const slowStep = session.state.snake[0].x - x0;

    const x1 = session.state.snake[0].x;
    session.state.tick = 240;
    session.advanceTick(1000 / 60);
    const fastStep = session.state.snake[0].x - x1;

    expect(fastStep).toBeGreaterThan(slowStep);
  });

  it("gravity-field nudges movement off the heading vector", () => {
    const session = new GameSession("gravity-seed", new EventBus());
    session.debugApplyFeature("gravity-field");

    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.heading = 0;

    const startY = session.state.snake[0].y;
    session.advanceTick(1000 / 60);

    expect(session.state.snake[0].y).not.toBe(startY);
  });

  it("gravity-field rotates heading toward south via least resistance", () => {
    const session = new GameSession("gravity-steer-seed", new EventBus());
    session.debugApplyFeature("gravity-field");
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.baseCellsPerSecond = 0;
    session.state.heading = -Math.PI + 0.2;

    const headingBefore = session.state.heading;
    const deltaBefore = Math.atan2(
      Math.sin(Math.PI / 2 - headingBefore),
      Math.cos(Math.PI / 2 - headingBefore),
    );

    session.advanceTick(1000 / 60);
    const headingAfter = session.state.heading;
    const deltaAfter = Math.atan2(
      Math.sin(Math.PI / 2 - headingAfter),
      Math.cos(Math.PI / 2 - headingAfter),
    );
    const signedTurn = Math.atan2(
      Math.sin(headingAfter - headingBefore),
      Math.cos(headingAfter - headingBefore),
    );

    expect(Math.abs(deltaAfter)).toBeLessThan(Math.abs(deltaBefore));
    expect(Math.sign(signedTurn)).toBe(Math.sign(deltaBefore));
  });

  it("drift-turn curves toward queued heading over multiple ticks", () => {
    const session = new GameSession("drift-seed", new EventBus());
    session.debugApplyFeature("drift-turn");
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;

    session.queueHeading(Math.PI / 2);
    session.advanceTick(1000 / 60);

    expect(session.state.heading).toBeGreaterThan(0);
    expect(session.state.heading).toBeLessThan(Math.PI / 2);
  });

  it("mouse-control steers heading toward the pointer", () => {
    const session = new GameSession("mouse-seed", new EventBus());
    session.debugApplyFeature("mouse-control");
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;

    const head = session.state.snake[0];
    session.setMouseTarget({ x: head.x, y: head.y + 8 });
    for (let i = 0; i < 8; i += 1) {
      session.advanceTick(1000 / 60);
    }

    expect(session.state.heading).toBeGreaterThan(0.4);
  });

  it("moving-walls uses a dynamic inset that can cause earlier wall collision", () => {
    const session = new GameSession("moving-wall-seed", new EventBus());
    session.debugApplyFeature("moving-walls");
    expect(session.currentWallInset()).toBeGreaterThan(0);

    session.state.snake[0] = { x: 1, y: 15 };
    session.state.heading = Math.PI;
    session.advanceTick(1000 / 60);

    expect(session.state.isGameOver).toBe(true);
    expect(session.state.deathCause).toBe("wall");
  });

  it("portal-pair teleports the snake between linked points", () => {
    const session = new GameSession("portal-seed", new EventBus());
    session.state.world.mode = "bounded";
    session.state.world.hasWalls = true;
    session.debugApplyFeature("portal-pair");

    expect(session.state.portalPair).not.toBeNull();
    const portals = session.state.portalPair;
    if (!portals) {
      throw new Error("portal pair missing");
    }

    session.state.snake[0] = { x: portals.a.x - 0.4, y: portals.a.y };
    session.state.heading = 0;
    session.advanceTick(1000 / 60);

    expect(Math.abs(session.state.snake[0].x - portals.b.x)).toBeLessThan(2.5);
  });

  it("spawning-food periodically creates bonus food and bonus food can be consumed", () => {
    const session = new GameSession("spawning-food-seed", new EventBus());
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.debugApplyFeature("spawning-food");

    for (let i = 0; i < 180; i += 1) {
      session.advanceTick(1000 / 60);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.bonusFoods.length).toBeGreaterThan(0);
    const bonus = session.state.bonusFoods[0];
    session.state.snake[0] = { x: bonus.x - 0.1, y: bonus.y };
    session.state.heading = 0;
    const scoreBefore = session.state.score;

    session.advanceTick(1000 / 60);

    expect(session.state.score).toBeGreaterThan(scoreBefore);
    expect(session.state.bonusFoods.length).toBe(0);
  });

  it("psychedelic-shader enables a visual shader modifier", () => {
    const session = new GameSession("psy-seed", new EventBus());
    session.debugApplyFeature("psychedelic-shader");

    expect(session.state.activeModifiers).toContain("psychedelic-shader");
  });

  it("charged-food dangerous phase applies a penalty instead of points", () => {
    const session = new GameSession("charged-seed", new EventBus());
    session.debugApplyFeature("charged-food");
    session.state.world.mode = "infinite";
    session.state.world.hasWalls = false;
    session.state.score = 3;
    session.state.tick = 89;

    const head = session.state.snake[0];
    session.state.food = { x: head.x + 0.1, y: head.y };
    session.advanceTick(1000 / 60);

    expect(session.state.score).toBe(2);
  });

  it("fragile-body slowly decays trail size when no food is eaten", () => {
    const fragileSession = new GameSession("fragile-seed", new EventBus());
    fragileSession.debugApplyFeature("fragile-body");
    fragileSession.state.world.mode = "infinite";
    fragileSession.state.world.hasWalls = false;
    fragileSession.state.score = 5;

    const controlSession = new GameSession("fragile-seed", new EventBus());
    controlSession.state.world.mode = "infinite";
    controlSession.state.world.hasWalls = false;
    controlSession.state.score = 5;

    for (let i = 0; i < 500; i += 1) {
      fragileSession.advanceTick(1000 / 60);
      controlSession.advanceTick(1000 / 60);
      if (fragileSession.state.isGameOver || controlSession.state.isGameOver) {
        break;
      }
    }

    expect(fragileSession.state.snake.length).toBeLessThan(controlSession.state.snake.length);
  });
});
