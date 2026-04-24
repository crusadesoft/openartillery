import { useEffect, useRef, useState } from "react";
import {
  ALL_BARRELS,
  ALL_BODIES,
  ALL_DECALS,
  ALL_PATTERNS,
  ALL_TURRETS,
  BARREL_DESCRIPTORS,
  BODY_DESCRIPTORS,
  DECAL_DESCRIPTORS,
  PATTERN_DESCRIPTORS,
  type BarrelStyle,
  type BodyStyle,
  type DecalStyle,
  type Loadout,
  PALETTE_ACCENT,
  PALETTE_PRIMARY,
  type PatternStyle,
  TURRET_DESCRIPTORS,
  type TurretStyle,
} from "@artillery/shared";
import { loadLoadout, saveLoadout } from "../game/loadoutStorage";
import { drawTankPreview } from "../game/tankPreview";
import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";
import { click } from "../ui/sfx";

interface Props { navigate: (r: Route) => void; }

/**
 * Tank customization: pick body / turret / barrel / primary / accent.
 * Preview is a fully self-contained canvas so the player sees the actual
 * silhouette of their choice without spinning up Phaser.
 */
export function CustomizePage({ navigate }: Props): JSX.Element {
  const [l, setL] = useState<Loadout>(() => loadLoadout());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveLoadout(l), [l]);

  // Redraw whenever loadout changes OR the preview container is resized.
  // Container width is the source of truth so the canvas can't bleed past
  // its parent on narrower viewports or wider cards.
  useEffect(() => {
    const c = canvasRef.current;
    const host = previewRef.current;
    if (!c || !host) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      // Ask the DOM what width the canvas actually gets inside its
      // container — `.customize-preview canvas { width: 100% }` in the
      // stylesheet constrains it to the box, so clientWidth is the true
      // rendered size we should draw into. Falls back to a sensible
      // default if the element isn't laid out yet.
      const logicalW = Math.max(220, c.clientWidth || host.clientWidth - 28);
      const logicalH = Math.round(logicalW * 0.62);
      if (c.width !== logicalW * dpr) c.width = logicalW * dpr;
      if (c.height !== logicalH * dpr) c.height = logicalH * dpr;
      // Height is explicit so aspect ratio stays pinned; width stays
      // managed by CSS 100%.
      c.style.height = `${logicalH}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPreview(c, l, logicalW, logicalH);
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(host);
    return () => ro.disconnect();
  }, [l]);

  const set = (patch: Partial<Loadout>) => { click(); setL({ ...l, ...patch }); };

  return (
    <div className="container">
      <div className="card">
        <h2>Customize</h2>
        <div className="customize-layout">
          <div className="customize-preview" ref={previewRef}>
            <canvas ref={canvasRef} />
            <div className="customize-stamp">SERIAL #{serial(l)}</div>
          </div>

          <div className="customize-panels">
            <Section title="Hull">
              <PartRow
                options={ALL_BODIES.map((id) => ({
                  id,
                  label: BODY_DESCRIPTORS[id].label,
                  blurb: BODY_DESCRIPTORS[id].blurb,
                }))}
                value={l.body}
                onPick={(v) => set({ body: v as BodyStyle })}
              />
            </Section>
            <Section title="Turret">
              <PartRow
                options={ALL_TURRETS.map((id) => ({
                  id,
                  label: TURRET_DESCRIPTORS[id].label,
                  blurb: TURRET_DESCRIPTORS[id].blurb,
                }))}
                value={l.turret}
                onPick={(v) => set({ turret: v as TurretStyle })}
              />
            </Section>
            <Section title="Barrel">
              <PartRow
                options={ALL_BARRELS.map((id) => ({
                  id,
                  label: BARREL_DESCRIPTORS[id].label,
                  blurb: BARREL_DESCRIPTORS[id].blurb,
                }))}
                value={l.barrel}
                onPick={(v) => set({ barrel: v as BarrelStyle })}
              />
            </Section>
            <Section title="Pattern">
              <PartRow
                options={ALL_PATTERNS.map((id) => ({
                  id,
                  label: PATTERN_DESCRIPTORS[id].label,
                  blurb: PATTERN_DESCRIPTORS[id].blurb,
                }))}
                value={l.pattern}
                onPick={(v) => set({ pattern: v as PatternStyle })}
              />
            </Section>
            <Section title="Decal">
              <PartRow
                options={ALL_DECALS.map((id) => ({
                  id,
                  label: DECAL_DESCRIPTORS[id].label,
                  blurb: DECAL_DESCRIPTORS[id].blurb,
                }))}
                value={l.decal}
                onPick={(v) => set({ decal: v as DecalStyle })}
              />
            </Section>
            <Section title="Primary paint">
              <Swatches
                options={PALETTE_PRIMARY}
                value={l.primaryColor}
                onPick={(v) => set({ primaryColor: v })}
              />
              <HexPicker
                value={l.primaryColor}
                onChange={(v) => set({ primaryColor: v })}
              />
            </Section>
            <Section title="Accent stripe">
              <Swatches
                options={PALETTE_ACCENT}
                value={l.accentColor}
                onPick={(v) => set({ accentColor: v })}
              />
              <HexPicker
                value={l.accentColor}
                onChange={(v) => set({ accentColor: v })}
              />
            </Section>
            <Section title="Pattern color">
              <Swatches
                options={PALETTE_PRIMARY}
                value={l.patternColor}
                onPick={(v) => set({ patternColor: v })}
              />
              <HexPicker
                value={l.patternColor}
                onChange={(v) => set({ patternColor: v })}
              />
            </Section>

            <div className="customize-actions">
              <SfxButton className="go-btn" onClick={() => navigate({ name: "play" })}>
                Deploy to battle
              </SfxButton>
              <SfxButton className="ghost-btn" onClick={() => navigate({ name: "home" })}>
                ← Back
              </SfxButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="customize-section">
      <div className="customize-label">{title}</div>
      {children}
    </div>
  );
}

function PartRow({
  options, value, onPick,
}: {
  options: { id: string; label: string; blurb: string }[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="part-row">
      {options.map((opt) => (
        <div
          key={opt.id}
          className={`part-tile ${value === opt.id ? "active" : ""}`}
          onClick={() => onPick(opt.id)}
          title={opt.blurb}
        >
          <div className="part-name">{opt.label}</div>
          <div className="part-blurb">{opt.blurb}</div>
        </div>
      ))}
    </div>
  );
}

function Swatches({
  options, value, onPick,
}: { options: number[]; value: number; onPick: (v: number) => void }) {
  return (
    <div className="swatch-row">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${value === c ? "active" : ""}`}
          style={{ background: `#${c.toString(16).padStart(6, "0")}` }}
          onClick={() => onPick(c)}
          aria-label={`Color ${c.toString(16)}`}
        />
      ))}
    </div>
  );
}

function HexPicker({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  const hex = `#${value.toString(16).padStart(6, "0")}`;
  const [text, setText] = useState(hex);
  // Keep the text field synced when a swatch click updates `value` externally.
  useEffect(() => setText(hex), [hex]);
  const commit = (raw: string) => {
    const clean = raw.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(clean)) onChange(parseInt(clean, 16));
    else if (/^[0-9a-fA-F]{3}$/.test(clean)) {
      const [r, g, b] = clean.split("");
      onChange(parseInt(`${r}${r}${g}${g}${b}${b}`, 16));
    }
  };
  return (
    <div className="hex-picker">
      <label className="hex-picker-swatch">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(parseInt(e.target.value.replace(/^#/, ""), 16))}
        />
        <span className="hex-picker-chip" style={{ background: hex }} />
      </label>
      <input
        type="text"
        className="hex-picker-text"
        value={text}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="#rrggbb"
      />
    </div>
  );
}

function serial(l: Loadout): string {
  const h = [
    l.body.charCodeAt(0),
    l.turret.charCodeAt(0),
    l.barrel.charCodeAt(0),
    l.primaryColor & 0xff,
    l.accentColor & 0xff,
  ].map((n) => n.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `TNK-${h}`;
}

/** Hand-drawn tank preview on a plain canvas — shares the rendering
 *  helper used by the leaderboard vehicle cards and the service-record
 *  vehicle panel so all three surfaces show the same silhouette as the
 *  in-game sprite. */
function drawPreview(
  canvas: HTMLCanvasElement | null,
  l: Loadout,
  w: number,
  h: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  const accentRgb = (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--theme-accent-rgb").trim()
  ) || "224, 120, 69";

  // Textured "deck" where the tank sits.
  const deck = ctx.createLinearGradient(0, h - 70, 0, h);
  deck.addColorStop(0, "rgba(20, 16, 12, 0.0)");
  deck.addColorStop(1, `rgba(${accentRgb}, 0.4)`);
  ctx.fillStyle = deck;
  ctx.fillRect(0, h - 70, w, 70);

  const primary = `#${(l.primaryColor & 0xffffff).toString(16).padStart(6, "0")}`;
  const accent  = `#${(l.accentColor  & 0xffffff).toString(16).padStart(6, "0")}`;

  // Consistent base zoom across all hulls so a light chassis looks
  // smaller than a heavy one instead of getting scaled up to fill the
  // canvas. Widths proportional to in-game hull widths (heavy=48,
  // light=40, assault=50).
  const marginTop = 34;          // stencil + antenna clearance
  const marginBottom = 30;       // baseline plate + serial text
  const availH = h - marginTop - marginBottom;

  const hullFrac = l.body === "light" ? 0.30 : l.body === "assault" ? 0.26 : 0.34;
  const treadFrac = 0.13;
  const heavyVFactor = 0.34 + treadFrac + 0.34 * 0.45;  // tallest variant
  // Size so the *heavy* hull just fits — lighter hulls stay smaller.
  const baseHeavyTankW = Math.min(availH / heavyVFactor, w - 40, 240);
  const bodyFactor =
    l.body === "light" ? 40 / 48 :
    l.body === "assault" ? 50 / 48 :
    1.0;
  const tankW = baseHeavyTankW * bodyFactor;

  const hullH = tankW * hullFrac;
  const treadH = Math.max(8, tankW * treadFrac);
  const totalH = hullH + treadH;
  const x0 = w / 2 - tankW / 2;
  const y0 = h - marginBottom - totalH;

  drawTankPreview(ctx, {
    x: x0,
    y: y0,
    width: tankW,
    bodyStyle: l.body,
    turretStyle: l.turret,
    barrelStyle: l.barrel,
    primary,
    accent,
    pattern: l.pattern,
    patternColor: `#${(l.patternColor & 0xffffff).toString(16).padStart(6, "0")}`,
    decal: l.decal,
  });

  ctx.fillStyle = `rgba(${accentRgb}, 0.85)`;
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  ctx.fillText("PREVIEW", 12, 20);
}
