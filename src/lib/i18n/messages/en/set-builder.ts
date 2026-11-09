/**
 * The set builder (/set-builder/): the skills form, results, the set editor
 * and its pickers, "My sets", and share links. Game names (armor,
 * decorations, skills) come from useGameText(), not from here.
 */
import { createElement, Fragment, type ReactNode } from "react";

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const setBuilder = {
  nav: {
    search: "Search",
  },
  hunterTypes: {
    Blademaster: "Blademaster",
    Gunner: "Gunner",
  },
  sexes: {
    Male: "Male",
    Female: "Female",
  },
  /** "High Rank ★7": `rank` is already translated. */
  tier: (rank: string, stars: number) => `${rank} ★${stars}`,

  /** The skills form (left card). */
  form: {
    title: "Skills",
    hunter: "Hunter",
    sex: "Gender",
    rank: "Rank",
    weaponSlots: "Weapon slots",
    noWeaponSlots: "None",
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
    search: "Search",
    cancel: "Cancel",
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
    intro: "Add the skills you want, then search. Sets are sorted by defence, highest first.",
    /** `progress`: the search was limited by quest progress. */
    noSets: (progress: boolean): string =>
      progress
        ? "No set activates all of these skills. Try fewer skills, a higher rank, more weapon slots, allowing bad skills, or ignoring your quest progress."
        : "No set activates all of these skills. Try fewer skills, a higher rank, more weapon slots, or allowing bad skills.",
    /** `shown` and `total` are formatted; `more`: the search stopped counting at `total`. */
    truncated: (shown: string, total: string, more: boolean) =>
      `The ${shown} highest-defence sets of ${total}${more ? "+" : ""} found. Add skills to narrow the search.`,
    timedOut: "The search took too long and stopped early.",
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

  /** The wanted-skills list. */
  skillPicker: {
    remove: (name: string) => `Remove ${name}`,
    add: "Add a skill",
    placeholder: "Add a skill, e.g. Attack Up",
    placeholderMore: "Add another skill…",
  },
};
