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
  RECONNECT_GRACE_MS,
  type GameMode,
  type RoomJoinOptions,
  TANK,
  TURN,
  WORLD,
  WEAPONS,
  type WeaponId,
  randomBiome,
  sanitizeLoadout,
} from "@artillery/shared";
import { World, type Input as PlayerInput } from "../physics/World.js";
import { BotBrain } from "./Bot.js";
import { logger } from "../logger.js";
import { matchesFinished, matchesStarted } from "../metrics.js";
import { persistMatch } from "../match/persist.js";
import {
  TANK_COLORS,
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

  private mode: GameMode = "ffa";
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
  private rematchVotes = new Set<string>();
  /** true once the current turn's tank has fired — blocks spam. */
  private turnFired = false;
  /** Tracks the most recent shot until projectiles resolve, so we can
   *  fire a miss taunt if nobody got hit. `bot` distinguishes self-roast
   *  (bot whiffs) from peanut-gallery (human whiffs and a bot mocks). */
  private pendingShot: { id: string; bot: boolean; hit: boolean } | null = null;
  private initialOptions: RoomOptions = { mode: "ffa", username: "Player" };
  /** Optional join gate for private rooms. Stored only on the instance —
   *  never written to state — so it doesn't leak through schema patches. */
  private password: string | null = null;

  override async onCreate(options: RoomOptions = { mode: "ffa", username: "Player" }) {
    this.initialOptions = options;
    const mode = (options.mode as GameMode) in MODES ? (options.mode as GameMode) : "ffa";
    this.mode = mode;
    const spec = MODES[mode];
    // Ranked modes lock the cap to the mode spec for fairness; casual
    // modes (custom/private/bots) let the host pick 2–6.
    const casual = mode === "custom" || mode === "private" || mode === "bots";
    const requestedMax = casual ? Number(options.maxPlayers ?? spec.maxPlayers) : spec.maxPlayers;
    const maxPlayers = clamp(
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
    this.state.ranked = spec.ranked;
    this.state.maxPlayers = maxPlayers;

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
    if (casual && options.botCount != null && Number(options.botCount) > 0) {
      const count = clamp(
        Number(options.botCount),
        1,
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

    const p = new Player();
    p.id = client.sessionId;
    p.userId = accountInfo?.userId ?? "";
    p.name = username;
    p.bot = false;
    p.mmr = accountInfo?.mmr ?? DEFAULT_MMR;
    p.hp = this.state.startingHp > 0 ? this.state.startingHp : TANK.MAX_HP;
    p.fuel = this.state.fuelPerTurn >= 0 ? this.state.fuelPerTurn : TURN.FUEL_PER_TURN;
    p.weapon = DEFAULT_LOADOUT[0]!;
    p.color = this.nextTankColor();
    p.angle = 45;
    // Apply saved loadout (client sends via join options — also persists
    // server-side for authed users via /api/me/loadout).
    const loadout = sanitizeLoadout(
      ((options as RoomJoinOptions).loadout ?? accountInfo?.loadout) as
        | Record<string, unknown>
        | undefined,
    );
    p.color = loadout.primaryColor || p.color;
    p.accentColor = loadout.accentColor;
    p.bodyStyle = loadout.body;
    p.turretStyle = loadout.turret;
    p.barrelStyle = loadout.barrel;
    p.pattern = loadout.pattern;
    p.decal = loadout.decal;
    p.patternColor = loadout.patternColor;
    this.initAmmo(p);
    const spawnX = this.pickSpawnX();
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
      this.finalizeLeave(client.sessionId);
    }
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
    this.world = new World(this.state, newSeed, biome);
    this.state.players.forEach((p) => {
      const spawnX = this.pickSpawnX();
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
    this.setMetadata({
      mode: this.mode,
      ranked: this.state.ranked,
      biome: this.state.biome,
      lobbyName: this.state.lobbyName || undefined,
      visibility: this.state.visibility,
      hostName: hostName || undefined,
      started,
      inviteCode: this.state.inviteCode || undefined,
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
    },
  ): void {
    if (this.state.phase !== "waiting") return;
    if (!this.isCasualLobby()) return;
    if (client.sessionId !== this.state.hostSessionId) return;

    let terrainDirty = false;
    if (typeof msg.lobbyName === "string") {
      this.state.lobbyName = sanitizeLobbyName(msg.lobbyName, undefined);
    }
    if (msg.maxPlayers != null) {
      const cap = MODES[this.mode].maxPlayers;
      const newMax = clamp(Number(msg.maxPlayers), 2, cap);
      if (newMax >= this.state.players.size) {
        this.state.maxPlayers = newMax;
        this.maxClients = newMax;
      }
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
    });
  }

  handleRematch(client: Client): void {
    if (this.state.phase !== "ended") return;
    this.rematchVotes.add(client.sessionId);
    const humans = Array.from(this.state.players.values()).filter(
      (p) => !p.bot,
    );
    if (humans.every((p) => this.rematchVotes.has(p.id))) {
      this.startRematch();
    } else {
      this.broadcastEvent({
        type: "chat",
        name: "server",
        text: `Rematch: ${this.rematchVotes.size}/${humans.length}`,
        at: Date.now(),
      });
    }
  }

  handleAddBot(client: Client, difficulty?: BotDifficulty): void {
    // Casual lobbies only; ranked queues fill themselves via Matchmaking.ts.
    if (!this.isCasualLobby()) return;
    if (this.state.phase !== "waiting") return;
    if (client.sessionId !== this.state.hostSessionId) return;
    if (this.state.players.size >= this.state.maxPlayers) return;
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
    p.color = this.nextTankColor();
    p.angle = 45;
    p.ready = true;
    this.initAmmo(p);
    const spawnX = this.pickSpawnX();
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
  }

  private nextTankColor(): number {
    const used = new Set<number>();
    this.state.players.forEach((p) => used.add(p.color));
    for (const c of TANK_COLORS) if (!used.has(c)) return c;
    return TANK_COLORS[this.state.players.size % TANK_COLORS.length]!;
  }

  private pickSpawnX(): number {
    const placed: number[] = [];
    this.state.players.forEach((p) => placed.push(p.x));
    const minSpacing = 200;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = 150 + Math.random() * (WORLD.WIDTH - 300);
      if (placed.every((px) => Math.abs(px - x) >= minSpacing)) return x;
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
    this.state.wind = rollWind(this.state.windMax);
    this.state.turnNumber += 1;
    this.nextTurnAt = 0;
    const meta = this.sessions.get(id);
    if (meta?.bot) meta.bot.startTurn(p);
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
          if (meta.bot.wantsToFire(now)) {
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
    if (alive.length <= 1 && this.state.players.size > 1) {
      this.endMatch(alive[0]?.id ?? null);
    }
  }

  private endMatch(winnerSessionId: string | null): void {
    if (this.state.phase === "ended") return;
    this.state.phase = "ended";
    this.state.matchEndedAt = Date.now();
    const winner = winnerSessionId
      ? this.state.players.get(winnerSessionId)
      : null;
    this.state.winnerId = winner?.id ?? "";
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
  }

  private async persistFinishedMatch(winner: Player | null): Promise<void> {
    if (this.persisted) return;
    this.persisted = true;
    const players = Array.from(this.state.players.values());
    const placements: number[] = players.map((p) =>
      winner && p.id === winner.id ? 0 : 1,
    );
    const nonWinners = players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !winner || p.id !== winner.id)
      .sort((a, b) => b.p.damageDealt - a.p.damageDealt);
    nonWinners.forEach(({ i }, rank) => {
      placements[i] = winner ? rank + 1 : rank;
    });
    try {
      await persistMatch({
        mode: this.mode,
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

  private startRematch(): void {
    this.rematchVotes.clear();
    this.persisted = false;
    this.eventLog = [];
    this.state.phase = "waiting";
    this.state.winnerId = "";
    this.state.matchStartedAt = 0;
    this.state.matchEndedAt = 0;
    this.state.turnNumber = 0;
    // New terrain + biome each rematch for variety.
    const newBiome = randomBiome();
    this.state.biome = newBiome;
    const newSeed = Math.floor(Math.random() * 2 ** 31);
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
      const spawnX = this.pickSpawnX();
      p.facing = spawnX < WORLD.WIDTH / 2 ? 1 : -1;
      this.world.spawnTankAt(p, spawnX);
    });
    this.refreshMetadata();
    this.broadcastEvent({
      type: "chat",
      name: "server",
      text: "Rematch: new map ready.",
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

