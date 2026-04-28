import { useEffect, useMemo, useRef, useState } from "react";
import {
  DECAL_DESCRIPTORS,
  isFreeDecal,
  type DecalStyle,
  type Loadout,
  type LoadoutSelection,
} from "@artillery/shared";
import { useAuth } from "../auth/AuthProvider";
import type { TankListing } from "../auth/authClient";
import { useShop } from "../shop/ShopProvider";
import { drawTankPreview, renderLoadoutCanvas } from "../game/tankPreview";
import type { Route } from "../router";
import { click } from "../ui/sfx";

interface Props { navigate: (r: Route) => void; }

type Tab = "tanks" | "decal" | "shop";

const TABS: { id: Tab; label: string; section: string; title: string; sub: string }[] = [
  { id: "tanks", label: "Tanks", section: "01", title: "Motor Pool",     sub: "Issue a vehicle" },
  { id: "decal", label: "Decal", section: "02", title: "Insignia Stock", sub: "Unit markings" },
  { id: "shop",  label: "Shop",  section: "03", title: "Quartermaster",  sub: "Theme tanks" },
];

function hex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function CustomizePage(_: Props): JSX.Element {
  const { selection, loadout, ownedTanks, ownedDecals, tanks, setSelection, refreshShop } =
    useShop();

  const initialTab: Tab = (() => {
    if (typeof window === "undefined") return "tanks";
    const qs = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (qs.get("purchase") === "success" || qs.get("tab") === "shop") return "shop";
    return "tanks";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [highlightSku, setHighlightSku] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);

  // After the Xsolla redirect lands on /#/customize?purchase=success,
  // refresh ownedTanks so the new entitlement is reflected immediately.
  useEffect(() => {
    if (initialTab === "shop") void refreshShop();
  }, [initialTab, refreshShop]);

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
      drawHangarTank(c, loadout, logicalW, logicalH);
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(host);
    return () => ro.disconnect();
  }, [loadout]);

  const setSel = (patch: Partial<LoadoutSelection>) => {
    click();
    setSelection({ ...selection, ...patch });
  };
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
        </div>

        <div className="hangar-floor" ref={floorRef}>
          <div className="hangar-floor-stripes" aria-hidden />
          <span className="hangar-lift" aria-hidden />
          <canvas ref={canvasRef} className="hangar-tank" />
        </div>
      </section>

      <section className="parts-binder clipboard" aria-label="Customisation">
        <div className="clipboard-clip" aria-hidden>
          <span className="clipboard-clip-screw clipboard-clip-screw-l" />
          <span className="clipboard-clip-screw clipboard-clip-screw-r" />
        </div>

        <div className="thumb-tabs" role="tablist" aria-label="Section">
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
          <div className="binder-page-stamp">{serial(selection)}</div>
          <header className="binder-page-header">
            <div className="binder-page-num">SECTION {meta.section}</div>
            <h3 className="binder-page-title">{meta.title}</h3>
            <div className="binder-page-sub">{meta.sub}</div>
          </header>

          <div className="binder-page-body">
            {tab === "tanks" && (
              <TankGrid
                tanks={tanks}
                selectedSku={selection.tankSku}
                ownedTanks={ownedTanks}
                onPick={(sku) => {
                  if (!ownedTanks.has(sku) && tanks.find((t) => t.sku === sku)?.priceCents) {
                    click();
                    setHighlightSku(sku);
                    setTab("shop");
                    return;
                  }
                  setSel({ tankSku: sku });
                }}
                currentDecal={selection.decal}
              />
            )}

            {tab === "decal" && (
              <DecalGrid
                ownedDecals={ownedDecals}
                tanks={tanks}
                value={selection.decal}
                onPick={(d) => {
                  if (ownedDecals.has(d)) {
                    setSel({ decal: d });
                    return;
                  }
                  // Locked decal → jump to shop and highlight a tank that grants it.
                  const granting = tanks.find((t) => t.bonusDecals.includes(d) && !t.owned);
                  click();
                  if (granting) setHighlightSku(granting.sku);
                  setTab("shop");
                }}
                tankPaint={loadout}
                equippedTankParts={loadout}
              />
            )}

            {tab === "shop" && (
              <ShopGrid tanks={tanks} highlightSku={highlightSku} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const PHOTO_PAGE_SIZE = 4;

function TankGrid({
  tanks, selectedSku, ownedTanks, onPick, currentDecal,
}: {
  tanks: TankListing[];
  selectedSku: string;
  ownedTanks: ReadonlySet<string>;
  onPick: (sku: string) => void;
  currentDecal: DecalStyle;
}) {
  // Owned tanks first (free starters + paid the player owns), then locked.
  const ordered = useMemo(() => {
    return [...tanks].sort((a, b) => {
      const ao = a.owned || ownedTanks.has(a.sku) ? 0 : 1;
      const bo = b.owned || ownedTanks.has(b.sku) ? 0 : 1;
      return ao - bo;
    });
  }, [tanks, ownedTanks]);

  const total = Math.max(1, Math.ceil(ordered.length / PHOTO_PAGE_SIZE));
  const [page, setPage] = useState(() => {
    const i = ordered.findIndex((t) => t.sku === selectedSku);
    return i < 0 ? 0 : Math.floor(i / PHOTO_PAGE_SIZE);
  });
  const safePage = Math.min(page, total - 1);
  const start = safePage * PHOTO_PAGE_SIZE;
  const visible = ordered.slice(start, start + PHOTO_PAGE_SIZE);

  return (
    <div className="catalog-page">
      <div className="photo-grid">
        {visible.map((t, i) => {
          const owned = t.owned;
          const locked = !owned;
          const title = locked
            ? `${t.blurb} — locked. Unlock for $${(t.priceCents / 100).toFixed(2)}.`
            : t.blurb;
          return (
            <button
              key={t.sku}
              type="button"
              className={`photo-card ${selectedSku === t.sku ? "active" : ""} ${locked ? "locked" : ""}`}
              onClick={() => onPick(t.sku)}
              title={title}
              style={{ "--tilt": `${(((start + i) * 17) % 5) - 2}deg` } as React.CSSProperties}
            >
              <span className="photo-tape" aria-hidden />
              <PhotoCanvas loadout={tankToLoadout(t, currentDecal)} />
              <div className="photo-caption">{t.label}</div>
              {locked && (
                <span className="photo-lock" aria-hidden>
                  <span className="photo-lock-glyph">🔒</span>
                  <span className="photo-lock-price">${(t.priceCents / 100).toFixed(2)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {total > 1 && <Pager page={safePage} total={total} onChange={setPage} />}
    </div>
  );
}

function DecalGrid({
  ownedDecals, tanks, value, onPick, tankPaint, equippedTankParts,
}: {
  ownedDecals: ReadonlySet<DecalStyle>;
  tanks: TankListing[];
  value: DecalStyle;
  onPick: (d: DecalStyle) => void;
  tankPaint: { primaryColor: number; accentColor: number; patternColor: number };
  equippedTankParts: { body: string; turret: string; barrel: string; pattern: string };
}) {
  const allDecals = Object.values(DECAL_DESCRIPTORS).map((d) => ({
    id: d.id,
    label: d.label,
    blurb: d.blurb,
  }));

  // Sort: free + owned first, then locked.
  const ordered = useMemo(() => {
    return [...allDecals].sort((a, b) => {
      const ao = ownedDecals.has(a.id as DecalStyle) ? 0 : 1;
      const bo = ownedDecals.has(b.id as DecalStyle) ? 0 : 1;
      return ao - bo;
    });
  }, [allDecals, ownedDecals]);

  const total = Math.max(1, Math.ceil(ordered.length / PHOTO_PAGE_SIZE));
  const [page, setPage] = useState(() => {
    const i = ordered.findIndex((o) => o.id === value);
    return i < 0 ? 0 : Math.floor(i / PHOTO_PAGE_SIZE);
  });
  const safePage = Math.min(page, total - 1);
  const start = safePage * PHOTO_PAGE_SIZE;
  const visible = ordered.slice(start, start + PHOTO_PAGE_SIZE);

  return (
    <div className="catalog-page">
      <div className="photo-grid">
        {visible.map((opt, i) => {
          const owned = ownedDecals.has(opt.id as DecalStyle);
          const locked = !owned;
          const grantedBy = locked
            ? tanks.find((t) => t.bonusDecals.includes(opt.id))
            : null;
          const title = locked && grantedBy
            ? `${opt.blurb} — unlock with ${grantedBy.label} ($${(grantedBy.priceCents / 100).toFixed(2)}).`
            : isFreeDecal(opt.id) ? `${opt.blurb} (free)` : `${opt.blurb} — included with ${grantingTankLabel(opt.id, tanks) ?? "a tank"}.`;
          const previewLoadout: Loadout = {
            body: equippedTankParts.body as Loadout["body"],
            turret: equippedTankParts.turret as Loadout["turret"],
            barrel: equippedTankParts.barrel as Loadout["barrel"],
            pattern: equippedTankParts.pattern as Loadout["pattern"],
            decal: opt.id as DecalStyle,
            primaryColor: tankPaint.primaryColor,
            accentColor: tankPaint.accentColor,
            patternColor: tankPaint.patternColor,
          };
          return (
            <button
              key={opt.id}
              type="button"
              className={`photo-card ${value === opt.id ? "active" : ""} ${locked ? "locked" : ""}`}
              onClick={() => onPick(opt.id as DecalStyle)}
              title={title}
              style={{ "--tilt": `${(((start + i) * 17) % 5) - 2}deg` } as React.CSSProperties}
            >
              <span className="photo-tape" aria-hidden />
              <PhotoCanvas loadout={previewLoadout} />
              <div className="photo-caption">{opt.label}</div>
              {locked && grantedBy && (
                <span className="photo-lock" aria-hidden>
                  <span className="photo-lock-glyph">🔒</span>
                  <span className="photo-lock-price">${(grantedBy.priceCents / 100).toFixed(2)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {total > 1 && <Pager page={safePage} total={total} onChange={setPage} />}
    </div>
  );
}

function grantingTankLabel(decal: string, tanks: TankListing[]): string | null {
  return tanks.find((t) => t.bonusDecals.includes(decal))?.label ?? null;
}

function tankToLoadout(t: TankListing, decal: DecalStyle): Loadout {
  return {
    body: t.body as Loadout["body"],
    turret: t.turret as Loadout["turret"],
    barrel: t.barrel as Loadout["barrel"],
    pattern: t.pattern as Loadout["pattern"],
    decal,
    primaryColor: t.paint.primary,
    accentColor: t.paint.accent,
    patternColor: t.paint.pattern,
  };
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

const SHOP_PAGE_SIZE = 2;

function ShopGrid({
  tanks, highlightSku,
}: {
  tanks: TankListing[];
  highlightSku: string | null;
}): JSX.Element {
  const { session } = useAuth();
  const { buyTank, shopEnabled } = useShop();
  const [busySku, setBusySku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shop only lists paid tanks (free starters live in the Tanks tab).
  const paid = useMemo(() => tanks.filter((t) => t.priceCents > 0), [tanks]);

  const total = Math.max(1, Math.ceil(paid.length / SHOP_PAGE_SIZE));
  const [page, setPage] = useState(() => {
    if (!highlightSku) return 0;
    const i = paid.findIndex((t) => t.sku === highlightSku);
    return i < 0 ? 0 : Math.floor(i / SHOP_PAGE_SIZE);
  });
  const safePage = Math.min(page, total - 1);
  const start = safePage * SHOP_PAGE_SIZE;
  const visible = paid.slice(start, start + SHOP_PAGE_SIZE);

  const onBuy = async (sku: string) => {
    click();
    setError(null);
    if (!session) {
      setError("Create an account or log in to purchase.");
      return;
    }
    setBusySku(sku);
    try {
      const url = await buyTank(sku);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusySku(null);
    }
  };

  return (
    <div className="catalog-page shop-grid">
      {!shopEnabled && (
        <div className="shop-banner">
          Shop is preview-only — purchases open soon. You can browse the
          tanks now and buy once we&apos;re live.
        </div>
      )}
      {shopEnabled && !session && (
        <div className="shop-banner">
          Log in or create an account to purchase tanks.
        </div>
      )}
      {error && <div className="shop-banner shop-banner-error">{error}</div>}
      <div className="bundle-list">
        {visible.map((t) => (
          <TankCard
            key={t.sku}
            tank={t}
            highlight={t.sku === highlightSku}
            busy={busySku === t.sku}
            disabled={!session || t.owned || !shopEnabled}
            comingSoon={!shopEnabled}
            onBuy={() => onBuy(t.sku)}
          />
        ))}
      </div>
      {total > 1 && <Pager page={safePage} total={total} onChange={setPage} />}
    </div>
  );
}

function TankCard({
  tank, highlight, busy, disabled, comingSoon, onBuy,
}: {
  tank: TankListing;
  highlight: boolean;
  busy: boolean;
  disabled: boolean;
  comingSoon: boolean;
  onBuy: () => void;
}) {
  const previewLoadout: Loadout = tankToLoadout(
    tank,
    (tank.bonusDecals[0] as DecalStyle) ?? "none",
  );
  return (
    <div className={`bundle-card ${highlight ? "highlight" : ""} ${tank.owned ? "owned" : ""}`}>
      <div className="bundle-preview">
        <PhotoCanvas loadout={previewLoadout} />
      </div>
      <div className="bundle-body">
        <div className="bundle-head">
          <h4 className="bundle-label">{tank.label}</h4>
          <div className="bundle-price">
            {tank.owned ? "Owned" : `$${(tank.priceCents / 100).toFixed(2)}`}
          </div>
        </div>
        <p className="bundle-blurb">{tank.blurb}</p>
        {tank.bonusDecals.length > 0 && (
          <ul className="bundle-parts">
            <li>
              Bonus: {tank.bonusDecals.join(", ")}{" "}
              {tank.bonusDecals.length === 1 ? "decal" : "decals"}
            </li>
          </ul>
        )}
        <button
          type="button"
          className="bundle-buy"
          disabled={disabled || busy}
          onClick={onBuy}
        >
          {tank.owned
            ? "Owned"
            : comingSoon
              ? "Coming soon"
              : busy
                ? "Opening checkout…"
                : `Buy — $${(tank.priceCents / 100).toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}

function serial(s: LoadoutSelection): string {
  const h = [
    s.tankSku.charCodeAt(0) ^ s.tankSku.charCodeAt(s.tankSku.length - 1),
    s.decal.charCodeAt(0),
    s.tankSku.length,
    s.decal.length,
  ].map((n) => (n & 0xff).toString(16).padStart(2, "0").toUpperCase()).join("");
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
