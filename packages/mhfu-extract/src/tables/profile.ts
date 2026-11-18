/**
 * `GameProfile` — bundles one game's table layout knowledge (which tables
 * exist, their struct shape, and how to resolve each one's address per
 * region) behind a single object, so this pipeline could in principle
 * support a second game (e.g. a future MH1/MHF1 profile) without forking
 * anything outside `src/games/`.
 *
 * Deliberately thin, matching the existing "region-aware but game-agnostic"
 * pattern already proven out by `DataCipher`/`QuestCipher` (container/databin.ts,
 * quests/mib.ts): a plain `Region` parameter into otherwise-stateless logic,
 * not a class hierarchy or plugin registry. A `GameProfile` is just a
 * `Region -> TableAddressResolver | null` function plus a declarative table
 * list — see games/mhp2g.ts for the (only, so far) real instance.
 */
import type { Region } from "../container/sfo.js";
import type { TableAddressResolver } from "./resolver.js";

/**
 * Declarative metadata about one table, independent of how its address is
 * resolved. `entrySize`/`count` are omitted for tables that aren't a single
 * fixed-stride array (e.g. `equipmentCreate`/`equipmentUpgrade`, which are a
 * sequence of differently-sized sections — see tables/recipes.ts).
 */
export interface TableDescriptor {
  name: string;
  /** Size in bytes of one entry, for tables that are a flat fixed-stride array. */
  entrySize?: number;
  /** Entry count, for tables that are a flat fixed-stride array. */
  count?: number;
}

export interface GameProfile {
  /** Short machine-readable id, e.g. "mhp2g". */
  readonly id: string;
  /** Every table this profile knows about, regardless of which regions can currently resolve it. */
  readonly tables: readonly TableDescriptor[];
  /**
   * Returns the address resolution strategy for `region`, or `null` if this
   * profile has no support at all for that region yet (as opposed to a
   * `TableAddressResolver` that throws per-table for tables it can't
   * resolve — see `SignatureResolver`, which is the expected shape for a
   * region with partial per-table coverage).
   */
  resolverForRegion(region: Region): TableAddressResolver | null;
}
