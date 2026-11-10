/**
 * `quest-probe`: a numbers-only summary of `extract --raw`'s
 * `raw/quests.json`, for the questions a disc has to settle (README
 * "Monster size", "Quest text", "Quest script"):
 *
 * - size: the values `MonSizeModifier`, `Unkn4`/`Unkn5`/`Unkn7`, `statTable`
 *   and each byte or word of the large monster records take, and a
 *   per-quest TSV of them;
 * - objectives: the header's two objective slots (0x28, 0x30): their kinds,
 *   and whether a monster objective's id is the quest's `TargetID` or one
 *   of its large monsters;
 * - script: each opcode's use, and how often an argument equals the
 *   quest's `TargetID` or one of its large monsters;
 * - text: how the language slots share blocks, whether strings are packed
 *   back to back, and the sector padding after each quest.
 */
import type { QuestRawEntry } from "./quests-raw.js";

const hex = (n: number, width = 8) => `0x${n.toString(16).padStart(width, "0")}`;

function top<T>(values: readonly T[], label: (v: T) => string, limit = 12): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(label(v), (counts.get(label(v)) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const shown = ranked.slice(0, limit).map(([k, n]) => `${k} ×${n}`);
  if (ranked.length > limit) shown.push(`… (${ranked.length} distinct)`);
  return shown.join(", ");
}

const questId = (e: QuestRawEntry) => e.header.questId;
const byte = (words: number[], offset: number) =>
  (words[offset >> 2]! >>> ((offset & 3) * 8)) & 0xff;

/** Record bytes worth tabulating: Quantity, Power, Attr1, Attr2. */
const RECORD_BYTES: [string, number][] = [
  ["quantity +4", 4],
  ["power +5", 5],
  ["attr1 +6", 6],
  ["attr2 +7", 7],
];
/** Record words: the `DynamicData` words and rotation. */
const RECORD_WORDS: [string, number][] = [
  ["dyn1[0] +0x0c", 3],
  ["dyn1[1] +0x10", 4],
  ["dyn1[2] +0x14", 5],
  ["dyn1[3] +0x18", 6],
  ["rotation +0x1c", 7],
  ["dyn2[0] +0x2c", 11],
  ["dyn2[1] +0x30", 12],
  ["dyn2[2] +0x34", 13],
  ["dyn2[3] +0x38", 14],
];

export function sizeTsv(entries: readonly QuestRawEntry[]): string {
  const rows = [
    [
      "path",
      "questId",
      "rank",
      "stars",
      "map",
      "MonSizeModifier",
      "unkn4,5,7",
      "statTable",
      "monster",
      ...RECORD_BYTES.map(([n]) => n),
      ...RECORD_WORDS.map(([n]) => n),
    ].join("\t"),
  ];
  for (const e of entries) {
    for (const r of e.largeMonsterRecords) {
      rows.push(
        [
          e.path,
          questId(e),
          e.header.rank,
          e.header.questStars,
          e.header.map,
          hex(e.headerWords[14] ?? 0),
          e.header.unknownFlags.join(","),
          e.header.statTable,
          r[0]! & 0xffff,
          ...RECORD_BYTES.map(([, o]) => byte(r, o)),
          ...RECORD_WORDS.map(([, w]) => hex(r[w]!)),
        ].join("\t"),
      );
    }
  }
  return rows.join("\n") + "\n";
}

export function probeQuests(entries: readonly QuestRawEntry[]): string {
  const out: string[] = [`${entries.length} quests`, ""];

  out.push("== Size candidates ==");
  const mods = entries.map((e) => e.headerWords[14] ?? 0);
  out.push(`MonSizeModifier (u32 @0x38): ${top(mods, (v) => hex(v))}`);
  for (let b = 0; b < 4; b++) {
    out.push(
      `  byte ${b} (@${hex(0x38 + b, 2)}): ${top(mods, (v) => String((v >>> (b * 8)) & 0xff))}`,
    );
  }
  out.push(
    `Unkn4/5/7 (u8 @0x47, 0x48, 0x4a): ${top(entries, (e) => e.header.unknownFlags.join(","))}`,
  );
  out.push(`statTable (u8 @0x49): ${top(entries, (e) => String(e.header.statTable))}`);
  const records = entries.flatMap((e) => e.largeMonsterRecords);
  out.push(`Large monster records: ${records.length}`);
  for (const [name, o] of RECORD_BYTES)
    out.push(`  ${name}: ${top(records, (r) => String(byte(r, o)))}`);
  for (const [name, w] of RECORD_WORDS) out.push(`  ${name}: ${top(records, (r) => hex(r[w]!))}`);
  out.push(
    "  MonSizeModifier by rank: " +
      [...new Set(entries.map((e) => e.header.rank))]
        .sort((a, b) => a - b)
        .map(
          (rank) =>
            `rank ${rank}: ${top(
              entries.filter((e) => e.header.rank === rank),
              (e) => hex(e.headerWords[14] ?? 0),
              4,
            )}`,
        )
        .join(" | "),
  );
  out.push("");

  out.push("== Objectives (header 0x28, 0x30) ==");
  // From the header words, so dumps made before `objectives` existed work too.
  const objective = (e: QuestRawEntry, slot: number) => {
    const word = (i: number) => e.headerWords[10 + slot * 2 + i] ?? 0;
    return {
      kind: word(0),
      id: word(1) & 0xffff,
      count: (word(1) >>> 16) & 0xff,
      slot: word(1) >>> 24,
    };
  };
  for (const slot of [0, 1]) {
    const all = entries.map((e) => ({ e, o: objective(e, slot) }));
    out.push(
      `Slot ${slot} (@${hex(0x28 + slot * 8, 2)}): kind ${top(all, (a) => String(a.o.kind), 6)}`,
    );
    const monsters = all.filter((a) => a.o.kind === 1);
    if (monsters.length > 0) {
      const target = monsters.filter((a) => a.o.id === a.e.header.targetId).length;
      const large = monsters.filter((a) =>
        a.e.largeMonsterRecords.some((r) => (r[0]! & 0xffff) === a.o.id),
      ).length;
      out.push(
        `  monster objectives: ${monsters.length}; id = TargetID ${target}, id = a large monster ${large}; count ${top(monsters, (a) => String(a.o.count), 6)}; last byte ${top(monsters, (a) => String(a.o.slot), 6)}`,
      );
    }
    const items = all.filter((a) => a.o.kind === 2);
    if (items.length > 0) {
      out.push(
        `  item objectives: ${items.length}; count ${top(items, (a) => String(a.o.count), 6)}`,
      );
    }
  }
  out.push("");

  out.push("== Quest script ==");
  const scripts = entries.map((e) => JSON.stringify(e.script));
  out.push(`Distinct scripts: ${new Set(scripts).size} of ${entries.length} quests`);
  const opcodes = [...new Set(entries.flatMap((e) => e.script.map((p) => p[0]!)))].sort(
    (a, b) => a - b,
  );
  for (const op of opcodes) {
    const uses = entries.flatMap((e) => e.script.filter((p) => p[0] === op).map((p) => ({ e, p })));
    const quests = new Set(uses.map((u) => u.e.path)).size;
    const matches = [1, 2, 3].map((a) => {
      const target = uses.filter(
        (u) => u.e.header.targetId !== 0 && u.p[a] === u.e.header.targetId,
      ).length;
      const large = uses.filter((u) =>
        u.e.largeMonsterRecords.some((r) => (r[0]! & 0xffff) === u.p[a]),
      ).length;
      return `arg${a}=target ${target}, =large monster ${large}`;
    });
    out.push(
      `  opcode ${op}: ${uses.length} packets in ${quests} quests; ${matches.join("; ")}; args ${top(uses, (u) => u.p.slice(1).join(","), 4)}`,
    );
  }
  out.push("");

  out.push("== Quest text ==");
  const sharing = (e: QuestRawEntry) => {
    const groups = new Map<number, number[]>();
    e.strings.blocks.forEach((b, i) => groups.set(b, [...(groups.get(b) ?? []), i]));
    return [...groups]
      .map(([b, slots]) => (b === 0 ? `-${slots.join("")}` : slots.join("=")))
      .join(" ");
  };
  out.push(
    `Slot sharing (slots 0-6 with one block joined by =, unset as -): ${top(entries, sharing, 6)}`,
  );
  const layout = entries.map((e) => {
    const ranges = new Map<number, number>();
    for (const s of e.strings.strings) {
      s.pointers.forEach((p, i) => p !== 0 && ranges.set(p, p + s.lengths[i]! + 1));
    }
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    let runs = 0;
    let overlap = false;
    const gaps: number[] = [];
    let end = -1;
    for (const [start, stop] of sorted) {
      if (end !== -1 && start < end) overlap = true;
      else if (end === -1 || start - end > 3) runs++;
      if (end !== -1 && start >= end) gaps.push(start - end);
      end = Math.max(end, stop);
    }
    const pointers = e.strings.strings.flatMap((s) => s.pointers.filter((p) => p !== 0));
    const bytes = [...ranges].reduce((sum, [s, t]) => sum + t - s, 0);
    return {
      runs,
      overlap,
      gaps,
      shared: pointers.length - new Set(pointers).size,
      bytes,
      padding: e.entrySize === null ? null : e.entrySize - 32 - e.size,
    };
  });
  out.push(`String runs per quest (gap ≤ 3 zero bytes): ${top(layout, (l) => String(l.runs), 6)}`);
  out.push(`Quests with overlapping strings: ${layout.filter((l) => l.overlap).length}`);
  out.push(
    `Gaps between strings (bytes): ${top(
      layout.flatMap((l) => l.gaps),
      String,
      8,
    )}`,
  );
  out.push(`String pointers reused within a quest: ${top(layout, (l) => String(l.shared), 6)}`);
  out.push(
    `Text bytes per quest: min ${Math.min(...layout.map((l) => l.bytes))}, max ${Math.max(...layout.map((l) => l.bytes))}`,
  );
  const padding = layout.flatMap((l) => (l.padding === null ? [] : [l.padding]));
  if (padding.length > 0) {
    out.push(
      `Sector padding after the payload (bytes): min ${Math.min(...padding)}, max ${Math.max(...padding)}`,
    );
  }
  return out.join("\n") + "\n";
}
