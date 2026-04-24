import { useState } from "react";
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_SPECS,
  type Player,
} from "@artillery/shared";
import { SfxButton } from "../SfxButton";
import { click } from "../sfx";

interface Props {
  players: Player[];
  selfId: string;
  hostId: string;
  maxPlayers: number;
  canAddBot: boolean;
  canTweakSettings: boolean;
  onAddBot: (difficulty: string) => void;
  onRemoveBot: (sessionId: string) => void;
  onSetBotDifficulty: (sessionId: string, difficulty: string) => void;
}

export function PlayerRoster({
  players,
  selfId,
  hostId,
  maxPlayers,
  canAddBot,
  canTweakSettings,
  onAddBot,
  onRemoveBot,
  onSetBotDifficulty,
}: Props): JSX.Element {
  const [botDifficulty, setBotDifficulty] = useState("normal");

  return (
    <>
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
    </>
  );
}
