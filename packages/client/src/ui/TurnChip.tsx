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
 * Single top-center chip that owns whose turn it is + remaining time + wind.
 * Replaces the old bouncing banner — the information is always visible
 * without shouting.
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
  const reversed = wind < 0;
  const timerColor =
    timerFrac < 0.25 ? "var(--danger)" : timerFrac < 0.5 ? "var(--warn)" : "var(--accent)";

  return (
    <div className={`turn-chip ${isMyTurn ? "mine" : ""}`}>
      <span className="dot" />
      <span>{isMyTurn ? "YOUR TURN" : current ? `${current.name}` : "—"}</span>
      <span style={{ color: timerColor, fontWeight: 800 }}>{sec}s</span>
      <span style={{ opacity: 0.4 }}>|</span>
      <span style={{ letterSpacing: "0.12em" }}>
        WIND {reversed ? "◄" : "►"} {Math.abs(Math.round(wind))}
      </span>
    </div>
  );
}
