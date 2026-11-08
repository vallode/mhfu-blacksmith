/**
 * Presentation helpers for monster drop tables. The source data keeps the
 * wiki's free-text keys ("body carves (x4)", "shiny drop : fished out, using
 * frog as bait", "low-rank") and puts quantities in item names
 * ("Plesioth Scale x2"); these split them into labelled parts for the UI.
 */

/** "low-rank" / "1-2 star guild" -> "Low Rank" / "1-2 Star Guild" */
export function formatRank(rank: string): string {
  return rank
    .replace(/-rank$/i, " rank")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export interface DropSource {
  /** How the item is obtained: "Body carves", "Break back fin", "Shiny drop" */
  title: string;
  /** How many attempts ("x4" in the source) */
  count?: number;
  /** Condition or detail after " : " / " - " / in parentheses */
  note?: string;
}

/**
 * "body carves (x4)" -> { title: "Body carves", count: 4 }
 * "shiny drop : fished out, using frog as bait" -> { title: "Shiny drop", note: "fished out, …" }
 * "break shell - gravios skull" -> { title: "Break shell", note: "gravios skull" }
 * "shiny drop ( killed )" -> { title: "Shiny drop", note: "killed" }
 */
export function parseDropSource(source: string): DropSource {
  let rest = source.replace(/\s+/g, " ").trim();
  let count: number | undefined;

  rest = rest.replace(/\(\s*x(\d+)\s*\)/i, (_, n: string) => {
    count = Number(n);
    return " ";
  });

  const notes: string[] = [];
  // Parenthesised remarks that aren't a count: "( killed )"
  rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const n = inner.trim();
    if (n) notes.push(n);
    return " ";
  });

  // "title : note" or "title - note"; only the first separator splits.
  const sep = rest.match(/\s+[:-]\s+/);
  if (sep && sep.index !== undefined) {
    const after = rest.slice(sep.index + sep[0].length).trim();
    rest = rest.slice(0, sep.index);
    if (after) notes.unshift(after);
  }

  const title = capitalize(rest.replace(/\s+/g, " ").trim());
  const note = notes.join("; ").replace(/\s+/g, " ").trim();

  const out: DropSource = { title };
  if (count !== undefined) out.count = count;
  if (note) out.note = note;
  return out;
}

/** "Plesioth Scale x2" -> ["Plesioth Scale", 2]; "Wyvern Tears" -> ["Wyvern Tears", undefined] */
export function splitDropQuantity(name: string): [string, number | undefined] {
  const m = name.match(/^(.*\S)\s+x(\d+)$/i);
  return m ? [m[1], Number(m[2])] : [name.trim(), undefined];
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
