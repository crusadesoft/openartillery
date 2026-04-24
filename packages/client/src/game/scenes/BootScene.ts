import Phaser from "phaser";
import {
  makeCircleTex,
  makeDebris,
  makePixelTex,
  makeSoftDisk,
} from "../textures/primitiveTextures";
import {
  makeProjAirstrike,
  makeProjCluster,
  makeProjDirt,
  makeProjGrenade,
  makeProjMirv,
  makeProjNapalm,
  makeProjShell,
  makeProjSkipper,
} from "../textures/projectileTextures";
import { makeCloud, makeMoon, makeSunHalo } from "../textures/skyTextures";
import {
  makeCactus,
  makeCrystal,
  makeGrassTuft,
  makeLavaCrack,
  makePineTree,
  makeRock,
} from "../textures/decorTextures";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "boot" });
  }

  preload(): void {
    this.load.image("terrain_grasslands", "/textures/terrain/grasslands.jpg");
    this.load.image("terrain_desert", "/textures/terrain/desert.jpg");
    this.load.image("terrain_arctic", "/textures/terrain/arctic.jpg");
    this.load.image("terrain_lava", "/textures/terrain/lava.jpg");
    this.load.image("terrain_dusk", "/textures/terrain/dusk.jpg");
    this.load.image("terrain_rock", "/textures/terrain/rock.jpg");
    this.load.image("tank_plates", "/textures/tank/plates.jpg");

    makePixelTex(this, "pixel");
    makeCircleTex(this, "proj", 10, 0xffffff);
    makeCircleTex(this, "spark", 6, 0xffffff);
    makeSoftDisk(this, "smoke", 28);

    makeProjShell(this, "proj_shell", 28, 12, "#f3d063", "#6a4f18");
    makeProjShell(this, "proj_heavy", 36, 16, "#c7602a", "#431b06");
    makeProjCluster(this, "proj_cluster", 26, 18);
    makeProjDirt(this, "proj_dirt", 22, 22);
    makeProjSkipper(this, "proj_skipper", 24, 12);
    makeProjGrenade(this, "proj_grenade", 20, 22);
    makeProjNapalm(this, "proj_napalm", 26, 16);
    makeProjAirstrike(this, "proj_airstrike", 34, 14);
    makeProjMirv(this, "proj_mirv", 34, 18);

    // Tank body/turret/barrel textures are built per-player by the
    // TankView entity, using the same canvas renderer as the Customize
    // preview (`game/tankPreview.ts`). BootScene intentionally does not
    // bake tank parts here — single source of truth.

    makeDebris(this, "debris_chunk", 7, 7);
    makeCloud(this, "cloud_a", 180, 46);
    makeCloud(this, "cloud_b", 120, 36);
    makeMoon(this, "moon", 64);
    makeSunHalo(this, "sun_halo", 120);
    makeGrassTuft(this, "grass_tuft");
    makeRock(this, "rock_small");
    makeCactus(this, "cactus");
    makePineTree(this, "pine");
    makeCrystal(this, "crystal");
    makeLavaCrack(this, "lava_crack");
  }

  create(): void {
    this.scene.start("battle");
  }
}
