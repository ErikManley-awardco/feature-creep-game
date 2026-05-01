import type { LeaderboardEntry } from "../types/game";

const STORAGE_KEY = "feature-creep-leaderboard";
const MAX_ENTRIES = 10;

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readLeaderboard(): LeaderboardEntry[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return parsed.filter((entry) => Number.isFinite(entry.score));
  } catch {
    return [];
  }
}

export function writeLeaderboard(entries: LeaderboardEntry[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function insertScore(
  entries: LeaderboardEntry[],
  entry: LeaderboardEntry,
): LeaderboardEntry[] {
  const updated = [...entries, entry].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return b.survivedTicks - a.survivedTicks;
  });

  return updated.slice(0, MAX_ENTRIES);
}
