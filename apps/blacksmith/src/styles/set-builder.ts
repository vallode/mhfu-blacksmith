// Class strings shared by the set builder's search, results and sheets
// (src/app/set-builder).

/** A pressable row: green glow on hover, focus and press, like the site's lists. */
export const pressable =
  "cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-[inherit] hover:hover-glow focus-visible:hover-glow focus-visible:outline-none active:hover-glow";

/** A result's weapon or piece row, and a weapon suggestion's: icon, name over details, slots. */
export const resultRow =
  "grid min-h-[5.2rem] w-full grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-x-[1rem] border-b border-white/10 px-[0.6rem] py-[0.6rem]";

/** A small framed chip (chosen skills, sorts, locked pieces). */
export const chip =
  "inline-flex min-h-[3.6rem] flex-none cursor-pointer items-center gap-[0.6rem] border-2 px-[1rem] font-[inherit] text-small leading-none shadow-[0.2rem_0.2rem_0_black] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
export const chipOn = "border-stat bg-stat/20 text-stat";
export const chipOff = "border-white/25 bg-black/40 text-white/75 hover:border-stat/60";

/** The big button of the search bar and the sheets (Search, Always use). */
export const primaryButton =
  "flex min-h-[4.8rem] flex-1 cursor-pointer items-center justify-center gap-[1rem] border-2 border-stat bg-accent px-[1.6rem] font-[inherit] text-sub text-white shadow-[0.2rem_0.2rem_0_black] text-shadow-[0.15rem_0.15rem_black] enabled:hover:hover-glow disabled:cursor-default disabled:border-white/25 disabled:bg-line disabled:text-white/40";

/** The smaller button beside it (Cancel, Never use). */
export const secondaryButton =
  "flex min-h-[4.8rem] flex-none cursor-pointer items-center justify-center border-2 border-white/30 bg-line px-[1.6rem] font-[inherit] text-small text-white/75 shadow-[0.2rem_0.2rem_0_black] hover:border-white/60";
