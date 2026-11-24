import type { ReactNode } from "react";

/**
 * The home menu, Options, Hunter Profile, search, offline and save-sync UI.
 */
export const site = {
  /** The title image's alt text. */
  logoAlt: "Blacksmith",
  /** The sidebar, its icon rail and the phone tab bar (AppShell). Tab labels fit a fifth of a phone. */
  nav: {
    weapons: "Weapons",
    armor: "Armor",
    monsters: "Monsters",
    decorations: "Decorations",
    quests: "Quests",
    items: "Items",
    maps: "Maps",
    veggieElder: "Veggie Elder",
    sets: "Sets",
    wishlist: "Wishlist",
    hunter: "Hunter",
    options: "Options",
    home: "Home",
    main: "Main",
    search: "Search",
    collapse: "Collapse",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    menu: "Menu",
    loadHunter: "Load hunter",
  },
  language: {
    heading: "Language",
    label: "Language",
    note: "The language of the site. Game names and quest text that haven't been translated yet stay in English.",
    auto: "Browser",
  },
  selector: {
    previous: (name: string) => `Previous ${name}`,
    next: (name: string) => `Next ${name}`,
  },
  preferences: {
    title: "Preferences",
    display: "Display",
    showRawValues: {
      label: "True values",
      note: "Show the raw attack and element values in brackets next to the in-game numbers.",
    },
    animateHighlights: {
      label: "Pulsing highlights",
      note: "Pulse the green highlight on hovered and selected rows. Off keeps it steady.",
    },
    progress: "Progress",
    questProgress: {
      label: "Quest progress",
      note: "The highest guild quest you can take. Weapons and armor that need materials from later quests are hidden. Village quests count as Low Rank.",
      all: "Show all",
    },
    hunter: "Hunter",
    hunterNote: (link: ReactNode): ReactNode => [
      "These apply once you load a hunter on the ",
      link,
      " page.",
    ],
    markOwned: {
      label: "Mark owned equipment",
      note: "Give equipment in your equipment box gold names in the weapon, armor and decoration trees.",
    },
    showCraftProgress: {
      label: "Craft progress",
      note: "Show material squares on weapon tree rows and highlight the weapons you can make now.",
    },
    showMaterialCounts: {
      label: "Material counts",
      note: "Show how many of each recipe material you have, as owned/required.",
    },
    checkZenny: {
      label: "Count zenny",
      note: "Only count a weapon as craftable when you can also afford it.",
    },
    markCleared: {
      label: "Mark cleared quests",
      note: "Mark the quests you have cleared with CLEAR!! on the quest boards and quest pages.",
    },
    showHuntRecords: {
      label: "Hunt records",
      note: "Show how many of each monster you have hunted and captured on its page, and filter the monster lists by them.",
    },
    defaultTreeFilter: {
      label: "Starting tree filter",
      note: "The weapon tree filter each visit starts on.",
    },
    reset: "Reset to defaults",
  },
  saveSync: {
    fileTitle: "Save File",
    title: "Save Sync",
    unsupported:
      "Automatic save syncing isn't supported in this browser. You can still upload your save file manually from the Hunter page.",
    notConnected:
      "Connect your save file from the Hunter page to have your hunter profile refresh automatically whenever you return, no re-uploading needed.",
    connectedNote: (file: string | null) =>
      `Your hunter profile refreshes automatically from ${file ?? "your save file"} whenever you return to this site — no re-uploading needed.`,
    syncing: "Syncing…",
    lastSynced: (ago: string) => `Last synced ${ago}`,
    connected: "Connected",
    needsReconnect: "Access needs to be reconnected",
    syncNow: "Sync now",
    reconnect: "Reconnect",
    forget: "Forget save file",
    ago: {
      justNow: "just now",
      minutes: (n: number) => `${n} min ago`,
      hours: (n: number) => `${n}h ago`,
      days: (n: number) => `${n}d ago`,
    },
    errors: {
      hunterMissing: "Previously selected hunter is no longer in this save.",
      syncFailed: "Sync failed",
      openFailed: "Could not open file",
      permissionFailed: "Permission request failed",
    },
    filePickerDescription: "MHFU save file",
    reconnectToast: {
      title: "Reconnect save file",
      message: (file: string | null) =>
        file
          ? `Allow access to ${file} again to keep your hunter profile in sync.`
          : "Allow access to your save file again to keep your hunter profile in sync.",
      notNow: "Not now",
    },
  },
  ppssppLink: {
    title: "PPSSPP Link",
    intro:
      "Playing on PPSSPP? Link the site to it and your hunter comes straight from the game whenever you switch back to this tab, saved or not.",
    setup:
      "In PPSSPP, turn on Settings → Tools → Developer tools → Allow remote debugger. The first time, the site finds PPSSPP's port by itself (it asks PPSSPP's own server, report.ppsspp.org, then tries the ports PPSSPP can pick from), which can take a few seconds.",
    link: "Link to PPSSPP",
    unlink: "Unlink",
    syncNow: "Sync now",
    syncing: "Reading the game…",
    searching: "Looking for PPSSPP…",
    linked: (game: string, ago: string) => `Linked to ${game}, synced ${ago}`,
    notFound: "PPSSPP didn't answer. Is it running, with the remote debugger allowed?",
    noGame: "PPSSPP is open, but no game is running.",
    otherGame: (game: string) => `PPSSPP is running another game (${game}).`,
    noHunter: "Load a hunter in the game, then come back to this tab.",
    fileSkipped:
      "While the site is linked to PPSSPP, it takes the hunter from the game, not the save file.",
    port: "Port",
    portHint:
      "If the site still can't find PPSSPP, enter its port: PPSSPP shows it on screen for a few seconds when the debugger starts (“Debugger web server running on port …”), and keeps it as RemoteISOPort in PSP/SYSTEM/ppsspp.ini.",
    connect: "Connect",
    liveHunter: "In the game",
  },
  offline: {
    title: "Offline Data",
    unsupported: "Offline downloads aren't supported in this browser.",
    note: "Save weapon, armor, monster, and decoration data to this device so search and browsing work without a connection. This stays here whenever you want to (re)download or clear it — unlike the one-time popup.",
    checkingFiles: "Checking cached files…",
    filesCached: (cached: number, total: number) => `${cached} / ${total} files cached`,
    error: "Something went wrong. Check your connection and try again.",
    checking: "Checking…",
    downloading: (percent: number) => `Downloading… ${percent}%`,
    redownload: "Re-download",
    retry: "Retry",
    finish: "Finish downloading",
    download: "Download for offline",
    clear: "Clear offline data",
    toast: {
      title: "Download for offline",
      partial: (cached: number, total: number) =>
        `Partially cached (${cached}/${total}). Finish downloading so the smithy works without a connection.`,
      prompt:
        "Save weapon, armor, and monster data so search and browsing work without a connection.",
      download: "Download",
      notNow: "Not now",
      progress: (cached: number, total: number, percent: number) =>
        `Downloading… ${cached}/${total} (${percent}%)`,
      readyTitle: "Ready offline",
      ready: (cached: number, total: number) =>
        `${cached} of ${total} files cached — the smithy works without a connection.`,
      failedTitle: "Download failed",
      failed: "Check your connection and try again.",
      retry: "Retry",
    },
    fallback: {
      notSaved: "This page hasn't been saved for offline use.",
      reconnect: "Reconnect and open it once, and it'll be available offline from then on.",
      home: "Back to home",
    },
  },
  hunter: {
    noData: "No data",
    time: "Time",
    rank: "HR",
    money: "Money",
    selected: " (selected)",
    sex: { Male: "Male", Female: "Female" } as Record<string, string>,
    reading: "Reading save file…",
    drop: "Drop MHP2NDG.BIN here or click to browse",
    rankShort: (rank: number) => `HR ${rank}`,
    pagesLabel: "Hunter pages",
    soon: "Soon",
    pages: {
      guildCard: "Guild Card",
      awards: "Awards",
      quests: "Quest progress",
      monsters: "Monster log",
      crowns: "Crowns",
      collection: "Collection",
      save: "Save file",
    },
    noHunter: "No hunter loaded",
    noHunterNote: "Load your save file to see your hunter's progress here.",
    pickHunter: "Pick a hunter",
    pickHunterNote: "Choose which of the save's hunters to load.",
    unload: "Unload hunter",
    unloadConfirm: (name: string) =>
      `Unload ${name}? Their items, records and progress stop showing across the site until you load the save again.`,
    unloadYes: "Unload",
    unloadNo: "Cancel",
    guildCard: {
      playTime: "Play time",
      zenny: "Zenny",
      sex: "Sex",
      questsCleared: "Quests cleared",
      huntedLarge: "Hunted (large)",
      huntedSmall: "Hunted (small)",
      captured: "Monsters captured",
      items: "Item kinds",
      equipment: "Equipment",
      of: (done: string, total: string) => `${done}/${total}`,
    },
    monsterLog: {
      note: "Every monster your save has a record for, with the counts you've slain and captured and the size records the Guild Card keeps.",
      large: "Large monsters",
      small: "Small monsters",
      monster: "Monster",
      slain: "Slain",
      captured: "Captured",
      sizes: "Size records",
      largest: "Largest",
      smallest: "Smallest",
      /** The header's count: "18 monsters". */
      logged: (n: number, count: string) => (n === 1 ? "1 monster" : `${count} monsters`),
      /** A group's totals, labelled so the counts need no plural. */
      totals: (slain: string, captured: string) => `Slain: ${slain} · Captured: ${captured}`,
      slainTotal: (slain: string) => `Slain: ${slain}`,
      untracked:
        "This save was stored before monster records were read. Load the save file again to see them.",
      empty: "No monsters hunted yet.",
      noListed: "Your save's monster records aren't for monsters this site lists.",
    },
    awards: {
      note: "Earned means you meet the award's requirement from what your save shows. The rest can't be read from a save yet.",
      noteGiven:
        "Earned awards are the ones the game has given you, read from your save. For the rest, progress comes from the rest of your save: quests, monsters, training, the farm, Felynes and more.",
      earned: (earned: number, tracked: number) => `${earned}/${tracked}`,
      earnedLabel: (earned: number, tracked: number) =>
        `${earned} of ${tracked} trackable awards earned`,
      done: "Earned",
      notTracked: "Not in save",
      notEarned: "Not earned",
      notGiven: "Not given yet",
      notHunted: "Not hunted yet",
      showLeft: (n: number) => `What's left (${n})`,
      groups: {
        village: "Village",
        gathering: "Gathering Hall",
        training: "Training School",
        hunts: "Hunts",
        collection: "Collecting",
        farm: "Pokke Farm and Felynes",
        other: "Other",
      },
    },
    questProgress: {
      note: "Quests cleared on each board, by star level.",
      level: (level: string, done: number, total: number) =>
        `${level}: ${done} of ${total} cleared`,
    },
    crowns: {
      note: "Your Guild Card's largest and smallest sizes for each monster entry.",
      largest: "Largest",
      smallest: "Smallest",
      hunted: (count: string) => `Hunted ${count}`,
      notHunted: "Not hunted",
      missing: "Missing",
      complete: "Complete",
      missingGold: "Gold crown missing",
      missingMini: "Mini crown missing",
      missingBoth: "Gold and mini crowns missing",
      noRecords:
        "This save was stored before monster records were read. Load the save file again to see your crowns.",
      goldCutoff: (size: string) => `Gold ≥ ${size}`,
      miniCutoff: (size: string) => `Mini ≤ ${size}`,
      goldCount: (earned: string, total: string) => `${earned}/${total} gold crowns`,
      miniCount: (earned: string, total: string) => `${earned}/${total} mini crowns`,
    },
    collection: {
      note: "Your equipment box against the Guild Card's equipment awards: what each weapon class and armor slot still needs. Any eligible piece counts, and each box slot counts.",
      weapons: "Weapons",
      armor: "Armor",
      allAwards: "All Guild Card awards",
      ownedOf: (owned: string, needed: string) => `${owned}/${needed}`,
      awardProgress: (done: string, total: string) => `${done}/${total}`,
      awardLabel: (title: string, done: number, total: number) =>
        `${title}: ${done} of ${total} complete`,
      groupProgress: (label: string, owned: number, needed: number) =>
        `${label}: ${owned} of ${needed} pieces`,
      need: (n: number) => (n === 1 ? "1 more needed" : `${n} more needed`),
      complete: "Complete",
      missing: (n: number) => `Eligible pieces you don't own (${n})`,
      noEquipment:
        "This save doesn't include the equipment box, so there's no collection to show. Load a save from this version of the game to see it.",
      loading: "Reading your equipment box…",
      failed: "The equipment list couldn't be loaded.",
      pieces: (n: string) => `${n} pieces`,
      piecesLabel: (n: number) => `${n} pieces of equipment`,
    },
  },
  search: {
    label: "Search",
    placeholder: "Search weapons, armor, monsters…",
    noResults: "No results found",
    /** Quest board prefixes in the search index's "Low 3★" labels. */
    /** A result's kind, beside results without a rank (shown capitalised). */
    categories: {
      weapon: "weapon",
      armor: "armor",
      decoration: "decoration",
      monster: "monster",
      quest: "quest",
      item: "item",
      page: "page",
    },
    boards: {
      Low: "Low",
      High: "High",
      G: "G",
      Village: "Village",
      Training: "Training",
      Treasure: "Treasure",
    } as Record<string, string>,
  },
  toast: {
    dismiss: "Dismiss",
  },
};
