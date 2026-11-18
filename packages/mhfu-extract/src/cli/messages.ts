/**
 * `messages` subcommand: reads one message file from an `unpack`ed disc
 * (see strings/messages.ts) and prints its tables, the strings with a word
 * in them, or a run of strings. Strings are shown with control bytes as
 * `\xNN`. This prints the game's text, for the person running it: don't
 * commit the output.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadFileList } from "../container/filelist.js";
import { findMessages, readMessageFile, showMessage } from "../strings/messages.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface MessagesOptions {
  unpacked: string;
  /** DATA.BIN index. */
  file: number;
  grep?: string;
  table?: number;
  from?: number;
  count?: number;
}

export async function runMessages(options: MessagesOptions): Promise<string> {
  const manifest: UnpackManifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  );
  assertCurrentFileNames(manifest, options.unpacked);
  const rel =
    loadFileList(manifest.region).get(options.file) ??
    path.join("_unindexed", `${options.file}.bin`);
  const tables = readMessageFile(await readFile(path.join(options.unpacked, "data-bin", rel)));
  if (!tables) throw new Error(`${options.file} (${rel}) isn't laid out like a message file`);

  const out = [
    `${options.file} ${rel}: ${tables.length} tables`,
    ...tables.map(
      (t, i) =>
        `  table ${i} @0x${t.offset.toString(16)}: ${t.strings.length} strings, ${t.strings.reduce((n, s) => n + s.bytes.length + 1, 0)} bytes`,
    ),
  ];
  if (options.grep) {
    out.push("", `Strings with "${options.grep}":`);
    for (const m of findMessages(tables, options.grep)) {
      out.push(`  [${m.table}:${m.index}] ${m.text}`);
    }
  }
  if (options.table !== undefined) {
    const table = tables[options.table];
    if (!table) throw new Error(`No table ${options.table}`);
    const from = options.from ?? 0;
    out.push("", `Table ${options.table}, strings ${from}-${from + (options.count ?? 20) - 1}:`);
    table.strings.slice(from, from + (options.count ?? 20)).forEach((s, i) => {
      out.push(`  [${options.table}:${from + i}] ${showMessage(s.bytes)}`);
    });
  }
  return out.join("\n") + "\n";
}
