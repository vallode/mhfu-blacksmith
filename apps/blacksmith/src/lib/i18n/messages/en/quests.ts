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
    /** The board's screen-reader heading: "Guild High Rank quests". */
    title: (hub: string) => `${hub} quests`,
    /** A board's page before a quest is picked. */
    selectQuest: "Select a quest.",
    /** An Urgent Quest in the board's list. */
    urgent: "Urgent",
    /** The star level tabs' accessible name. */
    starLevels: "Star levels",
    /** A star level tab, read out: "3 stars", "G 1 star". */
    starLevel: (stars: number, g: boolean) =>
      `${g ? "G " : ""}${stars} ${stars === 1 ? "star" : "stars"}`,
    /** The type filter at the bottom of the list, showing every type. */
    allTypes: "All quests",
    typeFilter: "Quest type",
    previousType: "Previous quest type",
    nextType: "Next quest type",
    /** The type filter's count, read out: "Quest type 2 of 4". */
    typeOf: (n: number, total: number) => `Quest type ${n} of ${total}`,
  },
  /** Quest types (lib/quests QUEST_TYPES), as the board's type filter shows them. */
  types: {
    hunting: "Hunting",
    slaying: "Slaying",
    gathering: "Gathering",
    treasure: "Treasure",
  },
  /** Quest types as the quest card heads them, like the game's quest card. */
  typeHeadings: {
    hunting: "Hunting Quest",
    slaying: "Slaying Quest",
    gathering: "Gathering Quest",
    treasure: "Treasure Quest",
  },
  detail: {
    /** An Urgent Quest, in the corner of its page. */
    urgent: "URGENT!!!",
    /** The tab row's accessible name. */
    tabsLabel: (quest: string) => `${quest} data`,
    tabs: {
      details: "Details",
      monsters: "Monsters",
      rewards: "Rewards",
      supplies: "Supplies",
      map: "Map",
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
  /** The Monsters tab: each large monster's HP and multipliers in the quest. */
  monsterStats: {
    hp: "HP:",
    attack: "Attack:",
    defense: "Defense:",
    stagger: "Stagger:",
    /** A multiplier: "×1.2". */
    times: (n: string) => `×${n}`,
    note: "Attack and defense multiply the damage the monster deals and takes, so a lower defense means it takes less. Stagger multiplies how much damage a part takes before it flinches.",
    /** Added to the note for Furious Rajang. */
    changesDuringHunt: (monster: string) =>
      `${monster}'s attack and defense change again during the hunt.`,
  },
  /** The Map tab: the quest's gathering points on the game's area map. */
  areaMap: {
    loading: "Loading map…",
    loadError: "Couldn't load the map.",
    /** Gathering point kinds (lib/item-places GatherKind). */
    kinds: {
      gather: "Gathering",
      mine: "Mining",
      bug: "Bug catching",
    },
    /** 0 is the Base Camp, then the map's numbered areas. */
    area: (area: number) => (area === 0 ? "Base Camp" : `Area ${area}`),
    /** A point's marker, read out: "Area 3, Mining". */
    pointLabel: (area: string, kind: string) => `${area}, ${kind}`,
    /** The selected point's first row: "Area 3:". */
    areaHeading: (area: string) => `${area}:`,
    gathers: "Gathers:",
    /** How many gathers a point gives: "2–4". */
    gatherRange: (fewest: string, most: string) => `${fewest}–${most}`,
    neverRunsOut: "Never runs out",
    /** An item's chance at a point: "35%". */
    chance: (percent: string) => `${percent}%`,
    hint: "Select a point to see what it gives, and again to step through any that overlap.",
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
