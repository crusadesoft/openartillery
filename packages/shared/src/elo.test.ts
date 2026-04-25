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

  it("2v2 team placements: teammates tie and gain/lose symmetrically", () => {
    const out = computeEloUpdates({
      playerIds: ["a1", "a2", "b1", "b2"],
      ratings: [1200, 1200, 1200, 1200],
      placements: [0, 0, 1, 1],
    });
    // Same-team players have identical deltas.
    expect(out[0]!.delta).toBe(out[1]!.delta);
    expect(out[2]!.delta).toBe(out[3]!.delta);
    // Winning team gains; losing team loses.
    expect(out[0]!.delta).toBeGreaterThan(0);
    expect(out[2]!.delta).toBeLessThan(0);
    // Symmetric.
    const sum = out.reduce((s, u) => s + u.delta, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(2);
  });

  it("3v3 team placements behave like 2v2", () => {
    const out = computeEloUpdates({
      playerIds: ["a1", "a2", "a3", "b1", "b2", "b3"],
      ratings: [1200, 1200, 1200, 1200, 1200, 1200],
      placements: [0, 0, 0, 1, 1, 1],
    });
    expect(out[0]!.delta).toBe(out[1]!.delta);
    expect(out[1]!.delta).toBe(out[2]!.delta);
    expect(out[3]!.delta).toBe(out[4]!.delta);
    expect(out[0]!.delta).toBeGreaterThan(0);
    expect(out[5]!.delta).toBeLessThan(0);
  });

  it("team draw (all placements equal) is a no-op", () => {
    const out = computeEloUpdates({
      playerIds: ["a1", "a2", "b1", "b2"],
      ratings: [1200, 1200, 1200, 1200],
      placements: [0, 0, 0, 0],
    });
    for (const u of out) expect(u.delta).toBe(0);
  });
});
