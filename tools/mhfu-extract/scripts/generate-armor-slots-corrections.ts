/**
 * One-off generator: builds a per-slot raw-index -> corrected-`slots`-value
 * override map, fixing the male/female armor-pair `slots`-transposition bug
 * documented in `docs/fix-plan.md` issue #1's "Update 2" (the byproduct
 * discovery that motivated dropping `slots` from the index-drift fingerprint
 * in the first place). Not run automatically — a dev-time tool, output
 * committed as `src/overlay/armor-slots-corrections.json`, consumed by
 * `emit/armor.ts`.
 *
 * **Pairing is purely structural** (no committed data involved in
 * *identifying* a pair — only in *verifying* the swap), so this can run
 * safely as a correction the runtime pipeline trusts without re-deriving it
 * from wiki data every time:
 *
 * 1. For every raw `ArmorValueEntry` position, resolve its name via the
 *    already-shipped `armor-index-corrections.json` overlay (the
 *    fingerprint-confirmed name<->stat mapping from issue #1). Positions
 *    with no confirmed name (suppressed or unconfirmed raw-position
 *    fallback) are skipped entirely — this fix only ever touches entries
 *    already known, with high confidence, to be correctly named.
 * 2. Group resolved names by "base" (name with a known gendered-piece
 *    suffix stripped — `Helm`/`Cap` for head, `Mail`/`Vest` for chest,
 *    `Vambraces`/`Guards` for arm, `Coat`/`Tasset` for waist,
 *    `Greaves`/`Leggings` for leg). Two raw positions form a candidate pair
 *    only when they share a base and have *opposite* suffixes from the same
 *    pair, and each suffix is unambiguous within that base (no candidate
 *    pair recorded if more than one raw entry resolves to the same
 *    base+suffix combination).
 *
 * The swap itself **is** verified against committed data (this part mirrors
 * `generate-armor-corrections.ts`'s oracle use), but only as a safety check,
 * not as the pairing mechanism:
 *
 * 3. For each candidate pair, look up both resolved names directly in
 *    committed `data/armor/*.json`. Skip if either is missing (not
 *    every gendered pair is confirmed-named yet), or if their raw `rarity`
 *    doesn't match committed `rarity` (a cheap sanity check that this really
 *    is the same fingerprint-confirmed identity issue #1 already validated,
 *    not a coincidental name collision).
 * 4. Only correct a **clean transposition**: raw A's `slots` exactly equals
 *    committed B's `slots` AND raw B's `slots` exactly equals committed A's
 *    `slots`, AND committed A/B's `slots` actually differ (otherwise there's
 *    nothing to detect either way). Every other outcome — already correct,
 *    or a partial/non-swap mismatch (seen often: one side matches, the other
 *    doesn't match *either* value, meaning something else entirely is wrong
 *    with that entry) — is left alone. This is deliberately conservative:
 *    forcing a swap on a non-clean case would risk turning a real
 *    already-broken entry into a *differently* broken one.
 *
 * Cross-validated three independent ways during development (raw-index
 * adjacency + corrected-name resolution; committed-JSON adjacency compared
 * against already-extracted output; full non-adjacent pairwise base+suffix
 * matching as implemented here) — all three found the exact same 8 pairs
 * (6 head, 2 waist; 0 chest/arm/leg) with the current `armor-index-
 * corrections.json` coverage. See `docs/fix-plan.md` issue #1's slots-
 * transposition update for the full writeup.
 */
import { readFile, writeFile } from "node:fs/promises";
import { BinaryReader } from "../src/binary/reader.js";
import { readArmorValues, type ArmorSlot } from "../src/tables/armor.js";
import { loadEnums, lookupName } from "../src/strings/enums.js";
import { correctedArmorNameIndex } from "../src/overlay/armor-index-corrections.js";

const ebootBuf = await readFile(process.argv[2] ?? "/tmp/mhfu-work/jp/eboot.bin");
const reader = new BinaryReader(ebootBuf);
const armor = readArmorValues(reader);
const enumsMap = loadEnums();

interface CommittedArmor {
  name: string;
  rarity: number;
  slots: number;
}

const SLOT_CONFIG: Record<ArmorSlot, { file: string; nameTable: string; suffixPairs: [string, string][] }> = {
  head: { file: "helmet.json", nameTable: "HeadArmorID", suffixPairs: [["Helm", "Cap"]] },
  chest: { file: "plate.json", nameTable: "ChestArmorID", suffixPairs: [["Mail", "Vest"]] },
  arm: { file: "gauntlets.json", nameTable: "ArmArmorID", suffixPairs: [["Vambraces", "Guards"]] },
  waist: { file: "waist.json", nameTable: "WaistArmorID", suffixPairs: [["Coat", "Tasset"]] },
  leg: { file: "leggings.json", nameTable: "LegArmorID", suffixPairs: [["Greaves", "Leggings"]] },
};

function stripSuffix(name: string, suffix: string): string | null {
  if (name === suffix) return "";
  if (name.endsWith(` ${suffix}`)) return name.slice(0, -(suffix.length + 1));
  return null;
}

function baseAndSuffix(name: string, pairs: [string, string][]): { base: string; suffix: string; other: string } | null {
  for (const [a, b] of pairs) {
    for (const [suf, other] of [
      [a, b],
      [b, a],
    ] as [string, string][]) {
      const base = stripSuffix(name, suf);
      if (base !== null) return { base, suffix: suf, other };
    }
  }
  return null;
}

const output: Record<string, Record<number, number>> = {};

for (const slot of Object.keys(SLOT_CONFIG) as ArmorSlot[]) {
  const { file, nameTable, suffixPairs } = SLOT_CONFIG[slot];
  const committed = JSON.parse(await readFile(`../../data/armor/${file}`, "utf-8")) as { armor: CommittedArmor[] };
  const committedByName = new Map(committed.armor.map((a) => [a.name, a]));
  const rawEntries = armor[slot];

  // Bucket every confidently-named raw entry by base+suffix; ambiguous
  // (>1 raw entry resolving to the same base+suffix) buckets are dropped.
  const bySuffixKey = new Map<string, number[]>();
  for (let i = 0; i < rawEntries.length; i++) {
    const nameIdx = correctedArmorNameIndex(slot, i);
    if (nameIdx === null) continue;
    const name = lookupName(enumsMap, nameTable, nameIdx);
    if (!name) continue;
    const info = baseAndSuffix(name, suffixPairs);
    if (!info) continue;
    const key = `${info.base}\u0000${info.suffix}`;
    const arr = bySuffixKey.get(key) ?? [];
    arr.push(i);
    bySuffixKey.set(key, arr);
  }

  const corrections: Record<number, number> = {};
  let candidatePairs = 0;
  let missingCommitted = 0;
  let raritySanityFailed = 0;
  let alreadyCorrect = 0;
  let cleanSwaps = 0;
  let ambiguousNonSwap = 0;

  for (const [key, rawIdxs] of bySuffixKey) {
    if (rawIdxs.length !== 1) continue; // ambiguous base+suffix — skip
    const [base, suffix] = key.split("\u0000") as [string, string];
    const pairs = suffixPairs.find(([a, b]) => a === suffix || b === suffix)!;
    const other = pairs[0] === suffix ? pairs[1] : pairs[0];
    const otherKey = `${base}\u0000${other}`;
    const otherRawIdxs = bySuffixKey.get(otherKey);
    if (!otherRawIdxs || otherRawIdxs.length !== 1) continue;
    const rawIdxA = rawIdxs[0]!;
    const rawIdxB = otherRawIdxs[0]!;
    if (rawIdxA >= rawIdxB) continue; // count each unordered pair once

    candidatePairs++;
    const nameIdxA = correctedArmorNameIndex(slot, rawIdxA)!;
    const nameIdxB = correctedArmorNameIndex(slot, rawIdxB)!;
    const nameA = lookupName(enumsMap, nameTable, nameIdxA)!;
    const nameB = lookupName(enumsMap, nameTable, nameIdxB)!;
    const cA = committedByName.get(nameA);
    const cB = committedByName.get(nameB);
    if (!cA || !cB) {
      missingCommitted++;
      continue;
    }
    const rawA = rawEntries[rawIdxA]!;
    const rawB = rawEntries[rawIdxB]!;
    if (cA.rarity !== rawA.rarity + 1 || cB.rarity !== rawB.rarity + 1) {
      raritySanityFailed++;
      continue;
    }
    if (rawA.slots === cA.slots && rawB.slots === cB.slots) {
      alreadyCorrect++;
      continue;
    }
    if (rawA.slots === cB.slots && rawB.slots === cA.slots && cA.slots !== cB.slots) {
      corrections[rawIdxA] = cA.slots;
      corrections[rawIdxB] = cB.slots;
      cleanSwaps++;
    } else {
      ambiguousNonSwap++;
    }
  }

  console.log(
    `${slot}: candidatePairs=${candidatePairs}, missingCommitted=${missingCommitted}, ` +
      `raritySanityFailed=${raritySanityFailed}, alreadyCorrect=${alreadyCorrect}, ` +
      `cleanSwaps=${cleanSwaps}, ambiguousNonSwap=${ambiguousNonSwap}`
  );
  output[slot] = corrections;
}

const outPath = process.argv[3] ?? "src/overlay/armor-slots-corrections.json";
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
console.log(`Wrote ${outPath}`);
