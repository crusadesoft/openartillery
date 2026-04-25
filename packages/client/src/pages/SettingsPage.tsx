import { useEffect, useState } from "react";
import { Sound } from "../game/audio/Sound";
import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";

interface Props { navigate: (r: Route) => void; }

export type ConcreteThemeId = "rust" | "desert" | "arctic" | "dusk" | "jungle";
export type ThemeId = ConcreteThemeId | "random";

const CONCRETE_THEMES: readonly ConcreteThemeId[] = [
  "rust", "desert", "arctic", "dusk", "jungle",
] as const;

export const THEMES: ReadonlyArray<{ id: ThemeId; label: string; blurb: string }> = [
  { id: "random",  label: "Random",  blurb: "Surprise — picks a different theme each visit" },
  { id: "rust",    label: "Rust",    blurb: "Oxidized metal" },
  { id: "desert",  label: "Desert",  blurb: "Sun-bleached ochre" },
  { id: "arctic",  label: "Arctic",  blurb: "Cold steel · snow glare" },
  { id: "dusk",    label: "Dusk",    blurb: "Violet twilight" },
  { id: "jungle",  label: "Jungle",  blurb: "Olive canopy" },
];

// Resolve "random" to a concrete theme once per session so the look stays
// stable while the player navigates around — switching pages shouldn't
// re-roll. New tab / hard refresh = new roll.
let SESSION_RANDOM: ConcreteThemeId | null = null;
function resolveTheme(stored: ThemeId): ConcreteThemeId {
  if (stored !== "random") return stored;
  if (!SESSION_RANDOM) {
    SESSION_RANDOM = CONCRETE_THEMES[
      Math.floor(Math.random() * CONCRETE_THEMES.length)
    ]!;
  }
  return SESSION_RANDOM;
}

export interface StoredSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  uiClicks: boolean;
  reduceMotion: boolean;
  cameraShake: boolean;
  theme: ThemeId;
}

const DEFAULTS: StoredSettings = {
  masterVolume: 0.7,
  musicVolume: 0.35,
  sfxVolume: 0.85,
  uiVolume: 0.7,
  uiClicks: true,
  reduceMotion: false,
  cameraShake: true,
  theme: "random",
};

const STORAGE_KEY = "artillery:settings";

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) };
    if (!THEMES.some((t) => t.id === parsed.theme)) parsed.theme = DEFAULTS.theme;
    return parsed;
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: StoredSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  Sound.setMasterVolume(s.masterVolume);
  Sound.setMusicVolume(s.musicVolume);
  Sound.setSfxVolume(s.sfxVolume);
  Sound.setUiVolume(s.uiClicks ? s.uiVolume : 0);
  document.documentElement.dataset.reducedMotion = s.reduceMotion ? "1" : "0";
  document.documentElement.dataset.theme = resolveTheme(s.theme);
}

export function applySettingsOnBoot(): void {
  saveSettings(loadSettings());
  // Mute flags live in their own storage key (toggled by the MusicPlayer
  // UI outside of this settings flow). Restore them so a page refresh
  // doesn't un-mute the user.
  Sound.loadPersistedMutes();
}

export function SettingsPage({ navigate }: Props): JSX.Element {
  const [s, setS] = useState<StoredSettings>(() => loadSettings());
  useEffect(() => { saveSettings(s); }, [s]);

  return (
    <div className="container">
      <div className="card">
        <h2>Audio</h2>
        <Slider label="Master"        value={s.masterVolume} muteKey="master" onChange={(v) => setS({ ...s, masterVolume: v })} />
        <Slider label="Music"         value={s.musicVolume}  muteKey="music"  onChange={(v) => setS({ ...s, musicVolume: v })} />
        <Slider label="Sound effects" value={s.sfxVolume}    muteKey="sfx"    onChange={(v) => setS({ ...s, sfxVolume: v })} />
        <Slider label="UI sounds"     value={s.uiVolume}     muteKey="ui"     onChange={(v) => setS({ ...s, uiVolume: v })} />
      </div>

      <div className="card">
        <h2>Interface</h2>
        <Toggle label="UI click sounds" value={s.uiClicks} onChange={(v) => setS({ ...s, uiClicks: v })} />
        <Toggle label="Camera shake on explosions" value={s.cameraShake} onChange={(v) => setS({ ...s, cameraShake: v })} />
        <Toggle label="Reduce motion" value={s.reduceMotion} onChange={(v) => setS({ ...s, reduceMotion: v })} />

        <div className="field" style={{ marginTop: 14 }}>
          <label style={{ display: "block", marginBottom: 8 }}>Menu theme</label>
          <div className="theme-picker">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch ${s.theme === t.id ? "on" : ""}`}
                data-theme-preview={t.id}
                onClick={() => setS({ ...s, theme: t.id })}
                aria-pressed={s.theme === t.id}
                title={t.blurb}
              >
                <span className="theme-chip" aria-hidden />
                <span className="theme-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <SfxButton className="secondary-btn" onClick={() => setS({ ...DEFAULTS })}>Restore defaults</SfxButton>
          <SfxButton className="ghost-btn" onClick={() => navigate({ name: "home" })}>← Back</SfxButton>
        </div>
      </div>

      <div className="card">
        <h2>Keybindings</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: 0 }}>
          Drag on the battlefield to aim. Drag distance = power. Release doesn't
          fire — press <code>SPACE</code> or <code>ENTER</code> (or the red FIRE
          button). Drive with <code>A/D</code> or arrow keys. <code>1–9</code>
          selects weapons. <code>ESC</code> opens the pause menu with mid-match
          settings.
        </p>
      </div>

      <div className="card">
        <h2>Credits</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "0 0 6px" }}>
          Music by <a href="https://www.scottbuckley.com.au" target="_blank" rel="noreferrer">Scott Buckley</a> — "Meanwhile" &amp; "Simulacra", CC-BY 4.0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "0 0 6px" }}>
          Explosion SFX by Viktor Hahn (opengameart.org) — CC-BY-SA 3.0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "0 0 6px" }}>
          Cannon fire by Thimras (opengameart.org) — CC0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "0 0 6px" }}>
          UI sounds by p0ss (opengameart.org) — CC-BY-SA 3.0.
        </p>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: 0 }}>
          PBR textures from <a href="https://ambientcg.com" target="_blank" rel="noreferrer">ambientCG</a> — CC0.
        </p>
      </div>
    </div>
  );
}

function Slider({
  label, value, muteKey, onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  muteKey?: "master" | "music" | "sfx" | "ui";
}) {
  // Track mute state so we can re-render when toggled. Stored volume is
  // untouched by mute — the toggle just sets a flag inside Sound.
  const [, setMuteTick] = useState(0);
  useEffect(() => muteKey
    ? Sound.onMuteChange(() => setMuteTick((t) => t + 1))
    : undefined,
    [muteKey]);
  const muted = muteKey ? Sound.isMuted(muteKey) : false;

  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1 }}>
          {label} · {muted ? <em style={{ color: "var(--theme-accent-bright)" }}>MUTED</em> : `${Math.round(value * 100)}%`}
        </span>
        {muteKey && (
          <button
            type="button"
            className={`mute-chip ${muted ? "on" : ""}`}
            onClick={() => Sound.toggleMuted(muteKey)}
            title={muted ? "Un-mute" : "Mute"}
            aria-label={muted ? "Un-mute" : "Mute"}
          >
            <span
              className="icon-mask mute-chip-icon"
              style={{
                WebkitMaskImage: `url(${muted ? "/icons/audio/speaker-off.svg" : "/icons/audio/speaker-on.svg"})`,
                maskImage: `url(${muted ? "/icons/audio/speaker-off.svg" : "/icons/audio/speaker-on.svg"})`,
              }}
            />
          </button>
        )}
      </label>
      <input
        type="range" min={0} max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={muted}
        style={muted ? { opacity: 0.35 } : undefined}
      />
    </div>
  );
}

function Toggle({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid var(--panel-edge)",
      }}
    >
      <label style={{ flex: 1, fontSize: 14, color: "var(--ink)" }}>{label}</label>
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
