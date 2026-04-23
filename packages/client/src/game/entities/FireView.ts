import Phaser from "phaser";
import type { FireTile } from "@artillery/shared";

/**
 * Flickering flame cluster rendered per napalm fire tile. Uses a cheap
 * particle emitter plus a pulsing orange disk so it reads even at low
 * zoom levels.
 */
export class FireView {
  private glow: Phaser.GameObjects.Image;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, public state: FireTile) {
    this.glow = scene.add
      .image(state.x, state.y, "smoke")
      .setTint(0xff6a2e)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(state.radius * 2.2, state.radius * 2.2)
      .setDepth(5);
    scene.tweens.add({
      targets: this.glow,
      alpha: 0.25,
      yoyo: true,
      repeat: -1,
      duration: 220,
      ease: "Sine.easeInOut",
    });

    this.emitter = scene.add
      .particles(state.x, state.y - 4, "spark", {
        lifespan: 500,
        speedY: { min: -140, max: -60 },
        speedX: { min: -30, max: 30 },
        scale: { start: 0.9, end: 0 },
        tint: [0xffd25e, 0xff6b35, 0xff2e00],
        quantity: 2,
        frequency: 35,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(5);
  }

  sync(state: FireTile): void {
    this.state = state;
    this.glow.setPosition(state.x, state.y);
    this.emitter.setPosition(state.x, state.y - 4);
  }

  destroy(): void {
    this.glow.destroy();
    this.emitter.stop();
    this.emitter.destroy();
  }
}
