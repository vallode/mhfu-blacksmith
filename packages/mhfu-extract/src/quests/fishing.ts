/**
 * Fishing points: each stage overlay's fish tables, by mission rank, and the
 * stage-to-area mapping `data/gathering.json` uses to place them.
 *
 * A stage overlay ends its data with six `{ s8 weight, u8 fish }` tables and
 * a pointer to each, in `MissionRankId` order: EASY, LOW, HIGH, TREASURE,
 * TRAINING, G (see tclamb/mhp2g-decomp's `Gamestage` and `FishId`). A table
 * ends at weight -1 (0xff); its weights add up to 100, so they're the chance
 * per catch. Fish 0 is a catch that gives nothing and has no item.
 *
 * The pointer tables sit at different offsets in different stages, so they're
 * found by shape: six pointers into the file, then a zero word, each leading
 * to a valid table. A stage with no fishing has no such list.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BinaryReader } from "../binary/reader.js";
import { OVL_HEADER_SIZE, parseOvl, type OvlFile } from "../container/ovl.js";
import type { MapGeometry } from "../tables/map-layout.js";

/** One fish in a table. */
export interface FishEntry {
  /** Its item ID, from the `ItemID` enum. */
  itemId: number;
  /** Percent per catch. */
  chance: number;
}

/** A stage's six fish tables, in `MissionRankId` order. */
export type FishTables = readonly (readonly FishEntry[])[];

/** Map ID -> area index -> that area's fish tables. */
export type FishingTables = ReadonlyMap<number, ReadonlyMap<number, FishTables>>;

const RANK_TABLES = 6;
const TABLE_END = 0xff;

/**
 * `FishId` (0 NONE, then every fish) as `ItemID`s. The first fifteen fish
 * share the items' order; the rest are the Treasure Hunt and Casting Machine
 * fish further down the item table.
 */
const FISH_ITEM_IDS: readonly number[] = [
  0, // NONE
  229, // Knife Mackerel
  230, // Sushifish
  231, // Sleepyfish
  232, // Pin Tuna
  233, // Rumblefish
  234, // Scatterfish
  235, // Burst Arrowana
  236, // Bomb Arrowana
  237, // Glutton Tuna
  238, // Gastronome Tuna
  239, // Speartuna
  240, // Small Goldenfish
  241, // Goldenfish
  242, // Silverfish
  243, // Ancient Fish
  244, // Springnight Carp
  1208, // Lady Mackerel
  1209, // Angler Snapper
  1210, // Yokotuna
  1211, // Nobunaga Bonito
  1212, // Goldendrome
  1213, // Amateratuna
  1215, // Chuck Mackerel
  1216, // Victory Fish
  1217, // Plump Goldenfish
  1218, // Hideyoshi Ambrosia
  1219, // Silverdrome
  1220, // Susanofish
  1225, // Pickaxe Fish
  1226, // Bugnet Fish
  1227, // Cooler Fish
  1224, // Small Wyvernfish
  1223, // Med Wyvernfish
  1222, // Large Wyvernfish
  1214, // Brilliant Aji
  1221, // Pharr Yellowtail
];

/** A fish item table at `offset`, or null when it isn't one. */
function readFishTable(reader: BinaryReader, offset: number): FishEntry[] | null {
  if (offset < OVL_HEADER_SIZE || offset >= reader.length) return null;
  const items: FishEntry[] = [];
  let total = 0;
  for (let at = offset; at + 1 < reader.length; at += 2) {
    const weight = reader.u8(at);
    const fish = reader.u8(at + 1);
    if (weight === TABLE_END) return total === 100 ? items : null;
    const itemId = FISH_ITEM_IDS[fish];
    if (itemId === undefined || weight > 100) return null;
    total += weight;
    if (total > 100) return null;
    if (itemId !== 0 && weight > 0) items.push({ itemId, chance: weight });
  }
  return null;
}

/**
 * A stage overlay's six fish tables, or null when the stage has no fishing.
 * Any other six-pointer list in the file fails the table checks.
 */
export function readFishTables(ovl: OvlFile): FishTables | null {
  const { reader } = ovl;
  for (let at = OVL_HEADER_SIZE; at + (RANK_TABLES + 1) * 4 <= reader.length; at += 4) {
    const pointers = Array.from({ length: RANK_TABLES }, (_, i) => reader.u32(at + i * 4));
    if (!pointers.every((pointer) => ovl.isOwnVaddr(pointer))) continue;
    // The list has no EPIC_HUNTING entry, so the word after it is empty.
    if (reader.u32(at + RANK_TABLES * 4) !== 0) continue;
    const tables = pointers.map((pointer) => readFishTable(reader, ovl.vaddrToOffset(pointer)));
    if (tables.every((table) => table !== null)) return tables as FishTables;
  }
  return null;
}

/**
 * Reads every fishing stage the maps use, with each stage's tables under its
 * map and area. Areas without fishing are left out.
 */
export async function loadFishingTables(
  unpackedDir: string,
  maps: ReadonlyMap<number, MapGeometry>,
): Promise<FishingTables> {
  const stages = [...new Set([...maps.values()].flatMap((map) => map.stages))].sort(
    (a, b) => a - b,
  );
  const byStage = new Map<number, FishTables>();
  for (const stage of stages) {
    const name = `stage${String(stage).padStart(3, "0")}.ovl`;
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(unpackedDir, "data-bin", "overlay", name));
    } catch (error) {
      // The map lists a stage whose overlay isn't unpacked: no fishing there.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const tables = readFishTables(parseOvl(bytes));
    if (tables) byStage.set(stage, tables);
  }

  const out = new Map<number, ReadonlyMap<number, FishTables>>();
  for (const [mapId, map] of maps) {
    const areas = new Map<number, FishTables>();
    map.stages.forEach((stage, area) => {
      const tables = byStage.get(stage);
      if (tables) areas.set(area, tables);
    });
    if (areas.size > 0) out.set(mapId, areas);
  }
  return out;
}
