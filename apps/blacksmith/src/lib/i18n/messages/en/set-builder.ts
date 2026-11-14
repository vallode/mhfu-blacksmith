/**
 * The set builder (/set-builder/): the skills and options, the search bar,
 * results and weapon suggestions, the set editor and its pickers, "My sets",
 * and share links. Game names (armor, decorations, skills, weapons) come from
 * useGameText(), not from here.
 */
import { createElement, Fragment, type ReactNode } from "react";

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const setBuilder = {
  hunterTypes: {
    Blademaster: "Blademaster",
    Gunner: "Gunner",
  },
  sexes: {
    Male: "Male",
    Female: "Female",
  },

  /** The skills card, and the options sheet (SearchOptions). */
  form: {
    title: "Skills",
    /** Takes every wanted skill off. */
    clear: "Clear",
    /** The chip that opens the skills sheet: with no skills yet, and with some. */
    addFirst: "+ Add the skills you want",
    addMore: "+ Skill",
    /** The skills sheet's title; `n` is how many are chosen. */
    skillsTitle: (n: number) => (n > 0 ? `Skills (${n})` : "Skills"),
    /** The options line's button ("Options ›") and the options sheet's title. */
    options: "Options",
    optionsLabel: "Options: hunter, rank, weapon slots, sort",
    hunter: "Hunter",
    /** The hunter row's value: `hunterType` and `sex` are translated. */
    hunterSummary: (hunterType: string, sex: string) => `${hunterType}, ${sex.toLowerCase()}`,
    weaponClass: "Weapon class",
    sex: "Sex",
    rank: "Armor up to",
    /** The rank buttons' text, and the options line's. */
    rankShort: {
      "low-rank": "LR",
      "high-rank": "HR",
      "g-rank": "G",
    },
    weaponSlots: "Weapon slots",
    slotCount: (n: number) => (n === 0 ? "No slots" : n === 1 ? "1 slot" : `${n} slots`),
    sortBy: "Best first by",
    sortNote: "Ties go to the higher defence.",
    /** The sorts (lib/set-search.ts SortKey). */
    sorts: {
      defence: "Defence",
      fire: "Fire",
      water: "Water",
      thunder: "Thunder",
      ice: "Ice",
      dragon: "Dragon",
      slots: "Free slots",
    },
    /** The options in one line, under the skills. */
    summary: {
      rank: "Rank",
      /** Beside the weapon's slots ("OO-"). */
      weapon: "Wpn",
      badSkills: "bad skills allowed",
      allQuests: "all quests",
      ownedArmor: "owned armor",
      alwaysUsed: (n: number) => `${n} always used`,
      neverUsed: (n: number) => `${n} never used`,
    },
    allowBadSkills: "Allow bad skills",
    allowBadSkillsNote: "Keep sets that also activate a negative skill, such as Defense -20.",
    ignoreProgress: "Ignore quest progress",
    /** `options` is a link to the Options page. */
    ignoreProgressNote: (tier: string, options: ReactNode) =>
      createElement(
        Fragment,
        null,
        `Your quest progress (${tier}, set on the `,
        options,
        " page) leaves out armor and decorations that need materials from later quests. Turn on to search all of them.",
      ),
    ownedOnly: "Owned armor only",
    ownedOnlyNote: "Only use armor in your hunter's equipment box.",
    /** The locked pieces, in the options; `remove` labels each one's chip. */
    locked: {
      title: "Always used",
      note: "Every set uses these, whatever the rank or quest progress, if the hunter can wear them.",
      remove: (name: string) => `Take ${name} off the always used pieces`,
    },
    excluded: {
      title: "Never used",
      note: "The search never uses these.",
      remove: (name: string) => `Take ${name} off the never used pieces`,
    },
    search: "Search",
    cancel: "Cancel",
  },

  /** The search button's bar (SearchBar). */
  searchBar: {
    /** `found` is the number of sets found so far, formatted, or null before any. */
    searching: (found: ReactNode) => createElement(Fragment, null, "Searching… ", found),
    update: "Update results",
    search: (n: number) => `Search ${n} ${s(n, "skill", "skills")}`,
  },

  tabs: {
    results: "Results",
    editor: "Editor",
    sets: "My sets",
  },

  /** The Results tab and the search's status messages. */
  results: {
    loadError: "Couldn't load the armor data.",
    loading: "Loading armor…",
    /** `found` is the number of sets found so far, formatted; "" before any. */
    searching: (found: string) => (found ? `Searching… ${found}` : "Searching…"),
    intro:
      "Add the skills you want, then search: every armor set with decorations that activates them. The best sets come first: by defence, or by what you sort by.",
    addSkills: "Add skills",
    /**
     * `progress`: the search was limited by quest progress; `locked` and
     * `excluded`: it had always used or never used pieces.
     */
    noSets: (progress: boolean, locked: boolean, excluded: boolean): string => {
      const tips = [
        "fewer skills",
        "a higher rank",
        "more weapon slots",
        "allowing bad skills",
        ...(locked ? ["unlocking pieces"] : []),
        ...(excluded ? ["removing excluded pieces"] : []),
        ...(progress ? ["ignoring your quest progress"] : []),
      ];
      const last = tips.pop();
      return `No set activates all of these skills. Try ${tips.join(", ")}, or ${last}.`;
    },
    timedOut: "The search stopped early: better sets may exist.",
    /** The edit icon's label, beside the set number. */
    editThis: "Edit this set",
    status: "Status",
    errors: {
      notLoaded: "The armor data hasn't loaded yet.",
      crashed: "The search stopped unexpectedly.",
      failed: (detail: string) => `The search failed: ${detail}`,
    },
  },

  /** The Editor tab's title bar, saving and sharing. */
  editor: {
    origins: {
      new: "New set",
      result: "Search result",
      link: "Shared set",
    },
    save: "Save",
    saveAsNew: "Save as new",
    share: "Share",
    new: "New",
    /** The default name of a newly saved set. */
    setName: (n: number) => `Set ${n}`,
    copyName: (name: string) => `${name} (copy)`,
    saved: (name: string) => `Saved ${name}.`,
    savedAs: (name: string) => `Saved as ${name}. Rename it in My sets.`,
    saveFailedTitle: "Couldn't save",
    saveFailed:
      "Your browser's storage is full or blocked. Sets are kept until you leave the page.",
    linkCopied: "Link copied",
    linkCopiedNote: "Paste it anywhere to share this set.",
    copyLink: "Copy this link",
    deleted: (name: string) => `Deleted ${name}.`,
    undo: "Undo",
  },

  /** Problems opening a share link or a saved set. */
  open: {
    newerVersion: (format: number) =>
      `This link is from a newer or unknown version of the set builder (format ${format}).`,
    malformed: "This link's set code is damaged or incomplete.",
    unknownIds: "None of the armor or decorations in this link exist in this version of the site.",
    /** `list` is the droppedPiece/droppedDecoration entries, joined. */
    dropped: (list: string, count: number) =>
      `Left out ${list}: ${s(count, "it's", "they're")} not in this version of the site.`,
    /** `slot` is the translated slot name ("Head"). */
    droppedPiece: (slot: string, id: number) => `an unknown ${slot.toLowerCase()} piece (ID ${id})`,
    droppedDecoration: (item: number, unknownSlot: boolean) =>
      `an unknown decoration (item ${item})${unknownSlot ? " in an unknown slot" : ""}`,
    idsUnavailable: "Couldn't load the equipment IDs to open this link. Try again online.",
  },

  /** The equipment set screen (results and editor). */
  setView: {
    weapon: "Weapon",
    addJewel: "+ Jewel",
    /** `bin` is the translated slot name ("Head", "Weapon"). */
    addJewelLabel: (bin: string) => `Add a decoration to the ${bin.toLowerCase()} slots`,
    remove: (name: string) => `Remove ${name}`,
    weaponSlots: "Weapon slots",
    fewerWeaponSlots: "Fewer weapon slots",
    moreWeaponSlots: "More weapon slots",
    weaponSlotCount: (n: number) => `${n} ${s(n, "weapon slot", "weapon slots")}`,
    sets: "Sets",
    previousSet: "Previous set",
    nextSet: "Next set",
    setNumber: (n: number) => `Set ${n}`,
    /** `slot` is the translated slot name. */
    pieceLabel: (slot: string, name: string) => `${slot}: ${name}. Change`,
    emptyLabel: (slot: string) => `${slot}: empty. Choose a piece`,
    choose: "- Choose -",
    owned: "Owned",
    torsoUp: "Torso Up",
    activeSkills: "[Activate Skill]",
    noSkills: "None",
    allPoints: "All skill points",
    alternatives: (n: number) =>
      `${n} other ${s(n, "piece gives", "pieces give")} the same points in your skills`,
    alternativesNote: "Their other skills differ, so a swap can add or remove a skill.",
  },

  /** A search result (ResultView) and its piece sheet. */
  result: {
    /** Defence, over its value in the status strip and beside an alternative's. */
    def: "DEF",
    defValue: (defence: string) => `DEF ${defence}`,
    resistances: "Resistances",
    /** Free slots, over their number in the status strip. */
    free: "Free",
    /** The weapon row, for screen readers (it shows "Weapon"). */
    weaponRow: "Weapon: suggest weapons for this set.",
    /** `slot` is the translated slot name. */
    pieceLabel: (slot: string, name: string, locked: boolean) =>
      `${slot}: ${name}${locked ? ", always used" : ""}. Options`,
    /** The "+2" beside a piece with swaps. */
    swaps: "Swaps",
    alwaysUsed: "Always used",
    /** The piece sheet. */
    defense: "Defense",
    slots: "Slots",
    skills: "Skills",
    jewels: "Jewels",
    swapsTitle: "Swaps that keep your skills",
    openPage: (name: string) => `Open ${name}'s page`,
    alwaysUse: "Always use",
    alwaysUseLabel: (name: string) => `Always use ${name}: lock it in every set`,
    unlock: "Unlock",
    unlockLabel: (name: string) => `Unlock ${name}`,
    neverUse: "Never use",
    neverUseLabel: (name: string) => `Never use ${name}: exclude it from the search`,
  },

  /** Weapons for a result's slots (WeaponSuggestions). */
  weapons: {
    /** `rank` and `progress` are translated ("High Rank", "G Rank ★2"). */
    note: (slots: number, rank: string, progress: string | null) =>
      `Strongest first${slots > 0 ? `, with ${slots === 1 ? "a slot" : `${slots} slots`} or more for the jewels` : ""}, up to ${rank}${progress ? ` and your quest progress (${progress})` : ""}.`,
    loading: "Loading weapons…",
    none: "None of these fit. Try another class, or fewer weapon slots.",
    /** `attack` is formatted, or "-". */
    attack: (attack: string) => `ATK ${attack}`,
  },

  /** The Status panel. */
  status: {
    defense: "Defense",
    fireRes: "Fire Res",
    waterRes: "Water Res",
    thunderRes: "Thundr Res",
    iceRes: "Ice Res",
    dragonRes: "Dragon Res",
    freeSlots: "Free Slots",
  },

  /** What's wrong with a set in the editor (lib/set-build.ts validateBuild). */
  warnings: {
    weaponSlots: (max: number, n: number) => `A weapon has at most ${max} slots, not ${n}.`,
    /** `is` and `slot` are translated slot names. */
    wrongSlot: (piece: string, is: string, slot: string) =>
      `${piece} is ${is.toLowerCase()} armor, not ${slot.toLowerCase()}.`,
    /** `hunterType` is translated. */
    hunterType: (piece: string, hunterType: string) => `${piece} is ${hunterType} armor.`,
    sex: (piece: string, sex: "Male" | "Female") =>
      `${piece} is only for ${sex === "Male" ? "male" : "female"} hunters.`,
    torsoUp: (piece: string) =>
      `${piece} has Torso Up, which copies the chest piece's skills: there is none.`,
    /** `bin` is the translated slot name. */
    emptySlot: (bin: string) =>
      `There are decorations in the ${bin.toLowerCase()} slot, which is empty. They don't count.`,
    /** `piece` is null for the weapon. */
    tooManyDecorations: (piece: string | null, used: number, has: number) =>
      `The decorations in ${piece ?? "the weapon"} need ${used} ${s(used, "slot", "slots")}; it has ${has}.`,
  },

  /** The editor's piece and decoration pickers. */
  pickers: {
    /** `slot` is the translated slot name. */
    pieceTitle: (slot: string) => `${slot} armor`,
    decorationTitle: (bin: string, free: number) =>
      `${bin} jewel (${free} ${s(free, "slot", "slots")} free)`,
    searchArmor: "Search armor by name or skill",
    searchDecorations: "Search decorations by name or skill",
    searchPlaceholder: "Search by name or skill",
    rank: "Rank",
    allRanks: "All ranks",
    sortBy: "Sort by",
    sorts: {
      skills: "Your skills",
      defence: "Defense",
      name: "Name",
    },
    /** `hunter` and `sex` are translated; `max` is set when only the first `max` are shown. */
    pieceCount: (hunter: string, sex: string, limited: boolean, n: number, max: number | null) =>
      `${hunter}, ${sex.toLowerCase()}${limited ? ", up to your quest progress" : ""}: ${n} ${s(n, "piece", "pieces")}${max ? ` (first ${max} shown; search to narrow)` : ""}.`,
    decorationCount: (n: number, limited: boolean) =>
      `${n} ${s(n, "decoration fits", "decorations fit")}${limited ? ", up to your quest progress" : ""}.`,
  },

  /** The My sets tab. */
  mySets: {
    empty:
      "No saved sets yet. Open a set in the editor (from a search result, or from nothing) and press Save. Sets are kept in this browser.",
    nameLabel: "Set name",
    ok: "OK",
    inEditor: "In editor",
    open: "Open",
    rename: "Rename",
    duplicate: "Duplicate",
    delete: "Delete",
    renameLabel: (name: string) => `Rename ${name}`,
    duplicateLabel: (name: string) => `Duplicate ${name}`,
    deleteLabel: (name: string) => `Delete ${name}`,
    cantOpen: "Can't be opened in this version.",
    /** `hunterType` is translated; `defense` is formatted. */
    summary: (hunterType: string, defense: string) => `${hunterType}, Defense ${defense}`,
  },

  /** The wanted skills' chips and the skills sheet (SkillPicker). */
  skillPicker: {
    remove: (name: string) => `Remove ${name}`,
    filter: "Filter skills",
    filterPlaceholder: "Filter, e.g. attack, evade",
    nothingChosen: "Nothing chosen yet.",
    /** `list` is the chosen skills, joined. */
    chosen: (list: ReactNode) => createElement(Fragment, null, "Chosen: ", list),
    noMatch: (query: string) => `No skill matches “${query}”.`,
    points: (n: number) => `${n} pts`,
  },
};
