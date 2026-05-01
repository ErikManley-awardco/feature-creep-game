# Feature Creep Game Spec

## Scope
- Web-first TypeScript game.
- Deterministic simulation with seeded behavior.
- New random valid feature injected every 30 seconds of active survival.
- Base game starts as classic snake with border walls only.

## MVP In Scope
- Baseline snake gameplay loop.
- Gameplay modifiers.
- UI perturbations.
- Input quirks.
- Feature-ready support for switching from bounded arena to infinite arena with camera follow.

## MVP Out of Scope
- Multiplayer.
- Cloud save or sync.
- Account systems.
- Monetization.

## Quality Gates
- Determinism: same seed + same input stream = same feature sequence and death tick.
- Cadence: feature injection every 30 seconds.
- Safety: incompatibility and fallback rules hold.
- Balance target: median survival 2-4 minutes.

## Base Gameplay Rules
- Grid: 20px cells.
- Movement speed: 8 cells per second.
- Input: WASD control scheme with relative turning model.
- Turn behavior: turns are relative to current heading to support future alternate steering modes.
- Reversal rule: 180-degree reversal is blocked.
- Key reservation: S is intentionally left free for future feature-specific interactions.
- Snake moves forward continuously at constant speed.
- Death conditions:
	- collision with border wall (default bounded mode)
	- collision with tail
	- collision with obstacles (when obstacle features are active)
- Score:
	- gain 1 point for each food consumed
	- snake grows by one segment on food consumption
- Game over:
	- run ends on death
	- score is recorded to leaderboard
	- leaderboard stores top 10 all-time local scores

## Arena Mode Rule
- Default world mode is bounded with border walls.
- Future feature can disable walls and enable infinite arena mode.
- In infinite mode, camera follows the snake and wall collision is not evaluated.

## Step 3 Feature Selection and Conflict Rules
- Default behavior: scheduler randomly selects one valid feature every 30 seconds.
- Choice-mode behavior: if `feature-choice-mode` is active, scheduler offers 3 valid features and player selects one.
- Choice input: player can select with keyboard `1/2/3` or by clicking an option in the overlay.
- Pause rule: gameplay simulation pauses while feature selection overlay is open.
- Features do not decay by time once applied.
- Slot model: up to 10 active feature slots are available, each with its own icon.
- Full slots rule: if all 10 slots are full, player must choose one active feature slot to replace with the incoming feature.
- Skip rule: player may skip exactly one incoming feature per run while slots are full.
- Conflict system: features define tags; if a new feature conflicts by tag, it replaces the old active feature.
- Safety fallback: if no valid selectable feature exists, scheduler applies fallback stabilizer feature.
