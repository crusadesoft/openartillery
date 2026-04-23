import { useEffect, useState } from "react";
import { SfxButton } from "./SfxButton";
import { SettingsPanel } from "./SettingsPanel";

interface Props { onLeave: () => void; }

/**
 * Escape-triggered pause overlay. Settings are reachable inline so the
 * player can tweak volume / motion / clicks without leaving the match.
 */
export function PauseMenu({ onLeave }: Props): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"menu" | "settings">("menu");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div className="pause-menu" onClick={() => setOpen(false)}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h1>Paused</h1>
        <div className="pill-row" style={{ marginBottom: 18 }}>
          <div
            className={`pill ${tab === "menu" ? "active" : ""}`}
            onClick={() => setTab("menu")}
          >
            Menu
          </div>
          <div
            className={`pill ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            Settings
          </div>
        </div>

        {tab === "menu" ? (
          <>
            <p className="tagline">
              The match keeps running on the server — you can resume any time.
            </p>
            <SfxButton className="primary-btn" onClick={() => setOpen(false)}>
              Resume
            </SfxButton>
            <SfxButton
              className="danger-btn"
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
            >
              Leave match
            </SfxButton>
          </>
        ) : (
          <SettingsPanel />
        )}

        <p
          style={{
            color: "var(--ink-faint)",
            fontSize: 11,
            marginTop: 14,
            textAlign: "center",
          }}
        >
          Press ESC or click outside to close.
        </p>
      </div>
    </div>
  );
}
