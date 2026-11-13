/**
 * Every randomizer option, described once. The CLI, settings files, the
 * shareable settings string and the GUI all work from `OPTIONS`.
 *
 * Settings are a flat object keyed by option (`"recipes.amountSpread"`), so
 * they serialize as they are. A settings string is "RF" plus base64url JSON
 * of the seed, the logic version and every option that isn't its default:
 * with the same disc, it reproduces the same game.
 */
import { LOGIC_VERSION } from "./version.js";

export interface Settings {
  seed: string;
  "logic.tiers": "star" | "rank" | "none";
  "questRewards.enabled": boolean;
  "monsterRewards.enabled": boolean;
  "monsterRewards.captureAndBreaks": boolean;
  "gathering.enabled": boolean;
  "gathering.pool": "gathered" | "rank" | "any";
  "gathering.keepItems": boolean;
  "supplies.enabled": boolean;
  "supplies.pool": "supplies" | "rank" | "add";
  "supplies.keepEssentials": boolean;
  "terms.money": boolean;
  "terms.moneySpread": number;
  "terms.time": boolean;
  "terms.timeSpread": number;
  "deliveries.enabled": boolean;
  "recipes.materials": boolean;
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
  "armor.enabled": boolean;
  "armorSkills.enabled": boolean;
  "armorSkills.mode": "shuffle" | "randomize";
  "armorSkills.keepArmorOnly": boolean;
  "shops.enabled": boolean;
  "shops.pool": "shop" | "low" | "high" | "any";
  "shops.mix": "each" | "all";
  "shops.keepEssentials": boolean;
  "shops.special": boolean;
  "shops.countSpread": number;
  "shops.prices": boolean;
  "shops.priceSpread": number;
  "shops.stacks": boolean;
  "shops.stackSpread": number;
  "questMonsters.species": boolean;
  "questMonsters.speciesPool": "variants" | "rank" | "any";
  "questMonsters.text": boolean;
  "questMonsters.difficulty": boolean;
  "questMonsters.difficultySpread": number;
  "questMonsters.difficultyRange": "rank" | "any";
  "questMonsters.size": boolean;
  "questMonsters.sizeSpread": number;
  "questMonsters.crowns": boolean;
  "questMonsters.crownSpread": "random" | "wide" | "none";
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

export interface OptionDef {
  key: OptionKey;
  section: string;
  label: string;
  help: string;
  type: OptionType;
  default: boolean | number | string;
  /** Shuffle or randomize: left out for options that only tune another (and for Logic). */
  action?: Action;
  /** Needs the decrypted EBOOT when on (or, for non-booleans, when `enabledBy` is on). */
  eboot?: boolean;
  /** A boolean option that must be on for this one to matter. */
  enabledBy?: OptionKey;
}

const SPREAD = { kind: "number", min: 0, max: 0.95, step: 0.05, percent: true } as const;

export const OPTIONS: readonly OptionDef[] = [
  {
    key: "logic.tiers",
    section: "Logic",
    label: "How far items can move",
    help: "An item's point in the game is the rank and star level where it's first found: the earliest Village or Guild quest that rewards it, has a monster that gives it, or has a gathering point with it.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Items only move between places at the same rank and star level. A 1★ recipe stays craftable at 1★.",
        },
        {
          value: "rank",
          label: "Same rank",
          help: "Items move anywhere within Low, High or G Rank. Early recipes can ask for late Low Rank parts.",
        },
        {
          value: "none",
          label: "Anywhere (chaos)",
          help: "No logic: any item can go anywhere. Recipes may need G Rank parts in Low Rank.",
        },
      ],
    },
    default: "star",
  },
  {
    key: "questRewards.enabled",
    section: "Quest rewards",
    label: "Shuffle quest rewards",
    help: "Reward items and amounts move between Village and Guild quests at the same point in the game (see Logic); each slot keeps its chance. Training School and Treasure Hunting quests are left alone.",
    type: { kind: "boolean" },
    default: true,
    action: "shuffle",
  },
  {
    key: "monsterRewards.enabled",
    section: "Monster rewards",
    label: "Shuffle carves and shiny drops",
    help: "Body carves, tail carves and shiny drops move between monsters at the same point in the game (see Logic); each slot keeps its chance.",
    type: { kind: "boolean" },
    default: true,
    action: "shuffle",
  },
  {
    key: "monsterRewards.captureAndBreaks",
    section: "Monster rewards",
    label: "Include capture and break rewards",
    help: "Capture rewards and part-break rewards are shuffled along with carves.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "monsterRewards.enabled",
  },
  {
    key: "gathering.enabled",
    section: "Gathering",
    label: "Shuffle gathering points",
    help: "Items from mining, gathering and bug catching points move between Village and Guild quests at the same point in the game (see Logic); each spot keeps its odds. Training School and Treasure Hunting quests are left alone.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "gathering.pool",
    section: "Gathering",
    label: "What gathering points give",
    help: "Where gathering points' items come from.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "gathered",
          label: "Gathering point items",
          help: "Only items gathering points give anyway, moved between spots.",
        },
        {
          value: "rank",
          label: "Any item from the same rank",
          help: "Anything first found at the quest's rank, monster parts included: a Low Rank quest's spots give Low Rank items, and likewise High and G Rank.",
        },
        {
          value: "any",
          label: "Any item (chaos)",
          help: "Any item in the game, at any rank.",
        },
      ],
    },
    default: "gathered",
    enabledBy: "gathering.enabled",
  },
  {
    key: "gathering.keepItems",
    section: "Gathering",
    label: "Keep every gatherable item findable",
    help: "With a wider pool, each item gathering points give is still at one or more spots at the same point in the game, so recipes stay craftable. The other spots get random items.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "gathering.enabled",
  },
  {
    key: "supplies.enabled",
    section: "Supplies",
    label: "Shuffle supply boxes",
    help: "Each Village and Guild quest's supply box holds other items from the game. Stacks laid out once per hunter change together, and a delivery quest's box never gets the item it asks for.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "supplies.pool",
    section: "Supplies",
    label: "What supply boxes hold",
    help: "Where supply box items come from.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "supplies",
          label: "Supply box items",
          help: "Only items supply boxes hold anyway: items and amounts move between the boxes of quests at the same point in the game (see Logic).",
        },
        {
          value: "rank",
          label: "Any item from the same rank",
          help: "Anything first found at the quest's rank, or held by any supply box, in its usual amount.",
        },
        {
          value: "add",
          label: "Add random items (chaos)",
          help: "Each box keeps what it has and gets up to 4 more stacks of any item in the game, in its usual amount. A Low Rank box can hold G Rank parts.",
        },
      ],
    },
    default: "supplies",
    enabledBy: "supplies.enabled",
  },
  {
    key: "supplies.keepEssentials",
    section: "Supplies",
    label: "Keep maps and quest supplies",
    help: "Maps, ballista and cannon ammo and the other quest-only supplies stay where they are. A quest's Paw Pass Ticket always stays. (Adding random items keeps everything anyway.)",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "supplies.enabled",
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
    key: "recipes.materials",
    section: "Crafting",
    label: "Shuffle recipe materials",
    help: "Each crafting and upgrade material is replaced by another from the same point in the game (see Logic). Shop, combined and ticket items stay.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
    eboot: true,
  },
  {
    key: "recipes.amounts",
    section: "Crafting",
    label: "Randomize material amounts",
    help: "Each amount is rescaled to how many of that material recipes usually ask for, then varied.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
    eboot: true,
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
    eboot: true,
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
    help: "Each spot in the smithy's weapon trees makes a different weapon of the same rarity. Spots keep their materials and upgrade paths; weapons keep their stats and cost wherever they go.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
    eboot: true,
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
    help: "Each weapon's attack varies, staying within what weapons of its type have from one rarity below to one above. Sharpness, slots, defense bonus, horn notes, shelling, ammo and cost stay fixed. Stats go with the weapon wherever the smithy makes it.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
    eboot: true,
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
    help: "Each weapon's affinity moves up or down in steps of 5%, staying within what weapons of its type have from one rarity below to one above.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
    eboot: true,
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
    help: "Weapons with an element or status get a new value for it, staying within what weapons of its type have from one rarity below to one above. They keep which element or status it is; weapons without one stay without, and dual-element weapons keep theirs. A weapon that's the only one of its type with that element or status nearby varies by the spread alone.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
    eboot: true,
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
    key: "armor.enabled",
    section: "Armor",
    label: "Shuffle which armor the smithy makes",
    help: "Each spot in the smithy makes a different armor piece for the same slot and rarity, wearable by the same hunters (Blademaster, Gunner or both; male, female or both). Spots keep their materials; pieces keep their stats, skills and cost.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
    eboot: true,
  },
  {
    key: "armorSkills.enabled",
    section: "Armor",
    label: "Change armor skills",
    help: "The skill points on armor pieces change. Each piece keeps how many skills it has and which are negative; Torso Up and decorations stay as they are.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
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
    key: "shops.enabled",
    section: "Shop stock",
    label: "Shuffle shop stock",
    help: "Each item a shop sells is replaced by another item from the game, the same in every stage of that shop, so later stages still include earlier stock.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "shops.pool",
    section: "Shop stock",
    label: "What shops can sell",
    help: "Where replacement items come from.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "shop",
          label: "Shop items",
          help: "Only items shops sell anyway, moved to other shops and stages.",
        },
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
    default: "shop",
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.mix",
    section: "Shop stock",
    label: "Replacements across shops",
    help: "Whether an item is replaced by the same thing in every shop. With shop items only, this also decides whether shops trade stock.",
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
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.keepEssentials",
    section: "Shop stock",
    label: "Keep the essentials on sale",
    help: "Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay where they are.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.special",
    section: "Shop stock",
    label: "Include the Point Exchange",
    help: "The Pokke Village shop that takes Pokke Points: Armor Spheres, jewels, Pokke Tickets and Gourmet BBQ Spit. Off keeps armor upgrades as usual.",
    type: { kind: "boolean" },
    default: false,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.countSpread",
    section: "Shop stock",
    label: "Stock size variation",
    help: "How far the number of items each shop sells can move, up or down, every stage alike. Above 0%, the shop lists are rewritten and the game is pointed at their new places.",
    type: SPREAD,
    default: 0,
    action: "randomize",
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.prices",
    section: "Shop prices",
    label: "Randomize prices",
    help: "The price of everything shops sell changes, with or without the stock shuffle (with it, of what they sell now). A price is the item's own, so it's the same in every shop.",
    type: { kind: "boolean" },
    default: false,
    action: "randomize",
    eboot: true,
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
    eboot: true,
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
    key: "questMonsters.species",
    section: "Quest monsters",
    label: "Shuffle large monsters",
    help: "Village and Guild quests get other large monsters from the game. A monster only goes to a map it's found on somewhere in the game, and the quest's target follows it. Tried on the EU disc.",
    type: { kind: "boolean" },
    default: false,
    action: "shuffle",
  },
  {
    key: "questMonsters.speciesPool",
    section: "Quest monsters",
    label: "What large monsters can become",
    help: "Where replacement monsters come from.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "variants",
          label: "Variants only",
          help: "A monster becomes one of its own variants: Rathian, Pink Rathian or Gold Rathian. Quests with several monsters change too.",
        },
        {
          value: "rank",
          label: "Any monster from the same rank",
          help: "Any large monster found in a quest of the same rank (Low, High or G). Only quests with one kind of large monster change.",
        },
        {
          value: "any",
          label: "Any monster (chaos)",
          help: "Any large monster found on the quest's map, at any rank. Only quests with one kind of large monster change.",
        },
      ],
    },
    default: "variants",
    enabledBy: "questMonsters.species",
  },
  {
    key: "questMonsters.text",
    section: "Quest monsters",
    label: "Rename monsters in quest text",
    help: "A swapped monster's name changes in the quest's title, goal, details and monster list, in every language, using names read from the disc's own quests. Text that can't change safely (another article, too long a line, no room) keeps the old name and is listed in the spoiler log. Seen working on the EU disc's Quest Details screen.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "questMonsters.species",
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
    help: "Each large monster's size is rolled around its quest's size, and the quest picks one of five spreads that limit the roll: none, 100-105%, 100-115%, 95-114% or 85-125%. The spread decides which crowns a quest can give. Story quests that hold their monsters at 100% until first cleared still do. Worked out from the game's code; not yet tried in game.",
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
    help: "Each monster's base size changes, in every quest it appears in, on top of the quest's own size. Untested on a real disc: big changes may look or play oddly.",
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
    section: "Hints",
    label: "Monster guide on the bookshelf",
    help: "The house bookshelf's Practical Hunting monster articles (Open Bookshelf, Info Magazine) become the RandomFU Bestiary: one page per large monster rating its elemental weaknesses, softest parts, status resistance and health in stars, as the shuffles left them, readable from the start. In English in every language. EU disc only; seen on the shelf in PPSSPP.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "hints.almanac",
    section: "Hints",
    label: "Item almanac on the bookshelf",
    help: "The house bookshelf's Lay of the Land articles (Open Bookshelf, Info Magazine) become the RandomFU Almanac: a line per crafting material, A to Z, naming the shops that sell it and its earliest gathering spots, carves, captures, breaks and quest rewards, as the shuffles left them, readable from the start. In English in every language. EU disc only.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
  },
];

const BY_KEY = new Map(OPTIONS.map((o) => [o.key, o]));

export function defaultSettings(seed: string): Settings {
  const settings: Record<string, unknown> = { seed };
  for (const option of OPTIONS) settings[option.key] = option.default;
  return settings as unknown as Settings;
}

export class SettingsError extends Error {}

/** Checks one value against its option, converting CLI strings ("true", "0.5"). */
export function coerceOption(key: string, value: unknown): Settings[OptionKey] {
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

/** Parses `key=value,key=value` (the CLI's `--set`). */
export function parseAssignments(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(",")) {
    if (!part.trim()) continue;
    const eq = part.indexOf("=");
    if (eq === -1) throw new SettingsError(`Expected key=value, got "${part}"`);
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** True if any option that needs the decrypted EBOOT is on. */
export function needsEboot(settings: Settings): boolean {
  return OPTIONS.some((o) => o.eboot && settings[o.key] === true && isActive(settings, o));
}

/** True if the option is in effect: its `enabledBy` switch, and that switch's, are on. */
export function isActive(settings: Settings, option: OptionDef): boolean {
  if (!option.enabledBy) return true;
  const parent = BY_KEY.get(option.enabledBy)!;
  return settings[option.enabledBy] === true && isActive(settings, parent);
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

export const PRESETS: readonly Preset[] = [
  {
    name: "Rewards only",
    help: "The defaults: quest rewards and carves are shuffled, at the same star level. Nothing else changes.",
    changes: {},
  },
  {
    name: "Shuffled",
    help: "Moves things, changes no numbers: rewards, gathering points, supply boxes, recipe materials, the smithy's weapons and armor, armor skills, shop stock and large monsters (into their own variants) all trade places, at the same star level. Every amount, cost and stat stays as it was.",
    changes: {
      "gathering.enabled": true,
      "supplies.enabled": true,
      "recipes.materials": true,
      "weapons.enabled": true,
      "armor.enabled": true,
      "armorSkills.enabled": true,
      "shops.enabled": true,
      "questMonsters.species": true,
    },
  },
  {
    name: "Randomized",
    help: "Changes numbers, moves nothing: every reward, weapon and monster stays where it was, but material amounts, crafting costs, shop prices, carry limits, quest money, time limits, delivery targets and each quest's monster size are rolled anew, and armor gets new skills.",
    changes: {
      "questRewards.enabled": false,
      "monsterRewards.enabled": false,
      "recipes.amounts": true,
      "costs.enabled": true,
      "shops.prices": true,
      "shops.stacks": true,
      "terms.money": true,
      "terms.time": true,
      "deliveries.enabled": true,
      "armorSkills.enabled": true,
      "armorSkills.mode": "randomize",
      "questMonsters.size": true,
    },
  },
  {
    name: "Full",
    help: "Shuffled and Randomized together, at the same star level, so every recipe stays craftable as early as before. Gathering points draw from the whole rank, shops add Low Rank items and prices change; armor skills are shuffled.",
    changes: {
      "recipes.materials": true,
      "recipes.amounts": true,
      "costs.enabled": true,
      "weapons.enabled": true,
      "armor.enabled": true,
      "armorSkills.enabled": true,
      "shops.enabled": true,
      "shops.pool": "low",
      "shops.prices": true,
      "shops.stacks": true,
      "gathering.enabled": true,
      "gathering.pool": "rank",
      "supplies.enabled": true,
      "terms.money": true,
      "terms.time": true,
      "deliveries.enabled": true,
      "questMonsters.species": true,
      "questMonsters.size": true,
    },
  },
  {
    name: "Chaos",
    help: "Full with the limits off. Logic is at Anywhere, so recipes may need G Rank parts in Low Rank. Weapons can change type, any monster can turn up on a map it lives on, armor gets new skills, shops and gathering points can give anything, and every number varies widely.",
    changes: {
      "logic.tiers": "none",
      "recipes.materials": true,
      "recipes.amounts": true,
      "recipes.amountSpread": 0.9,
      "costs.enabled": true,
      "costs.spread": 0.9,
      "weapons.enabled": true,
      "weapons.mix": "any-type",
      "armor.enabled": true,
      "armorSkills.enabled": true,
      "armorSkills.mode": "randomize",
      "shops.enabled": true,
      "shops.pool": "any",
      "shops.mix": "all",
      "shops.keepEssentials": false,
      "shops.special": true,
      "shops.countSpread": 0.5,
      "shops.prices": true,
      "shops.priceSpread": 0.9,
      "shops.stacks": true,
      "shops.stackSpread": 0.9,
      "gathering.enabled": true,
      "gathering.pool": "any",
      "gathering.keepItems": false,
      "supplies.enabled": true,
      "supplies.pool": "add",
      "terms.money": true,
      "terms.moneySpread": 0.9,
      "terms.time": true,
      "terms.timeSpread": 0.6,
      "deliveries.enabled": true,
      "questMonsters.species": true,
      "questMonsters.speciesPool": "any",
      "questMonsters.size": true,
      "questMonsters.sizeSpread": 0.5,
    },
  },
];
