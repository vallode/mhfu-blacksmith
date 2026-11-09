/**
 * Load addresses from a decrypted EBOOT's ELF program headers, as
 * candidate "vaddr of file offset 0" values (`base`, as in
 * `fileOffset = vaddr - base`) for code that follows pointers through an
 * EBOOT whose table addresses aren't pinned (strings/name-search.ts).
 *
 * The pinned JP base, `JP_BASE_ADDRESS` (tables/offsets.ts), comes from
 * eboot.hexpat's `#pragma base_address`; EU calibrates its base from the
 * sharpness/bowgun tables (`sharpnessVaddrBase`). This is a third,
 * format-level guess: each `PT_LOAD` segment gives `p_vaddr - p_offset`. A
 * relocatable PSP module (`e_type` 0xffa0, `p_vaddr` 0) is loaded at the
 * user-memory start 0x08804000 when it is the only module, which is
 * assumed here. The name search votes on the base from the data itself, so
 * these are only cross-checks.
 */

const ELF_MAGIC = 0x464c457f; // "\x7fELF" read as a little-endian u32
const PT_LOAD = 1;
const ET_PSP_PRX = 0xffa0;
/** Where the PSP loads a relocatable user module with nothing else loaded. */
export const PSP_USER_LOAD_ADDRESS = 0x08804000;

export interface ElfSegment {
  offset: number;
  vaddr: number;
  fileSize: number;
  /** `vaddr - offset`, relocated to `PSP_USER_LOAD_ADDRESS` for a relocatable module. */
  base: number;
}

/** The `PT_LOAD` segments of a 32-bit little-endian ELF, or [] if `buf` isn't one. */
export function elfLoadSegments(buf: Buffer): ElfSegment[] {
  if (buf.length < 0x34 || buf.readUInt32LE(0) !== ELF_MAGIC) return [];
  const type = buf.readUInt16LE(0x10);
  const phoff = buf.readUInt32LE(0x1c);
  const phentsize = buf.readUInt16LE(0x2a);
  const phnum = buf.readUInt16LE(0x2c);
  const out: ElfSegment[] = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (at + 0x20 > buf.length) break;
    if (buf.readUInt32LE(at) !== PT_LOAD) continue;
    const offset = buf.readUInt32LE(at + 4);
    const vaddr = buf.readUInt32LE(at + 8);
    const fileSize = buf.readUInt32LE(at + 0x10);
    const relocatable = type === ET_PSP_PRX || vaddr < PSP_USER_LOAD_ADDRESS;
    out.push({
      offset,
      vaddr,
      fileSize,
      base: (relocatable ? vaddr + PSP_USER_LOAD_ADDRESS : vaddr) - offset,
    });
  }
  return out;
}
