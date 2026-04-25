import Phaser from "phaser";
import type { Room } from "colyseus.js";
import type { BattleState } from "@artillery/shared";
import { BootScene } from "./scenes/BootScene";
import { BattleScene } from "./scenes/BattleScene";
import { WORLD } from "@artillery/shared";
import UIPlugin from "phaser3-rex-plugins/templates/ui/ui-plugin.js";

export interface SceneInit {
  room: Room<BattleState>;
}

export class PhaserGame {
  readonly game: Phaser.Game;
  private resizeObserver: ResizeObserver | null = null;

  constructor(host: HTMLElement, room: Room<BattleState>) {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: "#0b1020",
      width: host.clientWidth,
      height: host.clientHeight,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: "matter",
        matter: {
          gravity: { x: 0, y: 1 },
          enableSleeping: true,
          debug: false,
        },
      },
      fps: { target: 60, forceSetTimeOut: false },
      render: { pixelArt: false, antialias: true },
      scene: [BootScene, BattleScene],
      plugins: {
        scene: [
          { key: "rexUI", plugin: UIPlugin, mapping: "rexUI" },
        ],
      },
      callbacks: {
        preBoot: (game) => {
          game.registry.set("room", room);
          game.registry.set("world", WORLD);
        },
      },
    });
    // Dev convenience — exposes the Phaser game + Colyseus room on
    // window so automated tests (and console debugging) can drive the
    // battle without reaching through React refs. No effect on prod UX.
    (window as unknown as { __game?: unknown; __room?: unknown }).__game = this.game;
    (window as unknown as { __game?: unknown; __room?: unknown }).__room = room;

    // Phaser's Scale.RESIZE mode listens to window.resize but doesn't
    // reliably pick up parent-only changes (toggling the bottom UI
    // bar / music dock shrinks #phaser-host without the window
    // changing size). Without a refresh the canvas stays at its old
    // size and CENTER_BOTH centres it, exposing the parent's bg as a
    // dim band on the side or top. Watching the parent and calling
    // scale.refresh() forces Phaser to rebuild the canvas to match.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        try { this.game.scale.refresh(); } catch { /* destroyed */ }
      });
      this.resizeObserver.observe(host);
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.game.destroy(true, false);
  }
}
