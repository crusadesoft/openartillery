import Phaser from "phaser";

export function makePixelTex(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture(key, 2, 2);
  g.destroy();
}

export function makeCircleTex(scene: Phaser.Scene, key: string, d: number, color: number): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1);
  g.fillCircle(d / 2, d / 2, d / 2);
  g.generateTexture(key, d, d);
  g.destroy();
}

export function makeSoftDisk(scene: Phaser.Scene, key: string, d: number): void {
  const r = d / 2;
  const canvas = document.createElement("canvas");
  canvas.width = d;
  canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, d, d);
  scene.textures.addCanvas(key, canvas);
}

export function makeDebris(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(0, h, w, h, w / 2, 0);
  g.generateTexture(key, w, h);
  g.destroy();
}
