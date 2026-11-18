export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/(?<!\s)(?!\w)'(?=\w)/g, "-")
    .replace(/\s&\s/g, " ")
    .replace(/['\"()]/g, "")
    .replace(/\.\s/g, "-")
    .replace(/[\s,.&]/g, "-")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/á/g, "a")
    .replace(/\+/g, "-plus");
}

/**
 * Slugs for the armor pieces of one slot + rank, in the same order.
 *
 * Some pieces exist as separate Male and Female entries under the exact same
 * in-game name (e.g. the high-rank Red/Blue Guild Guard gloves, suits, coils
 * and boots), so `slugify(name)` alone collides. Those pieces get their sex
 * appended ("redguildguard-gloves-male" / "redguildguard-gloves-female");
 * every other piece keeps its plain name slug.
 */
export function armorSlugs(pieces: readonly { name: string; sex?: string }[]): string[] {
  const base = pieces.map((p) => slugify(p.name));
  const counts = new Map<string, number>();
  for (const s of base) counts.set(s, (counts.get(s) ?? 0) + 1);
  return pieces.map((p, i) => {
    const sex = p.sex?.trim().toLowerCase();
    return counts.get(base[i])! > 1 && (sex === "male" || sex === "female")
      ? `${base[i]}-${sex}`
      : base[i];
  });
}
