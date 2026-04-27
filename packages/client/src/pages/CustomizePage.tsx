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
import { click } from "../ui/sfx";

interface Props { navigate: (r: Route) => void; }

type Tab = "hull" | "turret" | "barrel" | "pattern" | "decal" | "paint";

const TABS: { id: Tab; label: string; section: string; title: string; sub: string }[] = [
  { id: "hull",    label: "Hull",    section: "01", title: "Hull Catalog",   sub: "Chassis & superstructure" },
  { id: "turret",  label: "Turret",  section: "02", title: "Turret Catalog", sub: "Mantlet assemblies" },
  { id: "barrel",  label: "Barrel",  section: "03", title: "Barrel Catalog", sub: "Main armament" },
  { id: "pattern", label: "Pattern", section: "04", title: "Pattern Stock",  sub: "Field markings" },
  { id: "decal",   label: "Decal",   section: "05", title: "Decal Stock",    sub: "Unit insignia" },
  { id: "paint",   label: "Paint",   section: "06", title: "Paint Chips",    sub: "Field, accent, pattern" },
];

function hex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function CustomizePage(_: Props): JSX.Element {
  const [l, setL] = useState<Loadout>(() => loadLoadout());
  const [tab, setTab] = useState<Tab>("hull");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveLoadout(l), [l]);

  useEffect(() => {
    const c = canvasRef.current;
    const host = floorRef.current;
    if (!c || !host) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const logicalW = Math.max(280, host.clientWidth);
      const logicalH = Math.max(240, host.clientHeight);
      if (c.width !== logicalW * dpr) c.width = logicalW * dpr;
      if (c.height !== logicalH * dpr) c.height = logicalH * dpr;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHangarTank(c, l, logicalW, logicalH);
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(host);
    return () => ro.disconnect();
  }, [l]);

  const set = (patch: Partial<Loadout>) => { click(); setL({ ...l, ...patch }); };
  const pickTab = (t: Tab) => { click(); setTab(t); };

  const meta = TABS.find((t) => t.id === tab)!;

  return (
    <div className="hangar-bay scene-hangar">
      <div className="hangar-overhead" aria-hidden>
        <span className="hangar-droplight hangar-droplight-l" />
        <span className="hangar-droplight hangar-droplight-r" />
      </div>

      <section className="hangar-stage" aria-label="Tank preview">
        <div className="hangar-wall" aria-hidden>
          <div className="hangar-stencil hangar-stencil-big">BAY 7</div>
          <div className="hangar-stencil hangar-stencil-line">
            EYE &amp; EAR PROTECTION · NO SMOKING · ENGINE OFF
          </div>
          <svg
            className="hangar-tools"
            viewBox="0 0 220 56"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="metal" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#cfd2d8" />
                <stop offset="100%" stopColor="#5a606e" />
              </linearGradient>
            </defs>
            <g fill="url(#metal)" stroke="#000" strokeWidth="0.6">
              <rect x="6" y="14" width="3" height="36" />
              <circle cx="7.5" cy="12" r="3.5" fill="none" strokeWidth="2" />
              <rect x="40" y="14" width="3" height="32" />
              <polygon points="38,46 46,46 42,52" />
              <rect x="74" y="12" width="2.5" height="38" />
              <rect x="70" y="10" width="10" height="6" rx="1" />
              <rect x="108" y="14" width="14" height="3" rx="1" />
              <rect x="112" y="14" width="3" height="34" />
              <rect x="142" y="14" width="3" height="34" />
              <rect x="138" y="48" width="11" height="4" rx="1" />
              <rect x="176" y="14" width="3" height="34" />
              <circle cx="177.5" cy="12" r="3" fill="none" strokeWidth="1.5" />
              <rect x="174" y="48" width="7" height="4" />
            </g>
          </svg>
        </div>

        <div className="hangar-floor" ref={floorRef}>
          <div className="hangar-floor-stripes" aria-hidden />
          <span className="hangar-lift" aria-hidden />
          <canvas ref={canvasRef} className="hangar-tank" />
        </div>
      </section>

      <section className="parts-binder clipboard" aria-label="Parts catalog">
        <div className="clipboard-clip" aria-hidden>
          <span className="clipboard-clip-screw clipboard-clip-screw-l" />
          <span className="clipboard-clip-screw clipboard-clip-screw-r" />
        </div>

        <div className="thumb-tabs" role="tablist" aria-label="Part section">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`thumb-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => pickTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="binder-page">
          <span className="paper-paperclip" aria-hidden />
          <div className="binder-page-stamp">{serial(l)}</div>
          <header className="binder-page-header">
            <div className="binder-page-num">SECTION {meta.section}</div>
            <h3 className="binder-page-title">{meta.title}</h3>
            <div className="binder-page-sub">{meta.sub}</div>
          </header>

          <div className="binder-page-body">
            {tab === "hull" && (
              <PhotoGrid
                options={ALL_BODIES.map((id) => ({
                  id,
                  label: BODY_DESCRIPTORS[id].label,
                  blurb: BODY_DESCRIPTORS[id].blurb,
                }))}
                value={l.body}
                onPick={(v) => set({ body: v as BodyStyle })}
                loadoutFor={(id) => ({ ...l, body: id as BodyStyle })}
              />
            )}

            {tab === "turret" && (
              <PhotoGrid
                options={ALL_TURRETS.map((id) => ({
                  id,
                  label: TURRET_DESCRIPTORS[id].label,
                  blurb: TURRET_DESCRIPTORS[id].blurb,
                }))}
                value={l.turret}
                onPick={(v) => set({ turret: v as TurretStyle })}
                loadoutFor={(id) => ({ ...l, turret: id as TurretStyle })}
              />
            )}

            {tab === "barrel" && (
              <PhotoGrid
                options={ALL_BARRELS.map((id) => ({
                  id,
                  label: BARREL_DESCRIPTORS[id].label,
                  blurb: BARREL_DESCRIPTORS[id].blurb,
                }))}
                value={l.barrel}
                onPick={(v) => set({ barrel: v as BarrelStyle })}
                loadoutFor={(id) => ({ ...l, barrel: id as BarrelStyle })}
              />
            )}

            {tab === "pattern" && (
              <PhotoGrid
                options={ALL_PATTERNS.map((id) => ({
                  id,
                  label: PATTERN_DESCRIPTORS[id].label,
                  blurb: PATTERN_DESCRIPTORS[id].blurb,
                }))}
                value={l.pattern}
                onPick={(v) => set({ pattern: v as PatternStyle })}
                loadoutFor={(id) => ({ ...l, pattern: id as PatternStyle })}
              />
            )}

            {tab === "decal" && (
              <PhotoGrid
                options={ALL_DECALS.map((id) => ({
                  id,
                  label: DECAL_DESCRIPTORS[id].label,
                  blurb: DECAL_DESCRIPTORS[id].blurb,
                }))}
                value={l.decal}
                onPick={(v) => set({ decal: v as DecalStyle })}
                loadoutFor={(id) => ({ ...l, decal: id as DecalStyle })}
              />
            )}

            {tab === "paint" && (
              <>
                <PaintChipRow
                  title="Field"
                  swatches={PALETTE_PRIMARY}
                  value={l.primaryColor}
                  onChange={(v) => set({ primaryColor: v })}
                />
                <PaintChipRow
                  title="Accent"
                  swatches={PALETTE_ACCENT}
                  value={l.accentColor}
                  onChange={(v) => set({ accentColor: v })}
                />
                <PaintChipRow
                  title="Pattern"
                  swatches={PALETTE_PRIMARY}
                  value={l.patternColor}
                  onChange={(v) => set({ patternColor: v })}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}


const PHOTO_PAGE_SIZE = 4;

function PhotoGrid({
  options, value, onPick, loadoutFor,
}: {
  options: { id: string; label: string; blurb: string }[];
  value: string;
  onPick: (v: string) => void;
  loadoutFor: (id: string) => Loadout;
}) {
  const total = Math.max(1, Math.ceil(options.length / PHOTO_PAGE_SIZE));
  const [page, setPage] = useState(() => {
    const i = options.findIndex((o) => o.id === value);
    return i < 0 ? 0 : Math.floor(i / PHOTO_PAGE_SIZE);
  });
  const safePage = Math.min(page, total - 1);
  const start = safePage * PHOTO_PAGE_SIZE;
  const visible = options.slice(start, start + PHOTO_PAGE_SIZE);

  return (
    <div className="catalog-page">
      <div className="photo-grid">
        {visible.map((opt, i) => (
          <button
            key={opt.id}
            type="button"
            className={`photo-card ${value === opt.id ? "active" : ""}`}
            onClick={() => onPick(opt.id)}
            title={opt.blurb}
            style={{ "--tilt": `${(((start + i) * 17) % 5) - 2}deg` } as React.CSSProperties}
          >
            <span className="photo-tape" aria-hidden />
            <PhotoCanvas loadout={loadoutFor(opt.id)} />
            <div className="photo-caption">{opt.label}</div>
          </button>
        ))}
      </div>
      {total > 1 && <Pager page={safePage} total={total} onChange={setPage} />}
    </div>
  );
}

function Pager({
  page, total, onChange,
}: { page: number; total: number; onChange: (p: number) => void }) {
  const go = (p: number) => { click(); onChange(Math.max(0, Math.min(total - 1, p))); };
  return (
    <div className="binder-pager">
      <button
        type="button"
        className="pager-btn"
        disabled={page === 0}
        onClick={() => go(page - 1)}
        aria-label="Previous page"
      >‹ Prev</button>
      <span className="pager-status">Page {page + 1} / {total}</span>
      <button
        type="button"
        className="pager-btn"
        disabled={page === total - 1}
        onClick={() => go(page + 1)}
        aria-label="Next page"
      >Next ›</button>
    </div>
  );
}

function PhotoCanvas({ loadout: lo }: { loadout: Loadout }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 168;
    const H = 100;
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
      marginTop: 18,
      marginBottom: 8,
    });
  }, [
    lo.body, lo.turret, lo.barrel, lo.pattern, lo.decal,
    lo.primaryColor, lo.accentColor, lo.patternColor,
  ]);
  return <canvas ref={ref} className="photo-img" />;
}

const CHIP_PAGE_SIZE = 6;

function PaintChipRow({
  title, swatches, value, onChange,
}: {
  title: string;
  swatches: number[];
  value: number;
  onChange: (v: number) => void;
}) {
  const total = Math.max(1, Math.ceil(swatches.length / CHIP_PAGE_SIZE));
  const [page, setPage] = useState(() => {
    const i = swatches.indexOf(value);
    return i < 0 ? 0 : Math.floor(i / CHIP_PAGE_SIZE);
  });
  const safePage = Math.min(page, total - 1);
  const start = safePage * CHIP_PAGE_SIZE;
  const visible = swatches.slice(start, start + CHIP_PAGE_SIZE);

  return (
    <div className="paint-chip-row">
      <div className="paint-chip-row-head">
        <div className="paint-chip-row-title">{title}</div>
        <HexPicker value={value} onChange={onChange} />
      </div>
      <div className="paint-chip-strip">
        {visible.map((c) => (
          <button
            key={c}
            type="button"
            className={`paint-chip ${value === c ? "active" : ""}`}
            onClick={() => onChange(c)}
            aria-label={`Color ${c.toString(16)}`}
          >
            <span className="paint-chip-color" style={{ background: hex(c) }} />
            <span className="paint-chip-hex">{hex(c).toUpperCase()}</span>
          </button>
        ))}
      </div>
      {total > 1 && <Pager page={safePage} total={total} onChange={setPage} />}
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

function drawHangarTank(
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

  // Tank sits left of center so the floating clipboard doesn't occlude it.
  const cx = w * 0.4;
  const groundY = Math.round(h * 0.62);

  const pool = ctx.createRadialGradient(cx, groundY + 14, 10, cx, groundY + 14, w * 0.45);
  pool.addColorStop(0, `rgba(${accentRgb}, 0.18)`);
  pool.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);

  const primary = hex(l.primaryColor);
  const accent = hex(l.accentColor);

  const marginTop = 40;
  const marginBottom = h - groundY;
  const availH = h - marginTop - marginBottom;

  const hullFrac = l.body === "light" ? 0.30 : l.body === "assault" ? 0.26 : 0.34;
  const treadFrac = 0.13;
  const heavyVFactor = 0.34 + treadFrac + 0.34 * 0.45;
  const baseHeavyTankW = Math.min(availH / heavyVFactor, w * 0.55, 360);
  const bodyFactor =
    l.body === "light" ? 40 / 48 :
    l.body === "assault" ? 50 / 48 :
    1.0;
  const tankW = baseHeavyTankW * bodyFactor;

  const hullH = tankW * hullFrac;
  const treadH = Math.max(8, tankW * treadFrac);
  const totalH = hullH + treadH;
  const x0 = cx - tankW / 2;
  const y0 = h - marginBottom - totalH;

  const shadow = ctx.createRadialGradient(
    cx, y0 + totalH + 6, 6,
    cx, y0 + totalH + 6, tankW * 0.55,
  );
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, w, h);

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
}
