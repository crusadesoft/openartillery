export const DEFAULT_MMR = 1200;
const K_FACTOR = 32;

/**
 * Compute new MMR ratings for a finished match using per-pair Elo, averaged
 * against the opponent field. For N players, each player's new rating is
 * their current rating plus the sum of per-opponent Elo deltas, scaled by
 * 1/(N-1).
 *
 * `placements[i]` is the i-th player's ordinal finish (0 = first, ties allowed).
 */
export interface EloInput {
  playerIds: string[];
  ratings: number[];
  placements: number[];
}

export interface EloUpdate {
  playerId: string;
  before: number;
  after: number;
  delta: number;
}

export function computeEloUpdates(input: EloInput): EloUpdate[] {
  const { playerIds, ratings, placements } = input;
  const n = playerIds.length;
  if (n < 2) {
    return playerIds.map((id, i) => ({
      playerId: id,
      before: ratings[i]!,
      after: ratings[i]!,
      delta: 0,
    }));
  }
  const updates: EloUpdate[] = [];
  for (let i = 0; i < n; i++) {
    let deltaSum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ri = ratings[i]!;
      const rj = ratings[j]!;
      const expected = 1 / (1 + Math.pow(10, (rj - ri) / 400));
      const score =
        placements[i]! < placements[j]!
          ? 1
          : placements[i]! > placements[j]!
            ? 0
            : 0.5;
      deltaSum += K_FACTOR * (score - expected);
    }
    const delta = deltaSum / (n - 1);
    updates.push({
      playerId: playerIds[i]!,
      before: ratings[i]!,
      after: Math.round(ratings[i]! + delta),
      delta: Math.round(delta),
    });
  }
  return updates;
}
