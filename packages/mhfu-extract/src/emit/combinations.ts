/**
 * `data/combinations.json`-shaped output from the EBOOT's combination tables
 * (`tables/combinations.ts`): every Combination List entry with its
 * ingredients, result, success rate and how many it makes, plus the Books of
 * Combos and their rate bonuses. Items are named through the `ItemID` enum;
 * `build-data` renames them to `data/items.json`'s names by ID.
 */
import { getNameResolver } from "../strings/names.js";
import {
  COMBINATION_FLAGS,
  type CombinationTables,
  type QuantityRoll,
} from "../tables/combinations.js";

export interface EmittedItemRef {
  id: number;
  name: string;
}

export interface EmittedCombination {
  /** Its number in the in-game Combination List, from 1. */
  number: number;
  result: EmittedItemRef;
  /** In the order the Combination List shows them. */
  ingredients: [EmittedItemRef, EmittedItemRef];
  /** Percent, before Books of Combos and skills. */
  success_rate: number;
  /** What one success gives, smallest amount first. */
  quantity: QuantityRoll[];
  /** Needs the Alchemy skill, or the Alchemy Guide in the box or pouch. */
  alchemy?: true;
  /** Always succeeds with the Bomber skill. */
  bomb?: true;
  /** Always succeeds with the Trap Master skill. */
  trap?: true;
}

export interface EmittedCombinationsFile {
  /** The Books of Combos, in order. */
  books: EmittedItemRef[];
  /** Success rate bonus (percent) for owning the first 0, 1, … books. */
  book_bonus: number[];
  combinations: EmittedCombination[];
}

export function emitCombinations(tables: CombinationTables): EmittedCombinationsFile {
  const names = getNameResolver();
  const ref = (id: number): EmittedItemRef => ({
    id,
    name: names.resolve("ItemID", id) ?? `Item ${id}`,
  });
  return {
    books: tables.books.map(ref),
    book_bonus: tables.bookBonus,
    combinations: tables.recipes.map((r) => ({
      number: r.listIndex + 1,
      result: ref(r.result),
      ingredients: [ref(r.ingredients[0]), ref(r.ingredients[1])],
      // readCombinations checks every class is in the tables.
      success_rate: tables.rates[r.rateClass]!,
      quantity: tables.quantities[r.quantityClass]!,
      ...(r.flags & COMBINATION_FLAGS.alchemy ? { alchemy: true as const } : {}),
      ...(r.flags & COMBINATION_FLAGS.bomb ? { bomb: true as const } : {}),
      ...(r.flags & COMBINATION_FLAGS.trap ? { trap: true as const } : {}),
    })),
  };
}
