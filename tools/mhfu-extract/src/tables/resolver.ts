/**
 * Table address resolution strategies.
 *
 * Every EBOOT table reader needs to answer one question: "what file offset
 * does table X start at, in *this* decrypted EBOOT buffer?" Historically
 * (see offsets.ts) the answer was always "look up a hardcoded JP virtual
 * address and subtract JP_BASE_ADDRESS" — a `StaticOffsetResolver`, in the
 * vocabulary introduced here. That only works for a region/game combination
 * whose table addresses are known and stable ahead of time.
 *
 * For a region whose addresses shift unpredictably per table (confirmed for
 * EU — see README's "Region support" section: different tables shift by
 * different amounts because localized string data is inserted at different
 * points), a static table doesn't work. `SignatureResolver` instead finds a
 * table by searching the buffer for a short run of bytes known to be
 * region-independent (e.g. raw gameplay stat values, which don't change
 * between localizations) and anchored at a known position relative to the
 * table's start.
 *
 * Both implement the same `TableAddressResolver` interface so callers (and
 * a future `GameProfile`, see profile.ts) can swap strategies per
 * table/region without changing how the resolved offset is used.
 */

export class TableResolutionError extends Error {}

export interface TableAddressResolver {
  /**
   * Resolves `table`'s file offset. `buf` is the decrypted EBOOT (or other
   * container) buffer being read; resolvers that don't need buffer content
   * (e.g. a static offset table) may ignore it, but resolvers that do
   * (e.g. signature search) require it and throw `TableResolutionError` if
   * it's omitted.
   */
  resolve(table: string, buf?: Buffer): number;
}

/**
 * The "fast path": a fixed `baseAddress` and a table -> virtual-address map,
 * both known ahead of time for a specific region/game build. This is
 * exactly what offsets.ts's `JP_BASE_ADDRESS`/`JP_TABLE_ADDRESSES` encode —
 * see games/mhp2g.ts for how it's wired through this abstraction.
 */
export class StaticOffsetResolver implements TableAddressResolver {
  constructor(
    private readonly baseAddress: number,
    private readonly tableAddresses: Readonly<Record<string, number>>
  ) {}

  resolve(table: string): number {
    const vaddr = this.tableAddresses[table];
    if (vaddr === undefined) {
      throw new TableResolutionError(`StaticOffsetResolver: no known address for table "${table}"`);
    }
    return vaddr - this.baseAddress;
  }
}

/** A region-independent byte pattern used to locate one table within a buffer. */
export interface TableSignature {
  /** The exact bytes to search for — must be region-independent (e.g. raw stat values, not pointers or localized strings). */
  signature: Buffer;
  /** Byte offset of `signature`'s first byte relative to the table's own base (0 if the signature *is* the table's first bytes). */
  signatureOffset: number;
}

/** Every occurrence of `needle` in `buf`, in ascending order (may be empty). */
export function findAllOccurrences(buf: Buffer, needle: Buffer): number[] {
  if (needle.length === 0) {
    throw new TableResolutionError("findAllOccurrences: needle must not be empty (every offset would trivially match)");
  }
  const matches: number[] = [];
  let from = 0;
  for (;;) {
    const idx = buf.indexOf(needle, from);
    if (idx === -1) break;
    matches.push(idx);
    from = idx + 1;
  }
  return matches;
}

/**
 * The "signature discovery" path: resolves a table by searching a buffer for
 * a distinctive, region-independent byte pattern. Requires the search to
 * find *exactly one* occurrence — zero or multiple matches are both treated
 * as failure (ambiguous or absent) rather than silently guessing, since a
 * wrong table address would otherwise silently emit garbage data.
 *
 * Construct with only the tables you've actually validated a signature for;
 * `resolve()` throws a clear "no signature registered" error for anything
 * else, rather than pretending every table is supported.
 */
export class SignatureResolver implements TableAddressResolver {
  constructor(private readonly signatures: Readonly<Record<string, TableSignature>>) {}

  resolve(table: string, buf?: Buffer): number {
    const spec = this.signatures[table];
    if (!spec) {
      throw new TableResolutionError(
        `SignatureResolver: no signature registered for table "${table}" — this table hasn't been validated for this region yet`
      );
    }
    if (!buf) {
      throw new TableResolutionError(`SignatureResolver: resolving table "${table}" requires a buffer to search`);
    }
    const matches = findAllOccurrences(buf, spec.signature);
    if (matches.length === 0) {
      throw new TableResolutionError(
        `SignatureResolver: signature for table "${table}" not found in buffer (0 matches) — wrong region/game, or the EBOOT doesn't look like expected`
      );
    }
    if (matches.length > 1) {
      throw new TableResolutionError(
        `SignatureResolver: signature for table "${table}" is ambiguous (${matches.length} matches at ` +
          `${matches
            .slice(0, 5)
            .map((m) => `0x${m.toString(16)}`)
            .join(", ")}${matches.length > 5 ? ", ..." : ""}) — signature needs to be longer/more specific`
      );
    }
    return matches[0]! - spec.signatureOffset;
  }
}

export interface ResolverCoverageResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

/**
 * Region-agnostic substitute for JP's `verifyOffsets()` (offsets.ts): rather
 * than JP-specific structural assertions (e.g. "SharpnessID values must be
 * < 40", derived from real JP data), this simply confirms `resolver` can
 * actually resolve every table `tables` lists in `buf` without throwing —
 * meaningful for any `TableAddressResolver`, not just a `StaticOffsetResolver`.
 * A `SignatureResolver` already refuses to resolve ambiguously (0 or >1
 * matches throws, never a silent guess — see `SignatureResolver.resolve()`),
 * so "every required table resolved" is itself real evidence this is a
 * genuine, expected EBOOT for the tables that matter, not proof by itself
 * that every individual struct field is being decoded correctly.
 */
export function verifyResolverCoverage(resolver: TableAddressResolver, tables: readonly string[], buf: Buffer): ResolverCoverageResult {
  const checks = tables.map((table) => {
    try {
      const offset = resolver.resolve(table, buf);
      return { name: `resolve("${table}")`, ok: true, detail: `0x${offset.toString(16)}` };
    } catch (error) {
      return { name: `resolve("${table}")`, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  });
  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Dev-tool helper for building a new `TableSignature`, e.g. to bootstrap a
 * new region's signature from a known-good buffer whose table address is
 * already resolvable another way (typically JP's `StaticOffsetResolver`).
 * Not used by the pipeline itself — kept here so future signature-hunting
 * work (extending EU coverage, or a future US/other-game profile) has a
 * reusable building block instead of hand-rolling `buf.subarray()` calls
 * in a throwaway script every time, and to make the derivation used for
 * `EU_TABLE_SIGNATURES` in eu-signatures.ts reproducible.
 */
export function extractSignature(
  knownGoodBuf: Buffer,
  knownGoodResolver: TableAddressResolver,
  table: string,
  length: number,
  signatureOffset = 0
): TableSignature {
  const base = knownGoodResolver.resolve(table, knownGoodBuf);
  const start = base + signatureOffset;
  return { signature: Buffer.from(knownGoodBuf.subarray(start, start + length)), signatureOffset };
}
