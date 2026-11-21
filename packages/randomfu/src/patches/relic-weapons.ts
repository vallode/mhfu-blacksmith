/**
 * Relics, the MVP (docs/ruststone-weapons.md): relic stones from quest
 * rewards, an Unpolished Relic from the smithy's Create list, and a pick of
 * three rolled relics from Improve Weapon. The rolls run in game
 * (`blob/relic-weapons.c`); this file sets up what they need on the disc:
 *
 * - room for new weapon IDs (`weapon-tables.ts`): per side, an Unpolished
 *   Relic for every rank and class, then 64 instances, the IDs relics are
 *   rolled into;
 * - their records, upgrade entries, names and descriptions;
 * - one Create entry per rank, which the blob points at the Unpolished
 *   Relic of the class the front stone holds;
 * - three stones on EU's unused ("dummy") item IDs;
 * - the blob's table: where everything is, and per rank and class the
 *   weapons whose frames relics borrow and the rank's best attack and
 *   element (a relic's notch 6).
 *
 * EU only: JP has no unused item IDs for the stones.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { readMessageFile } from "mhfu-extract/src/strings/messages.js";
import { resolveTableOffset, ITEM_ENTRY_SIZE } from "mhfu-extract/src/tables/offsets.js";
import {
  WEAPON_TYPE_NAMES,
  readModelToWeaponType,
  type WeaponTypeName,
} from "mhfu-extract/src/tables/weapons.js";
import { readDualAttributeWeapons } from "mhfu-extract/src/tables/dual-attributes.js";
import { decodeObjects } from "../blob/link.js";
import { RELIC_WEAPONS_OBJECTS } from "../blob/relic-weapons-object.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import { findImports } from "./code-loader.js";
import { codeSegment } from "./mips.js";
import {
  CREATE_ENTRY,
  MELEE_IDS,
  MELEE_STATS,
  RANGED_IDS,
  RANGED_STATS,
  UPGRADE_ENTRY,
  expandWeaponTables,
  type ExpandedTables,
} from "./weapon-tables.js";

export const relicsObjects = () => decodeObjects(RELIC_WEAPONS_OBJECTS);

export type RelicRolls = "seeded" | "clock";
export type RelicPower = "fair" | "strong" | "wild";
/** The highest attack and element notch: 6 is the rank's best, each past it +5% attack. */
export const POWER_CAP: Record<RelicPower, number> = { fair: 6, strong: 9, wild: 12 };

export const RANKS = ["Low Rank", "High Rank", "G Rank"] as const;
const CLASSES = WEAPON_TYPE_NAMES.length; // 11
const RANGED_CLASSES = new Set<WeaponTypeName>(["heavy-bowgun", "light-bowgun", "bow"]);
export const INSTANCES = 64;
/** EU's unused item IDs (each named "dummy"), for the Low, High and G Rank stones. */
export const STONE_ITEMS = [91, 92, 465] as const;
/** Flat Ruststone: the stones copy its item record (icon, colour, carry limit). */
const RUSTSTONE_ITEM = 820;
const SYSTEM_TIME_LOW_NID = 0x369ed59d;
/** Percent of completed quests that drop a stone (each rank's first always does). */
export const STONE_CHANCE = 30;

const SHORT: Record<WeaponTypeName, string> = {
  "great-sword": "Great Sword",
  "heavy-bowgun": "H.Bowgun",
  hammer: "Hammer",
  lance: "Lance",
  "sword-and-shield": "Sword",
  "light-bowgun": "L.Bowgun",
  "dual-blades": "Dual Blades",
  "long-sword": "Long Sword",
  "hunting-horn": "Horn",
  gunlance: "Gunlance",
  bow: "Bow",
};
const RANK_SUFFIX = ["", "+", " G"];
const STONES = [
  {
    name: "Relic Shard",
    text: "A Low Rank relic stone. Create\nturns it into an Unpolished\nRelic of the class it holds.",
  },
  {
    name: "Relic Stone",
    text: "A High Rank relic stone. Create\nturns it into an Unpolished\nRelic of the class it holds.",
  },
  {
    name: "Relic Core",
    text: "A G Rank relic stone. Create\nturns it into an Unpolished\nRelic of the class it holds.",
  },
];
const UNPOLISHED_TEXT =
  "An Unpolished Relic. Improve\nit to choose one of three\nrelics it could become.";
const RELIC_TEXT = "A relic, polished from stone.\nNo two are quite alike.";
const ADJECTIVES = [
  "Ashen",
  "Hollow",
  "Grave",
  "Silent",
  "Rusted",
  "Elder",
  "Sunken",
  "Bitter",
  "Pale",
  "Iron",
  "Storm",
  "Dusk",
  "Ember",
  "Frost",
  "Wild",
  "Old",
  "Gilded",
  "Barrow",
];
const NOUNS = [
  "Fang",
  "Crown",
  "Oath",
  "Edge",
  "Song",
  "Thorn",
  "Vow",
  "Tide",
  "Ward",
  "Brand",
  "Spire",
  "Wake",
  "Gale",
  "Root",
  "Relic",
  "Saint",
];

interface Band {
  rank: number;
  cls: number;
  side: 0 | 1;
  unpolished: number;
  bestAttack: number;
  bestElement: number;
  donorAt: number;
  donors: number;
  weakest: Weapon;
}

interface Weapon {
  side: 0 | 1;
  id: number;
  cls: number;
  rank: number;
  attack: number;
  element: number;
}

/** The stored rarity (shown one higher) of a Worn relic at each rank. */
const RARITY_BASE = [1, 4, 7];

function rankOf(rarity: number): number {
  return rarity <= 3 ? 0 : rarity <= 6 ? 1 : 2;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

export interface Relics {
  externs: Record<string, number>;
  data: Record<string, Buffer>;
  tables: ExpandedTables;
  /**
   * The report, once the code loader has run. Without the loader the relics
   * can't work (no stones drop, nothing rolls), so their edits are undone.
   */
  finish(applied: boolean): ShuffleReport;
}

/**
 * The files relics edit, as they were before: `undo` puts back every byte
 * relics changed (and the EBOOT's length), leaving later edits to other bytes.
 */
function undoable(edits: Edits, files: number[]) {
  const ebootBefore = Buffer.from(edits.eboot());
  const before = new Map(files.map((i) => [i, Buffer.from(edits.dataFileNow(i))]));
  let ebootAfter: Buffer | null = null;
  let after = new Map<number, Buffer>();
  const revert = (now: Buffer, was: Buffer, changed: Buffer) => {
    const out = Buffer.from(now.subarray(0, was.length));
    for (let k = 0; k < was.length; k++) if (changed[k] !== was[k]) out[k] = was[k]!;
    return out;
  };
  return {
    /** Marks what relics changed: everything up to now. */
    done() {
      ebootAfter = Buffer.from(edits.eboot());
      after = new Map(files.map((i) => [i, Buffer.from(edits.dataFileNow(i))]));
    },
    undo() {
      if (!ebootAfter) return;
      edits.replaceEboot(revert(edits.eboot(), ebootBefore, ebootAfter));
      for (const [i, was] of before) {
        const now = edits.dataFileNow(i);
        if (!now.equals(was)) edits.dataFile(i).set(revert(now, was, after.get(i)!));
      }
    },
  };
}

export interface RelicOptions {
  rolls: RelicRolls;
  power: RelicPower;
  runSeed: number;
}

export function prepareRelics(
  game: GameData,
  edits: Edits,
  rng: Rng,
  options: RelicOptions,
): Relics | string {
  if (game.region !== "eu") return "only the EU disc has unused item IDs for the stones";
  const vanilla = game.eboot;
  const segment = codeSegment(vanilla);
  if (!segment) return "the EBOOT isn't an ELF";
  const time = findImports(vanilla, segment).get(SYSTEM_TIME_LOW_NID);
  if (time === undefined) return "the EBOOT doesn't import sceKernelGetSystemTimeLow";

  const languages = messageFiles(game);
  if (!languages.length) return "no message files found";
  const overlays = [game.lobbyTask, game.gameTask, game.editTask].flatMap((o) =>
    o ? [o.index] : [],
  );
  const changes = undoable(edits, [...overlays, ...languages]);

  // The weapons as the shuffles left them: class, rank, attack and element.
  const before = edits.eboot();
  const reader = new BinaryReader(before);
  const modelType = readModelToWeaponType(reader, game.resolver);
  const dual = new Set(readDualAttributeWeapons(reader, game.resolver).map((w) => w.weaponId));
  const meleeAt = resolveTableOffset("weaponsBlademaster", reader, game.resolver);
  const rangedAt = resolveTableOffset("weaponsGunner", reader, game.resolver);
  const weapons: Weapon[] = [];
  for (let id = 1; id < MELEE_IDS; id++) {
    const at = meleeAt + id * MELEE_STATS;
    const type = modelType[before.readUInt16LE(at)];
    const attack = before.readUInt16LE(at + 10);
    if (!type || RANGED_CLASSES.has(type) || !attack || dual.has(id)) continue;
    const element = before[at + 15]! || before[at + 17]!;
    weapons.push({
      side: 0,
      id,
      cls: WEAPON_TYPE_NAMES.indexOf(type),
      rank: rankOf(before[at + 2]!),
      attack,
      element,
    });
  }
  for (let id = 1; id < RANGED_IDS; id++) {
    const at = rangedAt + id * RANGED_STATS;
    const type = modelType[before.readUInt16LE(at)];
    const attack = before.readUInt16LE(at + 8);
    if (!type || !RANGED_CLASSES.has(type) || !attack) continue;
    weapons.push({
      side: 1,
      id,
      cls: WEAPON_TYPE_NAMES.indexOf(type),
      rank: rankOf(before[at + 2]!),
      attack,
      element: before[at + 18]!,
    });
  }

  // Bands: rank × class.
  const bands: Band[] = [];
  const donors: number[] = [];
  const firstUnpolished = [MELEE_IDS, RANGED_IDS];
  const count = [0, 0];
  for (let rank = 0; rank < RANKS.length; rank++) {
    for (let cls = 0; cls < CLASSES; cls++) {
      const side: 0 | 1 = RANGED_CLASSES.has(WEAPON_TYPE_NAMES[cls]!) ? 1 : 0;
      let pool = weapons.filter((w) => w.cls === cls && w.rank === rank);
      // A rank with no weapons of a class borrows the nearest rank's.
      for (let d = 1; !pool.length && d < RANKS.length; d++) {
        pool = weapons.filter((w) => w.cls === cls && Math.abs(w.rank - rank) === d);
      }
      if (!pool.length) return `no ${WEAPON_TYPE_NAMES[cls]} to borrow frames from`;
      const elements = pool.map((w) => w.element).filter((e) => e > 0);
      bands.push({
        rank,
        cls,
        side,
        unpolished: firstUnpolished[side]! + count[side]!++,
        bestAttack: percentile(
          pool.map((w) => w.attack),
          0.9,
        ),
        bestElement: Math.max(1, percentile(elements.length ? elements : [20], 0.9)),
        donorAt: donors.length,
        donors: pool.length,
        weakest: pool.reduce((a, b) => (b.attack < a.attack ? b : a)),
      });
      donors.push(...pool.map((w) => w.id));
    }
  }
  const firstInstance = [MELEE_IDS + count[0]!, RANGED_IDS + count[1]!];

  // Room, and one Create entry per rank: the stone, always listed (byte 1), first as a Great Sword.
  const create = STONE_ITEMS.map((stone, rank) => {
    const e = Buffer.alloc(CREATE_ENTRY);
    e[0] = 5;
    e[1] = 1;
    e.writeUInt16LE(bands[rank * CLASSES]!.unpolished, 2);
    e.writeUInt16LE(stone, 4);
    e.writeUInt16LE(1, 6);
    return e;
  });
  const tables = expandWeaponTables(game, edits, {
    melee: count[0]! + INSTANCES,
    ranged: count[1]! + INSTANCES,
    create,
  });
  if (typeof tables === "string") return tables; // it changes nothing when it can't
  const eboot = edits.eboot();
  const stats = [tables.offset.meleeStats, tables.offset.rangedStats];
  const upgrade = [tables.offset.meleeUpgrade, tables.offset.rangedUpgrade];
  const description = [tables.offset.meleeDescription, tables.offset.rangedDescription];
  const size = [MELEE_STATS, RANGED_STATS];
  const record = (side: number, id: number) => stats[side]! + id * size[side]!;

  // New descriptions go after each side's last: index 556 and 557 (melee), 205 and 206 (ranged).
  const texts = readMessageFile(game.dataBin.read(languages[0]!))!;
  const descFirst = [texts[4]!.strings.length, texts[6]!.strings.length];

  // Unpolished Relics: their band's weakest weapon at 60% of the band's best attack.
  for (const b of bands) {
    const at = record(b.side, b.unpolished);
    eboot.copy(
      eboot,
      at,
      record(b.side, b.weakest.id),
      record(b.side, b.weakest.id) + size[b.side]!,
    );
    eboot[at + 2] = RARITY_BASE[b.rank]! - 1;
    eboot.writeUInt32LE(500 * (b.rank + 1), at + 4);
    eboot.writeUInt16LE(Math.round(b.bestAttack * 0.6), at + (b.side ? 8 : 10));
    eboot.fill(
      0,
      upgrade[b.side]! + b.unpolished * UPGRADE_ENTRY,
      upgrade[b.side]! + (b.unpolished + 1) * UPGRADE_ENTRY,
    );
    eboot.writeUInt16LE(descFirst[b.side]!, description[b.side]! + b.unpolished * 2);
  }
  // Instances: until rolled, the Low Rank Unpolished Relic of the side's first class.
  for (const side of [0, 1]) {
    const proto = bands.find((b) => b.side === side)!;
    for (let i = 0; i < INSTANCES; i++) {
      const id = firstInstance[side]! + i;
      eboot.copy(
        eboot,
        record(side, id),
        record(side, proto.unpolished),
        record(side, proto.unpolished) + size[side]!,
      );
      eboot.fill(0, upgrade[side]! + id * UPGRADE_ENTRY, upgrade[side]! + (id + 1) * UPGRADE_ENTRY);
      eboot.writeUInt16LE(descFirst[side]! + 1, description[side]! + id * 2);
    }
  }

  // The stones' item records: Flat Ruststone's, at each rank's rarity.
  const items = resolveTableOffset("itemTable", new BinaryReader(eboot), game.resolver);
  STONE_ITEMS.forEach((item, rank) => {
    const at = items + item * ITEM_ENTRY_SIZE;
    eboot.copy(
      eboot,
      at,
      items + RUSTSTONE_ITEM * ITEM_ENTRY_SIZE,
      items + (RUSTSTONE_ITEM + 1) * ITEM_ENTRY_SIZE,
    );
    eboot[at + 2] = RARITY_BASE[rank]!;
  });

  // Names: Unpolished Relics by class and rank, instances from a word list.
  const pairs = ADJECTIVES.flatMap((a) => NOUNS.map((n) => `${a} ${n}`));
  const pick = rng.shuffle(pairs);
  const names = [[] as string[], [] as string[]];
  for (const b of bands)
    names[b.side]![b.unpolished - firstUnpolished[b.side]!] =
      `Unpolished ${SHORT[WEAPON_TYPE_NAMES[b.cls]!]}${RANK_SUFFIX[b.rank]}`;
  for (const side of [0, 1])
    for (let i = 0; i < INSTANCES; i++) names[side]!.push(pick[side * INSTANCES + i]!);
  const textReport = writeTexts(languages, edits, {
    replace: new Map([
      [1, new Map(STONE_ITEMS.map((item, r) => [item, STONES[r]!.name]))],
      [2, new Map(STONE_ITEMS.map((item, r) => [item, STONES[r]!.text]))],
    ]),
    append: new Map([
      [3, names[0]!],
      [4, [UNPOLISHED_TEXT, RELIC_TEXT]],
      [5, names[1]!],
      [6, [UNPOLISHED_TEXT, RELIC_TEXT]],
    ]),
  });
  if (typeof textReport === "string") {
    changes.done();
    changes.undo();
    return textReport;
  }
  changes.done();

  const a = tables.address;
  const createAt = (r: number) => a.create + (tables.firstCreate + r) * CREATE_ENTRY;
  const data = relicData(
    {
      stats: [a.meleeStats, a.rangedStats],
      upgrade: [a.meleeUpgrade, a.rangedUpgrade],
      create: [createAt(0), createAt(1), createAt(2)],
    },
    bands,
    donors,
    firstInstance,
    options,
  );
  return {
    externs: { rf_time_low: time },
    data: { rf_relic_data: data },
    tables,
    finish(applied) {
      if (!applied) {
        changes.undo();
        return {
          title: "Relics",
          notes: [
            "Relics need the code loader, which isn't in this image; their edits are undone.",
          ],
          lines: [],
          summary: "Relics: not applied (no code loader)",
        };
      }
      return {
        title: "Relics",
        summary: `Relics: ${options.rolls} rolls, ${options.power}; ${count[0]} melee and ${count[1]} ranged Unpolished Relics, ${INSTANCES} relics a side, stones on items ${STONE_ITEMS.join(", ")} (${Object.entries(
          tables.sites,
        )
          .map(([f, n]) => `${f} ${n}`)
          .join(", ")} table references moved)`,
        notes: [],
        lines: [],
      };
    },
  };
}

/** Where the blob finds the tables it writes (vaddrs). */
export interface RelicAddresses {
  stats: readonly [number, number];
  upgrade: readonly [number, number];
  /** Each rank's Create entry. */
  create: readonly [number, number, number];
}

/** The blob's `rf_relic_data` (`struct relic_data` in blob/relic-weapons.c, then the donor IDs). */
export function relicData(
  at: RelicAddresses,
  bands: readonly Pick<
    Band,
    "unpolished" | "bestAttack" | "bestElement" | "donorAt" | "donors" | "rank"
  >[],
  donors: readonly number[],
  firstInstance: readonly number[],
  options: RelicOptions,
): Buffer {
  const head = 48;
  const band = 12;
  const out = Buffer.alloc(head + bands.length * band + donors.length * 2);
  [...at.stats, ...at.upgrade, ...at.create].forEach((v, k) => out.writeUInt32LE(v, k * 4));
  out.writeUInt32LE(options.runSeed >>> 0, 28);
  out.writeUInt16LE(firstInstance[0]!, 32);
  out.writeUInt16LE(firstInstance[1]!, 34);
  out.writeUInt16LE(INSTANCES, 36);
  STONE_ITEMS.forEach((item, r) => out.writeUInt16LE(item, 38 + r * 2));
  out[44] = options.rolls === "clock" ? 1 : 0;
  out[45] = POWER_CAP[options.power];
  out[46] = STONE_CHANCE;
  bands.forEach((b, k) => {
    const at = head + k * band;
    out.writeUInt16LE(b.unpolished, at);
    out.writeUInt16LE(Math.min(0xffff, b.bestAttack), at + 2);
    out.writeUInt16LE(b.donorAt, at + 4);
    out[at + 6] = Math.min(255, b.bestElement);
    out[at + 7] = Math.min(255, b.donors);
    out[at + 8] = RARITY_BASE[b.rank]!;
  });
  donors.forEach((id, k) => out.writeUInt16LE(id, head + bands.length * band + k * 2));
  return out;
}

/** EU's message files, one per language (`MONSTER_NAME_FILE` is the first). */
const EU_MESSAGE_FILES = [19, 20, 21, 22, 23];

/** DATA.BIN's message files, one per language (23 tables, with the weapon name tables). */
function messageFiles(game: GameData): number[] {
  const isMessageFile = (i: number) => {
    let buf: Buffer;
    try {
      buf = game.dataBin.read(i);
    } catch {
      return false;
    }
    const t = readMessageFile(buf);
    return (
      t?.length === 23 && t[3]!.strings.length === MELEE_IDS && t[5]!.strings.length === RANGED_IDS
    );
  };
  // The known ones first; otherwise every file (a slow walk of DATA.BIN).
  if (EU_MESSAGE_FILES.every(isMessageFile)) return EU_MESSAGE_FILES;
  const found: number[] = [];
  for (let i = 0; i < game.dataBin.fileCount; i++) if (isMessageFile(i)) found.push(i);
  return found;
}

/**
 * Rewrites every language's message file with strings replaced and added,
 * at the file's own size: strings are deduplicated within each table to
 * make the room (the weapon-table probe's way).
 */
function writeTexts(
  files: number[],
  edits: Edits,
  change: { replace: Map<number, Map<number, string>>; append: Map<number, string[]> },
): string | null {
  for (const index of files) {
    const buf = edits.dataFileNow(index);
    const tables = readMessageFile(buf)!;
    const parts: Buffer[] = [];
    const header = Buffer.alloc(8 + 4 * tables.length);
    header.writeUInt32LE(tables.length, 0);
    header.writeUInt32LE(buf.readUInt32LE(4), 4);
    let at = header.length;
    let lastEnd = 0;
    tables.forEach((t, i) => {
      const strings = t.strings.map((s) => s.bytes);
      for (const s of t.strings) lastEnd = Math.max(lastEnd, s.offset + s.bytes.length + 1);
      for (const [k, text] of change.replace.get(i) ?? []) strings[k] = Buffer.from(text, "latin1");
      for (const text of change.append.get(i) ?? []) strings.push(Buffer.from(text, "latin1"));
      header.writeUInt32LE(at, 8 + 4 * i);
      const list = Buffer.alloc(4 * (strings.length + 1));
      const pool: Buffer[] = [];
      const seen = new Map<string, number>();
      let p = list.length;
      strings.forEach((s, k) => {
        const key = s.toString("latin1");
        let rel = seen.get(key);
        if (rel === undefined) {
          rel = p;
          seen.set(key, rel);
          pool.push(s, Buffer.from([0]));
          p += s.length + 1;
        }
        list.writeUInt32LE(rel, 4 * k);
      });
      list.writeUInt32LE(0xffffffff, 4 * strings.length);
      parts.push(list, ...pool);
      at += p;
    });
    const body = Buffer.concat([header, ...parts]);
    const tail = buf.subarray(lastEnd);
    if (body.length + tail.length > buf.length) return `message file ${index} has no room`;
    const out = Buffer.alloc(buf.length);
    body.copy(out);
    tail.copy(out, buf.length - tail.length);
    edits.dataFile(index).set(out);
  }
  return null;
}
