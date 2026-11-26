/**
 * Turns a read of the game into a Discord activity (the `activity` of the
 * local RPC's SET_ACTIVITY). Pure: the clock comes in as `now`.
 */
import {
  PRESENCE_HERB_ICON,
  presenceMonsterIcon,
  presenceWeaponIcon,
} from "blacksmith/src/lib/presence-icons";
import { questStarLevel } from "blacksmith/src/lib/quests";
import { FPS, TOWN_STAGES, type Hunter, type TownPlace } from "./layout";
import type { Names } from "./names";
import type { GameState } from "./read";

export interface Activity {
  details?: string;
  state?: string;
  timestamps?: { start?: number };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
}

/**
 * Where the pictures come from: the Blacksmith site, which Discord fetches
 * them from by URL (apps/blacksmith/src/lib/presence-icons.ts).
 */
export const SITE = "https://mhfu.vallode.com";
const GAME_IMAGE = `${SITE}/images/favicons/felyne-icon-512.png`;
const GAME_NAME = "Monster Hunter Freedom Unite";

export const WEAPON_CLASSES: Readonly<Record<string, string>> = {
  "great-sword": "Great Sword",
  "long-sword": "Long Sword",
  "sword-and-shield": "Sword and Shield",
  "dual-blades": "Dual Blades",
  hammer: "Hammer",
  "hunting-horn": "Hunting Horn",
  lance: "Lance",
  gunlance: "Gunlance",
  "light-bowgun": "Light Bowgun",
  "heavy-bowgun": "Heavy Bowgun",
  bow: "Bow",
};

export const TOWN_PLACES: Readonly<Record<TownPlace, string>> = {
  village: "In Pokke Village",
  house: "At home",
  kitchen: "In the Felyne Kitchen",
  farm: "At Pokke Farm",
  "gathering-hall": "In the Gathering Hall",
  "training-school": "At the Training School",
};

/** A quest's star level as its board shows it: "Village ★3", "Guild ★5", "G★3", "Event G★2". */
export function starLabel(hub: string, rank: string | null, stars: number): string {
  if (hub === "treasure-hunting") return "Treasure Hunt";
  const slug = hub === "guild" ? (rank ?? "low-rank") : hub;
  const level = questStarLevel(slug, stars);
  const shown = `${level.g ? "G" : ""}★${level.stars}`;
  switch (hub) {
    case "guild":
      return level.g ? shown : `Guild ${shown}`;
    case "village":
      return `Village ${shown}`;
    case "event":
      return `Event ${shown}`;
    case "challenge":
      return `Challenge ${shown}`;
    case "training-school":
      return `Training ${shown}`;
    default:
      return shown;
  }
}

/** "Forest and Hills area 9", "Jungle Base Camp", "Snowy Mountains (Night) area 5". */
export function placeLabel(map: string | undefined, area: number | null): string | undefined {
  if (!map) return undefined;
  const name = map.replace(/ \(Day\)$/, "");
  if (area === null) return name;
  return area === 0 ? `${name} Base Camp` : `${name} area ${area}`;
}

function weaponAssets(hunter: Hunter, names: Names): Activity["assets"] {
  const weapon = hunter.weapon && names.weapon(hunter.weapon.table, hunter.weapon.id);
  if (!weapon) return {};
  const cls = WEAPON_CLASSES[weapon.type] ?? weapon.type;
  return {
    small_image: SITE + presenceWeaponIcon(weapon.type, weapon.rarity),
    small_text: `${weapon.name} (${cls})`,
  };
}

export interface BuildOptions {
  now: number;
  /** When the companion first saw this game running: the town timer counts from it. */
  sessionStart: number;
}

/** The activity for a read of the game, or null to clear the presence. */
export function buildActivity(
  state: GameState,
  names: Names,
  options: BuildOptions,
): Activity | null {
  switch (state.kind) {
    case "noGame":
    case "otherGame":
      return null;
    case "unsupported":
    case "menus":
      return {
        details: "In the menus",
        timestamps: { start: options.sessionStart },
        assets: { large_image: GAME_IMAGE, large_text: GAME_NAME },
      };
    case "town": {
      const place = TOWN_STAGES[state.stage];
      return {
        details: place ? TOWN_PLACES[place] : "In town",
        state: state.hunter.name,
        timestamps: { start: options.sessionStart },
        assets: {
          large_image: GAME_IMAGE,
          large_text: GAME_NAME,
          ...weaponAssets(state.hunter, names),
        },
      };
    }
    case "quest": {
      const { quest } = state;
      const record = names.quest(quest.id);
      const target = quest.target === null ? undefined : names.monster(quest.target);
      const title = record?.title ?? `Quest ${quest.id}`;
      const stars = record ? starLabel(record.hub, record.rank, quest.stars) : `★${quest.stars}`;
      const elapsed = Math.max(0, quest.timeLimit - state.timeLeft) / FPS;
      const image = target
        ? SITE + presenceMonsterIcon(target.slug)
        : quest.delivery
          ? SITE + PRESENCE_HERB_ICON
          : GAME_IMAGE;
      return {
        details: target ? `Hunting ${target.name}` : title,
        state: placeLabel(names.map(quest.map), state.area) ?? GAME_NAME,
        timestamps: { start: Math.round(options.now - elapsed * 1000) },
        assets: {
          large_image: image,
          large_text: `${stars} · ${title}`,
          ...weaponAssets(state.hunter, names),
        },
      };
    }
  }
}

/** How far a timer's start may drift before it's sent again (emulator pauses, rounding). */
const START_TOLERANCE = 5000;

/**
 * Whether `next` would look different from `prev` in Discord: anything but
 * a timer start within `START_TOLERANCE` of the one shown.
 */
export function activityChanged(prev: Activity | null, next: Activity | null): boolean {
  if (!prev || !next) return prev !== next;
  const strip = (a: Activity) => JSON.stringify({ ...a, timestamps: undefined });
  if (strip(prev) !== strip(next)) return true;
  const a = prev.timestamps?.start;
  const b = next.timestamps?.start;
  if (a === undefined || b === undefined) return a !== b;
  return Math.abs(a - b) > START_TOLERANCE;
}
