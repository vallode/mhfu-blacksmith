/**
 * Every randomizer option, described once. The web app's pages, settings
 * files and the shareable settings string all work from `OPTIONS`.
 *
 * Settings are a flat object keyed by option (`"recipes.amountSpread"`), so
 * they serialize as they are. A settings string is "RF" plus base64url JSON
 * of the seed, the logic version and every option that isn't its default:
 * with the same disc, it reproduces the same game.
 */
import type { Scope } from "./game/tiers.js";
import { LOGIC_VERSION } from "./version.js";

export interface Settings {
  seed: string;
  "questRewards.mode": Mode;
  "questRewards.scope": Scope;
  "questRewards.slots": number;
  "questRewards.chances": "rarity" | "reasonable" | "any";
  "questRewards.keepItems": boolean;
  "questRewards.draws": number;
  "monsterRewards.mode": Mode;
  "monsterRewards.scope": Scope;
  "monsterRewards.chances": "rarity" | "reasonable" | "any";
  "monsterRewards.captureAndBreaks": boolean;
  "carveCounts.mode": Mode;
  "carveCounts.max": number;
  "gathering.mode": Mode;
  "gathering.scope": Scope;
  "gathering.chances": "rarity" | "reasonable" | "any";
  "gathering.keepItems": boolean;
  "gathering.counts": boolean;
  "gathering.countSpread": number;
  "supplies.mode": Mode;
  "supplies.scope": Scope;
  "supplies.slots": number;
  "supplies.keepEssentials": boolean;
  "terms.money": boolean;
  "terms.moneySpread": number;
  "terms.time": boolean;
  "terms.timeSpread": number;
  "deliveries.enabled": boolean;
  "questGoals.enabled": boolean;
  "questGoals.capture": boolean;
  "questGoals.smallMonsters": boolean;
  "trades.mode": Mode;
  "trades.mix": "elder" | "all";
  "trades.scope": "low" | "high" | "any";
  "recipes.mode": Mode;
  "recipes.scope": Scope;
  "recipes.amounts": boolean;
  "recipes.amountSpread": number;
  "recipes.maxQuantity": number;
  "costs.enabled": boolean;
  "costs.spread": number;
  "weapons.enabled": boolean;
  "weapons.mix": "same-type" | "any-type";
  "weapons.attack": boolean;
  "weapons.attackSpread": number;
  "weapons.affinity": boolean;
  "weapons.affinitySpread": number;
  "weapons.element": boolean;
  "weapons.elementSpread": number;
  "weapons.elementGain": number;
  "weapons.elementKind": boolean;
  "weapons.slots": boolean;
  "weapons.slotSpread": number;
  "weapons.statRange": "near" | "wide" | "any";
  "weapons.sharpness": boolean;
  "weapons.sharpnessMode": "shuffle" | "new";
  "weapons.elementMotion": boolean;
  "weapons.elementMotionFrom": number;
  "armor.enabled": boolean;
  "armor.scope": "rarity" | "rank" | "any";
  "armor.start": "smithy" | "rank" | "any";
  "armorSkills.enabled": boolean;
  "armorSkills.mode": "shuffle" | "randomize";
  "armorSkills.keepArmorOnly": boolean;
  "armorStats.defense": Mode;
  "armorStats.defenseSpread": number;
  "armorStats.resistances": Mode;
  "armorStats.resistanceSpread": number;
  "armorStats.slots": Mode;
  "armorStats.rarity": Mode;
  "armorStats.raritySpread": number;
  "shops.mode": Mode;
  "shops.scope": "low" | "high" | "any";
  "shops.mix": "each" | "all";
  "shops.keepEssentials": boolean;
  "shops.special": boolean;
  "shops.countSpread": number;
  "shops.prices": boolean;
  "shops.priceSpread": number;
  "shops.stacks": boolean;
  "shops.stackSpread": number;
  "questMaps.enabled": boolean;
  "questMaps.pool": "time" | "any";
  "questMaps.starts": boolean;
  "questMonsters.mode": Mode;
  "questMonsters.scope": "rank" | "adjacent" | "any";
  "questMonsters.text": boolean;
  "questMonsters.difficulty": boolean;
  "questMonsters.difficultySpread": number;
  "questMonsters.difficultyRange": "rank" | "any";
  "questMonsters.size": boolean;
  "questMonsters.sizeSpread": number;
  "questMonsters.crowns": boolean;
  "questMonsters.crownSpread": "random" | "wide" | "none";
  "questMonsters.smallSpecies": boolean;
  "questMonsters.smallCounts": boolean;
  "questMonsters.smallCountSpread": number;
  "monsterStats.hp": boolean;
  "monsterStats.hpSpread": number;
  "monsterStats.size": boolean;
  "monsterStats.sizeSpread": number;
  "monsterStats.status": boolean;
  "monsterStats.statusSpread": number;
  "monsterAi.branches": boolean;
  "monsterAi.branchSpread": number;
  "monsterAi.aggression": "off" | "more" | "relentless";
  "weaknesses.elements": boolean;
  "weaknesses.parts": boolean;
  "hints.bookshelf": boolean;
  "hints.almanac": boolean;
  "mods.nodeMap": boolean;
  "mods.buttonIcons": "psp" | "xbox";
  "camera.fov": "normal" | "wide" | "wider" | "widest";
  "camera.distance": "normal" | "far" | "farther" | "farthest";
  "camera.tilt": "steps" | "slow" | "smooth" | "fast";
  "camera.photoMode": boolean;
  "camera.target": "off" | "tap" | "follow";
  "quest.endWait": "normal" | "short" | "instant";
  "hud.monsterHp": "off" | "painted" | "always";
  "hud.damageNumbers": "off" | "total" | "split";
  "hud.attackHitboxes": boolean;
  "pact.enabled": boolean;
  "poogie.enabled": boolean;
  "elites.enabled": boolean;
  "elites.chance": number;
  "quests.unknown": boolean;
  "quests.keyLabel": boolean;
  "rewards.sendAll": boolean;
  "smithy.improvePips": boolean;
  "boot.skip": "normal" | "title" | "village";
}

export type OptionKey = Exclude<keyof Settings, "seed">;

export type OptionType =
  | { kind: "boolean" }
  | {
      kind: "number";
      min: number;
      max: number;
      step: number;
      /** Shown as ±50%. */
      percent?: boolean;
      /** Shown as ±4 levels. */
      unit?: string;
      /** Shown as 12%: a chance in percent, not a spread. */
      chance?: boolean;
    }
  | {
      kind: "choice";
      choices: { value: string; label: string; help: string; action?: Action }[];
    };

/**
 * What an option does to the game. A shuffle moves what's already there (items,
 * monsters, weapons, armor, skills, weak spots) to other places: nothing new is
 * made. A randomizer rolls new values (amounts, costs, prices, HP, sizes, time
 * limits). The pages tag options with it, and the presets are built on it.
 */
export type Action = "shuffle" | "randomize";

/** What a feature does: nothing, shuffle what's there, or randomize new values. */
export type Mode = "off" | Action;

export interface OptionDef {
  key: OptionKey;
  section: string;
  label: string;
  help: string;
  type: OptionType;
  default: boolean | number | string;
  /** Shuffle or randomize: left out for options that only tune another. */
  action?: Action;
  /** An option that must be on for this one to matter. */
  enabledBy?: OptionKey;
  /** With `enabledBy` a choice: the values of it that count as on. */
  enabledWhen?: readonly string[];
}

const SPREAD = { kind: "number", min: 0, max: 0.95, step: 0.05, percent: true } as const;

export const OPTIONS: readonly OptionDef[] = [
  {
    key: "questRewards.mode",
    section: "Quest rewards",
    label: "Quest rewards",
    help: "What happens to the reward slots of Village and Guild quests. Training School and Treasure Hunting quests are left alone.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Quests give what they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Whole reward slots (item, amount and chance) trade places between quests, as far as the scope allows. Each quest keeps its number of slots, and a list's chances are scaled back to add up to 100.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Each quest's main reward list gets a new number of slots, and every slot a new item, amount and chance, with the items drawn from the scope.",
          action: "randomize",
        },
      ],
    },
    default: "shuffle",
  },
  {
    key: "questRewards.scope",
    section: "Quest rewards",
    label: "How far rewards can reach",
    help: "Which quests slots trade between when shuffled, and which items a quest's slots can be drawn from when randomized (by where each item is first found).",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Slots stay at their own rank and star level; randomized slots get items found there.",
        },
        {
          value: "rank",
          label: "Same rank",
          help: "Anywhere within Low, High or G Rank.",
        },
        {
          value: "adjacent",
          label: "Same or next rank",
          help: "Within a rank and the ranks next to it (Low with High, High with G).",
        },
        { value: "any", label: "Anywhere (chaos)", help: "Any quest, any item in the game." },
      ],
    },
    default: "star",
    enabledBy: "questRewards.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "questRewards.slots",
    section: "Quest rewards",
    label: "Reward slot variation",
    help: "How far a main reward list's number of slots can move, up or down. A list never gets more slots than the longest one on the disc, or than its quest has room for.",
    type: SPREAD,
    default: 0.3,
    enabledBy: "questRewards.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "questRewards.chances",
    section: "Quest rewards",
    label: "Reward chances",
    help: "How slots' chances are rolled. A list's chances always add up to 100, so whatever is rolled is scaled to fit.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "rarity",
          label: "Same rarity",
          help: "The chances the list had, dealt to the new slots.",
        },
        {
          value: "reasonable",
          label: "Within reason",
          help: "Each of the list's chances scaled by 0.5 to 2.",
        },
        { value: "any", label: "Anything (chaos)", help: "Each slot rolls 1 to 100." },
      ],
    },
    default: "rarity",
    enabledBy: "questRewards.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "questRewards.keepItems",
    section: "Quest rewards",
    label: "Keep every reward item",
    help: "When randomizing, every item a quest rewarded is still the reward of some quest at the same star level, so recipes that need it stay craftable. There may not be room for all of them if lists get shorter. Off, the scope decides everything.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "questRewards.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "questRewards.draws",
    section: "Quest rewards",
    label: "Reward draws variation",
    help: "How far the number of times a quest's main reward list is drawn can move, up or down (rounded, so a small spread leaves small counts alone). Never fewer than 1 or more than the most any quest has on the disc. Works on its own, whatever the mode above.",
    type: SPREAD,
    default: 0,
  },
  {
    key: "monsterRewards.mode",
    section: "Monster rewards",
    label: "Carves and shiny drops",
    help: "What happens to the reward lists of monsters: body carves, tail carves and shiny drops, and with the option below, captures and part breaks. A list never changes length.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Monsters give what they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Whole slots (item, chance and amount) trade places between lists, as far as the scope allows. A list's chances are scaled back to add up to what they did.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Every slot gets a new item drawn from the scope, a new chance and, for captures and breaks, a new amount.",
          action: "randomize",
        },
      ],
    },
    default: "shuffle",
  },
  {
    key: "monsterRewards.scope",
    section: "Monster rewards",
    label: "How far monster rewards can reach",
    help: "Which lists slots trade between when shuffled, and which items a list's slots can be drawn from when randomized (by where each item is first found). A list's point in the game is its rank and the earliest star level of a quest its monster is in.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Slots stay at their own rank and star level; randomized slots get items found there.",
        },
        { value: "rank", label: "Same rank", help: "Anywhere within Low, High or G Rank." },
        {
          value: "adjacent",
          label: "Same or next rank",
          help: "Within a rank and the ranks next to it (Low with High, High with G).",
        },
        { value: "any", label: "Anywhere (chaos)", help: "Any list, any item in the game." },
      ],
    },
    default: "star",
    enabledBy: "monsterRewards.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "monsterRewards.chances",
    section: "Monster rewards",
    label: "Monster reward chances",
    help: "How slots' chances are rolled. A list's chances always add up to what they did, so whatever is rolled is scaled to fit.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "rarity",
          label: "Same rarity",
          help: "The chances the list had, dealt to the new slots.",
        },
        {
          value: "reasonable",
          label: "Within reason",
          help: "Each of the list's chances scaled by 0.5 to 2.",
        },
        { value: "any", label: "Anything (chaos)", help: "Each slot rolls 1 to 100." },
      ],
    },
    default: "rarity",
    enabledBy: "monsterRewards.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "monsterRewards.captureAndBreaks",
    section: "Monster rewards",
    label: "Include capture and break rewards",
    help: "Capture rewards and part-break rewards are changed along with carves.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "monsterRewards.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "carveCounts.mode",
    section: "Monster rewards",
    label: "Carve counts",
    help: 'How many times a monster can be carved, body and tail, separate from the items in its lists ("body carves (x3)"). A monster with no tail, and carves done another way (elder dragons, live carving), are left alone.',
    type: {
      kind: "choice",
      choices: [
        {
          value: "off",
          label: "Unchanged",
          help: "Monsters can be carved as often as they always could.",
        },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Counts trade places between the monsters that have one.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Every count is rolled from 1 to the largest below.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "carveCounts.max",
    section: "Monster rewards",
    label: "Most carves",
    help: "The largest body or tail carve count a monster can roll.",
    type: { kind: "number", min: 1, max: 9, step: 1 },
    default: 4,
    enabledBy: "carveCounts.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "gathering.mode",
    section: "Gathering",
    label: "Gathering points",
    help: "What happens to the items of mining, gathering and bug catching points in Village and Guild quests. Training School and Treasure Hunting quests are left alone, and a delivery quest keeps the item it asks for.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Points give what they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Pairs (item and how likely it is) trade places between quests, as far as the scope allows. A table's odds are scaled back to add up to what they did.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Every pair gets a new item drawn from the scope and new odds. Tables keep their length.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "gathering.scope",
    section: "Gathering",
    label: "How far gathering points can reach",
    help: "Which quests pairs trade between when shuffled, and which items a point can give when randomized (by where each item is first found).",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Pairs stay at their own rank and star level; randomized points give items found there.",
        },
        { value: "rank", label: "Same rank", help: "Anywhere within Low, High or G Rank." },
        {
          value: "adjacent",
          label: "Same or next rank",
          help: "Within a rank and the ranks next to it (Low with High, High with G).",
        },
        { value: "any", label: "Anywhere (chaos)", help: "Any quest, any item in the game." },
      ],
    },
    default: "star",
    enabledBy: "gathering.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "gathering.chances",
    section: "Gathering",
    label: "Gathering odds",
    help: "How points' odds are rolled. A table's odds always add up to what they did, so whatever is rolled is scaled to fit.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "rarity",
          label: "Same rarity",
          help: "The odds the table had, dealt to the new items.",
        },
        {
          value: "reasonable",
          label: "Within reason",
          help: "Each of the table's odds scaled by 0.5 to 2.",
        },
        { value: "any", label: "Anything (chaos)", help: "Each pair rolls 1 to 100." },
      ],
    },
    default: "rarity",
    enabledBy: "gathering.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "gathering.keepItems",
    section: "Gathering",
    label: "Keep every gatherable item findable",
    help: "When randomizing, each item gathering points give is still at one or more spots at the same star level, so recipes stay craftable. The other spots get random items.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "gathering.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "gathering.counts",
    section: "Gathering",
    label: "Randomize how often points can be gathered",
    help: "Each mining, gathering and bug catching point in Village and Guild quests gets a new fewest and most number of gathers before it runs out. Points that never run out, and points that give a delivery quest's item, stay as they are.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "gathering.countSpread",
    section: "Gathering",
    label: "Gather count variation",
    help: "How far a point's gathers can move from their usual value, up or down. Every point can still be gathered at least once.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "gathering.counts",
  },
  {
    key: "supplies.mode",
    section: "Supplies",
    label: "Supply boxes",
    help: "What happens to the supply box each Village and Guild quest hands out. Stacks laid out once per hunter change together, and a delivery quest's box never gets the item it asks for. Training School and Treasure Hunting quests are left alone.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Boxes hold what they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Whole stacks (item and amount) trade places between boxes, as far as the scope allows. Each box keeps its length.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Each box gets a new number of stacks, and every stack a new item drawn from the scope and a new amount.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "supplies.scope",
    section: "Supplies",
    label: "How far supply boxes can reach",
    help: "Which boxes stacks trade between when shuffled, and which items a box can be drawn from when randomized (items first found there, and items that boxes there hold).",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Stacks stay at their own rank and star level; randomized boxes get items found there.",
        },
        { value: "rank", label: "Same rank", help: "Anywhere within Low, High or G Rank." },
        {
          value: "adjacent",
          label: "Same or next rank",
          help: "Within a rank and the ranks next to it (Low with High, High with G).",
        },
        { value: "any", label: "Anywhere (chaos)", help: "Any box, any item in the game." },
      ],
    },
    default: "star",
    enabledBy: "supplies.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "supplies.slots",
    section: "Supplies",
    label: "Supply stack variation",
    help: "How far a box's number of stacks can move, up or down. A box never gets more entries than the largest one on the disc, or than its quest has room for.",
    type: SPREAD,
    default: 0.3,
    enabledBy: "supplies.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "supplies.keepEssentials",
    section: "Supplies",
    label: "Keep maps and quest supplies",
    help: "Maps, ballista and cannon ammo and the other quest-only supplies stay where they are. A quest's Paw Pass Ticket always stays. (Randomizing never adds quest-only items.)",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "supplies.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "terms.money",
    section: "Quest terms",
    label: "Randomize quest money",
    help: "Each Village and Guild quest's reward money and failure penalty change together; its contract fee changes on its own and never costs more than the reward.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "terms.moneySpread",
    section: "Quest terms",
    label: "Quest money variation",
    help: "How far a fee, reward or penalty can move, up or down, in steps of 10z.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "terms.money",
  },
  {
    key: "terms.time",
    section: "Quest terms",
    label: "Randomize time limits",
    help: "Each Village and Guild quest's time limit changes, in whole minutes, staying between the shortest and longest limits in the game (20 and 50 minutes).",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "terms.timeSpread",
    section: "Quest terms",
    label: "Time limit variation",
    help: "How far a time limit can move, up or down. Limits never go past 50 minutes, so long quests mostly get shorter.",
    type: SPREAD,
    default: 0.3,
    enabledBy: "terms.time",
  },
  {
    key: "deliveries.enabled",
    section: "Deliveries",
    label: "Randomize delivery quests",
    help: "Each Village and Guild delivery quest asks for a different item that its own gathering points give, in an amount they can supply. The goal line changes to match (in English); the description doesn't. Paw Pass Ticket quests stay as they are.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "questGoals.enabled",
    section: "Quest goals",
    label: "Randomize quest goals",
    help: "Each Village and Guild hunting quest asks for something else its own large monsters allow: to hunt another of them, or to capture one. A hunt never becomes a small monster quest. Quests whose monsters come in waves keep their target, and quests with two targets keep both. The goal line changes to match (in English); the title and description don't. Elder dragon, delivery, fortress and Treasure Hunting quests keep their goals.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "questGoals.capture",
    section: "Quest goals",
    label: "Capture goals",
    help: "Goals can ask to capture a monster that can be captured. Killing it fails the quest, so bring traps and tranquilizers.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "questGoals.enabled",
  },
  {
    key: "questGoals.smallMonsters",
    section: "Quest goals",
    label: "Change slaying quests",
    help: "Quests that ask to slay a number of small monsters ask for a third to a half of another of the quest's small monsters (never Vespoids), or to hunt or capture one of its large monsters. Off, they keep their goals.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "questGoals.enabled",
  },
  {
    key: "trades.mode",
    section: "Veggie Elder",
    label: "The Veggie Elder's trades",
    help: "What the Elder gives for the items he takes. Each trade keeps the item he takes and its place in his list, so he still takes the first item on it that you carry.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "He gives what he always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "What each trade gives, the common and rare item together, moves to another trade.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Each trade gives new common and rare items drawn from the scope.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "trades.mix",
    section: "Veggie Elder",
    label: "Which trades",
    help: "Where a trade's items can move to.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "elder",
          label: "Same Elder",
          help: "Each hunting ground's Elder gives the same items as before, for other things.",
        },
        {
          value: "all",
          label: "Any Elder",
          help: "Items move between the Elders of every hunting ground.",
        },
      ],
    },
    default: "elder",
    enabledBy: "trades.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "trades.scope",
    section: "Veggie Elder",
    label: "How far trades can reach",
    help: "Which items a randomized trade can give besides the ones the Elders give anyway. Trades have no rank of their own, so this is the highest rank whose items can turn up.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "low",
          label: "Trade and Low Rank items",
          help: "Also anything first found in Low Rank.",
        },
        {
          value: "high",
          label: "Trade, Low and High Rank items",
          help: "Also anything first found in Low or High Rank.",
        },
        { value: "any", label: "Any item (chaos)", help: "Any item in the game." },
      ],
    },
    default: "low",
    enabledBy: "trades.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "recipes.mode",
    section: "Crafting",
    label: "Recipe materials",
    help: "What happens to the materials of crafting and upgrade recipes. Shop, combined and ticket items stay. An item's point in the game is the rank and star level where it's first found: the earliest Village or Guild quest that rewards it, has a monster that gives it, or has a gathering point with it.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Recipes ask for what they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Materials are swapped between recipe slots, as far as the scope allows.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Each material is replaced by a new item drawn from the scope.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "recipes.scope",
    section: "Crafting",
    label: "How far recipe materials can reach",
    help: "Which materials a slot can get, by where each is first found. Only the same star level keeps every recipe craftable as early as before.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Materials stay at their own rank and star level. A 1★ recipe stays craftable at 1★.",
        },
        { value: "rank", label: "Same rank", help: "Anywhere within Low, High or G Rank." },
        {
          value: "adjacent",
          label: "Same or next rank",
          help: "Within a rank and the ranks next to it (Low with High, High with G).",
        },
        {
          value: "any",
          label: "Anywhere (chaos)",
          help: "Any item with a source, at any rank. Recipes may need G Rank parts in Low Rank.",
        },
      ],
    },
    default: "star",
    enabledBy: "recipes.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "recipes.amounts",
    section: "Crafting",
    label: "Randomize material amounts",
    help: "Each amount is rescaled to how many of that material recipes usually ask for, then varied.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "recipes.amountSpread",
    section: "Crafting",
    label: "Material amount variation",
    help: "How far an amount can move from its usual value, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "recipes.amounts",
  },
  {
    key: "recipes.maxQuantity",
    section: "Crafting",
    label: "Largest material amount",
    help: "The most of a single material a recipe can ask for.",
    type: { kind: "number", min: 1, max: 99, step: 1 },
    default: 99,
    enabledBy: "recipes.amounts",
  },
  {
    key: "costs.enabled",
    section: "Costs",
    label: "Randomize crafting costs",
    help: "Weapon, armor and decoration zenny costs vary, in steps of 10z. A weapon's upgrade cost changes with it.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "costs.spread",
    section: "Costs",
    label: "Crafting cost variation",
    help: "How far a cost can move from its usual value, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "costs.enabled",
  },
  {
    key: "weapons.enabled",
    section: "Weapons",
    label: "Shuffle which weapons the smithy makes",
    help: "Each spot in the smithy's weapon trees makes a different weapon of the same rarity. Spots keep their materials and upgrade paths; weapons keep their stats and cost wherever they go. The smithy's store follows: it sells the weapons now in the spots of the ones it sold.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "weapons.mix",
    section: "Weapons",
    label: "Weapon type",
    help: "Whether a spot keeps its weapon type.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "same-type",
          label: "Same type",
          help: "A Great Sword spot makes another Great Sword.",
        },
        {
          value: "any-type",
          label: "Any Blademaster or Gunner type",
          help: "A Blademaster spot makes any Blademaster weapon, a Gunner spot any Gunner weapon, of the same rarity. A Great Sword tree can turn into a Hunting Horn tree.",
        },
      ],
    },
    default: "same-type",
    enabledBy: "weapons.enabled",
  },
  {
    key: "weapons.attack",
    section: "Weapons",
    label: "Randomize weapon attack",
    help: "Each weapon's attack varies, staying within what weapons of its type have nearby in rarity (see the stat range). Defense bonus, horn notes, shelling, ammo and cost stay fixed. Stats go with the weapon wherever the smithy makes it.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "weapons.attackSpread",
    section: "Weapons",
    label: "Attack variation",
    help: "How far attack can move from its usual value, up or down.",
    type: SPREAD,
    default: 0.2,
    enabledBy: "weapons.attack",
  },
  {
    key: "weapons.affinity",
    section: "Weapons",
    label: "Randomize weapon affinity",
    help: "Each weapon's affinity moves up or down in steps of 5%, staying within what weapons of its type have nearby in rarity.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "weapons.affinitySpread",
    section: "Weapons",
    label: "Affinity variation",
    help: "How many points affinity can move, up or down.",
    type: { kind: "number", min: 5, max: 50, step: 5 },
    default: 15,
    enabledBy: "weapons.affinity",
  },
  {
    key: "weapons.element",
    section: "Weapons",
    label: "Randomize weapon element and status",
    help: "Weapons with an element or status get a new value for it, staying within what weapons of its type have nearby in rarity. Dual-element weapons keep theirs. A weapon that's the only one of its type with that element or status nearby varies by the spread alone.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "weapons.elementSpread",
    section: "Weapons",
    label: "Element variation",
    help: "How far element and status values can move from their usual value, up or down.",
    type: SPREAD,
    default: 0.3,
    enabledBy: "weapons.element",
  },
  {
    key: "weapons.elementGain",
    section: "Weapons",
    label: "New elements",
    help: "The chance a Blademaster weapon or bow with no element or status gains one (bows only elements), at a value weapons of its type with it have nearby in rarity. Bowguns never do.",
    type: { kind: "number", min: 0, max: 1, step: 0.05, percent: true },
    default: 0,
    enabledBy: "weapons.element",
  },
  {
    key: "weapons.elementKind",
    section: "Weapons",
    label: "Change which element",
    help: "A Blademaster weapon or bow with an element or status can get any other: Fire can become Ice, or Poison, and the other way round (bows only elements).",
    type: { kind: "boolean" },
    default: false,
    enabledBy: "weapons.element",
  },
  {
    key: "weapons.slots",
    section: "Weapons",
    label: "Randomize decoration slots",
    help: "Each weapon gains or loses decoration slots, from none to three.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "weapons.slotSpread",
    section: "Weapons",
    label: "Slot variation",
    help: "How many slots a weapon can gain or lose.",
    type: { kind: "number", min: 1, max: 3, step: 1 },
    default: 1,
    enabledBy: "weapons.slots",
  },
  {
    key: "weapons.statRange",
    section: "Weapons",
    label: "Weapon stat range",
    help: "What attack, affinity and element values a weapon stays within: those of weapons of its type at rarities near its own.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "near",
          label: "One rarity either side",
          help: "A rarity 3 weapon stays within what rarity 2 to 4 weapons of its type have.",
        },
        {
          value: "wide",
          label: "Three rarities either side",
          help: "A rarity 3 weapon can have what rarity 1 to 6 weapons of its type have.",
        },
        {
          value: "any",
          label: "Any rarity",
          help: "Any weapon can have what any weapon of its type has, G Rank included, as far as the variation lets it move.",
        },
      ],
    },
    default: "near",
  },
  {
    key: "weapons.sharpness",
    section: "Weapons",
    label: "Shuffle weapon sharpness",
    help: "Blademaster weapons of the same type and rarity trade sharpness bars, so bar lengths stay as they were for each rarity. Sharpness goes with the weapon wherever the smithy makes it.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "weapons.sharpnessMode",
    section: "Weapons",
    label: "Sharpness bars",
    help: "Whether the bars themselves change.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "shuffle",
          label: "The game's bars",
          help: "Weapons only trade the bars the game has.",
        },
        {
          value: "new",
          label: "New bars",
          help: "Every bar gets new colors, each a random share of it, so any weapon can have any color, purple included. Bars keep their length.",
        },
      ],
    },
    default: "shuffle",
    enabledBy: "weapons.sharpness",
  },
  {
    key: "weapons.elementMotion",
    section: "Weapons",
    label: "Heavy hits carry more element",
    help: "A Blademaster hit's element grows on a curve with how hard the move hits, so a slow weapon with the element its target is weak to pulls ahead of a raw one on every swing, and further the more it commits: at the default strength, a Great Sword's side slash carries 1.6 times its element, its draw slash 2.5 times, its level 3 charge 8.7 times, while quick hits (Dual Blades, Sword and Shield, light pokes) stay as they are. Status grows in step with the hit. Critical hits don't change either, as in the game. Weapon screens show the usual values.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "weapons.elementMotionFrom",
    section: "Weapons",
    label: "Element boost starts at",
    help: "The motion value above which a hit's element and status grow. Lower is stronger: at 26, a hit with motion value 52 carries 2.8 times its element (twice the motion value, to the power 1.5) and twice its status. Hits at or below it stay as they are: Dual Blades hits are 6 to 25, Great Sword hits 36 to 110.",
    type: { kind: "number", min: 10, max: 40, step: 1 },
    default: 26,
    enabledBy: "weapons.elementMotion",
  },
  {
    key: "armor.enabled",
    section: "Armor",
    label: "Shuffle which armor the smithy makes",
    help: "Each spot in the smithy makes a different armor piece for the same slot, wearable by the same hunters (Blademaster, Gunner or both; male, female or both), of a rarity the armor rarity range allows. Spots keep their materials; pieces keep their stats, skills and cost. The smithy's store follows: it sells the pieces now in the spots of the ones it sold.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "armor.scope",
    section: "Armor",
    label: "Armor rarity range",
    help: "Which pieces a smithy spot can get, by the rarity of the piece it made.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "rarity",
          label: "Same rarity",
          help: "A rarity 3 spot makes another rarity 3 piece.",
        },
        {
          value: "rank",
          label: "Same rank",
          help: "A Low Rank spot makes any Low Rank piece (rarity 1 to 5), High Rank any High Rank piece, G Rank any G Rank piece.",
        },
        {
          value: "any",
          label: "Any rarity",
          help: "Any spot can make any piece, so a Low Rank recipe can give G Rank armor and the other way round. The store's first pieces can be anything too.",
        },
      ],
    },
    default: "rarity",
    enabledBy: "armor.enabled",
  },
  {
    key: "armor.start",
    section: "Armor",
    label: "Starting armor",
    help: "The armor in a new hunter's equipment box: the Mafumofu set, worn but for the hood.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "smithy",
          label: "From the smithy",
          help: "The Mafumofu set, or with the armor shuffle on, the pieces now in its spots in the smithy.",
        },
        {
          value: "rank",
          label: "Any Low Rank piece",
          action: "randomize",
          help: "Each piece is any Low Rank piece the smithy makes for its slot that a new hunter can wear: for Blademasters (the starting weapon is one) and both sexes.",
        },
        {
          value: "any",
          label: "Any piece",
          action: "randomize",
          help: "Each piece is any piece the smithy makes for its slot that a new hunter can wear, G Rank included.",
        },
      ],
    },
    default: "smithy",
  },
  {
    key: "armorSkills.enabled",
    section: "Armor",
    label: "Change armor skills",
    help: "The skill points on armor pieces change. Each piece keeps how many skills it has and which are negative; Torso Up and decorations stay as they are.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "armorSkills.mode",
    section: "Armor",
    label: "How armor skills change",
    help: "Whether pieces trade the skill points they have, or get new ones.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "shuffle",
          label: "Trade between pieces",
          action: "shuffle",
          help: "Pieces trade their skill points with other pieces of the same rarity and hunter type. The game has the same skills, on other pieces.",
        },
        {
          value: "randomize",
          label: "New skills and points",
          action: "randomize",
          help: "Every skill on a piece is a new skill tree for its hunter type, with new points sized like that rarity's skills. Some skills may be hard to activate, or easier than ever.",
        },
      ],
    },
    default: "shuffle",
    enabledBy: "armorSkills.enabled",
  },
  {
    key: "armorSkills.keepArmorOnly",
    section: "Armor",
    label: "Keep skills no decoration gives",
    help: "Skill trees only armor has (no decoration adds points to them) stay on their pieces, so they activate as before. Off, they move or are drawn like the rest, and may become impossible to activate.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "armorSkills.enabled",
  },
  {
    key: "armorStats.defense",
    section: "Armor",
    label: "Armor defense",
    help: "Each piece's defense, which goes with the piece wherever the smithy makes it.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "As on the disc." },
        {
          value: "shuffle",
          label: "Shuffle",
          action: "shuffle",
          help: "Pieces of the same rarity and hunter type trade their defense, along with how far armor spheres upgrade it.",
        },
        {
          value: "randomize",
          label: "Randomize",
          action: "randomize",
          help: "Each piece's defense varies, staying within what pieces of its hunter type have from one rarity below to one above. Armor spheres upgrade it as many levels as before.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "armorStats.defenseSpread",
    section: "Armor",
    label: "Defense variation",
    help: "How far defense can move from its usual value, up or down.",
    type: SPREAD,
    default: 0.2,
    enabledBy: "armorStats.defense",
    enabledWhen: ["randomize"],
  },
  {
    key: "armorStats.resistances",
    section: "Armor",
    label: "Armor resistances",
    help: "Each piece's fire, water, thunder, dragon and ice resistance.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "As on the disc." },
        {
          value: "shuffle",
          label: "Shuffle",
          action: "shuffle",
          help: "Pieces of the same rarity and hunter type trade all five resistances together.",
        },
        {
          value: "randomize",
          label: "Randomize",
          action: "randomize",
          help: "Each resistance moves up or down, staying within what pieces of its hunter type have from one rarity below to one above.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "armorStats.resistanceSpread",
    section: "Armor",
    label: "Resistance variation",
    help: "How many points each resistance can move, up or down.",
    type: { kind: "number", min: 1, max: 10, step: 1, unit: "points" },
    default: 2,
    enabledBy: "armorStats.resistances",
    enabledWhen: ["randomize"],
  },
  {
    key: "armorStats.slots",
    section: "Armor",
    label: "Armor decoration slots",
    help: "How many decoration slots each piece has.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "As on the disc." },
        {
          value: "shuffle",
          label: "Shuffle",
          action: "shuffle",
          help: "Pieces of the same rarity and hunter type trade their slots.",
        },
        {
          value: "randomize",
          label: "Randomize",
          action: "randomize",
          help: "Each piece gets a slot count drawn from the counts pieces of its rarity have, so a rarity keeps about as many slots.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "armorStats.rarity",
    section: "Armor",
    label: "Armor rarity",
    help: "Each piece's rarity. What the game uses armor rarity for hasn't been checked in game.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "As on the disc." },
        {
          value: "shuffle",
          label: "Shuffle",
          action: "shuffle",
          help: "Pieces of the same rank (Low, High or G) and hunter type trade their rarity.",
        },
        {
          value: "randomize",
          label: "Randomize",
          action: "randomize",
          help: "Each piece's rarity moves up or down, staying within its rank.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "armorStats.raritySpread",
    section: "Armor",
    label: "Rarity variation",
    help: "How many levels rarity can move, up or down.",
    type: { kind: "number", min: 1, max: 4, step: 1, unit: "levels" },
    default: 1,
    enabledBy: "armorStats.rarity",
    enabledWhen: ["randomize"],
  },
  {
    key: "shops.mode",
    section: "Shop stock",
    label: "Shop stock",
    help: "What happens to what shops sell. Each item a shop sells is replaced by one other item, the same in every stage of that shop, so later stages still include earlier stock. The monster Info books (Lynian Info to Fatalis Info) only unlock bookshelf pages, so they're dropped instead and those shops sell that many fewer items. The Organizer and Backpacker Guides always stay on sale where they are.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Shops sell what they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "Only items shops sell anyway are moved to other shops and stages. Every shop keeps its number of items.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "Items are replaced by ones drawn from the scope, and shops can sell more or fewer items.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "shops.scope",
    section: "Shop stock",
    label: "How far shop stock can reach",
    help: "Which items a randomized shop can sell. Shops have no rank of their own, so this is the highest rank whose items can turn up, along with the items shops sell anyway.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "low",
          label: "Shop and Low Rank items",
          help: "Also anything first found in Low Rank: herbs, ores, bones, Low Rank monster parts.",
        },
        {
          value: "high",
          label: "Shop, Low and High Rank items",
          help: "Also anything first found in Low or High Rank.",
        },
        {
          value: "any",
          label: "Any item (chaos)",
          help: "Any item in the game, G Rank parts and jewels included.",
        },
      ],
    },
    default: "low",
    enabledBy: "shops.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "shops.mix",
    section: "Shop stock",
    label: "Replacements across shops",
    help: "Whether an item is replaced by the same thing in every shop. When shuffling, this also decides whether shops trade stock.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "each",
          label: "Each shop on its own",
          help: "Every shop has its own replacements (shops that share stock lists share them).",
        },
        {
          value: "all",
          label: "All shops together",
          help: "One replacement per item everywhere; with shop items only, granny's herbs can reach the general store.",
        },
      ],
    },
    default: "each",
    enabledBy: "shops.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "shops.keepEssentials",
    section: "Shop stock",
    label: "Keep the essentials on sale",
    help: "Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay where they are.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "shops.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "shops.special",
    section: "Shop stock",
    label: "Include the Point Exchange",
    help: "The Pokke Village shop that takes Pokke Points: Armor Spheres, jewels, Pokke Tickets and Gourmet BBQ Spit. Off keeps armor upgrades as usual.",
    type: { kind: "boolean" },
    default: false,
    enabledBy: "shops.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "shops.countSpread",
    section: "Shop stock",
    label: "Stock size variation",
    help: "How far the number of items each shop sells can move, up or down, every stage alike. When a shop grows, the shop lists are rewritten and the game is pointed at their new places.",
    type: SPREAD,
    default: 0,
    enabledBy: "shops.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "shops.prices",
    section: "Shop prices",
    label: "Randomize prices",
    help: "The price of everything shops sell changes, with or without changing the stock (with it, of what they sell now). A price is the item's own, so it's the same in every shop.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "shops.priceSpread",
    section: "Shop prices",
    label: "Price variation",
    help: "How far a price can move, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "shops.prices",
  },
  {
    key: "shops.stacks",
    section: "Shop prices",
    label: "Randomize carry limits",
    help: "How many of each item you can carry changes (1 to 99), for everything shops sell, with or without the stock shuffle. This applies everywhere, not just in shops.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "shops.stackSpread",
    section: "Shop prices",
    label: "Carry limit variation",
    help: "How far a carry limit can move, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "shops.stacks",
  },
  {
    key: "questMaps.enabled",
    section: "Quest maps",
    label: "Move quests to other maps",
    help: "Village and Guild quests move to another map where all of their large monsters are found. A moved quest takes its gathering points and small monsters from a quest already on that map, and its monsters start where monsters of their kind start there. Delivery quests and quests whose goal names a small monster or an item stay. The quest's text still names the old map. Written and read back on the EU disc; not yet tried in game.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "questMaps.pool",
    section: "Quest maps",
    label: "Where quests can move",
    help: "Which maps a quest can move to.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "time",
          label: "Other time of day",
          help: "The same place by night instead of by day, or the other way round (Forest and Hills, Desert, Swamp, Volcano, Jungle, Snowy Mountains, Great Forest).",
        },
        {
          value: "any",
          label: "Any map its monsters are on",
          help: "Any map where every one of the quest's large monsters is found in some quest: a Rathian hunt can go to the Forest and Hills, the Arena or the Old Volcano.",
        },
      ],
    },
    default: "any",
    enabledBy: "questMaps.enabled",
  },
  {
    key: "questMaps.starts",
    section: "Quest maps",
    label: "Shuffle where large monsters start",
    help: "Each large monster starts at another point on its map where the disc's quests start a monster of its kind (one whose kind starts nowhere else there keeps its own). Moved quests always get new starting points. Not yet tried in game.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "questMonsters.mode",
    section: "Quest monsters",
    label: "Large monsters",
    help: "What happens to the large monsters in Village and Guild quests. A monster only goes to a map it's found on somewhere in the game, and the quest's target follows it. Tried on the EU disc.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Quests have the monsters they always did." },
        {
          value: "shuffle",
          label: "Shuffle",
          help: "A monster becomes one of its own variants: Rathian, Pink Rathian or Gold Rathian. Quests with several monsters change too.",
          action: "shuffle",
        },
        {
          value: "randomize",
          label: "Randomize",
          help: "A monster becomes any large monster found on the quest's map within the scope, and starts where the game starts its kind on that map. Only quests with one kind of large monster change.",
          action: "randomize",
        },
      ],
    },
    default: "off",
  },
  {
    key: "questMonsters.scope",
    section: "Quest monsters",
    label: "How far large monsters can reach",
    help: "Which monsters a randomized quest can get: those found in quests of its rank, of its rank or the next, or at any rank (still only monsters found on its map).",
    type: {
      kind: "choice",
      choices: [
        {
          value: "rank",
          label: "Same rank",
          help: "Any large monster found in a quest of the same rank (Low, High or G).",
        },
        {
          value: "adjacent",
          label: "Same or next rank",
          help: "Within a rank and the ranks next to it (Low with High, High with G).",
        },
        {
          value: "any",
          label: "Anywhere (chaos)",
          help: "Any large monster found on the quest's map, at any rank.",
        },
      ],
    },
    default: "rank",
    enabledBy: "questMonsters.mode",
    enabledWhen: ["randomize"],
  },
  {
    key: "questMonsters.difficulty",
    section: "Quest monsters",
    label: "Randomize monster difficulty",
    help: "Each large monster in a Village or Guild quest gets another difficulty level: the row of HP, attack and defense multipliers the quest picks for it.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "questMonsters.difficultySpread",
    section: "Quest monsters",
    label: "Difficulty variation",
    help: "How many difficulty levels a monster can move, up or down (there are 32).",
    type: { kind: "number", min: 1, max: 31, step: 1, unit: "levels" },
    default: 4,
    enabledBy: "questMonsters.difficulty",
  },
  {
    key: "questMonsters.difficultyRange",
    section: "Quest monsters",
    label: "Difficulty range",
    help: "How hard or easy a monster can get.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "rank",
          label: "Within its rank",
          help: "Only levels quests of the same rank use: a Low Rank monster never gets G Rank multipliers.",
        },
        {
          value: "any",
          label: "Any level (chaos)",
          help: "Any level a Village or Guild quest uses. Low Rank monsters can hit like G Rank ones.",
        },
      ],
    },
    default: "rank",
    enabledBy: "questMonsters.difficulty",
  },
  {
    key: "questMonsters.size",
    section: "Quest monsters",
    label: "Randomize each quest's monster size",
    help: "Each Village and Guild quest gets its own monster size: its header's size percentage (100% in half the quests on the disc, 50-174% in the rest). Seen working in game (a tiny Giadrome); whether hitboxes follow the size is untested.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "questMonsters.sizeSpread",
    section: "Quest monsters",
    label: "Quest size variation",
    help: "How far a quest's size can move, up or down. Sizes stay between 50% and 200%.",
    type: { kind: "number", min: 0.05, max: 0.5, step: 0.05, percent: true },
    default: 0.2,
    enabledBy: "questMonsters.size",
  },
  {
    key: "questMonsters.crowns",
    section: "Quest monsters",
    label: "Change each quest's crown spread",
    help: "Each large monster's size is rolled around its quest's size, and the quest picks one of five spreads that limit the roll: none, 100-105%, 100-115%, 95-114% or 85-125%. The spread decides which crowns a quest can give. Story quests that hold their monsters at 100% until first cleared still do. Worked out from the game's code and tried in game.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "questMonsters.crownSpread",
    section: "Quest monsters",
    label: "Crown spread",
    help: "Which spread each quest gets.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "random",
          label: "Random",
          help: "Each quest gets one of the four spreads that vary size, at random.",
        },
        {
          value: "wide",
          label: "Widest everywhere",
          help: "Every quest rolls 85-125%, so mini and gold crowns can turn up in any quest.",
        },
        {
          value: "none",
          label: "None",
          help: "Every monster is exactly its quest's size: no crowns unless the quest's size is itself a crown size.",
        },
      ],
    },
    default: "random",
    enabledBy: "questMonsters.crowns",
  },
  {
    key: "questMonsters.smallSpecies",
    section: "Quest monsters",
    label: "Shuffle small monsters",
    help: "Each small monster species in a Village or Guild quest becomes another found in the same areas in some quest (Cephalos stay in sand). Every one of its kind in the quest changes together. Small monsters the goal names, and delivery quests' small monsters, stay. Not yet tried in game.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "questMonsters.smallCounts",
    section: "Quest monsters",
    label: "Randomize small monster counts",
    help: "How many of each small monster a Village or Guild quest has. Never more than any quest has on the disc, and never fewer than a quest's goal asks you to slay, or than a delivery is carved from.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "questMonsters.smallCountSpread",
    section: "Quest monsters",
    label: "Small monster count variation",
    help: "How far a count can move, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "questMonsters.smallCounts",
  },
  {
    key: "monsterStats.hp",
    section: "Monster stats",
    label: "Randomize each monster's base HP",
    help: "Each monster's base HP changes, in every quest it appears in. Quests still multiply it by their own difficulty, and it's held where that stays within the most HP the game can hold (32767).",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "monsterStats.hpSpread",
    section: "Monster stats",
    label: "Base HP variation",
    help: "How far base HP can move, up or down.",
    type: SPREAD,
    default: 0.25,
    enabledBy: "monsterStats.hp",
  },
  {
    key: "monsterStats.size",
    section: "Monster stats",
    label: "Randomize each monster's base size",
    help: "Each monster's base size changes, in every quest it appears in, on top of the quest's own size. Tried on a real disc; big changes may look or play oddly.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "monsterStats.sizeSpread",
    section: "Monster stats",
    label: "Base size variation",
    help: "How far a base size can move, up or down.",
    type: { kind: "number", min: 0, max: 0.5, step: 0.05, percent: true },
    default: 0.2,
    enabledBy: "monsterStats.size",
  },
  {
    key: "monsterStats.status",
    section: "Monster stats",
    label: "Randomize status resistance",
    help: "How much poison, paralysis, sleep and KO damage each monster takes before it's affected, and how much more each time after.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "monsterStats.statusSpread",
    section: "Monster stats",
    label: "Resistance variation",
    help: "How far a resistance can move, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "monsterStats.status",
  },
  {
    key: "monsterAi.branches",
    section: "Monster stats",
    label: "Randomize behaviour",
    help: "Wherever a monster's AI picks at random between moves (which attack, whether to walk, turn or wait), the odds change: a monster may favour an attack it rarely used, or wander more than it did. Its moves and when it chooses don't change, and nothing it could do before becomes impossible. Species that share AI (the four dromes, Rathian and Rathalos and their kin) change together.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "monsterAi.branchSpread",
    section: "Monster stats",
    label: "Behaviour variation",
    help: "How far each move's odds can move, up or down, before they're scaled back to the same total.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "monsterAi.branches",
  },
  {
    key: "monsterAi.aggression",
    section: "Monster stats",
    label: "Aggression",
    help: "Wherever a monster's AI picks at random between attacking and something else (walking, turning, waiting, roaring), attacks get likelier, so it spends less time between them. Which attacks it has and when it chooses don't change, and every move stays possible. The aura of Kushala Daora, Teostra and Lunastra counts as an attack; the light hit a large monster deals just by walking into you doesn't. Great Thunderbug is left alone, and Fatalis, the Vespoids and Bulldrome partly.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Monsters attack as often as they always did." },
        {
          value: "more",
          label: "More aggressive",
          help: "Each attack is twice as likely as before against the other moves.",
        },
        {
          value: "relentless",
          label: "Relentless",
          help: "Each attack is four times as likely as before against the other moves.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "weaknesses.elements",
    section: "Weaknesses",
    label: "Shuffle elemental weaknesses",
    help: "Each monster's fire, water, ice, thunder and dragon weaknesses trade places: a monster weak to fire may now be weak to ice instead. Every part keeps its overall profile.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "weaknesses.parts",
    section: "Weaknesses",
    label: "Shuffle weak spots",
    help: "Each large monster's body parts trade hitzones: the head may now be as tough as the tail was. Breaks and flinches stay with the part.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "hints.bookshelf",
    section: "Extras",
    label: "Monster guide on the bookshelf",
    help: "The house bookshelf's Practical Hunting monster articles (Open Bookshelf, Info Magazine) become the RandomFU Bestiary: one page per large monster rating its elemental weaknesses, softest parts, status resistance and health in stars, as the shuffles left them, readable from the start. In English in every language. EU disc only; seen on the shelf in PPSSPP.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "hints.almanac",
    section: "Extras",
    label: "Item almanac on the bookshelf",
    help: "The house bookshelf's Lay of the Land articles (Open Bookshelf, Info Magazine) become the RandomFU Almanac: a line per crafting material, A to Z, naming the shops that sell it and its earliest gathering spots, carves, captures, breaks and quest rewards, as the shuffles left them, readable from the start. In English in every language. EU disc only.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "mods.nodeMap",
    section: "Extras",
    label: "Gathering nodes on the area map",
    help: "The map screen's pictures get a marker at every gathering (green), mining (orange) and bug catching (yellow) node of the map, so you can see where the points are. Each map's picture is shared by all its quests, so the markers show the map's nodes, not one quest's. EU and JP discs only.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "mods.buttonIcons",
    section: "Extras",
    label: "Button icons",
    help: "The button pictures the game shows in its text and on screen, for playing with a controller in PPSSPP. Xbox draws the buttons PPSSPP maps an Xbox controller to by default: A for ×, B for ○, X for □, Y for △, LB and RB for L and R, Menu and View for START and SELECT. The analog stick and d-pad stay as they are, and so would any button drawn into another picture.",
    type: {
      kind: "choice",
      choices: [
        { value: "psp", label: "PSP", help: "The game's own: ○ × △ □, L, R, START and SELECT." },
        {
          value: "xbox",
          label: "Xbox",
          help: "A B X Y in their colours, LB, RB, Menu and View.",
        },
      ],
    },
    default: "psp",
  },
  {
    key: "camera.fov",
    section: "Camera",
    label: "Field of view",
    help: "How wide the camera sees. It widens every view the game builds the same way: tried in the village and in quests. The game's is 50° high (79° across the screen). Things at the edges look a little stretched the wider it gets. This picks what the disc starts with: the START menu's last entry, randomfu, changes it in game (in a quest or in the village), and your save keeps that choice. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: {
      kind: "choice",
      choices: [
        { value: "normal", label: "Normal", help: "The game's own: 50° high, 79° across." },
        { value: "wide", label: "Wide", help: "×1.15: 57.5° high, 88° across." },
        {
          value: "wider",
          label: "Wider",
          help: "×1.25: 62.5° high, 94° across.",
        },
        { value: "widest", label: "Widest", help: "×1.4: 70° high, 102° across." },
      ],
    },
    default: "normal",
  },
  {
    key: "camera.distance",
    section: "Camera",
    label: "Camera distance",
    help: "How far behind your hunter the camera sits, at the same angle: every camera preset of the stage you're on moves back along the line it looks down (the usual camera is 490 back and 100 above what it looks at). Further back shows more around you, but in tight spots, like caves, it may pass through walls more often. This picks what the disc starts with: the START menu's last entry, randomfu, changes it in game (in a quest or in the village), and your save keeps that choice. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: {
      kind: "choice",
      choices: [
        { value: "normal", label: "Normal", help: "The game's own distance." },
        { value: "far", label: "Far", help: "×1.15 as far back." },
        { value: "farther", label: "Farther", help: "×1.3 as far back." },
        { value: "farthest", label: "Farthest", help: "×1.5 as far back." },
      ],
    },
    default: "normal",
  },
  {
    key: "camera.tilt",
    section: "Camera",
    label: "Camera tilt",
    help: "How D-pad up and down tilt the camera. The game's camera has five fixed steps, from looking down at 45° to looking up at 18°, and the high ones also pull the camera in close. Smooth tilt tilts the camera for as long as you hold the button, to any angle between 55° down and 20° up, always as far from your hunter as the usual camera (or as Camera distance puts it), and the game eases the camera after it as it does between its steps. This picks what the disc starts with: the START menu's last entry, randomfu, changes it in game (in a quest or in the village), and your save keeps that choice and the angle. EU disc only: other discs keep the game's steps. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: {
      kind: "choice",
      choices: [
        { value: "steps", label: "Steps", help: "The game's own five steps." },
        { value: "slow", label: "Slow", help: "Smooth, 30° a second." },
        { value: "smooth", label: "Smooth", help: "Smooth, 50° a second." },
        { value: "fast", label: "Fast", help: "Smooth, 80° a second." },
      ],
    },
    default: "steps",
  },
  {
    key: "camera.photoMode",
    section: "Camera",
    label: "Photo mode",
    help: "In a quest, hold L and R and press START: the game stops where it is (as its own pause does, but without dimming the screen), the HUD goes, and the camera is yours. The stick turns it round what it looks at, the D-pad moves it along the ground, △ and × raise and lower it, □ and ○ bring it nearer and take it further, L and R zoom in and out, and SELECT puts it back where it started. START again puts the camera back as it was and the quest goes on. The camera goes through walls and the ground. Not online (the game can't pause there) and not in the village. This picks whether the disc starts with it on: the START menu's last entry, randomfu, turns it on or off in game, and your save keeps that choice. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "camera.target",
    section: "Camera",
    label: "Target camera",
    help: "L turns the camera to face a large monster in your area, from behind your hunter, as the newer games' target camera does, instead of behind where your hunter faces. It turns as smoothly as the game's own L. The target is the large monster nearest the middle of the screen; hold L and press D-pad left or right for the next one to that side. Press L twice quickly for the game's own L, behind your hunter; with no large monster in the area, L is the game's. D-pad left and right alone turn the camera as always, and let go of the target. This picks what the disc starts with: the START menu's last entry, randomfu, changes it in game, and your save keeps that choice. It goes in with that entry, so every disc caps received Guild Cards at 3 to make room for it.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Off", help: "L is the game's own: behind your hunter." },
        {
          value: "tap",
          label: "Tap",
          help: "L turns the camera to the monster once; then it stays where it is.",
        },
        {
          value: "follow",
          label: "Follow",
          help: "L keeps the monster in view until you press L twice, turn the camera with the D-pad, or the monster leaves or falls.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "quest.endWait",
    section: "Quest end",
    label: "Wait after a quest",
    help: "How long the game waits once a quest is completed or runs out of time, before the reward screen (a quest failed by fainting goes back as it always does). The game shows the Quest Complete banner for 5 s, then gives you a minute (20 s on gathering quests) to carve and gather before it takes you back. Treasure Hunting quests keep the game's wait, their time to deliver. This picks what the disc starts with: the START menu's last entry, randomfu, changes it in game, and your save keeps that choice. It's a change to the game's own code, so it works without randomfu's other code; with it, every disc caps received Guild Cards at 3, as for the camera.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "normal",
          label: "Normal",
          help: "The game's own: the banner, then a minute (20 s on gathering quests).",
        },
        {
          value: "short",
          label: "Short",
          help: "The banner, then 20 s for every quest: time to carve one monster.",
        },
        {
          value: "instant",
          label: "Instant",
          help: "Straight to the rewards: no banner wait and no time to carve.",
        },
      ],
    },
    default: "normal",
  },
  {
    key: "questMonsters.text",
    section: "Extras",
    label: "Rename monsters in quest text",
    help: "A swapped monster's name changes in the quest's title, goal, details and monster list, in every language, using names read from the disc's own quests. Text that can't change safely (another article, too long a line, no room) keeps the old name and is listed in the spoiler log. Seen working on the EU disc's Quest Details screen.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "questMonsters.mode",
    enabledWhen: ["shuffle", "randomize"],
  },
  {
    key: "hud.monsterHp",
    section: "HUD",
    label: "Monster health",
    help: "A short health gauge for each large monster in your area, on the left under your name plate, in the HUD's own frame and red. It follows the HUD: hidden in cutscenes and wherever the game hides your gauges. This picks the mode the disc starts in: the START menu's last entry, randomfu, changes it in game (in a quest or in the village), and your save keeps that choice. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Off", help: "No monster gauges." },
        {
          value: "painted",
          label: "On the map",
          help: "A monster's gauge shows while the map shows it: from a Paintball hit until the mark wears off.",
        },
        {
          value: "always",
          label: "Always",
          help: "Every large monster in your area shows its gauge.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "hud.damageNumbers",
    section: "HUD",
    label: "Damage numbers",
    help: "Each of your hits on a monster pops a number at the part it struck, in the game's own font, bold over a drop shadow: it lands big in a flash, settles, then rises and shrinks away; a weak point's shakes as it lands. It's the health the hit takes. White, orange on a weak point. Only your own hits; it follows the HUD. This picks the mode the disc starts in: the START menu's last entry, randomfu, changes it in game (in a quest or in the village), and your save keeps that choice. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Off", help: "No damage numbers." },
        { value: "total", label: "Total", help: "One number a hit: raw and element together." },
        {
          value: "split",
          label: "Split element",
          help: "The element's share is a second, smaller number in its element's colour: red fire, blue water, yellow thunder, cyan ice, magenta dragon.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "hud.attackHitboxes",
    section: "HUD",
    label: "Attack hitboxes",
    help: "A faint red shading over every monster attack that can hit you right now: the parts of its body that hurt during the attack, and projectiles like fireballs, filled in over the scene as the game places them. It follows the HUD: hidden in cutscenes and wherever the game hides your gauges. A few attacks whose shape the monster's own code places aren't drawn. This picks whether the disc starts with it on: the START menu's last entry, randomfu, turns it on or off in game (in a quest or in the village), and your save keeps that choice. Its code goes on every disc, so every disc caps received Guild Cards at 3 to make room for it.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "pact.enabled",
    section: "Hunter's Pact",
    label: "Hunter's Pact",
    help: "When a quest starts, a window in base camp offers three pacts drawn at random, each a penalty and the reward it pays: tougher or harder-hitting monsters, half the time, one cart, no supply box, a health or stamina cap or more to deliver (only those that fit the quest: no monster penalties on a gathering quest), for more zenny (at least a set amount per rank), more quest rewards (extra draws from the quest's own rewards), items or a weapon or armor piece of the quest's rank. The harder the penalty, the more its reward is worth: a handful of common items for a light one, one or two rare ones for a hard one. Monster penalties stack with elite monsters. Take any, or none and the quest is as it was. The clock stops while you choose; penalties last the quest, and rewards are paid only if you complete it. Caps received Guild Cards at 3 to make room for its code.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "poogie.enabled",
    section: "Poogie",
    label: "Poogie's luck",
    help: "Pet Poogie at home before a hunt. If it lies down happily, that hunt's carves, captures, breaks and quest rewards lean towards rarer rewards: each draw rolls twice and keeps the rarer. Poogie remembers: after 50 happy hunts on a save it rolls three times, after 200 four. Its count is kept in the save, and carries over to discs from other seeds. Caps received Guild Cards at 3 to make room for its code.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "elites.enabled",
    section: "Elite monsters",
    label: "Elite monsters",
    help: "Now and then a large monster is an elite: half again its health, hits 30% harder, moves 10% faster, enrages sooner and for half again as long, and is 15% bigger. Its hide has a faint crimson pulse. Each elite adds a reward draw, half the quest's zenny and points again, and makes the main reward's rarer items half again as likely. Rolled as each monster shows up, so the quest board doesn't tell. Stacks on randomized monster stats. Caps received Guild Cards at 3 to make room for its code.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
  },
  {
    key: "elites.chance",
    section: "Elite monsters",
    label: "Elite chance",
    help: "Each large monster's chance of being an elite, rolled once per quest as it shows up.",
    type: { kind: "number", min: 1, max: 100, step: 1, chance: true },
    default: 12,
    enabledBy: "elites.enabled",
  },
  {
    key: "quests.unknown",
    section: "Unknown Monster?! quests",
    label: "Unknown Monster?! quests",
    help: "Adds an investigation quest to the Guild 8★ and G★3 boards (high and G rank; low rank is left as it was). Each time you accept it, it rolls a monster met on that map in any quest, the map, size, crowns, difficulty for the rank, the rewards and whether you start in base camp or a random area (where that map's quests do either). The board doesn't say what you'll find, and the quest names the monster once it starts. Caps received Guild Cards at 3 to make room for the code.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "quests.keyLabel",
    section: "Key quests",
    label: "Mark key quests",
    help: "The Village Chief's quest card (and likely the Guild's, not yet tried) shows a yellow ★ in its top left corner when the quest is one of the key quests its star needs cleared before the Urgent Quest shows. Which quests are key doesn't change, but once monsters move, the usual lists of them stop helping. Caps received Guild Cards at 3 to make room for the code.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "rewards.sendAll",
    section: "Reward screen",
    label: "Send All to Item Box",
    help: "The reward screen's menu after a quest gets a row between Send to Item Box and End: Send All to Item Box sends every reward the Item Box can take in one go, the comrade's items too, and ends the screen. What doesn't fit stays, with the menu, to take or sell as before. It goes in with the START menu's randomfu entry, so a disc with too many other new features to fit that leaves it out too.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "smithy.improvePips",
    section: "Improve pips",
    label: "Mark weapons you can improve",
    help: "In the smithy's Improve, each weapon in the box that you can improve right now gets a small orange pip in its top left corner: you have the materials (pouch and box together) and the zenny for at least one of the weapons it improves into, as the game's own list of them would show. It goes in with the START menu's randomfu entry, so a disc with too many other new features to fit that leaves it out too.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "boot.skip",
    section: "Boot",
    label: "Faster start",
    help: "What the game shows from power-on. It normally asks for a language (EU), autoloads your options with a message to wait out, and shows a notice (EU), two logos and the intro movie before the title screen, then a menu and a list of saves. This can skip to the title screen, or on into the village with the hunter you saved last (else the first slot with a save), loaded on a black screen with no menu: hold START (or L or SELECT) from power-on to see the list of saves and choose, and Load Game from the title menu always shows the list. Either way the game keeps the PSP's language. It's a change to the title screens' own code, so it doesn't cap Guild Cards.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "normal",
          label: "Normal",
          help: "The game's own: language, notice, logos and the intro movie.",
        },
        {
          value: "title",
          label: "Title screen",
          help: "Straight to Press START: no language choice, autoload wait, notice, logos or intro movie.",
        },
        {
          value: "village",
          label: "Village",
          help: "Straight into the village with the hunter you saved last. Hold START from power-on for the list of saves.",
        },
      ],
    },
    default: "normal",
  },
];

const BY_KEY = new Map(OPTIONS.map((o) => [o.key, o]));

export function defaultSettings(seed: string): Settings {
  const settings: Record<string, unknown> = { seed };
  for (const option of OPTIONS) settings[option.key] = option.default;
  return settings as unknown as Settings;
}

export class SettingsError extends Error {}

/** Checks one value against its option, converting strings ("true", "0.5"). */
function coerceOption(key: string, value: unknown): Settings[OptionKey] {
  const option = BY_KEY.get(key as OptionKey);
  if (!option) throw new SettingsError(`Unknown setting "${key}"`);
  const type = option.type;
  if (type.kind === "boolean") {
    if (value === true || value === "true" || value === "on") return true;
    if (value === false || value === "false" || value === "off") return false;
    throw new SettingsError(`${key} must be true or false`);
  }
  if (type.kind === "number") {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < type.min || n > type.max) {
      throw new SettingsError(`${key} must be a number from ${type.min} to ${type.max}`);
    }
    return type.step >= 1 ? Math.round(n) : n;
  }
  if (typeof value !== "string" || !type.choices.some((c) => c.value === value)) {
    throw new SettingsError(`${key} must be one of ${type.choices.map((c) => c.value).join(", ")}`);
  }
  return value as Settings[OptionKey];
}

/** `base` with every key in `changes` applied and checked. */
export function applySettings(base: Settings, changes: Record<string, unknown>): Settings {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    if (key === "seed") {
      if (typeof value !== "string" || value.trim() === "") {
        throw new SettingsError("seed must be a non-empty string");
      }
      out.seed = value.trim();
    } else {
      out[key] = coerceOption(key, value);
    }
  }
  return out as unknown as Settings;
}

/**
 * True if the option is in effect: its `enabledBy` switch is on (or its
 * choice is at `enabledWhen`), and that option is in effect too.
 */
export function isActive(settings: Settings, option: OptionDef): boolean {
  if (!option.enabledBy) return true;
  const parent = BY_KEY.get(option.enabledBy)!;
  const value = settings[option.enabledBy];
  const on = option.enabledWhen ? option.enabledWhen.includes(String(value)) : value === true;
  return on && isActive(settings, parent);
}

/** What `settings` shuffle and randomize: every option in effect that does either, with which. */
export function actionsOf(settings: Settings): Map<OptionKey, Action> {
  const out = new Map<OptionKey, Action>();
  for (const option of OPTIONS) {
    if (!isActive(settings, option)) continue;
    const value = settings[option.key];
    const type = option.type;
    if (type.kind === "choice") {
      const action = type.choices.find((c) => c.value === value)?.action;
      if (action) out.set(option.key, action);
    } else if (option.action && (value === true || (typeof value === "number" && value > 0))) {
      out.set(option.key, option.action);
    }
  }
  return out;
}

// base64url by hand: the browser's Buffer has plain base64 only.
function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SettingsError("That settings string is damaged");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
}

export function encodeSettings(settings: Settings): string {
  const payload: Record<string, unknown> = { v: LOGIC_VERSION, seed: settings.seed };
  for (const option of OPTIONS) {
    if (settings[option.key] !== option.default) payload[option.key] = settings[option.key];
  }
  return `RF${toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"))}`;
}

/**
 * Options added on by default whose default changes what a disc does in a way
 * a player could lose by (Poogie's luck caps received Guild Cards): settings
 * made before one existed keep the value that matches what they made then.
 */
const ADDED: { key: OptionKey; version: number; before: Settings[OptionKey] }[] = [
  { key: "poogie.enabled", version: 15, before: false },
];

/**
 * Fills in, for settings from before an option in `ADDED` existed, the value
 * that keeps what they did: from a settings string of an older logic
 * `version`, or (with no version) from a full set of settings stored by an
 * older build, which lacks the key.
 */
export function withOlderDefaults(
  changes: Record<string, unknown>,
  version?: number,
): Record<string, unknown> {
  const out = { ...changes };
  for (const { key, version: since, before } of ADDED) {
    if (key in out) continue;
    if (version === undefined || version < since) out[key] = before;
  }
  return out;
}

/** Decodes a settings string. `version` is the logic version it was made with. */
export function decodeSettings(value: string): { settings: Settings; version: number } {
  const text = value.trim();
  if (!text.startsWith("RF")) throw new SettingsError("A settings string starts with RF");
  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(text.slice(2)).toString("utf8"));
  } catch {
    throw new SettingsError("That settings string is damaged");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new SettingsError("That settings string is damaged");
  }
  const { v, seed, ...options } = payload as Record<string, unknown>;
  if (typeof v !== "number" || typeof seed !== "string") {
    throw new SettingsError("That settings string is damaged");
  }
  return {
    settings: applySettings(defaultSettings(seed), withOlderDefaults(options, v)),
    version: v,
  };
}

/** Settings from a JSON file's contents: any subset of options, plus an optional seed. */
export function settingsFromJson(text: string, seed: string): Settings {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new SettingsError(`Settings file isn't valid JSON: ${(error as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SettingsError("Settings file must be a JSON object");
  }
  return applySettings(defaultSettings(seed), data as Record<string, unknown>);
}

/** The settings as a JSON file: every option, so it documents itself. */
export function settingsToJson(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** An option's value in words: yes/no, ±50%, ±4 levels, a number, or the choice's label. */
export function formatOption(option: OptionDef, value: Settings[OptionKey]): string {
  const type = option.type;
  if (type.kind === "boolean") return value ? "yes" : "no";
  if (type.kind === "number" && type.percent) return `±${Math.round(Number(value) * 100)}%`;
  if (type.kind === "number" && type.unit) return `±${String(value)} ${type.unit}`;
  if (type.kind === "number" && type.chance) return `${String(value)}%`;
  if (type.kind === "choice") {
    return type.choices.find((c) => c.value === value)?.label ?? String(value);
  }
  return String(value);
}

/** One line per option, for the spoiler log and the console. */
export function describeSettings(settings: Settings): string[] {
  return OPTIONS.filter((o) => isActive(settings, o)).map(
    (o) => `${o.section} / ${o.label}: ${formatOption(o, settings[o.key])}`,
  );
}

export interface Preset {
  name: string;
  /** The main differences from the other presets, one short point each. */
  points: readonly string[];
  /** Changes from the defaults. */
  changes: Partial<Record<OptionKey, boolean | number | string>>;
}

/** The monster, weapon and armor stat randomizers that Randomized, Full and Chaos all turn on. */
const STAT_RANDOMIZERS = {
  "questMonsters.crowns": true,
  "questMonsters.difficulty": true,
  "questMonsters.smallCounts": true,
  "monsterStats.hp": true,
  "monsterStats.size": true,
  "monsterStats.status": true,
  "weapons.attack": true,
  "weapons.affinity": true,
  "weapons.element": true,
  "weapons.slots": true,
  "armorStats.defense": "randomize",
  "armorStats.resistances": "randomize",
  "armorStats.slots": "randomize",
  "armorStats.rarity": "randomize",
} as const;

export const PRESETS: readonly Preset[] = [
  {
    name: "QoL only",
    points: [
      "Shuffles and randomizes nothing: items, monsters, equipment and numbers stay as on the disc",
      "Adds Send All to Item Box, the smithy's improve pips, photo mode, key quest marks and gathering nodes on the area map; all but the map's code caps received Guild Cards at 3",
      "Leaves out Poogie's luck and the bookshelf guides",
      "Turn on camera, HUD and quest extras in the later steps; the settings then show as custom, still with nothing shuffled",
      "Hunter's Pact, if you turn it on, draws its rewards from the seed",
    ],
    changes: {
      "questRewards.mode": "off",
      "monsterRewards.mode": "off",
      "camera.photoMode": true,
      "quests.keyLabel": true,
      "mods.nodeMap": true,
      "poogie.enabled": false,
      "hints.bookshelf": false,
      "hints.almanac": false,
    },
  },
  {
    name: "Rewards only",
    points: [
      "Quest rewards and carves are shuffled, at the same star level",
      "Nothing else changes",
    ],
    changes: {},
  },
  {
    name: "Shuffled",
    points: [
      "Moves things, rolls no new numbers",
      "Rewards, gathering points, supply boxes, recipe materials and shop stock trade places, at the same star level",
      "The smithy's weapons and armor, weapon sharpness and armor skills trade places",
      "Large monsters swap into their own variants; elemental weaknesses and weak spots trade places",
      "Armor pieces trade defense, resistances and slots with pieces of the same rarity and hunter type, and rarity within its rank",
    ],
    changes: {
      "gathering.mode": "shuffle",
      "supplies.mode": "shuffle",
      "recipes.mode": "shuffle",
      "weapons.enabled": true,
      "weapons.sharpness": true,
      "armor.enabled": true,
      "armorSkills.enabled": true,
      "armorStats.defense": "shuffle",
      "armorStats.resistances": "shuffle",
      "armorStats.slots": "shuffle",
      "armorStats.rarity": "shuffle",
      "shops.mode": "shuffle",
      "questMonsters.mode": "shuffle",
      "weaknesses.elements": true,
      "weaknesses.parts": true,
    },
  },
  {
    name: "Randomized",
    points: [
      "Moves nothing, rolls numbers anew",
      "Material amounts, crafting costs, shop prices, carry limits, quest money, time limits and delivery targets",
      "How often each quest's main reward list is drawn, and small monster counts",
      "Each quest's monster size, crown spread and difficulty; each monster's base HP, size and status resistance",
      "Weapon attack, affinity, element and slots; armor defense, resistances, slots and rarity",
      "Armor gets new skills, and a new hunter starts in random Low Rank armor",
    ],
    changes: {
      "questRewards.mode": "off",
      "questRewards.draws": 0.3,
      "monsterRewards.mode": "off",
      "recipes.amounts": true,
      "gathering.counts": true,
      "costs.enabled": true,
      "shops.prices": true,
      "shops.stacks": true,
      "terms.money": true,
      "terms.time": true,
      "deliveries.enabled": true,
      "armor.start": "rank",
      "armorSkills.enabled": true,
      "armorSkills.mode": "randomize",
      "questMonsters.size": true,
      ...STAT_RANDOMIZERS,
    },
  },
  {
    name: "Full",
    points: [
      "Shuffled and Randomized together, at the same star level, so every recipe stays craftable as early as before",
      "Gathering points draw from the whole rank; shops add Low Rank items and change prices",
      "Armor skills are shuffled while armor stats get new values; a new hunter starts in random Low Rank armor",
      "Monster difficulty stays within its rank",
    ],
    changes: {
      "recipes.mode": "shuffle",
      "recipes.amounts": true,
      "gathering.counts": true,
      "costs.enabled": true,
      "weapons.enabled": true,
      "weapons.sharpness": true,
      "armor.enabled": true,
      "armor.start": "rank",
      "armorSkills.enabled": true,
      "questRewards.draws": 0.3,
      "shops.mode": "randomize",
      "shops.scope": "low",
      "shops.prices": true,
      "shops.stacks": true,
      "gathering.mode": "randomize",
      "gathering.scope": "rank",
      "supplies.mode": "shuffle",
      "terms.money": true,
      "terms.time": true,
      "deliveries.enabled": true,
      "questMonsters.mode": "shuffle",
      "questMonsters.size": true,
      ...STAT_RANDOMIZERS,
      "weaknesses.elements": true,
      "weaknesses.parts": true,
    },
  },
  {
    name: "Chaos",
    points: [
      "Full with the limits off, and every number varies widely",
      "Recipes can use materials from anywhere, so they may need G Rank parts in Low Rank",
      "Weapons can change type, take any stat at any rarity, gain or change elements and slots, and get new sharpness bars",
      "Any monster can turn up on a map it lives on; quests can give any crown or difficulty",
      "Armor can come from any rarity, and a new hunter starts in any armor",
      "Armor gets new skills, even ones that may become impossible to activate",
      "Shops and gathering points can give anything",
    ],
    changes: {
      "questRewards.scope": "any",
      "questRewards.draws": 0.9,
      "monsterRewards.scope": "any",
      "recipes.mode": "shuffle",
      "recipes.scope": "any",
      "recipes.amounts": true,
      "recipes.amountSpread": 0.9,
      "gathering.counts": true,
      "gathering.countSpread": 0.9,
      "costs.enabled": true,
      "costs.spread": 0.9,
      "weapons.enabled": true,
      "weapons.mix": "any-type",
      "weapons.sharpness": true,
      "weapons.sharpnessMode": "new",
      "weapons.statRange": "any",
      "weapons.elementGain": 0.4,
      "weapons.elementKind": true,
      "weapons.slotSpread": 2,
      "armor.enabled": true,
      "armor.scope": "any",
      "armor.start": "any",
      "armorSkills.enabled": true,
      "armorSkills.mode": "randomize",
      "armorSkills.keepArmorOnly": false,
      "shops.mode": "randomize",
      "shops.scope": "any",
      "shops.mix": "all",
      "shops.keepEssentials": false,
      "shops.special": true,
      "shops.countSpread": 0.5,
      "shops.prices": true,
      "shops.priceSpread": 0.9,
      "shops.stacks": true,
      "shops.stackSpread": 0.9,
      "gathering.mode": "randomize",
      "gathering.scope": "any",
      "gathering.keepItems": false,
      "supplies.mode": "randomize",
      "supplies.scope": "any",
      "terms.money": true,
      "terms.moneySpread": 0.9,
      "terms.time": true,
      "terms.timeSpread": 0.6,
      "deliveries.enabled": true,
      "questMonsters.mode": "randomize",
      "questMonsters.scope": "any",
      "questMonsters.size": true,
      "questMonsters.sizeSpread": 0.5,
      ...STAT_RANDOMIZERS,
      "questMonsters.crownSpread": "wide",
      "questMonsters.difficultySpread": 12,
      "questMonsters.difficultyRange": "any",
      "questMonsters.smallCountSpread": 0.9,
      "monsterStats.hpSpread": 0.5,
      "monsterStats.sizeSpread": 0.4,
      "monsterStats.statusSpread": 0.9,
      "weaknesses.elements": true,
      "weaknesses.parts": true,
      "weapons.attackSpread": 0.5,
      "weapons.affinitySpread": 30,
      "weapons.elementSpread": 0.6,
      "armorStats.defenseSpread": 0.5,
      "armorStats.resistanceSpread": 5,
      "armorStats.raritySpread": 2,
    },
  },
];
