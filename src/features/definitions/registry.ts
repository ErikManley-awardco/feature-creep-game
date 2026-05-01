import type { FeatureContext, FeatureDefinition, FeatureId, ObstacleRingOptions } from "../types";

const DEFAULT_OBSTACLE_OPTIONS: ObstacleRingOptions = {
  margin: 3,
  count: 7,
};

const MIN_SNAKE_DISTANCE_UNITS = 3;

function clearObstacles(context: FeatureContext): void {
  context.state.obstacles = [];
}

function addModifier(context: FeatureContext, modifier: string): void {
  if (!context.state.activeModifiers.includes(modifier)) {
    context.state.activeModifiers.push(modifier);
  }
}

function removeModifier(context: FeatureContext, modifier: string): void {
  context.state.activeModifiers = context.state.activeModifiers.filter((entry) => entry !== modifier);
}

function setObstacleRing(context: FeatureContext, options = DEFAULT_OBSTACLE_OPTIONS): void {
  const { width, height } = context.state.world;
  const rectangles: FeatureContext["state"]["obstacles"] = [];

  for (let i = 0; i < options.count; i += 1) {
    const rectWidth = 1 + context.randomInt(0, 4);
    const rectHeight = 1 + context.randomInt(0, 3);
    let placed = false;

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = options.margin + context.randomInt(0, Math.max(1, width - options.margin * 2 - rectWidth));
      const y = options.margin + context.randomInt(0, Math.max(1, height - options.margin * 2 - rectHeight));
      const rect = { x, y, width: rectWidth, height: rectHeight };

      const tooCloseToSnake = context.state.snake.some((segment) => {
        const nearestX = Math.max(rect.x, Math.min(segment.x, rect.x + rect.width));
        const nearestY = Math.max(rect.y, Math.min(segment.y, rect.y + rect.height));
        const dx = segment.x - nearestX;
        const dy = segment.y - nearestY;
        return Math.hypot(dx, dy) < MIN_SNAKE_DISTANCE_UNITS;
      });
      if (tooCloseToSnake) {
        continue;
      }

      const overlapsFood =
        context.state.food.x >= rect.x &&
        context.state.food.x <= rect.x + rect.width &&
        context.state.food.y >= rect.y &&
        context.state.food.y <= rect.y + rect.height;
      if (overlapsFood) {
        continue;
      }

      const overlapsExisting = rectangles.some((existing) => {
        return !(
          rect.x + rect.width < existing.x ||
          rect.x > existing.x + existing.width ||
          rect.y + rect.height < existing.y ||
          rect.y > existing.y + existing.height
        );
      });
      if (overlapsExisting) {
        continue;
      }

      rectangles.push(rect);
      placed = true;
      break;
    }

    if (!placed) {
      continue;
    }
  }

  context.state.obstacles = rectangles;
}

function portalPointInBounds(value: number, maxExclusive: number): number {
  return Math.max(2, Math.min(maxExclusive - 2, value));
}

export const FEATURE_REGISTRY: Record<FeatureId, FeatureDefinition> = {
  "fallback-stabilizer": {
    id: "fallback-stabilizer",
    name: "Stabilizer",
    icon: "STB",
    description: "No gameplay change. Keeps cadence stable when no other features are available.",
    tags: ["utility"],
    replaceOnTagConflict: false,
    selectable: false,
    apply: () => {
      // Intentionally mild no-op fallback to avoid deadlocks.
    },
    remove: () => {
      // No cleanup needed.
    },
  },
  "speed-boost": {
    id: "speed-boost",
    name: "Speed Boost",
    icon: "SPD+",
    description: "Increases snake movement speed.",
    selectionStrength: 0.75,
    tags: ["speed"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      context.state.speedMultiplier = 1.35;
    },
    remove: (context) => {
      context.state.speedMultiplier = 1;
    },
  },
  "speed-slow": {
    id: "speed-slow",
    name: "Speed Slow",
    icon: "SPD-",
    description: "Reduces snake movement speed.",
    tags: ["speed"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      context.state.speedMultiplier = 0.75;
    },
    remove: (context) => {
      context.state.speedMultiplier = 1;
    },
  },
  "speed-control": {
    id: "speed-control",
    name: "Speed Control",
    icon: "CTRL",
    description: "Hold W to accelerate and hold S to slow down.",
    selectionStrength: 0.85,
    tags: ["input-speed"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "speed-control");
    },
    remove: (context) => {
      removeModifier(context, "speed-control");
    },
  },
  "delayed-input-queue": {
    id: "delayed-input-queue",
    name: "Delayed Input Queue",
    icon: "DLYQ",
    description: "Steering commands execute with a short delay.",
    selectionStrength: 0.8,
    tags: ["input-model"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "delayed-input-queue");
    },
    remove: (context) => {
      removeModifier(context, "delayed-input-queue");
    },
  },
  "keyboard-scramble": {
    id: "keyboard-scramble",
    name: "Keyboard Scramble",
    icon: "KEY?",
    description: "Steering keys periodically swap their behavior.",
    selectionStrength: 0.7,
    tags: ["input-model"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "keyboard-scramble");
    },
    remove: (context) => {
      removeModifier(context, "keyboard-scramble");
    },
  },
  "drift-turn": {
    id: "drift-turn",
    name: "Drift Turn",
    icon: "DRFT",
    description: "Turns curve with steering inertia instead of snapping instantly.",
    tags: ["turning-model"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "drift-turn");
    },
    remove: (context) => {
      removeModifier(context, "drift-turn");
    },
  },
  "mouse-control": {
    id: "mouse-control",
    name: "Mouse Control",
    icon: "MSE",
    description: "Snake steers toward the mouse pointer with a turn radius.",
    tags: ["turning-model", "trajectory-force"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "mouse-control");
    },
    remove: (context) => {
      removeModifier(context, "mouse-control");
    },
  },
  "no-walls-infinite": {
     id: "no-walls-infinite",
     name: "Wall Wrap",
     icon: "OPEN",
     description: "Wraps through arena edges and ignores obstacle collisions.",
     selectionStrength: 0.65,
     tags: ["world-boundary"],
     replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      context.state.world.mode = "infinite";
      context.state.world.hasWalls = false;
    },
    remove: (context) => {
      context.state.world.mode = "bounded";
      context.state.world.hasWalls = true;
    },
  },
  "mirror-world": {
    id: "mirror-world",
    name: "Mirror World",
    icon: "MIRR",
    description: "Left and right turn inputs are mirrored.",
    tags: ["input-direction"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "mirror-world");
    },
    remove: (context) => {
      removeModifier(context, "mirror-world");
    },
  },
  "inverted-arena-tilt": {
    id: "inverted-arena-tilt",
    name: "Inverted Arena Tilt",
    icon: "TILT",
    description: "The arena slowly rotates visually while controls remain world-absolute.",
    selectionStrength: 0.63,
    tags: ["visual-filter"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "inverted-arena-tilt");
    },
    remove: (context) => {
      removeModifier(context, "inverted-arena-tilt");
    },
  },
  "gravity-field": {
    id: "gravity-field",
    name: "Gravity Field",
    icon: "GRAV",
    description: "A directional force nudges the snake and food each tick.",
    selectionStrength: 0.7,
    tags: ["world-force", "trajectory-force"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "gravity-field");
    },
    remove: (context) => {
      removeModifier(context, "gravity-field");
    },
  },
  "moving-walls": {
     id: "moving-walls",
     name: "Moving Walls",
     icon: "WALL",
     description: "Arena boundaries shift inward and outward over time.",
     tags: ["world-boundary"],
     replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "moving-walls");
    },
    remove: (context) => {
      removeModifier(context, "moving-walls");
    },
  },
  "elastic-walls": {
    id: "elastic-walls",
    name: "Elastic Walls",
    icon: "BNCY",
    description: "Arena walls bounce you back and deduct score.",
    selectionStrength: 0.65,
    tags: ["world-boundary"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      context.state.world.mode = "bounded";
      context.state.world.hasWalls = true;
      addModifier(context, "elastic-walls");
    },
    remove: (context) => {
      removeModifier(context, "elastic-walls");
    },
  },
  "wind-tunnel": {
    id: "wind-tunnel",
    name: "Wind Tunnel",
    icon: "WIND",
    description: "Periodic gusts push movement sideways.",
    selectionStrength: 0.72,
    tags: ["world-force"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "wind-tunnel");
    },
    remove: (context) => {
      removeModifier(context, "wind-tunnel");
    },
  },
  "conveyor-lanes": {
    id: "conveyor-lanes",
    name: "Conveyor Lanes",
    icon: "LNES",
    description: "Horizontal lane belts shift entities sideways.",
    selectionStrength: 0.68,
    tags: ["world-force"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "conveyor-lanes");
    },
    remove: (context) => {
      removeModifier(context, "conveyor-lanes");
    },
  },
  "shrinking-safe-zone": {
    id: "shrinking-safe-zone",
    name: "Shrinking Safe Zone",
    icon: "ZONE",
    description: "Score drains when outside the shrinking safe circle.",
    selectionStrength: 0.65,
    tags: ["world-rule"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "shrinking-safe-zone");
    },
    remove: (context) => {
      removeModifier(context, "shrinking-safe-zone");
    },
  },
  "time-dilation-burst": {
    id: "time-dilation-burst",
    name: "Time Dilation Burst",
    icon: "TIME",
    description: "Gameplay alternates between slow and fast phases.",
    selectionStrength: 0.6,
    tags: ["time-rule"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "time-dilation-burst");
    },
    remove: (context) => {
      removeModifier(context, "time-dilation-burst");
    },
  },
  "obstacle-ring": {
    id: "obstacle-ring",
    name: "Obstacle Field",
    icon: "OBST",
    description: "Spawns random rectangular obstacles away from the snake.",
    selectionStrength: 0.6,
    tags: ["obstacles"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      setObstacleRing(context);
    },
    remove: (context) => {
      clearObstacles(context);
    },
  },
  "crumble-blocks": {
    id: "crumble-blocks",
    name: "Crumble Blocks",
    icon: "CRMB",
    description: "Obstacle blocks periodically crumble and respawn in new locations.",
    selectionStrength: 0.7,
    tags: ["obstacles-dynamic"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "crumble-blocks");
      setObstacleRing(context, { margin: 2, count: 8 });
    },
    remove: (context) => {
      removeModifier(context, "crumble-blocks");
      clearObstacles(context);
    },
  },
  "domino-blocks": {
    id: "domino-blocks",
    name: "Domino Blocks",
    icon: "DMNO",
    description: "Obstacle blocks shift in cascading waves and become moving hazards.",
    selectionStrength: 0.62,
    tags: ["obstacles-dynamic"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "domino-blocks");
      setObstacleRing(context, { margin: 2, count: 9 });
    },
    remove: (context) => {
      removeModifier(context, "domino-blocks");
      clearObstacles(context);
    },
  },
  "laser-sweep": {
    id: "laser-sweep",
    name: "Laser Sweep",
    icon: "LASR",
    description: "A dashed laser wall sweeps across the arena and destroys on contact.",
    selectionStrength: 0.62,
    tags: ["hazard-line"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "laser-sweep");
    },
    remove: (context) => {
      removeModifier(context, "laser-sweep");
    },
  },
  "rotating-laser-fan": {
    id: "rotating-laser-fan",
    name: "Rotating Laser Fan",
    icon: "FAN!",
    description: "Multiple laser arms rotate around arena center.",
    selectionStrength: 0.62,
    tags: ["hazard-line"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "rotating-laser-fan");
    },
    remove: (context) => {
      removeModifier(context, "rotating-laser-fan");
    },
  },
  "minefield": {
    id: "minefield",
    name: "Minefield",
    icon: "MINE",
    description: "Hidden mines reveal only when nearby and explode on contact.",
    selectionStrength: 0.45,
    tags: ["hazard-mines"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "minefield");
      context.state.minefield = [];
      const count = 10;
      for (let i = 0; i < count; i += 1) {
        context.state.minefield.push({
          x: 2 + context.randomInt(0, Math.max(2, context.state.world.width - 4)),
          y: 2 + context.randomInt(0, Math.max(2, context.state.world.height - 4)),
        });
      }
    },
    remove: (context) => {
      removeModifier(context, "minefield");
      context.state.minefield = [];
    },
  },
  "chaser-orb": {
    id: "chaser-orb",
    name: "Chaser Orb",
    icon: "CHSR",
    description: "An immortal orb slowly follows your head path.",
    selectionStrength: 0.6,
    tags: ["hazard-orb"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "chaser-orb");
      context.state.chaserOrb = {
        x: context.state.snake[0].x - 6,
        y: context.state.snake[0].y,
      };
    },
    remove: (context) => {
      removeModifier(context, "chaser-orb");
      context.state.chaserOrb = null;
    },
  },
  "enemy-orb": {
    id: "enemy-orb",
    name: "Enemy Orb",
    icon: "ENMY",
    description: "A hunter orb tracks you and periodically fires projectiles.",
    selectionStrength: 0.55,
    tags: ["hazard-orb"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "enemy-orb");
      context.state.enemyOrb = {
        x: Math.max(2, context.state.snake[0].x - 8),
        y: context.state.snake[0].y,
      };
      context.state.enemyProjectiles = [];
    },
    remove: (context) => {
      removeModifier(context, "enemy-orb");
      context.state.enemyOrb = null;
      context.state.enemyProjectiles = [];
    },
  },
  "portal-pair": {
    id: "portal-pair",
    name: "Portal Pair",
    icon: "PRTL",
    description: "Two linked portals teleport the snake between distant points.",
    selectionStrength: 0.6,
    tags: ["world-layout"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "portal-pair");
      const maxX = context.state.world.width;
      const maxY = context.state.world.height;
      context.state.portalPair = {
        a: {
          x: portalPointInBounds(context.randomInt(3, Math.max(4, Math.floor(maxX / 2))), maxX),
          y: portalPointInBounds(context.randomInt(3, Math.max(4, maxY - 3)), maxY),
        },
        b: {
          x: portalPointInBounds(context.randomInt(Math.max(4, Math.floor(maxX / 2)), Math.max(5, maxX - 3)), maxX),
          y: portalPointInBounds(context.randomInt(3, Math.max(4, maxY - 3)), maxY),
        },
      };
    },
    remove: (context) => {
      removeModifier(context, "portal-pair");
      context.state.portalPair = null;
    },
  },
  "food-evade": {
    id: "food-evade",
    name: "Runaway Food",
    icon: "FOOD",
    description: "Food moves away from the snake and tries to evade capture.",
    tags: ["food-behavior"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "food-evade");
    },
    remove: (context) => {
      removeModifier(context, "food-evade");
    },
  },
  "spawning-food": {
    id: "spawning-food",
    name: "Spawning Food",
    icon: "SPWN",
    description: "Additional food buds appear over time and can be eaten for points.",
    selectionStrength: 0.7,
    tags: ["food-spawn"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "spawning-food");
      context.state.bonusFoods = [];
    },
    remove: (context) => {
      removeModifier(context, "spawning-food");
      context.state.bonusFoods = [];
    },
  },
  "magnet-food": {
    id: "magnet-food",
    name: "Magnet Food",
    icon: "MGNT",
    description: "Food exerts pull on hazards and nearby hostile entities.",
    selectionStrength: 0.6,
    tags: ["food-behavior"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "magnet-food");
    },
    remove: (context) => {
      removeModifier(context, "magnet-food");
    },
  },
  "gravity-wells": {
    id: "gravity-wells",
    name: "Gravity Wells",
    icon: "WELL",
    description: "Moving wells bend movement trajectories and projectile paths.",
    selectionStrength: 0.6,
    tags: ["world-force"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "gravity-wells");
    },
    remove: (context) => {
      removeModifier(context, "gravity-wells");
    },
  },
  "jackpot-fruit": {
    id: "jackpot-fruit",
    name: "Jackpot Fruit",
    icon: "JACK",
    description: "Rare food gives bonus points and clears nearby hazards.",
    selectionStrength: 0.58,
    tags: ["food-reward"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "jackpot-fruit");
    },
    remove: (context) => {
      removeModifier(context, "jackpot-fruit");
    },
  },
  "spoiling-food": {
    id: "spoiling-food",
    name: "Spoiling Food",
    icon: "ROTN",
    description: "Food rots over time, becomes harmful, then despawns.",
    selectionStrength: 0.62,
    tags: ["food-state"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "spoiling-food");
    },
    remove: (context) => {
      removeModifier(context, "spoiling-food");
    },
  },
  "psychedelic-shader": {
    id: "psychedelic-shader",
    name: "Psychedelic Spiral",
    icon: "TRIP",
    description: "A translucent swirling rainbow washes over the arena like a live shader.",
    selectionStrength: 0.55,
    tags: ["visual-filter"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "psychedelic-shader");
    },
    remove: (context) => {
      removeModifier(context, "psychedelic-shader");
    },
  },
  "charged-food": {
    id: "charged-food",
    name: "Charged Food",
    icon: "CHRG",
    description: "Food alternates between safe and dangerous states.",
    tags: ["food-state"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: (context) => {
      addModifier(context, "charged-food");
    },
    remove: (context) => {
      removeModifier(context, "charged-food");
    },
  },
  "combo-food": {
    id: "combo-food",
    name: "Combo Food",
    icon: "COMB",
    description: "Eat food quickly in sequence to gain bonus points.",
    selectionStrength: 0.7,
    tags: ["food-scoring"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "combo-food");
    },
    remove: (context) => {
      removeModifier(context, "combo-food");
    },
  },
  taxation: {
    id: "taxation",
    name: "Taxation",
    icon: "TAX",
    description: "Score decays over time unless you keep eating.",
    tags: ["score-rule"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "taxation");
    },
    remove: (context) => {
      removeModifier(context, "taxation");
    },
  },
  "fragile-body": {
    id: "fragile-body",
    name: "Fragile Body",
    icon: "FRAG",
    description: "Tail decays over time unless food is collected.",
    tags: ["body-rule"],
    replaceOnTagConflict: false,
    selectable: true,
    apply: (context) => {
      addModifier(context, "fragile-body");
    },
    remove: (context) => {
      removeModifier(context, "fragile-body");
    },
  },
  "feature-choice-mode": {
    id: "feature-choice-mode",
    name: "Design Review",
    icon: "CHOI",
    description: "Future feature drops offer three choices instead of random assignment.",
    selectionStrength: 2.4,
    tags: ["selection-mode"],
    replaceOnTagConflict: true,
    selectable: true,
    apply: () => {
      // Enables 3-option selection flow while active.
    },
    remove: () => {
      // Selection flow naturally falls back to random.
    },
  },
};
