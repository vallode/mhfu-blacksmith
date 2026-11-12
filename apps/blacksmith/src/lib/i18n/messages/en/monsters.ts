/** The bestiary: monster pages, hitzones and drop tables. */
export const monsters = {
  /** The bestiary's page bar. */
  nav: {
    /** The page's screen-reader heading: "Flying Wyvern monsters". */
    title: (category: string) => `${category} monsters`,
    /** The type tabs' accessible name. */
    types: "Monster types",
  },
  detail: {
    notFound: "Not found.",
    size: "Size:",
    /** "1,234–1,890 cm" */
    sizeRange: (min: string, max: string) => `${min}–${max} cm`,
    baseHp: "Base HP:",
    /** The loaded hunter's Guild Card counts. */
    hunted: "Hunted:",
    captured: "Captured:",
    /** The tab row's accessible name. */
    tabsLabel: (monster: string) => `${monster} data`,
    tabs: {
      hitzones: "Hitzones",
      quests: "Quests",
      /** A small monster's tab: the quests with the most of it. */
      spawns: "Most plentiful",
    },
  },
  /** A small monster's "Most plentiful" tab. */
  spawns: {
    /** How many of it a quest has: "×12". */
    count: (total: string) => `×${total}`,
    /** Under the first few quests of a star level: "+4 more with ×12". */
    more: (count: string, total: string) => `+${count} more with ×${total}`,
    /** A quest where it keeps spawning, so it has no total. */
    keepsSpawning: "keeps spawning",
  },
  hitzones: {
    part: "Part",
    /** The game's abbreviated column headers. */
    columns: {
      cut: "Cut",
      bash: "Bsh",
      shot: "Sht",
      fir: "Fir",
      wtr: "Wtr",
      thn: "Thn",
      ice: "Ice",
      drg: "Drg",
      ko: "KO",
    },
    /** The flinch threshold column ("Fln", like the game's short headers). */
    flinch: "Fln",
    /** Hitzone part names, by the data's part id. Unlisted ids show as they are. */
    parts: {
      all: "All",
      head: "Head",
      neck: "Neck",
      back: "Back",
      belly: "Belly",
      tail: "Tail",
      wing: "Wing",
      wings: "Wings",
      leg: "Leg",
      torso: "Torso",
      body: "Body",
      shell: "Shell",
      claw: "Claw",
      arm: "Arm",
      pincer: "Pincer",
      "weak-point": "Weak-Point",
      "weak-spot": "Weak-Spot",
      horn: "Horn",
      "front-leg": "Front-Leg",
      "front-legs": "Front-Legs",
      "hind-leg": "Hind-Leg",
      "hind-legs": "Hind-Legs",
      "belly-chest": "Belly-Chest",
      "belly-legs": "Belly-Legs",
      shoulder: "Shoulder",
      eye: "Eye",
      mouth: "Mouth",
      feeler: "Feeler",
      tentacle: "Tentacle",
      face: "Face",
      "back-tail": "Back-Tail",
      chest: "Chest",
      "chest-broken": "Chest-Broken",
      "wing-membrane": "Wing-Membrane",
      "head-rage": "Head-Rage",
      fin: "Fin",
      other: "Other",
    } as Record<string, string>,
    /** The switch over the 3D model, and its legend of parts. */
    show: "Hitzones",
    legend: "Hitzone parts",
  },
  breaks: {
    /** Heading over the list under the hitzone table. */
    title: "Breakable parts",
    /** The hitzone parts a break is on: "on head, wings". */
    on: (parts: string) => `on ${parts}`,
    /** The table's mark on a breakable part. */
    breakable: "Breakable",
    breakableSr: " (breakable)",
    /** The group heading in the 3D model's legend, and its screen-reader prefix. */
    legend: "Breaks",
    legendPrefix: "Break: ",
    /** What it takes: "2nd flinch (of each)", "under 50% HP", "dragon damage". */
    flinch: (n: number, each: boolean) => {
      const teen = n % 100 >= 11 && n % 100 <= 13;
      const suffix = teen
        ? "th"
        : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");
      return `${n}${suffix} flinch${each ? " of each" : ""}`;
    },
    belowHp: (percent: number) => `under ${percent}% HP`,
    damage: { cut: "cutting damage", fire: "fire damage", dragon: "dragon damage" },
    /** Break reward names, by the data's name ("1st horn"). Others use the hitzone part names. */
    names: {
      ears: "Ears",
      beak: "Beak",
      back: "Back",
      wings: "Wings",
      head: "Head",
      shell: "Shell",
      claw: "Claw",
      "shell - gravios skull": "Shell - Gravios Skull",
      "shell - brown skull": "Shell - Brown Skull",
      "shell - white skull": "Shell - White Skull",
      horn: "Horn",
      "left shoulder": "Left Shoulder",
      tentacles: "Tentacles",
      eye: "Eye",
      "2nd horn": "2nd Horn",
      "1st horn": "1st Horn",
      wing: "Wing",
      chest: "Chest",
      "head/back": "Head/Back",
      stomach: "Stomach",
      horns: "Horns",
      tail: "Tail",
      claws: "Claws",
      fangs: "Fangs",
      "spikes - back": "Spikes - Back",
      "chest - requires fire element": "Chest - Requires Fire Element",
      "dorsal fin": "Dorsal Fin",
      fang: "Fang",
      "back fin": "Back Fin",
      face: "Face",
      fin: "Fin",
    } as Record<string, string>,
  },
  drops: {
    /**
     * Drop table ranks that aren't one of the common ranks, by the data's
     * key with spaces as hyphens.
     */
    ranks: {
      "1-2-star": "1-2 Star",
      "1-2-star-guild": "1-2 Star Guild",
      "1-2-star-rank": "1-2 Star Rank",
    } as Record<string, string>,
    /** Drop table headings, by their English heading. Unlisted ones stay English. */
    sources: {
      "Body carve": "Body carve",
      "Body carves": "Body carves",
      "Tail carve": "Tail carve",
      "Tail carves": "Tail carves",
      "Live carving": "Live carving",
      Capture: "Capture",
      "Capture rewards": "Capture rewards",
      "Shiny drop": "Shiny drop",
      "Shiny drops": "Shiny drops",
      "Break 1st horn": "Break 1st horn",
      "Break 2nd horn": "Break 2nd horn",
      "Break back": "Break back",
      "Break back fin": "Break back fin",
      "Break beak": "Break beak",
      "Break chest": "Break chest",
      "Break claw": "Break claw",
      "Break claws": "Break claws",
      "Break dorsal fin": "Break dorsal fin",
      "Break ears": "Break ears",
      "Break eye": "Break eye",
      "Break face": "Break face",
      "Break fang": "Break fang",
      "Break fangs": "Break fangs",
      "Break fin": "Break fin",
      "Break head": "Break head",
      "Break head/back": "Break head/back",
      "Break horn": "Break horn",
      "Break horns": "Break horns",
      "Break left shoulder": "Break left shoulder",
      "Break right shoulder": "Break right shoulder",
      "Break shell": "Break shell",
      "Break spikes": "Break spikes",
      "Break stomach": "Break stomach",
      "Break tail": "Break tail",
      "Break tentacles": "Break tentacles",
      "Break wing": "Break wing",
      "Break wings": "Break wings",
    } as Record<string, string>,
    /** A drop table's condition, by its English text. Unlisted ones stay English. */
    notes: {
      "sonic, doesn't work when rage": "sonic, doesn't work when rage",
      "pitfall trapped in rage mode": "pitfall trapped in rage mode",
      "when playing dead": "when playing dead",
      "put hypnoc to sleep": "put hypnoc to sleep",
      "finishes eating without noticing hunter": "finishes eating without noticing hunter",
      "gravios skull": "gravios skull",
      "brown skull": "brown skull",
      "white skull": "white skull",
      "replacing shell or finishes eating without noticing hunter":
        "replacing shell or finishes eating without noticing hunter",
      "sonic during its attacks": "sonic during its attacks",
      "force it into rage mode or reactivating fire aura":
        "force it into rage mode or reactivating fire aura",
      "jump to its back": "jump to its back",
      "when falling down w/ enough damage": "when falling down w/ enough damage",
      "throw 2/3 tranqs while it does the succ": "throw 2/3 tranqs while it does the succ",
      "awoken from sleep or got trapped": "awoken from sleep or got trapped",
      "awoken from sleep or flashed while flying": "awoken from sleep or flashed while flying",
      "drip acid from ceiling": "drip acid from ceiling",
      "awoken from rock mimic or awoken from sleep": "awoken from rock mimic or awoken from sleep",
      back: "back",
      "cut when hp < 25%": "cut when hp < 25%",
      "requires fire element": "requires fire element",
      "stagger during taunt": "stagger during taunt",
      killed: "killed",
      "stagger the tail": "stagger the tail",
      "stagger the tail [bone]": "stagger the tail [bone]",
      "stagger the tail [mushroom]": "stagger the tail [mushroom]",
      "stagger the tail [mineral stone]": "stagger the tail [mineral stone]",
      "fished out, using frog as bait": "fished out, using frog as bait",
      "ko-ed; hammer, hh, crag s": "ko-ed; hammer, hh, crag s",
    } as Record<string, string>,
  },
};
