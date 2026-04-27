import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOADOUT_SPEC,
  DEFAULT_LOADOUT,
  WEAPONS,
  type WeaponId,
} from "@artillery/shared";
import type { Route } from "../router";
import { WeaponIcon } from "../ui/WeaponIcon";
import { drawTankPreview } from "../game/tankPreview";
import { click as sfxClick } from "../ui/sfx";

interface Props { navigate: (r: Route) => void; }

const CHANNELS: WeaponId[] = DEFAULT_LOADOUT;

/**
 * Arsenal — a CRT TV in the quartermaster's briefing room. Each weapon
 * is a channel; the TV plays a continuously-looping firing-arc preview
 * (same simulation as battle: gravity, bounces, splits, blast). A
 * printed TV Guide on the right lists every channel with mini-stats so
 * you can scan and jump. Channel changes briefly cut to static.
 */
export function ArsenalPage(_props: Props): JSX.Element {
  const [idx, setIdx] = useState(0);
  const [staticOn, setStaticOn] = useState(false);
  const [tvOn, setTvOn] = useState(true);
  const [irOn, setIrOn] = useState(false);
  const irTimer = useRef<number | null>(null);
  const weapon = CHANNELS[idx]!;
  const def = WEAPONS[weapon];
  const color = `#${def.tint.toString(16).padStart(6, "0")}`;
  const channelStr = String(idx + 1).padStart(2, "0");

  const pulseIr = () => {
    setIrOn(true);
    if (irTimer.current !== null) window.clearTimeout(irTimer.current);
    irTimer.current = window.setTimeout(() => setIrOn(false), 160);
  };

  const flickTo = (next: number) => {
    pulseIr();
    if (!tvOn) return;
    if (next === idx) return;
    sfxClick();
    setStaticOn(true);
    setIdx(((next % CHANNELS.length) + CHANNELS.length) % CHANNELS.length);
    setTimeout(() => setStaticOn(false), 240);
  };

  const channelUp = () => flickTo(idx + 1);
  const channelDown = () => flickTo(idx - 1);
  const togglePower = () => {
    pulseIr();
    sfxClick();
    setTvOn((p) => {
      const next = !p;
      if (next) {
        setStaticOn(true);
        setTimeout(() => setStaticOn(false), 280);
      } else {
        setStaticOn(false);
      }
      return next;
    });
  };
  const bumpVol = () => {
    pulseIr();
    sfxClick();
  };

  return (
    <div className="briefing-room">
      <div className="briefing-grid">
        <section className="av-cart" aria-label="Weapon broadcast">
          <div className="av-cart-tv">
          <div className="wall-tv-case">
            <div className="wall-tv-side wall-tv-side-l" aria-hidden />
            <div className="wall-tv-side wall-tv-side-r" aria-hidden />
            <div className="wall-tv-top" aria-hidden>
              <span className="wall-tv-vent" />
              <span className="wall-tv-vent" />
              <span className="wall-tv-vent" />
            </div>

            <div className="wall-tv-bezel">
              <div className="wall-tv-screen-mount">
              <div className={`crt-screen ${staticOn ? "tuning" : ""} ${tvOn ? "" : "off"}`}>
                {tvOn && (
                  <>
                    <div className="crt-channel-tag">CH {channelStr}</div>
                    <div className="crt-on-air" aria-hidden>● REC</div>
                    <WeaponPreview weapon={weapon} />
                    <div className="crt-hud">
                      <div className="crt-hud-name" style={{ color }}>{def.name}</div>
                      <div className="crt-hud-stats">
                        <span className="crt-hud-stat">
                          <span className="crt-hud-lbl">DMG</span>
                          <span className="crt-hud-val">{def.damage}</span>
                        </span>
                        <span className="crt-hud-stat">
                          <span className="crt-hud-lbl">RAD</span>
                          <span className="crt-hud-val">{def.radius}</span>
                        </span>
                        <span className="crt-hud-stat">
                          <span className="crt-hud-lbl">DIG</span>
                          <span className="crt-hud-val">{Math.round(def.digFactor * 100)}%</span>
                        </span>
                      </div>
                    </div>
                  </>
                )}
                <div className="crt-scanlines" aria-hidden />
                <div className="crt-vignette" aria-hidden />
                <div className="crt-static" aria-hidden />
                <div className="crt-glare" aria-hidden />
                {!tvOn && <div className="crt-off-dot" aria-hidden />}
              </div>
              </div>
              <div className="wall-tv-chin">
                <span className={`wall-tv-led ${tvOn ? "on" : ""}`} aria-hidden />
                <span className="wall-tv-brand">QUARTERMASTER · QM-2400</span>
                <span className="wall-tv-speaker" aria-hidden />
              </div>
            </div>
          </div>
          </div>

          <div className="av-cart-frame" aria-hidden>
            <div className="av-cart-rail av-cart-rail-l" />
            <div className="av-cart-rail av-cart-rail-r" />
            <div className="av-cart-shelf av-cart-shelf-top" />
            <div className="av-cart-shelf av-cart-shelf-mid">
              <span className="av-cart-vcr">
                <span className="av-cart-vcr-slot" />
                <span className="av-cart-vcr-led" />
                <span className="av-cart-vcr-led on" />
              </span>
            </div>
            <div className="av-cart-shelf av-cart-shelf-bot" />
          </div>
          <div className="av-cart-wheels" aria-hidden>
            <span className="av-cart-wheel" />
            <span className="av-cart-wheel" />
          </div>
        </section>

        <aside className="tv-remote" aria-label="Remote control">
          <div className="remote-top">
            <div className="remote-brand">QM REMOTE</div>
            <button
              type="button"
              className="remote-btn remote-power"
              onClick={togglePower}
              aria-label={tvOn ? "Power off" : "Power on"}
              title={tvOn ? "Power off" : "Power on"}
            >
              <span className="remote-power-dot" />
            </button>
          </div>

          <div className="remote-rocker remote-rocker-ch">
            <button
              type="button"
              className="remote-btn remote-btn-up"
              onClick={channelUp}
              aria-label="Channel up"
              title="Channel up"
            >
              <span className="remote-arrow">▲</span>
              <span className="remote-key-lbl">CH</span>
            </button>
            <button
              type="button"
              className="remote-btn remote-btn-down"
              onClick={channelDown}
              aria-label="Channel down"
              title="Channel down"
            >
              <span className="remote-arrow">▼</span>
              <span className="remote-key-lbl">CH</span>
            </button>
          </div>

          <div className="remote-keypad">
            {CHANNELS.map((id, i) => {
              const w = WEAPONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="remote-key"
                  onClick={() => flickTo(i)}
                  title={`${w.name} — DMG ${w.damage} · R ${w.radius}`}
                >
                  <span className="remote-key-num">{i + 1}</span>
                  <span className="remote-key-name">{w.name}</span>
                </button>
              );
            })}
          </div>

          <div className="remote-rocker remote-rocker-vol">
            <button type="button" className="remote-btn" onClick={bumpVol} aria-label="Volume up" title="Volume">
              <span className="remote-arrow">+</span>
              <span className="remote-key-lbl">VOL</span>
            </button>
            <button type="button" className="remote-btn" onClick={bumpVol} aria-label="Volume down" title="Volume">
              <span className="remote-arrow">−</span>
              <span className="remote-key-lbl">VOL</span>
            </button>
          </div>

          <div className="remote-foot" aria-hidden>
            <span className={`remote-ir ${irOn ? "on" : ""}`} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────── Preview simulation ─────────────────────────

interface Proj {
  x: number; y: number;
  vx: number; vy: number;
  bouncesLeft: number;
  child: boolean;
  splitAfter?: number;
  age: number;
}

interface Particle {
  kind: "spark" | "debris" | "smoke" | "ring" | "flash" | "fire";
  x: number; y: number;
  vx: number; vy: number;
  gravity: number;
  size: number;
  sizeEnd?: number;
  color: string;
  ringColor?: string;
  lifespan: number;
  age: number;
  persist?: boolean;
  expireAt?: number;
}

interface Mound { x: number; peak: number; w: number; }

const G_PREVIEW = 360;
const PREVIEW_W = 600;
const PREVIEW_H = 320;

function WeaponPreview({ weapon }: { weapon: WeaponId }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = PREVIEW_W * dpr;
    c.height = PREVIEW_H * dpr;
    c.style.width = `${PREVIEW_W}px`;
    c.style.height = `${PREVIEW_H}px`;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const def = WEAPONS[weapon];
    const color = `#${def.tint.toString(16).padStart(6, "0")}`;
    const groundY = PREVIEW_H - 36;
    const tankX = 60;
    const tankY = groundY - 8;
    const muzzleX = tankX - 2;
    const muzzleY = tankY - 16;
    const targetX = PREVIEW_W - 80;

    const blastR = Math.max(12, Math.min(50, def.radius * 0.45));

    let projectiles: Proj[] = [];
    let particles: Particle[] = [];
    let mounds: Mound[] = [];
    let cycleMs = 0;
    let resetAt = 0;
    let barrelAngle = -Math.PI / 4;
    const CYCLE_LEN = 4400;

    function addSpark(x: number, y: number, speed: number, cTint: string) {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.5 + Math.random() * 0.8);
        particles.push({
          kind: "spark",
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 40,
          gravity: 280,
          size: 1.6 + Math.random() * 1.4,
          color: Math.random() < 0.5 ? "#ffe0a0" : cTint,
          lifespan: 0.5 + Math.random() * 0.35,
          age: 0,
        });
      }
    }

    function addSmoke(x: number, y: number, count = 8) {
      for (let i = 0; i < count; i++) {
        particles.push({
          kind: "smoke",
          x: x + (Math.random() - 0.5) * 8,
          y: y - 4,
          vx: (Math.random() - 0.5) * 40,
          vy: -50 - Math.random() * 50,
          gravity: -12,
          size: 6 + Math.random() * 4,
          sizeEnd: 18 + Math.random() * 8,
          color: "rgba(40,34,26,0.7)",
          lifespan: 1.1 + Math.random() * 0.4,
          age: 0,
        });
      }
    }

    function addDebris(x: number, y: number, count = 8) {
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
        const s = 140 + Math.random() * 160;
        particles.push({
          kind: "debris",
          x, y: groundY,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          gravity: 480,
          size: 2 + Math.random() * 1.5,
          color: Math.random() < 0.5 ? "#3a2515" : "#5a3b1f",
          lifespan: 0.9 + Math.random() * 0.6,
          age: 0,
        });
      }
    }

    function addFlash(x: number, y: number, r: number) {
      particles.push({
        kind: "flash",
        x, y,
        vx: 0, vy: 0, gravity: 0,
        size: r * 0.6,
        sizeEnd: r * 1.6,
        color: "#fff4c0",
        lifespan: 0.14,
        age: 0,
      });
    }

    function addRing(x: number, y: number, r: number, ringColor: string) {
      particles.push({
        kind: "ring",
        x, y,
        vx: 0, vy: 0, gravity: 0,
        size: r * 0.3,
        sizeEnd: r * 1.9,
        color: "#ffe6c4",
        ringColor,
        lifespan: 0.42,
        age: 0,
      });
    }

    function addFireball(x: number, y: number, r: number, tint: string) {
      particles.push({
        kind: "spark",
        x, y,
        vx: 0, vy: 0, gravity: 0,
        size: r * 0.3,
        sizeEnd: r * 1.3,
        color: tint,
        lifespan: 0.44,
        age: 0,
      });
    }

    function addNapalmTiles(cx: number) {
      if (!def.napalm) return;
      const tileCount = Math.min(def.napalm.tileCount, 7);
      const span = def.napalm.radius * 0.45;
      for (let i = 0; i < tileCount; i++) {
        const t = (i / Math.max(1, tileCount - 1)) - 0.5;
        particles.push({
          kind: "fire",
          x: cx + t * span,
          y: groundY,
          vx: 0, vy: 0, gravity: 0,
          size: 6 + Math.random() * 2,
          color: "#ff7a2a",
          lifespan: def.napalm.durationSec,
          age: 0,
          persist: true,
        });
      }
    }

    function detonate(p: Proj) {
      const r = blastR;
      addFlash(p.x, p.y, r);
      addFireball(p.x, p.y, r, color);
      addRing(p.x, p.y, r, color);
      addSpark(p.x, p.y, 200, color);
      addDebris(p.x, p.y);
      addSmoke(p.x, p.y, 8);

      if (def.addsTerrain) {
        mounds.push({ x: p.x, peak: 10, w: 22 });
      }
      if (def.napalm && !p.child) {
        addNapalmTiles(p.x);
      }
      if (def.cluster && !p.child) {
        for (let i = 0; i < def.cluster.count; i++) {
          const a = -Math.PI / 2 + (i - def.cluster.count / 2) * 0.22;
          const s = 150 + Math.random() * 60;
          projectiles.push({
            x: p.x, y: p.y - 2,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            bouncesLeft: 0,
            child: true,
            age: 0,
          });
        }
      }
      if (def.airstrike && !p.child) {
        for (let i = 0; i < def.airstrike.count; i++) {
          const xi = p.x - (def.airstrike.count - 1) * 8 + i * 16;
          projectiles.push({
            x: xi, y: -20,
            vx: 0, vy: 200 + Math.random() * 60,
            bouncesLeft: 0,
            child: true,
            age: 0,
          });
        }
      }
    }

    function fireInitial() {
      const flightSec =
        weapon === "heavy" || weapon === "airstrike" ? 1.45 :
        weapon === "mirv" ? 1.3 :
        weapon === "grenade" || weapon === "skipper" ? 1.15 :
        weapon === "dirt" ? 1.35 :
        weapon === "napalm" ? 1.3 :
        1.2;
      const dx = targetX - muzzleX;
      const effTarget = (def.bounces ?? 0) > 0
        ? muzzleX + dx * 0.55
        : targetX;
      const effDx = effTarget - muzzleX;
      const effDy = groundY - muzzleY;
      const vx = effDx / flightSec;
      const vy = (effDy - 0.5 * G_PREVIEW * flightSec * flightSec) / flightSec;
      barrelAngle = Math.atan2(vy, vx);
      projectiles.push({
        x: muzzleX,
        y: muzzleY,
        vx, vy,
        bouncesLeft: def.bounces ?? 0,
        child: false,
        age: 0,
        splitAfter: def.mirv?.splitAfterSec,
      });
      addFlash(muzzleX, muzzleY, 10);
      addSpark(muzzleX, muzzleY, 140, color);
    }

    function resetCycle() {
      projectiles = [];
      particles = [];
      mounds = [];
      fireInitial();
    }

    function step(dt: number) {
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.age += dt;

        if (p.splitAfter !== undefined && p.age >= p.splitAfter && def.mirv) {
          for (let j = 0; j < def.mirv.count; j++) {
            const t = (j - (def.mirv.count - 1) / 2) / def.mirv.count;
            const s = def.mirv.spread * 0.45;
            projectiles.push({
              x: p.x, y: p.y,
              vx: p.vx * 0.75 + t * s,
              vy: p.vy * 0.75 - 30,
              bouncesLeft: 0,
              child: true,
              age: 0,
            });
          }
          addSpark(p.x, p.y, 120, color);
          projectiles.splice(i, 1);
          continue;
        }

        p.vy += G_PREVIEW * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.x < -40 || p.x > PREVIEW_W + 40) {
          projectiles.splice(i, 1);
          continue;
        }

        const gy = groundAt(p.x, mounds, groundY);
        if (p.y >= gy) {
          if (p.bouncesLeft > 0) {
            p.bouncesLeft--;
            p.y = gy - 1;
            p.vy = -p.vy * 0.55;
            p.vx *= 0.78;
            addSpark(p.x, gy, 70, "#8a6a3d");
          } else {
            projectiles.splice(i, 1);
            detonate(p);
          }
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.age += dt;
        if (q.age >= q.lifespan) {
          particles.splice(i, 1);
          continue;
        }
        if (q.kind === "ring" || q.kind === "flash" || q.kind === "fire") {
          continue;
        }
        q.vy += q.gravity * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
    }

    function themeAccentRgb(): string {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue("--theme-accent-rgb").trim();
      return v || "224, 120, 69";
    }
    function drawScene() {
      ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
      const accentRgb = themeAccentRgb();

      const sky = ctx.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, "rgba(20, 28, 44, 0.0)");
      sky.addColorStop(1, "rgba(60, 40, 22, 0.48)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, PREVIEW_W, groundY);

      const ground = ctx.createLinearGradient(0, groundY, 0, PREVIEW_H);
      ground.addColorStop(0, `rgba(${accentRgb}, 0.22)`);
      ground.addColorStop(1, "rgba(0, 0, 0, 0.92)");
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      for (let x = 0; x <= PREVIEW_W; x += 4) {
        ctx.lineTo(x, groundAt(x, mounds, groundY));
      }
      ctx.lineTo(PREVIEW_W, groundY);
      ctx.lineTo(PREVIEW_W, PREVIEW_H);
      ctx.lineTo(0, PREVIEW_H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(${accentRgb}, 0.35)`;
      ctx.beginPath();
      ctx.moveTo(0, groundY - 0.5);
      for (let x = 0; x <= PREVIEW_W; x += 4) {
        ctx.lineTo(x, groundAt(x, mounds, groundY) - 0.5);
      }
      ctx.lineTo(PREVIEW_W, groundY - 0.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${accentRgb}, 0.3)`;
      ctx.stroke();

      drawMiniTank(ctx, tankX, tankY, barrelAngle);
      ctx.fillStyle = `rgba(${accentRgb}, 0.75)`;
      ctx.fillRect(targetX - 10, groundY - 1, 20, 2);
      ctx.fillRect(targetX - 1, groundY - 6, 2, 6);

      drawParticlesOfKind("fire");
      drawParticlesOfKind("smoke");
      drawFireballs();
      drawParticlesOfKind("debris");
      drawParticlesOfKind("spark");
      drawParticlesOfKind("ring");
      drawParticlesOfKind("flash");

      for (const p of projectiles) {
        const angle = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        drawProjectileShape(ctx, weapon, color, p.child);
        ctx.restore();
      }
    }

    function drawParticlesOfKind(kind: Particle["kind"]) {
      ctx.save();
      for (const q of particles) {
        if (q.kind !== kind) continue;
        const life = Math.min(1, q.age / q.lifespan);
        const fade = 1 - life;
        if (kind === "fire") {
          const flick = 0.7 + Math.sin((q.age + q.x * 0.4) * 12) * 0.25;
          ctx.globalAlpha = Math.min(1, fade * 1.4) * flick;
          const g = ctx.createRadialGradient(q.x, q.y - 2, 1, q.x, q.y - 2, q.size);
          g.addColorStop(0, "rgba(255,240,180,1)");
          g.addColorStop(0.45, "rgba(255,130,50,0.95)");
          g.addColorStop(1, "rgba(120,30,10,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(q.x, q.y - 2, q.size, q.size * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (kind === "smoke") {
          const sz = q.size + (q.sizeEnd ?? q.size) * life;
          ctx.globalAlpha = fade * 0.55;
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, sz);
          g.addColorStop(0, "rgba(50,44,34,0.8)");
          g.addColorStop(1, "rgba(20,18,14,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (kind === "debris") {
          ctx.globalAlpha = fade;
          ctx.fillStyle = q.color;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.age * 8);
          ctx.fillRect(-q.size, -q.size, q.size * 2, q.size * 2);
          ctx.restore();
          continue;
        }
        if (kind === "ring") {
          const sz = q.size + (q.sizeEnd! - q.size) * life;
          ctx.globalAlpha = fade;
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = q.color;
          ctx.beginPath();
          ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
          ctx.stroke();
          if (q.ringColor) {
            ctx.strokeStyle = q.ringColor;
            ctx.globalAlpha = fade * 0.55;
            ctx.beginPath();
            ctx.arc(q.x, q.y, sz * 0.85, 0, Math.PI * 2);
            ctx.stroke();
          }
          continue;
        }
        if (kind === "flash") {
          const sz = q.size + (q.sizeEnd! - q.size) * life;
          ctx.globalAlpha = fade;
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, sz);
          g.addColorStop(0, "rgba(255,248,215,1)");
          g.addColorStop(1, "rgba(255,200,120,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (q.sizeEnd !== undefined) continue;
        ctx.globalAlpha = fade;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawFireballs() {
      ctx.save();
      for (const q of particles) {
        if (q.kind !== "spark" || q.sizeEnd === undefined) continue;
        const life = Math.min(1, q.age / q.lifespan);
        const fade = 1 - life;
        const sz = q.size + (q.sizeEnd - q.size) * life;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, sz);
        g.addColorStop(0, "rgba(255,220,140,1)");
        g.addColorStop(0.5, hexToRgba(q.color, fade * 0.9));
        g.addColorStop(1, hexToRgba(q.color, 0));
        ctx.fillStyle = g;
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(q.x, q.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    let raf = 0;
    let lastMs = 0;
    resetCycle();

    function tick(ms: number) {
      if (!lastMs) lastMs = ms;
      const dt = Math.min(0.04, (ms - lastMs) / 1000);
      lastMs = ms;
      cycleMs += dt * 1000;

      const settled =
        projectiles.length === 0 &&
        particles.every((q) => q.kind === "fire" && q.persist);
      if (resetAt === 0 && settled && cycleMs > 800) {
        resetAt = cycleMs + 700;
      }
      if (cycleMs >= CYCLE_LEN || (resetAt > 0 && cycleMs >= resetAt)) {
        cycleMs = 0;
        resetAt = 0;
        resetCycle();
      }

      step(dt);
      drawScene();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [weapon]);

  return <canvas ref={canvasRef} className="crt-feed" />;
}

function groundAt(x: number, mounds: Mound[], base: number): number {
  let y = base;
  for (const m of mounds) {
    const dx = Math.abs(x - m.x);
    if (dx < m.w) {
      const lift = m.peak * (1 - dx / m.w);
      if (base - lift < y) y = base - lift;
    }
  }
  return y;
}

function drawProjectileShape(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponId,
  color: string,
  child: boolean,
): void {
  const scale = child ? 0.65 : 1;
  if (weapon === "grenade") {
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.moveTo(-5 * scale, 0); ctx.lineTo(5 * scale, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6 * scale); ctx.lineTo(0, 6 * scale); ctx.stroke();
    return;
  }
  if (weapon === "dirt") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-3 * scale, 0, 5 * scale, 0, Math.PI * 2);
    ctx.arc(2 * scale, -2 * scale, 3.5 * scale, 0, Math.PI * 2);
    ctx.arc(3 * scale, 2 * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (weapon === "skipper") {
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    return;
  }
  const w = 16 * scale, h = 8 * scale;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2 - h / 2, -h / 2);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2 - h / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-w / 2 + 2, -h / 2, 1, h);
  ctx.fillRect(-w / 2 + 5, -h / 2, 1, h);
}

function drawMiniTank(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barrelAngle = -Math.PI / 4,
): void {
  const W = 80;
  const hullFrac = 0.34;
  const treadFrac = 0.13;
  const hullH = W * hullFrac;
  const treadH = Math.max(8, W * treadFrac);
  const topLeftX = x - W / 2;
  const topLeftY = y - (hullH + treadH);
  drawTankPreview(ctx, {
    x: topLeftX,
    y: topLeftY,
    width: W,
    bodyStyle: DEFAULT_LOADOUT_SPEC.body,
    turretStyle: DEFAULT_LOADOUT_SPEC.turret,
    barrelStyle: DEFAULT_LOADOUT_SPEC.barrel,
    primary: "#" + DEFAULT_LOADOUT_SPEC.primaryColor.toString(16).padStart(6, "0"),
    accent: "#" + DEFAULT_LOADOUT_SPEC.accentColor.toString(16).padStart(6, "0"),
    pattern: DEFAULT_LOADOUT_SPEC.pattern,
    patternColor: "#" + DEFAULT_LOADOUT_SPEC.patternColor.toString(16).padStart(6, "0"),
    decal: DEFAULT_LOADOUT_SPEC.decal,
    barrelAngleRad: barrelAngle,
  });
}

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
