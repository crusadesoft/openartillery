import {
  type Loadout,
  DEFAULT_LOADOUT_SPEC,
  sanitizeLoadout,
} from "@artillery/shared";

const KEY = "artillery:loadout";

export function loadLoadout(): Loadout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LOADOUT_SPEC };
    return sanitizeLoadout(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_LOADOUT_SPEC };
  }
}

export function saveLoadout(l: Loadout): void {
  localStorage.setItem(KEY, JSON.stringify(sanitizeLoadout(l)));
}
