import { describe, expect, it } from "vitest";
import { GameSession } from "../src/core/gameSession";
import { EventBus } from "../src/events/eventBus";

describe("GameSession gameplay", () => {
  it("moves forward at 8 cells per second", () => {
    const session = new GameSession("movement-seed", new EventBus());

    const startX = session.state.snake[0].x;
    session.advanceTick(1000 / 8);

    expect(session.state.snake[0].x).toBeGreaterThan(startX + 0.9);
    expect(session.state.snake[0].x).toBeLessThan(startX + 1.1);
  });

  it("dies on wall collision in bounded world", () => {
    const session = new GameSession("wall-seed", new EventBus());

    for (let i = 0; i < 30; i += 1) {
      session.advanceTick(1000 / 8);
      if (session.state.isGameOver) {
        break;
      }
    }

    expect(session.state.isGameOver).toBe(true);
    expect(session.state.deathCause).toBe("wall");
  });

  it("supports scoring and growth when food is consumed", () => {
    const session = new GameSession("food-seed", new EventBus());

    const initialLength = session.state.snake.length;
    const head = session.state.snake[0];
    session.state.food = { x: head.x + 0.2, y: head.y };

    session.advanceTick(1000 / 60);

    expect(session.state.score).toBe(1);
    expect(session.state.snake.length).toBeGreaterThan(initialLength);
  });
});
