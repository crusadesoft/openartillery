import { useEffect, useRef, useState } from "react";
import {
  ALL_BIOMES,
  BIOMES,
  type BiomeId,
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_SPECS,
  type GameMode,
  type MatchPhase,
  type Player,
} from "@artillery/shared";
import { ChatPanel } from "./ChatPanel";
import { SfxButton } from "./SfxButton";
import { click } from "./sfx";
import { Sound } from "../game/audio/Sound";

interface ChatEntry { id: number; name: string; text: string; system?: boolean; }

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
  chatEntries: ChatEntry[];
  onReadyToggle: () => void;
  onAddBot: (difficulty: string) => void;
  onRemoveBot: (sessionId: string) => void;
  onSetBotDifficulty: (sessionId: string, difficulty: string) => void;
  onSettings: (patch: Partial<MatchSettings>) => void;
  onLobbyConfig: (patch: Partial<LobbyConfig>) => void;
  onChat: (text: string) => void;
  onLeave: () => void;
}

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

export function Lobby({
  players,
  selfId,
  hostId,
  phase,
  mode,
  rawMode,
  biome,
  biomeRandom,
  minPlayers,
  maxPlayers,
  lobbyName,
  visibility,
  hasPassword,
  inviteCode,
  startsInMs,
  turnDurationSec,
  fuelPerTurn,
  startingHp,
  windMax,
  chatEntries,
  onReadyToggle,
  onAddBot,
  onRemoveBot,
  onSetBotDifficulty,
  onSettings,
  onLobbyConfig,
  onChat,
  onLeave,
}: Props): JSX.Element {
  const self = players.find((p) => p.id === selfId);
  const ready = self?.ready ?? false;
  const countdown = Math.ceil(startsInMs / 1000);
  const isHost = selfId === hostId;
  const humans = players.filter((p) => !p.bot);
  const readyCount = humans.filter((p) => p.ready).length;
  const [copied, setCopied] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState("normal");
  const biomePalette = BIOMES[(biome as BiomeId) || "grasslands"];

  const [nameDraft, setNameDraft] = useState(lobbyName);
  useEffect(() => { setNameDraft(lobbyName); }, [lobbyName]);
  const commitName = () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (clean && clean !== lobbyName) onLobbyConfig({ lobbyName: clean });
    else setNameDraft(lobbyName);
  };

  const [pwDraft, setPwDraft] = useState("");
  // After the server confirms a password change, hasPassword flips; clear
  // the local draft so the input stops showing the host's fresh keystrokes.
  useEffect(() => { if (!hasPassword) setPwDraft(""); }, [hasPassword]);
  const commitPassword = () => {
    const next = pwDraft;
    // Only send when something would actually change. Sending "" clears.
    onLobbyConfig({ password: next });
    setPwDraft("");
  };

  // Beep once per second during the pre-match countdown.
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

  const copyCode = () => {
    if (!inviteCode) return;
    const url = `${location.origin}${location.pathname}#/game/private?code=${inviteCode}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const isCasual =
    rawMode === "bots" || rawMode === "private" || rawMode === "custom";
  // Host-only controls: bot roster + lobby/match settings. Guests see the
  // roster but not the editing affordances. The server double-checks.
  const canTweakLobby = isCasual && phase === "waiting" && isHost;
  const canAddBot = canTweakLobby && players.length < maxPlayers;
  const canTweakSettings = canTweakLobby;

  return (
    <div className="lobby-stage">
      <header className="lobby-stage-header">
        <div className="lobby-stage-title">
          {canTweakLobby ? (
            <input
              className="lobby-stage-name-input"
              value={nameDraft}
              maxLength={32}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <h1>{lobbyName || "Lobby"}</h1>
          )}
          <div className="lobby-stage-sub">
            {phase === "countdown" ? (
              <span className="lobby-stage-countdown">
                MATCH STARTS IN {countdown}s
              </span>
            ) : (
              <>
                <span className="lobby-stage-chip">{mode}</span>
                <span className="lobby-stage-chip">
                  {biomeRandom ? "??? Random biome" : biomePalette.label}
                </span>
                {isCasual && (
                  <span className={`lobby-stage-chip ${visibility === "private" ? "warn" : "ok"}`}>
                    {visibility === "private" ? "Private" : "Public"}
                  </span>
                )}
                <span className="lobby-stage-chip muted">
                  {readyCount}/{humans.length} ready
                </span>
              </>
            )}
          </div>
        </div>
        {inviteCode && (
          <div className="lobby-stage-invite" onClick={copyCode} title="Click to copy invite link">
            <div className="lobby-stage-invite-label">
              {copied ? "LINK COPIED" : "INVITE CODE"}
            </div>
            <div className="lobby-stage-invite-code">{inviteCode}</div>
          </div>
        )}
      </header>

      <div className="lobby-stage-body">
        <aside className="lobby-stage-left">
          <div className="lobby-stage-section-title">
            Crew · {players.length}/{maxPlayers}
          </div>
          <ul className="lobby-players">
            {players.map((p) => (
              <li key={p.id}>
                <span className={`dot ${p.ready ? "ready" : ""}`} />
                <span style={{ flex: 1 }}>
                  {p.name}
                  {p.id === hostId ? " ★" : ""}
                  {p.id === selfId ? " (you)" : ""}
                </span>
                {p.bot ? (
                  <button
                    className="bot-diff-btn"
                    title="Cycle bot difficulty"
                    disabled={!canTweakSettings}
                    onClick={() => {
                      if (!canTweakSettings) return;
                      click();
                      const list = BOT_DIFFICULTIES;
                      const i = list.indexOf((p.difficulty || "normal") as (typeof list)[number]);
                      const next = list[(i + 1) % list.length]!;
                      onSetBotDifficulty(p.id, next);
                    }}
                  >
                    BOT · {p.difficulty?.toUpperCase() || "NORMAL"}
                  </button>
                ) : (
                  <span className="role">
                    {p.userId ? `${p.mmr} MMR` : "GUEST"}
                  </span>
                )}
                <span
                  className="role"
                  style={{ color: p.ready ? "var(--ok)" : "var(--ink-faint)" }}
                >
                  {p.bot ? "READY" : p.ready ? "READY" : "WAITING"}
                </span>
                {canTweakSettings && p.bot && (
                  <button
                    className="kick-btn"
                    title="Remove bot"
                    onClick={() => { click(); onRemoveBot(p.id); }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
            {players.length === 0 && (
              <li style={{ color: "var(--ink-faint)" }}>No one here yet.</li>
            )}
          </ul>

          {canAddBot && (
            <div className="lobby-stage-addbot">
              <div className="lobby-stage-section-title">Add bot</div>
              <div className="pill-row">
                {BOT_DIFFICULTIES.map((d) => (
                  <div
                    key={d}
                    className={`pill ${botDifficulty === d ? "active" : ""}`}
                    onClick={() => { click(); setBotDifficulty(d); }}
                  >
                    {BOT_DIFFICULTY_SPECS[d].label}
                  </div>
                ))}
              </div>
              <SfxButton
                className="secondary-btn"
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => onAddBot(botDifficulty)}
              >
                + Bot ({BOT_DIFFICULTY_SPECS[botDifficulty as "normal"].label})
              </SfxButton>
            </div>
          )}
        </aside>

        <main className="lobby-stage-chat">
          <div className="lobby-stage-chat-welcome">
            Welcome to the lobby. Say hi, ready up, and we'll roll out.
          </div>
          <ChatPanel
            entries={chatEntries}
            onSend={onChat}
            variant="embedded"
            placeholder="Say hi…  (Enter sends)"
          />
        </main>

        <aside className="lobby-stage-right">
          {canTweakLobby ? (
            <>
              <div className="lobby-stage-section-title">Lobby settings</div>
              <div className="field" style={{ marginBottom: 10 }}>
                <div className="match-setting-head">
                  <span>Max players</span>
                  <span className="match-setting-value">{maxPlayers}</span>
                </div>
                <input
                  type="range"
                  min={Math.max(2, players.length)}
                  max={8}
                  step={1}
                  value={maxPlayers}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v !== maxPlayers) onLobbyConfig({ maxPlayers: v });
                  }}
                />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Biome</label>
                <div className="pill-row">
                  <div
                    className={`pill ${biomeRandom ? "active" : ""}`}
                    onClick={() => { click(); onLobbyConfig({ biome: "random" }); }}
                    title="Stay a mystery — biome re-rolls when the match starts"
                  >
                    Random · ???
                  </div>
                  {ALL_BIOMES.map((b) => (
                    <div
                      key={b}
                      className={`pill ${biome === b && !biomeRandom ? "active" : ""}`}
                      onClick={() => {
                        click();
                        if (b !== biome) onLobbyConfig({ biome: b });
                      }}
                      title={BIOMES[b].blurb}
                    >
                      {BIOMES[b].label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Visibility</label>
                <div className="pill-row">
                  <div
                    className={`pill ${visibility === "public" ? "active" : ""}`}
                    onClick={() => {
                      click();
                      if (visibility !== "public") onLobbyConfig({ visibility: "public" });
                    }}
                  >
                    Public
                  </div>
                  <div
                    className={`pill ${visibility === "private" ? "active" : ""}`}
                    onClick={() => {
                      click();
                      if (visibility !== "private") onLobbyConfig({ visibility: "private" });
                    }}
                  >
                    Private
                  </div>
                </div>
              </div>

              {visibility === "private" && (
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>
                    Password{" "}
                    <span
                      style={{
                        color: hasPassword ? "var(--ok)" : "var(--ink-faint)",
                        fontSize: 10,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        marginLeft: 6,
                      }}
                    >
                      {hasPassword ? "· active" : "· none"}
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={pwDraft}
                      placeholder={hasPassword ? "Passcode set — type to replace" : "(optional) set a passcode"}
                      maxLength={64}
                      onChange={(e) => setPwDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      onBlur={() => {
                        if (pwDraft) commitPassword();
                      }}
                      // This is a throwaway room passcode, not a real
                      // credential — keep password managers from offering
                      // to save or autofill it.
                      name="room-passcode"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore=""
                      data-lpignore="true"
                      data-bwignore=""
                      data-form-type="other"
                      style={{ flex: 1, WebkitTextSecurity: "disc" } as React.CSSProperties}
                    />
                    {hasPassword && (
                      <SfxButton
                        className="ghost-btn"
                        title="Remove password"
                        onClick={() => {
                          setPwDraft("");
                          onLobbyConfig({ password: "" });
                        }}
                      >
                        Clear
                      </SfxButton>
                    )}
                  </div>
                </div>
              )}

              <div className="lobby-stage-section-title">Match settings</div>
              <Slider
                label="Turn Time" unit="s"
                min={10} max={90} step={5}
                value={turnDurationSec}
                onChange={(v) => onSettings({ turnDurationSec: v })}
              />
              <Slider
                label="Fuel"
                min={0} max={200} step={10}
                value={fuelPerTurn}
                onChange={(v) => onSettings({ fuelPerTurn: v })}
              />
              <Slider
                label="Starting HP"
                min={100} max={600} step={25}
                value={startingHp}
                onChange={(v) => onSettings({ startingHp: v })}
              />
              <Slider
                label="Max Wind"
                min={0} max={60} step={5}
                value={windMax}
                onChange={(v) => onSettings({ maxWind: v })}
              />
            </>
          ) : (
            <div className="lobby-stage-host-notice">
              <div className="lobby-stage-section-title">Match preview</div>
              <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.5 }}>
                The host sets the rules. Get ready when you're in.
              </p>
              <dl className="lobby-stage-stats">
                <dt>Turn time</dt><dd>{turnDurationSec}s</dd>
                <dt>Starting HP</dt><dd>{startingHp}</dd>
                <dt>Fuel / turn</dt><dd>{fuelPerTurn}</dd>
                <dt>Max wind</dt><dd>{windMax}</dd>
              </dl>
            </div>
          )}
        </aside>
      </div>

      <footer className="lobby-stage-footer">
        <SfxButton className="ghost-btn" onClick={onLeave}>← Leave</SfxButton>
        <div className="lobby-stage-footer-hint">
          {players.length < minPlayers
            ? `Need ${minPlayers - players.length} more player${
                minPlayers - players.length === 1 ? "" : "s"
              }`
            : readyCount < humans.length
            ? `Waiting on ${humans.length - readyCount} more to ready up`
            : phase === "countdown"
            ? "All set — kicking off"
            : "All ready!"}
        </div>
        <SfxButton
          className={ready ? "danger-btn" : "go-btn"}
          onClick={onReadyToggle}
          disabled={phase === "countdown"}
        >
          {ready ? "Cancel Ready" : "I'm Ready"}
        </SfxButton>
      </footer>
    </div>
  );
}

function Slider({
  label, unit, min, max, step, value, onChange,
}: {
  label: string; unit?: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="match-setting-row">
      <div className="match-setting-head">
        <span>{label}</span>
        <span className="match-setting-value">{value}{unit ?? ""}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
