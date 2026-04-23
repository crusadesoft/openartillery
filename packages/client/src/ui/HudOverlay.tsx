import type { Player } from "@artillery/shared";
import { TANK } from "@artillery/shared";

interface Props {
  self: Player | undefined;
  players: Player[];
  currentTurnId: string;
  tick: number;
}

/**
 * Scoreboard top-left + compact HP/Fuel readout top-right. The power bar
 * lives in the drag overlay inside Phaser, and the weapon selection is in
 * the bottom tray — so the rest of the screen stays quiet.
 */
export function HudOverlay({ self, players, currentTurnId, tick }: Props): JSX.Element {
  void tick;
  const scoreboard = [...players].sort((a, b) => b.kills - a.kills);

  return (
    <>
      <div className="hud-overlay" style={{ left: 16, top: 16, minWidth: 220 }}>
        <div className="label" style={{ marginBottom: 8 }}>Scoreboard</div>
        {scoreboard.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              opacity: p.dead ? 0.4 : 1,
              padding: "2px 0",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                background: `#${p.color.toString(16).padStart(6, "0")}`,
                boxShadow: p.id === currentTurnId ? "0 0 8px currentColor" : undefined,
              }}
            />
            <span
              style={{
                flex: 1,
                color: p.dead ? "var(--ink-faint)" : "var(--ink)",
                fontSize: 13,
              }}
            >
              {p.name}
              {p.bot ? <span style={{ color: "var(--ink-faint)" }}> · bot</span> : ""}
            </span>
            <span className="mono" style={{ fontSize: 11 }}>
              {Math.max(0, Math.round(p.hp))}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>
              ×{p.kills}
            </span>
          </div>
        ))}
      </div>

      {self && !self.dead && (
        <div
          className="hud-overlay"
          style={{ right: 16, top: 16, minWidth: 220 }}
        >
          <div className="label" style={{ marginBottom: 4 }}>
            {self.name}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span className="mono" style={{ color: "var(--danger)" }}>HP</span>
            <span className="mono">
              {Math.round(self.hp)} / {TANK.MAX_HP}
            </span>
          </div>
          <div className="hud-bar">
            <div
              style={{
                width: `${(self.hp / TANK.MAX_HP) * 100}%`,
                background: "var(--danger)",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              marginTop: 6,
            }}
          >
            <span className="mono" style={{ color: "var(--ok)" }}>FUEL</span>
            <span className="mono">{Math.round(self.fuel)}</span>
          </div>
          <div className="hud-bar">
            <div
              style={{ width: `${(self.fuel / 100) * 100}%`, background: "var(--ok)" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
