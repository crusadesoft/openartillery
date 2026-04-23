import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "../pages/SettingsPage";

/**
 * In-match settings panel (embedded in pause menu). Same fields as the
 * Settings page but compact layout.
 */
export function SettingsPanel(): JSX.Element {
  const [s, setS] = useState(() => loadSettings());
  useEffect(() => { saveSettings(s); }, [s]);

  return (
    <div>
      <Slider label="Master"        value={s.masterVolume} onChange={(v) => setS({ ...s, masterVolume: v })} />
      <Slider label="Music"         value={s.musicVolume}  onChange={(v) => setS({ ...s, musicVolume: v })} />
      <Slider label="Sound effects" value={s.sfxVolume}    onChange={(v) => setS({ ...s, sfxVolume: v })} />
      <Slider label="UI sounds"     value={s.uiVolume}     onChange={(v) => setS({ ...s, uiVolume: v })} />
      <Toggle label="UI click sounds" value={s.uiClicks} onChange={(v) => setS({ ...s, uiClicks: v })} />
      <Toggle label="Camera shake" value={s.cameraShake} onChange={(v) => setS({ ...s, cameraShake: v })} />
      <Toggle label="Reduce motion" value={s.reduceMotion} onChange={(v) => setS({ ...s, reduceMotion: v })} />
    </div>
  );
}

function Slider({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>{label} · {Math.round(value * 100)}%</label>
      <input
        type="range" min={0} max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </div>
  );
}

function Toggle({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "10px 0", borderBottom: "1px solid var(--panel-edge)",
      }}
    >
      <label style={{ flex: 1, fontSize: 13, color: "var(--ink)" }}>{label}</label>
      <button
        type="button"
        className="switch"
        data-on={value ? "true" : "false"}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className="handle" />
      </button>
    </div>
  );
}
