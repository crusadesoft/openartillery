import { useState } from "react";
import {
  ALL_MODES,
  ALL_BIOMES,
  BIOMES,
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_SPECS,
  type BotDifficulty,
  MODES,
  type GameMode,
} from "@artillery/shared";
import { useAuth } from "../auth/AuthProvider";
import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";
import { click } from "../ui/sfx";

interface Props { navigate: (r: Route) => void; }

export function PlayPage({ navigate }: Props): JSX.Element {
  const { session } = useAuth();
  const [mode, setMode] = useState<GameMode>("bots");
  const [guestName, setGuestName] = useState<string>(
    () => localStorage.getItem("artillery:guestName") ?? "",
  );
  const [inviteCode, setInviteCode] = useState("");
  const [botCount, setBotCount] = useState(2);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("normal");
  const [biome, setBiome] = useState<string>("random");
  const [error, setError] = useState<string | null>(null);

  const validGuest = /^[A-Za-z0-9_]{3,16}$/.test(guestName.trim());
  const requiresGuestName = !session && guestName.trim().length > 0;

  const play = (m: GameMode, code?: string) => {
    if (!session) {
      const cleaned = guestName.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(cleaned)) {
        setError("Guest name must be 3–16 letters, numbers, or underscores.");
        return;
      }
      localStorage.setItem("artillery:guestName", cleaned);
    }
    const qs: string[] = [];
    if (code) qs.push(`code=${encodeURIComponent(code)}`);
    if (m === "bots") {
      qs.push(`bots=${botCount}`);
      qs.push(`diff=${botDifficulty}`);
    }
    if (biome !== "random") qs.push(`biome=${biome}`);
    const suffix = qs.length ? `?${qs.join("&")}` : "";
    window.location.hash = `#/game/${m}${suffix}`;
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Play</h2>
        {!session && (
          <div className="field">
            <label>Guest callsign</label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="3–16 characters"
              maxLength={16}
              style={{
                borderColor: requiresGuestName && !validGuest ? "var(--danger)" : undefined,
              }}
            />
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <div className="mode-grid">
          {ALL_MODES.map((m) => {
            const spec = MODES[m];
            return (
              <div
                key={m}
                className={`mode-card ${mode === m ? "active" : ""}`}
                onClick={() => { click(); setMode(m); }}
              >
                <h3>{spec.label}</h3>
                <p>{spec.description}</p>
                <div className="meta">
                  {spec.minPlayers}–{spec.maxPlayers} players ·{" "}
                  {spec.ranked ? "Ranked" : "Unranked"}
                </div>
              </div>
            );
          })}
        </div>

        {mode === "bots" && (
          <div style={{ marginTop: 18 }}>
            <div className="field">
              <label>Bot count</label>
              <div className="pill-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`pill ${botCount === n ? "active" : ""}`}
                    onClick={() => { click(); setBotCount(n); }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Difficulty</label>
              <div className="pill-row">
                {BOT_DIFFICULTIES.map((d) => {
                  const s = BOT_DIFFICULTY_SPECS[d];
                  return (
                    <div
                      key={d}
                      className={`pill ${botDifficulty === d ? "active" : ""}`}
                      onClick={() => { click(); setBotDifficulty(d); }}
                      title={`~${s.mmr} MMR · ${s.aimErrorDeg}° aim error`}
                    >
                      {s.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="field" style={{ marginTop: 14 }}>
          <label>Biome</label>
          <div className="pill-row">
            <div
              className={`pill ${biome === "random" ? "active" : ""}`}
              onClick={() => { click(); setBiome("random"); }}
            >
              Random
            </div>
            {ALL_BIOMES.map((b) => (
              <div
                key={b}
                className={`pill ${biome === b ? "active" : ""}`}
                onClick={() => { click(); setBiome(b); }}
                title={BIOMES[b].blurb}
              >
                {BIOMES[b].label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <SfxButton className="primary-btn" onClick={() => play(mode)}>
            Start · {MODES[mode].label}
          </SfxButton>
        </div>
      </div>

      <div className="card">
        <h2>Private room</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "0 0 14px" }}>
          Create a private lobby and share the six-character code with friends.
          Or paste a code to join a match-in-progress.
        </p>
        <div className="row">
          <SfxButton className="secondary-btn" onClick={() => play("private")}>
            Create private
          </SfxButton>
          <div className="field" style={{ margin: 0 }}>
            <input
              placeholder="INVITE CODE"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textAlign: "center", letterSpacing: "0.4em", fontFamily: "var(--font-mono)" }}
            />
          </div>
          <SfxButton
            className="secondary-btn"
            disabled={inviteCode.length < 4}
            onClick={() => play("private", inviteCode)}
          >
            Join
          </SfxButton>
        </div>
      </div>
    </div>
  );
}
