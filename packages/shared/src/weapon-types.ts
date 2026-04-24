export type WeaponId =
  | "shell"
  | "heavy"
  | "cluster"
  | "dirt"
  | "skipper"
  | "grenade"
  | "napalm"
  | "airstrike"
  | "mirv";

export interface WeaponDef {
  id: WeaponId;
  /** base damage at ground zero */
  damage: number;
  /** explosion radius in world pixels */
  radius: number;
  /** visual tint for the projectile */
  tint: number;
  /** radius in pixels of the projectile sprite */
  projectileRadius: number;
  /** how much terrain the explosion removes, as fraction of blast radius */
  digFactor: number;
  name: string;
  /** sub-munitions released on detonation */
  cluster?: {
    count: number;
    child: WeaponId;
    /** initial spread speed */
    spread: number;
  };
  /** spawn `count` additional projectiles from above at ex, marching across */
  airstrike?: {
    count: number;
    spacing: number;
    /** height above terrain at which they spawn */
    altitude: number;
  };
  /** for "dirt": adds terrain instead of removing */
  addsTerrain?: boolean;
  /** bounces before detonation (0 = explode on impact) */
  bounces?: number;
  /** lingering fire patch: seconds of persistence; damage per tick radius */
  napalm?: {
    durationSec: number;
    radius: number;
    damagePerSec: number;
    tileCount: number;
  };
  /** mid-flight split into N children after `splitAfterSec` seconds of flight */
  mirv?: {
    count: number;
    child: WeaponId;
    splitAfterSec: number;
    spread: number;
  };
  fireSfx: string;
  explodeSfx: string;
  /** short description for UI */
  blurb: string;
  /** Rounds available per match. `undefined` → unlimited (e.g. the default
   *  shell). */
  maxAmmo?: number;
}
