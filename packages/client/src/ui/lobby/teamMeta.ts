/** Display metadata for the four team slots. Keep in sync with the
 *  server's TEAM_PALETTES — the tint should match the dominant hue
 *  of the corresponding palette. */
export const TEAM_META = [
  null,
  { label: "Team A", tint: "#ff9d5e" },
  { label: "Team B", tint: "#5ecfff" },
  { label: "Team C", tint: "#8aff5e" },
  { label: "Team D", tint: "#cf5eff" },
] as const;

export function teamLabel(team: number): string {
  return TEAM_META[team]?.label ?? `Team ${team}`;
}

export function teamTint(team: number): string {
  return TEAM_META[team]?.tint ?? "var(--ink-faint)";
}
