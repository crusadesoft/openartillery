import type { Player } from "@artillery/shared";
import { TURN } from "@artillery/shared";

interface Props {
  current: Player | undefined;
  isMyTurn: boolean;
  turnEndsAt: number;
  wind: number;
  tick: number;
}

/**
 * Top-center instrument cluster: brass-bezeled compass for wind, sweep
 * stopwatch dial for the turn timer, and an etched placard with whose
 * turn it is between them. Mirrors the gauge bezels on the driver panel
 * so the whole HUD reads as a single instrument cluster.
 */
export function TurnChip({
  current,
  isMyTurn,
  turnEndsAt,
  wind,
  tick,
}: Props): JSX.Element {
  void tick;
  const remaining = Math.max(0, turnEndsAt - Date.now());
  const sec = Math.ceil(remaining / 1000);
  const timerFrac = turnEndsAt > 0 ? Math.min(1, remaining / TURN.DURATION_MS) : 0;
  // Wind is signed; positive blows right. Compass needle points the wind
  // direction (90° = east on the dial, -90° = west). Magnitude shrinks
  // the needle visually via a CSS var.
  const windAbs = Math.abs(Math.round(wind));
  const windDeg = wind === 0 ? 0 : wind > 0 ? 90 : -90;
  const clockColor =
    timerFrac < 0.25 ? "var(--danger-bright)" : timerFrac < 0.5 ? "var(--warn)" : "var(--ok)";

  return (
    <div className={`turn-chip ${isMyTurn ? "mine" : ""}`}>
      <div className="turn-instrument turn-compass" title={`Wind ${windAbs}`}>
        <div className="turn-face">
          <span className="turn-compass-card turn-compass-n">N</span>
          <span
            className="turn-compass-needle"
            style={{
              transform: `translate(-50%, -50%) rotate(${windDeg}deg)`,
              opacity: windAbs === 0 ? 0.25 : 1,
            }}
          />
          <span className="turn-compass-readout">{windAbs}</span>
        </div>
      </div>

      <div className="turn-placard">
        <span className="turn-placard-name">
          {isMyTurn ? "YOUR TURN" : current ? current.name : "—"}
        </span>
        <span className="turn-placard-status">
          {isMyTurn ? "Engage" : "Stand by"}
        </span>
      </div>

      <div className="turn-instrument turn-clock" title={`${sec}s remaining`}>
        <div
          className="turn-face"
          style={
            {
              ["--clock-frac" as string]: timerFrac,
              ["--clock-fill" as string]: clockColor,
            } as React.CSSProperties
          }
        >
          <span className="turn-clock-arc" />
          <span className="turn-clock-readout">{sec}</span>
        </div>
      </div>
    </div>
  );
}
