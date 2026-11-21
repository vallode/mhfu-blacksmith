import assert from "node:assert/strict";
import { test } from "node:test";
import { knownCounts } from "../src/cli/message-probe.js";
import { probeMessageFiles } from "../src/strings/message-probe.js";

/** A message file (strings/messages.ts) with tables of made-up strings of these sizes. */
function messageFile(sizes: number[]): Buffer {
  const header = Buffer.alloc(8 + sizes.length * 4);
  header.writeUInt32LE(sizes.length, 0);
  header.writeUInt32LE(8, 4);
  const tables: Buffer[] = [];
  let at = header.length;
  sizes.forEach((n, t) => {
    header.writeUInt32LE(at, 8 + t * 4);
    const offsets = Buffer.alloc((n + 1) * 4);
    const strings: Buffer[] = [];
    let rel = offsets.length;
    for (let i = 0; i < n; i++) {
      const s = Buffer.from(`s${t}-${i}\0`, "latin1");
      offsets.writeUInt32LE(rel, i * 4);
      strings.push(s);
      rel += s.length;
    }
    offsets.writeUInt32LE(0xffffffff, n * 4);
    const table = Buffer.concat([offsets, ...strings]);
    tables.push(table);
    at += table.length;
  });
  return Buffer.concat([header, ...tables]);
}

/** A `.pac` (models/pac.ts) holding these entries. */
function pac(entries: Buffer[]): Buffer {
  const head = Buffer.alloc(4 + entries.length * 8);
  head.writeUInt32LE(entries.length, 0);
  let at = head.length;
  entries.forEach((e, i) => {
    head.writeUInt32LE(at, 4 + i * 8);
    head.writeUInt32LE(e.length, 8 + i * 8);
    at += e.length;
  });
  return Buffer.concat([head, ...entries]);
}

test("probeMessageFiles lines message tables up with MHF2's equipment counts", () => {
  const known = knownCounts("mhp2");
  const results = probeMessageFiles(
    [
      { name: "data-bin/_unindexed/19.bin", buf: messageFile([5, 601, 172]) },
      {
        name: "data-bin/_unindexed/40.bin",
        buf: pac([Buffer.alloc(32, 1), messageFile([327, 960])]),
      },
      { name: "data-bin/_unindexed/41.bin", buf: Buffer.alloc(64, 0xab) },
    ],
    known,
  );
  assert.deepEqual(
    results.map((f) => [f.file, f.tables.map((t) => [t.strings, t.matches])]),
    [
      [
        "data-bin/_unindexed/19.bin",
        [
          [5, []],
          [601, ["blademaster"]],
          [172, ["gunner+1"]],
        ],
      ],
      [
        "data-bin/_unindexed/40.bin#1",
        [
          [327, ["head"]],
          [960, ["items"]],
        ],
      ],
    ],
  );
});

test("probeMessageFiles skips files that only parse as empty tables", () => {
  const empty = Buffer.alloc(16);
  empty.writeUInt32LE(1, 0);
  empty.writeUInt32LE(12, 8);
  empty.writeUInt32LE(0xffffffff, 12);
  assert.deepEqual(probeMessageFiles([{ name: "x", buf: empty }], []), []);
});
