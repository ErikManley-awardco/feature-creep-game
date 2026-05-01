import { describe, expect, it } from "vitest";
import { FixedTimestepLoop } from "../src/core/fixedTimestepLoop";

describe("FixedTimestepLoop", () => {
  it("executes expected tick count for a given frame delta", () => {
    let ticks = 0;
    const loop = new FixedTimestepLoop(16, () => {
      ticks += 1;
    });

    const executed = loop.advance(50);

    expect(executed).toBe(3);
    expect(ticks).toBe(3);
  });

  it("retains partial frame time between calls", () => {
    let ticks = 0;
    const loop = new FixedTimestepLoop(10, () => {
      ticks += 1;
    });

    loop.advance(7);
    const second = loop.advance(7);

    expect(second).toBe(1);
    expect(ticks).toBe(1);
  });
});
