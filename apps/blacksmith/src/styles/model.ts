/**
 * The translucent panels over a 3D model: the hitzone switch and legend, the
 * motion controls. The line height is set so a button (whose own is tighter)
 * stands as tall as a panel of text beside it.
 */
export const modelPanel =
  "bg-black/50 px-[0.8rem] py-[0.4rem] text-small leading-normal mobile:text-fine";

/** A button in (or as) one of those panels; its colour is the caller's. */
export const modelPanelButton =
  "cursor-pointer tracking-game hover:text-white focus-visible:text-white";
