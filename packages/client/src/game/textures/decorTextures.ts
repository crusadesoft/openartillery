import Phaser from "phaser";

export function makeGrassTuft(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x6bdd5a, 1);
  g.fillTriangle(0, 8, 2, 0, 4, 8);
  g.fillTriangle(3, 8, 5, 1, 7, 8);
  g.fillTriangle(6, 8, 8, 0, 10, 8);
  g.fillStyle(0x3ea035, 1);
  g.fillRect(1, 6, 9, 2);
  g.generateTexture(key, 11, 9);
  g.destroy();
}

export function makeRock(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x7a7466, 1);
  g.fillTriangle(0, 10, 8, 2, 14, 10);
  g.fillStyle(0x433e34, 1);
  g.fillTriangle(7, 10, 11, 5, 14, 10);
  g.fillStyle(0xc8bfa4, 0.4);
  g.fillTriangle(1, 10, 5, 4, 8, 10);
  g.generateTexture(key, 15, 11);
  g.destroy();
}

export function makeCactus(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x3c7a3e, 1);
  g.fillRoundedRect(4, 2, 4, 18, 1);
  g.fillRoundedRect(0, 8, 3, 7, 1);
  g.fillRoundedRect(9, 6, 3, 7, 1);
  g.fillStyle(0x5ea760, 0.7);
  g.fillRect(4, 2, 1, 18);
  g.fillStyle(0x2b5a2d, 0.8);
  g.fillRect(7, 2, 1, 18);
  g.generateTexture(key, 12, 20);
  g.destroy();
}

export function makePineTree(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x3d2817, 1);
  g.fillRect(6, 18, 2, 8);
  g.fillStyle(0x1d3a62, 1);
  g.fillTriangle(0, 18, 14, 18, 7, 6);
  g.fillTriangle(2, 14, 12, 14, 7, 2);
  g.fillStyle(0x2e5aa2, 0.8);
  g.fillTriangle(1, 18, 6, 18, 6, 8);
  g.fillStyle(0xffffff, 0.6);
  g.fillTriangle(3, 18, 7, 18, 7, 12);
  g.fillTriangle(5, 14, 9, 14, 9, 8);
  g.generateTexture(key, 14, 26);
  g.destroy();
}

export function makeCrystal(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xff2a5a, 0.9);
  g.fillTriangle(0, 12, 6, 0, 12, 12);
  g.fillStyle(0xff7a8a, 1);
  g.fillTriangle(2, 12, 6, 2, 6, 12);
  g.fillStyle(0xffe0ea, 0.55);
  g.fillTriangle(3, 12, 5, 4, 6, 12);
  g.generateTexture(key, 12, 13);
  g.destroy();
}

export function makeLavaCrack(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 6;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 6);
  grad.addColorStop(0, "rgba(255,120,50,0)");
  grad.addColorStop(0.5, "rgba(255,210,100,0.9)");
  grad.addColorStop(1, "rgba(255,120,50,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  for (let x = 0; x <= 40; x += 4) ctx.lineTo(x, 3 + Math.sin(x * 0.5) * 1.5);
  ctx.lineWidth = 2;
  ctx.strokeStyle = grad as unknown as string;
  ctx.stroke();
  ctx.fillRect(0, 2, 40, 2);
  scene.textures.addCanvas(key, canvas);
}
