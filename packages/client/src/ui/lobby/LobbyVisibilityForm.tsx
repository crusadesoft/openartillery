import { useEffect, useState } from "react";
import { ALL_BIOMES, BIOMES } from "@artillery/shared";
import { SfxButton } from "../SfxButton";
import { click } from "../sfx";
import type { LobbyConfig } from "./types";

interface Props {
  players: number;
  maxPlayers: number;
  biome: string;
  biomeRandom: boolean;
  visibility: string;
  hasPassword: boolean;
  onLobbyConfig: (patch: Partial<LobbyConfig>) => void;
}

export function LobbyVisibilityForm({
  players,
  maxPlayers,
  biome,
  biomeRandom,
  visibility,
  hasPassword,
  onLobbyConfig,
}: Props): JSX.Element {
  const [pwDraft, setPwDraft] = useState("");
  // After the server confirms a password change, hasPassword flips; clear
  // the local draft so the input stops showing the host's fresh keystrokes.
  useEffect(() => { if (!hasPassword) setPwDraft(""); }, [hasPassword]);
  const commitPassword = () => {
    onLobbyConfig({ password: pwDraft });
    setPwDraft("");
  };

  return (
    <>
      <div className="field" style={{ marginBottom: 10 }}>
        <div className="match-setting-head">
          <span>Max players</span>
          <span className="match-setting-value">{maxPlayers}</span>
        </div>
        <input
          type="range"
          min={Math.max(2, players)}
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
    </>
  );
}
