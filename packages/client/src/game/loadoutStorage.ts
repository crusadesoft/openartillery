import {
  DEFAULT_SELECTION,
  sanitizeSelection,
  type LoadoutSelection,
} from "@artillery/shared";

const KEY = "artillery:selection";
// Old key from the part-customisation era. Read once on first load so
// returning players don't lose nothing-of-substance, then ignored.
const LEGACY_KEY = "artillery:loadout";

export function loadSelection(): LoadoutSelection {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeSelection(JSON.parse(raw));
    // No-op fallback if the legacy key is around — discard.
    if (localStorage.getItem(LEGACY_KEY)) {
      localStorage.removeItem(LEGACY_KEY);
    }
    return { ...DEFAULT_SELECTION };
  } catch {
    return { ...DEFAULT_SELECTION };
  }
}

export function saveSelection(sel: LoadoutSelection): void {
  localStorage.setItem(KEY, JSON.stringify(sanitizeSelection(sel)));
}
