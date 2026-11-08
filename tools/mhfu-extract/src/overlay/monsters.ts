/**
 * Presentation for disc monsters (vallode/mhfu-blacksmith#35), from
 * `monsters.json`: each site monster's emID, site name, `data/monsters`
 * file, and which disc slot each committed hitzone part and drop group
 * shows. The disc has part and break numbers, not names, and no drop-group
 * labels, so these come from the committed data, matched against the EU
 * disc and reviewed (see the file's `$comment` and the README's "Monster
 * overlays").
 */
import overlay from "./monsters.json" with { type: "json" };

export interface MonsterOverlayEntry {
  /** emID. */
  id: number;
  /** Site name (differs from the emID enum for "Scarred Yian Garuga", "Terra Shogun Ceanataur"). */
  name: string;
  /** `data/` file holding the monster. */
  file: string;
  /** Hitzone part -> [table, row] in the monster's `HitzoneTbl` list. */
  hitzones?: Record<string, [number, number]>;
  /** Rank label -> group label -> `"kind/rank"` (kind `body|tail|shiny|capture|break:<type>`). */
  drops?: Record<string, Record<string, string>>;
}

export const MONSTER_OVERLAY = (overlay as unknown as { monsters: MonsterOverlayEntry[] }).monsters;

const byName = new Map(MONSTER_OVERLAY.map((m) => [m.name, m]));

/** emID of a site monster, or null if the overlay doesn't list it. */
export function monsterIdOf(siteName: string): number | null {
  return byName.get(siteName)?.id ?? null;
}

/** Parses a drop slot (`"break:2/high"`) into its kind, break type and rank. */
export function parseDropSlot(slot: string): { kind: string; breakType?: number; rank: string } {
  const [kind, rank] = slot.split("/") as [string, string];
  const breakMatch = /^break:(\d+)$/.exec(kind);
  return breakMatch ? { kind: "break", breakType: Number(breakMatch[1]), rank } : { kind, rank };
}
