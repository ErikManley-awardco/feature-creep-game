export type GameEventMap = {
  "tick-advanced": { tick: number };
  "food-consumed": { tick: number; score: number; foodX: number; foodY: number };
  collision: { tick: number; cause: string };
  "feature-added": { tick: number; featureId: string };
  "feature-removed": { tick: number; featureId: string };
  "feature-choice-offered": { tick: number; options: string[] };
  "feature-choice-expired": { tick: number; defaultFeatureId: string };
  "run-ended": { tick: number; cause: string };
  "leaderboard-updated": { bestScore: number; entries: number };
};

type EventKey = keyof GameEventMap;
type Handler<T extends EventKey> = (payload: GameEventMap[T]) => void;

export class EventBus {
  private handlers = new Map<EventKey, Set<Handler<any>>>();

  on<T extends EventKey>(event: T, handler: Handler<T>): () => void {
    const existing = this.handlers.get(event) ?? new Set();
    existing.add(handler as Handler<any>);
    this.handlers.set(event, existing);

    return () => {
      existing.delete(handler as Handler<any>);
      if (existing.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  emit<T extends EventKey>(event: T, payload: GameEventMap[T]): void {
    const handlers = this.handlers.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }
}
