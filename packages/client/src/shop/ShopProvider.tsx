import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_SELECTION,
  decalsAvailable,
  downgradeSelection,
  resolveSelection,
  sanitizeSelection,
  type DecalStyle,
  type Loadout,
  type LoadoutSelection,
} from "@artillery/shared";
import { useAuth } from "../auth/AuthProvider";
import { api, type TankListing } from "../auth/authClient";
import { loadSelection, saveSelection } from "../game/loadoutStorage";

interface ShopContextValue {
  selection: LoadoutSelection;
  /** Fully-resolved loadout for the currently equipped selection. */
  loadout: Loadout;
  /** SKUs of paid tanks the player owns. Free tanks aren't in this set. */
  ownedTanks: ReadonlySet<string>;
  /** Decals the player can equip (free + bonus from owned tanks). */
  ownedDecals: ReadonlySet<DecalStyle>;
  tanks: TankListing[];
  /** Server-controlled flag — false while we wait on Xsolla launch
   *  approval. UI keeps the catalog visible but disables the Buy button. */
  shopEnabled: boolean;
  setSelection: (next: LoadoutSelection) => void;
  refreshShop: () => Promise<void>;
  buyTank: (sku: string) => Promise<string>;
}

const ShopContext = createContext<ShopContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 500;

export function ShopProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { session } = useAuth();
  const accessToken = session?.tokens.accessToken ?? null;

  const [selection, setSelectionState] = useState<LoadoutSelection>(() =>
    loadSelection(),
  );
  const [ownedTanks, setOwnedTanks] = useState<ReadonlySet<string>>(new Set());
  const [tanks, setTanks] = useState<TankListing[]>([]);
  const [shopEnabled, setShopEnabled] = useState(true);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTokenRef = useRef<string | null>(null);

  const ownedDecals = useMemo(
    () => decalsAvailable(ownedTanks),
    [ownedTanks],
  );

  const refreshShop = useCallback(async () => {
    try {
      if (accessToken) {
        const [me, shop] = await Promise.all([
          api.getLoadout(accessToken),
          api.getTanks(accessToken),
        ]);
        const owned = new Set(me.ownedSkus);
        setOwnedTanks(owned);
        setTanks(shop.tanks);
        setShopEnabled(shop.enabled);
        const safe = downgradeSelection(sanitizeSelection(me.selection), owned);
        setSelectionState(safe);
        saveSelection(safe);
      } else {
        const shop = await api.getTanks();
        setOwnedTanks(new Set());
        setTanks(shop.tanks);
        setShopEnabled(shop.enabled);
        const local = loadSelection();
        const safe = downgradeSelection(local, new Set());
        if (safe.tankSku !== local.tankSku || safe.decal !== local.decal) {
          saveSelection(safe);
        }
        setSelectionState(safe);
      }
    } catch {
      // network blip; keep current state
    }
  }, [accessToken]);

  useEffect(() => {
    if (lastTokenRef.current === accessToken && tanks.length > 0) return;
    lastTokenRef.current = accessToken;
    void refreshShop();
  }, [accessToken, tanks.length, refreshShop]);

  const setSelection = useCallback(
    (next: LoadoutSelection) => {
      const safe = downgradeSelection(sanitizeSelection(next), ownedTanks);
      setSelectionState(safe);
      saveSelection(safe);
      if (!accessToken) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api.saveLoadout(accessToken, safe).catch(() => {
          /* ignore — local save still happened */
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [ownedTanks, accessToken],
  );

  const buyTank = useCallback(
    async (sku: string): Promise<string> => {
      if (!accessToken) throw new Error("login required");
      const { url } = await api.checkout(accessToken, sku);
      return url;
    },
    [accessToken],
  );

  const loadout = useMemo(() => resolveSelection(selection), [selection]);

  const value = useMemo<ShopContextValue>(
    () => ({
      selection,
      loadout,
      ownedTanks,
      ownedDecals,
      tanks,
      shopEnabled,
      setSelection,
      refreshShop,
      buyTank,
    }),
    [
      selection,
      loadout,
      ownedTanks,
      ownedDecals,
      tanks,
      shopEnabled,
      setSelection,
      refreshShop,
      buyTank,
    ],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) {
    const fallbackSel = { ...DEFAULT_SELECTION };
    return {
      selection: fallbackSel,
      loadout: resolveSelection(fallbackSel),
      ownedTanks: new Set(),
      ownedDecals: decalsAvailable(new Set()),
      tanks: [],
      shopEnabled: true,
      setSelection: () => undefined,
      refreshShop: async () => undefined,
      buyTank: async () => {
        throw new Error("ShopProvider missing");
      },
    };
  }
  return ctx;
}
