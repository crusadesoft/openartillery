import { useEffect, useRef, useState } from "react";
import {
  BIOMES,
  type BiomeId,
  type GameMode,
  type MatchPhase,
  type Player,
} from "@artillery/shared";
import { ChatPanel } from "./ChatPanel";
import { SfxButton } from "./SfxButton";
import { Sound } from "../game/audio/Sound";
import { PlayerRoster } from "./lobby/PlayerRoster";
import { MatchSettingsPanel } from "./lobby/MatchSettingsPanel";
import { LobbyVisibilityForm } from "./lobby/LobbyVisibilityForm";
import type { MatchSettings, LobbyConfig } from "./lobby/types";

export type { MatchSettings, LobbyConfig };

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
  const biomePalette = BIOMES[(biome as BiomeId) || "grasslands"];

  const [nameDraft, setNameDraft] = useState(lobbyName);
  useEffect(() => { setNameDraft(lobbyName); }, [lobbyName]);
  const commitName = () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (clean && clean !== lobbyName) onLobbyConfig({ lobbyName: clean });
    else setNameDraft(lobbyName);
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
          <PlayerRoster
            players={players}
            selfId={selfId}
            hostId={hostId}
            maxPlayers={maxPlayers}
            canAddBot={canAddBot}
            canTweakSettings={canTweakSettings}
            onAddBot={onAddBot}
            onRemoveBot={onRemoveBot}
            onSetBotDifficulty={onSetBotDifficulty}
          />
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
              <LobbyVisibilityForm
                players={players.length}
                maxPlayers={maxPlayers}
                biome={biome}
                biomeRandom={biomeRandom}
                visibility={visibility}
                hasPassword={hasPassword}
                onLobbyConfig={onLobbyConfig}
              />
              <MatchSettingsPanel
                turnDurationSec={turnDurationSec}
                fuelPerTurn={fuelPerTurn}
                startingHp={startingHp}
                windMax={windMax}
                onSettings={onSettings}
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
