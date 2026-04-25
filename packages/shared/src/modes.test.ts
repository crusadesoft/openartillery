import { describe, it, expect } from "vitest";
import { ALL_MODES, MODES, isGameMode } from "./modes.js";

describe("MODES registry", () => {
  it("only ships custom / private / bots — no separate ranked queues", () => {
    expect(ALL_MODES.sort()).toEqual(["bots", "custom", "private"]);
    expect(Object.keys(MODES).sort()).toEqual(["bots", "custom", "private"]);
  });

  it("custom mode supports up to 8 players for team layouts", () => {
    expect(MODES.custom.maxPlayers).toBe(8);
    expect(MODES.custom.minPlayers).toBe(2);
  });

  it("isGameMode accepts only the lobby modes", () => {
    expect(isGameMode("custom")).toBe(true);
    expect(isGameMode("private")).toBe(true);
    expect(isGameMode("bots")).toBe(true);
    expect(isGameMode("ffa")).toBe(false);
    expect(isGameMode("teams2v2")).toBe(false);
  });
});
