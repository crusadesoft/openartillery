import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ALL_BIOMES,
  BIOMES,
  BOT_DIFFICULTIES,
  type BarrelStyle,
  type BiomeId,
  type BodyStyle,
  type DecalStyle,
  type GameMode,
  type MatchPhase,
  type PatternStyle,
  type Player,
  type TurretStyle,
} from "@artillery/shared";
import { renderLoadoutCanvas } from "../game/tankPreview";
import { SfxButton } from "./SfxButton";
import { Sound } from "../game/audio/Sound";
import { teamLabel, teamTint } from "./lobby/teamMeta";
import { click } from "./sfx";
import type { MatchSettings, LobbyConfig } from "./lobby/types";

export type { MatchSettings, LobbyConfig };

interface ChatEntry { id: number; name: string; text: string; system?: boolean; color?: number; }

interface Props {
  players: Player[];
  selfId: string;
  hostId: string;
  phase: MatchPhase;
  mode: string;
  rawMode: GameMode;
  biome: string;
  biomeRandom: boolean;
  minPlayers: number;
  maxPlayers: number;
  lobbyName: string;
  visibility: string;
  hasPassword: boolean;
  inviteCode: string;
  startsInMs: number;
  turnDurationSec: number;
  fuelPerTurn: number;
  startingHp: number;
  windMax: number;
  teamMode: boolean;
  teamCount: number;
  friendlyFire: boolean;
  ranked: boolean;
  hasBots: boolean;
  chatEntries: ChatEntry[];
  onReadyToggle: () => void;
  onAddBot: (difficulty: string) => void;
  onRemoveBot: (sessionId: string) => void;
  onSetBotDifficulty: (sessionId: string, difficulty: string) => void;
  onSettings: (patch: Partial<MatchSettings>) => void;
  onLobbyConfig: (patch: Partial<LobbyConfig>) => void;
  onSetTeam: (sessionId: string, team: number) => void;
  onShuffleTeams: () => void;
  onChat: (text: string) => void;
  onLeave: () => void;
}

export function Lobby(props: Props): JSX.Element {
  const {
    players, selfId, hostId, phase, mode, rawMode, biome, biomeRandom,
    minPlayers, maxPlayers, lobbyName, visibility, hasPassword, inviteCode,
    startsInMs, turnDurationSec, fuelPerTurn, startingHp, windMax,
    teamMode, teamCount, friendlyFire, ranked, hasBots, chatEntries,
    onReadyToggle, onAddBot, onRemoveBot, onSetBotDifficulty,
    onSettings, onLobbyConfig, onSetTeam, onShuffleTeams, onChat, onLeave,
  } = props;

  const self = players.find((p) => p.id === selfId);
  const ready = self?.ready ?? false;
  const countdown = Math.ceil(startsInMs / 1000);
  const isHost = selfId === hostId;
  const humans = players.filter((p) => !p.bot);
  const readyCount = humans.filter((p) => p.ready).length;

  const [copied, setCopied] = useState(false);
  const [nameDraft, setNameDraft] = useState(lobbyName);

  useEffect(() => { setNameDraft(lobbyName); }, [lobbyName]);

  useEffect(() => {
    try { Sound.init(); Sound.play("turn"); } catch { /* ignore */ }
  }, []);

  const lastBeepRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "countdown") { lastBeepRef.current = null; return; }
    if (countdown <= 0 || countdown > 6) return;
    if (lastBeepRef.current === countdown) return;
    lastBeepRef.current = countdown;
    try {
      Sound.init();
      Sound.play("turn", { rate: countdown === 1 ? 0.75 : 1.1, volume: 1 });
    } catch { /* ignore */ }
  }, [phase, countdown]);

  const isCasual =
    rawMode === "bots" || rawMode === "private" || rawMode === "custom";
  const canTweak = isCasual && phase === "waiting" && isHost;
  const canAddBot = canTweak && players.length < maxPlayers && !ranked;

  const commitName = () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (clean && clean !== lobbyName) onLobbyConfig({ lobbyName: clean });
    else setNameDraft(lobbyName);
  };

  const copyCode = () => {
    if (!inviteCode) return;
    const url = `${location.origin}${location.pathname}#/game/private?code=${inviteCode}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const biomeLabel = biomeRandom
    ? "Random"
    : (BIOMES[(biome as BiomeId)] ?? BIOMES.grasslands).label;

  const matchTypeLabel = ranked
    ? "Ranked"
    : teamMode
    ? `Teams · ${teamCount}`
    : "FFA";

  const accessLabel =
    visibility === "private" ? (hasPassword ? "Private · 🔒" : "Private") : "Public";

  const hint =
    players.length < minPlayers
      ? `Need ${minPlayers - players.length} more player${
          minPlayers - players.length === 1 ? "" : "s"
        }`
      : phase === "countdown"
      ? "Starting…"
      : readyCount < humans.length
      ? `Waiting on ${humans.length - readyCount}`
      : "All ready";

  return (
    <div className={`briefing-board ${phase === "countdown" ? "countdown" : ""}`}>
      <span className="briefing-cork-fleck f1" aria-hidden />
      <span className="briefing-cork-fleck f2" aria-hidden />
      <span className="briefing-cork-fleck f3" aria-hidden />
      <span className="briefing-cork-fleck f4" aria-hidden />

      <header className="briefing-header">
        <div className="briefing-name brass-plate">
          {canTweak ? (
            <input
              className="briefing-name-input"
              value={nameDraft}
              maxLength={32}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <span className="briefing-name-text">{lobbyName || "Lobby"}</span>
          )}
        </div>

        <div className={`briefing-phase ${phase === "countdown" ? "live" : ""}`}>
          <span className="briefing-phase-led" />
          <span className="briefing-phase-text">
            {phase === "countdown" ? `STARTING ${countdown}s` : "WAITING"}
          </span>
        </div>

        {inviteCode && (
          <button
            type="button"
            className="briefing-invite brass-plate"
            onClick={copyCode}
            title="Click to copy invite link"
          >
            <span className="briefing-invite-label">
              {copied ? "COPIED" : "INVITE"}
            </span>
            <span className="briefing-invite-code">{inviteCode}</span>
          </button>
        )}
      </header>

      <div className="briefing-strip">
        <SettingChip label="Mode" value={mode} readOnly />
        <SettingChip
          label="Biome"
          value={biomeLabel}
          readOnly={!canTweak}
        >
          <BiomePicker
            biome={biome}
            biomeRandom={biomeRandom}
            onChange={(b) => onLobbyConfig({ biome: b })}
          />
        </SettingChip>
        <SettingChip
          label="Crew"
          value={`${players.length}/${maxPlayers}`}
          readOnly={!canTweak}
        >
          <PopoverSlider label="Max players" min={Math.max(2, players.length)} max={8} step={1}
            value={maxPlayers} onChange={(v) => onLobbyConfig({ maxPlayers: v })} />
        </SettingChip>
        <SettingChip
          label="Turn"
          value={`${turnDurationSec}s`}
          readOnly={!canTweak}
        >
          <PopoverSlider label="Turn time" unit="s" min={10} max={90} step={5}
            value={turnDurationSec} onChange={(v) => onSettings({ turnDurationSec: v })} />
        </SettingChip>
        <SettingChip
          label="HP"
          value={`${startingHp}`}
          readOnly={!canTweak}
        >
          <PopoverSlider label="Starting HP" min={100} max={600} step={25}
            value={startingHp} onChange={(v) => onSettings({ startingHp: v })} />
        </SettingChip>
        <SettingChip
          label="Fuel"
          value={`${fuelPerTurn}`}
          readOnly={!canTweak}
        >
          <PopoverSlider label="Fuel per turn" min={0} max={200} step={10}
            value={fuelPerTurn} onChange={(v) => onSettings({ fuelPerTurn: v })} />
        </SettingChip>
        <SettingChip
          label="Wind"
          value={`${windMax}`}
          readOnly={!canTweak}
        >
          <PopoverSlider label="Max wind" min={0} max={60} step={5}
            value={windMax} onChange={(v) => onSettings({ maxWind: v })} />
        </SettingChip>
        {isCasual && (
          <SettingChip
            label="Type"
            value={matchTypeLabel}
            readOnly={!canTweak}
          >
            <MatchTypePopover
              ranked={ranked}
              teamMode={teamMode}
              teamCount={teamCount}
              friendlyFire={friendlyFire}
              hasBots={hasBots}
              onChange={(patch) => onLobbyConfig(patch)}
              onShuffleTeams={onShuffleTeams}
            />
          </SettingChip>
        )}
        {isCasual && (
          <SettingChip
            label="Access"
            value={accessLabel}
            readOnly={!canTweak}
            tone={visibility === "private" ? "warn" : undefined}
          >
            <AccessPopover
              visibility={visibility as "public" | "private"}
              hasPassword={hasPassword}
              onChange={(patch) => onLobbyConfig(patch)}
            />
          </SettingChip>
        )}
        <span className="briefing-strip-spacer" />
        <span className="briefing-ready-count">
          <span className="briefing-ready-led" />
          {readyCount}/{humans.length} ready
        </span>
      </div>

      <div className="briefing-body">
        <aside className="briefing-roster">
          <div className="briefing-roster-head">
            <span>Crew</span>
            <span className="briefing-roster-count">{players.length}/{maxPlayers}</span>
          </div>
          <ul className="briefing-crew">
            {players.map((p) => (
              <CrewTag
                key={p.id}
                player={p}
                isHost={p.id === hostId}
                isSelf={p.id === selfId}
                viewerIsHost={isHost}
                canTweak={canTweak}
                teamMode={teamMode}
                teamCount={teamCount}
                onSetTeam={onSetTeam}
                onSetBotDifficulty={onSetBotDifficulty}
                onRemoveBot={onRemoveBot}
              />
            ))}
            {players.length === 0 && (
              <li className="briefing-crew-empty">No one here yet.</li>
            )}
          </ul>
          {canAddBot && (
            <SfxButton
              className="briefing-add-bot-btn"
              onClick={() => { click(); onAddBot("normal"); }}
            >
              + Add Bot
            </SfxButton>
          )}
        </aside>

        <main className="briefing-crt-station">
          <BriefingCrtChat entries={chatEntries} onSend={onChat} />
        </main>
      </div>

      <footer className="briefing-footer">
        <span className="hazard-stripe-band briefing-hazard" aria-hidden />
        <SfxButton className="ghost-btn briefing-leave" onClick={onLeave}>
          ← Leave
        </SfxButton>
        <div className="briefing-footer-hint">{hint}</div>
        <SfxButton
          className={`briefing-ready-btn ${ready ? "armed" : ""}`}
          disabled={phase === "countdown"}
          onClick={onReadyToggle}
        >
          {ready ? "Cancel" : humans.length <= 1 ? "Start" : "Ready"}
        </SfxButton>
      </footer>
    </div>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────── */

function SettingChip({
  label, value, readOnly, tone, children,
}: {
  label: string;
  value: ReactNode;
  readOnly?: boolean;
  tone?: "ok" | "warn";
  children?: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cls = `briefing-chip${tone ? ` ${tone}` : ""}${readOnly ? "" : " editable"}${open ? " open" : ""}`;

  return (
    <span className="briefing-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className={cls}
        disabled={readOnly}
        onClick={() => !readOnly && setOpen((v) => !v)}
        title={readOnly ? undefined : `Edit ${label.toLowerCase()}`}
      >
        <span className="briefing-chip-label">{label}</span>
        <span className="briefing-chip-value">{value}</span>
      </button>
      {open && !readOnly && children && (
        <div className="briefing-popover" role="dialog">
          {children}
        </div>
      )}
    </span>
  );
}

function PopoverSlider({
  label, unit, min, max, step, value, onChange,
}: {
  label: string; unit?: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className="popover-slider">
      <div className="popover-slider-head">
        <span>{label}</span>
        <span className="popover-slider-value">{value}{unit ?? ""}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function BiomePicker({
  biome, biomeRandom, onChange,
}: {
  biome: string;
  biomeRandom: boolean;
  onChange: (b: string) => void;
}): JSX.Element {
  const current = biomeRandom ? "random" : biome;
  return (
    <div className="popover-pills">
      <button
        type="button"
        className={`briefing-pill ${current === "random" ? "active" : ""}`}
        onClick={() => { click(); if (current !== "random") onChange("random"); }}
        title="Re-rolls when match starts"
      >
        Random
      </button>
      {ALL_BIOMES.map((b) => (
        <button
          key={b}
          type="button"
          className={`briefing-pill ${current === b ? "active" : ""}`}
          onClick={() => { click(); if (b !== current) onChange(b); }}
          title={BIOMES[b].blurb}
        >
          {BIOMES[b].label}
        </button>
      ))}
    </div>
  );
}

function MatchTypePopover({
  ranked, teamMode, teamCount, friendlyFire, hasBots,
  onChange, onShuffleTeams,
}: {
  ranked: boolean;
  teamMode: boolean;
  teamCount: number;
  friendlyFire: boolean;
  hasBots: boolean;
  onChange: (patch: Partial<LobbyConfig>) => void;
  onShuffleTeams: () => void;
}): JSX.Element {
  return (
    <div className="popover-stack">
      <label className="popover-row">
        <input
          type="checkbox"
          checked={ranked}
          disabled={hasBots && !ranked}
          onChange={(e) => onChange({ ranked: e.target.checked })}
        />
        <span>Ranked <em>(no bots, MMR applies)</em></span>
      </label>
      {hasBots && !ranked && (
        <div className="popover-hint">Remove bots to enable ranked.</div>
      )}
      <label className="popover-row">
        <input
          type="checkbox"
          checked={teamMode}
          onChange={(e) => onChange({ teamMode: e.target.checked })}
        />
        <span>Teams</span>
      </label>
      {teamMode && (
        <>
          <PopoverSlider label="Number of teams" min={2} max={4} step={1}
            value={teamCount} onChange={(v) => onChange({ teamCount: v })} />
          <label className="popover-row">
            <input
              type="checkbox"
              checked={friendlyFire}
              onChange={(e) => onChange({ friendlyFire: e.target.checked })}
            />
            <span>Friendly fire</span>
          </label>
          <SfxButton className="popover-btn" onClick={onShuffleTeams}>
            Shuffle Teams
          </SfxButton>
        </>
      )}
    </div>
  );
}

function AccessPopover({
  visibility, hasPassword, onChange,
}: {
  visibility: "public" | "private";
  hasPassword: boolean;
  onChange: (patch: Partial<LobbyConfig>) => void;
}): JSX.Element {
  const [pwDraft, setPwDraft] = useState("");
  useEffect(() => { if (!hasPassword) setPwDraft(""); }, [hasPassword]);

  return (
    <div className="popover-stack">
      <div className="popover-pills">
        <button
          type="button"
          className={`briefing-pill ${visibility === "public" ? "active" : ""}`}
          onClick={() => { click(); if (visibility !== "public") onChange({ visibility: "public" }); }}
        >
          Public
        </button>
        <button
          type="button"
          className={`briefing-pill ${visibility === "private" ? "active" : ""}`}
          onClick={() => { click(); if (visibility !== "private") onChange({ visibility: "private" }); }}
        >
          Private
        </button>
      </div>
      {visibility === "private" && (
        <div className="popover-pw">
          <label className="popover-pw-label">
            Password
            <span style={{ color: hasPassword ? "var(--ok)" : "var(--ink-faint)" }}>
              {hasPassword ? " · set" : " · none"}
            </span>
          </label>
          <div className="popover-pw-row">
            <input
              type="text"
              className="popover-pw-input"
              value={pwDraft}
              placeholder={hasPassword ? "type to replace" : "(optional)"}
              maxLength={64}
              onChange={(e) => setPwDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              onBlur={() => {
                if (pwDraft) { onChange({ password: pwDraft }); setPwDraft(""); }
              }}
              name="room-passcode"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              data-bwignore=""
              data-form-type="other"
              style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
            />
            {hasPassword && (
              <SfxButton
                className="popover-btn ghost"
                onClick={() => { setPwDraft(""); onChange({ password: "" }); }}
              >
                Clear
              </SfxButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── CRT Chat ─────────────────────────────────────────────────────
   The chat log lives on the picture tube (green phosphor over scanlines);
   the input lives in the chunky beige keyboard chassis below as the
   spacebar / typing strip. */

function nameColor(c: number): string {
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const MIN = 0.65;
  if (lum < MIN) {
    const t = (MIN - lum) / (1 - lum);
    r = Math.round(r + (255 - r) * t);
    g = Math.round(g + (255 - g) * t);
    b = Math.round(b + (255 - b) * t);
  }
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function BriefingCrtChat({
  entries, onSend,
}: {
  entries: ChatEntry[];
  onSend: (text: string) => void;
}): JSX.Element {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) onSend(trimmed);
    setText("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.blur();
      setText("");
    }
  };

  return (
    <>
      <div className="crt-cabinet">
        <span className="crt-vent" aria-hidden />
        <div className="crt-screen-mount">
          <div className="crt-tube">
            <div
              className="crt-log"
              ref={logRef}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {entries.length === 0 ? (
                <div className="crt-log-empty">— no transmissions —</div>
              ) : (
                entries.map((e) => (
                  <div key={e.id} className={e.system ? "crt-line system" : "crt-line"}>
                    {e.system ? (
                      <span className="crt-line-system">▌ {e.text}</span>
                    ) : (
                      <>
                        <span
                          className="crt-line-name"
                          style={e.color !== undefined ? { color: nameColor(e.color) } : undefined}
                        >
                          {e.name}:
                        </span>{" "}
                        <span className="crt-line-text">{e.text}</span>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="crt-prompt-line">
              <span className="crt-prompt" aria-hidden>{">"}</span>
              <input
                ref={inputRef}
                className="crt-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="press ENTER to transmit…"
                maxLength={140}
              />
            </div>
            <span className="crt-scanlines" aria-hidden />
            <span className="crt-vignette" aria-hidden />
            <span className="crt-glare" aria-hidden />
          </div>
        </div>
        <div className="crt-chin">
          <span className="crt-led on" />
          <span className="crt-brand">FIELD · MODEL 7G</span>
          <span className="crt-speaker" />
        </div>
      </div>
    </>
  );
}

function CrewTag({
  player, isHost, isSelf, viewerIsHost, canTweak, teamMode, teamCount,
  onSetTeam, onSetBotDifficulty, onRemoveBot,
}: {
  player: Player;
  isHost: boolean;
  isSelf: boolean;
  viewerIsHost: boolean;
  canTweak: boolean;
  teamMode: boolean;
  teamCount: number;
  onSetTeam: (sessionId: string, team: number) => void;
  onSetBotDifficulty: (sessionId: string, difficulty: string) => void;
  onRemoveBot: (sessionId: string) => void;
}): JSX.Element {
  const ready = player.bot || player.ready;

  const tilt = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < player.id.length; i++) {
      h ^= player.id.charCodeAt(i); h = Math.imul(h, 16777619);
    }
    return ((Math.abs(h) % 7) - 3) * 0.4;
  }, [player.id]);

  const pinHue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < player.id.length; i++) h = (h * 31 + player.id.charCodeAt(i)) & 0xffff;
    const palette = ["#a82a1f", "#d2a73f", "#3a6b8a", "#3a7a3a", "#7a3a8a"];
    return palette[h % palette.length]!;
  }, [player.id]);

  const tc = Math.max(2, teamCount);
  const teamEditable =
    teamMode && ((player.bot && viewerIsHost) || (!player.bot && isSelf));
  const teamN = player.team;
  const teamLetter = teamN >= 1 && teamN <= tc ? String.fromCharCode(64 + teamN) : "?";
  const teamColor = teamN >= 1 && teamN <= tc ? teamTint(teamN) : "var(--paper-ink-dim)";
  const cycleTeam = () => {
    if (!teamEditable) return;
    click();
    onSetTeam(player.id, ((teamN || 0) + 1) % (tc + 1));
  };

  const cycleBotDiff = () => {
    if (!canTweak) return;
    click();
    const list = BOT_DIFFICULTIES;
    const i = list.indexOf((player.difficulty || "normal") as (typeof list)[number]);
    const next = list[(i + 1) % list.length]!;
    onSetBotDifficulty(player.id, next);
  };

  return (
    <li
      className={`crew-tag ${ready ? "ready" : ""} ${player.bot ? "bot" : ""}`}
      style={{ ["--tag-tilt" as string]: `${tilt}deg` }}
    >
      <span
        className="crew-tag-pin"
        aria-hidden
        style={{ ["--pin-color" as string]: pinHue }}
      />
      <div
        className="crew-tag-photo"
        style={{ ["--photo-tint" as string]: hex(player.color) }}
      >
        <CrewTankThumb player={player} />
        {isHost && <span className="crew-tag-co-stamp">CO</span>}
        {ready && <span className="crew-tag-ready-stamp">READY</span>}
        {canTweak && player.bot && (
          <button
            type="button"
            className="crew-tag-kick"
            onClick={() => { click(); onRemoveBot(player.id); }}
            title="Remove bot"
          >
            ×
          </button>
        )}
      </div>
      <div className="crew-tag-caption">
        <div className="crew-tag-name">
          {player.name}
          {isSelf && <span className="crew-tag-you"> (you)</span>}
        </div>
        <div className="crew-tag-meta-row">
          {player.bot ? (
            <button
              type="button"
              className="crew-tag-meta"
              disabled={!canTweak}
              onClick={cycleBotDiff}
              title={canTweak ? "Cycle difficulty" : undefined}
            >
              BOT · {(player.difficulty || "normal").toUpperCase()}
            </button>
          ) : (
            <span className="crew-tag-meta">
              {player.userId ? `${player.mmr} MMR` : "GUEST"}
            </span>
          )}
          {teamMode && (
            <button
              type="button"
              className={`crew-tag-team ${teamEditable ? "" : "locked"}`}
              style={{ ["--team-color" as string]: teamColor }}
              disabled={!teamEditable}
              onClick={cycleTeam}
              title={teamN ? teamLabel(teamN) : "Auto"}
            >
              {teamLetter}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function hex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

function CrewTankThumb({ player }: { player: Player }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 110, H = 70;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderLoadoutCanvas(ctx, {
      width: W, height: H,
      bodyStyle: (player.bodyStyle || "heavy") as BodyStyle,
      turretStyle: (player.turretStyle || "standard") as TurretStyle,
      barrelStyle: (player.barrelStyle || "standard") as BarrelStyle,
      primary: hex(player.color),
      accent: hex(player.accentColor),
      pattern: (player.pattern || "solid") as PatternStyle,
      patternColor: hex(player.patternColor),
      decal: (player.decal || "none") as DecalStyle,
      showDeck: false,
      marginTop: 4,
      marginBottom: 4,
    });
  }, [
    player.bodyStyle, player.turretStyle, player.barrelStyle,
    player.color, player.accentColor,
    player.pattern, player.patternColor, player.decal,
  ]);
  return <canvas ref={ref} style={{ width: "100%", height: H, display: "block" }} />;
}
