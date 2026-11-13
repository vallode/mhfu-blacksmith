/**
 * Share codes for armor sets, the `<code>` in a share link: `/s/<code>/<slug>/`
 * (set-link.ts), or the older `/set-builder/?s=<code>`.
 *
 * A code holds the game's own IDs, never positions in the search data
 * (Piece.id / Deco.id change whenever the data is regenerated):
 * - armor: the equipment ID, i.e. the index into its slot's table in
 *   equipment-ids.json (the same IDs a save file's equipment box uses);
 * - decorations: the item ID from data/items.json.
 *
 * Format (all integers are unsigned LEB128 varints):
 *
 *   code  = base64url(version fields*), no padding
 *   version = 1 byte, CODEC_VERSION
 *   field = key payload
 *   key   = varint (tag << 1 | wire)
 *     wire 0: payload is one varint
 *     wire 1: payload is varint length, then that many bytes
 *
 * Tags (FIELD):
 *   1 armor        wire 1: 5 varints, equipment IDs in ARMOR_SLOTS order, 0 = empty
 *   2 weaponSlots  wire 0
 *   3 decorations  wire 1: varints, each itemId << 3 | bin
 *                  (bin 0 = weapon, 1–5 = ARMOR_SLOTS order; 6–7 reserved)
 *   4 weapon       reserved: wire 1, table (0 melee, 1 ranged) then equipment ID
 *   5 hunterType   wire 0: 0 Blademaster, 1 Gunner
 *   6 sex          wire 0: 0 Male, 1 Female
 *   7 query        reserved: the search's skills and options
 *   8 name         wire 1: the set's name, UTF-8, at most MAX_NAME characters
 *                  (share links of saved sets; saved codes leave it out)
 *
 * Fields at their default (no armor, 0 weapon slots, Blademaster, Male, no
 * name) are left out. A decoder skips tags it doesn't know (the wire type says how), so builds
 * that predate a field still open codes that carry it. A field that appears
 * twice keeps its last value. Equipment ID 0 is unused in every table, which
 * is why it can mean "empty".
 *
 * Decoding never throws: it returns a set, or a typed error.
 */
import { ARMOR_SLOTS, type ArmorSlot } from "./constants";
import { resolveEquip } from "./equipment-ref";
import { EQUIP_TYPE_SLOTS, type EquipmentIds } from "./schema";
import { emptyBuild, type BuildSet } from "./set-build";
import type { DecoBin, Deco, Piece, PlacedDeco, SearchData } from "./set-search";

export const CODEC_VERSION = 1;

/** The older share links' query parameter: /set-builder/?s=<code>. The
 * Worker's card and oEmbed URLs still use it. */
export const SHARE_PARAM = "s";

export const FIELD = {
  armor: 1,
  weaponSlots: 2,
  decorations: 3,
  weapon: 4,
  hunterType: 5,
  sex: 6,
  query: 7,
  name: 8,
} as const;

/** The longest set name a code carries (My sets' rename field allows as many). */
export const MAX_NAME = 40;

/**
 * A name as a code carries it: one line, trimmed, at most MAX_NAME characters;
 * "" for none. Control characters, line breaks and bidirectional overrides
 * become spaces; other format characters stay, so emoji joined with U+200D
 * keep their joiners.
 */
export function cleanName(name: string | undefined): string {
  return [...(name ?? "").replace(/[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]+/gu, " ").trim()]
    .slice(0, MAX_NAME)
    .join("")
    .trim();
}

const WIRE_VARINT = 0;
const WIRE_BYTES = 1;

/** Bins in code order: 0 is the weapon, then ARMOR_SLOTS. */
const BINS: DecoBin[] = ["weapon", ...ARMOR_SLOTS];
const HUNTER_TYPES: BuildSet["hunterType"][] = ["Blademaster", "Gunner"];
const SEXES: BuildSet["sex"][] = ["Male", "Female"];

/** Largest varint read: 4 bytes, 28 bits. Equipment and item IDs are far smaller. */
const MAX_VARINT_BYTES = 4;

// ---------------------------------------------------------------------------
// Bytes <-> fields
// ---------------------------------------------------------------------------

/** A set as plain game IDs, before they're looked up. */
export interface RawSet {
  /** Equipment ID per slot, ARMOR_SLOTS order; 0 = empty. */
  armor: number[];
  weaponSlots: number;
  decorations: { itemId: number; bin: number }[];
  /** Index into HUNTER_TYPES; absent in codes that don't say. */
  hunterType?: number;
  /** Index into SEXES. */
  sex?: number;
  /** The set's name, if the code has one. */
  name?: string;
}

export type DecodeError =
  | { kind: "version"; version: number }
  | { kind: "malformed"; reason: string }
  | { kind: "unknown-ids"; dropped: DroppedRef[] };

export type DroppedRef =
  | { kind: "piece"; slot: ArmorSlot; gameId: number }
  | { kind: "decoration"; itemId: number; bin: DecoBin | null };

class Malformed extends Error {}

function writeVarint(out: number[], n: number) {
  if (!Number.isInteger(n) || n < 0 || n >= 2 ** (7 * MAX_VARINT_BYTES)) {
    throw new RangeError(`Can't encode ${n}`);
  }
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

class Reader {
  pos = 0;
  constructor(
    private source: Uint8Array,
    readonly end = source.length,
  ) {}
  get done() {
    return this.pos >= this.end;
  }
  varint(): number {
    let n = 0;
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      if (this.pos >= this.end) throw new Malformed("ends in the middle of a number");
      const b = this.source[this.pos++];
      n += (b & 0x7f) * 2 ** (7 * i);
      if ((b & 0x80) === 0) return n;
    }
    throw new Malformed("number too large");
  }
  bytes(): Uint8Array {
    const r = this.sub();
    return this.source.subarray(r.pos, r.end);
  }
  sub(): Reader {
    const len = this.varint();
    if (this.pos + len > this.end) throw new Malformed("field runs past the end");
    const r = new Reader(this.source, this.pos + len);
    r.pos = this.pos;
    this.pos += len;
    return r;
  }
  varints(): number[] {
    const r = this.sub();
    const out: number[] = [];
    while (!r.done) out.push(r.varint());
    return out;
  }
}

export function encodeRaw(raw: RawSet): Uint8Array {
  const out: number[] = [CODEC_VERSION];
  const key = (tag: number, wire: number) => writeVarint(out, (tag << 1) | wire);
  const packed = (tag: number, values: number[]) => {
    const body: number[] = [];
    for (const v of values) writeVarint(body, v);
    key(tag, WIRE_BYTES);
    writeVarint(out, body.length);
    out.push(...body);
  };
  if (raw.armor.some((id) => id > 0)) packed(FIELD.armor, raw.armor);
  if (raw.weaponSlots > 0) {
    key(FIELD.weaponSlots, WIRE_VARINT);
    writeVarint(out, raw.weaponSlots);
  }
  if (raw.decorations.length > 0) {
    packed(
      FIELD.decorations,
      raw.decorations.map((d) => d.itemId * 8 + d.bin),
    );
  }
  if (raw.hunterType) {
    key(FIELD.hunterType, WIRE_VARINT);
    writeVarint(out, raw.hunterType);
  }
  if (raw.sex) {
    key(FIELD.sex, WIRE_VARINT);
    writeVarint(out, raw.sex);
  }
  const name = cleanName(raw.name);
  if (name) {
    const bytes = new TextEncoder().encode(name);
    key(FIELD.name, WIRE_BYTES);
    writeVarint(out, bytes.length);
    out.push(...bytes);
  }
  return Uint8Array.from(out);
}

export function decodeRaw(
  bytes: Uint8Array,
): { ok: true; raw: RawSet } | { ok: false; error: DecodeError } {
  if (bytes.length === 0) return { ok: false, error: { kind: "malformed", reason: "empty" } };
  if (bytes[0] !== CODEC_VERSION)
    return { ok: false, error: { kind: "version", version: bytes[0] } };
  const raw: RawSet = { armor: ARMOR_SLOTS.map(() => 0), weaponSlots: 0, decorations: [] };
  try {
    const r = new Reader(bytes);
    r.pos = 1;
    while (!r.done) {
      const k = r.varint();
      const tag = Math.floor(k / 2);
      const wire = k % 2;
      const expect = (w: number) => {
        if (wire !== w) throw new Malformed(`field ${tag} has the wrong type`);
      };
      switch (tag) {
        case FIELD.armor: {
          expect(WIRE_BYTES);
          const ids = r.varints();
          if (ids.length !== ARMOR_SLOTS.length) throw new Malformed("armor needs 5 entries");
          raw.armor = ids;
          break;
        }
        case FIELD.weaponSlots:
          expect(WIRE_VARINT);
          raw.weaponSlots = r.varint();
          break;
        case FIELD.decorations:
          expect(WIRE_BYTES);
          raw.decorations = r.varints().map((v) => ({ itemId: Math.floor(v / 8), bin: v % 8 }));
          break;
        case FIELD.hunterType:
          expect(WIRE_VARINT);
          raw.hunterType = r.varint();
          break;
        case FIELD.sex:
          expect(WIRE_VARINT);
          raw.sex = r.varint();
          break;
        case FIELD.name: {
          expect(WIRE_BYTES);
          // Bad UTF-8 becomes U+FFFD rather than failing the set.
          const name = cleanName(new TextDecoder().decode(r.bytes()));
          raw.name = name || undefined;
          break;
        }
        default:
          // Unknown (or reserved) tag: skip it.
          if (wire === WIRE_VARINT) r.varint();
          else r.sub();
      }
    }
  } catch (e) {
    if (e instanceof Malformed)
      return { ok: false, error: { kind: "malformed", reason: e.message } };
    throw e;
  }
  return { ok: true, raw };
}

// ---------------------------------------------------------------------------
// base64url, no padding
// ---------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) s += ALPHABET[(n >> (18 - 6 * j)) & 63];
  }
  return s;
}

/** null for characters outside base64url, or a length no byte string has. */
export function fromBase64Url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const v = j < chunk.length ? LOOKUP.get(chunk[j]) : 0;
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    const bytes = chunk.length - 1;
    for (let j = 0; j < bytes; j++) out.push((n >> (16 - 8 * j)) & 0xff);
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Game IDs <-> search data
// ---------------------------------------------------------------------------

export interface CodecTables {
  /** Piece.id -> equipment ID. */
  pieceGameId: Map<number, number>;
  /** "<slot>:<equipment ID>" -> piece. */
  pieceByGameId: Map<string, Piece>;
  /** Item ID -> decoration. */
  decoByItemId: Map<number, Deco>;
}

/**
 * The lookups between search data and game IDs. Armor is matched by page
 * (slot, rank and slug, as resolveEquip gives it): pieces sold as separate
 * Male and Female pieces under one name have the sex in their slug.
 * `problems` lists pieces with no ID, or with more than one.
 */
export function buildCodecTables(
  data: SearchData,
  ids: EquipmentIds,
): CodecTables & { problems: string[] } {
  const byHref = new Map<string, { id: number; sex?: string }[]>();
  for (const slot of ARMOR_SLOTS) {
    const type = EQUIP_TYPE_SLOTS.indexOf(slot);
    (ids[type] ?? []).forEach((_, id) => {
      const ref = resolveEquip(ids, { type, id });
      if (!ref) return;
      const list = byHref.get(ref.href) ?? [];
      list.push({ id, sex: ref.sex });
      byHref.set(ref.href, list);
    });
  }
  const pieceGameId = new Map<number, number>();
  const pieceByGameId = new Map<string, Piece>();
  const problems: string[] = [];
  for (const p of data.pieces) {
    const matches = (byHref.get(p.href) ?? []).filter((m) => !m.sex || m.sex === p.sex);
    if (matches.length !== 1) {
      problems.push(`${p.href}: ${matches.length} equipment IDs`);
      if (matches.length === 0) continue;
    }
    const id = Math.min(...matches.map((m) => m.id));
    pieceGameId.set(p.id, id);
    pieceByGameId.set(`${p.slot}:${id}`, p);
  }
  const decoByItemId = new Map<number, Deco>();
  for (const d of data.decorations) {
    if (d.itemId === undefined) problems.push(`${d.href}: no item ID`);
    else decoByItemId.set(d.itemId, d);
  }
  return { pieceGameId, pieceByGameId, decoByItemId, problems };
}

/** Pieces or decorations without a game ID are left out. */
export function toRaw(set: BuildSet, tables: CodecTables, name?: string): RawSet {
  return {
    name,
    armor: set.pieces.map((p) => (p ? (tables.pieceGameId.get(p.id) ?? 0) : 0)),
    weaponSlots: set.weaponSlots,
    decorations: set.decorations.flatMap((d) =>
      d.deco.itemId === undefined ? [] : [{ itemId: d.deco.itemId, bin: BINS.indexOf(d.bin) }],
    ),
    hunterType: Math.max(0, HUNTER_TYPES.indexOf(set.hunterType)),
    sex: Math.max(0, SEXES.indexOf(set.sex)),
  };
}

/** A set's share code; `name` is for share links of saved sets. */
export function encodeSet(set: BuildSet, tables: CodecTables, name?: string): string {
  return toBase64Url(encodeRaw(toRaw(set, tables, name)));
}

export type DecodeResult =
  | {
      ok: true;
      set: BuildSet;
      dropped: DroppedRef[];
      name?: string;
      /**
       * The same code without its name (or fields this build doesn't know):
       * one code per set, whatever it was shared as.
       */
      canonical: string;
    }
  | { ok: false; error: DecodeError };

/**
 * Look up a raw set's IDs. IDs that aren't known are dropped and listed;
 * if nothing at all resolves, that's an "unknown-ids" error.
 */
export function fromRaw(raw: RawSet, tables: CodecTables): DecodeResult {
  if (raw.hunterType !== undefined && !HUNTER_TYPES[raw.hunterType]) {
    return { ok: false, error: { kind: "malformed", reason: "unknown hunter type" } };
  }
  if (raw.sex !== undefined && !SEXES[raw.sex]) {
    return { ok: false, error: { kind: "malformed", reason: "unknown sex" } };
  }
  const set = emptyBuild(HUNTER_TYPES[raw.hunterType ?? 0], SEXES[raw.sex ?? 0]);
  set.weaponSlots = raw.weaponSlots;
  const dropped: DroppedRef[] = [];
  let refs = 0;
  ARMOR_SLOTS.forEach((slot, i) => {
    const gameId = raw.armor[i];
    if (!gameId) return;
    refs++;
    const piece = tables.pieceByGameId.get(`${slot}:${gameId}`);
    if (piece) set.pieces[i] = piece;
    else dropped.push({ kind: "piece", slot, gameId });
  });
  const decorations: PlacedDeco[] = [];
  for (const { itemId, bin } of raw.decorations) {
    refs++;
    const deco = tables.decoByItemId.get(itemId);
    const b = BINS[bin] ?? null;
    if (deco && b) decorations.push({ deco, bin: b });
    else dropped.push({ kind: "decoration", itemId, bin: b });
  }
  set.decorations = decorations;
  if (refs > 0 && dropped.length === refs) {
    return { ok: false, error: { kind: "unknown-ids", dropped } };
  }
  const canonical = toBase64Url(encodeRaw({ ...raw, name: undefined }));
  return { ok: true, set, dropped, canonical, ...(raw.name ? { name: raw.name } : {}) };
}

/** A share code to a set. Never throws. */
export function decodeSet(code: string, tables: CodecTables): DecodeResult {
  const bytes = fromBase64Url(code.trim());
  if (!bytes) return { ok: false, error: { kind: "malformed", reason: "not base64url" } };
  const raw = decodeRaw(bytes);
  return raw.ok ? fromRaw(raw.raw, tables) : raw;
}

/** For the page: what went wrong opening a code, in words. */
export function describeDecodeError(error: DecodeError): string {
  switch (error.kind) {
    case "version":
      return `This link is from a newer or unknown version of the set builder (format ${error.version}).`;
    case "malformed":
      return "This link's set code is damaged or incomplete.";
    case "unknown-ids":
      return "None of the armor or decorations in this link exist in this version of the site.";
  }
}

export function describeDropped(d: DroppedRef): string {
  return d.kind === "piece"
    ? `an unknown ${d.slot} piece (ID ${d.gameId})`
    : `an unknown decoration (item ${d.itemId})${d.bin ? "" : " in an unknown slot"}`;
}
