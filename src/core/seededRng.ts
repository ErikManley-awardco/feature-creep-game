export class SeededRng {
  private state: number;

  constructor(seed: string) {
    this.state = SeededRng.hashString(seed);
  }

  nextFloat(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) {
      throw new Error("maxExclusive must be greater than minInclusive");
    }

    const range = maxExclusive - minInclusive;
    return minInclusive + Math.floor(this.nextFloat() * range);
  }

  private static hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }
}
