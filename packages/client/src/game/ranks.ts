/** Rank tier definitions — shared between ProfilePage and LeaderboardPage.
 *  The hex colors match the --rank-* CSS tokens in styles/semantic.css. */
export interface Rank {
  name: string;
  min: number;
  next: number;
  color: string;
  icon: string;
}

export const RANKS: Rank[] = [
  { name: "Recruit",    min: 0,    next: 900,  color: "#8a8477", icon: "/icons/ranks/shield.svg" },
  { name: "Private",    min: 900,  next: 1100, color: "#a8a070", icon: "/icons/ranks/private.svg" },
  { name: "Corporal",   min: 1100, next: 1300, color: "#b8a050", icon: "/icons/ranks/corporal.svg" },
  { name: "Sergeant",   min: 1300, next: 1500, color: "#d49228", icon: "/icons/ranks/sergeant.svg" },
  { name: "Lieutenant", min: 1500, next: 1700, color: "#e07845", icon: "/icons/ranks/lieutenant.svg" },
  { name: "Captain",    min: 1700, next: 1900, color: "#e85c25", icon: "/icons/ranks/captain.svg" },
  { name: "Major",      min: 1900, next: 2100, color: "#c03a3a", icon: "/icons/ranks/major.svg" },
  { name: "Colonel",    min: 2100, next: 2400, color: "#9d2a7a", icon: "/icons/ranks/colonel.svg" },
  { name: "General",    min: 2400, next: 2400, color: "#ffd25e", icon: "/icons/ranks/general.svg" },
];

export function rankFor(mmr: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (mmr >= RANKS[i]!.min) return RANKS[i]!;
  }
  return RANKS[0]!;
}
