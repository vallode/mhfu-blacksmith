/**
 * One-off generator: builds a per-slot raw-index -> name-index correction
 * map for armor, using fingerprint matching (defense/resistances/rarity/
 * slots/create_cost) between real raw ArmorValue entries and the committed
 * data/armor/*.json as an oracle. Only emits a correction where the
 * fingerprint match is UNIQUE (exactly one raw candidate) AND differs from
 * the current raw-index assumption. Not run automatically — a dev-time
 * tool, output committed as src/overlay/armor-index-corrections.json.
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

function fingerprint(defence: number, fire: number, water: number, thunder: number, dragon: number, rarity: number, slots: number, price: number): string {
  return [defence, fire, water, thunder, dragon, rarity, slots, price].join("|");
}

function rawFingerprint(e: ArmorValueEntry): string {
  return fingerprint(
    e.defense,
    e.resistances.fire,
    e.resistances.water,
    e.resistances.thunder,
    e.resistances.dragon,
    e.rarity + 1,
    e.slots,
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

  const rawByFingerprint = new Map<string, number[]>();
  rawEntries.forEach((e, i) => {
    const fp = rawFingerprint(e);
    const arr = rawByFingerprint.get(fp) ?? [];
    arr.push(i);
    rawByFingerprint.set(fp, arr);
  });

  const corrections: Record<number, number> = {};
  let uniqueBoth = 0;
  let corrected = 0;
  let conflicting = 0;

  for (const cw of committed.armor) {
    const fp = fingerprint(cw.defence, cw.fire_res, cw.water_res, cw.thunder_res, cw.dragon_res, cw.rarity, cw.slots, cw.create_cost ?? -1);
    const rawCandidates = rawByFingerprint.get(fp);
    const nameCandidates = nameIndexByName.get(cw.name);
    if (!rawCandidates || rawCandidates.length !== 1) continue;
    if (!nameCandidates || nameCandidates.length !== 1) continue;
    uniqueBoth++;
    const rawIdx = rawCandidates[0]!;
    const nameIdx = nameCandidates[0]!;
    if (rawIdx === nameIdx) continue; // already correct by raw position
    if (corrections[rawIdx] !== undefined && corrections[rawIdx] !== nameIdx) {
      conflicting++;
      continue;
    }
    corrections[rawIdx] = nameIdx;
    corrected++;
  }

  const claimedNameIndices = new Set(Object.values(corrections));
  const suppressed = [...claimedNameIndices].filter((nameIdx) => corrections[nameIdx] === undefined);

  console.log(
    `${slot}: uniqueBothSides=${uniqueBoth}, corrections=${corrected}, conflicting=${conflicting}, suppressed=${suppressed.length}`
  );
  output[slot] = { corrections, suppressed };
}

const outPath = process.argv[3] ?? "src/overlay/armor-index-corrections.json";
await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
console.log(`Wrote ${outPath}`);
