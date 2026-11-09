/**
 * `shop-lists`: maps the shop lists in `lobby_task.ovl` found with
 * `shop-scan` (on the EU disc, the Pokke general store's lists start at
 * 0xa7210 and 0xa7280: u16 item IDs ending in 0). Numbers only.
 *
 * Reports every 0-terminated list of item IDs near those, and every u32 in
 * the overlay that points at one (with the words around it), to find how
 * the game picks a shop's list for each stage of the game.
 */
import type { OvlFile } from "../../../mhfu-extract/src/container/ovl.js";
import { itemName } from "../names.js";
import { SHOP_ANCHORS } from "./shop-scan.js";

const ITEM_COUNT = 1262;
const MIN_ITEMS = 3;
/** How far around the lists with shop items to look for more lists. */
const WINDOW = 0x2000;

export interface ItemList {
  /** File offset of the first item. */
  offset: number;
  items: number[];
  anchors: number;
}

/** Every run of valid, mostly distinct item IDs that ends in a 0 u16 and follows a 0 (or a non-item). */
export function findItemLists(buf: Buffer, from = 0x80, to = buf.length): ItemList[] {
  const lists: ItemList[] = [];
  const isItem = (v: number) => v > 0 && v < ITEM_COUNT;
  let at = from - (from % 2);
  while (at + 2 <= to) {
    const prev = at >= 2 ? buf.readUInt16LE(at - 2) : 0;
    if (!isItem(buf.readUInt16LE(at)) || isItem(prev)) {
      at += 2;
      continue;
    }
    const items: number[] = [];
    let end = at;
    while (end + 2 <= to && isItem(buf.readUInt16LE(end))) {
      items.push(buf.readUInt16LE(end));
      end += 2;
    }
    const terminated = end + 2 <= to && buf.readUInt16LE(end) === 0;
    if (terminated && items.length >= MIN_ITEMS && new Set(items).size >= items.length * 0.8) {
      lists.push({ offset: at, items, anchors: items.filter((v) => SHOP_ANCHORS.has(v)).length });
    }
    at = end + 2;
  }
  return lists;
}

export interface PointerRef {
  /** File offset of the u32 pointer. */
  at: number;
  /** The list it points at. */
  target: number;
  /** 8 words before and after the pointer, hex, with the pointer marked. */
  context: string;
}

export interface ShopListReport {
  lists: ItemList[];
  pointers: PointerRef[];
}

export function mapShopLists(ovl: OvlFile): ShopListReport {
  const buf = ovl.reader.buf;
  const anchored = findItemLists(buf).filter((l) => l.anchors >= 4);
  if (anchored.length === 0) return { lists: [], pointers: [] };
  const from = Math.max(0x80, anchored[0]!.offset - WINDOW);
  const last = anchored.at(-1)!;
  const to = Math.min(buf.length, last.offset + last.items.length * 2 + WINDOW);
  const lists = findItemLists(buf, from, to);

  const targets = new Map(lists.map((l) => [ovl.loadBase + l.offset, l.offset]));
  const pointers: PointerRef[] = [];
  for (let at = 0x80; at + 4 <= buf.length; at += 4) {
    const target = targets.get(buf.readUInt32LE(at));
    if (target === undefined) continue;
    const words: string[] = [];
    for (let k = -8; k <= 8; k++) {
      const w = at + k * 4;
      if (w < 0 || w + 4 > buf.length) continue;
      const hex = buf.readUInt32LE(w).toString(16).padStart(8, "0");
      words.push(k === 0 ? `[${hex}]` : hex);
    }
    pointers.push({ at, target, context: words.join(" ") });
  }
  return { lists, pointers };
}

export function formatShopLists(report: ShopListReport): string {
  const out = [`${report.lists.length} item lists:`, ""];
  for (const l of report.lists) {
    out.push(`0x${l.offset.toString(16)}: ${l.items.length} items, ${l.anchors} shop items`);
    out.push(`  ${l.items.map((v) => `${itemName(v)} (${v})`).join(", ")}`);
  }
  out.push("", `${report.pointers.length} pointers to them:`, "");
  for (const p of report.pointers) {
    out.push(`0x${p.at.toString(16)} -> list 0x${p.target.toString(16)}`);
    out.push(`  ${p.context}`);
  }
  return out.join("\n");
}

/** Opens a disc and maps the shop lists in `overlay/lobby_task.ovl`. */
export async function runShopLists(isoPath: string): Promise<ShopListReport> {
  const { openDiscImage } = await import("../../../mhfu-extract/src/container/image.js");
  const { detectRegion, parseSfo } = await import("../../../mhfu-extract/src/container/sfo.js");
  const { loadFileList } = await import("../../../mhfu-extract/src/container/filelist.js");
  const { parseOvl } = await import("../../../mhfu-extract/src/container/ovl.js");
  const { DataBin } = await import("../disc/databin.js");
  const { DATA_BIN_PATH } = await import("../game/load.js");

  const { source, iso } = openDiscImage(isoPath);
  try {
    const { region, discId } = detectRegion(parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO")));
    if (!region) throw new Error(`Unrecognized disc ${discId ?? "?"}`);
    const entry = iso.stat(DATA_BIN_PATH);
    const base = entry.lba * 2048;
    const dataBin = new DataBin((o, l) => source.read(base + o, l), entry.size, region);
    const index = [...loadFileList(region)].find(
      ([, name]) => name === "overlay/lobby_task.ovl",
    )?.[0];
    if (index === undefined) throw new Error("No overlay/lobby_task.ovl in DATA.BIN");
    return mapShopLists(parseOvl(dataBin.read(index)));
  } finally {
    source.close();
  }
}
