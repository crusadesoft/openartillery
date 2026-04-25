import { useEffect, useRef, useState } from "react";
import {
  ALL_BIOMES,
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
import { ChipMenu } from "./lobby/ChipMenu";
import { Slider } from "./lobby/Slider";
import { click } from "./sfx";
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
  teamMode,
  teamCount,
  friendlyFire,
  ranked,
  hasBots,
  chatEntries,
  onReadyToggle,
  onAddBot,
  onRemoveBot,
  onSetBotDifficulty,
  onSettings,
  onLobbyConfig,
  onSetTeam,
  onShuffleTeams,
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

  const [pwDraft, setPwDraft] = useState("");
  useEffect(() => { if (!hasPassword) setPwDraft(""); }, [hasPassword]);

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
  const canTweakLobby = isCasual && phase === "waiting" && isHost;
  const canAddBot = canTweakLobby && players.length < maxPlayers && !ranked;
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
                <ChipMenu label={mode} readOnly title="Game mode">
                  {null}
                </ChipMenu>

                <ChipMenu
                  label={`${players.length}/${maxPlayers} crew`}
                  readOnly={!canTweakLobby}
                  title="Crew size"
                >
                  <div className="chip-menu-title">Max players</div>
                  <Slider
                    label="Max"
                    min={Math.max(2, players.length)}
                    max={8}
                    step={1}
                    value={maxPlayers}
                    onChange={(v) => v !== maxPlayers && onLobbyConfig({ maxPlayers: v })}
                  />
                </ChipMenu>

                <ChipMenu
                  label={biomeRandom ? "??? Biome" : biomePalette.label}
                  readOnly={!canTweakLobby}
                  title="Biome"
                >
                  <div className="chip-menu-title">Biome</div>
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
                        onClick={() => { click(); if (b !== biome) onLobbyConfig({ biome: b }); }}
                        title={BIOMES[b].blurb}
                      >
                        {BIOMES[b].label}
                      </div>
                    ))}
                  </div>
                </ChipMenu>

                {isCasual && (
                  <ChipMenu
                    label={visibility === "private" ? (hasPassword ? "Private · 🔒" : "Private") : "Public"}
                    tone={visibility === "private" ? "warn" : "ok"}
                    readOnly={!canTweakLobby}
                    title="Access"
                  >
                    <div className="chip-menu-title">Access</div>
                    <div className="pill-row">
                      <div
                        className={`pill ${visibility === "public" ? "active" : ""}`}
                        onClick={() => { click(); if (visibility !== "public") onLobbyConfig({ visibility: "public" }); }}
                      >
                        Public
                      </div>
                      <div
                        className={`pill ${visibility === "private" ? "active" : ""}`}
                        onClick={() => { click(); if (visibility !== "private") onLobbyConfig({ visibility: "private" }); }}
                      >
                        Private
                      </div>
                    </div>
                    {visibility === "private" && (
                      <div className="field" style={{ marginTop: 10 }}>
                        <label>
                          Password{" "}
                          <span style={{ color: hasPassword ? "var(--ok)" : "var(--ink-faint)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", marginLeft: 6 }}>
                            {hasPassword ? "· active" : "· none"}
                          </span>
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="text"
                            value={pwDraft}
                            placeholder={hasPassword ? "Set — type to replace" : "(optional) set a passcode"}
                            maxLength={64}
                            onChange={(e) => setPwDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            onBlur={() => { if (pwDraft) { onLobbyConfig({ password: pwDraft }); setPwDraft(""); } }}
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
                            <SfxButton className="ghost-btn" title="Remove password" onClick={() => { setPwDraft(""); onLobbyConfig({ password: "" }); }}>
                              Clear
                            </SfxButton>
                          )}
                        </div>
                      </div>
                    )}
                  </ChipMenu>
                )}

                <ChipMenu
                  label={`${turnDurationSec}s · ${startingHp} HP`}
                  readOnly={!canTweakLobby}
                  title="Match settings"
                >
                  <div className="chip-menu-title">Match</div>
                  <Slider
                    label="Turn Time" unit="s"
                    min={10} max={90} step={5}
                    value={turnDurationSec}
                    onChange={(v) => onSettings({ turnDurationSec: v })}
                  />
                  <Slider
                    label="Starting HP"
                    min={100} max={600} step={25}
                    value={startingHp}
                    onChange={(v) => onSettings({ startingHp: v })}
                  />
                  <Slider
                    label="Fuel"
                    min={0} max={200} step={10}
                    value={fuelPerTurn}
                    onChange={(v) => onSettings({ fuelPerTurn: v })}
                  />
                  <Slider
                    label="Max Wind"
                    min={0} max={60} step={5}
                    value={windMax}
                    onChange={(v) => onSettings({ maxWind: v })}
                  />
                </ChipMenu>

                {isCasual && (
                  <ChipMenu
                    label={
                      ranked
                        ? "Ranked"
                        : teamMode
                        ? `Teams · ${teamCount}`
                        : "FFA"
                    }
                    readOnly={!canTweakLobby}
                    title="Match type"
                  >
                    <div className="chip-menu-title">Match type</div>
                    <label className="toggle-row" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={ranked}
                        disabled={hasBots && !ranked}
                        onChange={(e) => onLobbyConfig({ ranked: e.target.checked })}
                      />
                      <span>Ranked (no bots, MMR applies)</span>
                    </label>
                    {hasBots && !ranked && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", letterSpacing: "0.08em", marginBottom: 8 }}>
                        Remove bots to enable ranked.
                      </div>
                    )}
                    <label className="toggle-row" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={teamMode}
                        onChange={(e) => onLobbyConfig({ teamMode: e.target.checked })}
                      />
                      <span>Enable teams</span>
                    </label>
                    {teamMode && (
                      <>
                        <Slider
                          label="Number of teams"
                          min={2} max={4} step={1}
                          value={teamCount}
                          onChange={(v) => onLobbyConfig({ teamCount: v })}
                        />
                        <label className="toggle-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={friendlyFire}
                            onChange={(e) => onLobbyConfig({ friendlyFire: e.target.checked })}
                          />
                          <span>Friendly fire</span>
                        </label>
                      </>
                    )}
                  </ChipMenu>
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
            teamMode={teamMode}
            teamCount={teamCount}
            onAddBot={onAddBot}
            onRemoveBot={onRemoveBot}
            onSetBotDifficulty={onSetBotDifficulty}
            onSetTeam={onSetTeam}
            onShuffleTeams={onShuffleTeams}
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
            placeholder="Say hi…"
          />
        </main>
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
