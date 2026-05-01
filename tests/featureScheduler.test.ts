import { describe, expect, it } from "vitest";
import { FeatureScheduler } from "../src/features/scheduler";
import { FEATURE_REGISTRY } from "../src/features/definitions/registry";

describe("FeatureScheduler", () => {
  it("triggers every 10 seconds at 60 ticks per second", () => {
    const scheduler = new FeatureScheduler();

    expect(scheduler.shouldTriggerFeature(599)).toBe(false);
    expect(scheduler.shouldTriggerFeature(600)).toBe(true);
    expect(scheduler.shouldTriggerFeature(1200)).toBe(true);
  });

  it("falls back when no selectable features are available", () => {
    const scheduler = new FeatureScheduler();

    const active = Object.values(FEATURE_REGISTRY)
      .filter((feature) => feature.selectable)
      .map((feature) => ({
        id: feature.id,
        icon: feature.icon,
        tags: feature.tags,
        startedTick: 1,
      }));

    const picked = scheduler.pickRandomFeature(() => 0, active);
    expect(picked).toBe("fallback-stabilizer");
  });

  it("identifies conflicting active feature by shared tag", () => {
    const scheduler = new FeatureScheduler();

    const active = [
      { id: "speed-boost", icon: "SPD+", tags: ["speed"], startedTick: 1 },
      { id: "obstacle-ring", icon: "OBST", tags: ["obstacles"], startedTick: 1 },
    ];

    const incoming = scheduler.featureById("speed-slow");
    const conflicts = scheduler.conflictingFeatures(active, incoming);

    expect(conflicts).toContain("speed-boost");
    expect(conflicts).not.toContain("obstacle-ring");
  });

  it("uses selection strength to bias which features appear", () => {
    const scheduler = new FeatureScheduler();

    let state = 0x12345678;
    const randomInt = (minInclusive: number, maxExclusive: number): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return minInclusive + (state % (maxExclusive - minInclusive));
    };

    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i += 1) {
      const picked = scheduler.pickRandomFeature(randomInt, []);
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }

    const choiceCount = counts.get("feature-choice-mode") ?? 0;
    const speedBoostCount = counts.get("speed-boost") ?? 0;
    const noWallsCount = counts.get("no-walls-infinite") ?? 0;

    expect(choiceCount).toBeGreaterThan(speedBoostCount);
    expect(choiceCount).toBeGreaterThan(noWallsCount);
  });
});
