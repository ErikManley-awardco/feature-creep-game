import { describe, expect, it } from "vitest";
import { applyControlAction, mapKeyToControlAction } from "../src/core/controls";
import { TURN_STEP_RADIANS } from "../src/core/direction";

describe("controls", () => {
  it("maps WASD to relative control actions", () => {
    expect(mapKeyToControlAction("a")).toBe("turn-left");
    expect(mapKeyToControlAction("d")).toBe("turn-right");
    expect(mapKeyToControlAction("w")).toBe("forward");
    expect(mapKeyToControlAction("s")).toBe("ignored");
  });

  it("rotates heading relative to current direction", () => {
    const start = 0;
    expect(applyControlAction(start, "turn-left")).toBeCloseTo(-TURN_STEP_RADIANS, 6);
    expect(applyControlAction(start, "turn-right")).toBeCloseTo(TURN_STEP_RADIANS, 6);
    expect(applyControlAction(start, "forward")).toBe(start);
  });
});
