import type { ItemId } from "@artillery/shared";

interface Props {
  item: ItemId;
  size?: number;
  color?: string;
}

const ICON_FILE: Record<ItemId, string> = {
  jetpack:  "/icons/items/jetpack.svg",
  teleport: "/icons/items/teleport.svg",
  shield:   "/icons/items/shield.svg",
  repair:   "/icons/items/repair.svg",
};

export function ItemIcon({ item, size = 22, color }: Props): JSX.Element {
  const c = color ?? "currentColor";
  const url = ICON_FILE[item];
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
      aria-label={item}
    />
  );
}
