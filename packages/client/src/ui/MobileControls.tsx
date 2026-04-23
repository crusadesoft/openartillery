import { useEffect, useRef } from "react";
import type { Room } from "colyseus.js";
import type { BattleState } from "@artillery/shared";

interface Props { room: Room<BattleState>; }

/**
 * Minimal on-screen movement pad for touch devices. Aiming + firing go
 * through the same drag-on-battlefield path as desktop, so no fire button.
 */
export function MobileControls({ room }: Props): JSX.Element {
  const state = useRef({ left: false, right: false });

  const flush = () => {
    room.send("input", {
      left: state.current.left,
      right: state.current.right,
      up: false,
      down: false,
    });
  };

  const hold = (k: "left" | "right") => (on: boolean) => {
    state.current[k] = on;
    flush();
  };

  useEffect(() => {
    const release = () => {
      state.current = { left: false, right: false };
      flush();
    };
    window.addEventListener("blur", release);
    return () => window.removeEventListener("blur", release);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mobile-drive">
      <HoldButton onChange={hold("left")}>◀</HoldButton>
      <HoldButton onChange={hold("right")}>▶</HoldButton>
    </div>
  );
}

function HoldButton({
  onChange,
  children,
}: {
  onChange: (on: boolean) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      className="drive-btn"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
