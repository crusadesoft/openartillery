import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** Visible chip text. */
  label: ReactNode;
  /** Variant for color: "ok" (green), "warn" (amber), "muted" (faint), default neutral. */
  tone?: "ok" | "warn" | "muted";
  /** Disable opening the popover (non-host viewers). Chip stays read-only. */
  readOnly?: boolean;
  /** Title attribute for the chip. */
  title?: string;
  /** Popover contents. Rendered when open. */
  children: ReactNode;
}

export function ChipMenu({ label, tone, readOnly, title, children }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cls = `lobby-stage-chip${tone ? ` ${tone}` : ""}${readOnly ? "" : " editable"}${open ? " open" : ""}`;
  return (
    <span className="lobby-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className={cls}
        title={title}
        disabled={readOnly}
        onClick={() => !readOnly && setOpen((v) => !v)}
      >
        {label}
        {!readOnly && <span className="lobby-chip-caret" aria-hidden>▾</span>}
      </button>
      {open && !readOnly && (
        <div className="lobby-chip-menu" role="dialog">
          {children}
        </div>
      )}
    </span>
  );
}
