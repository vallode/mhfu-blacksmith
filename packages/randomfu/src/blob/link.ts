/**
 * Links blob code: relocatable MIPS objects (ELF32 little-endian, as
 * `clang --target=mipsel -c` writes them; see `docs/code-loader.md`) placed at a
 * fixed address, behind the header the code loader reads.
 *
 * Only what freestanding, non-PIC code compiled with `-G0` needs: allocated
 * sections laid out in order, and `R_MIPS_32`, `R_MIPS_26`, `R_MIPS_HI16`
 * and `R_MIPS_LO16` relocations with their addends in place (REL). Symbols
 * an object leaves undefined come from the other objects or from `externs`
 * (game functions and data, found per disc). This runs in the browser too,
 * so the same object links at each region's address.
 */

/** The blob header: 16 words in front of the code. */
export const BLOB_HEADER_BYTES = 0x40;
/** "RFU1". */
export const BLOB_MAGIC = 0x31554652;
/** Header words: magic, build id, size in bytes, `rf_init`, then `rf_hook0`… */
export const HEADER = { magic: 0, build: 4, size: 8, init: 12, hooks: 16 } as const;
export const MAX_HOOKS = (BLOB_HEADER_BYTES - HEADER.hooks) / 4;

const SHT_PROGBITS = 1;
const SHT_SYMTAB = 2;
const SHT_NOBITS = 8;
const SHT_REL = 9;
const SHT_RELA = 4;
const SHF_ALLOC = 0x2;
const SHN_UNDEF = 0;
const SHN_ABS = 0xfff1;
const SHN_COMMON = 0xfff2;

const R_MIPS_NONE = 0;
const R_MIPS_32 = 2;
const R_MIPS_26 = 4;
const R_MIPS_HI16 = 5;
const R_MIPS_LO16 = 6;

interface Section {
  name: string;
  type: number;
  flags: number;
  offset: number;
  size: number;
  link: number;
  info: number;
  align: number;
}

interface Sym {
  name: string;
  value: number;
  bind: number;
  shndx: number;
  size: number;
}

interface ObjectFile {
  name: string;
  data: Buffer;
  sections: Section[];
  symbols: Sym[];
  /** Where each allocated section landed, by section index. */
  placed: Map<number, number>;
}

function parse(name: string, data: Buffer): ObjectFile {
  if (data.readUInt32BE(0) !== 0x7f454c46 || data[4] !== 1 || data[5] !== 1) {
    throw new Error(`${name} isn't a 32-bit little-endian ELF`);
  }
  if (data.readUInt16LE(0x10) !== 1 || data.readUInt16LE(0x12) !== 8) {
    throw new Error(`${name} isn't a relocatable MIPS object`);
  }
  const shoff = data.readUInt32LE(0x20);
  const shentsize = data.readUInt16LE(0x2e);
  const shnum = data.readUInt16LE(0x30);
  const shstrndx = data.readUInt16LE(0x32);
  const raw = Array.from({ length: shnum }, (_, k) => {
    const at = shoff + k * shentsize;
    return {
      nameOffset: data.readUInt32LE(at),
      type: data.readUInt32LE(at + 4),
      flags: data.readUInt32LE(at + 8),
      offset: data.readUInt32LE(at + 16),
      size: data.readUInt32LE(at + 20),
      link: data.readUInt32LE(at + 24),
      info: data.readUInt32LE(at + 28),
      align: Math.max(1, data.readUInt32LE(at + 32)),
    };
  });
  const cstr = (table: number, offset: number) => {
    const start = raw[table]!.offset + offset;
    return data.toString("latin1", start, data.indexOf(0, start));
  };
  const sections = raw.map((s) => ({ ...s, name: cstr(shstrndx, s.nameOffset) }));
  const symtab = sections.find((s) => s.type === SHT_SYMTAB);
  const symbols: Sym[] = [];
  if (symtab) {
    for (let at = symtab.offset; at < symtab.offset + symtab.size; at += 16) {
      const info = data[at + 12]!;
      symbols.push({
        name: cstr(symtab.link, data.readUInt32LE(at)),
        value: data.readUInt32LE(at + 4),
        size: data.readUInt32LE(at + 8),
        bind: info >>> 4,
        shndx: data.readUInt16LE(at + 14),
      });
    }
  }
  return { name, data, sections, symbols, placed: new Map() };
}

/** Section order: code, then read-only data, then data, then zeroed data. */
function rank(section: Section): number {
  if (section.type === SHT_NOBITS) return 3;
  if (section.name.startsWith(".text")) return 0;
  if (section.name.startsWith(".rodata")) return 1;
  return 2;
}

export interface LinkedBlob {
  /** The file the loader reads: header, then the code and data. */
  image: Buffer;
  /** Global symbols' addresses. */
  symbols: Map<string, number>;
  build: number;
}

/** FNV-1a over the image with its build field zero; never 0. */
function buildId(image: Buffer): number {
  let hash = 0x811c9dc5;
  for (let k = 0; k < image.length; k++) {
    const byte = k >= HEADER.build && k < HEADER.build + 4 ? 0 : image[k]!;
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash || 1;
}

/**
 * Links `objects` to run at `base` (where the header goes). The objects must
 * define `rf_init`; `rf_hook0`… are optional entry points for game hooks.
 * `maxBytes` bounds the image (the room the loader reads into).
 */
export function linkBlob(
  objects: readonly { name: string; data: Buffer }[],
  base: number,
  externs: Readonly<Record<string, number>> = {},
  maxBytes = Infinity,
): LinkedBlob {
  const files = objects.map((o) => parse(o.name, o.data));

  // Lay out every allocated section, objects in order within each rank.
  const pieces = files.flatMap((file) =>
    file.sections
      .map((section, index) => ({ file, section, index }))
      .filter(
        ({ section }) =>
          (section.type === SHT_PROGBITS || section.type === SHT_NOBITS) &&
          section.flags & SHF_ALLOC &&
          section.size > 0,
      ),
  );
  pieces.sort((x, y) => rank(x.section) - rank(y.section));
  let cursor = base + BLOB_HEADER_BYTES;
  for (const { file, section, index } of pieces) {
    cursor = Math.ceil(cursor / section.align) * section.align;
    file.placed.set(index, cursor);
    cursor += section.size;
  }
  // Common symbols (uninitialised globals without -fno-common) go last.
  const commons = new Map<string, number>();
  for (const file of files) {
    for (const sym of file.symbols) {
      if (sym.shndx !== SHN_COMMON || commons.has(sym.name)) continue;
      const align = Math.max(1, sym.value);
      cursor = Math.ceil(cursor / align) * align;
      commons.set(sym.name, cursor);
      cursor += sym.size;
    }
  }
  const end = Math.ceil(cursor / 4) * 4;
  const image = Buffer.alloc(end - base);
  if (image.length > maxBytes) {
    throw new Error(`The blob is ${image.length} bytes, room for ${maxBytes}`);
  }

  for (const { file, section, index } of pieces) {
    if (section.type === SHT_NOBITS) continue;
    file.data.copy(
      image,
      file.placed.get(index)! - base,
      section.offset,
      section.offset + section.size,
    );
  }

  const globals = new Map<string, number>(commons);
  const valueOf = (file: ObjectFile, sym: Sym): number | null => {
    if (sym.shndx === SHN_ABS) return sym.value;
    if (sym.shndx === SHN_COMMON) return commons.get(sym.name) ?? null;
    const at = file.placed.get(sym.shndx);
    return at === undefined ? null : (at + sym.value) >>> 0;
  };
  for (const file of files) {
    for (const sym of file.symbols) {
      if (sym.bind === 0 || sym.shndx === SHN_UNDEF || !sym.name) continue;
      const value = valueOf(file, sym);
      if (value === null) continue;
      if (globals.has(sym.name) && sym.shndx !== SHN_COMMON) {
        throw new Error(`${sym.name} is defined twice`);
      }
      globals.set(sym.name, value);
    }
  }
  const resolve = (file: ObjectFile, sym: Sym): number => {
    if (sym.shndx !== SHN_UNDEF) {
      const value = valueOf(file, sym);
      if (value !== null) return value;
    }
    const value = globals.get(sym.name) ?? externs[sym.name];
    if (value === undefined) throw new Error(`${file.name}: ${sym.name} is undefined`);
    return value;
  };

  for (const file of files) {
    for (const rel of file.sections) {
      if (rel.type === SHT_RELA) throw new Error(`${file.name}: RELA relocations aren't supported`);
      if (rel.type !== SHT_REL) continue;
      const target = file.placed.get(rel.info);
      if (target === undefined) continue; // relocations for sections not loaded (debug info)
      const entries = Array.from({ length: rel.size / 8 }, (_, k) => {
        const info = file.data.readUInt32LE(rel.offset + k * 8 + 4);
        return {
          offset: file.data.readUInt32LE(rel.offset + k * 8),
          sym: info >>> 8,
          type: info & 0xff,
        };
      });
      entries.forEach((entry, k) => {
        const sym = file.symbols[entry.sym];
        if (!sym) throw new Error(`${file.name}: bad symbol index ${entry.sym}`);
        const at = target - base + entry.offset;
        const p = target + entry.offset;
        const instr = image.readUInt32LE(at);
        const s = entry.type === R_MIPS_NONE ? 0 : resolve(file, sym);
        let out: number;
        switch (entry.type) {
          case R_MIPS_NONE:
            return;
          case R_MIPS_32:
            out = (instr + s) >>> 0;
            break;
          case R_MIPS_26: {
            const value = (((instr & 0x03ffffff) << 2) + s) >>> 0;
            if ((value & 0xf0000000) !== ((p + 4) & 0xf0000000)) {
              throw new Error(`${file.name}: jump to ${sym.name} leaves the 256 MB segment`);
            }
            out = ((instr & 0xfc000000) | ((value >>> 2) & 0x03ffffff)) >>> 0;
            break;
          }
          case R_MIPS_HI16: {
            // The addend's low half is in the next LO16 against the same symbol.
            const lo = entries
              .slice(k + 1)
              .find((e) => e.type === R_MIPS_LO16 && e.sym === entry.sym);
            if (!lo) throw new Error(`${file.name}: HI16 against ${sym.name} without a LO16`);
            const loInstr = image.readUInt32LE(target - base + lo.offset);
            const addend = ((instr & 0xffff) << 16) + ((loInstr << 16) >> 16);
            const value = (s + addend) >>> 0;
            out = ((instr & 0xffff0000) | (((value + 0x8000) >>> 16) & 0xffff)) >>> 0;
            break;
          }
          case R_MIPS_LO16: {
            const value = (s + ((instr << 16) >> 16)) >>> 0;
            out = ((instr & 0xffff0000) | (value & 0xffff)) >>> 0;
            break;
          }
          default:
            throw new Error(`${file.name}: relocation type ${entry.type} isn't supported`);
        }
        image.writeUInt32LE(out, at);
      });
    }
  }

  const init = globals.get("rf_init");
  if (init === undefined) throw new Error("The blob doesn't define rf_init");
  image.writeUInt32LE(BLOB_MAGIC, HEADER.magic);
  image.writeUInt32LE(image.length, HEADER.size);
  image.writeUInt32LE(init, HEADER.init);
  for (let k = 0; k < MAX_HOOKS; k++) {
    image.writeUInt32LE(globals.get(`rf_hook${k}`) ?? 0, HEADER.hooks + k * 4);
  }
  const build = buildId(image);
  image.writeUInt32LE(build, HEADER.build);
  return { image, symbols: globals, build };
}
