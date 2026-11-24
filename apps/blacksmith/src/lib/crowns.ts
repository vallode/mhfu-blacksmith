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

/**
 * The Guild Card's crown groups (mhfu-extract's crown table): each is one
 * monster list entry, a base monster and its subspecies, whose records count
 * together. The card takes the largest and smallest size across a group.
 */
export const CROWN_GROUPS: readonly (readonly string[])[] = [
  ["Rathian", "Pink Rathian", "Gold Rathian"],
  ["Yian Kut-Ku", "Blue Yian Kut-Ku"],
  ["Cephadrome"],
  ["Rathalos", "Silver Rathalos", "Azure Rathalos"],
  ["Diablos", "Black Diablos"],
  ["Khezu", "Red Khezu"],
  ["Gravios", "Black Gravios"],
  ["Gypceros", "Purple Gypceros"],
  ["Plesioth", "Green Plesioth"],
  ["Basarios"],
  ["Monoblos", "White Monoblos"],
  ["Velocidrome"],
  ["Gendrome"],
  ["Iodrome"],
  ["Kirin"],
  ["Scarred Yian Garuga", "Yian Garuga"],
  ["Daimyo Hermitaur", "Plum D.Hermitaur"],
  ["Blangonga", "Copper Blangonga"],
  ["Congalala", "Emerald Congalala"],
  ["Rajang", "Furious Rajang"],
  ["Kushala Daora", "Rusted Kushala Daora"],
  ["Chameleos"],
  ["Lunastra"],
  ["Teostra"],
  ["Shogun Ceanataur", "Terra S.Ceanataur"],
  ["Bulldrome"],
  ["Tigrex"],
  ["Giadrome"],
  ["Nargacuga"],
  ["Hypnocatrice"],
  ["Lavasioth"],
];

/** The crown a size (percent) earns, or null. */
export function crownFor(size: number, crowns: Crowns): Crown | null {
  if (size <= crowns.mini) return "mini";
  if (size >= crowns.gold) return "gold";
  if (size >= crowns.silver) return "silver";
  return null;
}

/** A size in percent as the Guild Card shows it: the base size scaled. */
export function cardSize(size: number, baseSize: number): number {
  return (size * baseSize) / 100;
}

/**
 * A crown's cutoff as the Guild Card shows sizes, to a tenth,
 * rounded the safe way: gold and silver up, mini down. Every size at or past
 * the number shown then earns the crown (Giadrome's gold, 908.232, shows
 * as 908.3, not 908.2, which isn't gold).
 */
export function crownCutoff(crown: Crown, crowns: Crowns, baseSize: number): number {
  // toFixed drops the float noise in an exact tenth (1122.0000000001).
  const tenths = Number((cardSize(crowns[crown], baseSize) * 10).toFixed(6));
  return (crown === "mini" ? Math.floor(tenths) : Math.ceil(tenths)) / 10;
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
