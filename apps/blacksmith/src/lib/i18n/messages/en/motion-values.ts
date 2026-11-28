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
  /** Lance: the charge's values while it starts or once it runs at full speed. */
  charge: "Charge",
  runUp: "Run-up",
  fullSpeed: "Full speed",
  /** Selector arrows. */
  previous: "Previous",
  next: "Next",
  /** "2 of 7", for screen readers. */
  of: (index: string, count: string) => `${index} of ${count}`,
  /** The calculator's settings and columns. */
  sharpness: "Sharpness",
  sharpnessColors: ["Red", "Orange", "Yellow", "Green", "Blue", "White", "Purple"],
  hitzone: "Hitzone",
  damage: "Damage",
  loadError: "Couldn't load the motion values.",
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
   * Move names, by weapon type and the move's key in data/mhfu/motion-values.json.
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
