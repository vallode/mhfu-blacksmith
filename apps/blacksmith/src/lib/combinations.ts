/**
 * Item combinations (data/combinations.json, the in-game Combination List):
 * the compact public/data/combinations.json bundle generate-data writes, and
 * an index of what each item is made from and used to make. Pure, so the item pages
 * build it on the client and the tests build it from data/.
 */

/** One entry of data/combinations.json (see data/schemas/combination.schema.json). */
export interface CombinationRecord {
  number: number;
  result: { id: number; name: string };
  ingredients: { id: number; name: string }[];
  success_rate: number;
  quantity: { amount: number; chance: number }[];
  alchemy?: true;
  bomb?: true;
  trap?: true;
}

export interface CombinationsFile {
  books: { id: number; name: string }[];
  book_bonus: number[];
  combinations: CombinationRecord[];
}

/** `[number, result, ingredient, ingredient, rate, [amount, chance][], flags?]` */
export type CompactCombination = [
  number,
  number,
  number,
  number,
  number,
  [number, number][],
  number?,
];

const ALCHEMY = 1;
const BOMB = 2;
const TRAP = 4;

export interface Combination {
  /** Its number in the in-game Combination List */
  number: number;
  /** Item ID made */
  result: number;
  /** Item IDs, in the list's order */
  ingredients: [number, number];
  /** Percent, before Books of Combos and skills */
  successRate: number;
  /** What one success gives, smallest amount first */
  quantity: { amount: number; chance: number }[];
  /** Needs the Alchemy skill or the Alchemy Guide */
  alchemy: boolean;
  /** Always succeeds with Bomber */
  bomb: boolean;
  /** Always succeeds with Trap Master */
  trap: boolean;
}

/** public/data/combinations.json */
export interface CombinationsBundle {
  kind: "combinations";
  combinations: CompactCombination[];
  /** Success bonus (percent) for owning the first 0, 1, … Books of Combos */
  book_bonus: number[];
}

export function encodeCombinations(file: CombinationsFile): CombinationsBundle {
  return {
    kind: "combinations",
    combinations: file.combinations.map(encodeCombination),
    book_bonus: file.book_bonus,
  };
}

/** The decoded bundle: each item's combinations, and the books' bonuses. */
export interface CombinationIndex {
  byItem: Map<number, ItemCombinations>;
  /** Success bonus (percent) for owning the first 0, 1, … Books of Combos */
  bookBonus: number[];
}

export function decodeCombinations(bundle: CombinationsBundle): CombinationIndex {
  return {
    byItem: indexCombinations(bundle.combinations.map(decodeCombination)),
    bookBonus: bundle.book_bonus,
  };
}

export function encodeCombination(c: CombinationRecord): CompactCombination {
  const flags = (c.alchemy ? ALCHEMY : 0) | (c.bomb ? BOMB : 0) | (c.trap ? TRAP : 0);
  const out: CompactCombination = [
    c.number,
    c.result.id,
    c.ingredients[0].id,
    c.ingredients[1].id,
    c.success_rate,
    c.quantity.map((q) => [q.amount, q.chance]),
  ];
  if (flags) out.push(flags);
  return out;
}

export function decodeCombination([
  number,
  result,
  a,
  b,
  successRate,
  quantity,
  flags = 0,
]: CompactCombination): Combination {
  return {
    number,
    result,
    ingredients: [a, b],
    successRate,
    quantity: quantity.map(([amount, chance]) => ({ amount, chance })),
    alchemy: (flags & ALCHEMY) !== 0,
    bomb: (flags & BOMB) !== 0,
    trap: (flags & TRAP) !== 0,
  };
}

export interface ItemCombinations {
  /** Combinations that make the item, in list order */
  madeFrom: Combination[];
  /** Combinations the item is an ingredient of, in list order */
  usedIn: Combination[];
}

/** Every item's combinations, by item ID. */
export function indexCombinations(list: readonly Combination[]): Map<number, ItemCombinations> {
  const out = new Map<number, ItemCombinations>();
  const entry = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = { madeFrom: [], usedIn: [] };
      out.set(id, e);
    }
    return e;
  };
  for (const c of [...list].sort((a, b) => a.number - b.number)) {
    entry(c.result).madeFrom.push(c);
    // Once, even if both ingredients are this item, and not where it makes
    // itself: that one is already under madeFrom.
    for (const id of new Set(c.ingredients)) if (id !== c.result) entry(id).usedIn.push(c);
  }
  return out;
}

/** "×1", "×1-2", "×2-4" (an ASCII hyphen: the game font's dash is full width) */
export function quantityLabel(quantity: Combination["quantity"]): string {
  const min = quantity[0]?.amount ?? 1;
  const max = quantity.at(-1)?.amount ?? min;
  return min === max ? `×${min}` : `×${min}-${max}`;
}

/** "1 (70%), 2 (30%)", for a quantity that varies; empty when it's fixed. */
export function quantityOdds(quantity: Combination["quantity"]): string {
  if (quantity.length < 2) return "";
  return quantity.map((q) => `${q.amount} (${q.chance}%)`).join(", ");
}

/** The notes under a combination: what it needs and what makes it certain. */
export function combinationNotes(c: Combination): string[] {
  const notes: string[] = [];
  if (c.alchemy) notes.push("Needs Alchemy or the Alchemy Guide");
  if (c.bomb) notes.push("100% with Bomber");
  if (c.trap) notes.push("100% with Trap Master");
  const odds = quantityOdds(c.quantity);
  if (odds) notes.push(`Makes ${odds}`);
  return notes;
}
