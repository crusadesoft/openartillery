import type { Room } from "colyseus.js";
import type { BattleState } from "@artillery/shared";
import { TANK } from "@artillery/shared";

interface Props {
  room: Room<BattleState>;
  power: number;
  isMyTurn: boolean;
  hasFlight: boolean;
}

/**
 * Explicit fire button. Enabled only when it's your turn, you've aimed
 * above the minimum power, and no projectile is in flight. Keyboard
 * equivalents: SPACE or ENTER.
 */
export function FireButton({ room, power, isMyTurn, hasFlight }: Props): JSX.Element {
  const ready = isMyTurn && power >= TANK.MIN_POWER && !hasFlight;
  const t = Math.max(
    0,
    Math.min(1, (power - TANK.MIN_POWER) / (TANK.MAX_POWER - TANK.MIN_POWER)),
  );

  return (
    <button
      type="button"
      className={`fire-btn ${ready ? "ready" : ""}`}
      disabled={!ready}
      onClick={() => ready && room.send("fire", {})}
      title="SPACE or ENTER"
    >
      <span className="glyph">▲</span>
      <span className="label">FIRE</span>
      <span className="power-bar">
        <span
          className="fill"
          style={{
            width: `${t * 100}%`,
            background:
              t > 0.9 ? "var(--danger)" : t > 0.6 ? "var(--warn)" : "var(--accent)",
          }}
        />
      </span>
      <span className="kb">SPACE</span>
    </button>
  );
}
