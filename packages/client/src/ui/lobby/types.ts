export interface MatchSettings {
  turnDurationSec: number;
  fuelPerTurn: number;
  startingHp: number;
  maxWind: number;
}

export interface LobbyConfig {
  lobbyName: string;
  maxPlayers: number;
  biome: string;
  visibility: "public" | "private";
  password: string;
}
