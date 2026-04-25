import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export type MatchPhase = "waiting" | "countdown" | "playing" | "ended";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") userId = ""; // empty for guests
  @type("string") name = "";
  @type("boolean") bot = false;
  @type("string") difficulty = ""; // for bots: "easy" | "normal" | ...
  @type("number") mmr = 1200;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") angle = 0;
  @type("number") hp = 300;
  @type("number") fuel = 100;
  @type("number") power = 0;
  @type("boolean") charging = false;
  @type("string") weapon = "shell";
  @type("number") kills = 0;
  @type("number") deaths = 0;
  @type("number") damageDealt = 0;
  @type("number") shotsFired = 0;
  @type("boolean") ready = false;
  @type("boolean") dead = false;
  @type("boolean") connected = true;
  @type("number") color = 0xffffff;
  @type("number") accentColor = 0xffd25e;
  @type("string") bodyStyle = "heavy";
  @type("string") turretStyle = "standard";
  @type("string") barrelStyle = "standard";
  @type("string") pattern = "solid";
  @type("string") decal = "none";
  @type("number") patternColor = 0x1a140c;
  @type("number") facing = 1; // -1 or 1
  /** 0 = unassigned (FFA / non-team mode), 1 = team A, 2 = team B. */
  @type("uint8") team = 0;
  /** Remaining rounds per weapon. Unlimited weapons don't appear here. */
  @type({ map: "number" }) ammo = new MapSchema<number>();
  /** Remaining charges per utility item. Items absent from the map are out. */
  @type({ map: "number" }) items = new MapSchema<number>();
  /** Unix ms; while > now, incoming damage is halved. 0 = no shield. */
  @type("number") shieldExpiresAt = 0;
}

export class Projectile extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("string") weapon = "shell";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") tint = 0xffffff;
  @type("number") radius = 4;
}

export class FireTile extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") radius = 18;
  /** unix ms when the tile expires */
  @type("number") expiresAt = 0;
}

export class TerrainState extends Schema {
  @type("number") width = 0;
  @type("number") seed = 0;
  /** heights[x] = distance from top (smaller = taller terrain peak). */
  @type(["number"]) heights = new ArraySchema<number>();
}

export class BattleState extends Schema {
  @type("string") phase: MatchPhase = "waiting";
  @type("string") mode = "ffa";
  @type("string") biome = "grasslands";
  @type("string") inviteCode = ""; // only set for private rooms
  @type("string") lobbyName = "";
  @type("string") visibility = "public"; // "public" | "private"
  @type("boolean") ranked = false;
  @type("string") hostSessionId = "";
  @type("number") maxPlayers = 6;
  /** True until match start: biome is a mystery that re-rolls when the match begins. */
  @type("boolean") biomeRandom = false;
  /** Host set a password on the room; joiners must supply it. */
  @type("boolean") hasPassword = false;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: FireTile }) fires = new MapSchema<FireTile>();
  @type(TerrainState) terrain = new TerrainState();
  @type("string") currentTurnId = "";
  @type("number") turnEndsAt = 0;
  @type("number") wind = 0;
  @type("number") roundStartsAt = 0;
  @type("string") winnerId = "";
  /** Set when team mode ends with a clear winning team. "" for FFA, draw, or in-progress. */
  @type("string") winnerTeam = "";
  @type("boolean") teamMode = false;
  /** Number of distinct teams in team mode (2..4). 0 outside team mode. */
  @type("uint8") teamCount = 0;
  /** Splash damage on allies. Defaults true to match FFA semantics; only togglable in custom team lobbies. */
  @type("boolean") friendlyFire = true;
  @type("number") matchStartedAt = 0;
  @type("number") matchEndedAt = 0;
  @type("number") turnNumber = 0;
  // Host-tweakable match settings applied when the match starts.
  @type("number") turnDurationSec = 30;
  @type("number") fuelPerTurn = 100;
  @type("number") startingHp = 300;
  @type("number") windMax = 25;
}
