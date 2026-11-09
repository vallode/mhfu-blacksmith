/** Quest boards, quest pages and their rewards. */
export const quests = {
  /** The quest boards, by QuestHubSlug. */
  hubs: {
    village: "Village",
    "low-rank": "Guild Low Rank",
    "high-rank": "Guild High Rank",
    "g-rank": "Guild G Rank",
    "training-school": "Training School",
    "treasure-hunting": "Treasure Hunting",
  },
  /** The quest pages' top bar. */
  search: "Search",
  /** A quest the loaded hunter has cleared, like the game's quest sheet. */
  cleared: "CLEAR!!",
  loadError: "Couldn't load quests.",
  notFound: "Not found.",
  board: {
    /** A board's page before a quest is picked. */
    selectQuest: "Select a quest.",
    /** An Urgent Quest in the board's list. */
    urgent: "Urgent",
    starLevels: "Quest star level",
    previousStarLevel: "Previous star level",
    nextStarLevel: "Next star level",
    /** The star selector's count, read out: "Star level 2 of 9". */
    starLevelOf: (level: number, total: number) => `Star level ${level} of ${total}`,
  },
  detail: {
    /** An Urgent Quest, in the corner of its page. */
    urgent: "URGENT!!!",
    /** The tab row's accessible name. */
    tabsLabel: (quest: string) => `${quest} data`,
    tabs: {
      details: "Details",
      rewards: "Rewards",
      supplies: "Supplies",
    },
    goal: "Goal:",
    failure: "Failure:",
    location: "Location:",
    timeLimit: "Time limit:",
    /** "50 min" */
    minutes: (n: string) => `${n} min`,
    reward: "Reward:",
    fee: "Contract fee:",
    requires: "Requires:",
    monsters: "Monsters:",
    smallMonsters: "Small monsters:",
    client: "Client:",
  },
  rewards: {
    /** Reward table headings, by kind (lib/quests REWARD_KINDS). */
    kinds: {
      main: "Main reward",
      extra: "Extra reward",
      conditional: "Conditional reward",
    },
    /** A conditional table's raw condition value; what it means isn't known. */
    condition: (n: number) => `condition ${n}`,
    /** An item ID the item list doesn't have. */
    unknownItem: (id: number) => `Item #${id}`,
    /** A supply row the disc lists more than once. */
    stacks: (n: number) => `${n} stacks`,
  },
};
