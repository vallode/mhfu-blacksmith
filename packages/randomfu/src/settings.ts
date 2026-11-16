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
  "armor.enabled": boolean;
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
  "weaknesses.elements": boolean;
  "weaknesses.parts": boolean;
  "hints.bookshelf": boolean;
  "hints.almanac": boolean;
  "mods.nodeMap": boolean;
  "hud.monsterHp": "off" | "painted" | "always";
  "elites.enabled": boolean;
  "elites.chance": number;
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
    key: "armor.enabled",
    section: "Armor",
    label: "Shuffle which armor the smithy makes",
    help: "Each spot in the smithy makes a different armor piece for the same slot and rarity, wearable by the same hunters (Blademaster, Gunner or both; male, female or both). Spots keep their materials; pieces keep their stats, skills and cost. The smithy's store follows: it sells the pieces now in the spots of the ones it sold.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
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
    help: "What happens to what shops sell. Each item a shop sells is replaced by one other item, the same in every stage of that shop, so later stages still include earlier stock.",
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
    help: "How far the number of items each shop sells can move, up or down, every stage alike. Above 0%, the shop lists are rewritten and the game is pointed at their new places.",
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
          help: "A monster becomes any large monster found on the quest's map within the scope. Only quests with one kind of large monster change.",
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
    help: "How many of each small monster a Village or Guild quest has. Never more than any quest has on the disc.",
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
    help: "Each monster's base HP changes, in every quest it appears in. Quests still multiply it by their own difficulty.",
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
    help: "The map screen's pictures get a marker at every gathering (green), mining (orange) and bug catching (yellow) node of the map, so you can see where the points are. Each map's picture is shared by all its quests, so the markers show the map's nodes, not one quest's. EU disc only.",
    type: { kind: "boolean" },
    default: false,
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
    help: "A short health gauge for each large monster in your area, on the left under your name plate, in the HUD's own frame and red. It follows the HUD: hidden in cutscenes and wherever the game hides your gauges. Caps received Guild Cards at 3 to make room for the code that draws it.",
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
    key: "elites.enabled",
    section: "Elite monsters",
    label: "Elite monsters",
    help: "Now and then a large monster is an elite: half again its health, hits 30% harder, moves 10% faster, enrages sooner and for half again as long, and is 15% bigger. Its hide has a faint crimson pulse. Each elite adds a reward draw, half the quest's zenny and points again, and makes the main reward's rarer items half again as likely. Rolled as each monster shows up, so the quest board doesn't tell. Stacks on the monster stats above. Caps received Guild Cards at 3 to make room for its code.",
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
  return { settings: applySettings(defaultSettings(seed), options), version: v };
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
  help: string;
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
    name: "Rewards only",
    help: "The defaults: quest rewards and carves are shuffled, at the same star level. Nothing else changes.",
    changes: {},
  },
  {
    name: "Shuffled",
    help: "Moves things, rolls no new numbers: rewards, gathering points, supply boxes, recipe materials, the smithy's weapons and armor, weapon sharpness, armor skills, shop stock, large monsters (into their own variants) and every monster's elemental weaknesses and weak spots all trade places, at the same star level. Armor pieces also trade their defense (with how far spheres upgrade it), resistances and slots with pieces of the same rarity and hunter type, and their rarity within its rank. No amount, cost or stat is rolled anew.",
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
    help: "Changes numbers, moves nothing: every reward, weapon and monster stays where it was, but material amounts, crafting costs, shop prices, carry limits, quest money, time limits, how often each quest's main reward list is drawn, delivery targets, small monster counts, each quest's monster size, crown spread and difficulty, each monster's base HP, size and status resistance, each weapon's attack, affinity, element and slots, and each armor piece's defense, resistances, slots and rarity are rolled anew, and armor gets new skills.",
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
      "armorSkills.enabled": true,
      "armorSkills.mode": "randomize",
      "questMonsters.size": true,
      ...STAT_RANDOMIZERS,
    },
  },
  {
    name: "Full",
    help: "Shuffled and Randomized together, at the same star level, so every recipe stays craftable as early as before. Gathering points draw from the whole rank, shops add Low Rank items and prices change; armor skills are shuffled while armor stats get new values, and monster difficulty stays within its rank.",
    changes: {
      "recipes.mode": "shuffle",
      "recipes.amounts": true,
      "gathering.counts": true,
      "costs.enabled": true,
      "weapons.enabled": true,
      "weapons.sharpness": true,
      "armor.enabled": true,
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
    help: "Full with the limits off. Recipes can use materials from anywhere, so they may need G Rank parts in Low Rank. Weapons can change type, take any stat their type has at any rarity, gain or change elements and slots, and get new sharpness bars; any monster can turn up on a map it lives on, armor gets new skills (even ones that may become impossible to activate), shops and gathering points can give anything, quests can give any crown or any difficulty, and every number varies widely.",
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
