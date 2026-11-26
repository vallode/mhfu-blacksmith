/**
 * Name matching for autocomplete and for names typed without it: forgiving
 * of case, punctuation and spacing ("kutku" finds Yian Kut-Ku), and of the
 * other spellings an entry lists (aliases, nicknames, the Japanese name).
 */

/** Lowercase, accents and punctuation gone, words split on anything else. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const compact = (s: string) => s.replace(/ /g, "");

/** Whether `q`'s letters appear in `s` in order. */
function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (const c of s) if (c === q[i]) i++;
  return i === q.length;
}

/**
 * How well a query matches one spelling: 0 for not at all, up to 100 for
 * the same name.
 */
export function score(query: string, spelling: string): number {
  const q = normalize(query);
  const s = normalize(spelling);
  if (!q) return 1;
  if (s === q) return 100;
  if (s.startsWith(q)) return 80;
  if (s.split(" ").some((w) => w.startsWith(q))) return 65;
  if (compact(s) === compact(q)) return 90;
  if (compact(s).startsWith(compact(q))) return 60;
  if (s.includes(q) || compact(s).includes(compact(q))) return 45;
  const words = q.split(" ");
  if (words.length > 1 && words.every((w) => s.includes(w))) return 40;
  if (q.length >= 3 && subsequence(compact(q), compact(s))) return 10;
  return 0;
}

/**
 * The entries that match `query` best, best first: by their best spelling,
 * then `group` (lower first), then the shorter name, then the order given.
 * An empty query lists them by group, then in order.
 */
export function bestMatches<T>(
  entries: readonly T[],
  query: string,
  spellings: (entry: T) => readonly string[],
  limit: number,
  group: (entry: T) => number = () => 0,
): T[] {
  const scored: { entry: T; score: number; group: number; length: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const names = spellings(entry);
    const best = Math.max(0, ...names.map((n) => score(query, n)));
    if (best > 0) {
      scored.push({
        entry,
        score: best,
        group: group(entry),
        length: names[0]?.length ?? 0,
        order,
      });
    }
  });
  scored.sort(
    (a, b) => b.score - a.score || a.group - b.group || a.length - b.length || a.order - b.order,
  );
  return scored.slice(0, limit).map((s) => s.entry);
}
