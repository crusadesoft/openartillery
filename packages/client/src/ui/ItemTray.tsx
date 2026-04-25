import type { Room } from "colyseus.js";
import {
  type BattleState,
  type Player,
  DEFAULT_ITEMS,
  ITEMS,
  type ItemId,
  TARGETED_ITEMS,
} from "@artillery/shared";
import { click } from "./sfx";
import { ItemIcon } from "./ItemIcon";

interface Props {
  room: Room<BattleState>;
  self: Player | undefined;
  isMyTurn: boolean;
  locked: boolean;
}

const HOTKEYS = ["Q", "W", "E", "R"];

export function ItemTray({ room, self, isMyTurn, locked }: Props): JSX.Element {
  const now = Date.now();
  return (
    <div className={`item-tray ${isMyTurn ? "active" : "idle"} ${locked ? "locked" : ""}`}>
      {DEFAULT_ITEMS.map((id, i) => {
        const def = ITEMS[id as ItemId];
        const remaining = self?.items.get(id) ?? 0;
        const empty = remaining <= 0;
        const disabled = locked || empty;
        const color = `#${def.tint.toString(16).padStart(6, "0")}`;
        const shieldActive =
          id === "shield" && self?.shieldExpiresAt && self.shieldExpiresAt > now;
        return (
          <button
            key={id}
            type="button"
            title={`${def.name} — ${def.blurb}\nCharges: ${remaining}/${def.maxCharges}`}
            className={`item-tile ${empty ? "empty" : ""} ${shieldActive ? "active" : ""}`}
            disabled={disabled}
            style={{
              borderColor: shieldActive ? color : "rgba(255,255,255,0.1)",
              boxShadow: shieldActive ? `0 0 16px ${color}66` : undefined,
            }}
            onClick={() => {
              if (!isMyTurn || disabled) return;
              click();
              if (TARGETED_ITEMS.has(id)) {
                window.dispatchEvent(
                  new CustomEvent("artillery:target-item", { detail: { item: id } }),
                );
              } else {
                room.send("useItem", { item: id });
              }
            }}
          >
            <span className="hotkey">{HOTKEYS[i] ?? ""}</span>
            <span
              className="glyph"
              style={{
                background: "rgba(0,0,0,0.22)",
                border: `1px solid ${color}`,
              }}
            >
              <ItemIcon item={id as ItemId} size={22} color={color} />
            </span>
            <span className="label">{def.name}</span>
            <span className={`ammo ${empty ? "empty" : ""}`}>{remaining}</span>
          </button>
        );
      })}
    </div>
  );
}
