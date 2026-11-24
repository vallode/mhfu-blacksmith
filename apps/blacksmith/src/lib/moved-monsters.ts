/**
 * Monster pages whose slug changed when the monster took the game's own
 * name (the EU disc's, `mhfu-extract` `strings/monster-names.ts`). The old
 * URLs stay up and send visitors to the new ones. So do the slugs people
 * guess from those names, with the dot left out ("terra-sceanataur").
 */
import type { MonsterCategory } from "./constants";

/** Category -> old slug -> current slug. */
export const MOVED_MONSTER_SLUGS: Readonly<
  Partial<Record<MonsterCategory, Readonly<Record<string, string>>>>
> = {
  carapaceon: {
    "plum-daimyo-hermitaur": "plum-d-hermitaur",
    "plum-dhermitaur": "plum-d-hermitaur",
    "terra-shogun-ceanataur": "terra-s-ceanataur",
    "terra-sceanataur": "terra-s-ceanataur",
  },
  "elder-dragon": {
    "ashen-lao-shan-lung": "ash-lao-shan-lung",
  },
};

/** The current slug for an old one, or null if `slug` didn't move. */
export function movedMonsterSlug(category: string, slug: string): string | null {
  return MOVED_MONSTER_SLUGS[category as MonsterCategory]?.[slug] ?? null;
}
