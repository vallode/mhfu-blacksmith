/** Motion values: the damage calculator in each weapon page's Motion Values tab. */
export const motionValues = {
  /** The motion value column: a move's hits summed. */
  mv: "MV",
  move: "Move",
  /** Dual Blades: the values in Demon Mode. */
  demonMode: "Demon Mode",
  /** Dual Blades: show the values in or out of Demon Mode. */
  mode: "Mode",
  normal: "Normal",
  /** Long Sword: the values with the spirit gauge glowing or not. */
  spiritGauge: "Spirit Gauge",
  glowing: "Glowing",
  /** Lance: the charge's rows, as it starts and once it runs at full speed: "Charge (run-up)". */
  chargeAt: (move: string, speed: string) => `${move} (${speed})`,
  runUp: "run-up",
  fullSpeed: "full speed",
  /** Selector arrows. */
  previous: "Previous",
  next: "Next",
  /** "2 of 7", for screen readers. */
  of: (index: string, count: string) => `${index} of ${count}`,
  /** The calculator's settings and columns. */
  sharpness: "Sharpness",
  sharpnessColors: ["Red", "Orange", "Yellow", "Green", "Blue", "White", "Purple"],
  hitzone: "Hitzone",
  /** The hitzone for the weapon's element, when no monster part is picked: "Fire hitzone". */
  elementHitzone: (element: string) => `${element} hitzone`,
  damage: "Damage",
  /** With an element, the damage columns: raw, the element's (headed by its name, or this for two), and both. */
  raw: "Raw",
  element: "Element",
  total: "Total",
  /** The damage table's column on a critical hit (a negative one, below 0 affinity), and its hint. */
  crit: { critical: "Crit", weak: "−Crit" },
  critHint: {
    critical: "On a critical hit: the motion value × 1.25",
    weak: "On a negative critical: the motion value × 0.75",
  },
  loadError: "Couldn't load the motion values.",
  /**
   * A move's input with the default controls, before its name (under it on
   * a narrow card): its column's heading for screen readers, a held button,
   * and the buttons' names (their icons' alt text).
   */
  input: {
    label: "Input",
    hold: "Hold",
    buttons: {
      triangle: "Triangle",
      circle: "Circle",
      cross: "Cross",
      r: "R",
      select: "SELECT",
      stick: "Analog stick",
    },
  },
  /** The hitzone picker: a monster's part, from a bestiary of portraits. */
  bestiary: {
    /** The part picked, after its value in the hitzone selector: "Rathalos · Head". */
    spot: (monster: string, part: string) => `${monster} · ${part}`,
    /** The selector narrowing the portraits to a monster type. */
    type: "Type",
    allTypes: "All types",
    /** Under the portraits, before a monster is picked. */
    pickMonster: "Pick a monster for its hitzones.",
    loadError: "Couldn't load the monsters.",
  },
  /** /damage/: the calculator's page, with a weapon picker and the hunter's buffs. */
  page: {
    title: "Damage Calculator",
    weapon: "Weapon",
    pickWeapon: "Pick a weapon",
    /** The weapon picker's search field. */
    searchWeapons: "Search weapons",
    searchPlaceholder: "Name",
    noWeapons: "No weapon matches.",
    /** Before a weapon is picked. */
    empty: "Pick a weapon to see what each of its moves deals.",
    loadError: "Couldn't load the weapons.",
    /** The weapon page's button to this page. */
    open: "Damage calculator",
    /** The buffs row and its sheet. */
    buffs: "Buffs",
    buffsLabel: "Change the buffs",
    noBuffs: "No buffs",
    clear: "Clear",
    /** The summary line's attack and affinity with buffs. */
    attack: "Attack",
    affinity: "Affinity",
    /** At the foot of the calculator card: the weapon's true attack, then with buffs. */
    trueAttack: "True attack",
    /** Beside it, for blademasters: true attack × sharpness × affinity, in the sharpness picked. */
    effectiveRaw: "Effective raw",
    effectiveRawHint: "True attack × the sharpness multiplier × (1 + 0.25 × affinity)",
    /** The target row and its sheet: a monster's part, or a hitzone set by hand. */
    target: "Target",
    targetLabel: "Change the target",
    handSet: "Set by hand",
    /** The quest row and its sheet: the quest's defense multiplier scales the damage. */
    quest: "Quest",
    questLabel: "Change the quest",
    noQuest: "No quest",
    questBoard: "Board",
    searchQuests: "Search quests",
    searchQuestsPlaceholder: "Name or monster",
    noQuests: "No quest matches.",
    stars: (n: string) => `${n}★`,
    /** Under the quest: the monster whose multiplier applies, and it. */
    defense: (monster: string, value: string) => `${monster} defense ×${value}`,
  },
  /** The buffs sheet's rows and choices. */
  buffs: {
    skills: "Skills",
    items: "Items",
    horn: "Hunting Horn",
    attackSkill: "Attack",
    attackSkills: {
      none: "None",
      "up-s": "Attack Up (Small)",
      "up-m": "Attack Up (Medium)",
      "up-l": "Attack Up (Large)",
      "down-s": "Attack Down (Small)",
      "down-m": "Attack Down (Medium)",
      "down-l": "Attack Down (Large)",
    },
    attackSkillNote: "Edgemaster counts as Attack Up (Large).",
    affinitySkill: "Expert",
    affinitySkills: {
      none: "None",
      "up-1": "Reckless Abandon +1",
      "up-2": "Reckless Abandon +2",
      "up-3": "Reckless Abandon +3",
      "down-1": "Reckless Abandon -1",
      "down-2": "Reckless Abandon -2",
      "down-3": "Reckless Abandon -3",
    },
    lowHealth: "Low health",
    lowHealths: {
      none: "None",
      adrenaline: "Adrenaline+2",
      heroics: "Felyne Heroics",
      worry: "Worry",
    },
    lowHealthNote:
      "Adrenaline+2 and Worry work at 40% health or less, Felyne Heroics at 10 health or less.",
    elementAttack: "Element Attack Up",
    sharpnessPlus: "Sharpness +1",
    /** The item rows; the items' own names come from the game text. */
    demondrug: "Demondrug",
    seed: "Seed",
    none: "None",
    seedNote: "Only the last one used counts.",
    hornAttack: "Attack Up",
    hornAttacks: {
      none: "None",
      s: "Attack Up (S)",
      "s-again": "Attack Up (S) again",
      l: "Attack Up (L)",
      "l-again": "Attack Up (L) again",
    },
    hornAttackNote: "Playing the song again while it lasts makes it stronger.",
    hornElement: "Elemental Attack Up",
    hornElements: {
      none: "None",
      once: "Elemental Attack Up",
      again: "Elemental Attack Up again",
    },
  },
  /** Bowguns: each shot the weapon loads instead of moves. */
  shots: {
    ammo: "Ammo",
    /** An ammo's level, after its name: "Lv2". */
    level: (level: string) => `Lv${level}`,
    /** A shot that hits more than once: its value and how many times, "10 × 3". */
    hits: (mv: string, hits: string) => `${mv} × ${hits}`,
    /**
     * A shot and what it bursts into, scaled by attack like a shot (Clust
     * S's bomblets): "6 + 32 × 3".
     */
    explosion: (shot: string, explosion: string) => `${shot} + ${explosion}`,
    /**
     * A shot and an explosion of fixed damage (Crag S's), which doesn't scale
     * with attack or the shot hitzone: "3 + 20 fixed".
     */
    fixedExplosion: (shot: string, damage: string) => `${shot} + ${damage} fixed`,
    /** The fixed explosion's hint, on hover. */
    fixedExplosionHint: "The explosion deals fixed damage, whatever the attack or shot hitzone.",
    /** The hitzone for the shots' elements, when no monster part is picked. */
    elementHitzone: "Element hitzone",
    loadError: "Couldn't load the shots.",
  },
  /**
   * Move names, by weapon type and the move's key in data/motion-values.json.
   * The disc names none of them; these follow the community's names.
   */
  moves: {
    "great-sword": {
      "vertical-slash": "Vertical Slash",
      "side-slash": "Side Slash",
      upswing: "Upswing",
      "charge-1": "Charge Lv1",
      "charge-2": "Charge Lv2",
      "charge-3": "Charge Lv3",
      kick: "Kick",
    },
    "long-sword": {
      "step-slash": "Step Slash",
      "vertical-slash": "Vertical Slash",
      thrust: "Thrust",
      "rising-slash": "Rising Slash",
      "fade-slash": "Fade Slash",
      "spirit-slash-1": "Spirit Slash 1",
      "spirit-slash-2": "Spirit Slash 2",
      "spirit-slash-3": "Spirit Slash 3",
      "spirit-slash-empty": "Spirit Slash (empty gauge)",
    },
    "sword-and-shield": {
      "jumping-slash": "Jumping Slash",
      slash: "Slash",
      "horizontal-slash": "Horizontal Slash",
      "shield-bash-combo": "Shield Bash, Slash",
      roundslash: "Roundslash",
      "rising-slash": "Rising Slash",
      "guard-slash": "Guard Slash",
      "guard-rising-slash": "Guard Rising Slash",
    },
    "dual-blades": {
      "combo-1": "Combo 1",
      "combo-2": "Combo 2",
      "combo-3": "Combo 3",
      roundslash: "Roundslash",
      "lunging-slash": "Lunging Slash",
      "rising-slash": "Rising Slash",
      "demon-roundslash": "Demon Roundslash",
      "demon-dance": "Demon Dance",
    },
    hammer: {
      "draw-attack": "Draw Attack",
      "overhead-smash-1": "Overhead Smash 1",
      "overhead-smash-2": "Overhead Smash 2",
      upswing: "Upswing",
      "side-smash": "Side Smash",
      "charge-1": "Charge Lv1",
      "charge-2": "Charge Lv2",
      superpound: "Superpound",
      "spinning-bludgeon": "Spinning Bludgeon",
    },
    "hunting-horn": {
      swing: "Swing",
      jab: "Jab",
      "overhead-smash": "Overhead Smash",
      "recital-start": "Recital",
      "recital-note-1": "Recital Note 1",
      "recital-note-2": "Recital Note 2",
      "recital-note-3": "Recital Note 3",
      "recital-end": "Recital Finish",
    },
    lance: {
      "draw-attack": "Draw Attack",
      "forward-thrust": "Forward Thrust",
      "forward-thrust-3": "Forward Thrust 3",
      "upward-thrust": "Upward Thrust",
      "upward-thrust-3": "Upward Thrust 3",
      "guard-thrust": "Guard Thrust",
      charge: "Charge",
      "charge-finisher": "Charge Finisher",
    },
    gunlance: {
      "draw-attack": "Draw Attack",
      "forward-thrust": "Forward Thrust",
      "forward-thrust-3": "Forward Thrust 3",
      "upward-thrust": "Upward Thrust",
      "guard-thrust": "Guard Thrust",
      "rushing-thrust": "Rushing Thrust",
    },
    bow: {
      "melee-1": "Melee Attack 1",
      "melee-2": "Melee Attack 2",
    },
  },
};
