import { FEATURE_REGISTRY } from "./definitions/registry";
import type { CandidateSelection, FeatureDefinition, FeatureId, FeatureSchedulerConfig } from "./types";
import type { ActiveFeatureState } from "../types/game";

const DEFAULT_CONFIG: FeatureSchedulerConfig = {
  intervalTicks: 60 * 10,
  maxConcurrentFeatures: 10,
};

function canReplaceByTag(existing: ActiveFeatureState, candidate: FeatureDefinition): boolean {
  return candidate.tags.some((tag) => existing.tags.includes(tag));
}

function featureTickets(feature: FeatureDefinition): number {
  const strength = feature.selectionStrength ?? 1;
  if (!Number.isFinite(strength) || strength <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(strength * 100));
}

function weightedIndex(
  randomInt: (minInclusive: number, maxExclusive: number) => number,
  candidates: FeatureDefinition[],
): number {
  const totalTickets = candidates.reduce((sum, feature) => sum + featureTickets(feature), 0);
  let roll = randomInt(0, totalTickets);

  for (let i = 0; i < candidates.length; i += 1) {
    roll -= featureTickets(candidates[i]);
    if (roll < 0) {
      return i;
    }
  }

  return candidates.length - 1;
}

export class FeatureScheduler {
  private readonly config: FeatureSchedulerConfig;

  constructor(config: Partial<FeatureSchedulerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  get intervalTicks(): number {
    return this.config.intervalTicks;
  }

  pickRandomFeature(
    randomInt: (minInclusive: number, maxExclusive: number) => number,
    active: ActiveFeatureState[],
    exclude?: Set<FeatureId>,
  ): FeatureId {
    const candidates = this.validSelectableFeatures(active, exclude);
    if (candidates.length === 0) {
      return "fallback-stabilizer";
    }

    const idx = weightedIndex(randomInt, candidates);
    return candidates[idx].id;
  }

  pickFeatureChoices(
    randomInt: (minInclusive: number, maxExclusive: number) => number,
    active: ActiveFeatureState[],
    count = 3,
    exclude?: Set<FeatureId>,
  ): CandidateSelection {
    const candidates = this.validSelectableFeatures(active, exclude);
    if (candidates.length === 0) {
      return {
        options: ["fallback-stabilizer"],
        autoPick: "fallback-stabilizer",
      };
    }

    const options: FeatureId[] = [];
    const remaining = [...candidates];
    while (options.length < count && remaining.length > 0) {
      const idx = weightedIndex(randomInt, remaining);
      options.push(remaining[idx].id);
      remaining.splice(idx, 1);
    }

    return {
      options,
      autoPick: options[0] ?? "fallback-stabilizer",
    };
  }

  shouldTriggerFeature(currentTick: number): boolean {
    return currentTick > 0 && currentTick % this.config.intervalTicks === 0;
  }

  isFeatureChoiceModeActive(active: ActiveFeatureState[]): boolean {
    return active.some((entry) => entry.id === "feature-choice-mode");
  }

  conflictingFeatures(active: ActiveFeatureState[], incoming: FeatureDefinition): FeatureId[] {
    if (!incoming.replaceOnTagConflict) {
      return [];
    }

    return active
      .filter((entry) => canReplaceByTag(entry, incoming))
      .map((entry) => entry.id as FeatureId);
  }

  maxConcurrentFeatures(): number {
    return this.config.maxConcurrentFeatures;
  }

  featureById(featureId: FeatureId): FeatureDefinition {
    return FEATURE_REGISTRY[featureId];
  }

  validSelectableFeatures(active: ActiveFeatureState[], exclude?: Set<FeatureId>): FeatureDefinition[] {
    return Object.values(FEATURE_REGISTRY).filter((feature) => {
      if (!feature.selectable) {
        return false;
      }
      // If same feature already active and has exclusive tags, avoid duplicates.
      const alreadyActive = active.some((entry) => entry.id === feature.id);
      if (alreadyActive) {
        return false;
      }
      if (exclude && exclude.has(feature.id)) {
        return false;
      }
      return true;
    });
  }
}
