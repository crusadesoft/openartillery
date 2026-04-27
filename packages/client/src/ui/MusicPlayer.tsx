import { useEffect, useState } from "react";
import { Sound, type NowPlaying } from "../game/audio/Sound";

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Field receiver — the painted-metal transistor radio docked at the
 * bottom of every page. Speaker grille, amber LCD readout, tuning
 * dial, bakelite knobs. Layout reserves `--dock-h` for it from the
 * root, so other surfaces shrink to fit rather than overlay it.
 */
export function MusicPlayer(): JSX.Element | null {
  const [info, setInfo] = useState<NowPlaying | null>(null);
  const [, setScrubberTick] = useState(0);
  const [muteTick, setMuteTick] = useState(0);

  useEffect(() => Sound.subscribe(setInfo), []);
  useEffect(() => Sound.onMuteChange(() => setMuteTick((t) => t + 1)), []);

  useEffect(() => {
    const id = window.setInterval(() => setScrubberTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, []);

  const muted = Sound.isMuted("music");
  void muteTick;

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp(0, 1, (e.clientX - rect.left) / rect.width);
    const dur = Sound.duration();
    if (dur > 0) Sound.seek(ratio * dur);
  };

  const hasTrack = !!info;
  const paused = info?.paused ?? true;
  const trackTitle = info?.track.title ?? "Awaiting signal…";
  const trackArtist = info?.track.artist ?? "tap to begin";
  const contextLabel = info?.context.toUpperCase() ?? "STANDBY";
  const dur = info?.duration || (hasTrack ? Sound.duration() : 0) || 1;
  const posSec = hasTrack ? (paused ? info!.position : Sound.position()) : 0;
  const pct = hasTrack ? clamp(0, 1, posSec / dur) : 0;

  return (
    <div className="radio-deck" role="region" aria-label="Music receiver">
      <span className="radio-bolt radio-bolt-tl" aria-hidden />
      <span className="radio-bolt radio-bolt-bl" aria-hidden />
      <span className="radio-bolt radio-bolt-tr" aria-hidden />
      <span className="radio-bolt radio-bolt-br" aria-hidden />

      <div className="radio-speaker" aria-hidden>
        <span className="radio-speaker-cone" />
      </div>

      <div className="radio-brand" aria-hidden>
        <span className="radio-brand-name">FIELD·7</span>
        <span className="radio-brand-sub">RECEIVER · TRANSISTOR</span>
      </div>

      <div className={`radio-display ${hasTrack ? "" : "idle"}`}>
        <span className="radio-display-label">
          ♪ NOW PLAYING · {contextLabel}
        </span>
        <span className="radio-display-title">{trackTitle}</span>
        <span className="radio-display-artist">{trackArtist}</span>
      </div>

      <div className="radio-tuner">
        <div className="radio-tuner-band" aria-hidden>
          <span className="radio-tuner-scale-mhz">MHz</span>
          <span className="radio-tuner-ticks" />
        </div>
        <div
          className="radio-tuner-track"
          onClick={hasTrack ? onScrub : undefined}
          role="slider"
          aria-label="Track position"
          aria-valuenow={Math.round(pct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="radio-tuner-fill" style={{ width: `${pct * 100}%` }} />
          <span className="radio-tuner-needle" style={{ left: `${pct * 100}%` }} />
        </div>
        <div className="radio-tuner-time">{fmt(posSec)} / {fmt(dur)}</div>
      </div>

      <div className="radio-controls">
        <button
          type="button"
          tabIndex={-1}
          className="radio-knob"
          disabled={!hasTrack}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.previous(); }}
          title="Previous track"
          aria-label="Previous track"
        >◀◀</button>
        <button
          type="button"
          tabIndex={-1}
          className="radio-knob radio-knob-play"
          disabled={!hasTrack}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.togglePause(); }}
          title={paused ? "Play" : "Pause"}
          aria-label={paused ? "Play" : "Pause"}
        >{paused ? "▶" : "❚❚"}</button>
        <button
          type="button"
          tabIndex={-1}
          className="radio-knob"
          disabled={!hasTrack}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.next(); }}
          title="Next track"
          aria-label="Next track"
        >▶▶</button>
        <button
          type="button"
          tabIndex={-1}
          className={`radio-knob radio-knob-mute ${muted ? "muted" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); Sound.toggleMuted("music"); }}
          title={muted ? "Un-mute music" : "Mute music"}
          aria-label={muted ? "Un-mute music" : "Mute music"}
        >
          <span
            className="icon-mask radio-knob-icon"
            style={{
              WebkitMaskImage: `url(${muted ? "/icons/audio/speaker-off.svg" : "/icons/audio/speaker-on.svg"})`,
              maskImage: `url(${muted ? "/icons/audio/speaker-off.svg" : "/icons/audio/speaker-on.svg"})`,
            }}
          />
        </button>
      </div>
    </div>
  );
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
