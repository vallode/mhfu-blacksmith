/**
 * Message files: the game's string tables. On the EU disc they come in
 * groups of five, one per language in the order English, French, German,
 * Italian, Spanish (read from the training text at the start of 4786-4790):
 * DATA.BIN 19-23 (23 tables), 4776-4780 (2), 4781-4785 (4) and 4786-4790 (1).
 * JP's `message_jpn/str_tbl.pac`, `quest_str.pac` and the like have the same
 * header.
 *
 * Layout, from the EU files (`mhfu-extract quest-text-scan`):
 *
 *   u32 count
 *   u32 unknown            (8 in every file seen)
 *   u32 table[count]       file offset of each table
 *   table: u32 offset[]    each string's offset from the table's start,
 *                          ending in 0xFFFFFFFF; then the strings, UTF-8,
 *                          NUL-terminated
 *
 * The header is 8 + 4 * count bytes, so table 0 starts right after it.
 */
export interface MessageTable {
  /** File offset of the table (its offset list). */
  offset: number;
  /** Each string's file offset and bytes (without the NUL). */
  strings: { offset: number; bytes: Buffer }[];
}

/** No message file seen has more; stops reading files that aren't one. */
const MAX_TABLES = 64;
const END = 0xffffffff;

/** The file's tables, or null if it isn't laid out like a message file. */
export function readMessageFile(buf: Buffer): MessageTable[] | null {
  if (buf.length < 12) return null;
  const count = buf.readUInt32LE(0);
  if (count === 0 || count > MAX_TABLES || 8 + count * 4 > buf.length) return null;
  const tables: MessageTable[] = [];
  for (let t = 0; t < count; t++) {
    const offset = buf.readUInt32LE(8 + t * 4);
    if (offset < 8 + count * 4 || offset + 4 > buf.length) return null;
    const strings: MessageTable["strings"] = [];
    for (let at = offset; ; at += 4) {
      if (at + 4 > buf.length) return null;
      const rel = buf.readUInt32LE(at);
      if (rel === END) break;
      const start = offset + rel;
      if (start >= buf.length) return null;
      let end = start;
      while (end < buf.length && buf[end] !== 0) end++;
      strings.push({ offset: start, bytes: buf.subarray(start, end) });
    }
    tables.push({ offset, strings });
  }
  return tables;
}

/**
 * A message file with these tables of strings (bytes, without the NUL), laid
 * out as the EU str_tbl is: the header, then each table's offset list and its
 * strings in order, each string once, with one more NUL after each table's
 * last string. Rebuilding an unedited str_tbl this way gives back its bytes
 * up to the end of the last table; the disc's file goes on to the end of its
 * last sector with bytes nothing points at.
 */
export function buildMessageFile(tables: readonly (readonly Buffer[])[], unknown = 8): Buffer {
  const header = Buffer.alloc(8 + tables.length * 4);
  header.writeUInt32LE(tables.length, 0);
  header.writeUInt32LE(unknown, 4);
  const parts: Buffer[] = [header];
  let at = header.length;
  tables.forEach((strings, t) => {
    header.writeUInt32LE(at, 8 + t * 4);
    const list = Buffer.alloc(strings.length * 4 + 4);
    let rel = list.length;
    const bodies: Buffer[] = [];
    strings.forEach((s, i) => {
      list.writeUInt32LE(rel, i * 4);
      bodies.push(s, Buffer.alloc(1));
      rel += s.length + 1;
    });
    list.writeUInt32LE(END, strings.length * 4);
    parts.push(list, ...bodies, Buffer.alloc(1));
    at += rel + 1;
  });
  return Buffer.concat(parts);
}

/**
 * A string as text, with anything that isn't printable UTF-8 shown as
 * `\xNN` (control codes, such as a placeholder for a name, show up this
 * way) and new lines as `\n`.
 */
export function showMessage(bytes: Buffer): string {
  let out = "";
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]!;
    const width = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    if (b === 0x0a) {
      out += "\\n";
      i++;
    } else if (b >= 0x20 && b < 0x7f) {
      out += String.fromCharCode(b);
      i++;
    } else if (width > 1 && i + width <= bytes.length) {
      const ch = bytes.subarray(i, i + width).toString("utf8");
      if (ch.includes("�")) {
        out += `\\x${b.toString(16).padStart(2, "0")}`;
        i++;
      } else {
        out += ch;
        i += width;
      }
    } else {
      out += `\\x${b.toString(16).padStart(2, "0")}`;
      i++;
    }
  }
  return out;
}

/** Where a string with `word` in it is: table, index and the string itself. */
export function findMessages(
  tables: readonly MessageTable[],
  word: string,
  limit = 20,
): { table: number; index: number; text: string }[] {
  const needle = Buffer.from(word, "utf8");
  const out: { table: number; index: number; text: string }[] = [];
  tables.forEach((t, ti) =>
    t.strings.forEach((s, si) => {
      if (out.length < limit && s.bytes.includes(needle)) {
        out.push({ table: ti, index: si, text: showMessage(s.bytes) });
      }
    }),
  );
  return out;
}
