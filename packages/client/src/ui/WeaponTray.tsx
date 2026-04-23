import type { Room } from "colyseus.js";
import {
  type BattleState,
  type Player,
  DEFAULT_LOADOUT,
  WEAPONS,
  type WeaponId,
} from "@artillery/shared";
import { click } from "./sfx";
import { WeaponIcon } from "./WeaponIcon";

interface Props {
  room: Room<BattleState>;
  self: Player | undefined;
  currentWeapon: WeaponId;
  isMyTurn: boolean;
  locked: boolean;
}

/**
 * Row of weapon tiles. Always visible during play so the player can see
 * what they have, what's selected, and the hotkeys (1–9). Phaser also
 * binds 1–9, but React's handler wins on focus. `locked` disables
 * selection after the player has fired so misclicks can't re-arm a
 * different round mid-flight.
 */
export function WeaponTray({ room, self, currentWeapon, isMyTurn, locked }: Props): JSX.Element {
  // BattleScene owns the 1–9 hotkeys via its DOM listener, so no shortcut
  // handler here (two listeners double-fired selectWeapon).
  return (
    <div className={`weapon-tray ${isMyTurn ? "active" : "idle"} ${locked ? "locked" : ""}`}>
      {DEFAULT_LOADOUT.map((id, i) => {
        const def = WEAPONS[id as WeaponId];
        const active = id === currentWeapon;
        const color = `#${def.tint.toString(16).padStart(6, "0")}`;
        // Unlimited weapons (shell) show "∞". Limited weapons show remaining
        // rounds; tile goes to an "empty" state when exhausted so the
        // player knows they can't pick it.
        const hasLimit = def.maxAmmo !== undefined;
        const remaining = hasLimit ? (self?.ammo.get(id) ?? def.maxAmmo ?? 0) : Infinity;
        const empty = hasLimit && remaining <= 0;
        const disabled = locked || empty;
        return (
          <button
            key={id}
            type="button"
            title={`${def.name} — ${def.blurb}${hasLimit ? `\nRounds: ${remaining}/${def.maxAmmo}` : ""}`}
            className={`weapon-tile ${active ? "active" : ""} ${empty ? "empty" : ""}`}
            disabled={disabled}
            style={{
              borderColor: active ? color : "rgba(255,255,255,0.1)",
              boxShadow: active ? `0 0 16px ${color}66` : undefined,
            }}
            onClick={() => {
              if (!isMyTurn || disabled) return;
              click();
              room.send("selectWeapon", { weapon: id });
            }}
          >
            <span className="hotkey">{i + 1}</span>
            <span
              className="glyph"
              style={{
                background: active ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.22)",
                border: `1px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
                color,
              }}
            >
              <WeaponIcon weapon={id as WeaponId} size={22} color={color} />
            </span>
            <span className="label">{def.name}</span>
            <span className={`ammo ${empty ? "empty" : ""}`}>
              {hasLimit ? `${remaining}` : "∞"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
