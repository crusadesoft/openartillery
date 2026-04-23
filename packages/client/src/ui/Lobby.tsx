import { useEffect, useRef, useState } from "react";
import { BIOMES, type BiomeId, BOT_DIFFICULTIES, BOT_DIFFICULTY_SPECS, MODES, type GameMode, type MatchPhase, type Player } from "@artillery/shared";
import { SfxButton } from "./SfxButton";
import { click } from "./sfx";
import { Sound } from "../game/audio/Sound";

interface Props {
  players: Player[];
  selfId: string;
  phase: MatchPhase;
  mode: string;
  rawMode: GameMode;
  biome: string;
  minPlayers: number;
  inviteCode: string;
  startsInMs: number;
  turnDurationSec: number;
  fuelPerTurn: number;
  startingHp: number;
  windMax: number;
  onReadyToggle: () => void;
  onAddBot: (difficulty: string) => void;
  onRemoveBot: (sessionId: string) => void;
  onSetBotDifficulty: (sessionId: string, difficulty: string) => void;
  onSettings: (patch: Partial<MatchSettings>) => void;
  onLeave: () => void;
}

export interface MatchSettings {
  turnDurationSec: number;
  fuelPerTurn: number;
  startingHp: number;
  maxWind: number;
}

export function Lobby({
  players,
  selfId,
  phase,
  mode,
  rawMode,
  biome,
  minPlayers,
  inviteCode,
  startsInMs,
  turnDurationSec,
  fuelPerTurn,
  startingHp,
  windMax,
  onReadyToggle,
  onAddBot,
  onRemoveBot,
  onSetBotDifficulty,
  onSettings,
  onLeave,
}: Props): JSX.Element {
  const self = players.find((p) => p.id === selfId);
  const ready = self?.ready ?? false;
  const countdown = Math.ceil(startsInMs / 1000);
  const [copied, setCopied] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState("normal");
  const biomePalette = BIOMES[(biome as BiomeId) || "grasslands"];

  // Beep once per second during the pre-match countdown so the player
  // knows time is actually passing.
  const lastBeepRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "countdown") { lastBeepRef.current = null; return; }
    if (countdown <= 0 || countdown > 6) return;
    if (lastBeepRef.current === countdown) return;
    lastBeepRef.current = countdown;
    try {
      Sound.init();
      // Lower pitch on final tick for a "go!" feel.
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

  const canAddBot =
    (rawMode === "bots" || rawMode === "private") &&
    phase === "waiting" &&
    players.length < MODES[rawMode].maxPlayers;
  const canTweakSettings =
    (rawMode === "bots" || rawMode === "private") && phase === "waiting";

  return (
    <div className="screen">
      <div className="center-card">
        <h1>Lobby</h1>
        <p className="tagline">
          {phase === "countdown"
            ? `Starting in ${countdown}s · ${mode}`
            : `${mode} · ${biomePalette.label}`}
        </p>

        {inviteCode && (
          <>
            <div className="invite-code" onClick={copyCode} title="click to copy invite link">
              {inviteCode}
            </div>
            <p
              style={{
                color: copied ? "var(--ok)" : "var(--ink-faint)",
                fontSize: 11,
                marginTop: -6,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              {copied ? "Link copied" : "Click code to copy invite link"}
            </p>
          </>
        )}

        <ul className="lobby-players">
          {players.map((p) => (
            <li key={p.id}>
              <span className={`dot ${p.ready ? "ready" : ""}`} />
              <span style={{ flex: 1 }}>
                {p.name}
                {p.id === selfId ? " (you)" : ""}
              </span>
              {p.bot ? (
                <button
                  className="bot-diff-btn"
                  title="Cycle bot difficulty"
                  onClick={() => {
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
                {p.ready ? "READY" : "WAITING"}
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

        {canTweakSettings && (
          <div className="match-settings">
            <div className="match-settings-label">// MATCH SETTINGS</div>
            <Slider
              label="Turn Time"
              unit="s"
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
              min={50} max={200} step={10}
              value={startingHp}
              onChange={(v) => onSettings({ startingHp: v })}
            />
            <Slider
              label="Max Wind"
              min={0} max={60} step={5}
              value={windMax}
              onChange={(v) => onSettings({ maxWind: v })}
            />
          </div>
        )}

        {canAddBot && (
          <div style={{ marginBottom: 14 }}>
            <div
              className="label"
              style={{
                fontSize: 10,
                color: "var(--ink-faint)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Add bot
            </div>
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
              style={{ marginTop: 8 }}
              onClick={() => onAddBot(botDifficulty)}
            >
              + Bot ({BOT_DIFFICULTY_SPECS[botDifficulty as "normal"].label})
            </SfxButton>
          </div>
        )}

        <p
          className="tagline"
          style={{ fontSize: 12, margin: "4px 0 12px" }}
        >
          Need {Math.max(0, minPlayers - players.length)} more, then all ready.
        </p>
        <SfxButton
          className={ready ? "danger-btn" : "go-btn"}
          onClick={onReadyToggle}
          disabled={phase === "countdown"}
        >
          {ready ? "Cancel Ready" : "I'm Ready"}
        </SfxButton>
        <SfxButton className="ghost-btn" onClick={onLeave}>
          ← Leave lobby
        </SfxButton>
      </div>
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
