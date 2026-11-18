/**
 * Builds the set builder's search data from the compact /data bundles. Pure,
 * so the tests can run it over the generated bundles too (see
 * test/helpers/set-data.ts); client-data.ts fetches the bundles.
 */
import type { ArmorRank, ArmorSlot } from "./constants";
import {
  decodeArmor,
  decodeDecoration,
  type ArmorBundle,
  type DecorationBundle,
  type Dictionaries,
} from "./schema";
import {
  prepareSearchData,
  type ArmorInput,
  type SearchData,
  type SkillTreeData,
} from "./set-search";

export function setSearchDataFromBundles(
  dict: Dictionaries,
  skills: SkillTreeData[],
  decoBundle: DecorationBundle,
  armorBundles: ArmorBundle[],
): SearchData {
  const armor: ArmorInput[] = armorBundles.flatMap((b) =>
    b.items.map((ca) => {
      const a = decodeArmor(dict, ca, b.slot);
      return {
        slot: b.slot as ArmorSlot,
        rank: b.rank as ArmorRank,
        name: a.name,
        slug: a.slug,
        defence: Number(a.defence ?? 0),
        res: ca.re,
        slots: a.slots,
        rarity: Number(a.rarity ?? 0) || undefined,
        minRank: a.min_rank,
        sex: a.sex,
        hunterType: a.hunter_type,
        skills: a.skills?.map((s) => ({ name: s.name, amount: Number(s.amount) })),
      };
    }),
  );
  const decorations = decoBundle.items.map((cd) => {
    const d = decodeDecoration(dict, cd);
    return { ...d, skills: d.skills ?? [], minRank: d.min_rank, itemId: cd.i };
  });
  return prepareSearchData(skills, armor, decorations);
}
