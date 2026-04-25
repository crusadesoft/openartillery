import Phaser from "phaser";

export function makeMoon(scene: Phaser.Scene, key: string, d: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = d;
  canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  const r = d / 2;
  const grad = ctx.createRadialGradient(r - 6, r - 6, 0, r, r, r);
  grad.addColorStop(0, "#fffbe5");
  grad.addColorStop(0.6, "#e6d9a8");
  grad.addColorStop(1, "rgba(200,180,120,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath(); ctx.arc(r - 8, r - 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r + 6, r + 8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r + 2, r - 10, 2, 0, Math.PI * 2); ctx.fill();
  scene.textures.addCanvas(key, canvas);
}

export function makeSunHalo(scene: Phaser.Scene, key: string, d: number): void {
  const canvas = document.createElement("canvas");
  canvas.width = d;
  canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  const r = d / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,224,150,1)");
  grad.addColorStop(0.25, "rgba(255,180,80,0.9)");
  grad.addColorStop(0.7, "rgba(255,130,60,0.25)");
  grad.addColorStop(1, "rgba(255,100,60,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, d, d);
  scene.textures.addCanvas(key, canvas);
}
