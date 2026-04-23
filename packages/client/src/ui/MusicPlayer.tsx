import { useEffect, useRef, useState } from "react";
import { Sound, type NowPlaying } from "../game/audio/Sound";

const LS_KEY = "artillery:musicPlayer:v2";
const DRAG_THRESHOLD_PX = 5;

interface Pos { x: number; y: number; collapsed: boolean; }

function defaultPos(): Pos {
  return {
    x: 16,
    y: Math.max(160, window.innerHeight - 260),
    collapsed: false,
  };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultPos();
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return {
        x: Math.max(4, Math.min(window.innerWidth - 40, parsed.x)),
        y: Math.max(60, Math.min(window.innerHeight - 40, parsed.y)),
        collapsed: !!parsed.collapsed,
      };
    }
  } catch { /* ignore */ }
  return defaultPos();
}

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Draggable now-playing widget.
 *
 * Drag model (intentionally simple, after several bug-ridden rewrites):
 *
 *  • Everything lives in the pointerdown closure — drag state, listener
 *    cleanup, and the final "tap → expand" decision. No shared refs or
 *    pointer-capture APIs to get stuck.
 *  • Window listeners for pointermove / pointerup / pointercancel so the
 *    gesture survives the cursor leaving the element (chat overlay, game
 *    canvas, browser chrome, etc.). stopPropagation on other elements
 *    only affects pointerdown, and that initial event already fired.
 *  • A single `.mp-dragging` class on <html> pins the global cursor to
 *    `grabbing` while a real drag is active.
 *  • Clean-up on unmount strips the class in case the component is
 *    yanked mid-drag (route change, hot reload).
 *
 * Collapsed mode treats any tap on the bubble as a drag-or-expand. In
 * expanded mode only the `[data-drag-handle]` (⋮⋮ grip) starts a drag;
 * buttons / scrubber / text all keep their native behaviour.
 */
export function MusicPlayer(): JSX.Element | null {
  const [info, setInfo] = useState<NowPlaying | null>(null);
  const [pos, setPos] = useState<Pos>(loadPos);
  const [, setScrubberTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => Sound.subscribe(setInfo), []);

  // Re-render when mute state toggles elsewhere (e.g. Settings page).
  const [muteTick, setMuteTick] = useState(0);
  useEffect(() => Sound.onMuteChange(() => setMuteTick((t) => t + 1)), []);
  const muted = Sound.isMuted("music");
  void muteTick;

  useEffect(() => {
    const id = window.setInterval(() => setScrubberTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current;
      const w = el?.offsetWidth ?? 240;
      const h = el?.offsetHeight ?? 160;
      setPos((p) => ({
        ...p,
        x: clamp(4, window.innerWidth - w - 4, p.x),
        y: clamp(60, window.innerHeight - h - 4, p.y),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Safety net: if we're unmounted mid-drag (route change, HMR), clear
  // the dragging cursor class so it doesn't stick.
  useEffect(() => () => {
    document.documentElement.classList.remove("mp-dragging");
    document.body.style.userSelect = "";
  }, []);

  const beginDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left click or touch only. Right click should never start a drag.
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const root = rootRef.current;
    if (!root) return;

    const targetEl = e.target as HTMLElement;
    // Interactive controls (buttons, scrubber) handle their own input.
    if (targetEl.closest("[data-no-drag]")) return;

    // In expanded mode only the grip starts a drag. In collapsed mode
    // the entire bubble is draggable (and a tap expands it).
    const isCollapsed = pos.collapsed;
    if (!isCollapsed && !targetEl.closest("[data-drag-handle]")) return;

    const rect = root.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    const width = rect.width;
    const height = rect.height;
    const startedCollapsed = isCollapsed;
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        dragging = true;
        document.documentElement.classList.add("mp-dragging");
        document.body.style.userSelect = "none";
      }
      const nx = clamp(4, window.innerWidth - width - 4, ev.clientX - offX);
      const ny = clamp(60, window.innerHeight - height - 4, ev.clientY - offY);
      setPos((p) => ({ ...p, x: nx, y: ny }));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.documentElement.classList.remove("mp-dragging");
      document.body.style.userSelect = "";
    };

    const onEnd = () => {
      cleanup();
      // A tap (no movement past the threshold) on the collapsed bubble
      // expands it. Taps on the expanded grip do nothing.
      if (!dragging && startedCollapsed) {
        setPos((p) => ({ ...p, collapsed: false }));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp(0, 1, (e.clientX - rect.left) / rect.width);
    const dur = Sound.duration();
    if (dur > 0) Sound.seek(ratio * dur);
  };

  // Render the chrome *immediately*. Music starts after a user gesture
  // (browser autoplay policy), so `info` is null for a beat on mount.
  // Hiding the widget until it populates made the player feel laggy and
  // "glitchy" — instead we show a placeholder and light up the controls
  // when audio is available.
  const hasTrack = !!info;
  const paused = info?.paused ?? true;
  const trackTitle = info?.track.title ?? "Awaiting track…";
  const trackArtist = info?.track.artist ?? "tap anywhere to start";
  const contextLabel = info?.context.toUpperCase() ?? "STANDBY";
  const trackIndex = info ? info.trackIndex + 1 : 0;
  const poolSize = info?.poolSize ?? 0;
  const dur = info?.duration || (hasTrack ? Sound.duration() : 0) || 1;
  const posSec = hasTrack ? (paused ? info!.position : Sound.position()) : 0;
  const pct = hasTrack ? clamp(0, 1, posSec / dur) : 0;

  return (
    <div
      ref={rootRef}
      className={`music-player ${pos.collapsed ? "collapsed" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        right: "auto",
        bottom: "auto",
        touchAction: "none",
      }}
      onPointerDown={beginDrag}
    >
      {pos.collapsed ? (
        <span className="mp-toggle" aria-hidden>♪</span>
      ) : (
        <>
          <div className="mp-head">
            <span
              className="mp-grip"
              data-drag-handle
              title="Drag to move"
              aria-hidden
            >⋮⋮</span>
            <span className="mp-label">
              NOW PLAYING · {contextLabel}
              {hasTrack ? ` · ${trackIndex}/${poolSize}` : ""}
            </span>
            <button
              data-no-drag
              tabIndex={-1}
              className="mp-collapse"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                (e.currentTarget as HTMLElement).blur();
                setPos((v) => ({ ...v, collapsed: true }));
              }}
              title="Hide player"
            >
              —
            </button>
          </div>
          <div className={`mp-track ${hasTrack ? "" : "idle"}`}>
            <span className="mp-title">{trackTitle}</span>
            <span className="mp-artist">{trackArtist}</span>
          </div>
          <div
            data-no-drag
            className="mp-scrub"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={hasTrack ? onScrub : undefined}
          >
            <div className="mp-scrub-fill" style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="mp-time">
            <span>{fmt(posSec)}</span>
            <span>{fmt(dur)}</span>
          </div>
          <div className="mp-buttons">
            <button
              data-no-drag
              tabIndex={-1}
              disabled={!hasTrack}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.previous(); }}
              title="Previous track"
            >
              ◀◀
            </button>
            <button
              data-no-drag
              tabIndex={-1}
              className="mp-play"
              disabled={!hasTrack}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.togglePause(); }}
              title={paused ? "Play" : "Pause"}
            >
              {paused ? "▶" : "❚❚"}
            </button>
            <button
              data-no-drag
              tabIndex={-1}
              disabled={!hasTrack}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.next(); }}
              title="Next track"
            >
              ▶▶
            </button>
            <button
              data-no-drag
              tabIndex={-1}
              className={`mp-mute ${muted ? "muted" : ""}`}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.toggleMuted("music"); }}
              title={muted ? "Un-mute music" : "Mute music"}
              aria-label={muted ? "Un-mute music" : "Mute music"}
            >
              <span
                className="icon-mask mp-mute-icon"
                style={{
                  WebkitMaskImage: `url(${muted ? "/icons/audio/speaker-off.svg" : "/icons/audio/speaker-on.svg"})`,
                  maskImage: `url(${muted ? "/icons/audio/speaker-off.svg" : "/icons/audio/speaker-on.svg"})`,
                }}
              />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
