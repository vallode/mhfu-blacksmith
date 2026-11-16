/**
 * The Guild Card's awards, and how far the loaded hunter is towards each from
 * what the site reads from a save: cleared quests, the hunt and size records,
 * the equipment box, and the other records the conditions read
 * (`AwardRecords`: training, the farm, Felynes, treasures, map counters...).
 *
 * Awards are in the game's own order: an award's index in `AWARDS` is its
 * bit in the save and its ID in `data/awards.json`, which has its name and
 * the game's description of it (fetched as `/data/awards.json`). Each rule
 * is the condition the game checks before it hands the award over, read from
 * the EU EBOOT and overlays (`packages/mhfu-extract/docs/awards.md` has the
 * addresses). An award whose condition the site can't follow yet is
 * `untracked`, with the reason beside it.
 *
 * Saves also carry the game's own award flags (`SaveData.awards`, one bit per
 * award in this order). With them, "earned" is what the game has given, and
 * the rules only show how far along the rest are. Saves stored before the
 * flags were read fall back to the rules alone.
 */
import { ARTISAN_WEAPONS } from "./award-weapons";
import { crownFor, type Crown, type Crowns } from "./crowns";
import { monsterRecordFor } from "./monster-ids";
import { questsOnHub, type Quest, type QuestHubSlug } from "./quests";
import type { MonsterRecord, SaveData } from "./save-store";
import type { EquipmentIds } from "./schema";

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
  /**
   * Counted from the save's other records (`AwardRecords`, the equipment
   * box): null when the save doesn't have them.
   */
  | { kind: "records"; tally: (save: SaveData, ctx: AwardContext) => Tally | null }
  /** The site can't follow the condition (the reason is beside the award). */
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
const records = (tally: (save: SaveData, ctx: AwardContext) => Tally | null): AwardRule => ({
  kind: "records",
  tally,
});
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

/** `n` of `max`: a count the game checks against a mark, capped there. */
const upTo = (n: number, max: number): Count => ({ done: Math.min(n, max), total: max });

/** The site's quests of these IDs, as things still to do. */
function questTodos(all: Quest[], hubs: readonly QuestHubSlug[], ids: number[]): AwardTodo[] {
  return selectQuests(all, { hubs, ids }).map((quest) => ({ kind: "quest", quest }));
}

/** The weapon sets each Training School quest has (`trainingSets` has a bit for each). */
const WEAPON_SETS = 5;

/** The Artisan's Hammer's weapon class of each listed weapon, by `type:id`. */
const ARTISAN_CLASS = new Map(
  ARTISAN_WEAPONS.flatMap(([type, ids], weaponClass) =>
    ids.map((id) => [`${type}:${id}`, weaponClass] as const),
  ),
);

/**
 * Training quests `from` to `to`, each cleared with every one of its weapon
 * sets (EU `0x08857058` reads the bits).
 */
function trainingSets(from: number, to: number): AwardRule {
  return records((save, ctx) => {
    if (!save.trainingSets) return null;
    if (!ctx.quests) return "loading";
    const bits = new Set(save.trainingSets);
    const ids = range(from, to);
    const allSets = (id: number) => {
      for (let set = 0; set < WEAPON_SETS; set++) {
        if (!bits.has((id - 21001) * WEAPON_SETS + set)) return false;
      }
      return true;
    };
    const left = ids.filter((id) => !allSets(id));
    return {
      done: ids.length - left.length,
      total: ids.length,
      todo: questTodos(ctx.quests, TRAINING, left),
    };
  });
}

/** A Pokke Farm area (its byte in `farm`) at `level`. */
const farm = (area: number, level: number): AwardRule =>
  records((save) => (save.farm ? upTo(save.farm[area] ?? 0, level) : null));

/** The Treasure Hunts' marks for the Adventurer's Helm (EU `0x089A894C`), quests 4001-4007. */
const TREASURE_MARKS = [30000, 35000, 35000, 40000, 40000, 45000, 50000];
const GOLD_TREASURES = 35;

/** Maps (by `mapQuests` index) and the quests the Hunter's Miracle needs on each. */
const MIRACLE_MAPS = [7, 8, 9, 10, 11];
const MAP_QUESTS = 20;

/**
 * Every award, in the game's order. The save data each condition reads is in
 * `packages/mhfu-extract/docs/awards.md`; an untracked award says why beside
 * it.
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
  // Training quests 21001-21010, each cleared with all five of its weapon sets.
  { id: "black-belt", group: "training", rule: trainingSets(21001, 21010) },
  { id: "expert-badge", group: "training", rule: trainingSets(21011, 21015) },
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
  // Pokke Farm's upgrades, given on buying the last one (lobby_task
  // 0x09A65578): the Mining Area to level 4.
  { id: "azure-stone", group: "farm", rule: farm(2, 4) },
  // The Insect area to 4.
  { id: "great-hornfly", group: "farm", rule: farm(3, 4) },
  // The Fishing Pier to 2.
  { id: "springnight-carp", group: "farm", rule: farm(1, 2) },
  // The Field to 2.
  { id: "dosbiscus", group: "farm", rule: farm(0, 2) },
  // All five Felyne Chefs hired, each at level 9 or more.
  {
    id: "grateful-letter",
    group: "farm",
    rule: records(({ felyneChefs: chefs }) =>
      chefs ? { done: chefs.filter((level) => level >= 9).length, total: 5 } : null,
    ),
  },
  // All 172 combination recipes known.
  {
    id: "sages-bracelet",
    group: "collection",
    rule: records(({ recipes }) => (recipes === undefined ? null : upTo(recipes, 172))),
  },
  // Four weapons from each of eleven classes' lists in the equipment box
  // (each box slot counts, so two of one weapon are two).
  {
    id: "artisans-hammer",
    group: "collection",
    rule: records(({ equipment }) => {
      if (!equipment) return null;
      const held = ARTISAN_WEAPONS.map(() => 0);
      for (const s of equipment) {
        const weaponClass = ARTISAN_CLASS.get(`${s.type}:${s.id}`);
        if (weaponClass !== undefined) held[weaponClass]!++;
      }
      return { done: held.filter((n) => n >= 4).length, total: ARTISAN_WEAPONS.length };
    }),
  },
  // The game's code hunts each of Chameleos, Teostra, Lunastra, Shen Gaoren,
  // Lao-Shan Lung and Akantor 50 times (records pooled with subspecies),
  // not what the description says; not confirmed in an emulator, so left
  // untracked.
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
  // Training quests 21016-21023 with every weapon set.
  { id: "warriors-medal", group: "training", rule: trainingSets(21016, 21023) },
  // 20 quests each in the Fortress and the Town.
  {
    id: "guardians-award",
    group: "other",
    rule: records(({ mapQuests: maps }) => {
      if (!maps) return null;
      const fortress = upTo(maps[12] ?? 0, MAP_QUESTS);
      const town = upTo(maps[13] ?? 0, MAP_QUESTS);
      return { done: fortress.done + town.done, total: fortress.total + town.total };
    }),
  },
  // 1,000,000 Guild Points.
  {
    id: "flower-bouquet",
    group: "other",
    rule: records(({ guildPoints }) =>
      guildPoints === undefined ? null : upTo(guildPoints, 1_000_000),
    ),
  },
  // All 35 gold-crown treasures, and each Treasure Hunt's best score at its
  // mark; what's left lists the hunts short of theirs.
  {
    id: "adventurers-helm",
    group: "collection",
    rule: records(({ goldTreasures, treasureScores: scores }, ctx) => {
      if (goldTreasures === undefined || !scores) return null;
      if (!ctx.quests) return "loading";
      const short = TREASURE_MARKS.flatMap((mark, i) =>
        (scores[i] ?? 0) >= mark ? [] : [4001 + i],
      );
      return {
        done: Math.min(goldTreasures, GOLD_TREASURES) + TREASURE_MARKS.length - short.length,
        total: GOLD_TREASURES + TREASURE_MARKS.length,
        todo: questTodos(ctx.quests, ["treasure-hunting"], short),
      };
    }),
  },
  // Trenya's most expensive trip paid for 100 times.
  {
    id: "trenyas-flag",
    group: "farm",
    rule: records(({ trenyaTrips }) => (trenyaTrips === undefined ? null : upTo(trenyaTrips, 100))),
  },
  // A Felyne Comrade the hunter raised (its owner is the hunter's Guild Card
  // name) with all 36 skills: the closest one's count.
  {
    id: "ultimate-catnip",
    group: "farm",
    rule: records(({ comrades }) =>
      comrades
        ? upTo(Math.max(0, ...comrades.filter((c) => c.own).map((c) => c.skills)), 36)
        : null,
    ),
  },
  // Five Felyne Comrades at full fondness: exactly 7000, as the game checks
  // (game_sub 0x09C1F918), so an edited save's higher value doesn't count.
  {
    id: "fearless-leader",
    group: "farm",
    rule: records(({ comrades }) =>
      comrades ? upTo(comrades.filter((c) => c.fondness === 7000).length, 5) : null,
    ),
  },
  // 50 special weapons forged.
  {
    id: "members-card",
    group: "collection",
    rule: records(({ specialWeapons }) =>
      specialWeapons === undefined ? null : upTo(specialWeapons, 50),
    ),
  },
  // Five pieces of each armor slot in the equipment box at the game's rarity
  // 8 or more (0-based, so the site's rarity 9 or more).
  {
    id: "artisans-mitten",
    group: "collection",
    rule: records(({ equipment }, ctx) => {
      if (!equipment) return null;
      const ids = ctx.equipmentIds;
      if (!ids) return ctx.equipmentIdsFailed ? null : "loading";
      const done = ARMOR_TYPES.filter(
        (type) =>
          equipment.filter((s) => s.type === type && (ids[type]?.[s.id]?.[2] ?? 0) >= 9).length >=
          5,
      ).length;
      return { done, total: ARMOR_TYPES.length };
    }),
  },
  // 20 quests each in the Great Forest and the four Old maps, and the
  // Hunter's Progress (from the save's award flags): six steps.
  {
    id: "hunters-miracle",
    group: "other",
    rule: records(({ mapQuests: maps, awards }) => {
      if (!maps || !awards) return null;
      const done = MIRACLE_MAPS.filter((m) => (maps[m] ?? 0) >= MAP_QUESTS).length;
      return {
        done: done + (awards.includes(HUNTERS_PROGRESS) ? 1 : 0),
        total: MIRACLE_MAPS.length + 1,
      };
    }),
  },
];

/** The Hunter's Progress's index, which the Hunter's Miracle needs. */
const HUNTERS_PROGRESS = 23;

/** The armor equip types (leggings, helmet, plate, gauntlets, waist). */
const ARMOR_TYPES = [0, 1, 2, 3, 4];

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
  /** The equipment ID table (equipment-ids.json), for armor rarity; null or missing while it loads. */
  equipmentIds?: EquipmentIds | null;
  /** The equipment ID table couldn't be fetched, so the awards that need it can't be followed. */
  equipmentIdsFailed?: boolean;
}

/** Something still to do for an award: a quest to clear or a monster to hunt. */
export type AwardTodo =
  { kind: "quest"; quest: Quest } | { kind: "monster"; monster: CrownMonster | { name: string } };

/** A `records` rule's count: `done` of `total`, and what's left where it's quests. */
export interface Count {
  done: number;
  total: number;
  todo?: AwardTodo[];
}

/** A count, or "loading" while the quests or equipment IDs it needs load. */
export type Tally = Count | "loading";

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
    case "records": {
      const count = save && rule.tally(save, ctx);
      if (!count) return { status: "untracked" };
      if (count === "loading") return { status: "loading" };
      return tally(count.done, count.total, count.todo ?? []);
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
