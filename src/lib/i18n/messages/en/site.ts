import type { ReactNode } from "react";

/**
 * The home menu, Options, Hunter Profile, search, offline and save-sync UI.
 */
export const site = {
  /** The title image's alt text. */
  logoAlt: "Blacksmith",
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
      note: "Show how many of each monster you have hunted and captured on its page.",
    },
    defaultTreeFilter: {
      label: "Starting tree filter",
      note: "The weapon tree filter each visit starts on.",
    },
    reset: "Reset to defaults",
  },
  saveSync: {
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
    deselect: "Deselect this hunter",
    time: "Time",
    rank: "HR",
    money: "Money",
    selected: " (selected)",
    sex: { Male: "Male", Female: "Female" } as Record<string, string>,
    reading: "Reading save file…",
    drop: "Drop MHP2NDG.BIN here or click to browse",
  },
  search: {
    label: "Search",
    placeholder: "Search weapons, armor, monsters…",
    noResults: "No results found",
    /** Quest board prefixes in the search index's "Low 3★" labels. */
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
