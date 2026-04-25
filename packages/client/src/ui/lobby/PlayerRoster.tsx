import {
  BOT_DIFFICULTIES,
  type Player,
} from "@artillery/shared";
import { SfxButton } from "../SfxButton";
import { click } from "../sfx";
import { teamLabel, teamTint } from "./teamMeta";

interface Props {
  players: Player[];
  selfId: string;
  hostId: string;
  maxPlayers: number;
  canAddBot: boolean;
  canTweakSettings: boolean;
  teamMode: boolean;
  teamCount: number;
  onAddBot: (difficulty: string) => void;
  onRemoveBot: (sessionId: string) => void;
  onSetBotDifficulty: (sessionId: string, difficulty: string) => void;
  onSetTeam: (sessionId: string, team: number) => void;
  onShuffleTeams: () => void;
}

export function PlayerRoster({
  players,
  selfId,
  hostId,
  maxPlayers,
  canAddBot,
  canTweakSettings,
  teamMode,
  teamCount,
  onAddBot,
  onRemoveBot,
  onSetBotDifficulty,
  onSetTeam,
  onShuffleTeams,
}: Props): JSX.Element {
  const isHost = selfId === hostId;

  const renderTeamBox = (p: Player) => {
    if (!teamMode) return null;
    const tc = Math.max(2, teamCount);
    const isSelf = p.id === selfId;
    // Host owns bot picks; players own their own. Others get a read-only
    // chip so the layout stays uniform but they can't poke teammates.
    const editable = (p.bot && isHost) || (!p.bot && isSelf);
    const team = p.team;
    const tint = team >= 1 && team <= tc ? teamTint(team) : "var(--ink-faint)";
    const letter = team >= 1 && team <= tc ? String.fromCharCode(64 + team) : "?";
    const cycle = () => {
      click();
      onSetTeam(p.id, ((team || 0) + 1) % (tc + 1));
    };
    const style: React.CSSProperties = {
      height: 24,
      padding: "0 8px",
      borderRadius: 4,
      border: `1.5px solid ${tint}`,
      background: `${tint}22`,
      color: tint,
      fontFamily: "var(--font-mono)",
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: "0.1em",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      cursor: editable ? "pointer" : "default",
      opacity: editable ? 1 : 0.55,
    };
    const content = (
      <>
        TEAM <span style={{ fontSize: 13 }}>{letter}</span>
      </>
    );
    if (!editable) {
      return <span style={style} title={team ? teamLabel(team) : "Auto"}>{content}</span>;
    }
    return (
      <button
        type="button"
        style={style}
        title={team ? teamLabel(team) : "Auto — click to pick"}
        onClick={cycle}
      >
        {content}
      </button>
    );
  };

  const renderRow = (p: Player) => (
    <li key={p.id}>
      <div className="player-name-row">
        <span className={`dot ${p.ready ? "ready" : ""}`} />
        <span className="player-name">
          {p.name}
          {p.id === hostId ? " ★" : ""}
          {p.id === selfId ? " (you)" : ""}
        </span>
      </div>
      <div className="player-meta-row">
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
        <span style={{ flex: 1 }} />
        {renderTeamBox(p)}
        {canTweakSettings && p.bot && (
          <button
            className="kick-btn"
            title="Remove bot"
            onClick={() => { click(); onRemoveBot(p.id); }}
          >
            ×
          </button>
        )}
      </div>
    </li>
  );

  return (
    <>
      <div className="lobby-stage-section-title">
        <span>Crew · {players.length}/{maxPlayers}</span>
        <span style={{ flex: 1 }} />
        {canAddBot && (
          <SfxButton
            className="ghost-btn"
            style={{ padding: "2px 10px", fontSize: 11 }}
            title="Add a normal-level bot. Cycle difficulty on the bot row."
            onClick={() => { click(); onAddBot("normal"); }}
          >
            + Bot
          </SfxButton>
        )}
        {teamMode && canTweakSettings && (
          <SfxButton
            className="ghost-btn"
            style={{ marginLeft: 6, padding: "2px 10px", fontSize: 11 }}
            onClick={onShuffleTeams}
          >
            Shuffle Teams
          </SfxButton>
        )}
      </div>
      <ul className="lobby-players">
        {players.map(renderRow)}
        {players.length === 0 && (
          <li style={{ color: "var(--ink-faint)" }}>No one here yet.</li>
        )}
      </ul>
    </>
  );
}
