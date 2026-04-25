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
  variant?: "floating" | "embedded";
  placeholder?: string;
}

export function ChatPanel({
  entries,
  onSend,
  variant = "floating",
  placeholder = "Press Enter to chat · Esc cancels",
}: Props): JSX.Element {
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  // Enter globally focuses the chat input. Space remains the fire key, so
  // Enter is freed up for chat — press once to open the input, type, press
  // Enter again to send.
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
    <div
      className={`chat-panel ${variant === "embedded" ? "embedded" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
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
        placeholder={placeholder}
        maxLength={140}
      />
    </div>
  );
}
