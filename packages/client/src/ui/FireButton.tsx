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
 * equivalent: SPACE.
 */
export function FireButton({ room, power, isMyTurn, hasFlight }: Props): JSX.Element {
  const ready = isMyTurn && power >= TANK.MIN_POWER && !hasFlight;

  return (
    <button
      type="button"
      className={`fire-btn ${ready ? "ready" : ""}`}
      disabled={!ready}
      onClick={() => ready && room.send("fire", {})}
      title="SPACE to fire"
      aria-label="Fire"
    >
      <span className="fire-btn-housing">
        <span className="fire-btn-rivet r-tl" />
        <span className="fire-btn-rivet r-tr" />
        <span className="fire-btn-rivet r-bl" />
        <span className="fire-btn-rivet r-br" />
        <span className="fire-btn-dome">
          <svg
            className="fire-btn-reticle"
            viewBox="0 0 40 40"
            aria-hidden
          >
            <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7"/>
            <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
            <line x1="20" y1="2"  x2="20" y2="10" stroke="currentColor" strokeWidth="1.6"/>
            <line x1="20" y1="30" x2="20" y2="38" stroke="currentColor" strokeWidth="1.6"/>
            <line x1="2"  y1="20" x2="10" y2="20" stroke="currentColor" strokeWidth="1.6"/>
            <line x1="30" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="20" cy="20" r="2" fill="currentColor"/>
          </svg>
          <span className="fire-btn-label">FIRE</span>
        </span>
      </span>
    </button>
  );
}
