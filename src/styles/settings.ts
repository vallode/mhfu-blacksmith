// Class strings for the settings cards on the Options page
// (SaveSyncSettings, OfflineSettings, RankSettings).

/** Passed to <Card className>. Repeats the size under `mobile:` because Card
 * sets its own `mobile:` size, which cn() only replaces with another
 * `mobile:` class. `flex-none` stops Card's `flex-1` from squeezing the cards
 * to equal heights and clipping their content. */
export const section = "flex-none flex flex-col gap-[1.3rem] text-[1.6rem] mobile:text-[1.6rem]";

export const heading =
  "m-0 text-[1.8rem] tracking-[0.1ch] text-parchment uppercase text-shadow-[0.15rem_0.15rem_black]";

/** Explanatory text; wraps, unlike the one-line card paragraph default. */
export const note = "m-0 text-[1.4rem] leading-[1.4] whitespace-normal text-white/60";

export const error = "m-0 text-[1.4rem] text-negative";

export const status = "flex flex-col gap-[0.6rem]";

export const statusLabel = "text-[1.6rem] text-white";

export { progressBar as progress } from "./progress";

export const actions = "flex flex-wrap gap-[0.8rem]";

const buttonBase =
  "cursor-pointer border bg-transparent px-[1.4rem] py-[0.6rem] font-[inherit] text-[1.5rem]";

/** Main action: green glow on hover/focus, dimmed while disabled. */
export const button = [
  buttonBase,
  "border-hr text-white/85",
  "enabled:hover:text-white enabled:hover:hover-glow enabled:focus-visible:text-white enabled:focus-visible:hover-glow",
  "disabled:cursor-default disabled:opacity-60",
].join(" ");

/** Destructive/secondary action: muted until hovered, then red. */
export const buttonSecondary = [
  buttonBase,
  "border-white/30 text-white/50",
  "hover:border-negative hover:text-negative focus-visible:border-negative focus-visible:text-negative",
].join(" ");

/** Native dropdown, drawn to match the buttons. */
export const select = [
  "cursor-pointer border border-hr bg-black/40 px-[1.4rem] py-[0.6rem] font-[inherit] text-[1.5rem] text-white/85",
  "hover:text-white focus-visible:text-white",
].join(" ");
