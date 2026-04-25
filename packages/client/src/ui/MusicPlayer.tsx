import { useEffect, useRef, useState } from "react";
import { Sound, type NowPlaying } from "../game/audio/Sound";

const LS_KEY = "artillery:musicPlayer:v3";
const DRAG_THRESHOLD_PX = 5;

type Mode = "docked" | "floating";

interface State {
  mode: Mode;
  /** Floating window position. Ignored in docked mode. */
  x: number;
  y: number;
}

function defaultState(): State {
  return {
    mode: "docked",
    x: 16,
    y: Math.max(160, window.innerHeight - 260),
  };
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.mode === "docked" || parsed.mode === "floating")) {
      return {
        mode: parsed.mode,
        x: typeof parsed.x === "number"
          ? Math.max(4, Math.min(window.innerWidth - 40, parsed.x))
          : 16,
        y: typeof parsed.y === "number"
          ? Math.max(60, Math.min(window.innerHeight - 40, parsed.y))
          : Math.max(160, window.innerHeight - 260),
      };
    }
  } catch { /* ignore */ }
  return defaultState();
}

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Music widget with two layouts:
 *
 *  • **docked** — a thin bar pinned to the bottom of the screen. Fixed
 *    position, not draggable. Default for new users.
 *  • **floating** — a compact panel the user can drag around. Pop out
 *    from the docked bar via the ⇱ button; dock back via the ⇲ button
 *    on the panel's header grip row.
 *
 * Drag is only active in floating mode and uses window listeners inside
 * the pointerdown closure so the gesture survives the cursor crossing
 * overlays, game canvas, or off-screen.
 */
export function MusicPlayer(): JSX.Element | null {
  const [info, setInfo] = useState<NowPlaying | null>(null);
  const [state, setState] = useState<State>(loadState);
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
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  // Lets the app's CSS push bottom UI (weapon tray, fire button, chat
  // panel) above the docked bar so they don't get covered. The Phaser
  // host shrinks too, so dispatch a resize on toggle to make the scale
  // manager repaint into the new bounds.
  useEffect(() => {
    document.documentElement.classList.toggle("mp-docked", state.mode === "docked");
    window.dispatchEvent(new Event("resize"));
    return () => {
      document.documentElement.classList.remove("mp-docked");
      window.dispatchEvent(new Event("resize"));
    };
  }, [state.mode]);

  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current;
      const w = el?.offsetWidth ?? 240;
      const h = el?.offsetHeight ?? 160;
      setState((p) => ({
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
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (state.mode !== "floating") return;

    const root = rootRef.current;
    if (!root) return;

    const targetEl = e.target as HTMLElement;
    if (targetEl.closest("[data-no-drag]")) return;
    // Only the grip starts a drag in floating mode.
    if (!targetEl.closest("[data-drag-handle]")) return;

    const rect = root.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    const width = rect.width;
    const height = rect.height;
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
      setState((p) => ({ ...p, x: nx, y: ny }));
    };

    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.documentElement.classList.remove("mp-dragging");
      document.body.style.userSelect = "";
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

  const setMode = (mode: Mode) => setState((s) => ({ ...s, mode }));

  // Render the chrome immediately even before Sound subscription fires.
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

  const controls = (
    <>
      <button
        data-no-drag
        tabIndex={-1}
        className="mp-btn"
        disabled={!hasTrack}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.previous(); }}
        title="Previous track"
        aria-label="Previous track"
      >◀◀</button>
      <button
        data-no-drag
        tabIndex={-1}
        className="mp-btn mp-play"
        disabled={!hasTrack}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.togglePause(); }}
        title={paused ? "Play" : "Pause"}
        aria-label={paused ? "Play" : "Pause"}
      >{paused ? "▶" : "❚❚"}</button>
      <button
        data-no-drag
        tabIndex={-1}
        className="mp-btn"
        disabled={!hasTrack}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.next(); }}
        title="Next track"
        aria-label="Next track"
      >▶▶</button>
      <button
        data-no-drag
        tabIndex={-1}
        className={`mp-btn mp-mute ${muted ? "muted" : ""}`}
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
    </>
  );

  if (state.mode === "docked") {
    return (
      <div
        ref={rootRef}
        className="music-player docked"
      >
        <span className="mp-dock-glyph" aria-hidden>♪</span>
        <div className={`mp-dock-id ${hasTrack ? "" : "idle"}`}>
          <span className="mp-title">{trackTitle}</span>
          <span className="mp-artist">{trackArtist}</span>
        </div>
        <div
          data-no-drag
          className="mp-scrub mp-scrub-dock"
          onClick={hasTrack ? onScrub : undefined}
        >
          <div className="mp-scrub-fill" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mp-dock-time">{fmt(posSec)} / {fmt(dur)}</div>
        <div className="mp-buttons">{controls}</div>
        <button
          data-no-drag
          tabIndex={-1}
          className="mp-mode-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMode("floating"); }}
          title="Pop out music player"
          aria-label="Pop out music player"
        >⇱</button>
      </div>
    );
  }

  // Floating
  return (
    <div
      ref={rootRef}
      className="music-player floating"
      style={{
        left: state.x,
        top: state.y,
        right: "auto",
        bottom: "auto",
        touchAction: "none",
      }}
      onPointerDown={beginDrag}
    >
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
          className="mp-mode-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMode("docked"); }}
          title="Dock to bottom bar"
          aria-label="Dock to bottom bar"
        >⇲</button>
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
      <div className="mp-buttons">{controls}</div>
    </div>
  );
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
