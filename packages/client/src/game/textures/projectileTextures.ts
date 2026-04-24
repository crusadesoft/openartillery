import Phaser from "phaser";
import { darken, lighten } from "./canvasUtils";

export function makeProjShell(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  bodyColor: string,
  capColor: string,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const cy = h / 2;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, lighten(bodyColor, 0.35));
  body.addColorStop(0.5, bodyColor);
  body.addColorStop(1, darken(bodyColor, 0.45));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(w * 0.6, 2);
  ctx.lineTo(w * 0.95, cy);
  ctx.lineTo(w * 0.6, h - 2);
  ctx.lineTo(0, h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = capColor;
  ctx.beginPath();
  ctx.moveTo(w * 0.55, 2);
  ctx.lineTo(w * 0.78, 2);
  ctx.lineTo(w * 0.95, cy);
  ctx.lineTo(w * 0.78, h - 2);
  ctx.lineTo(w * 0.55, h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(60,30,10,0.85)";
  ctx.fillRect(w * 0.15, 2, 2, h - 4);
  ctx.fillRect(w * 0.28, 2, 1, h - 4);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(2, 3, w * 0.55, 1);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 2, 1.2, h - 4);
  scene.textures.addCanvas(key, canvas);
}

export function makeProjCluster(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, "#8a8f78");
  body.addColorStop(1, "#3a3e30");
  ctx.fillStyle = body;
  ctx.fillRect(1, 2, w - 6, h - 4);
  ctx.fillStyle = "#2a2d22";
  ctx.beginPath();
  ctx.moveTo(w - 6, 2);
  ctx.lineTo(w - 1, h / 2);
  ctx.lineTo(w - 6, h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (let x = 3; x < w - 6; x += 4) ctx.fillRect(x, 2, 1, h - 4);
  ctx.fillStyle = "#e6c23a";
  ctx.fillRect(4, h / 2 - 1, w - 12, 2);
  ctx.fillStyle = "#1a1c14";
  ctx.fillRect(0, 0, 3, 3);
  ctx.fillRect(0, h - 3, 3, 3);
  scene.textures.addCanvas(key, canvas);
}

export function makeProjDirt(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const blobs: [number, number, number, string][] = [
    [w * 0.5, h * 0.55, Math.min(w, h) * 0.42, "#6a4a25"],
    [w * 0.35, h * 0.4, Math.min(w, h) * 0.28, "#7a5a2f"],
    [w * 0.65, h * 0.6, Math.min(w, h) * 0.3, "#5a3a1d"],
    [w * 0.5, h * 0.32, Math.min(w, h) * 0.18, "#8a6a3c"],
  ];
  for (const [cx, cy, r, c] of blobs) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  for (let i = 0; i < 10; i++) {
    const x = 2 + Math.random() * (w - 4);
    const y = 2 + Math.random() * (h - 4);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = "rgba(255,230,180,0.4)";
  ctx.beginPath();
  ctx.arc(w * 0.4, h * 0.35, 2, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, canvas);
}

export function makeProjSkipper(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#c43a5a");
  grad.addColorStop(1, "#6a1528");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, h / 2);
  ctx.lineTo(w - 2, h / 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(w * 0.4, h * 0.3, w * 0.2, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, canvas);
}

export function makeProjGrenade(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const body = ctx.createRadialGradient(
    w * 0.4, h * 0.4, 1, w * 0.5, h * 0.55, w * 0.55,
  );
  body.addColorStop(0, "#6b8a3a");
  body.addColorStop(1, "#2a3a14");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.6, w / 2 - 2, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = h * 0.3 + i * (h * 0.2);
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.lineTo(w - 3, y);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const x = 3 + i * (w / 4);
    ctx.beginPath();
    ctx.moveTo(x, h * 0.3);
    ctx.lineTo(x, h * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = "#4a4a42";
  ctx.fillRect(w / 2 - 2, 2, 4, h * 0.22);
  ctx.fillStyle = "#bfbfa8";
  ctx.fillRect(w / 2 + 2, 3, w * 0.28, 2);
  ctx.strokeStyle = "#d8c078";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w / 2 - 3, 3, 2, 0, Math.PI * 2);
  ctx.stroke();
  scene.textures.addCanvas(key, canvas);
}

export function makeProjNapalm(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, "#c95a2a");
  body.addColorStop(1, "#5a1c08");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(w - 7, 2);
  ctx.lineTo(w - 2, h / 2);
  ctx.lineTo(w - 7, h - 2);
  ctx.lineTo(2, h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  for (let x = 4; x < w - 8; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, 2);
    ctx.lineTo(x + 2, 2);
    ctx.lineTo(x, h - 2);
    ctx.lineTo(x - 2, h - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#f2c43a";
  ctx.beginPath();
  ctx.moveTo(w * 0.25, h / 2 - 3);
  ctx.lineTo(w * 0.42, h / 2 - 3);
  ctx.lineTo(w * 0.335, h / 2 + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.fillRect(w * 0.33, h / 2 - 2, 0.8, 2);
  ctx.fillRect(w * 0.33, h / 2 + 0.5, 0.8, 0.8);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(2, 3, w * 0.7, 1);
  scene.textures.addCanvas(key, canvas);
}

export function makeProjAirstrike(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const cy = h / 2;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, "#cfd3d8");
  body.addColorStop(1, "#4a5058");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.35);
  ctx.lineTo(w * 0.15, h * 0.2);
  ctx.lineTo(w * 0.7, h * 0.2);
  ctx.lineTo(w - 2, cy);
  ctx.lineTo(w * 0.7, h * 0.8);
  ctx.lineTo(w * 0.15, h * 0.8);
  ctx.lineTo(0, h * 0.65);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1a1e25";
  ctx.beginPath();
  ctx.moveTo(w * 0.55, h * 0.25);
  ctx.lineTo(w * 0.7, h * 0.2);
  ctx.lineTo(w - 2, cy);
  ctx.lineTo(w * 0.7, h * 0.8);
  ctx.lineTo(w * 0.55, h * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2d323a";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.15, h * 0.2);
  ctx.lineTo(w * 0.15, h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w * 0.15, h * 0.8);
  ctx.lineTo(w * 0.15, h * 0.65);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(w * 0.18, h * 0.22, w * 0.5, 1);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(w * 0.3, cy - 0.5, w * 0.15, 1);
  scene.textures.addCanvas(key, canvas);
}

export function makeProjMirv(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const cy = h / 2;
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, "#d8d8dc");
  body.addColorStop(0.5, "#8a8d96");
  body.addColorStop(1, "#2e3037");
  ctx.fillStyle = body;
  ctx.fillRect(w * 0.15, h * 0.25, w * 0.6, h * 0.5);
  ctx.fillStyle = "#c1494e";
  ctx.beginPath();
  ctx.moveTo(w * 0.75, h * 0.25);
  ctx.lineTo(w - 1, cy);
  ctx.lineTo(w * 0.75, h * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#b0272a";
  ctx.fillRect(w * 0.25, h * 0.25, 2, h * 0.5);
  ctx.fillRect(w * 0.55, h * 0.25, 2, h * 0.5);
  ctx.fillStyle = "#1d2028";
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.25);
  ctx.lineTo(0, 0);
  ctx.lineTo(w * 0.1, h * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.75);
  ctx.lineTo(0, h);
  ctx.lineTo(w * 0.1, h * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(0, cy - 1, w * 0.18, 2);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(w * 0.15, h * 0.27, w * 0.58, 1);
  scene.textures.addCanvas(key, canvas);
}
