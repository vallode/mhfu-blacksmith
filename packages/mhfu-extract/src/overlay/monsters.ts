/**
 * Presentation for disc monsters (vallode/mhfu-blacksmith#35), from
 * `monsters.json`: each site monster's emID, site name, `data/mhfu/monsters`
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
  /** Site name, for readers (`strings/monster-names.ts`); monsters pair by `id`. */
  name: string;
  /** `data/` file holding the monster. */
  file: string;
  /** Hitzone part -> [table, row] in the monster's `HitzoneTbl` list. */
  hitzones?: Record<string, [number, number]>;
  /**
   * Rank label -> group label -> `"kind/rank"` (kind `body|tail|shiny|capture|break:<type>`),
   * or `"carve:<n>"` for carve pointer `n`, a list only code picks (`monsters/rewards.ts`).
   */
  drops?: Record<string, Record<string, string>>;
}

export const MONSTER_OVERLAY = (overlay as unknown as { monsters: MonsterOverlayEntry[] }).monsters;

/** Parses a drop slot (`"break:2/high"`, `"carve:1007"`) into its kind, break type or pointer, and rank. */
export function parseDropSlot(slot: string): {
  kind: string;
  breakType?: number;
  pointer?: number;
  rank?: string;
} {
  const carveMatch = /^carve:(\d+)$/.exec(slot);
  if (carveMatch) return { kind: "carve", pointer: Number(carveMatch[1]) };
  const [kind, rank] = slot.split("/") as [string, string];
  const breakMatch = /^break:(\d+)$/.exec(kind);
  return breakMatch ? { kind: "break", breakType: Number(breakMatch[1]), rank } : { kind, rank };
}
