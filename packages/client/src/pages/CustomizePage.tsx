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
import { drawTankPreview, renderLoadoutCanvas } from "../game/tankPreview";
import type { Route } from "../router";
import { SfxButton } from "../ui/SfxButton";
import { click } from "../ui/sfx";

interface Props { navigate: (r: Route) => void; }

type Tab = "hull" | "turret" | "barrel" | "cosmetics" | "paint";

const TABS: { id: Tab; label: string }[] = [
  { id: "hull", label: "Hull" },
  { id: "turret", label: "Turret" },
  { id: "barrel", label: "Barrel" },
  { id: "cosmetics", label: "Cosmetics" },
  { id: "paint", label: "Paint" },
];

function hex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function CustomizePage({ navigate }: Props): JSX.Element {
  const [l, setL] = useState<Loadout>(() => loadLoadout());
  const [tab, setTab] = useState<Tab>("hull");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveLoadout(l), [l]);

  useEffect(() => {
    const c = canvasRef.current;
    const host = previewRef.current;
    if (!c || !host) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const logicalW = Math.max(220, c.clientWidth || host.clientWidth - 28);
      const logicalH = Math.round(logicalW * 0.62);
      if (c.width !== logicalW * dpr) c.width = logicalW * dpr;
      if (c.height !== logicalH * dpr) c.height = logicalH * dpr;
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
  const pickTab = (t: Tab) => { click(); setTab(t); };

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
            <div className="customize-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`customize-tab ${tab === t.id ? "active" : ""}`}
                  onClick={() => pickTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "hull" && (
              <PartRow
                options={ALL_BODIES.map((id) => ({
                  id,
                  label: BODY_DESCRIPTORS[id].label,
                  blurb: BODY_DESCRIPTORS[id].blurb,
                }))}
                value={l.body}
                onPick={(v) => set({ body: v as BodyStyle })}
                thumbProps={(id) => ({ ...l, body: id as BodyStyle })}
              />
            )}

            {tab === "turret" && (
              <PartRow
                options={ALL_TURRETS.map((id) => ({
                  id,
                  label: TURRET_DESCRIPTORS[id].label,
                  blurb: TURRET_DESCRIPTORS[id].blurb,
                }))}
                value={l.turret}
                onPick={(v) => set({ turret: v as TurretStyle })}
                thumbProps={(id) => ({ ...l, turret: id as TurretStyle })}
              />
            )}

            {tab === "barrel" && (
              <PartRow
                options={ALL_BARRELS.map((id) => ({
                  id,
                  label: BARREL_DESCRIPTORS[id].label,
                  blurb: BARREL_DESCRIPTORS[id].blurb,
                }))}
                value={l.barrel}
                onPick={(v) => set({ barrel: v as BarrelStyle })}
                thumbProps={(id) => ({ ...l, barrel: id as BarrelStyle })}
              />
            )}

            {tab === "cosmetics" && (
              <>
                <SubSection title="Pattern">
                  <PartRow
                    options={ALL_PATTERNS.map((id) => ({
                      id,
                      label: PATTERN_DESCRIPTORS[id].label,
                      blurb: PATTERN_DESCRIPTORS[id].blurb,
                    }))}
                    value={l.pattern}
                    onPick={(v) => set({ pattern: v as PatternStyle })}
                    thumbProps={(id) => ({ ...l, pattern: id as PatternStyle })}
                  />
                </SubSection>
                <SubSection title="Decal">
                  <PartRow
                    options={ALL_DECALS.map((id) => ({
                      id,
                      label: DECAL_DESCRIPTORS[id].label,
                      blurb: DECAL_DESCRIPTORS[id].blurb,
                    }))}
                    value={l.decal}
                    onPick={(v) => set({ decal: v as DecalStyle })}
                    thumbProps={(id) => ({ ...l, decal: id as DecalStyle })}
                  />
                </SubSection>
              </>
            )}

            {tab === "paint" && (
              <>
                <PaintRow
                  title="Primary"
                  swatches={PALETTE_PRIMARY}
                  value={l.primaryColor}
                  onChange={(v) => set({ primaryColor: v })}
                />
                <PaintRow
                  title="Accent stripe"
                  swatches={PALETTE_ACCENT}
                  value={l.accentColor}
                  onChange={(v) => set({ accentColor: v })}
                />
                <PaintRow
                  title="Pattern"
                  swatches={PALETTE_PRIMARY}
                  value={l.patternColor}
                  onChange={(v) => set({ patternColor: v })}
                />
              </>
            )}

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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="customize-section">
      <div className="customize-label">{title}</div>
      {children}
    </div>
  );
}

function PartRow({
  options, value, onPick, thumbProps,
}: {
  options: { id: string; label: string; blurb: string }[];
  value: string;
  onPick: (v: string) => void;
  thumbProps: (id: string) => Loadout;
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
          <PartThumb loadout={thumbProps(opt.id)} />
          <div className="part-name">{opt.label}</div>
        </div>
      ))}
    </div>
  );
}

function PartThumb({ loadout: lo }: { loadout: Loadout }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 140;
    const H = 84;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== W * dpr) c.width = W * dpr;
    if (c.height !== H * dpr) c.height = H * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderLoadoutCanvas(ctx, {
      width: W,
      height: H,
      bodyStyle: lo.body,
      turretStyle: lo.turret,
      barrelStyle: lo.barrel,
      primary: hex(lo.primaryColor),
      accent: hex(lo.accentColor),
      pattern: lo.pattern,
      patternColor: hex(lo.patternColor),
      decal: lo.decal,
      showDeck: false,
      marginTop: 16,
      marginBottom: 6,
    });
  }, [
    lo.body, lo.turret, lo.barrel, lo.pattern, lo.decal,
    lo.primaryColor, lo.accentColor, lo.patternColor,
  ]);
  return <canvas ref={ref} className="part-tile-thumb" />;
}

function PaintRow({
  title, swatches, value, onChange,
}: {
  title: string;
  swatches: number[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="paint-row">
      <div className="customize-label">{title}</div>
      <div className="paint-row-controls">
        <Swatches options={swatches} value={value} onPick={onChange} />
        <HexPicker value={value} onChange={onChange} />
      </div>
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
          style={{ background: hex(c) }}
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
  const h = hex(value);
  const [text, setText] = useState(h);
  useEffect(() => setText(h), [h]);
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
          value={h}
          onChange={(e) => onChange(parseInt(e.target.value.replace(/^#/, ""), 16))}
        />
        <span className="hex-picker-chip" style={{ background: h }} />
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

  const deck = ctx.createLinearGradient(0, h - 70, 0, h);
  deck.addColorStop(0, "rgba(20, 16, 12, 0.0)");
  deck.addColorStop(1, `rgba(${accentRgb}, 0.4)`);
  ctx.fillStyle = deck;
  ctx.fillRect(0, h - 70, w, 70);

  const primary = hex(l.primaryColor);
  const accent = hex(l.accentColor);

  const marginTop = 34;
  const marginBottom = 30;
  const availH = h - marginTop - marginBottom;

  const hullFrac = l.body === "light" ? 0.30 : l.body === "assault" ? 0.26 : 0.34;
  const treadFrac = 0.13;
  const heavyVFactor = 0.34 + treadFrac + 0.34 * 0.45;
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
    patternColor: hex(l.patternColor),
    decal: l.decal,
  });

  ctx.fillStyle = `rgba(${accentRgb}, 0.85)`;
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  ctx.fillText("PREVIEW", 12, 20);
}
