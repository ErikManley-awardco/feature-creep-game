import { describe, expect, it } from "vitest";
import { GameSession } from "../src/core/gameSession";
import { EventBus } from "../src/events/eventBus";

describe("GameSession", () => {
  it("increments tick deterministically and emits tick events", () => {
    const bus = new EventBus();
    const observed: number[] = [];

    bus.on("tick-advanced", (payload) => {
      observed.push(payload.tick);
    });

    const session = new GameSession("seed", bus);

    session.advanceTick(16);
    session.advanceTick(16);
    session.advanceTick(16);

    expect(session.state.tick).toBe(3);
    expect(session.state.elapsedMs).toBe(48);
    expect(observed).toEqual([1, 2, 3]);
  });
});
