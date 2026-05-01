export type TickHandler = (deltaMs: number) => void;

export class FixedTimestepLoop {
  private accumulatorMs = 0;

  constructor(
    private readonly stepMs: number,
    private readonly onTick: TickHandler,
  ) {
    if (stepMs <= 0) {
      throw new Error("stepMs must be positive");
    }
  }

  advance(frameDeltaMs: number): number {
    this.accumulatorMs += frameDeltaMs;

    let executedTicks = 0;
    while (this.accumulatorMs >= this.stepMs) {
      this.onTick(this.stepMs);
      this.accumulatorMs -= this.stepMs;
      executedTicks += 1;
    }

    return executedTicks;
  }
}
