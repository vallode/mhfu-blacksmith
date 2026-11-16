/**
 * The Guild Card's awards, and how far the loaded hunter is towards each from
 * what the site reads from a save: cleared quests, and the hunt and size
 * records.
 *
 * Names are the EU disc's, in the game's own order (the award text table in
 * the disc's data). The disc's award descriptions aren't extracted yet, so the
 * rules here are the community's: an award they can't follow from a save
 * (farm, Felynes, treasure, collections) is `untracked`.
 *
 * Saves also carry the game's own award flags (`SaveData.awards`, one bit per
 * award in this order). With them, "earned" is what the game has given, and
 * the rules only show how far along the rest are. Saves stored before the
 * flags were read fall back to the rules alone.
 */
import { crownFor, type Crown, type Crowns } from "./crowns";
import { monsterRecordFor } from "./monster-ids";
import { questsOnHub, type Quest, type QuestHubSlug } from "./quests";
import type { SaveData } from "./save-store";

export type AwardGroup =
  "village" | "gathering" | "training" | "hunts" | "collection" | "farm" | "other";

export const AWARD_GROUPS: readonly AwardGroup[] = [
  "village",
  "gathering",
  "training",
  "hunts",
  "collection",
  "farm",
  "other",
];

/** Quests on boards, optionally narrowed to star levels, an ID range, or the urgent ones. */
export interface QuestSelection {
  hubs: readonly QuestHubSlug[];
  /** Inclusive, in the data's star numbers (G1 is 9 on the G Rank board). */
  stars?: readonly [number, number];
  /** Inclusive quest ID range. */
  ids?: readonly [number, number];
  urgent?: boolean;
}

export type AwardRule =
  /** Clear every quest of the selection. */
  | { kind: "quests"; select: QuestSelection }
  /** Hunt (slay or capture) the monster at least once. */
  | { kind: "hunt"; monster: string }
  /** A crown on every monster that has crown sizes. */
  | { kind: "crowns"; crown: Extract<Crown, "gold" | "mini"> }
  /** Not read from the save yet. */
  | { kind: "untracked" };

export interface Award {
  id: string;
  /** The award's name on the EU disc. */
  name: string;
  group: AwardGroup;
  rule: AwardRule;
}

const quests = (select: QuestSelection): AwardRule => ({ kind: "quests", select });
const hunt = (monster: string): AwardRule => ({ kind: "hunt", monster });
const untracked: AwardRule = { kind: "untracked" };
const VILLAGE: readonly QuestHubSlug[] = ["village"];
const GUILD: readonly QuestHubSlug[] = ["low-rank", "high-rank", "g-rank"];
const TRAINING: readonly QuestHubSlug[] = ["training-school"];

/** Every award, in the game's order. */
export const AWARDS: readonly Award[] = [
  {
    id: "chief-glove",
    name: "Village Chief's Glove",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [1, 2] }),
  },
  {
    id: "chief-hat",
    name: "Village Chief's Hat",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [3, 4] }),
  },
  {
    id: "chief-scarf",
    name: "Village Chief's Scarf",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [5, 6] }),
  },
  {
    id: "chief-coat",
    name: "Village Chief's Coat",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [1, 6] }),
  },
  { id: "mane-necklace", name: "Mane Necklace", group: "hunts", rule: hunt("Kirin") },
  { id: "blood-onyx", name: "Blood Onyx", group: "hunts", rule: hunt("Akantor") },
  {
    id: "kings-crown",
    name: "King's Crown",
    group: "hunts",
    rule: { kind: "crowns", crown: "gold" },
  },
  {
    id: "miniature-crown",
    name: "Miniature Crown",
    group: "hunts",
    rule: { kind: "crowns", crown: "mini" },
  },
  {
    id: "bronze-medal",
    name: "Bronze Medal",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [1, 2] }),
  },
  {
    id: "silver-medal",
    name: "Silver Medal",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [3, 5] }),
  },
  {
    id: "gold-medal",
    name: "Gold Medal",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [6, 8] }),
  },
  {
    id: "black-belt",
    name: "Black Belt Badge",
    group: "training",
    rule: quests({ hubs: TRAINING, ids: [20001, 20018] }),
  },
  {
    id: "expert-badge",
    name: "Expert Badge",
    group: "training",
    rule: quests({ hubs: TRAINING, ids: [21001, 21015] }),
  },
  {
    id: "legend-badge",
    name: "Legend Badge",
    group: "training",
    rule: quests({ hubs: TRAINING, ids: [22001, 22006] }),
  },
  { id: "rare-species", name: "Rare Species Report", group: "hunts", rule: untracked },
  { id: "ecology-report", name: "Ecology Research Report", group: "hunts", rule: untracked },
  { id: "azure-stone", name: "Azure Stone", group: "farm", rule: untracked },
  { id: "great-hornfly", name: "Great Hornfly", group: "farm", rule: untracked },
  { id: "springnight-carp", name: "Springnight Carp", group: "farm", rule: untracked },
  { id: "dosbiscus", name: "Dosbiscus", group: "farm", rule: untracked },
  { id: "grateful-letter", name: "Grateful Letter", group: "farm", rule: untracked },
  { id: "sages-bracelet", name: "Sage's Bracelet", group: "collection", rule: untracked },
  {
    id: "artisans-hammer",
    name: "Wyverian Artisan's Hammer",
    group: "collection",
    rule: untracked,
  },
  { id: "hunters-progress", name: "Hunter's Progress", group: "other", rule: untracked },
  {
    id: "nekoht-whiskers",
    name: "Nekoht's Whiskers",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [7, 7] }),
  },
  {
    id: "nekoht-bell",
    name: "Nekoht's Bell",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [8, 8] }),
  },
  {
    id: "nekoht-coat",
    name: "Nekoht's Coat",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [9, 9] }),
  },
  {
    id: "pokke-gourd",
    name: "Pokke Village Gourd",
    group: "village",
    rule: quests({ hubs: VILLAGE, urgent: true }),
  },
  {
    id: "orichalcum-shield",
    name: "Orichalcum Shield",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [9, 9] }),
  },
  {
    id: "platinum-shield",
    name: "Platinum Shield",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [10, 10] }),
  },
  {
    id: "gold-shield",
    name: "Gold Shield",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [11, 11] }),
  },
  {
    id: "supreme-crest",
    name: "Supreme Hunter's Crest",
    group: "gathering",
    rule: quests({ hubs: [...VILLAGE, ...GUILD] }),
  },
  { id: "igneous-ring", name: "Igneous Ring", group: "hunts", rule: hunt("Fatalis") },
  { id: "ring-of-fire", name: "Ring of Fire", group: "hunts", rule: hunt("Crimson Fatalis") },
  {
    id: "powder-white-crown",
    name: "Powder-White Crown",
    group: "hunts",
    rule: hunt("White Fatalis"),
  },
  { id: "gold-snowshoes", name: "Gold Snowshoes", group: "hunts", rule: hunt("Rajang") },
  { id: "ukanlos-bead", name: "Ukanlos Bead", group: "hunts", rule: hunt("Ukanlos") },
  { id: "epic-hunts", name: "Epic Hunts Armband", group: "other", rule: untracked },
  {
    id: "warriors-medal",
    name: "Warrior's Medal",
    group: "training",
    rule: quests({ hubs: TRAINING, ids: [21016, 21023] }),
  },
  { id: "guardians-award", name: "Guardian's Award", group: "other", rule: untracked },
  { id: "flower-bouquet", name: "Flower Bouquet from the Guild", group: "other", rule: untracked },
  { id: "adventurers-helm", name: "Adventurer's Helm", group: "collection", rule: untracked },
  { id: "trenyas-flag", name: "Trenya's Flag", group: "farm", rule: untracked },
  { id: "ultimate-catnip", name: "The Ultimate Catnip", group: "farm", rule: untracked },
  { id: "fearless-leader", name: "Letter to My Fearless Leader", group: "farm", rule: untracked },
  { id: "members-card", name: "Member's Card", group: "collection", rule: untracked },
  {
    id: "artisans-mitten",
    name: "Wyverian Artisan's Mitten",
    group: "collection",
    rule: untracked,
  },
  { id: "hunters-miracle", name: "Hunter's Miracle", group: "other", rule: untracked },
];

/** A monster for the crown awards: its name, type and crown sizes. */
export interface CrownMonster {
  name: string;
  slug: string;
  category: string;
  crowns?: Crowns;
}

/** What the progress of an award is worked out from. */
export interface AwardContext {
  save: SaveData | null;
  /** All quests (lib/quests), or null while they load. */
  quests: Quest[] | null;
  /** All monsters, or null while they load. */
  monsters: CrownMonster[] | null;
}

/** Something still to do for an award: a quest to clear or a monster to hunt. */
export type AwardTodo =
  { kind: "quest"; quest: Quest } | { kind: "monster"; monster: CrownMonster | { name: string } };

export type AwardProgress =
  /** Meets the rule. */
  | { status: "earned"; done: number; total: number }
  /** Part of the way: `todo` lists what's left. */
  | { status: "progress"; done: number; total: number; todo: AwardTodo[] }
  /** Not given by the game, and the rules can't show how far along it is. */
  | { status: "notEarned" }
  /** The save can't tell (untracked, or a save stored before the records were read). */
  | { status: "untracked" }
  /** Still loading the quests or monsters it needs. */
  | { status: "loading" };

/** The quests an award's selection covers. */
export function selectQuests(all: Quest[], select: QuestSelection): Quest[] {
  return select.hubs
    .flatMap((hub) => questsOnHub(all, hub))
    .filter(
      (q) =>
        (!select.stars || (q.stars >= select.stars[0] && q.stars <= select.stars[1])) &&
        (!select.ids || (q.id >= select.ids[0] && q.id <= select.ids[1])) &&
        (!select.urgent || q.urgent),
    );
}

function tally(done: number, total: number, todo: AwardTodo[]): AwardProgress {
  return done === total && total > 0
    ? { status: "earned", done, total }
    : { status: "progress", done, total, todo };
}

/**
 * How far the hunter is towards an award. With the save's award flags, the
 * game decides what's earned: a flagged award is earned whatever the rule
 * says, and an unflagged one never is, even when the rule is met (the game
 * may not have handed it over yet, or asks for more than the rule).
 */
export function awardProgress(award: Award, ctx: AwardContext): AwardProgress {
  const progress = ruleProgress(award, ctx);
  const given = ctx.save?.awards;
  if (!given) return progress;
  const total = "total" in progress ? progress.total : 1;
  if (given.includes(AWARDS.findIndex((a) => a.id === award.id))) {
    return { status: "earned", done: total, total };
  }
  switch (progress.status) {
    case "earned":
      return { ...progress, status: "progress", todo: [] };
    case "untracked":
      return { status: "notEarned" };
    default:
      return progress;
  }
}

/** How far the hunter is towards an award by its rule alone. */
function ruleProgress(award: Award, ctx: AwardContext): AwardProgress {
  const { save } = ctx;
  const rule = award.rule;
  switch (rule.kind) {
    case "untracked":
      return { status: "untracked" };
    case "quests": {
      if (!save?.clearedQuests) return { status: "untracked" };
      if (!ctx.quests) return { status: "loading" };
      const cleared = new Set(save.clearedQuests);
      const all = selectQuests(ctx.quests, rule.select);
      const left = all.filter((q) => !cleared.has(q.id));
      return tally(
        all.length - left.length,
        all.length,
        left.map((quest) => ({ kind: "quest", quest })),
      );
    }
    case "hunt": {
      const record = monsterRecordFor(save?.monsters, rule.monster);
      if (!record) return { status: "untracked" };
      const hunted = record.kills + record.captures > 0;
      return tally(
        hunted ? 1 : 0,
        1,
        hunted ? [] : [{ kind: "monster", monster: { name: rule.monster } }],
      );
    }
    case "crowns": {
      if (!save?.monsters) return { status: "untracked" };
      if (!ctx.monsters) return { status: "loading" };
      // Monsters with crown sizes that the Guild Card keeps records for.
      const withCrowns = ctx.monsters.filter(
        (m) => m.crowns && monsterRecordFor(save.monsters, m.name),
      );
      const left = withCrowns.filter((m) => {
        const record = monsterRecordFor(save.monsters, m.name)!;
        const size = rule.crown === "gold" ? record.largest : record.smallest;
        return size === 0 || crownFor(size, m.crowns!) !== rule.crown;
      });
      return tally(
        withCrowns.length - left.length,
        withCrowns.length,
        left.map((monster) => ({ kind: "monster", monster })),
      );
    }
  }
}

/** Earned and tracked awards: the count the Awards page and its list row show. */
export function awardTotals(ctx: AwardContext): { earned: number; tracked: number } {
  let earned = 0;
  let tracked = 0;
  for (const award of AWARDS) {
    const p = awardProgress(award, ctx);
    if (p.status === "untracked") continue;
    tracked++;
    if (p.status === "earned") earned++;
  }
  return { earned, tracked };
}
