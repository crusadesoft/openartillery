import { eq } from "drizzle-orm";
import {
  DEFAULT_SELECTION,
  downgradeSelection,
  isPaidTankSku,
  isTankSku,
  resolveSelection,
  sanitizeSelection,
  TANKS,
  type Loadout,
  type LoadoutSelection,
} from "@artillery/shared";
import { db, schema } from "../db/index.js";

export async function getOwnedTankSkus(userId: string): Promise<Set<string>> {
  const rows = await db.query.entitlements.findMany({
    where: eq(schema.entitlements.userId, userId),
  });
  return new Set(rows.map((r) => r.sku));
}

export async function loadSelection(userId: string): Promise<LoadoutSelection> {
  const row = await db.query.userLoadouts.findFirst({
    where: eq(schema.userLoadouts.userId, userId),
  });
  if (!row) return { ...DEFAULT_SELECTION };
  return sanitizeSelection({ tankSku: row.tankSku, decal: row.decal as never });
}

export async function loadOwnedSelection(
  userId: string,
): Promise<{ selection: LoadoutSelection; ownedTanks: Set<string> }> {
  const [sel, owned] = await Promise.all([
    loadSelection(userId),
    getOwnedTankSkus(userId),
  ]);
  return { selection: downgradeSelection(sel, owned), ownedTanks: owned };
}

export async function loadResolvedLoadout(userId: string): Promise<Loadout> {
  const { selection } = await loadOwnedSelection(userId);
  return resolveSelection(selection);
}

export async function saveSelection(
  userId: string,
  incoming: Partial<LoadoutSelection>,
): Promise<LoadoutSelection> {
  const sanitized = sanitizeSelection(incoming);
  const owned = await getOwnedTankSkus(userId);
  const safe = downgradeSelection(sanitized, owned);
  await db
    .insert(schema.userLoadouts)
    .values({
      userId,
      tankSku: safe.tankSku,
      decal: safe.decal,
    })
    .onConflictDoUpdate({
      target: schema.userLoadouts.userId,
      set: { tankSku: safe.tankSku, decal: safe.decal, updatedAt: new Date() },
    });
  return safe;
}

export interface GrantResult {
  granted: boolean;
  alreadyOwned: boolean;
}

export async function grantEntitlement(
  userId: string,
  sku: string,
  source: string,
  externalId?: string,
): Promise<GrantResult> {
  if (!isPaidTankSku(sku)) {
    return { granted: false, alreadyOwned: false };
  }
  const inserted = await db
    .insert(schema.entitlements)
    .values({ userId, sku, source, externalId: externalId ?? null })
    .onConflictDoNothing({
      target: [schema.entitlements.userId, schema.entitlements.sku],
    })
    .returning({ id: schema.entitlements.id });
  return { granted: inserted.length > 0, alreadyOwned: inserted.length === 0 };
}

export interface TankListing {
  sku: string;
  label: string;
  blurb: string;
  priceCents: number;
  body: string;
  turret: string;
  barrel: string;
  pattern: string;
  paint: { primary: number; accent: number; pattern: number };
  bonusDecals: string[];
  /** True for free starters and any paid tank the user has paid for. */
  owned: boolean;
}

export function listTanks(owned: ReadonlySet<string>): TankListing[] {
  return TANKS.map((t) => ({
    sku: t.sku,
    label: t.label,
    blurb: t.blurb,
    priceCents: t.priceCents,
    body: t.body,
    turret: t.turret,
    barrel: t.barrel,
    pattern: t.pattern,
    paint: {
      primary: t.primaryColor,
      accent: t.accentColor,
      pattern: t.patternColor,
    },
    bonusDecals: [...t.bonusDecals],
    owned: t.priceCents === 0 || owned.has(t.sku),
  }));
}

export { isTankSku, isPaidTankSku };
