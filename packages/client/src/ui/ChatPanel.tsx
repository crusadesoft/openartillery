import { useEffect, useRef, useState } from "react";

function nameColor(c: number): string {
  let r = (c >> 16) & 0xff;
  let g = (c >> 8) & 0xff;
  let b = c & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const MIN_LUM = 0.65;
  if (lum < MIN_LUM) {
    const t = (MIN_LUM - lum) / (1 - lum);
    r = Math.round(r + (255 - r) * t);
    g = Math.round(g + (255 - g) * t);
    b = Math.round(b + (255 - b) * t);
  }
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface Entry {
  id: number;
  name: string;
  text: string;
  system?: boolean;
  color?: number;
}

interface Props {
  entries: Entry[];
  onSend: (text: string) => void;
}

/**
 * Battle chat — same FIELD · MODEL 7G CRT monitor as the lobby briefing
 * room, so transmissions feel like they're coming over the same set
 * regardless of phase. Mirrors BriefingCrtChat in Lobby.tsx; both share
 * the .crt-cabinet kit in diegetic.css.
 */
export function ChatPanel({ entries, onSend }: Props): JSX.Element {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  // Enter focuses the chat input. Space remains the fire key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) onSend(trimmed);
    setText("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.blur();
      setText("");
    }
  };

  return (
    <div
      className="chat-panel crt-cabinet"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="crt-vent" aria-hidden />
      <div className="crt-screen-mount">
        <div className="crt-tube">
          <div className="crt-log" ref={logRef}>
            {entries.length === 0 ? (
              <div className="crt-log-empty">— no transmissions —</div>
            ) : (
              entries.map((e) => (
                <div key={e.id} className={e.system ? "crt-line system" : "crt-line"}>
                  {e.system ? (
                    <span className="crt-line-system">▌ {e.text}</span>
                  ) : (
                    <>
                      <span
                        className="crt-line-name"
                        style={e.color !== undefined ? { color: nameColor(e.color) } : undefined}
                      >
                        {e.name}:
                      </span>{" "}
                      <span className="crt-line-text">{e.text}</span>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="crt-prompt-line">
            <span className="crt-prompt" aria-hidden>{">"}</span>
            <input
              ref={inputRef}
              className="crt-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="press ENTER to transmit…"
              maxLength={140}
            />
          </div>
          <span className="crt-scanlines" aria-hidden />
          <span className="crt-vignette" aria-hidden />
          <span className="crt-glare" aria-hidden />
        </div>
      </div>
      <div className="crt-chin">
        <span className="crt-led on" />
        <span className="crt-brand">FIELD · MODEL 7G</span>
        <span className="crt-speaker" />
      </div>
    </div>
  );
}
