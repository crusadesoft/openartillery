import { useEffect, useRef, useState } from "react";
import { Sound } from "../game/audio/Sound";
import type { Route } from "../router";

interface Props { navigate: (r: Route) => void; }

export interface StoredSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  uiClicks: boolean;
  reduceMotion: boolean;
  cameraShake: boolean;
}

const DEFAULTS: StoredSettings = {
  masterVolume: 0.7,
  musicVolume: 0.35,
  sfxVolume: 0.85,
  uiVolume: 0.7,
  uiClicks: true,
  reduceMotion: false,
  cameraShake: true,
};

const STORAGE_KEY = "artillery:settings";

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: StoredSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  Sound.setMasterVolume(s.masterVolume);
  Sound.setMusicVolume(s.musicVolume);
  Sound.setSfxVolume(s.sfxVolume);
  Sound.setUiVolume(s.uiClicks ? s.uiVolume : 0);
  document.documentElement.dataset.reducedMotion = s.reduceMotion ? "1" : "0";
}

export function applySettingsOnBoot(): void {
  saveSettings(loadSettings());
  Sound.loadPersistedMutes();
}

export function SettingsPage({ navigate }: Props): JSX.Element {
  const [s, setS] = useState<StoredSettings>(() => loadSettings());
  useEffect(() => { saveSettings(s); }, [s]);

  return (
    <div className="audio-booth">
      <div className="audio-booth-grid">
        <section className="console-rack" aria-label="Audio mixing console">
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
                <span className="deck-nameplate-line">AUDIO COMMAND · CONSOLE SC-7G</span>
                <span className="deck-nameplate-sn">SN 3F2A · MIL-SPEC</span>
                <span className="screw screw-bl" /><span className="screw screw-br" />
              </div>

              <div className="console-zone">
                <span className="deck-stencil">GAIN STAGES</span>
                <div className="deck-knobs">
                  <KnobMount label="MASTER" muteKey="master" value={s.masterVolume} onChange={(v) => setS({ ...s, masterVolume: v })} />
                  <KnobMount label="MUSIC"  muteKey="music"  value={s.musicVolume}  onChange={(v) => setS({ ...s, musicVolume: v })} />
                  <KnobMount label="SFX"    muteKey="sfx"    value={s.sfxVolume}    onChange={(v) => setS({ ...s, sfxVolume: v })} />
                  <KnobMount label="UI"     muteKey="ui"     value={s.uiVolume}     onChange={(v) => setS({ ...s, uiVolume: v })} />
                </div>
              </div>

              <div className="console-seam" aria-hidden />

              <div className="console-zone">
                <span className="deck-stencil">FUNCTIONS</span>
                <div className="deck-rockers">
                  <RockerSwitch label="UI CLICKS" value={s.uiClicks} onChange={(v) => setS({ ...s, uiClicks: v })} />
                  <RockerSwitch label="CAM SHAKE" value={s.cameraShake} onChange={(v) => setS({ ...s, cameraShake: v })} />
                  <RockerSwitch label="REDUCE MOTION" value={s.reduceMotion} onChange={(v) => setS({ ...s, reduceMotion: v })} />
                </div>
              </div>

              <div className="console-action-strip">
                <span className="action-stencil" aria-hidden>FACTORY RESET</span>
                <DeckButton label="Restore Defaults" onClick={() => setS({ ...DEFAULTS })} />
              </div>
            </div>
          </div>

          <div className="console-rack-feet" aria-hidden>
            <span className="console-rack-foot" />
            <span className="console-rack-foot" />
          </div>
        </section>

        <aside className="ops-clipboard" aria-label="Operator reference">
          <div className="ops-clip" aria-hidden>
            <span className="clipboard-clip-screw clipboard-clip-screw-l" />
            <span className="clipboard-clip-screw clipboard-clip-screw-r" />
          </div>
          <div className="ops-paper">
            <header className="ops-paper-head">
              <div className="ops-paper-num">SECTION 07</div>
              <h3 className="ops-paper-title">Operator Reference</h3>
              <div className="ops-paper-sub">Controls &amp; callouts</div>
            </header>
            <div className="ops-paper-body">
              <KeyRow keys={["DRAG"]} text="Aim · drag = power" />
              <KeyRow keys={["SPACE"]} text="Fire (or red button)" />
              <KeyRow keys={["A", "D"]} text="Drive · or arrows" />
              <KeyRow keys={["1", "—", "9"]} text="Pick weapons" />
              <KeyRow keys={["Q", "W", "E", "R"]} text="Use items" />
              <KeyRow keys={["ENTER"]} text="Chat" />
              <KeyRow keys={["ESC"]} text="Pause" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function KnobMount({
  label, muteKey, value, onChange,
}: {
  label: string;
  muteKey: "master" | "music" | "sfx" | "ui";
  value: number;
  onChange: (v: number) => void;
}) {
  const [, setMuteTick] = useState(0);
  useEffect(() => Sound.onMuteChange(() => setMuteTick((t) => t + 1)), [muteKey]);
  const muted = Sound.isMuted(muteKey);
  const pct = Math.round(value * 100);
  const meterSegments = 10;
  const lit = muted ? 0 : Math.round((pct / 100) * meterSegments);

  return (
    <div className={`knob-mount ${muted ? "muted" : ""}`}>
      <Knob value={value} onChange={onChange} disabled={muted} />
      <div className="vu-strip" aria-hidden>
        {Array.from({ length: meterSegments }).map((_, i) => (
          <span
            key={i}
            className={`vu-led ${i < lit ? "on" : ""} ${i >= meterSegments - 2 ? "red" : i >= meterSegments - 4 ? "amber" : ""}`}
          />
        ))}
      </div>
      <div className="knob-engraving">{label}</div>
      <button
        type="button"
        className={`mute-lamp ${muted ? "lit" : ""}`}
        onClick={() => Sound.toggleMuted(muteKey)}
        aria-label={muted ? "Un-mute" : "Mute"}
        title={muted ? "Un-mute" : "Mute"}
      >
        <span className="lamp-led" />
      </button>
    </div>
  );
}

/**
 * Real rotary knob — vertical drag to change value (drag up = increase).
 * Range: 0–1. Visual rotation: -135° (0) → +135° (1).
 */
function Knob({
  value, onChange, disabled,
}: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ startY: number; startV: number } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragging.current;
      if (!d) return;
      const delta = (d.startY - e.clientY) / 200; // 200px = full sweep
      onChange(Math.max(0, Math.min(1, d.startV + delta)));
    };
    const up = () => { dragging.current = null; document.body.classList.remove("knob-grabbing"); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    dragging.current = { startY: e.clientY, startV: value };
    document.body.classList.add("knob-grabbing");
  };

  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    const delta = -e.deltaY / 1000;
    onChange(Math.max(0, Math.min(1, value + delta)));
  };

  const angle = -135 + value * 270;

  return (
    <div
      ref={ref}
      className={`knob-physical ${disabled ? "disabled" : ""}`}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div className="knob-tickring">
        {Array.from({ length: 11 }).map((_, i) => {
          const a = -135 + (i / 10) * 270;
          return <span key={i} className="knob-tick" style={{ transform: `rotate(${a}deg) translateY(-42px)` }} />;
        })}
      </div>
      <div className="knob-body" style={{ transform: `rotate(${angle}deg)` }}>
        <span className="knob-pointer" />
      </div>
    </div>
  );
}

export function RockerSwitch({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`rocker-cell ${value ? "on" : ""}`}>
      <div className="rocker-cell-label">{label}</div>
      <button
        type="button"
        className="rocker-physical"
        data-on={value ? "true" : "false"}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className="rocker-up" aria-hidden>I</span>
        <span className="rocker-down" aria-hidden>O</span>
      </button>
      <span className={`rocker-led ${value ? "on" : ""}`} />
    </div>
  );
}

function KeyRow({ keys, text }: { keys: string[]; text: string }) {
  return (
    <div className="legend-row">
      <div className="legend-keys">
        {keys.map((k, i) => <span key={i} className="keycap">{k}</span>)}
      </div>
      <div className="legend-desc">{text}</div>
    </div>
  );
}

export function DeckButton({
  label, onClick, variant,
}: {
  label: string;
  onClick: () => void;
  variant?: "go" | "danger";
}) {
  return (
    <button
      type="button"
      className={`deck-btn ${variant ? `deck-btn-${variant}` : ""}`}
      onClick={onClick}
    >
      <span className="deck-btn-led" />
      <span className="deck-btn-label">{label}</span>
    </button>
  );
}
