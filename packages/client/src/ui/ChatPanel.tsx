import { useEffect, useRef, useState } from "react";

interface Entry {
  id: number;
  name: string;
  text: string;
  system?: boolean;
}

interface Props {
  entries: Entry[];
  onSend: (text: string) => void;
}

export function ChatPanel({ entries, onSend }: Props): JSX.Element {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  // "T" globally focuses the chat input (Quake / most multiplayer games).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "t") return;
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

  // Handle Enter ourselves so we don't rely on form-submit semantics that
  // Phaser's global keydown can trample.
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
    <div className="chat-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="chat-log" ref={logRef}>
        {entries.map((e) => (
          <div key={e.id} className={e.system ? "system" : undefined}>
            {e.system ? (
              e.text
            ) : (
              <>
                <strong>{e.name}:</strong> {e.text}
              </>
            )}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        className="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Press T to chat · Enter sends · Esc cancels"
        maxLength={140}
      />
    </div>
  );
}
