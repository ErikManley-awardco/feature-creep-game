# Feature Creep - Complete Session Plan and Step-by-Step Implementation

Status: Approved
Date: 2026-04-30

## 1. Project Summary

Feature Creep is a cheeky snake survival game where a new random feature is added every 30 seconds of survival. The first target platform is web browser with a TypeScript game architecture optimized for rapid AI-assisted development in VS Code.

Primary outcomes:
- Deterministic gameplay simulation
- Reproducible seeded runs
- Safe random feature injection every 30 seconds
- Gameplay modifiers plus UI perturbations and input quirks in MVP
- Balancing target of 2-4 minute average survival
- AI-driven implementation workflow from design to validation

## 2. Key Decisions from This Session

- Platform: Web-first implementation
- Tech direction: TypeScript with a simple 2D rendering approach suitable for quick iteration
- Scope for MVP: Gameplay modifiers, UI modifiers, and input modifiers included from the start
- Balance target: 2-4 minute median survival range
- Agent strategy: Start with 4 core agents, then expand after MVP stability
- Out of scope for MVP: Multiplayer, cloud sync, account systems, monetization

## 3. Recommended Architecture

### 3.1 Runtime Domains

- Simulation Core
- Feature Engine
- Entity and Collision System
- Spawner System
- Presentation and UI Projection
- Telemetry and Analytics

### 3.2 Core Principles

- Determinism first: Fixed timestep simulation and seeded randomization
- Strict contracts: Clear boundaries and typed interfaces between systems
- Feature lifecycle ownership: Every feature defines add, tick, render overlay, expire, and cleanup behavior
- Safety by default: Incompatibility rules, chaos cap, and fallback feature path

### 3.3 Required Game Session State

- Seed
- Tick counter
- Elapsed time
- Snake state
- World state
- Active features
- Active modifiers
- Difficulty budget
- Telemetry counters
- Cause of death metadata

### 3.4 Event Bus Responsibilities

Simulation emits events such as:
- Tick advanced
- Food consumed
- Collision occurred
- Feature added
- Run ended

UI consumes read-only projection data and never mutates simulation state directly.

## 4. Feature Creep System Design

### 4.1 Feature Registry Contract

Each feature includes:
- Identifier
- Category
- Difficulty weight
- Incompatibility declarations
- Lifecycle hooks
- Cleanup logic

### 4.2 Scheduler Contract

- Trigger interval: Every 30 seconds of active survival
- Uses weighted random selection constrained by:
  - Incompatibility matrix
  - Max chaos cap
  - Difficulty progression controls
- If no valid feature exists, scheduler must choose a guaranteed-safe fallback feature

### 4.3 Lifecycle Hooks

- On add
- On tick
- On collision
- On render overlay
- On expire
- Cleanup

### 4.4 Safety Rules

- Mutual exclusion support for problematic feature pairings
- Concurrent chaos cap to prevent impossible runs
- Fallback feature must always remain selectable

## 5. MVP Content Scope

### 5.1 Baseline Gameplay

- Snake movement and growth
- Food spawning
- Walls and obstacle handling
- Collision and game-over handling
- Score and survival tracking

### 5.2 Starter Feature Pack

- Speed shift effects
- Control inversion
- Shrinking safe zone
- Moving obstacle or hazard
- Decoy food behavior
- Temporary vision obstruction

### 5.3 System Feature Pack

- HUD perturbations
- Timer jitter visuals
- Input quirks such as delay bursts or temporary constraints
- Map and hazard modifiers

### 5.4 Player Readability Requirements

- New feature announcement appears when creep occurs
- Countdown to next creep remains visible
- Feature effect description is concise and understandable

## 6. AI Agent Workflow (Minimal Set First)

### 6.1 Core Agents

- Integrator Agent
- Architect Agent
- Builder Agent
- QA-Playtest Agent

### 6.2 Ownership

- Integrator: Routing, milestone state, and handoff discipline
- Architect: Contracts, invariants, and scope boundaries
- Builder: Implementation and tests
- QA-Playtest: Determinism validation, safety validation, and balancing signal

### 6.3 Handoff Sequence

Integrator to Architect to Builder to QA-Playtest to Integrator decision

### 6.4 Governance Rules

- No silent scope expansion
- Builder cannot override architecture contracts without escalation
- QA blocks progression on determinism, cadence, or safety failures
- Integrator is source of truth for milestone readiness

### 6.5 Expansion Path After MVP

Add specialized agents for:
- Asset and UX polish
- Release and DevOps
- Documentation and runbooks

## 7. Verification and Quality Gates

The following checks are mandatory:

- Determinism check:
  - Same seed and same input stream produce same feature sequence and same death tick

- Cadence check:
  - One feature is injected exactly every 30 seconds of active survival

- Scheduler safety check:
  - Invalid or incompatible combinations are never selected
  - Fallback path is tested and proven

- Playability check:
  - Batch simulation indicates median survival in 2-4 minute target band

- UX clarity check:
  - Feature announcements and next-feature timer remain readable under active UI modifiers

- Agent process check:
  - A sample feature request can move end-to-end through all handoff stages with artifacts at each gate

## 8. Risk Register and Mitigation

1. Determinism drift due to non-deterministic logic
- Mitigation: integer-based simulation updates, controlled RNG access, deterministic tests in CI

2. Feature interference corrupting state
- Mitigation: strict lifecycle and cleanup contract, incompatibility declarations, integration tests for apply-expire-cleanup

3. Scheduler deadlock when no valid feature remains
- Mitigation: mandatory fallback feature and deadlock scenario tests

4. Performance collapse under stacked effects
- Mitigation: chaos cap, feature budgeting, frame-time telemetry

5. Survival time outside target range
- Mitigation: configurable tuning knobs and repeated seeded batch simulations

6. Input perturbations becoming frustrating
- Mitigation: cap disruption severity and validate with controlled playtests

7. Scope creep
- Mitigation: Integrator gatekeeping and explicit MVP boundary checks

8. Browser compatibility issues
- Mitigation: test early on multiple browsers and keep rendering path simple

## 9. Step-by-Step Implementation Plan

Step 0 - Setup and Alignment
1. Initialize project repository and TypeScript web app foundation.
2. Document product rules, feature cadence, scope boundaries, and balancing target.
3. Confirm deterministic architecture and acceptance gates before coding.

Step 1 - Deterministic Core Foundation
1. Implement fixed timestep loop.
2. Implement seeded random utility.
3. Create Game Session state model.
4. Add event bus for simulation events.
5. Add deterministic tests for repeatability.

Step 2 - Baseline Snake Gameplay
1. Implement snake movement and direction buffering.
2. Implement food spawning and growth behavior.
3. Implement wall and self-collision rules.
4. Add score and game-over summary.
5. Confirm playable baseline run.

Step 3 - Feature Registry and Scheduler
1. Define feature contract structure.
2. Build registry with initial curated feature list.
3. Implement 30-second scheduler based on active survival time.
4. Add incompatibility validation.
5. Add chaos cap and fallback path.
6. Write tests for cadence and selection safety.

Step 4 - Starter Gameplay Features
1. Implement core gameplay modifiers from starter pack.
2. Implement lifecycle and cleanup behavior per feature.
3. Run integration tests for stacked feature behavior.
4. Confirm deterministic replay still holds.

Step 5 - System Features (UI and Input)
1. Implement UI perturbation features.
2. Implement input quirk features.
3. Ensure readability and control remain fair enough for target run lengths.
4. Validate cleanup and state restoration behavior.

Step 6 - Telemetry and Balancing
1. Capture key run telemetry.
2. Build seeded batch simulation tool.
3. Evaluate median survival and outlier failure patterns.
4. Tune feature weights and baseline difficulty knobs.
5. Re-run simulations until within target range.

Step 7 - UX Clarity and Polish
1. Add feature-added announcements.
2. Add countdown to next feature creep.
3. Ensure high readability under UI perturbations.
4. Improve game-over summary and replay clarity.

Step 8 - Release Preparation
1. Build production artifact.
2. Finalize runbook for local run, test, and tuning.
3. Freeze MVP and create backlog for post-MVP features.

## 10. Suggested 72-Hour Kickoff (Solo Developer)

Day 1:
- Complete deterministic core and baseline snake loop
- Validate deterministic tests and baseline playability

Day 2:
- Complete scheduler, safety constraints, and feature packs
- Validate compatibility behavior and cadence tests

Day 3:
- Run balancing simulations and tune parameters
- Add UX clarity polish and produce build artifact

## 11. Deliverables Checklist

- Modular game codebase with deterministic architecture
- Feature registry and 30-second scheduler with safety constraints
- Gameplay plus system feature sets for MVP
- Deterministic and safety test suites
- Telemetry and balancing simulation support
- Polished in-game messaging for feature creep readability
- Buildable release artifact

## 12. Agent Prompt Templates (Ready to Use)

Integrator prompt intent:
- Build milestone map, assign ownership, enforce handoffs, and track blockers

Architect prompt intent:
- Produce detailed subsystem contracts, invariants, and Builder-ready acceptance criteria

Builder prompt intent:
- Implement MVP code and tests according to contracts

QA-Playtest prompt intent:
- Validate determinism, cadence, safety, and balance; produce go or no-go decision

## 13. Next Action

Start with Integrator and Architect outputs, then execute Builder implementation, then QA-Playtest validation loop until all gates pass.
