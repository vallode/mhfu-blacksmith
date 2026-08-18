/**
 * One-off generator: builds a per-slot raw-index -> name-index correction
 * map for armor, using fingerprint matching between real raw ArmorValue
 * entries and the committed data/armor/*.json as an oracle. Not run
 * automatically — a dev-time tool, output committed as
 * src/overlay/armor-index-corrections.json.
 *
 * Matching happens in three confidence tiers (see `docs/fix-plan.md` issue
 * #1 for the full investigation writeup and measured coverage):
 *
 * 1. **`fingerprint-core`** (highest volume): match on (defense, 4
 *    resistances, rarity, halved price) alone — deliberately *excluding*
 *    `slots`. Investigation finding: raw `slots` disagrees with committed
 *    `slots` for a large, structured subset of entries — overwhelmingly
 *    paired male/female ("Helm"/"Cap" etc.) armor where the two variants'
 *    slot counts are transposed relative to committed data (e.g. raw
 *    "Genprey Helm" reads `slots=0` while committed says `1`, and its "Cap"
 *    counterpart shows the opposite skew) — while every other field (a
 *    7-value combination, still high-entropy) agrees exactly. Requiring an
 *    exact `slots` match (the original approach) silently rejected these as
 *    "no match", undercounting real, unambiguous matches. Dropping `slots`
 *    from the required key alone raised raw fingerprint-unique matches from
 *    28-55% to ~68-73% coverage per slot with no loss of precision (verified:
 *    every previously-unique full-fingerprint match remains unique on the
 *    core fingerprint too, since core is a superset-match of full).
 * 2. **`fingerprint-slots-tiebreak`** (small volume, only used when tier 1 is
 *    ambiguous): if the core fingerprint matches more than one raw entry,
 *    narrow using an exact `slots` match too — recovers cases where `slots`
 *    genuinely is the discriminating field between two otherwise-identical
 *    pieces (the transposition bug isn't universal).
 * 3. Global monotonicity cleanup: raw array position and name-table index
 *    are, empirically, almost perfectly rank-correlated (>97% of adjacent
 *    confirmed pairs sorted by raw index also increase in name index — see
 *    fix-plan.md) — i.e. the two lists are *mostly* the same order with
 *    localized drift, not an unrelated shuffle. Any resolved pair that
 *    breaks this monotonic trend (computed via longest-increasing-
 *    subsequence over name-index, sorted by raw index) is a near-certain
 *    coincidental fingerprint collision (typically dummy/all-zero-stat
 *    entries) and is dropped rather than trusted.
 *
 * A correction is only recorded when both the raw fingerprint and the
 * committed name are unique (within their tier) and survive the
 * monotonicity check, and only when it actually differs from the
 * raw-index assumption (so this table is sparse — most entries need no
 * override). Raw positions whose "natural" (uncorrected) name index was
 * confidently claimed by a *different* raw position are suppressed rather
 * than guessed (see `armor-index-corrections.ts`'s doc comment).
 */
import { readFile, writeFile } from "node:fs/promises";
import { BinaryReader } from "../src/binary/reader.js";
import { readArmorValues, type ArmorValueEntry, type ArmorSlot } from "../src/tables/armor.js";
import { loadEnums } from "../src/strings/enums.js";

const ebootBuf = await readFile(process.argv[2] ?? "/tmp/mhfu-work/jp/eboot.bin");
const reader = new BinaryReader(ebootBuf);
const armor = readArmorValues(reader);
const enumsMap = loadEnums();

interface CommittedArmor {
  name: string;
  defence: number;
  fire_res: number;
  water_res: number;
  thunder_res: number;
  dragon_res: number;
  rarity: number;
  slots: number;
  create_cost: number | null;
}

const SLOT_CONFIG: Record<ArmorSlot, { file: string; nameTable: string }> = {
  head: { file: "helmet.json", nameTable: "HeadArmorID" },
  chest: { file: "plate.json", nameTable: "ChestArmorID" },
  arm: { file: "gauntlets.json", nameTable: "ArmArmorID" },
  waist: { file: "waist.json", nameTable: "WaistArmorID" },
  leg: { file: "leggings.json", nameTable: "LegArmorID" },
};

/** Core fingerprint: excludes `slots` — see module doc comment for why. */
function coreFingerprint(defence: number, fire: number, water: number, thunder: number, dragon: number, rarity: number, price: number): string {
  return [defence, fire, water, thunder, dragon, rarity, price].join("|");
}

function rawCoreFingerprint(e: ArmorValueEntry): string {
  return coreFingerprint(
    e.defense,
    e.resistances.fire,
    e.resistances.water,
    e.resistances.thunder,
    e.resistances.dragon,
    e.rarity + 1,
    Math.round(e.price / 2)
  );
}

interface SlotCorrections {
  /** rawIndex -> confirmed nameIndex, only when it differs from rawIndex. */
  corrections: Record<number, number>;
  /**
   * Raw positions whose "natural" (uncorrected) name index was confidently
   * reassigned to a *different* raw position above — i.e. this name is
   * already claimed elsewhere with higher confidence, so this raw entry
   * must NOT also fall back to emitting it (that would silently duplicate
   * the name across two entries with different, conflicting stats). These
   * positions are suppressed (emit no name / skip) rather than guessed.
   */
  suppressed: number[];
}

/** Longest strictly-increasing-by-nameIdx subsequence of pairs already sorted by rawIdx. */
function longestIncreasingByNameIdx<T extends { nameIdx: number }>(pairs: T[]): T[] {
  const n = pairs.length;
  if (n === 0) return [];
  const tails: number[] = [];
  const prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const val = pairs[i]!.nameIdx;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]!]!.nameIdx < val) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    if (lo === tails.length) tails.push(i);
    else tails[lo] = i;
  }
  const result: T[] = [];
  let k = tails[tails.length - 1]!;
  while (k !== -1) {
    result.push(pairs[k]!);
    k = prev[k]!;
  }
  return result.reverse();
}

const output: Record<string, SlotCorrections> = {};

for (const slot of Object.keys(SLOT_CONFIG) as ArmorSlot[]) {
  const { file, nameTable } = SLOT_CONFIG[slot];
  const committed = JSON.parse(await readFile(`../../data/armor/${file}`, "utf-8")) as { armor: CommittedArmor[] };
  const rawEntries = armor[slot];
  const nameEntries = enumsMap.get(nameTable)!;

  const nameIndexByName = new Map<string, number[]>();
  nameEntries.forEach((n, i) => {
    const trimmed = n.trim();
    const arr = nameIndexByName.get(trimmed) ?? [];
    arr.push(i);
    nameIndexByName.set(trimmed, arr);
  });

  const rawByCoreFingerprint = new Map<string, number[]>();
  rawEntries.forEach((e, i) => {
    const fp = rawCoreFingerprint(e);
    const arr = rawByCoreFingerprint.get(fp) ?? [];
    arr.push(i);
    rawByCoreFingerprint.set(fp, arr);
  });

  interface Pair {
    rawIdx: number;
    nameIdx: number;
    tier: "fingerprint-core" | "fingerprint-slots-tiebreak";
  }
  const pairs: Pair[] = [];
  let tier1 = 0;
  let tier2 = 0;
  let stillAmbiguous = 0;

  for (const cw of committed.armor) {
    const nameCandidates = nameIndexByName.get(cw.name);
    if (!nameCandidates || nameCandidates.length !== 1) continue;
    const nameIdx = nameCandidates[0]!;

    const fp = coreFingerprint(cw.defence, cw.fire_res, cw.water_res, cw.thunder_res, cw.dragon_res, cw.rarity, cw.create_cost ?? -1);
    const coreCandidates = rawByCoreFingerprint.get(fp);
    if (!coreCandidates || coreCandidates.length === 0) continue;

    if (coreCandidates.length === 1) {
      pairs.push({ rawIdx: coreCandidates[0]!, nameIdx, tier: "fingerprint-core" });
      tier1++;
      continue;
    }

    const slotsNarrowed = coreCandidates.filter((idx) => rawEntries[idx]!.slots === cw.slots);
    if (slotsNarrowed.length === 1) {
      pairs.push({ rawIdx: slotsNarrowed[0]!, nameIdx, tier: "fingerprint-slots-tiebreak" });
      tier2++;
      continue;
    }
    stillAmbiguous++;
  }

  // Two committed entries can't both confidently claim the same raw index —
  // keep the first (arbitrary but deterministic) and drop the rest as conflicts.
  const byRawIdx = new Map<number, Pair>();
  let rawCollisions = 0;
  for (const p of pairs) {
    const existing = byRawIdx.get(p.rawIdx);
    if (existing) {
      if (existing.nameIdx !== p.nameIdx) rawCollisions++;
      continue;
    }
    byRawIdx.set(p.rawIdx, p);
  }
  const deduped = [...byRawIdx.values()].sort((a, b) => a.rawIdx - b.rawIdx);

  const cleaned = longestIncreasingByNameIdx(deduped);
  const droppedByMonotonicity = deduped.length - cleaned.length;

  const corrections: Record<number, number> = {};
  let corrected = 0;
  for (const p of cleaned) {
    if (p.rawIdx === p.nameIdx) continue; // already correct by raw position
    corrections[p.rawIdx] = p.nameIdx;
    corrected++;
  }

  const claimedNameIndices = new Set(Object.values(corrections));
  const suppressed = [...claimedNameIndices].filter((nameIdx) => corrections[nameIdx] === undefined);

  console.log(
    `${slot}: tier1(core)=${tier1}, tier2(slots-tiebreak)=${tier2}, stillAmbiguous=${stillAmbiguous}, ` +
      `rawCollisions=${rawCollisions}, droppedByMonotonicity=${droppedByMonotonicity}, ` +
      `corrections=${corrected}, suppressed=${suppressed.length}, ` +
      `coverage=${cleaned.length}/${rawEntries.length} (${((cleaned.length / rawEntries.length) * 100).toFixed(1)}%)`
  );
  output[slot] = { corrections, suppressed };
}

const outPath = process.argv[3] ?? "src/overlay/armor-index-corrections.json";
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
console.log(`Wrote ${outPath}`);
