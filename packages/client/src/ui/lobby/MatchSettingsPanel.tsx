import { Slider } from "./Slider";
import type { LobbyConfig, MatchSettings } from "./types";

interface Props {
  turnDurationSec: number;
  fuelPerTurn: number;
  startingHp: number;
  windMax: number;
  /** Show host-only lobby toggles (team mode + ranked). False hides them
   *  for non-host views. */
  customTeams?: boolean;
  teamMode?: boolean;
  teamCount?: number;
  friendlyFire?: boolean;
  ranked?: boolean;
  /** True when the room has bots — disables the ranked toggle (server
   *  enforces; this just makes the UI honest). */
  rankedLocked?: boolean;
  onSettings: (patch: Partial<MatchSettings>) => void;
  onLobbyConfig?: (patch: Partial<LobbyConfig>) => void;
}

export function MatchSettingsPanel({
  turnDurationSec,
  fuelPerTurn,
  startingHp,
  windMax,
  customTeams = false,
  teamMode = false,
  teamCount = 2,
  friendlyFire = true,
  ranked = false,
  rankedLocked = false,
  onSettings,
  onLobbyConfig,
}: Props): JSX.Element {
  return (
    <>
      {customTeams && onLobbyConfig && (
        <>
          <div className="lobby-stage-section-title">Match type</div>
          <label
            className="toggle-row"
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
          >
            <input
              type="checkbox"
              checked={ranked}
              disabled={rankedLocked && !ranked}
              onChange={(e) => onLobbyConfig({ ranked: e.target.checked })}
            />
            <span>Ranked (no bots, MMR applies)</span>
          </label>
          {rankedLocked && !ranked && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ink-faint)",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Remove bots to enable ranked.
            </div>
          )}
          <div className="lobby-stage-section-title">Team mode</div>
          <label
            className="toggle-row"
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
          >
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
                min={2}
                max={4}
                step={1}
                value={teamCount}
                onChange={(v) => onLobbyConfig({ teamCount: v })}
              />
              <label
                className="toggle-row"
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
              >
                <input
                  type="checkbox"
                  checked={friendlyFire}
                  onChange={(e) => onLobbyConfig({ friendlyFire: e.target.checked })}
                />
                <span>Friendly fire</span>
              </label>
            </>
          )}
        </>
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
  );
}
