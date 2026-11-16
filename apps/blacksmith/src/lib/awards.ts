/**
 * The Guild Card's awards, and how far the loaded hunter is towards each from
 * what the site reads from a save: cleared quests, and the hunt and size
 * records.
 *
 * Awards are in the game's own order: an award's index in `AWARDS` is its
 * bit in the save and its ID in `data/awards.json`, which has its name and
 * the game's description of it (fetched as `/data/awards.json`). Each rule
 * is the condition the game checks before it hands the award over, read from
 * the EU EBOOT and overlays (`packages/mhfu-extract/docs/awards.md` has the
 * addresses). An award whose condition rests on save data the site doesn't
 * parse yet is `untracked`, with that data named beside it.
 *
 * Saves also carry the game's own award flags (`SaveData.awards`, one bit per
 * award in this order). With them, "earned" is what the game has given, and
 * the rules only show how far along the rest are. Saves stored before the
 * flags were read fall back to the rules alone.
 */
import { crownFor, type Crown, type Crowns } from "./crowns";
import { monsterRecordFor } from "./monster-ids";
import { questsOnHub, type Quest, type QuestHubSlug } from "./quests";
import type { MonsterRecord, SaveData } from "./save-store";

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

/**
 * Quests on boards, optionally narrowed to star levels, quest IDs, or the
 * urgent ones. The site's star levels match the game's own award lists
 * (one quest list per board and star level, at EU `0x089B1EBC` for the
 * Village and `0x089B1E90` for the Gathering Hall).
 */
export interface QuestSelection {
  hubs: readonly QuestHubSlug[];
  /** Inclusive, in the data's star numbers (G1 is 9 on the G Rank board). */
  stars?: readonly [number, number];
  /** Only these quests. */
  ids?: readonly number[];
  urgent?: boolean;
}

/** What a monster rule needs of each monster: hunted (slain or captured), or captured. */
export type MonsterNeed = "hunt" | "capture";

export type AwardRule =
  /** Clear every quest of the selection. */
  | { kind: "quests"; select: QuestSelection }
  /** Hunt (slay or capture), or capture, each of these monsters at least once. */
  | { kind: "monsters"; monsters: readonly string[]; need: MonsterNeed }
  /**
   * A crown on every crown group (`CROWN_GROUPS`): a monster or one of its
   * subspecies hunted, and the group's largest record at least its gold size
   * (`gold`), or its smallest at most its mini size (`mini`).
   */
  | { kind: "crowns"; crown: Extract<Crown, "gold" | "mini"> }
  /** Not read from the save yet. */
  | { kind: "untracked" };

export interface Award {
  /** The site's name for the award; its text is in `data/awards.json`, by index. */
  id: string;
  group: AwardGroup;
  rule: AwardRule;
}

const quests = (select: QuestSelection): AwardRule => ({ kind: "quests", select });
const hunt = (...monsters: string[]): AwardRule => ({ kind: "monsters", monsters, need: "hunt" });
const capture = (...monsters: string[]): AwardRule => ({
  kind: "monsters",
  monsters,
  need: "capture",
});
const untracked: AwardRule = { kind: "untracked" };
const VILLAGE: readonly QuestHubSlug[] = ["village"];
const GUILD: readonly QuestHubSlug[] = ["low-rank", "high-rank", "g-rank"];
const TRAINING: readonly QuestHubSlug[] = ["training-school"];

/** Quest IDs `from` to `to`, inclusive. */
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * The Epic Hunts Armband's quests (EU `0x0899CBC0`): the Village and
 * Gathering Hall's big hunts, Lao-Shan Lung to the Fatalis.
 */
const EPIC_HUNTS: readonly number[] = [
  11014,
  ...range(11112, 11115),
  ...range(11216, 11219),
  11226,
  ...range(2125, 2127),
  ...range(2233, 2236),
  ...range(3024, 3025),
  ...range(3123, 3126),
  ...range(3216, 3221),
];

/** The Rare Species Report's monsters (EU `0x089A8968`): hunt each one. */
const RARE_SPECIES: readonly string[] = [
  "Pink Rathian",
  "Blue Yian Kut-Ku",
  "Purple Gypceros",
  "Silver Rathalos",
  "Gold Rathian",
  "Black Diablos",
  "White Monoblos",
  "Red Khezu",
  "Green Plesioth",
  "Black Gravios",
  "Azure Rathalos",
  "Ash Lao-Shan Lung",
  "Copper Blangonga",
  "Emerald Congalala",
  "Plum D.Hermitaur",
  "Terra S.Ceanataur",
];

/** The Ecology Research Report's monsters (EU `0x089A898C`): capture each one. */
const ECOLOGY: readonly string[] = [
  "Rathian",
  "Yian Kut-Ku",
  "Cephadrome",
  "Rathalos",
  "Diablos",
  "Khezu",
  "Gravios",
  "Gypceros",
  "Plesioth",
  "Basarios",
  "Monoblos",
  "Velocidrome",
  "Gendrome",
  "Iodrome",
  "Pink Rathian",
  "Blue Yian Kut-Ku",
  "Purple Gypceros",
  "Scarred Yian Garuga",
  "Silver Rathalos",
  "Gold Rathian",
  "Black Diablos",
  "White Monoblos",
  "Red Khezu",
  "Green Plesioth",
  "Black Gravios",
  "Daimyo Hermitaur",
  "Azure Rathalos",
  "Blangonga",
  "Congalala",
  "Rajang",
  "Shogun Ceanataur",
  "Bulldrome",
  "Tigrex",
  "Giadrome",
  "Yian Garuga",
  "Nargacuga",
  "Hypnocatrice",
  "Lavasioth",
  "Copper Blangonga",
  "Emerald Congalala",
  "Plum D.Hermitaur",
  "Terra S.Ceanataur",
  "Furious Rajang",
];

/**
 * The crown awards' groups: the 31 crown table entries with crown sizes
 * (mhfu-extract `monsters/sizes.ts`), each the monster named first and the
 * subspecies that share its records (EU `0x0899BF40`). The game pools a
 * group's records: hunts are summed, the largest is the group's largest and
 * the smallest its smallest.
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

/**
 * Every award, in the game's order. Untracked awards name the save data
 * their condition needs, as offsets into a hunter's block of the save file
 * (the block `save-worker.js` reads the records from).
 */
export const AWARDS: readonly Award[] = [
  {
    id: "chief-glove",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [1, 2] }),
  },
  {
    id: "chief-hat",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [3, 4] }),
  },
  {
    id: "chief-scarf",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [5, 5] }),
  },
  {
    id: "chief-coat",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [1, 6] }),
  },
  { id: "mane-necklace", group: "hunts", rule: hunt("Kirin") },
  { id: "blood-onyx", group: "hunts", rule: hunt("Akantor") },
  {
    id: "kings-crown",
    group: "hunts",
    rule: { kind: "crowns", crown: "gold" },
  },
  {
    id: "miniature-crown",
    group: "hunts",
    rule: { kind: "crowns", crown: "mini" },
  },
  {
    id: "bronze-medal",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [1, 2] }),
  },
  {
    id: "silver-medal",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [3, 5] }),
  },
  {
    id: "gold-medal",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [6, 8] }),
  },
  // Training quests 21001-21010, each with all five of its weapon sets: the
  // per-set bits at 0x69234, bit (quest - 21001) * 5 + set.
  { id: "black-belt", group: "training", rule: untracked },
  // The same bits for 21011-21015.
  { id: "expert-badge", group: "training", rule: untracked },
  {
    id: "legend-badge",
    group: "training",
    rule: quests({ hubs: TRAINING, ids: range(22001, 22006) }),
  },
  { id: "rare-species", group: "hunts", rule: hunt(...RARE_SPECIES) },
  {
    id: "ecology-report",
    group: "hunts",
    rule: capture(...ECOLOGY),
  },
  // Pokke Farm's levels, bytes at 0x69D98: Mining Area (byte 2) at 4.
  { id: "azure-stone", group: "farm", rule: untracked },
  // Insect area (byte 3) at 4.
  { id: "great-hornfly", group: "farm", rule: untracked },
  // Fishing Pier (byte 1) at 2.
  { id: "springnight-carp", group: "farm", rule: untracked },
  // Field (byte 0) at 2.
  { id: "dosbiscus", group: "farm", rule: untracked },
  // Five Felyne chefs (0x6925C + i * 0x70) each with byte +3 at 9 or more.
  { id: "grateful-letter", group: "farm", rule: untracked },
  // All 172 combination recipes, the bitfield at 0x3FCC.
  { id: "sages-bracelet", group: "collection", rule: untracked },
  // Four of each of 11 weapon classes' listed weapons in the equipment box.
  {
    id: "artisans-hammer",
    group: "collection",
    rule: untracked,
  },
  // The game's code hunts each of Chameleos, Teostra, Lunastra, Shen Gaoren,
  // Lao-Shan Lung and Akantor 50 times (records pooled with subspecies),
  // not what the description says; not confirmed in an emulator.
  { id: "hunters-progress", group: "other", rule: untracked },
  {
    id: "nekoht-whiskers",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [7, 7] }),
  },
  {
    id: "nekoht-bell",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [8, 8] }),
  },
  {
    id: "nekoht-coat",
    group: "village",
    rule: quests({ hubs: VILLAGE, stars: [9, 9] }),
  },
  // Given at the end of "Rise to the Summit" (Akantor), the last urgent quest.
  {
    id: "pokke-gourd",
    group: "village",
    rule: quests({ hubs: VILLAGE, ids: [11225] }),
  },
  {
    id: "orichalcum-shield",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [9, 9] }),
  },
  {
    id: "platinum-shield",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [10, 10] }),
  },
  {
    id: "gold-shield",
    group: "gathering",
    rule: quests({ hubs: GUILD, stars: [11, 11] }),
  },
  {
    id: "supreme-crest",
    group: "gathering",
    rule: quests({ hubs: [...VILLAGE, ...GUILD] }),
  },
  // The three Fatalis rings are given at the end of their G Rank quest, when
  // the hunter slew the monster there; High Rank Fatalis quests don't count.
  {
    id: "igneous-ring",
    group: "hunts",
    rule: quests({ hubs: GUILD, ids: [3230] }),
  },
  {
    id: "ring-of-fire",
    group: "hunts",
    rule: quests({ hubs: GUILD, ids: [3231] }),
  },
  {
    id: "powder-white-crown",
    group: "hunts",
    rule: quests({ hubs: GUILD, ids: [3232] }),
  },
  // Given at the end of "Child of Destruction" (Furious Rajang).
  {
    id: "gold-snowshoes",
    group: "hunts",
    rule: quests({ hubs: GUILD, ids: [3212] }),
  },
  { id: "ukanlos-bead", group: "hunts", rule: hunt("Ukanlos") },
  {
    id: "epic-hunts",
    group: "other",
    rule: quests({ hubs: [...VILLAGE, ...GUILD], ids: EPIC_HUNTS }),
  },
  // The training bits (as the Black Belt Badge's) for 21016-21023.
  { id: "warriors-medal", group: "training", rule: untracked },
  // 20 quests each in the Fortress and the Town: the map counters at 0x6A09C, bytes 12 and 13.
  { id: "guardians-award", group: "other", rule: untracked },
  // 1,000,000 Guild Points, the u32 at 0x6924C.
  { id: "flower-bouquet", group: "other", rule: untracked },
  // All 35 gold-crown treasures (0x67358, the u32 then 3 bits) and each
  // Treasure Hunt's best score (7 u32s at 0x67360) at its mark.
  { id: "adventurers-helm", group: "collection", rule: untracked },
  // Trenya's top trip paid for 100 times, the byte at 0x6A909.
  { id: "trenyas-flag", group: "farm", rule: untracked },
  // A Felyne Comrade of your own (13 at 0x6974C + i * 0x70) with all 36 skills.
  { id: "ultimate-catnip", group: "farm", rule: untracked },
  // Five Felyne Comrades at full fondness (s16 +0x2A at 7000).
  { id: "fearless-leader", group: "farm", rule: untracked },
  // 50 special weapons forged: the bits in 9 u32s at 0x6A90C.
  { id: "members-card", group: "collection", rule: untracked },
  // Five rare (8+) pieces of each armor slot in the equipment box.
  {
    id: "artisans-mitten",
    group: "collection",
    rule: untracked,
  },
  // 20 quests each in the Great Forest and the four Old maps (the map
  // counters, bytes 7 to 11), and the Hunter's Progress.
  { id: "hunters-miracle", group: "other", rule: untracked },
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
  const ids = select.ids && new Set(select.ids);
  return select.hubs
    .flatMap((hub) => questsOnHub(all, hub))
    .filter(
      (q) =>
        (!select.stars || (q.stars >= select.stars[0] && q.stars <= select.stars[1])) &&
        (!ids || ids.has(q.id)) &&
        (!select.urgent || q.urgent),
    );
}

function tally(done: number, total: number, todo: AwardTodo[]): AwardProgress {
  return done === total && total > 0
    ? { status: "earned", done, total }
    : { status: "progress", done, total, todo };
}

/** The monster's page when the monsters have loaded, else just its name. */
function monsterTodo(ctx: AwardContext, name: string): AwardTodo {
  return { kind: "monster", monster: ctx.monsters?.find((m) => m.name === name) ?? { name } };
}

/** A crown group's records pooled as the game pools them, or null without records. */
function groupRecord(
  monsters: readonly MonsterRecord[] | undefined,
  group: readonly string[],
): { hunts: number; largest: number; smallest: number } | null {
  const records = group.map((name) => monsterRecordFor(monsters, name));
  if (records.some((r) => !r)) return null;
  const all = records as MonsterRecord[];
  const smallest = all.map((r) => r.smallest).filter((s) => s > 0);
  return {
    hunts: all.reduce((n, r) => n + r.kills + r.captures, 0),
    largest: Math.max(...all.map((r) => r.largest)),
    smallest: smallest.length ? Math.min(...smallest) : 0,
  };
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
    case "monsters": {
      if (!save?.monsters) return { status: "untracked" };
      const left: string[] = [];
      for (const name of rule.monsters) {
        const record = monsterRecordFor(save.monsters, name);
        if (!record) return { status: "untracked" };
        const done =
          rule.need === "capture" ? record.captures > 0 : record.kills + record.captures > 0;
        if (!done) left.push(name);
      }
      return tally(
        rule.monsters.length - left.length,
        rule.monsters.length,
        left.map((name) => monsterTodo(ctx, name)),
      );
    }
    case "crowns": {
      if (!save?.monsters) return { status: "untracked" };
      if (!ctx.monsters) return { status: "loading" };
      const sizes = new Map(ctx.monsters.map((m) => [m.name, m.crowns]));
      let total = 0;
      const left: string[] = [];
      for (const group of CROWN_GROUPS) {
        // The group's crown sizes, from whichever of its monsters the data has them for.
        const crowns = group.map((name) => sizes.get(name)).find((c) => c);
        const record = groupRecord(save.monsters, group);
        if (!crowns || !record) continue;
        total++;
        const size = rule.crown === "gold" ? record.largest : record.smallest;
        const done = record.hunts > 0 && size > 0 && crownFor(size, crowns) === rule.crown;
        if (!done) left.push(group[0]!);
      }
      return tally(
        total - left.length,
        total,
        left.map((name) => monsterTodo(ctx, name)),
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
