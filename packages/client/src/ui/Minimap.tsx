import { useEffect, useRef } from "react";
import type { Room } from "colyseus.js";
import type { BattleState } from "@artillery/shared";
import { BIOMES, type BiomeId, WORLD } from "@artillery/shared";

interface Props { room: Room<BattleState>; tick: number; }

export function Minimap({ room, tick }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    const biome = (room.state.biome as BiomeId) || "grasslands";
    const palette = BIOMES[biome];

    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, toHex(palette.skyTop));
    grad.addColorStop(1, toHex(palette.skyBottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Terrain silhouette
    const heights = room.state.terrain.heights;
    const len = heights.length || WORLD.WIDTH;
    ctx.fillStyle = toHex(palette.topsoil);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < len; i++) {
      const x = (i / len) * w;
      const y = ((heights[i] ?? WORLD.HEIGHT) / WORLD.HEIGHT) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = toHex(palette.grass);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = (i / len) * w;
      const y = ((heights[i] ?? WORLD.HEIGHT) / WORLD.HEIGHT) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Projectiles (yellow trails)
    ctx.fillStyle = "#ffd25e";
    room.state.projectiles.forEach((p) => {
      const px = (p.x / WORLD.WIDTH) * w;
      const py = (p.y / WORLD.HEIGHT) * h;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    });

    // Tanks
    room.state.players.forEach((p) => {
      const px = (p.x / WORLD.WIDTH) * w;
      const py = (p.y / WORLD.HEIGHT) * h;
      ctx.fillStyle = p.dead ? "#444" : toHex(p.color);
      ctx.beginPath();
      ctx.arc(px, py, p.id === room.state.currentTurnId ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === room.state.currentTurnId && !p.dead) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }, [room, tick]);

  return (
    <div className="minimap">
      <span className="hud-rivet tl" />
      <span className="hud-rivet tr" />
      <span className="hud-rivet bl" />
      <span className="hud-rivet br" />
      <div className="minimap-bezel">
        <div className="minimap-glass">
          <canvas ref={canvasRef} />
          <div className="minimap-scanlines" aria-hidden />
          <div className="minimap-vignette" aria-hidden />
        </div>
      </div>
      <div className="minimap-stencil">RADAR · 1:50K</div>
    </div>
  );
}

function toHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}
