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
import { makeMoon, makeSunHalo } from "../textures/skyTextures";
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

    // Painted background elements — Kenney "Background Elements" pack
    // (CC0). Near-detail clouds, flat far clouds for distant parallax,
    // hills/mountains/trees for biome-specific horizon detail.
    this.load.image("cloud_1", "/textures/sky/cloud1.png");
    this.load.image("cloud_2", "/textures/sky/cloud2.png");
    this.load.image("cloud_3", "/textures/sky/cloud3.png");
    this.load.image("cloud_4", "/textures/sky/cloud4.png");
    this.load.image("cloud_5", "/textures/sky/cloud5.png");
    this.load.image("cloud_far_1", "/textures/sky/cloud_far1.png");
    this.load.image("cloud_far_2", "/textures/sky/cloud_far2.png");
    this.load.image("cloud_far_3", "/textures/sky/cloud_far3.png");
    this.load.image("cloud_far_4", "/textures/sky/cloud_far4.png");
    this.load.image("cloud_far_5", "/textures/sky/cloud_far5.png");
    this.load.image("hills_1", "/textures/sky/hills1.png");
    this.load.image("hills_2", "/textures/sky/hills2.png");
    this.load.image("mountain_1", "/textures/sky/mountain1.png");
    this.load.image("mountain_2", "/textures/sky/mountain2.png");
    this.load.image("mountain_3", "/textures/sky/mountain3.png");
    this.load.image("mountains_pointy", "/textures/sky/mountains_pointy.png");
    this.load.image("tree_1", "/textures/sky/tree1.png");
    this.load.image("tree_2", "/textures/sky/tree2.png");
    this.load.image("tree_3", "/textures/sky/tree3.png");
    this.load.image("tree_4", "/textures/sky/tree4.png");

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
