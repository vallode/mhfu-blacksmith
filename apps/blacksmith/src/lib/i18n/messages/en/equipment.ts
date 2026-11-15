import { tierLabel, type Tier } from "../../../min-rank";
import type { DecorationFilterId } from "../../../decoration-filter";

/**
 * The blacksmith (weapons), armorsmith and decorations: navs, trees, detail
 * panels, recipes and 3D models. Lookup tables keyed by the data's English
 * values (`ammo`, `recoil`, …) fall back to that value when a key is missing.
 */
export const equipment = {
  /** The top bar of each section. */
  nav: {
    search: "Search",
    /** The weapon type tabs, and the page heading: "Great Sword weapons". */
    weaponTypes: "Weapon types",
    weaponsTitle: (type: string) => `${type} weapons`,
    /** The armor slot tabs, and the page heading: "Head armor". */
    armorSlots: "Armor slots",
    armorTitle: (slot: string) => `${slot} armor`,
  },
  /** The tree sidebars. */
  tree: {
    /** Armor page with every piece hidden by the Quest progress preference. */
    nothingYet: "Nothing here is within your quest progress yet.",
    expand: "Expand",
    collapse: "Collapse",
    /** Screen-reader note after an owned piece's name. */
    ownedNote: " (owned)",
    canUpgradeNote: " (you can make this upgrade now)",
    canForgeNote: " (you can forge this now)",
    /** Decorations are made, not forged. */
    canMakeNote: " (you can make this now)",
    /** A row's tooltip when the hunter has everything to make it. */
    canUpgradeTitle: (cost: string) =>
      `You can make this upgrade now (${cost}z, materials in your item box)`,
    canForgeTitle: (cost: string) =>
      `You can forge this now (${cost}z, materials in your item box)`,
    canMakeTitle: (cost: string) => `You can make this now (${cost}z, materials in your item box)`,
    ownedTitle: "In your equipment box",
    /** An owned decoration: jewels sit in the item box or in equipment. */
    ownedJewelTitle: "In your item box or equipment",
    /** The [↑] after a weapon listed again under a second parent. */
    aliasLabel: "Upgrades listed above: go to them",
    aliasTitle: "Upgrades listed above",
    /** Armor rows: the max defence on the right. */
    maxDefence: "Max defence",
    maxDefenceTitle: (value: number) => `Max defence ${value}`,
    /** The material squares on a weapon row. */
    materialsOwned: (have: number, total: number) => `${have} of ${total} materials owned`,
    filterGroup: "Weapon tree filter",
    previousFilter: "Previous filter",
    nextFilter: "Next filter",
    filterCount: (matched: number, total: number) => `${matched} of ${total} weapons`,
    rankGroup: "Armor rank",
    previousRank: "Previous rank",
    nextRank: "Next rank",
  },
  /** The weapon tree filter (lib/tree-filter `TreeFilterId`). */
  treeFilters: {
    all: "All",
    owned: "Owned",
    "not-owned": "Not owned",
    craftable: "Craftable",
    "within-one": "Within 1 material",
  },
  /**
   * A quest progress stage (lib/min-rank `Tier`): "High Rank ★7", "G-Rank ★1".
   * Also used by the Options page and the set builder.
   */
  tierLabel: (tier: Tier): string => tierLabel(tier),
  /** A star level read out (`StarMarks`): "3 stars", "G 1 star". */
  stars: (count: number, g: boolean) =>
    `${g ? "G " : ""}${count} ${count === 1 ? "star" : "stars"}`,
  /** The right-hand card. */
  detail: {
    notFound: "Not found.",
    noData: "No data",
    improveCost: "Improve cost",
    createCost: "Create cost",
    altRecipe: "Alt. Recipe",
    slots: "Slots:",
    /** A recipe material with a save loaded. */
    haveTitle: (have: string) => `You have ${have} in your item box and pouch`,
    sharpness: "Sharpness",
    sharpnessPlus: "Sharpness +1",
  },
  weapon: {
    attack: "Attack:",
    maxAttack: "Max attack:",
    recoil: "Recoil:",
    reload: "Reload:",
    affinity: "Affinity:",
    /** Gunlance shelling type beside the attack: "[Long Type]". */
    shellingType: (type: string) => `[${type} Type]`,
    shellingLevel: (level: number | string) => `Shelling Lv${level}`,
    /** Hunting horn notes: "[Note: ♪♪♪ ]". */
    notesOpen: "[Note:",
    notesClose: "]",
    /** "Fire Attrib:", before the value. */
    elementAttrib: (element: string) => `${element} Attrib:`,
    /** Defense a weapon adds: "Defense +10". */
    defenseBonus: (bonus: string) => `Defense ${bonus}`,
    requirementsLabel: (name: string) => `${name} requirements`,
    tabs: {
      materials: "Materials",
      charge: "Charge",
      ammo: "Ammo",
      specialAmmo: "Special Ammo",
      coatings: "Coatings",
      melodies: "Melodies",
    },
    /** Bow charge levels. */
    chargeAttack: "[Charge Attack]",
    chargeLevel: "Lvl",
    chargeShot: (shot: string, level: number | string) => `${shot}Lv${level}`,
    /** Bowgun ammo table headers. */
    capacity: "Cap.:",
    ammoLevel: "LV",
    usableCoating: "[Usable Coating]",
    melodyCombo: "Combo",
    melodyEffect: "Effect",
    melodyDuration: "Duration",
    /** "3 mins", "1 min 30 s", "30 s". */
    duration: (minutes: number, seconds: number) =>
      [minutes > 0 && `${minutes} ${minutes === 1 ? "min" : "mins"}`, seconds > 0 && `${seconds} s`]
        .filter(Boolean)
        .join(" "),
    /** Note colours, by the data's letter (the note icons' alt text). */
    notes: {
      a: "Light blue",
      b: "Blue",
      g: "Green",
      p: "Purple",
      r: "Red",
      w: "White",
      y: "Yellow",
    } as Record<string, string>,
    recoilValues: {
      Moderate: "Moderate",
      Weak: "Weak",
      VeryWeak: "VeryWeak",
      Light: "Light",
    } as Record<string, string>,
    reloadValues: {
      VeryFast: "VeryFast",
      Fast: "Fast",
      Normal: "Normal",
      Slow: "Slow",
      VerySlow: "VerySlow",
    } as Record<string, string>,
    shellingTypes: {
      Normal: "Normal",
      Long: "Long",
      Spread: "Spread",
    } as Record<string, string>,
    /** Bow shot types, as the data abbreviates them. */
    shotTypes: {
      Rapd: "Rapd",
      Sctr: "Sctr",
      Prce: "Prce",
    } as Record<string, string>,
    /** Bowgun ammo, as the game's ammo table abbreviates it. */
    ammo: {
      "Normal S": "Normal S",
      "Pierce S": "Pierce S",
      "Pellet S": "Pellet S",
      "Crag S": "Crag S",
      "Clust S": "Clust S",
      RecovS: "RecovS",
      PoisnS: "PoisnS",
      "Para S": "Para S",
      SleepS: "SleepS",
      "Flame S": "Flame S",
      "Water S": "Water S",
      ThunderS: "ThunderS",
      "Freeze S": "Freeze S",
      "Dragon S": "Dragon S",
      "Tranq S": "Tranq S",
      "Paint S": "Paint S",
      "Demon S": "Demon S",
      "Armor S": "Armor S",
    } as Record<string, string>,
    /** Bow coatings, in the order the game lists them. */
    coatings: {
      "Power Coating": "Power Coating",
      "Poison Coating": "Poison Coating",
      CloseRngCoating: "CloseRngCoating",
      ParalysisCoating: "ParalysisCoating",
      "Paint Coating": "Paint Coating",
      "Sleep Coating": "Sleep Coating",
    } as Record<string, string>,
  },
  armor: {
    defence: "Defence:",
    maxDefence: "Max defence:",
    fireRes: "Fire res:",
    waterRes: "Water res:",
    thunderRes: "Thunder res:",
    iceRes: "Ice res:",
    dragonRes: "Dragon res:",
    detailsLabel: (name: string) => `${name} details`,
    tabs: {
      skills: "Skills",
      create: "Create cost",
    },
    /** Who can wear a piece, as the data has it. */
    sex: {
      Male: "Male",
      Female: "Female",
      "Male/Female": "Male/Female",
    } as Record<string, string>,
    hunterType: {
      Blademaster: "Blademaster",
      Gunner: "Gunner",
      "Blademaster/Gunner": "Blademaster/Gunner",
    } as Record<string, string>,
  },
  decoration: {
    /** The search box above the list. */
    searchLabel: "Filter decorations by name or skill",
    searchPlaceholder: "Filter by name or skill, e.g. Attack",
    noMatch: "No decorations match.",
    /** The selector under the list (lib/decoration-filter). */
    filterGroup: "Decoration filter",
    filterCount: (matched: number, total: number) => `${matched} of ${total} decorations`,
    filters: {
      all: "All",
      "slots-1": "1 slot",
      "slots-2": "2 slots",
      "slots-3": "3 slots",
      owned: "Owned",
      "not-owned": "Not owned",
      craftable: "Craftable",
      "within-one": "Within 1 material",
    } satisfies Record<DecorationFilterId, string>,
    /** With a save loaded: jewels in the item box and pouch, and attached to equipment. */
    owned: "Owned:",
    attached: (count: string) => `+${count} attached`,
    recipesLabel: (name: string) => `${name} recipes`,
  },
  /** The star beside a weapon's or armor piece's name, and its toasts. */
  wishlist: {
    add: "Add to wishlist",
    remove: "Remove from wishlist",
    added: (name: string) => `${name} added to your wishlist.`,
    removed: (name: string) => `${name} taken off your wishlist.`,
    /** The toast's button to the wishlist page. */
    view: "View",
    saveFailed: "Couldn't save the wishlist in this browser.",
  },
  /** The 3D model button and popover. */
  model: {
    view: "View 3D model",
    hide: "Hide 3D model",
    close: "Close 3D model",
    label: (name: string) => `3D model of ${name}`,
    loading: "Loading model…",
    unavailable: "Model unavailable.",
    /** The armor model's male/female switch. */
    switchLabel: "Model",
    male: "Male",
    female: "Female",
    /** The model's accessible name: "Rathalos Helm (male)". */
    maleModel: (name: string) => `${name} (male)`,
    femaleModel: (name: string) => `${name} (female)`,
    /** The motion controls over an animated model. */
    motions: "Motions",
    motion: "Motion",
    previousMotion: "Previous motion",
    nextMotion: "Next motion",
    play: "Play",
    pause: "Pause",
    /** The hunter's motions (lib/hunter names them in English). */
    sheathedIdle: "Sheathed idle",
    drawnIdle: "Drawn idle",
    moveN: (n: number) => `Move ${n}`,
    attackN: (n: number) => `Attack ${n}`,
  },
};
