/**
 * The Guild Card's crowns as the hunter's save has them. The card groups a
 * base monster with its subspecies (`CROWN_GROUPS`): their hunts are summed,
 * and the group's largest and smallest records are the best across all of
 * them (mhfu-extract's crown table).
 */
import { CROWN_GROUPS, cardSize, crownCutoff, crownFor, type Crown, type Crowns } from "./crowns";
import { monsterRecordFor } from "./monster-ids";
import type { MonsterRecord } from "./save-store";

/** A crown group's monster, as the site knows it. */
export interface CrownGroupMonster {
  name: string;
  slug: string;
  category: string;
  /** The crown thresholds, from the monster data. */
  crowns?: Crowns;
  /** The game's base size, from the monster data. */
  baseSize?: number;
}

/** One of the Guild Card's crown groups, with the hunter's pooled records. */
export interface CrownGroupProgress {
  /** The group's monsters, base first (CROWN_GROUPS order). */
  names: readonly string[];
  /** The group's monsters the site has loaded, for names and links. */
  monsters: readonly CrownGroupMonster[];
  /** Kills and captures across the group, as the card counts them. */
  hunts: number;
  /** The group's largest and smallest records, in percent of base size; 0 with none. */
  largest: number;
  smallest: number;
  /** The largest and smallest as the Guild Card shows them, or null without a base size. */
  largestSize: number | null;
  smallestSize: number | null;
  /** The crown each record earns, or null. */
  largestCrown: Crown | null;
  smallestCrown: Crown | null;
  /** The gold and mini cutoffs as the Guild Card shows them, or null without a base size. */
  cutoffs: { gold: number; mini: number } | null;
}

export interface CrownProgress {
  /** Every crown group, in the card's order. */
  groups: readonly CrownGroupProgress[];
  /** Groups whose largest record earns a gold crown. */
  gold: number;
  /** Groups whose smallest record earns a mini crown. */
  mini: number;
}

/**
 * The hunter's crown groups from their monster records and the site's
 * monster list. Groups keep the card's order even before the monsters load,
 * with no sizes or cutoffs until they do.
 */
export function crownProgress(
  records: readonly MonsterRecord[],
  monsters: readonly CrownGroupMonster[],
): CrownProgress {
  const byName = new Map(monsters.map((monster) => [monster.name, monster]));
  const groups = CROWN_GROUPS.map((names): CrownGroupProgress => {
    const members = names.flatMap((name) => byName.get(name) ?? []);
    const crowns = members.find((monster) => monster.crowns)?.crowns;
    const baseSize = members.find((monster) => monster.baseSize)?.baseSize;
    const pooled = names.flatMap((name) => monsterRecordFor(records, name) ?? []);
    const largest = pooled.reduce((size, record) => Math.max(size, record.largest), 0);
    const smallest = pooled.reduce(
      (size, record) =>
        record.smallest > 0 && (size === 0 || record.smallest < size) ? record.smallest : size,
      0,
    );
    const scale = baseSize !== undefined && baseSize > 0 ? baseSize : null;
    return {
      names,
      monsters: members,
      hunts: pooled.reduce((n, record) => n + record.kills + record.captures, 0),
      largest,
      smallest,
      largestSize: scale !== null && largest > 0 ? cardSize(largest, scale) : null,
      smallestSize: scale !== null && smallest > 0 ? cardSize(smallest, scale) : null,
      largestCrown: crowns && largest > 0 ? crownFor(largest, crowns) : null,
      smallestCrown: crowns && smallest > 0 ? crownFor(smallest, crowns) : null,
      cutoffs:
        crowns && scale !== null
          ? {
              gold: crownCutoff("gold", crowns, scale),
              mini: crownCutoff("mini", crowns, scale),
            }
          : null,
    };
  });
  return {
    groups,
    gold: groups.filter((group) => group.largestCrown === "gold").length,
    mini: groups.filter((group) => group.smallestCrown === "mini").length,
  };
}
