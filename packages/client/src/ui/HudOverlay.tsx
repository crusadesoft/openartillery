import type { Player } from "@artillery/shared";
import { TANK } from "@artillery/shared";
import { teamLabel, teamTint } from "./lobby/teamMeta";

interface Props {
  self: Player | undefined;
  players: Player[];
  currentTurnId: string;
  tick: number;
  teamMode?: boolean;
  teamCount?: number;
}

/**
 * Cockpit instrument cluster:
 *   • top-left   — riveted "ROSTER" placard (scoreboard)
 *   • top-right  — driver's panel with HP + FUEL analog gauges + nameplate
 *   • top-center — team strength placards (when team mode is on)
 */
export function HudOverlay({
  self,
  players,
  currentTurnId,
  tick,
  teamMode = false,
  teamCount = 0,
}: Props): JSX.Element {
  void tick;
  const scoreboard = [...players].sort((a, b) => b.kills - a.kills);

  const teamPills: { team: number; alive: number }[] = [];
  if (teamMode && teamCount >= 2) {
    for (let t = 1; t <= teamCount; t++) {
      teamPills.push({
        team: t,
        alive: players.filter((p) => p.team === t && !p.dead).length,
      });
    }
  }

  return (
    <>
      {teamPills.length > 0 && (
        <div className="hud-team-strip">
          {teamPills.map(({ team, alive }) => {
            const tint = teamTint(team);
            const dead = alive <= 0;
            return (
              <div
                key={team}
                className={`hud-team-placard ${dead ? "dead" : ""}`}
                style={{ borderColor: tint, color: tint }}
              >
                <span className="hud-team-name">{teamLabel(team).toUpperCase()}</span>
                <span className="hud-team-count">{alive}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="hud-overlay hud-roster" data-corner="tl">
        <span className="hud-rivet tl" />
        <span className="hud-rivet tr" />
        <span className="hud-rivet bl" />
        <span className="hud-rivet br" />
        <div className="hud-stencil hud-roster-label">Roster</div>
        <div className="hud-roster-rows">
          {scoreboard.map((p) => (
            <div key={p.id} className={`hud-roster-row ${p.dead ? "dead" : ""}`}>
              <span
                className={`hud-roster-pip ${p.id === currentTurnId ? "active" : ""}`}
                style={{ background: `#${p.color.toString(16).padStart(6, "0")}` }}
              />
              <span className="hud-roster-name">
                {p.name}
                {p.bot ? <span className="hud-roster-tag"> · BOT</span> : ""}
              </span>
              <span className="hud-roster-hp">{Math.max(0, Math.round(p.hp))}</span>
              <span className="hud-roster-kills">×{p.kills}</span>
            </div>
          ))}
        </div>
      </div>

      {self && !self.dead && (
        <div className="hud-overlay hud-driver" data-corner="tr">
          <span className="hud-rivet tl" />
          <span className="hud-rivet tr" />
          <span className="hud-rivet bl" />
          <span className="hud-rivet br" />
          <div className="hud-driver-plate">
            <span className="hud-driver-callsign">{self.name}</span>
            <span className="hud-driver-sub">DRIVER · CH 1</span>
          </div>
          <div className="hud-instruments">
            <Gauge
              variant="hp"
              label="HP"
              value={self.hp}
              max={TANK.MAX_HP}
            />
            <Gauge
              variant="fuel"
              label="FUEL"
              value={self.fuel}
              max={100}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Gauge({
  variant,
  label,
  value,
  max,
}: {
  variant: "hp" | "fuel";
  label: string;
  value: number;
  max: number;
}): JSX.Element {
  const frac = Math.max(0, Math.min(1, value / max));
  const angle = -135 + frac * 270;
  return (
    <div className={`hud-gauge ${variant}`}>
      <div className="hud-gauge-face">
        <div className="hud-gauge-ticks">
          {Array.from({ length: 11 }).map((_, i) => {
            const a = -135 + (i / 10) * 270;
            return (
              <span
                key={i}
                className={`hud-gauge-tick ${i % 5 === 0 ? "major" : ""}`}
                style={{ transform: `translateX(-50%) rotate(${a}deg)` }}
              />
            );
          })}
        </div>
        <div className="hud-gauge-readout">{Math.round(value)}</div>
        <div
          className="hud-gauge-needle"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)` }}
        />
        <div className="hud-gauge-cap" />
        <div className="hud-gauge-label">{label}</div>
      </div>
    </div>
  );
}
