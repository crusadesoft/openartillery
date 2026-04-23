import { ButtonHTMLAttributes } from "react";
import { Sound } from "../game/audio/Sound";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  sfx?: string;
};

/**
 * Button wrapper that plays a short UI blip on click. Sound init is lazy
 * (Howler requires a user gesture), so we initialize on first click and
 * then every click thereafter plays the effect.
 */
export function SfxButton(props: Props): JSX.Element {
  const { sfx = "ui_click", onClick, ...rest } = props;
  return (
    <button
      {...rest}
      onClick={(e) => {
        try {
          Sound.init();
          Sound.play(sfx);
        } catch {
          /* ignore if audio context not available */
        }
        onClick?.(e);
      }}
    />
  );
}
