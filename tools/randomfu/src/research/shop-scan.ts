/**
 * `shop-scan`: looks for the shops' item lists, which no published source
 * documents yet. Numbers only; this changes nothing.
 *
 * A shop list is assumed to be a run of fixed-size records whose first
 * field (at some offset within the record) is a u16 item ID. Every buffer
 * is searched at every record size and field offset for runs of valid,
 * mostly distinct item IDs, scored by how many items every Monster Hunter
 * shop sells (Potion, Whetstone, Paintball, ...) they contain. The best
 * runs are reported with their item names and raw record bytes, so the
 * other fields (unlock conditions, prices) can be read off them.
 *
 * Other tables also list these items (combination recipes, quest supplies,
 * the item table itself), so candidates need checking against the game.
 */
import { itemName } from "../names.js";

/** Items a general store sells; IDs are positions in the ItemID table. */
export const SHOP_ANCHORS: ReadonlyMap<number, string> = new Map([
  [7, "Potion"],
  [8, "Mega Potion"],
  [11, "Antidote"],
  [21, "Cool Drink"],
  [22, "Hot Drink"],
  [64, "Paintball"],
  [97, "Normal S Lv2"],
  [144, "Old Pickaxe"],
  [145, "Iron Pickaxe"],
  [149, "Bugnet"],
  [151, "BBQ Spit"],
  [153, "Whetstone"],
]);

/** The ItemID table's size: IDs at or above it aren't items. */
const ITEM_COUNT = 1262;
const STRIDES = [2, 4, 6, 8, 10, 12, 16, 20, 24];
const MIN_RUN = 6;
const MIN_ANCHORS = 4;
/** Values a list may end on or skip (empty slots). */
const FILLER = new Set([0, 0xffff]);

export interface ScanBuffer {
  name: string;
  buf: Buffer;
}

export interface ShopCandidate {
  file: string;
  /** File offset of the first record. */
  offset: number;
  /** Record size in bytes. */
  stride: number;
  /** Offset of the item ID within each record. */
  field: number;
  /** Item IDs in order (0 / 0xFFFF entries are empty slots). */
  items: number[];
  anchors: number;
  distinct: number;
  /** Whether non-empty IDs only ever go up (shops may list by item ID). */
  ascending: boolean;
  /** Each record's bytes, hex, for reading the other fields. */
  records: string[];
}

function scanRuns(file: ScanBuffer, stride: number, field: number): ShopCandidate[] {
  const { buf } = file;
  const out: ShopCandidate[] = [];
  const isItem = (v: number) => v > 0 && v < ITEM_COUNT;
  // One pass per phase (start offset modulo stride, aligned to 2).
  for (let phase = 0; phase < stride; phase += 2) {
    let start = -1;
    let items: number[] = [];
    let fillerRun = 0;
    const close = (end: number) => {
      const real = items.filter((v) => !FILLER.has(v));
      if (start !== -1 && real.length >= MIN_RUN) {
        const anchors = real.filter((v) => SHOP_ANCHORS.has(v)).length;
        const distinct = new Set(real).size;
        if (anchors >= MIN_ANCHORS && distinct >= real.length * 0.8) {
          const records: string[] = [];
          for (let at = start; at < end && records.length < 400; at += stride) {
            records.push(buf.subarray(at, at + stride).toString("hex"));
          }
          out.push({
            file: file.name,
            offset: start,
            stride,
            field,
            items,
            anchors,
            distinct,
            ascending: real.every((v, i) => i === 0 || v > real[i - 1]!),
            records,
          });
        }
      }
      start = -1;
      items = [];
      fillerRun = 0;
    };
    for (let at = phase; at + stride <= buf.length; at += stride) {
      const v = buf.readUInt16LE(at + field);
      if (isItem(v) || (FILLER.has(v) && start !== -1 && fillerRun < 2)) {
        if (start === -1) start = at;
        items.push(v);
        fillerRun = FILLER.has(v) ? fillerRun + 1 : 0;
      } else {
        close(at);
      }
    }
    close(buf.length);
  }
  return out;
}

/**
 * Share of a run's entries that are shop items. Empty slots count against
 * it, or reading every other field of a record (item, empty, item, ...)
 * would score as well as the real record size.
 */
function density(c: ShopCandidate): number {
  return c.anchors / c.items.length;
}

/**
 * Negative if `a` is the better reading: more shop items, then a denser
 * list (reading a record's other fields as items dilutes it), then smaller
 * records, then the item ID first in the record (where a record starts
 * can't be told).
 */
function rank(a: ShopCandidate, b: ShopCandidate): number {
  return (
    b.anchors - a.anchors || density(b) - density(a) || a.stride - b.stride || a.field - b.field
  );
}

/** Every candidate run, best first (see `rank`). */
export function scanForShops(files: readonly ScanBuffer[]): ShopCandidate[] {
  const all: ShopCandidate[] = [];
  for (const file of files) {
    for (const stride of STRIDES) {
      for (let field = 0; field + 2 <= stride; field += 2)
        all.push(...scanRuns(file, stride, field));
    }
  }
  // The same list shows up at several strides/fields; keep the best per file+offset.
  const best = new Map<string, ShopCandidate>();
  for (const c of all) {
    const key = `${c.file}:${c.offset + c.field}`;
    const current = best.get(key);
    if (!current || rank(c, current) < 0) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => rank(a, b) || a.offset - b.offset);
}

/** A readable report of the top candidates. */
export function formatShopScan(candidates: readonly ShopCandidate[], limit = 25): string {
  const lines = [
    `${candidates.length} candidate lists. Best ${Math.min(limit, candidates.length)}:`,
    "",
  ];
  for (const c of candidates.slice(0, limit)) {
    lines.push(
      `${c.file} @ 0x${c.offset.toString(16)}: ${c.items.length} records of ${c.stride} bytes, item ID at +${c.field}, ${c.anchors} shop items${c.ascending ? ", ascending" : ""}`,
    );
    const names = c.items.map((v) => (FILLER.has(v) ? "-" : `${itemName(v)} (${v})`));
    lines.push(`  ${names.join(", ")}`);
    lines.push(`  first records: ${c.records.slice(0, 6).join(" ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Opens a disc and scans the EBOOT and every overlay in DATA.BIN. */
export async function runShopScan(
  isoPath: string,
  ebootPath: string | undefined,
  log: (line: string) => void,
): Promise<ShopCandidate[]> {
  const { openDiscImage } = await import("../../../mhfu-extract/src/container/image.js");
  const { detectRegion, parseSfo } = await import("../../../mhfu-extract/src/container/sfo.js");
  const { loadFileList } = await import("../../../mhfu-extract/src/container/filelist.js");
  const { decryptEboot } = await import("../../../mhfu-extract/src/container/eboot.js");
  const { DataBin } = await import("../disc/databin.js");
  const { DATA_BIN_PATH, EBOOT_PATH } = await import("../game/load.js");

  const { source, iso } = openDiscImage(isoPath);
  try {
    const { region, discId } = detectRegion(parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO")));
    if (!region) throw new Error(`Unrecognized disc ${discId ?? "?"}`);
    log(`${discId} (${region})`);
    const files: ScanBuffer[] = [];
    try {
      files.push({
        name: "EBOOT.BIN",
        buf: await decryptEboot(iso.readFile(EBOOT_PATH), { overridePath: ebootPath }),
      });
    } catch (error) {
      log(`Skipping the EBOOT: ${(error as Error).message.split("\n")[0]}`);
    }
    const entry = iso.stat(DATA_BIN_PATH);
    const base = entry.lba * 2048;
    const dataBin = new DataBin((o, l) => source.read(base + o, l), entry.size, region);
    for (const [index, name] of loadFileList(region)) {
      if (name.startsWith("overlay/") && index < dataBin.fileCount) {
        files.push({ name, buf: dataBin.read(index) });
      }
    }
    const total = files.reduce((n, f) => n + f.buf.length, 0);
    log(`Scanning ${files.length} files (${(total / 1048576).toFixed(1)} MB)...`);
    return scanForShops(files);
  } finally {
    source.close();
  }
}
