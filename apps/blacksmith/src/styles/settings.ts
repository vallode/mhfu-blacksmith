// Class strings for the settings cards on the Options page
// (SettingsCard, PreferencesSettings, SaveSyncSettings, OfflineSettings).

/** Passed to <Card className>. `flex-none` keeps each card its natural
 * height (Card is `flex-1`), so a long card scrolls the page instead of being
 * clipped. */
export const section = "flex-none text-small";

/** Passed to <Card bodyClassName>: the space between the card's rows. */
export const sectionBody = "gap-[1.3rem]";

/** Explanatory text; wraps, unlike the one-line card paragraph default. */
export const note = "m-0 text-fine leading-[1.4] whitespace-normal text-white/60";

export const error = "m-0 text-fine text-negative";

export const status = "flex flex-col gap-[0.6rem]";

export const statusLabel = "text-small text-white";

export { progressBar as progress } from "./progress";

export const actions = "flex flex-wrap gap-[0.8rem]";

const buttonBase =
  "cursor-pointer border bg-transparent px-[1.4rem] py-[0.6rem] font-[inherit] text-small";

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

/**
 * Card header in the style of the game's Options menu: yellow title on the
 * flat grey selector bar, with a light rule under it. Made for the teal
 * frame (`<Card frame="teal">`, as on the game's menus): the negative margins
 * pull it out to sit just inside the frame's 18px bands.
 */
export const menuHeader =
  "-mx-[0.8rem] -mt-[1.1rem] mb-[0.4rem] border-b-[3px] border-white/45 bg-selector px-[1.6rem] py-[0.8rem]";

export const menuTitle =
  "m-0 text-main font-normal tracking-[0.2em] text-stat uppercase text-shadow-[0.15rem_0.15rem_black]";

/** An On/Off preference: a yellow box, outlined when off and filled when on. */
export const toggle =
  "size-[2.6rem] flex-none cursor-pointer border-[3px] border-stat p-0 shadow-[0.2rem_0.2rem_0_black] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white";

export const toggleOn = "bg-stat";

export const toggleOff = "bg-transparent hover:bg-stat/25";

/** A preference row: label and note on the left, its control on the right (below when it doesn't fit). */
export const preferenceRow =
  "flex flex-wrap items-center justify-between gap-x-[2.4rem] gap-y-[0.8rem]";

/** Group heading inside the preferences card ("Display", "Hunter"). */
export const subheading = "m-0 text-small font-normal tracking-[0.1ch] text-stat uppercase";

/** "◀ VALUE ▶" selector for a preference with several values. */
export const selector = "flex flex-none items-center gap-[0.8rem]";

export const selectorArrow = "size-[3.4rem]";

/** Fixed width, so the arrows stay put as the value changes (fits "Within 1 material"). */
export const selectorValue =
  "w-[19rem] text-center text-sub leading-none tracking-[0.1em] text-stat uppercase text-shadow-[0.15rem_0.15rem_black]";

/** A text/search box (set builder's skill and piece search). */
export const searchInput =
  "w-full border border-hr bg-black/45 px-[1rem] py-[0.6rem] font-[inherit] text-small text-white outline-none placeholder:text-white/35 focus-visible:border-white";
