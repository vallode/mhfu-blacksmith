// Class strings for the settings cards on the Options page
// (PreferencesSettings, SaveSyncSettings, OfflineSettings).

/** Passed to <Card className>. Repeats the size under `mobile:` because Card
 * sets its own `mobile:` size, which cn() only replaces with another
 * `mobile:` class. `flex-none` keeps each card its natural height (Card is
 * `flex-1`), so a long card scrolls the page instead of being clipped. */
export const section = "flex flex-none flex-col gap-[1.3rem] text-[1.6rem] mobile:text-[1.6rem]";

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

/** Destructive/secondary action: muted until hovered, then red; dimmed further while disabled. */
export const buttonSecondary = [
  buttonBase,
  "border-white/30 text-white/50",
  "enabled:hover:border-negative enabled:hover:text-negative enabled:focus-visible:border-negative enabled:focus-visible:text-negative",
  "disabled:cursor-default disabled:opacity-60",
].join(" ");

/** A preference row: label and note on the left, its choices on the right (below on a phone or when they don't fit). */
export const preferenceRow =
  "flex flex-wrap items-center justify-between gap-x-[2.4rem] gap-y-[0.8rem]";

/** Group heading inside the preferences card ("Display", "Hunter"). */
export const subheading = "m-0 text-[1.5rem] font-normal tracking-[0.1ch] text-stat uppercase";

/** One option in a preference's choice group: add `choiceIdle` or `choiceSelected`. */
export const choice = [
  buttonBase,
  "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white",
].join(" ");

/** An option that isn't chosen: muted, glowing on hover. */
export const choiceIdle =
  "border-white/30 text-white/50 hover:text-white hover:hover-glow focus-visible:text-white";

/** The chosen option: the steady green highlight of a selected row. */
export const choiceSelected = "border-hr text-white [background:var(--gradient-hover-glow)]";
