import { describe, expect, it } from "vitest";
import { SeededRng } from "../src/core/seededRng";

describe("SeededRng", () => {
  it("produces identical sequences for identical seeds", () => {
    const a = new SeededRng("same-seed");
    const b = new SeededRng("same-seed");

    const resultsA = Array.from({ length: 20 }, () => a.nextInt(0, 1000));
    const resultsB = Array.from({ length: 20 }, () => b.nextInt(0, 1000));

    expect(resultsA).toEqual(resultsB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new SeededRng("seed-a");
    const b = new SeededRng("seed-b");

    const resultsA = Array.from({ length: 20 }, () => a.nextInt(0, 1000));
    const resultsB = Array.from({ length: 20 }, () => b.nextInt(0, 1000));

    expect(resultsA).not.toEqual(resultsB);
  });
});
