import type { WeaponId } from "@artillery/shared";

interface Props {
  weapon: WeaponId;
  size?: number;
  color?: string;
}

const ICON_FILE: Record<WeaponId, string> = {
  shell:     "/icons/weapons/shell.svg",
  heavy:     "/icons/weapons/heavy.svg",
  cluster:   "/icons/weapons/cluster.svg",
  grenade:   "/icons/weapons/grenade.svg",
  napalm:    "/icons/weapons/napalm.svg",
  airstrike: "/icons/weapons/airstrike.svg",
  mirv:      "/icons/weapons/mirv.svg",
  skipper:   "/icons/weapons/skipper.svg",
  dirt:      "/icons/weapons/dirt.svg",
};

/**
 * game-icons.net artwork (CC-BY 3.0 by lorc / delapouite), rendered as a
 * CSS mask so we can tint any icon with the weapon's accent color.
 */
export function WeaponIcon({ weapon, size = 22, color }: Props): JSX.Element {
  const c = color ?? "currentColor";
  const url = ICON_FILE[weapon];
  return (
    <span
      className="icon-mask"
      style={{
        width: size,
        height: size,
        background: c,
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        display: "inline-block",
      }}
      aria-label={weapon}
    />
  );
}
