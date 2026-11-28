/**
 * Every Whetstone option, described once. The web apps' pages, settings
 * files and the shareable settings string all work from `WHETSTONE_OPTIONS`;
 * randomfu shows them beside its own and keeps their keys in its strings.
 *
 * A Whetstone settings string is "WS" plus base64url JSON of the version and
 * every option that isn't its default (`options.ts`).
 */
import {
  coerceOption,
  decodePayload,
  encodePayload,
  formatOption,
  optionActive,
  optionDefaults,
  parseSettingsJson,
  SettingsError,
  type OptionDef,
} from "./options.js";
import { WHETSTONE_VERSION } from "./version.js";

export { SettingsError };

export interface WhetstoneSettings {
  "weapons.elementMotion": boolean;
  "weapons.elementMotionFrom": number;
  "monsterAi.aggression": "off" | "more" | "relentless";
  "monsterAi.reach": "off" | "less" | "rarely";
  "mods.nodeMap": boolean;
  "paint.stays": boolean;
  "mods.buttonIcons": "psp" | "xbox" | "nintendo" | "playstation" | "keyboard";
  "camera.fov": "normal" | "wide" | "wider" | "widest";
  "camera.distance": "normal" | "far" | "farther" | "farthest";
  "camera.tilt": "steps" | "slow" | "smooth" | "fast";
  "camera.photoMode": boolean;
  "camera.target": "off" | "tap" | "follow";
  "quest.endWait": "normal" | "short" | "instant";
  "hud.monsterHp": "off" | "painted" | "always";
  "hud.damageNumbers": "off" | "total" | "split";
  "hud.attackHitboxes": boolean;
  "poogie.enabled": boolean;
  "elites.enabled": boolean;
  "elites.chance": number;
  "quests.keyLabel": boolean;
  "rewards.sendAll": boolean;
  "smithy.improvePips": boolean;
  "farm.harvestAll": boolean;
  "pouch.bulkCombine": boolean;
  "monsterList.slainCaptured": boolean;
  "boot.skip": "normal" | "title" | "village";
}

export type WhetstoneKey = keyof WhetstoneSettings;

export const WHETSTONE_OPTIONS: readonly OptionDef<WhetstoneKey>[] = [
  {
    key: "weapons.elementMotion",
    section: "Weapons",
    label: "Heavy hits carry more element",
    help: "A Blademaster hit's element grows on a curve with how hard the move hits, so a slow weapon with the element its target is weak to pulls ahead of a raw one on every swing, and further the more it commits: at the default strength, a Great Sword's side slash carries 1.6 times its element, its draw slash 2.5 times, its level 3 charge 8.7 times, while quick hits (Dual Blades, Sword and Shield, light pokes) stay as they are. Status grows in step with the hit. Critical hits don't change either, as in the game. Weapon screens show the usual values.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "weapons.elementMotionFrom",
    section: "Weapons",
    label: "Element boost starts at",
    help: "The motion value above which a hit's element and status grow. Lower is stronger: at 26, a hit with motion value 52 carries 2.8 times its element (twice the motion value, to the power 1.5) and twice its status. Hits at or below it stay as they are: Dual Blades hits are 6 to 25, Great Sword hits 36 to 110.",
    type: { kind: "number", min: 10, max: 40, step: 1 },
    default: 26,
    enabledBy: "weapons.elementMotion",
  },
  {
    key: "monsterAi.aggression",
    section: "Monster stats",
    label: "Aggression",
    help: "Wherever a monster's AI picks at random between attacking and something else (walking, turning, waiting, roaring), attacks get likelier, and a large monster stands idle between moves for less time and recovers and turns faster, so it spends less time between attacks. Which attacks it has and when it chooses don't change, and every move stays possible. The aura of Kushala Daora, Teostra and Lunastra counts as an attack; the light hit a large monster deals just by walking into you doesn't. Great Thunderbug is left alone, and Fatalis, the Vespoids and Bulldrome partly.",
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Unchanged", help: "Monsters attack as often as they always did." },
        {
          value: "more",
          label: "More aggressive",
          help: "Each attack is twice as likely as before against the other moves, and a monster stands idle at most a second between moves and recovers from its moves and turns 50% faster.",
        },
        {
          value: "relentless",
          label: "Relentless",
          help: "Each attack is four times as likely as before against the other moves, and a monster stands idle at most a third of a second between moves and recovers from its moves and turns twice as fast.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "monsterAi.reach",
    section: "Monster stats",
    label: "Time out of reach",
    help: "Large monsters spend less of the fight where you can't hit them. Rathian and Rathalos and their kin, Yian Kut-Ku and Gypceros, Fatalis and Chameleos take off less often, Diablos and Monoblos dig in less often, and every large monster fights in each area for longer before it leaves mid-fight, and keeps after a hunter it lost sight of for longer before it gives up and wanders off. A flight or a burrow, once started, lasts as long as before, and every move stays possible.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "off",
          label: "Unchanged",
          help: "Monsters fly, dig and leave as often as they always did.",
        },
        {
          value: "less",
          label: "Less",
          help: "Taking off and digging in are a third as likely as before against the other moves, and a monster fights in each area twice as long before it leaves (10 minutes instead of 5 for most) and keeps after a hunter it can't see twice as long.",
        },
        {
          value: "rarely",
          label: "Rarely",
          help: "Taking off and digging in are an eighth as likely as before against the other moves, and a monster fights in each area four times as long before it leaves (up to about a quarter of an hour) and keeps after a hunter it can't see four times as long.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "mods.nodeMap",
    section: "Area map",
    label: "Gathering nodes on the area map",
    help: "The map screen marks every gathering (green), mining (orange) and bug catching (yellow) point on the map.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "paint.stays",
    section: "Area map",
    label: "Paint never wears off",
    help: "A monster hit by a Paintball stays on the area map for the rest of the quest, instead of for ten minutes. Each painted monster keeps its own mark.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "mods.buttonIcons",
    section: "Buttons",
    label: "Button icons",
    help: "The buttons the game draws in its text and HUD, for playing with a controller in PPSSPP.",
    type: {
      kind: "choice",
      choices: [
        { value: "psp", label: "PSP", help: "The game's own: ○ × △ □, L, R, START and SELECT." },
        {
          value: "xbox",
          label: "Xbox",
          help: "A B X Y in their colours, LB, RB, Menu and View.",
        },
        {
          value: "nintendo",
          label: "Nintendo",
          help: "A B X Y as a Switch has them (B below, A right), L, R, + and −.",
        },
        {
          value: "playstation",
          label: "PlayStation",
          help: "Coloured × ○ □ △, L1, R1, Options and the touchpad.",
        },
        {
          value: "keyboard",
          label: "Keyboard",
          help: "Keys for PPSSPP's defaults: Z X A S, Q, W, Space and Enter.",
        },
      ],
    },
    default: "psp",
  },
  {
    key: "camera.fov",
    section: "Camera",
    label: "Field of view",
    help: "How wide the camera sees. The edges stretch a little the wider it gets.",
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        { value: "normal", label: "Normal", help: "The game's own: 50° high, 79° across." },
        { value: "wide", label: "Wide", help: "×1.15: 57.5° high, 88° across." },
        {
          value: "wider",
          label: "Wider",
          help: "×1.25: 62.5° high, 94° across.",
        },
        { value: "widest", label: "Widest", help: "×1.4: 70° high, 102° across." },
      ],
    },
    default: "normal",
  },
  {
    key: "camera.distance",
    section: "Camera",
    label: "Camera distance",
    help: "How far behind your hunter the camera sits. Further shows more, but passes through walls more often in caves.",
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        { value: "normal", label: "Normal", help: "The game's own distance." },
        { value: "far", label: "Far", help: "×1.15 as far back." },
        { value: "farther", label: "Farther", help: "×1.3 as far back." },
        { value: "farthest", label: "Farthest", help: "×1.5 as far back." },
      ],
    },
    default: "normal",
  },
  {
    key: "camera.tilt",
    section: "Camera",
    label: "Camera tilt",
    help: "How D-pad up and down tilt the camera: the game's five steps, or smoothly to any angle while you hold it.",
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        { value: "steps", label: "Steps", help: "The game's own five steps." },
        { value: "slow", label: "Slow", help: "Smooth, 30° a second." },
        { value: "smooth", label: "Smooth", help: "Smooth, 50° a second." },
        { value: "fast", label: "Fast", help: "Smooth, 80° a second." },
      ],
    },
    default: "steps",
  },
  {
    key: "camera.photoMode",
    section: "Camera",
    label: "Photo mode",
    help: "In a quest, hold L and R and press START: the game freezes, the HUD goes and the camera is yours. START again to play on.",
    points: [
      "Stick turns it, D-pad moves it, L and R zoom",
      "△ × up and down, □ ○ nearer and further",
      "SELECT puts it back where it started",
    ],
    inGame: true,
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "camera.target",
    section: "Camera",
    label: "Target camera",
    help: "L turns the camera to face a large monster in your area, like the newer games' target camera.",
    points: [
      "Hold L and press D-pad left or right for the next monster",
      "Press L twice for the game's own L",
    ],
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Off", help: "L is the game's own: behind your hunter." },
        {
          value: "tap",
          label: "Tap",
          help: "L turns the camera to the monster once; then it stays where it is.",
        },
        {
          value: "follow",
          label: "Follow",
          help: "L keeps the monster in view until you press L twice, turn the camera with the D-pad, or the monster leaves or falls.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "quest.endWait",
    section: "Quest end",
    label: "Wait after a quest",
    help: "How long the game waits after a quest is done before the reward screen.",
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        {
          value: "normal",
          label: "Normal",
          help: "The game's own: the banner, then a minute (20 s on gathering quests).",
        },
        {
          value: "short",
          label: "Short",
          help: "The banner, then 20 s for every quest: time to carve one monster.",
        },
        {
          value: "instant",
          label: "Instant",
          help: "Straight to the rewards: no banner wait and no time to carve.",
        },
      ],
    },
    default: "normal",
  },
  {
    key: "hud.monsterHp",
    section: "HUD",
    label: "Monster health",
    help: "A health gauge for each large monster in your area, under your name plate.",
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Off", help: "No monster gauges." },
        {
          value: "painted",
          label: "On the map",
          help: "While it shows on the map: from a Paintball hit.",
        },
        {
          value: "always",
          label: "Always",
          help: "Every large monster in your area shows its gauge.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "hud.damageNumbers",
    section: "HUD",
    label: "Damage numbers",
    help: "Each hit pops the damage it dealt at the part it struck: white, or orange on a weak point.",
    inGame: true,
    type: {
      kind: "choice",
      choices: [
        { value: "off", label: "Off", help: "No damage numbers." },
        { value: "total", label: "Total", help: "One number a hit: raw and element together." },
        {
          value: "split",
          label: "Split element",
          help: "The element's share as a second number in its colour.",
        },
      ],
    },
    default: "off",
  },
  {
    key: "hud.attackHitboxes",
    section: "HUD",
    label: "Attack hitboxes",
    help: "A faint red shading over every monster attack that can hit you right now, fireballs and other projectiles too. A few attacks aren't drawn.",
    inGame: true,
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "poogie.enabled",
    section: "Poogie",
    label: "Poogie's luck",
    help: "Pet Poogie before a hunt and luck might be in your favor!",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "elites.enabled",
    section: "Elite monsters",
    label: "Elite monsters",
    help: "Now and then a large monster is an elite, with a faint crimson pulse. The quest board doesn't tell.",
    points: [
      "+50% health, +30% damage, +10% speed, longer rages",
      "Shorter pauses between moves, quicker turns and recoveries",
      "An extra reward draw, +50% zenny and rarer rewards",
    ],
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "elites.chance",
    section: "Elite monsters",
    label: "Elite chance",
    help: "Each large monster's chance of being an elite.",
    type: { kind: "number", min: 1, max: 100, step: 1, chance: true },
    default: 12,
    enabledBy: "elites.enabled",
  },
  {
    key: "quests.keyLabel",
    section: "Key quests",
    label: "Mark key quests",
    help: "A yellow ★ on the Village Chief's quest cards marks the key quests that unlock the Urgent Quest.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "rewards.sendAll",
    section: "Reward screen",
    label: "Send All to Item Box",
    help: "The reward screen gets a Send All to Item Box row: every reward that fits, the comrade's too, in one go.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "farm.harvestAll",
    section: "Pokke Farm",
    label: "Harvest all",
    help: "At the farm's Item Box, △ sends everything the farm holds (field, Mining Points, Insect Thickets, Mushroom Tree, Bee Hive) to the Item Box.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "pouch.bulkCombine",
    section: "Item pouch",
    label: "Bulk combine",
    help: 'The item pouch\'s Combine asks how many at "Combine?": left and right pick up to what the ingredients and the pouch allow, and × on Yes combines them all at once.',
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "smithy.improvePips",
    section: "Improve pips",
    label: "Mark weapons you can improve",
    help: "In the smithy's Improve, an orange pip marks each weapon you have the materials and zenny to improve.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "monsterList.slainCaptured",
    section: "Monster List",
    label: "Slain and captured",
    help: "The Monster List's card shows how many of each monster you slew and how many you captured, in place of one hunted count. The save already keeps both, so old hunts count too. In English on every disc.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "boot.skip",
    section: "Boot",
    label: "Faster start",
    help: "Skip the language choice, logos and intro movie from power-on.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "normal",
          label: "Normal",
          help: "The game's own: language, notice, logos and the intro movie.",
        },
        {
          value: "title",
          label: "Title screen",
          help: "Straight to Press START.",
        },
        {
          value: "village",
          label: "Village",
          help: "Straight into the village with your last save. Hold START from power-on to pick another.",
        },
      ],
    },
    default: "normal",
  },
];

const BY_KEY: ReadonlyMap<string, OptionDef> = new Map(WHETSTONE_OPTIONS.map((o) => [o.key, o]));

export function defaultWhetstoneSettings(): WhetstoneSettings {
  return optionDefaults(WHETSTONE_OPTIONS) as unknown as WhetstoneSettings;
}

/** `base` with every key in `changes` applied and checked. */
export function applyWhetstoneSettings(
  base: WhetstoneSettings,
  changes: Record<string, unknown>,
): WhetstoneSettings {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    out[key] = coerceOption(BY_KEY.get(key), key, value);
  }
  return out as unknown as WhetstoneSettings;
}

/** True if the option is in effect (`optionActive`). */
export function isWhetstoneActive(settings: WhetstoneSettings, option: OptionDef): boolean {
  return optionActive(BY_KEY, settings as unknown as Record<string, unknown>, option);
}

export function encodeWhetstoneSettings(settings: WhetstoneSettings): string {
  const payload: Record<string, unknown> = { v: WHETSTONE_VERSION };
  for (const option of WHETSTONE_OPTIONS) {
    if (settings[option.key] !== option.default) payload[option.key] = settings[option.key];
  }
  return encodePayload("WS", payload);
}

/** Decodes a settings string. `version` is the Whetstone version it was made with. */
export function decodeWhetstoneSettings(value: string): {
  settings: WhetstoneSettings;
  version: number;
} {
  const { v, ...options } = decodePayload("WS", value);
  if (typeof v !== "number") throw new SettingsError("That settings string is damaged");
  return { settings: applyWhetstoneSettings(defaultWhetstoneSettings(), options), version: v };
}

/** Settings from a JSON file's contents: any subset of options. */
export function whetstoneSettingsFromJson(text: string): WhetstoneSettings {
  return applyWhetstoneSettings(defaultWhetstoneSettings(), parseSettingsJson(text));
}

/** The settings as a JSON file: every option, so it documents itself. */
export function whetstoneSettingsToJson(settings: WhetstoneSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** One line per option in effect, for the log and the console. */
export function describeWhetstoneSettings(settings: WhetstoneSettings): string[] {
  return WHETSTONE_OPTIONS.filter((o) => isWhetstoneActive(settings, o)).map(
    (o) => `${o.section} / ${o.label}: ${formatOption(o, settings[o.key])}`,
  );
}
