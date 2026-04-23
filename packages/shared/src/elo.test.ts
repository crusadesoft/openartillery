import { describe, it, expect } from "vitest";
import { computeEloUpdates } from "./elo.js";

describe("computeEloUpdates", () => {
  it("returns zero delta for a 1-player match", () => {
    const out = computeEloUpdates({
      playerIds: ["a"],
      ratings: [1200],
      placements: [0],
    });
    expect(out[0]!.delta).toBe(0);
    expect(out[0]!.after).toBe(1200);
  });

  it("winner gains and loser loses for equal MMR 2-player", () => {
    const out = computeEloUpdates({
      playerIds: ["a", "b"],
      ratings: [1200, 1200],
      placements: [0, 1],
    });
    expect(out[0]!.delta).toBeGreaterThan(0);
    expect(out[1]!.delta).toBeLessThan(0);
    // Symmetric for equal rating matches.
    expect(out[0]!.delta + out[1]!.delta).toBe(0);
  });

  it("upset: weaker player beating stronger player gains more", () => {
    const easy = computeEloUpdates({
      playerIds: ["a", "b"],
      ratings: [1200, 1200],
      placements: [0, 1],
    });
    const upset = computeEloUpdates({
      playerIds: ["a", "b"],
      ratings: [1000, 1400],
      placements: [0, 1],
    });
    expect(upset[0]!.delta).toBeGreaterThan(easy[0]!.delta);
  });

  it("ties produce zero deltas for same-rating players", () => {
    const out = computeEloUpdates({
      playerIds: ["a", "b"],
      ratings: [1500, 1500],
      placements: [0, 0],
    });
    expect(out[0]!.delta).toBe(0);
    expect(out[1]!.delta).toBe(0);
  });

  it("3-player FFA sums to roughly zero", () => {
    const out = computeEloUpdates({
      playerIds: ["a", "b", "c"],
      ratings: [1200, 1200, 1200],
      placements: [0, 1, 2],
    });
    const sum = out.reduce((s, u) => s + u.delta, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(2); // rounding only
  });
});
