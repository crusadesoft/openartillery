import { Sound } from "../game/audio/Sound";

/**
 * Fire the standard UI click SFX. Safe to call anywhere — it lazy-inits
 * the Howler engine on first call (required because browsers block audio
 * until the first user gesture).
 */
export function click(): void {
  try { Sound.init(); Sound.play("ui_click"); } catch { /* ignore */ }
}
