import { useEffect, useState } from "react";
import {
  KnobMount,
  RockerSwitch,
  loadSettings,
  saveSettings,
} from "../pages/SettingsPage";

/**
 * In-match settings panel (embedded in pause menu). Reuses the audio
 * console knobs + rocker switches from SettingsPage so the controls feel
 * like the same hardware just bolted to a smaller faceplate.
 */
export function SettingsPanel(): JSX.Element {
  const [s, setS] = useState(() => loadSettings());
  useEffect(() => { saveSettings(s); }, [s]);

  return (
    <div className="pause-settings">
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
    </div>
  );
}
