/**
 * `MWo3`-format overlay container (`game_task.ovl`, `game_sub.ovl`, and the
 * per-monster `emXX.ovl` files) — the format `.ovl` files are wrapped in
 * once pulled out of `DATA.BIN` and decrypted with `decryptDataBinBlock`.
 *
 * Layout (all fields little-endian), reverse-engineered from real JP disc
 * bytes and cross-checked against the vendored `game_task.hexpat` /
 * `game_sub.hexpat` `#pragma base_address` values (which match `loadBase`
 * exactly for both files):
 *
 *   offset 0x00  magic[4]      "MWo3"
 *   offset 0x04  u32 unk1
 *   offset 0x08  u32 loadBase  — the vaddr of file offset 0: the header is
 *                                loaded with the image, as the hexpats'
 *                                #pragma base_address (ImHex's address of
 *                                file byte 0) says.
 *   offset 0x0C  u32 unk2
 *   offset 0x10  u32 unk3
 *   offset 0x14  u32 unk4
 *   offset 0x18  u32 unk5
 *   offset 0x1C  u32 loadEnd   — highest vaddr this overlay's data spans
 *                                (not exactly fileLength - HEADER_SIZE +
 *                                loadBase; there's a little slack/padding).
 *   offset 0x20  char name[0x60], NUL-padded, e.g. "game_task.ovl" (also
 *                serves as this format's #pragma magic anchor).
 *   offset 0x80  data[] — vaddr `loadBase + 0x80`.
 *
 * An earlier version mapped `loadBase` to file offset 0x80, which put every
 * pointer 0x80 bytes past its target. That is why the first monster
 * investigation found no pointer to the hitzone and carve rows it located
 * (vallode/mhfu-blacksmith#35): with this mapping, the EU disc's carve and
 * cap/break pointers lead to their own monster's committed lists, and the
 * hitzone pointers to `HitzoneTbl` lists, as the hexpats describe.
 */
import { BinaryReader, vaddrToOffset } from "../binary/reader.js";

const MAGIC = Buffer.from("MWo3", "latin1");
const HEADER_FIELDS_SIZE = 0x20;
const NAME_FIELD_SIZE = 0x60;

/** Size of the fixed MWo3 header (7 u32 fields + the NUL-padded name field) preceding the mapped data image. */
export const OVL_HEADER_SIZE = HEADER_FIELDS_SIZE + NAME_FIELD_SIZE;

export class OvlFormatError extends Error {}

export class OvlFile {
  readonly reader: BinaryReader;
  readonly loadBase: number;
  readonly loadEnd: number;
  readonly name: string;

  constructor(buf: Buffer) {
    const reader = new BinaryReader(buf);
    const magic = reader.magic(0, 4);
    if (!magic.equals(MAGIC)) {
      throw new OvlFormatError(
        `Not an MWo3 overlay (expected magic "MWo3", got ${magic.toString("hex")})`,
      );
    }
    this.reader = reader;
    this.loadBase = reader.u32(0x08);
    this.loadEnd = reader.u32(0x1c);
    this.name = reader.fixedString(HEADER_FIELDS_SIZE, NAME_FIELD_SIZE);
  }

  /** Resolves a vaddr (as stored in this overlay's pointer/`@`-addressed fields) to a byte offset in `this.reader`. */
  vaddrToOffset(vaddr: number): number {
    return vaddrToOffset(vaddr, this.loadBase);
  }

  /** True if `vaddr` falls within this overlay's data image (past the header; not e.g. a sibling per-monster emXX.ovl). */
  isOwnVaddr(vaddr: number): boolean {
    const offset = this.vaddrToOffset(vaddr);
    return offset >= OVL_HEADER_SIZE && offset < this.reader.length;
  }
}

/** Parses the MWo3 container wrapper around a decrypted `.ovl` file's bytes. */
export function parseOvl(buf: Buffer): OvlFile {
  return new OvlFile(buf);
}
