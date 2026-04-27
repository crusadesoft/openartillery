import { useEffect, useState } from "react";
import { DeckButton } from "../pages/SettingsPage";
import { SettingsPanel } from "./SettingsPanel";

interface Props { onLeave: () => void; }

/**
 * Escape-triggered pause overlay rendered as a mini rack-mount console
 * (matches SettingsPage). Settings live behind an inline tab so the
 * player can tweak gains / rockers without leaving the match.
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
      <div className="pause-console" onClick={(e) => e.stopPropagation()}>
        <div className="console-rack-cabinet">
          <div className="console-rack-top" aria-hidden>
            <span className="rack-vent" />
            <span className="rack-vent" />
            <span className="rack-vent" />
            <span className="rack-vent" />
            <span className="rack-vent" />
          </div>

          <div className="console-faceplate">
            <div className="deck-nameplate-strip">
              <span className="screw screw-tl" /><span className="screw screw-tr" />
              <span className="deck-nameplate-line">PAUSED · INTERMISSION</span>
              <span className="deck-nameplate-sn">CH 00 · STANDBY</span>
              <span className="screw screw-bl" /><span className="screw screw-br" />
            </div>

            <div className="pause-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "menu"}
                className={`pause-tab ${tab === "menu" ? "active" : ""}`}
                onClick={() => setTab("menu")}
              >
                Menu
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "settings"}
                className={`pause-tab ${tab === "settings" ? "active" : ""}`}
                onClick={() => setTab("settings")}
              >
                Settings
              </button>
            </div>

            <div className="pause-content">
              {tab === "menu" ? (
                <div className="console-zone pause-menu-zone">
                  <p className="pause-tagline">
                    Match keeps running on the server — resume any time.
                  </p>
                  <div className="pause-actions">
                    <DeckButton label="Resume" variant="go" onClick={() => setOpen(false)} />
                    <DeckButton
                      label="Leave Match"
                      variant="danger"
                      onClick={() => {
                        setOpen(false);
                        onLeave();
                      }}
                    />
                  </div>
                </div>
              ) : (
                <SettingsPanel />
              )}
            </div>

            <div className="console-action-strip pause-strip">
              <span className="action-stencil" aria-hidden>ESC TO RESUME</span>
              <span className="pause-strip-led" aria-hidden />
            </div>
          </div>
        </div>

        <div className="console-rack-feet" aria-hidden>
          <span className="console-rack-foot" />
          <span className="console-rack-foot" />
        </div>
      </div>
    </div>
  );
}
