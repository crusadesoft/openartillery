import { Client, Room } from "@colyseus/core";
import { randomBytes } from "crypto";
import {
  BattleState,
  BIOMES,
  type BiomeId,
  BOT_DIFFICULTY_SPECS,
  type BotDifficulty,
  CHAT_RATE_LIMIT,
  DEFAULT_LOADOUT,
  DEFAULT_MMR,
  MODES,
  NETWORK,
  Player,
  POST_MATCH_RECAP_MS,
  RECONNECT_GRACE_MS,
  type GameMode,
  type RoomJoinOptions,
  TANK,
  TURN,
  WORLD,
  WEAPONS,
  type WeaponId,
  ITEMS,
  type ItemId,
  ITEM_TUNING,
  TARGETED_ITEMS,
  randomBiome,
  downgradeSelection,
  resolveSelection,
  sanitizeSelection,
} from "@artillery/shared";
import { World, type Input as PlayerInput } from "../physics/World.js";
import { BotBrain } from "./Bot.js";
import { logger } from "../logger.js";
import { matchesFinished, matchesStarted } from "../metrics.js";
import { persistMatch } from "../match/persist.js";
import {
  TANK_COLORS,
  TEAM_PALETTES,
  clamp,
  generateInviteCode,
  pickBotName,
  rateAllow,
  resolveIdentity,
  rollWind,
  sanitizeLobbyName,
  shuffle,
} from "./battleRoomUtils.js";
import { BOT_LINES, pick } from "./botDialogue.js";
import { dispatchClientMessage, type MessageHandlers } from "./MessageDispatcher.js";

interface SessionMeta {
  input: PlayerInput;
  messages: number[];
  chats: number[];
  bot?: BotBrain;
}

interface RoomOptions extends RoomJoinOptions {
  createPrivate?: boolean;
}

export class BattleRoom extends Room<BattleState> {
  override maxClients = 6;

  private mode: GameMode = "custom";
  private world!: World;
  private sessions = new Map<string, SessionMeta>();
  private turnOrder: string[] = [];
  private turnIndex = 0;
  private nextTurnAt = 0;
  private simInterval?: NodeJS.Timeout;
  private readonly dt = 1 / NETWORK.TICK_HZ;
  private matchStartedAtMs = 0;
  private eventLog: Array<Record<string, unknown>> = [];
  private persisted = false;
  /** Scheduled auto-transition out of the `ended` recap phase.
   *  Casual rooms reset to `waiting`; ranked rooms let clients leave. */
  private postMatchTimer?: NodeJS.Timeout;
  /** true once the current turn's tank has fired — blocks spam. */
  private turnFired = false;
  /** Tracks the most recent shot until projectiles resolve, so we can
   *  fire a miss taunt if nobody got hit. `bot` distinguishes self-roast
   *  (bot whiffs) from peanut-gallery (human whiffs and a bot mocks). */
  private pendingShot: { id: string; bot: boolean; hit: boolean } | null = null;
  private initialOptions: RoomOptions = { mode: "custom", username: "Player" };
  /** Optional join gate for private rooms. Stored only on the instance —
   *  never written to state — so it doesn't leak through schema patches. */
  private password: string | null = null;
  /** Fresh custom lobbies seat one bot for the host's convenience, but
   *  only after the host themselves has taken a slot — so the roster
   *  reads "you, then bot" instead of "bot, then you". */
  private pendingDefaultBot = false;

  override async onCreate(options: RoomOptions = { mode: "custom", username: "Player" }) {
    this.initialOptions = options;
    const mode = (options.mode as GameMode) in MODES ? (options.mode as GameMode) : "custom";
    this.mode = mode;
    const spec = MODES[mode];
    // Every room is host-configurable now; ranked is a lobby toggle, not
    // a separate mode. Cap can be tweaked up to the mode spec's max.
    const casual = true;
    const requestedMax = casual ? Number(options.maxPlayers ?? spec.maxPlayers) : spec.maxPlayers;
    let maxPlayers = clamp(
      Number.isFinite(requestedMax) ? requestedMax : spec.maxPlayers,
      Math.max(2, spec.minPlayers),
      spec.maxPlayers,
    );
    this.maxClients = maxPlayers;

    const seed = Math.floor(Math.random() * 2 ** 31);
    const biome: BiomeId =
      (options.biome && options.biome in BIOMES
        ? (options.biome as BiomeId)
        : randomBiome());

    const visibility: "public" | "private" =
      options.visibility === "private" || mode === "private" ? "private" : "public";
    const lobbyName = sanitizeLobbyName(options.lobbyName, options.username);

    this.setState(new BattleState());
    this.setPatchRate(1000 / NETWORK.PATCH_HZ);
    this.world = new World(this.state, seed, biome);
    this.state.mode = mode;
    this.state.biome = biome;
    this.state.wind = rollWind();
    this.state.phase = "waiting";
    this.state.lobbyName = lobbyName;
    this.state.visibility = visibility;
    // `state.ranked` is a host-mutable lobby toggle. Defaults to off; the
    // host flips it from the lobby settings panel. Ranked rooms reject bots.
    this.state.ranked = options.ranked === true;
    this.state.maxPlayers = maxPlayers;

    if (options.teamMode) {
      this.state.teamMode = true;
      this.state.teamCount = clamp(Number(options.teamCount ?? 2), 2, 4);
      this.state.friendlyFire = options.friendlyFire ?? true;
    }

    if (casual) {
      // Every casual lobby gets an invite code so the matchmaker's
      // `filterBy(["mode","inviteCode"])` indexes it. Host flips
      // visibility later; the room shape stays the same. Public
      // lobbies still expose the code for easy sharing. Accept a
      // client-supplied code if one arrived (keeps the create/join
      // handshake intact), else generate server-side.
      const incoming = typeof options.inviteCode === "string"
        ? options.inviteCode.trim().toUpperCase()
        : "";
      this.state.inviteCode = /^[A-Z0-9]{4,10}$/.test(incoming)
        ? incoming
        : generateInviteCode();
      // Don't call `setPrivate(true)` — that would hide the room from
      // the matchmaker that `join("battle", { mode, inviteCode })`
      // uses to locate it. `filterBy` already means only a client with
      // the exact code can match.
    }
    this.refreshMetadata();

    // Preload bots for "bots" mode or for any casual lobby created with a botCount.
    // Fresh `custom` lobbies default to one bot so a solo host can jump
    // straight into a match; the host can remove it from the roster.
    if (casual && options.botCount != null) {
      const count = clamp(
        Number(options.botCount),
        0,
        maxPlayers - 1,
      );
      const diff = (options.botDifficulty ?? "normal") as BotDifficulty;
      for (let i = 0; i < count; i++) {
        this.addBot(diff);
      }
    } else if (mode === "bots") {
      const count = clamp(
        Number(options.botCount ?? spec.preloadedBots ?? 2),
        1,
        maxPlayers - 1,
      );
      const diff = (options.botDifficulty ?? "normal") as BotDifficulty;
      for (let i = 0; i < count; i++) {
        this.addBot(diff);
      }
    } else if (mode === "custom") {
      this.pendingDefaultBot = true;
    }

    this.onMessage("*", (client, kind, payload) => {
      const meta = this.sessions.get(client.sessionId);
      if (!meta) return;
      dispatchClientMessage(this as unknown as MessageHandlers, client, kind, payload, meta);
    });

    this.simInterval = setInterval(() => this.tick(), 1000 / NETWORK.TICK_HZ);
    this.simInterval.unref?.();

    logger.info(
      { mode, seed, biome, inviteCode: this.state.inviteCode || null },
      "room created",
    );
  }

  override onDispose(): void {
    if (this.simInterval) clearInterval(this.simInterval);
    if (this.postMatchTimer) clearTimeout(this.postMatchTimer);
    this.world.dispose();
  }

  override async onAuth(_client: Client, options: RoomOptions): Promise<boolean> {
    if (this.mode === "private" && options.inviteCode) {
      if (options.inviteCode !== this.state.inviteCode) {
        throw new Error("invalid invite code");
      }
    }
    if (this.state.visibility === "private" && this.password !== null) {
      const supplied = typeof options.password === "string" ? options.password : "";
      if (supplied !== this.password) {
        throw new Error("password required");
      }
    }
    return true;
  }

  override async onJoin(client: Client, options: RoomOptions): Promise<void> {
    const accountInfo = await resolveIdentity(options);
    const username =
      accountInfo?.username ||
      (options.username ?? "").trim().slice(0, 16) ||
      `Tank${this.state.players.size + 1}`;

    // Rejoin: if a registered user comes back to a match where their
    // userId already holds an afk slot, hand control back to them
    // instead of seating a new tank. Re-keys the slot to the new
    // sessionId so existing per-session checks (currentTurnId, host,
    // turnOrder) keep working.
    const incomingUserId = accountInfo?.userId ?? "";
    if (incomingUserId) {
      let afkSlot: Player | null = null;
      this.state.players.forEach((q) => {
        if (!afkSlot && q.afk && q.userId === incomingUserId) afkSlot = q;
      });
      if (afkSlot) {
        this.adoptAfkSlot(afkSlot, client.sessionId);
        return;
      }
    }

    // Once the match is live, only former participants (handled above)
    // may join. Casual + ranked lobbies in pre-match phases still
    // accept fresh joiners.
    if (this.state.phase === "playing" || this.state.phase === "countdown") {
      throw new Error("match in progress");
    }

    const p = new Player();
    p.id = client.sessionId;
    p.userId = accountInfo?.userId ?? "";
    p.name = username;
    p.bot = false;
    p.mmr = accountInfo?.mmr ?? DEFAULT_MMR;
    p.hp = this.state.startingHp > 0 ? this.state.startingHp : TANK.MAX_HP;
    p.fuel = this.state.fuelPerTurn >= 0 ? this.state.fuelPerTurn : TURN.FUEL_PER_TURN;
    p.weapon = DEFAULT_LOADOUT[0]!;
    // Default to team 0 ("?" — auto). Players pick their own team via
    // the lobby team box, or stay on ? and let startMatch auto-balance.
    p.team = 0;
    p.color = this.nextTankColor(p.team);
    p.angle = 45;
    // Selection source order: persisted server-side selection (authoritative
    // for authed users), then the client's localStorage copy in join
    // options. Premium tanks/decals the user doesn't own are silently
    // swapped for the default tank + "none" decal so an out-of-date
    // client can't visually wear something it didn't pay for.
    const rawSelection = sanitizeSelection(
      (accountInfo?.selection ?? (options as RoomJoinOptions).loadout) as
        | Record<string, unknown>
        | undefined,
    );
    const selection = downgradeSelection(
      rawSelection,
      accountInfo?.ownedSkus ?? new Set(),
    );
    const loadout = resolveSelection(selection);
    // Team mode locks tank color to the team palette so allies/enemies
    // are unmistakable at a glance. Other cosmetics still apply.
    if (!this.state.teamMode) {
      p.color = loadout.primaryColor || p.color;
    }
    p.accentColor = loadout.accentColor;
    p.bodyStyle = loadout.body;
    p.turretStyle = loadout.turret;
    p.barrelStyle = loadout.barrel;
    p.pattern = loadout.pattern;
    p.decal = loadout.decal;
    p.patternColor = loadout.patternColor;
    this.initAmmo(p);
    const spawnX = this.pickSpawnX(p);
    p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
    this.world.spawnTankAt(p, spawnX);
    this.state.players.set(client.sessionId, p);
    this.sessions.set(client.sessionId, {
      input: { left: false, right: false, up: false, down: false },
      messages: [],
      chats: [],
    });

    if (!this.state.hostSessionId) {
      this.state.hostSessionId = client.sessionId;
    }
    this.refreshMetadata();

    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: `${p.name} joined`,
      at: Date.now(),
    });
    this.logEvent({ kind: "join", id: p.id, name: p.name, userId: p.userId });

    if (this.pendingDefaultBot && this.state.players.size < this.state.maxPlayers) {
      this.pendingDefaultBot = false;
      this.addBot("normal");
    }
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    if (
      consented ||
      this.state.phase === "ended" ||
      this.state.phase === "waiting" ||
      this.state.phase === "countdown"
    ) {
      this.finalizeLeave(client.sessionId);
      return;
    }
    try {
      await this.allowReconnection(client, RECONNECT_GRACE_MS / 1000);
      p.connected = true;
      this.broadcastEvent({
        type: "chat",
        name: "server",
        text: `${p.name} reconnected`,
        at: Date.now(),
      });
    } catch {
      // Live match — keep the slot alive under bot control instead of
      // deleting. Either the original user (if registered) rejoins via
      // adoptAfkSlot, or a bot finishes the match for them.
      if (this.state.phase === "playing") {
        this.installBotTakeover(client.sessionId);
      } else {
        this.finalizeLeave(client.sessionId);
      }
    }
  }

  /** Hand a disconnected player's tank to a fresh BotBrain. The slot
   *  stays in `state.players` (so turnOrder/currentTurnId still resolve)
   *  with `afk=true`; the per-tick bot path picks them up. */
  private installBotTakeover(sessionId: string): void {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    p.afk = true;
    p.connected = false;
    // Drop any pending charge state so the bot's startTurn reset isn't
    // racing with leftover human inputs.
    p.charging = false;
    const meta = this.sessions.get(sessionId) ?? {
      input: { left: false, right: false, up: false, down: false },
      messages: [],
      chats: [],
    };
    meta.input = { left: false, right: false, up: false, down: false };
    meta.bot = new BotBrain(sessionId, this.world, "normal");
    this.sessions.set(sessionId, meta);
    if (this.state.currentTurnId === sessionId) {
      // Their turn was already running when they dropped — reseed bot
      // brain with the active player so it picks up where the input
      // pipeline left off.
      meta.bot.startTurn(p, this.state.startingHp);
    }
    if (this.state.hostSessionId === sessionId) {
      const next =
        Array.from(this.state.players.values()).find((q) => !q.bot && !q.afk && q.id !== sessionId) ??
        null;
      if (next) this.state.hostSessionId = next.id;
    }
    this.refreshMetadata();
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: `${p.name} disconnected — bot taking over`,
      at: Date.now(),
    });
    this.logEvent({ kind: "leave", id: sessionId, name: p.name, afk: true });
  }

  /** Re-bind an afk slot to the rejoining player's new sessionId. The
   *  schema map is keyed by sessionId, so we delete the old key and
   *  insert under the new one; per-room state that referenced the old
   *  id (turn order, host, current turn) follows along. */
  private adoptAfkSlot(p: Player, newSessionId: string): void {
    const oldSessionId = p.id;
    if (oldSessionId === newSessionId) {
      p.afk = false;
      p.connected = true;
      return;
    }
    this.state.players.delete(oldSessionId);
    p.id = newSessionId;
    p.afk = false;
    p.connected = true;
    this.state.players.set(newSessionId, p);

    const oldMeta = this.sessions.get(oldSessionId);
    this.sessions.delete(oldSessionId);
    this.sessions.set(newSessionId, {
      input: { left: false, right: false, up: false, down: false },
      messages: oldMeta?.messages ?? [],
      chats: oldMeta?.chats ?? [],
      // No `bot` — the human is back in the seat.
    });

    if (this.state.currentTurnId === oldSessionId) {
      this.state.currentTurnId = newSessionId;
    }
    if (this.state.hostSessionId === oldSessionId) {
      this.state.hostSessionId = newSessionId;
    }
    this.turnOrder = this.turnOrder.map((id) =>
      id === oldSessionId ? newSessionId : id,
    );

    this.refreshMetadata();
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: `${p.name} reconnected`,
      at: Date.now(),
    });
    this.logEvent({ kind: "join", id: newSessionId, name: p.name, userId: p.userId, rejoin: true });
  }

  private finalizeLeave(sessionId: string): void {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    this.logEvent({ kind: "leave", id: sessionId, name: p.name });
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: `${p.name} left`,
      at: Date.now(),
    });
    this.state.players.delete(sessionId);
    this.sessions.delete(sessionId);
    if (this.state.hostSessionId === sessionId) {
      // Promote the next human; fall back to first remaining player.
      const next =
        Array.from(this.state.players.values()).find((q) => !q.bot) ??
        Array.from(this.state.players.values())[0];
      this.state.hostSessionId = next?.id ?? "";
    }
    this.refreshMetadata();
    if (this.state.phase === "playing") {
      this.turnOrder = this.turnOrder.filter((id) => id !== sessionId);
      if (this.state.currentTurnId === sessionId) this.advanceTurn();
      this.checkWin();
    }
  }

  handleSetBotDifficulty(
    client: Client,
    sessionId: string,
    difficulty: BotDifficulty,
  ): void {
    if (!this.isCasualLobby()) return;
    if (this.state.phase !== "waiting") return;
    if (client.sessionId !== this.state.hostSessionId) return;
    const p = this.state.players.get(sessionId);
    if (!p || !p.bot) return;
    const spec = BOT_DIFFICULTY_SPECS[difficulty];
    if (!spec) return;
    p.difficulty = difficulty;
    p.mmr = spec.mmr;
    const meta = this.sessions.get(sessionId);
    if (meta?.bot) meta.bot.setDifficulty(difficulty);
    void client;
  }

  handleRemoveBot(client: Client, sessionId: string): void {
    if (!this.isCasualLobby()) return;
    if (this.state.phase !== "waiting") return;
    if (client.sessionId !== this.state.hostSessionId) return;
    const victim = this.state.players.get(sessionId);
    if (!victim || !victim.bot) return;
    this.state.players.delete(sessionId);
    this.sessions.delete(sessionId);
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: `${victim.name} removed`,
      at: Date.now(),
    });
    void client;
  }

  private isCasualLobby(): boolean {
    return (
      this.mode === "bots" ||
      this.mode === "private" ||
      this.mode === "custom"
    );
  }

  private regenerateTerrainFor(biome: BiomeId): void {
    this.state.biome = biome;
    const newSeed = Math.floor(Math.random() * 2 ** 31);
    this.state.projectiles.clear();
    this.state.fires.clear();
    this.world.dispose();
    this.world = new World(this.state, newSeed, biome);
    this.state.players.forEach((p) => {
      const spawnX = this.pickSpawnX(p);
      p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
      this.world.spawnTankAt(p, spawnX);
    });
  }

  private refreshMetadata(): void {
    const hostName =
      this.state.hostSessionId
        ? this.state.players.get(this.state.hostSessionId)?.name ?? ""
        : "";
    const started =
      this.state.phase !== "waiting" && this.state.phase !== "ended";
    const participantUserIds: string[] = [];
    const participantNames: string[] = [];
    this.state.players.forEach((p) => {
      if (p.userId) participantUserIds.push(p.userId);
      participantNames.push(p.name);
    });
    this.setMetadata({
      mode: this.mode,
      ranked: this.state.ranked,
      biome: this.state.biome,
      lobbyName: this.state.lobbyName || undefined,
      visibility: this.state.visibility,
      hostName: hostName || undefined,
      started,
      inviteCode: this.state.inviteCode || undefined,
      participantUserIds,
      participantNames,
    });
  }

  handleSetLobbyConfig(
    client: Client,
    msg: {
      lobbyName?: string;
      maxPlayers?: number;
      biome?: string;
      visibility?: "public" | "private";
      password?: string;
      teamMode?: boolean;
      teamCount?: number;
      teamSize?: number;
      friendlyFire?: boolean;
      ranked?: boolean;
    },
  ): void {
    if (this.state.phase !== "waiting") return;
    if (!this.isCasualLobby()) return;
    if (client.sessionId !== this.state.hostSessionId) return;

    let terrainDirty = false;
    const cap = MODES[this.mode].maxPlayers;
    if (typeof msg.lobbyName === "string") {
      this.state.lobbyName = sanitizeLobbyName(msg.lobbyName, undefined);
    }
    if (typeof msg.friendlyFire === "boolean") {
      this.state.friendlyFire = msg.friendlyFire;
    }
    if (typeof msg.ranked === "boolean" && msg.ranked !== this.state.ranked) {
      // Going ranked requires no bots in the room. Block the toggle if
      // bots are present so the host explicitly removes them first.
      if (msg.ranked) {
        const hasBots = Array.from(this.state.players.values()).some((p) => p.bot);
        if (hasBots) {
          this.broadcastEvent({
            type: "chat",
            name: "server",
            text: "Remove bots before enabling ranked.",
            at: Date.now(),
          });
        } else {
          this.state.ranked = true;
        }
      } else {
        this.state.ranked = false;
      }
    }
    let teamModeFlipped = false;
    let teamCountChanged = false;
    if (typeof msg.teamMode === "boolean" && msg.teamMode !== this.state.teamMode) {
      this.state.teamMode = msg.teamMode;
      if (msg.teamMode) {
        if (!this.state.teamCount) this.state.teamCount = 2;
      } else {
        this.state.teamCount = 0;
      }
      teamModeFlipped = true;
    }
    if (
      this.state.teamMode &&
      msg.teamCount != null &&
      Number.isFinite(Number(msg.teamCount))
    ) {
      const newCount = clamp(Number(msg.teamCount), 2, 4);
      if (newCount !== this.state.teamCount) {
        this.state.teamCount = newCount;
        teamCountChanged = true;
      }
    }
    if (msg.maxPlayers != null) {
      const newMax = clamp(Number(msg.maxPlayers), 2, cap);
      if (newMax >= this.state.players.size) {
        this.state.maxPlayers = newMax;
        this.maxClients = newMax;
      }
    }
    if (teamModeFlipped) {
      // Whether toggling on or off, everyone starts at "?". Players opt
      // into a specific team via their own team box; auto-balance kicks
      // in at startMatch for any leftover ?s.
      this.state.players.forEach((p) => {
        p.team = 0;
        p.color = this.nextTankColor(0);
      });
    } else if (teamCountChanged) {
      // Dropping teamCount can leave players on a now-invalid team —
      // bump them back to "?" so they re-pick within the new range.
      const tc = this.state.teamCount;
      this.state.players.forEach((p) => {
        if (p.team > tc) {
          p.team = 0;
          p.color = this.nextTankColor(0);
        }
      });
    }
    if (typeof msg.biome === "string") {
      // "random" flags the biome as a mystery — stays hidden until the
      // match starts and then re-rolls. Concrete biomes swap terrain now.
      if (msg.biome === "random") {
        this.state.biomeRandom = true;
      } else if (msg.biome in BIOMES) {
        const newBiome = msg.biome as BiomeId;
        this.state.biomeRandom = false;
        if (newBiome !== this.state.biome) {
          this.regenerateTerrainFor(newBiome);
          terrainDirty = true;
        }
      }
    }
    if (msg.visibility === "public" || msg.visibility === "private") {
      this.state.visibility = msg.visibility;
    }
    if (typeof msg.password === "string") {
      const trimmed = msg.password.trim().slice(0, 64);
      this.password = trimmed.length > 0 ? trimmed : null;
      this.state.hasPassword = this.password !== null;
    }
    this.refreshMetadata();
    void terrainDirty;
  }

  handleSetMatchSettings(
    client: Client,
    msg: {
      turnDurationSec?: number;
      fuelPerTurn?: number;
      startingHp?: number;
      maxWind?: number;
    },
  ): void {
    if (this.state.phase !== "waiting") return;
    if (msg.turnDurationSec != null) this.state.turnDurationSec = msg.turnDurationSec;
    if (msg.fuelPerTurn != null) this.state.fuelPerTurn = msg.fuelPerTurn;
    if (msg.startingHp != null) {
      this.state.startingHp = msg.startingHp;
      this.state.players.forEach((p) => {
        p.hp = msg.startingHp!;
      });
    }
    if (msg.maxWind != null) {
      this.state.windMax = msg.maxWind;
      this.state.wind = Math.max(
        -msg.maxWind,
        Math.min(msg.maxWind, this.state.wind),
      );
    }
    void client;
  }

  handleAim(
    client: Client,
    angle: number,
    power: number,
    facing?: -1 | 1,
  ): void {
    if (this.state.currentTurnId !== client.sessionId) return;
    if (this.turnFired) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    p.angle = Math.max(TANK.MIN_ANGLE_DEG, Math.min(TANK.MAX_ANGLE_DEG, angle));
    p.power = Math.max(0, Math.min(TANK.MAX_POWER, power));
    if (facing === -1 || facing === 1) p.facing = facing;
    p.charging = false;
  }

  handleFireNow(client: Client): void {
    if (this.state.currentTurnId !== client.sessionId) return;
    if (this.turnFired) return;
    if (this.world.hasLiveProjectiles()) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    if (p.power < TANK.MIN_POWER) return;
    this.fireCurrent(p);
  }

  handleUseItem(
    client: Client,
    item: string,
    target?: { x: number; y: number },
  ): void {
    if (this.state.currentTurnId !== client.sessionId) return;
    if (this.turnFired) return;
    if (this.world.hasLiveProjectiles()) return;
    if (!(item in ITEMS)) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || p.charging) return;
    const remaining = p.items.get(item) ?? 0;
    if (remaining <= 0) return;
    const id = item as ItemId;
    if (TARGETED_ITEMS.has(id) && !target) return;
    const fromX = p.x;
    const fromY = p.y;
    const ok = this.applyItemEffect(p, id, target);
    if (!ok) return;
    p.items.set(id, remaining - 1);
    this.turnFired = true;
    this.broadcastEvent({
      type: "item",
      tankId: p.id,
      item: id,
      x: p.x,
      y: p.y,
      from: { x: fromX, y: fromY },
    });
    this.logEvent({ kind: "item", id: p.id, item: id });
    this.scheduleEndOfTurn();
  }

  /** Bot equivalent of handleUseItem — bypasses turn/auth checks
   *  because the caller (`tick`) already verified it's the bot's turn
   *  and the brain decided to fire. Mirrors the broadcast/logging side
   *  effects so clients animate identically to a human use. */
  private applyBotItem(
    p: Player,
    id: ItemId,
    target: { x: number; y: number } | undefined,
  ): boolean {
    if (this.turnFired) return false;
    const remaining = p.items.get(id) ?? 0;
    if (remaining <= 0) return false;
    const fromX = p.x;
    const fromY = p.y;
    const ok = this.applyItemEffect(p, id, target);
    if (!ok) return false;
    p.items.set(id, remaining - 1);
    this.turnFired = true;
    this.broadcastEvent({
      type: "item",
      tankId: p.id,
      item: id,
      x: p.x,
      y: p.y,
      from: { x: fromX, y: fromY },
    });
    this.logEvent({ kind: "item", id: p.id, item: id });
    this.scheduleEndOfTurn();
    return true;
  }

  private applyItemEffect(
    p: Player,
    id: ItemId,
    target: { x: number; y: number } | undefined,
  ): boolean {
    switch (id) {
      case "jetpack": {
        if (!target) return false;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > ITEM_TUNING.jetpack.maxRange) return false;
        const margin = TANK.WIDTH / 2 + 4;
        const nx = Math.max(margin, Math.min(WORLD.WIDTH - margin, target.x));
        p.x = nx;
        this.world.spawnTankAt(p, p.x);
        return true;
      }
      case "teleport": {
        const margin = TANK.WIDTH / 2 + 24;
        const minDelta = ITEM_TUNING.teleport.minDelta;
        let nx = p.x;
        for (let i = 0; i < 20; i++) {
          const candidate = margin + Math.random() * (WORLD.WIDTH - margin * 2);
          if (Math.abs(candidate - p.x) >= minDelta) { nx = candidate; break; }
        }
        p.x = nx;
        this.world.spawnTankAt(p, p.x);
        return true;
      }
      case "shield": {
        p.shieldExpiresAt = Date.now() + ITEM_TUNING.shield.durationMs;
        return true;
      }
      case "repair": {
        if (p.hp >= this.state.startingHp) return false;
        p.hp = Math.min(this.state.startingHp, p.hp + ITEM_TUNING.repair.hpRestore);
        return true;
      }
    }
  }

  handleInput(
    client: Client,
    msg: { left: boolean; right: boolean; up: boolean; down: boolean },
  ): void {
    const meta = this.sessions.get(client.sessionId);
    if (!meta) return;
    if (this.state.currentTurnId !== client.sessionId) {
      meta.input = { left: false, right: false, up: false, down: false };
      return;
    }
    meta.input = { left: msg.left, right: msg.right, up: msg.up, down: msg.down };
  }

  handleSelectWeapon(client: Client, weapon: string): void {
    if (!(weapon in WEAPONS)) return;
    if (this.state.currentTurnId !== client.sessionId) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || p.charging) return;
    // Ammo gate: selecting an exhausted weapon is a no-op so the UI
    // reflects server truth. `undefined` in the map means unlimited.
    const def = WEAPONS[weapon as WeaponId];
    if (def.maxAmmo !== undefined) {
      const remaining = p.ammo.get(weapon);
      if (remaining !== undefined && remaining <= 0) return;
    }
    p.weapon = weapon;
    this.logEvent({ kind: "weapon", id: p.id, weapon });
  }

  handleCharge(client: Client, charging: boolean): void {
    if (this.state.currentTurnId !== client.sessionId) return;
    if (this.turnFired) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    if (charging) {
      if (!p.charging) {
        p.charging = true;
        p.power = TANK.MIN_POWER;
      }
    } else if (p.charging) {
      this.fireCurrent(p);
    }
  }

  private fireCurrent(p: Player): void {
    if (this.turnFired) return;
    // Ammo gate — if the currently selected weapon is exhausted, fall back
    // to the unlimited default shell so the player's turn doesn't just
    // soft-lock.
    const def = WEAPONS[p.weapon as WeaponId];
    if (def?.maxAmmo !== undefined) {
      const remaining = p.ammo.get(p.weapon) ?? 0;
      if (remaining <= 0) {
        p.weapon = DEFAULT_LOADOUT[0]!;
      }
    }
    const shot = this.world.fire(p);
    if (!shot) return;
    const firedDef = WEAPONS[shot.weapon];
    if (firedDef?.maxAmmo !== undefined) {
      const remaining = p.ammo.get(shot.weapon) ?? 0;
      p.ammo.set(shot.weapon, Math.max(0, remaining - 1));
    }
    this.turnFired = true;
    p.shotsFired += 1;
    this.broadcastEvent({
      type: "fire",
      tankId: p.id,
      weapon: shot.weapon,
      power: shot.power,
      from: shot.from,
    });
    // Bot shot-taunt — fires before the round lands so it reads as
    // confident swagger. Gated to a subset of shots so the feed stays
    // lively, not spammy.
    if (p.bot && Math.random() < 0.22) {
      this.botSay(p, pick(BOT_LINES.on_fire));
    }
    this.pendingShot = { id: p.id, bot: p.bot, hit: false };
    this.logEvent({
      kind: "fire",
      id: p.id,
      weapon: shot.weapon,
      power: shot.power,
      wind: this.state.wind,
    });
    this.scheduleEndOfTurn();
  }

  handleReady(client: Client, ready: boolean): void {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = ready;
    if (this.state.phase === "waiting") this.maybeStartCountdown();
  }

  handleChat(
    client: Client,
    meta: SessionMeta,
    text: string,
  ): void {
    if (!rateAllow(meta.chats, CHAT_RATE_LIMIT.COUNT, CHAT_RATE_LIMIT.WINDOW_MS))
      return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    this.broadcastEvent({
      type: "chat",
      name: p.name,
      text: text.slice(0, 140),
      at: Date.now(),
      color: p.color,
    });
  }

  handleSetTeam(client: Client, sessionId: string, team: number): void {
    if (this.state.phase !== "waiting") return;
    if (!this.state.teamMode) return;
    const p = this.state.players.get(sessionId);
    if (!p) return;
    // A player owns their own team box. Bots can't pick for themselves,
    // so the host has authority over bot rows.
    const isSelf = client.sessionId === sessionId;
    const isHostMovingBot =
      p.bot && client.sessionId === this.state.hostSessionId;
    if (!isSelf && !isHostMovingBot) return;
    const tc = Math.max(2, this.state.teamCount || 2);
    const next = Math.max(0, Math.min(tc, Math.floor(team)));
    if (p.team === next) return;
    p.team = next;
    p.color = this.nextTankColor(p.team);
    const spawnX = this.pickSpawnX(p);
    p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
    this.world.spawnTankAt(p, spawnX);
  }

  handleShuffleTeams(client: Client): void {
    if (!this.isCasualLobby()) return;
    if (this.state.phase !== "waiting") return;
    if (client.sessionId !== this.state.hostSessionId) return;
    if (!this.state.teamMode) return;
    this.shuffleTeams();
  }

  /** Re-roll all team assignments from scratch, distributing round-robin
   *  across the configured teamCount. Re-rolls colors + spawns so the
   *  visual state matches. */
  private shuffleTeams(): void {
    const tc = Math.max(2, this.state.teamCount || 2);
    const ids = Array.from(this.state.players.keys());
    shuffle(ids);
    ids.forEach((id, i) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.team = (i % tc) + 1;
      p.color = this.nextTankColor(p.team);
      const spawnX = this.pickSpawnX(p);
      p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
      this.world.spawnTankAt(p, spawnX);
    });
  }

  /** Walk all players with team=0 ("?") and assign them to whichever
   *  team currently has the fewest committed members. Used at match
   *  start so unassigned players get folded into balanced teams. */
  private resolveAutoTeams(): void {
    const tc = Math.max(2, this.state.teamCount || 2);
    const counts = new Array<number>(tc + 1).fill(0);
    this.state.players.forEach((p) => {
      if (p.team >= 1 && p.team <= tc) counts[p.team]! += 1;
    });
    const unassigned: string[] = [];
    this.state.players.forEach((p) => {
      if (p.team === 0) unassigned.push(p.id);
    });
    shuffle(unassigned);
    for (const id of unassigned) {
      const p = this.state.players.get(id);
      if (!p) continue;
      let minCount = Infinity;
      const candidates: number[] = [];
      for (let t = 1; t <= tc; t++) {
        const c = counts[t]!;
        if (c < minCount) {
          minCount = c;
          candidates.length = 0;
          candidates.push(t);
        } else if (c === minCount) {
          candidates.push(t);
        }
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      p.team = pick;
      counts[pick]! += 1;
      p.color = this.nextTankColor(p.team);
      const spawnX = this.pickSpawnX(p);
      p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
      this.world.spawnTankAt(p, spawnX);
    }
  }

  handleAddBot(client: Client, difficulty?: BotDifficulty): void {
    if (!this.isCasualLobby()) return;
    if (this.state.phase !== "waiting") return;
    if (client.sessionId !== this.state.hostSessionId) return;
    if (this.state.players.size >= this.state.maxPlayers) return;
    // Ranked rooms can't have bots — that's the whole point of the toggle.
    if (this.state.ranked) return;
    this.addBot(difficulty ?? "normal");
  }

  private maybeStartCountdown(): void {
    const players = Array.from(this.state.players.values());
    const spec = MODES[this.mode];
    if (players.length < spec.minPlayers) return;
    const humans = players.filter((p) => !p.bot);
    if (humans.length === 0) return;
    if (!humans.every((p) => p.ready)) return;
    this.state.phase = "countdown";
    this.state.roundStartsAt = Date.now() + 5_000;
    this.refreshMetadata();
    setTimeout(() => this.startMatch(), 5_000);
  }

  shouldFillWithBot(elapsedMs: number): boolean {
    const spec = MODES[this.mode];
    if (!spec.botFillAfterMs || spec.botFillAfterMs <= 0) return false;
    const alive = Array.from(this.state.players.values()).filter(
      (p) => !p.dead,
    );
    return alive.length < spec.minPlayers && elapsedMs > spec.botFillAfterMs;
  }

  addBot(difficulty: BotDifficulty = "normal"): Player {
    const spec = BOT_DIFFICULTY_SPECS[difficulty];
    const taken: string[] = [];
    this.state.players.forEach((p) => taken.push(p.name));
    const name = pickBotName(taken);
    const sessionId = `bot_${randomBytes(4).toString("hex")}`;
    const p = new Player();
    p.id = sessionId;
    p.userId = "";
    p.name = name;
    p.bot = true;
    p.difficulty = difficulty;
    p.mmr = spec.mmr;
    p.hp = this.state.startingHp > 0 ? this.state.startingHp : TANK.MAX_HP;
    p.fuel = this.state.fuelPerTurn >= 0 ? this.state.fuelPerTurn : TURN.FUEL_PER_TURN;
    p.weapon = DEFAULT_LOADOUT[0]!;
    // Bots default to team 0 like humans; the host picks their team via
    // the lobby team box, or startMatch auto-assigns at kickoff.
    p.team = 0;
    p.color = this.nextTankColor(p.team);
    p.angle = 45;
    p.ready = true;
    this.initAmmo(p);
    const spawnX = this.pickSpawnX(p);
    p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
    this.world.spawnTankAt(p, spawnX);
    this.state.players.set(sessionId, p);
    this.sessions.set(sessionId, {
      input: { left: false, right: false, up: false, down: false },
      messages: [],
      chats: [],
      bot: new BotBrain(sessionId, this.world, difficulty),
    });
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: `${p.name} [${spec.label}] joined`,
      at: Date.now(),
    });
    return p;
  }

  /** Stock a player's per-weapon ammo for a fresh match. Unlimited
   *  weapons (no maxAmmo on the def) are intentionally absent from the
   *  map so the client can read "undefined → unlimited". */
  private initAmmo(p: Player): void {
    p.ammo.clear();
    for (const def of Object.values(WEAPONS)) {
      if (def.maxAmmo !== undefined) {
        p.ammo.set(def.id, def.maxAmmo);
      }
    }
    p.items.clear();
    for (const def of Object.values(ITEMS)) {
      p.items.set(def.id, def.maxCharges);
    }
    p.shieldExpiresAt = 0;
  }

  private nextTankColor(team: number = 0): number {
    // team 0 falls through to the FFA palette; teams 1..4 use their
    // dedicated palettes. Out-of-range team ids fall back to FFA so a
    // bad value can't crash the picker.
    const palette =
      team >= 1 && team < TEAM_PALETTES.length
        ? TEAM_PALETTES[team]!
        : TANK_COLORS;
    const used = new Set<number>();
    this.state.players.forEach((p) => used.add(p.color));
    for (const c of palette) if (!used.has(c)) return c;
    return palette[this.state.players.size % palette.length]!;
  }

  /** Pick a team for a freshly-joined player so rosters stay balanced.
   *  No-op outside team mode. Smallest team wins; ties broken randomly. */
  private assignTeam(p: Player): void {
    if (!this.state.teamMode) {
      p.team = 0;
      return;
    }
    const tc = Math.max(2, this.state.teamCount || 2);
    const counts = new Array<number>(tc + 1).fill(0); // index 1..tc used
    this.state.players.forEach((q) => {
      if (q.id === p.id) return;
      if (q.team >= 1 && q.team <= tc) counts[q.team]! += 1;
    });
    let minCount = Infinity;
    const candidates: number[] = [];
    for (let t = 1; t <= tc; t++) {
      const c = counts[t]!;
      if (c < minCount) {
        minCount = c;
        candidates.length = 0;
        candidates.push(t);
      } else if (c === minCount) {
        candidates.push(t);
      }
    }
    p.team = candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  private pickSpawnX(p?: Player): number {
    const placed: number[] = [];
    this.state.players.forEach((q) => {
      if (p && q.id === p.id) return;
      placed.push(q.x);
    });
    // Team mode carves the map into equal-width strips so each team
    // spawns in its own corridor. With N teams the strip is WORLD/N
    // wide; the inset keeps tanks off the absolute edge.
    let lo = 150;
    let hi = WORLD.WIDTH - 150;
    if (p && this.state.teamMode && p.team >= 1) {
      const tc = Math.max(2, this.state.teamCount || 2);
      if (p.team <= tc) {
        const stripeWidth = WORLD.WIDTH / tc;
        const idx = p.team - 1;
        const inset = Math.min(100, stripeWidth * 0.15);
        lo = idx * stripeWidth + inset;
        hi = (idx + 1) * stripeWidth - inset;
      }
    }
    const minSpacing = 200;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = lo + Math.random() * (hi - lo);
      if (placed.every((px) => Math.abs(px - x) >= minSpacing)) return x;
    }
    if (p && this.state.teamMode && p.team !== 0) {
      return (lo + hi) / 2;
    }
    const slot = this.state.players.size + 1;
    const total = slot + 1;
    return (WORLD.WIDTH / (total + 1)) * slot;
  }

  private startMatch(): void {
    if (this.state.phase !== "countdown") return;
    const ids = Array.from(this.state.players.keys());
    if (ids.length < MODES[this.mode].minPlayers) {
      this.state.phase = "waiting";
      this.state.players.forEach((p) => (p.ready = false));
      this.refreshMetadata();
      return;
    }
    // Resolve any "?" (team=0) players before kickoff. Auto-fills the
    // smaller teams so anyone who left it on auto lands on a balanced side.
    if (this.state.teamMode) {
      this.resolveAutoTeams();
    }
    // Mystery biome? Resolve now — re-roll terrain so the first thing
    // anyone sees at phase flip is the real map.
    if (this.state.biomeRandom) {
      this.regenerateTerrainFor(randomBiome());
      this.state.biomeRandom = false;
    }
    shuffle(ids);
    this.turnOrder = ids;
    this.turnIndex = -1;
    this.state.phase = "playing";
    this.state.matchStartedAt = Date.now();
    this.matchStartedAtMs = this.state.matchStartedAt;
    this.state.turnNumber = 0;
    this.refreshMetadata();
    this.logEvent({ kind: "start", players: ids, mode: this.mode });
    matchesStarted.inc({ mode: this.mode });
    const startBots = Array.from(this.state.players.values()).filter((p) => p.bot);
    if (startBots.length > 0 && Math.random() < 0.8) {
      const speaker = startBots[Math.floor(Math.random() * startBots.length)]!;
      this.botSay(speaker, pick(BOT_LINES.on_match_start));
    }
    this.advanceTurn();
  }

  private advanceTurn(): void {
    if (this.state.phase !== "playing") return;
    if (this.turnOrder.length === 0) {
      this.endMatch(null);
      return;
    }
    const prevIndex = this.turnIndex;
    let tries = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
      tries++;
    } while (
      tries <= this.turnOrder.length &&
      this.state.players.get(this.turnOrder[this.turnIndex]!)?.dead
    );
    const id = this.turnOrder[this.turnIndex]!;
    const p = this.state.players.get(id);
    if (!p) return;
    p.fuel = this.state.fuelPerTurn >= 0 ? this.state.fuelPerTurn : TURN.FUEL_PER_TURN;
    p.charging = false;
    this.turnFired = false;
    this.state.currentTurnId = id;
    this.state.turnEndsAt = Date.now() + (this.state.turnDurationSec > 0 ? this.state.turnDurationSec : 30) * 1000;
    // Wind rolls once per *round*, not per turn — fairness guarantee so
    // every player in the cycle shoots in the same conditions until the
    // rotation wraps back to the round-starter.
    const isFirstTurn = prevIndex === -1;
    const wrappedRound = !isFirstTurn && this.turnIndex <= prevIndex;
    if (isFirstTurn || wrappedRound) {
      this.state.wind = rollWind(this.state.windMax);
    }
    this.state.turnNumber += 1;
    this.nextTurnAt = 0;
    const meta = this.sessions.get(id);
    if (meta?.bot) meta.bot.startTurn(p, this.state.startingHp);
    this.broadcastEvent({
      type: "turn",
      tankId: id,
      endsAt: this.state.turnEndsAt,
      turnNumber: this.state.turnNumber,
    });
    this.logEvent({ kind: "turn", id, wind: this.state.wind });
  }

  private scheduleEndOfTurn(): void {
    if (this.nextTurnAt === 0) this.nextTurnAt = -1;
  }

  private tick(): void {
    const now = Date.now();
    if (this.state.phase === "playing") {
      const p = this.state.players.get(this.state.currentTurnId);
      const meta = this.sessions.get(this.state.currentTurnId);
      if (p && meta) {
        if (meta.bot) {
          meta.bot.tick(p, now, this.dt);
          // Drive the hull only when the brain is actively repositioning.
          // Calling applyInput unconditionally would double-tick charging
          // (bot.tick already advances power at its own rate).
          if (!this.turnFired) {
            const botInput = meta.bot.getInput();
            if (botInput.left || botInput.right) {
              this.world.applyInput(p, botInput, this.dt);
            }
          }
          const itemPlan = meta.bot.wantsToUseItem(now);
          if (itemPlan) {
            this.applyBotItem(p, itemPlan.id, itemPlan.target);
            meta.bot.consumeItem();
          } else if (meta.bot.wantsToFire(now)) {
            // Ensure world.fire() sees a chargeable state.
            if (!p.charging) p.charging = true;
            this.fireCurrent(p);
            meta.bot.consumeFire();
          }
        } else {
          // Once the player has fired, the turn is over in all but name —
          // freeze their inputs until rotation advances.
          if (!this.turnFired) {
            this.world.applyInput(p, meta.input, this.dt);
          }
        }
      }
    }

    const telemetry = this.world.step(this.dt);
    for (const ex of telemetry.explosions) {
      this.broadcastEvent({
        type: "explosion",
        x: ex.x,
        y: ex.y,
        radius: ex.radius,
        weapon: ex.weapon,
      });
      this.logEvent({ kind: "explosion", ...ex });
    }
    for (const d of telemetry.damages) {
      this.broadcastEvent({
        type: "damage",
        tankId: d.tankId,
        amount: d.amount,
        x: d.x,
        y: d.y,
      });
      // Track whether the pending shot connected with anyone other than
      // the shooter — used for miss taunts at turn-end.
      if (
        this.pendingShot &&
        d.ownerId === this.pendingShot.id &&
        d.tankId !== d.ownerId
      ) {
        this.pendingShot.hit = true;
      }
      if (d.killed) {
        const killer = this.state.players.get(d.ownerId);
        const victim = this.state.players.get(d.tankId);
        this.broadcastEvent({
          type: "kill",
          killerId: killer?.id ?? null,
          killerName: killer?.name ?? null,
          victimId: d.tankId,
          victimName: victim?.name ?? "Unknown",
          weapon: d.weapon,
        });
        // Bot trash-talk — cocky one-liner from the killer, parting
        // shot from the victim. Small random chance so the feed doesn't
        // get spammy when bots stack kills.
        if (killer?.bot && killer.id !== victim?.id && Math.random() < 0.7) {
          this.botSay(killer, pick(BOT_LINES.on_kill, [victim?.name ?? "you"]));
        }
        if (victim?.bot && Math.random() < 0.55) {
          this.botSay(victim, pick(BOT_LINES.on_death, [killer?.name ?? "???"]));
        }
        // Peanut-gallery line from a random uninvolved bot.
        if (Math.random() < 0.2) {
          const witnesses = Array.from(this.state.players.values()).filter(
            (q) =>
              q.bot &&
              !q.dead &&
              q.id !== killer?.id &&
              q.id !== victim?.id,
          );
          const witness = witnesses[Math.floor(Math.random() * witnesses.length)];
          if (witness) {
            this.botSay(
              witness,
              pick(BOT_LINES.on_witness_kill, [killer?.name ?? "someone"]),
            );
          }
        }
      } else {
        // Hit but didn't kill — occasional bot reaction (being hit
        // is more common than dying, throttle harder).
        const victim = this.state.players.get(d.tankId);
        if (victim?.bot) {
          if (d.ownerId === d.tankId && Math.random() < 0.85) {
            this.botSay(victim, pick(BOT_LINES.on_self_damage));
          } else {
            const prevHp = victim.hp + d.amount;
            const lowThresh = Math.max(1, Math.floor(TANK.MAX_HP * 0.25));
            if (
              victim.hp > 0 &&
              victim.hp <= lowThresh &&
              prevHp > lowThresh &&
              Math.random() < 0.6
            ) {
              this.botSay(
                victim,
                pick(BOT_LINES.on_low_hp, [
                  this.state.players.get(d.ownerId)?.name ?? "you",
                ]),
              );
            } else if (Math.random() < 0.18) {
              this.botSay(victim, pick(BOT_LINES.on_hit));
            }
          }
        }
      }
    }
    for (const id of telemetry.deaths) {
      this.broadcastEvent({ type: "death", tankId: id });
      this.logEvent({ kind: "death", id });
    }
    this.world.settleAllTanks();

    if (telemetry.deaths.length > 0) this.checkWin();

    if (this.state.phase === "playing") {
      if (this.nextTurnAt === -1 && !this.world.hasLiveProjectiles()) {
        this.nextTurnAt = now + TURN.BETWEEN_TURNS_MS;
        if (this.pendingShot && !this.pendingShot.hit) {
          const shooter = this.state.players.get(this.pendingShot.id);
          if (this.pendingShot.bot && shooter?.bot && Math.random() < 0.5) {
            this.botSay(shooter, pick(BOT_LINES.on_miss));
          } else if (!this.pendingShot.bot && shooter && Math.random() < 0.55) {
            const heckler = this.pickRandomLivingBot(shooter.id);
            if (heckler) {
              this.botSay(
                heckler,
                pick(BOT_LINES.on_opponent_miss, [shooter.name]),
              );
            }
          }
        }
        this.pendingShot = null;
      }
      if (this.nextTurnAt > 0 && now >= this.nextTurnAt) {
        this.advanceTurn();
      } else if (this.nextTurnAt === 0 && now >= this.state.turnEndsAt) {
        this.scheduleEndOfTurn();
      }
      // Safety net: if we've been waiting for projectiles to land for
      // longer than any shot could reasonably stay in flight, something
      // jammed — force-clear the world's projectiles and move on rather
      // than leave the match frozen for every player.
      if (
        this.nextTurnAt === -1 &&
        now > this.state.turnEndsAt + 20_000
      ) {
        logger.warn(
          {
            turnId: this.state.currentTurnId,
            stuckForMs: now - this.state.turnEndsAt,
          },
          "force-advancing stuck turn; clearing projectiles",
        );
        this.world.clearProjectiles();
        this.nextTurnAt = now + TURN.BETWEEN_TURNS_MS;
      }
    }
  }

  private checkWin(): void {
    if (this.state.phase !== "playing") return;
    const alive = Array.from(this.state.players.values()).filter((p) => !p.dead);
    if (this.state.teamMode) {
      if (this.state.players.size <= 1) return;
      const teamsAlive = new Set<number>();
      for (const p of alive) teamsAlive.add(p.team);
      if (teamsAlive.size === 0) {
        // Mutual annihilation in a single tick — call it a draw.
        this.endMatch(null, 0);
      } else if (teamsAlive.size === 1) {
        const winningTeam = [...teamsAlive][0]!;
        const champ = alive.find((p) => p.team === winningTeam) ?? null;
        this.endMatch(champ?.id ?? null, winningTeam);
      }
      return;
    }
    if (alive.length <= 1 && this.state.players.size > 1) {
      this.endMatch(alive[0]?.id ?? null, 0);
    }
  }

  private endMatch(
    winnerSessionId: string | null,
    winnerTeam: number = 0,
  ): void {
    if (this.state.phase === "ended") return;
    this.state.phase = "ended";
    this.state.matchEndedAt = Date.now();
    const winner = winnerSessionId
      ? this.state.players.get(winnerSessionId)
      : null;
    this.state.winnerId = winner?.id ?? "";
    this.state.winnerTeam = winnerTeam ? String(winnerTeam) : "";
    this.broadcastEvent({ type: "gameOver", winnerId: winner?.id ?? null });
    if (winner?.bot) {
      this.botSay(winner, pick(BOT_LINES.on_victory));
    }
    matchesFinished.inc({
      mode: this.mode,
      outcome: winner ? "winner" : "stalemate",
    });
    this.logEvent({ kind: "end", winnerId: winner?.id ?? null });
    this.persistFinishedMatch(winner ?? null).catch((err) =>
      logger.error({ err }, "persist match failed"),
    );
    // Casual lobbies auto-recycle to `waiting` after the recap window so the
    // host's configured room (name, settings, bots) survives between rounds.
    // Ranked rooms have no in-room lobby — clients leave themselves.
    if (this.postMatchTimer) clearTimeout(this.postMatchTimer);
    if (this.isCasualLobby()) {
      this.postMatchTimer = setTimeout(() => {
        this.postMatchTimer = undefined;
        if (this.state.phase !== "ended") return;
        const humans = Array.from(this.state.players.values()).filter(
          (p) => !p.bot,
        );
        if (humans.length === 0) return;
        this.startNextRound();
      }, POST_MATCH_RECAP_MS);
      this.postMatchTimer.unref?.();
    }
  }

  private async persistFinishedMatch(winner: Player | null): Promise<void> {
    if (this.persisted) return;
    this.persisted = true;
    const players = Array.from(this.state.players.values());
    let placements: number[];
    if (this.state.teamMode) {
      const winningTeam = Number(this.state.winnerTeam);
      if (!winningTeam) {
        // Draw — every participant ties at placement 0 → zero ELO movement.
        placements = players.map(() => 0);
      } else {
        placements = players.map((p) => (p.team === winningTeam ? 0 : 1));
      }
    } else {
      placements = players.map((p) => (winner && p.id === winner.id ? 0 : 1));
      const nonWinners = players
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !winner || p.id !== winner.id)
        .sort((a, b) => b.p.damageDealt - a.p.damageDealt);
      nonWinners.forEach(({ i }, rank) => {
        placements[i] = winner ? rank + 1 : rank;
      });
    }
    try {
      await persistMatch({
        mode: this.mode,
        ranked: this.state.ranked,
        startedAt: new Date(this.matchStartedAtMs || Date.now()),
        endedAt: new Date(),
        winnerUserId: winner?.userId ? winner.userId : null,
        summary: {
          seed: this.state.terrain.seed,
          wind: this.state.wind,
          biome: this.state.biome,
          inviteCode: this.state.inviteCode || null,
        },
        events: this.eventLog,
        players,
        placements,
      });
    } catch (err) {
      logger.error({ err }, "match persist failed");
    }
  }

  private startNextRound(): void {
    this.persisted = false;
    this.eventLog = [];
    this.state.phase = "waiting";
    this.state.winnerId = "";
    this.state.matchStartedAt = 0;
    this.state.matchEndedAt = 0;
    this.state.turnNumber = 0;
    this.state.currentTurnId = "";
    this.state.turnEndsAt = 0;
    // New terrain + biome each round for variety.
    const newBiome = randomBiome();
    this.state.biome = newBiome;
    const newSeed = Math.floor(Math.random() * 2 ** 31);
    this.world.dispose();
    this.world = new World(this.state, newSeed, newBiome);
    this.state.wind = rollWind();
    // Reset players.
    this.state.projectiles.clear();
    this.state.fires.clear();
    this.state.players.forEach((p) => {
      p.hp = TANK.MAX_HP;
      p.fuel = TURN.FUEL_PER_TURN;
      p.power = 0;
      p.charging = false;
      p.weapon = DEFAULT_LOADOUT[0]!;
      p.angle = 45;
      p.dead = false;
      p.ready = p.bot; // bots auto-ready; humans must re-ready.
      p.kills = 0;
      p.deaths = 0;
      p.damageDealt = 0;
      p.shotsFired = 0;
      this.initAmmo(p);
      const spawnX = this.pickSpawnX(p);
      p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
      this.world.spawnTankAt(p, spawnX);
    });
    this.refreshMetadata();
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: "New round: ready up to start.",
      at: Date.now(),
    });
  }

  private logEvent(evt: Record<string, unknown>): void {
    this.eventLog.push({
      t: Date.now() - (this.matchStartedAtMs || Date.now()),
      ...evt,
    });
    if (this.eventLog.length > 10_000) this.eventLog.splice(0, 5_000);
  }

  private broadcastEvent(evt: Record<string, unknown>): void {
    this.broadcast("event", evt);
  }

  /** Bots occasionally mouth off in the chat feed — wired into kill,
   *  death, hit, and fire events. Throttled by the calling site's
   *  Math.random gate so the feed stays readable. */
  private botSay(bot: Player, text: string): void {
    this.broadcastEvent({
      type: "chat",
      name: bot.name,
      text,
      at: Date.now(),
      color: bot.color,
    });
  }

  private pickRandomLivingBot(excludeId?: string): Player | null {
    const candidates = Array.from(this.state.players.values()).filter(
      (p) => p.bot && !p.dead && p.id !== excludeId,
    );
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }
}

