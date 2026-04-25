import {
  BOT_DIFFICULTY_SPECS,
  type BotDifficulty,
  Player,
  TANK,
  WEAPONS,
  WORLD,
  type WeaponId,
} from "@artillery/shared";
import type { World } from "../physics/World.js";

/**
 * Enemy AI. Each turn the bot picks an opponent, solves a rough ballistic
 * arc for the wind, scales the answer by its difficulty profile (aim error +
 * power noise), then animates barrel aim + power charge through normal
 * turn inputs. This way bot turns feel identical to human ones at the
 * physics layer.
 */
export class BotBrain {
  private state: "idle" | "moving" | "aiming" | "firing" | "done" = "idle";
  private targetAngle = 45;
  private targetPower = 600;
  private holdUntil = 0;
  private difficulty: BotDifficulty;
  /** -1 / 0 / +1 — which way the bot wants to roll this turn. */
  private moveDir: -1 | 0 | 1 = 0;
  /** wall-clock ms when the bot should stop driving and start aiming. */
  private moveUntil = 0;
  /** wall-clock ms before which the bot does nothing — gives turns a
   *  human-paced "thinking" beat at the top instead of snapping straight
   *  into reposition/aim. Re-rolled each turn for variety. */
  private thinkUntil = 0;

  constructor(
    public readonly sessionId: string,
    private readonly world: World,
    difficulty: BotDifficulty = "normal",
  ) {
    this.difficulty = difficulty;
  }

  setDifficulty(d: BotDifficulty): void { this.difficulty = d; }

  startTurn(p: Player): void {
    const spec = BOT_DIFFICULTY_SPECS[this.difficulty];

    // Choose a weapon from the difficulty's pool, skipping any that are
    // out of ammo so the bot doesn't lock itself on an exhausted slot.
    const pool = spec.weaponPool.filter((w): w is WeaponId => {
      if (!(w in WEAPONS)) return false;
      const def = WEAPONS[w as WeaponId];
      if (def.maxAmmo === undefined) return true;
      const remaining = p.ammo.get(w);
      return remaining === undefined ? true : remaining > 0;
    });
    if (pool.length > 0) {
      p.weapon = pool[Math.floor(Math.random() * pool.length)]!;
    } else {
      p.weapon = "shell";
    }

    const target = this.pickTarget(p);
    if (!target) {
      this.state = "firing";
      this.targetPower = TANK.MIN_POWER;
      this.targetAngle = 45;
      return;
    }
    const dx = target.x - p.x;
    p.facing = dx >= 0 ? 1 : -1;

    // Roll a reposition before aiming. Higher difficulties move more
    // often and for longer — crucial since sitting still lets anyone
    // walk their shots onto you.
    const moveChance =
      this.difficulty === "hard" ? 0.75 :
      this.difficulty === "easy" ? 0.3 :
      0.55;
    if (Math.random() < moveChance) {
      // Prefer opening distance when close, closing when far, but keep
      // some randomness so bots aren't predictable.
      const dist = Math.abs(dx);
      const wantFurther = dist < 320;
      const awayDir: -1 | 1 = wantFurther ? (dx >= 0 ? -1 : 1) : (dx >= 0 ? 1 : -1);
      this.moveDir = Math.random() < 0.3
        ? (Math.random() < 0.5 ? -1 : 1)
        : awayDir;
      // 0.6–1.6 s of driving, enough to cover 35–90 px at the 60 px/s
      // ground speed — a meaningful relocation without wasting the turn.
      const durSec = 0.6 + Math.random() * 1.0;
      this.moveUntil = Date.now() + durSec * 1000;
      this.state = "moving";
    } else {
      this.moveDir = 0;
      this.moveUntil = 0;
      this.state = "aiming";
    }

    // Seed aim targets from the current position — these get refreshed
    // by `recalcAim` again after any reposition so the shot accounts for
    // the bot's new x.
    this.recalcAim(p);
    this.holdUntil = 0;
    // Random "thinking" pause before any action. 0.6–1.6s feels natural
    // and breaks the rapid-fire cadence that bots otherwise have.
    this.thinkUntil = Date.now() + 600 + Math.random() * 1000;
  }

  /** Drive input produced by the bot this frame — BattleRoom feeds this
   *  into `world.applyInput` so reposition is on the same physics path
   *  as human movement. Empty input outside the "moving" phase. */
  getInput(): { left: boolean; right: boolean; up: boolean; down: boolean } {
    if (this.state !== "moving" || this.moveDir === 0) {
      return { left: false, right: false, up: false, down: false };
    }
    return {
      left: this.moveDir < 0,
      right: this.moveDir > 0,
      up: false,
      down: false,
    };
  }

  /** After reposition, re-solve the ballistic so aim accounts for the
   *  bot's new x. Without this the round lands where the bot *used* to
   *  stand. */
  private recalcAim(p: Player): void {
    const spec = BOT_DIFFICULTY_SPECS[this.difficulty];
    const target = this.pickTarget(p);
    if (!target) {
      this.targetPower = TANK.MIN_POWER;
      this.targetAngle = 45;
      return;
    }
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    p.facing = dx >= 0 ? 1 : -1;
    const g = WORLD.GRAVITY;
    const basePower = 700 + Math.random() * 280;
    const v = basePower;
    const horizontal = Math.abs(dx);
    const vertical = -dy;
    const discriminant =
      v ** 4 - g * (g * horizontal * horizontal + 2 * vertical * v ** 2);
    let angleDeg: number;
    if (discriminant < 0) {
      angleDeg = 55;
    } else {
      const sq = Math.sqrt(discriminant);
      const hi = Math.atan2(v * v + sq, g * horizontal);
      angleDeg = (hi * 180) / Math.PI;
    }
    const wind = this.world.state.wind;
    const accuracyFactor = 1 / (1 + spec.aimErrorDeg);
    angleDeg -= wind * 0.004 * Math.sign(dx || 1) * accuracyFactor;
    angleDeg += (Math.random() - 0.5) * 2 * spec.aimErrorDeg;
    this.targetAngle = clamp(
      angleDeg,
      TANK.MIN_ANGLE_DEG + 5,
      TANK.MAX_ANGLE_DEG,
    );
    const noisedPower =
      v * (1 + (Math.random() - 0.5) * 2 * spec.powerErrorFrac);
    this.targetPower = clamp(
      noisedPower,
      TANK.MIN_POWER + 50,
      TANK.MAX_POWER,
    );
  }

  tick(p: Player, now: number, dt: number): void {
    if (p.dead) {
      this.state = "done";
      return;
    }
    // Top-level pause: noop until the per-turn "thinking" delay elapses.
    if (now < this.thinkUntil) return;
    if (this.state === "moving") {
      // End the drive once the budget runs out, or if we've run dry on
      // fuel so we don't spend the rest of the turn spinning on empty.
      if (now >= this.moveUntil || p.fuel <= 1) {
        this.moveDir = 0;
        // Re-aim with our new position.
        this.recalcAim(p);
        this.state = "aiming";
      }
      return;
    }
    if (this.state === "aiming") {
      const diff = this.targetAngle - p.angle;
      const step = Math.sign(diff) * TANK.AIM_RATE_DEG_PER_SEC * dt * 1.2;
      if (Math.abs(diff) <= Math.abs(step) + 0.5) {
        p.angle = this.targetAngle;
        this.state = "firing";
        this.holdUntil = 0;
      } else {
        p.angle += step;
      }
    } else if (this.state === "firing") {
      if (!p.charging) {
        p.charging = true;
        p.power = TANK.MIN_POWER;
      } else {
        p.power = Math.min(
          TANK.MAX_POWER,
          p.power + TANK.POWER_CHARGE_RATE * dt * 1.2,
        );
        if (p.power >= this.targetPower) {
          p.charging = false;
          this.state = "done";
          // Pre-fire pause so the trigger doesn't snap the instant the
          // gauge fills. 0.3–0.9s of randomness adds breathing room.
          this.holdUntil = now + 300 + Math.random() * 600;
        }
      }
    }
  }

  wantsToFire(now: number): boolean {
    return this.state === "done" && this.holdUntil > 0 && now >= this.holdUntil;
  }

  consumeFire(): void {
    this.holdUntil = 0;
  }

  private pickTarget(self: Player): Player | null {
    let best: Player | null = null;
    let bestScore = -Infinity;
    const teamMode = this.world.state.teamMode;
    this.world.state.players.forEach((p) => {
      if (p.id === self.id || p.dead) return;
      // In team mode, never deliberately aim at a teammate even when FF
      // is on — keeps bots from owning the kill feed with own-goals.
      if (teamMode && self.team !== 0 && p.team === self.team) return;
      // Prefer lower HP and nearer enemies.
      const dist = Math.hypot(p.x - self.x, p.y - self.y);
      const score = -dist - p.hp * 2;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    });
    return best;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
