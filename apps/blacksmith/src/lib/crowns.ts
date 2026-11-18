/**
 * Guild Card crowns (mhfu-extract `monsters/sizes.ts`). Sizes are percents
 * of a monster's base size: the game rolls them per quest and keeps the
 * hunter's largest and smallest in the save. A record at most `mini` is a
 * mini crown, at least `gold` a gold crown, at least `silver` a silver one.
 */

export type Crown = "mini" | "silver" | "gold";

/** Crown thresholds, in percent of the monster's base size. */
export type Crowns = Record<Crown, number>;

/** Crowns in the order the Guild Card ranks them. */
export const CROWN_ORDER: readonly Crown[] = ["gold", "silver", "mini"];

/** The crown a size (percent) earns, or null. */
export function crownFor(size: number, crowns: Crowns): Crown | null {
  if (size <= crowns.mini) return "mini";
  if (size >= crowns.gold) return "gold";
  if (size >= crowns.silver) return "silver";
  return null;
}

/** A size in percent as the Guild Card's centimetres. */
export function sizeInCm(size: number, baseSize: number): number {
  return (size * baseSize) / 100;
}

/**
 * A chance (0-1) as a percent to a tenth, for display: 8.2, or 0.1 with
 * `below` for a chance under that.
 */
export function chancePercent(chance: number): { percent: number; below: boolean } {
  const percent = chance * 100;
  if (percent >= 99.95) return { percent: 100, below: false };
  if (percent < 0.05) return { percent: 0.1, below: true };
  return { percent: Math.round(percent * 10) / 10, below: false };
}

/** A chance (0-1) as a short percent: "8.2%", "<0.1%". */
export function formatChance(chance: number): string {
  const { percent, below } = chancePercent(chance);
  return `${below ? "<" : ""}${percent}%`;
}

/** The crowns any of these chances can give, gold first. */
export function possibleCrowns(chances: readonly Record<Crown, number>[]): Crown[] {
  return CROWN_ORDER.filter((crown) => chances.some((c) => c[crown] > 0));
}
