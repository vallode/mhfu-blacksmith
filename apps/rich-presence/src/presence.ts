/**
 * The words and pictures the presence uses. The plugin's script gets them as
 * tables (plugin.ts).
 */
import { questStarLevel } from "blacksmith/src/lib/quests";
import type { TownPlace } from "./layout";

/**
 * Where the pictures come from: the Blacksmith site, which Discord fetches
 * them from by URL (apps/blacksmith/src/lib/presence-icons.ts).
 */
export const SITE = "https://mhfu.vallode.com";
export const GAME_IMAGE = `${SITE}/images/favicons/felyne-icon-512.png`;
export const GAME_NAME = "Monster Hunter Freedom Unite";

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
