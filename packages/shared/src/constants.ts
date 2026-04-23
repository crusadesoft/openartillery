export const PROTOCOL_VERSION = 1;

export const WORLD = {
  WIDTH: 2400,
  HEIGHT: 900,
  GRAVITY: 900,
  /** Velocity-squared drag coefficient: dvx = -vx * AIR_DRAG * |v| * dt.
   *  At 0.0008 a fast round bled ~80 % of its horizontal velocity in a
   *  second, making cross-map shots impossible; 0.00015 keeps a subtle
   *  drop-off so long arcs still feel weightier than short ones while
   *  still reaching the far side of the field. */
  AIR_DRAG: 0.00015,
  MAX_WIND: 25,
  TERRAIN_RESOLUTION: 1,
} as const;

export const TURN = {
  DURATION_MS: 30_000,
  BETWEEN_TURNS_MS: 2_500,
  FUEL_PER_TURN: 100,
  FUEL_COST_PER_UNIT: 0.35,
  MOVE_SPEED: 80,
} as const;

export const TANK = {
  WIDTH: 36,
  HEIGHT: 18,
  MAX_HP: 100,
  /** Fallback barrel length when a specific style isn't known.
   *  Derived from `tankPreview.barrelLenMap.standard * 48 = 22.08`. */
  BARREL_LENGTH: 22,
  /** Offset of the barrel pivot inside the tank container, mirrored by
   *  facing. Derived from the canonical hull renderer's barrel pivot
   *  relative to hull centre (heavy hull + standard turret). */
  BARREL_PIVOT_X: 2,
  BARREL_PIVOT_Y: -11,
  /** Barrel lengths per style, derived from the canonical
   *  `tankPreview.barrelLenMap * 48`. Server projectile-spawn uses the
   *  player-specific length so long/sniper/stubby rounds leave the
   *  muzzle at the right point instead of mid-shaft. */
  BARREL_LENGTHS: {
    standard: 22,
    heavy: 20,
    long: 28,
    sniper: 32,
    stubby: 15,
  } as Record<string, number>,
  MIN_ANGLE_DEG: -90,
  MAX_ANGLE_DEG: 90,
  AIM_RATE_DEG_PER_SEC: 45,
  MIN_POWER: 180,
  MAX_POWER: 1950,
  POWER_CHARGE_RATE: 1200,
  /** Largest terrain gradient (|dy|/|dx|) the treads can climb. Steeper
   *  than this and the tank refuses the step — otherwise a single frame
   *  can teleport the hull up a cliff face. ~45° with dx=1. */
  MAX_CLIMB_SLOPE: 1.0,
  /** Minimum forward step (px) a move tick attempts; used so the climb
   *  check samples a realistic horizontal delta, not a micro dt. */
  MIN_MOVE_STEP_PX: 1,
} as const;

export const ROOM = {
  NAME: "battle",
  MIN_PLAYERS: 1,
  MAX_PLAYERS: 6,
  COUNTDOWN_MS: 5_000,
} as const;

export const NETWORK = {
  TICK_HZ: 30,
  PATCH_HZ: 20,
  DEFAULT_PORT: 2567,
} as const;

export type Vec2 = { x: number; y: number };
