/**
 * `extract --raw` probe for the monster tables (vallode/mhfu-blacksmith#35):
 * searches every monster overlay for the committed `data/monsters/*.json`
 * hitzone rows and drop lists, as bytes, and records what surrounds each hit.
 *
 * The first dump showed the hexpat layouts don't hold as written on EU:
 * `emChunk +0x10C` leads to 3-row tables that aren't hitzones, and nothing
 * points at the Giaprey carve list. Finding the committed values on the disc
 * shows where the real tables are and, from the bytes and references around
 * them, how they're indexed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadSiteIndex } from "../build/ids.js";
import type { OvlFile } from "../container/ovl.js";
import { emFileName, emFilesContaining, type MonsterOverlays } from "../monsters/overlays.js";
import { MONSTER_CHUNK_SIZE } from "../monsters/hitzones.js";

interface Hit {
  file: string;
  offset: number;
  vaddr: number;
  before: string;
  after: string;
  /** u32 words pointing at the hit or up to 16 bytes before it, absolute or relative to the overlay's load base. */
  references: { file: string; offset: number; value: number; kind: "absolute" | "relative" }[];
}

interface Signature {
  monster: string;
  what: string;
  hex: string;
  hits: Hit[];
}

export interface MonstersProbe {
  hitzones: Signature[];
  drops: Signature[];
  /** Committed lists that couldn't become byte patterns (unknown item names). */
  skippedDrops: { monster: string; what: string; reason: string }[];
  /** Hex of the pool following the chunk array in game_task, and around the Giaprey carve list in game_sub. */
  regions: { file: string; offset: number; vaddr: number; hex: string }[];
  /** 64 bytes at every em-slot address a chunk holds, from each em file mapping it. */
  emTargets: { emId: number; word: number; vaddr: number; file: string; hex: string }[];
}

type MonsterJson = {
  name: string;
  hitzones?: Record<string, Record<string, string>>;
  drops?: Record<string, Record<string, { name: string; chance: string }[]>>;
};

const HITZONE_ORDERS: Record<string, string[]> = {
  "fire,water,ice,thunder": ["cut", "bash", "shot", "fir", "wtr", "ice", "thn", "drg", "ko"],
  "fire,water,thunder,ice": ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"],
};

const MAX_HITS = 6;

function loadMonsters(dataDir: string): MonsterJson[] {
  const dir = path.join(dataDir, "monsters");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap(
      (f) =>
        (JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as { monsters: MonsterJson[] })
          .monsters,
    );
}

function files(overlays: MonsterOverlays): [string, OvlFile][] {
  return [
    ["game_task.ovl", overlays.gameTask],
    ["game_sub.ovl", overlays.gameSub],
    ...[...overlays.em].map(([n, ovl]): [string, OvlFile] => [emFileName(n), ovl]),
  ];
}

const vaddrOf = (ovl: OvlFile, offset: number) => ovl.loadBase - 0x80 + offset;

/** u32-aligned words in every overlay, indexed by value, built once. */
function wordIndex(all: [string, OvlFile][]): Map<number, { file: string; offset: number }[]> {
  const index = new Map<number, { file: string; offset: number }[]>();
  for (const [file, ovl] of all) {
    const buf = ovl.reader.buf;
    for (let at = 0x80; at + 4 <= buf.length; at += 4) {
      const v = buf.readUInt32LE(at);
      if (v === 0 || v === 0xffffffff) continue;
      let list = index.get(v);
      if (!list) index.set(v, (list = []));
      if (list.length < 32) list.push({ file, offset: at });
    }
  }
  return index;
}

function search(
  all: [string, OvlFile][],
  words: Map<number, { file: string; offset: number }[]>,
  needle: Buffer,
): Hit[] {
  const hits: Hit[] = [];
  for (const [file, ovl] of all) {
    const buf = ovl.reader.buf;
    for (let at = buf.indexOf(needle, 0x80); at !== -1; at = buf.indexOf(needle, at + 1)) {
      const vaddr = vaddrOf(ovl, at);
      const references: Hit["references"] = [];
      for (let back = 0; back <= 16; back++) {
        for (const [value, kind] of [
          [vaddr - back, "absolute"],
          [vaddr - back - ovl.loadBase, "relative"],
        ] as const) {
          for (const ref of words.get(value) ?? []) references.push({ ...ref, value, kind });
        }
      }
      hits.push({
        file,
        offset: at,
        vaddr,
        before: buf.subarray(Math.max(0, at - 48), at).toString("hex"),
        after: buf.subarray(at, Math.min(buf.length, at + needle.length + 48)).toString("hex"),
        references,
      });
      if (hits.length >= MAX_HITS) return hits;
    }
  }
  return hits;
}

function hitzoneSignatures(monsters: MonsterJson[]): Omit<Signature, "hits">[] {
  const out: Omit<Signature, "hits">[] = [];
  for (const m of monsters) {
    for (const [part, row] of Object.entries(m.hitzones ?? {})) {
      for (const [order, keys] of Object.entries(HITZONE_ORDERS)) {
        const values = keys.map((k) => Number(row[k]));
        if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) continue;
        // Rows of a few repeated values (all 100s) match everywhere.
        if (new Set(values).size < 3) continue;
        out.push({
          monster: m.name,
          what: `hitzone ${part} (${order})`,
          hex: Buffer.from(values).toString("hex"),
        });
      }
    }
  }
  return out;
}

function dropSignatures(
  monsters: MonsterJson[],
  dataDir: string,
): { signatures: Omit<Signature, "hits">[]; skipped: MonstersProbe["skippedDrops"] } {
  const site = loadSiteIndex(dataDir);
  const signatures: Omit<Signature, "hits">[] = [];
  const skipped: MonstersProbe["skippedDrops"] = [];
  for (const m of monsters) {
    for (const [rank, groups] of Object.entries(m.drops ?? {})) {
      for (const [label, list] of Object.entries(groups)) {
        const what = `${rank} / ${label}`;
        const entries = list.map((e) => ({
          id: site.itemIdOf(e.name),
          chance: Number.parseInt(e.chance, 10),
          amount: Number(/\bx(\d+)$/i.exec(e.name.trim())?.[1] ?? 1),
        }));
        const unknown = list.filter((_, i) => entries[i]!.id === null).map((e) => e.name);
        if (unknown.length > 0) {
          skipped.push({ monster: m.name, what, reason: `unknown items: ${unknown.join(", ")}` });
          continue;
        }
        const carve = Buffer.alloc(entries.length * 4 + 2);
        const reward = Buffer.alloc(entries.length * 6 + 2);
        entries.forEach((e, i) => {
          carve.writeUInt16LE(e.chance, i * 4);
          carve.writeUInt16LE(e.id!, i * 4 + 2);
          reward.writeUInt16LE(e.chance, i * 6);
          reward.writeUInt16LE(e.id!, i * 6 + 2);
          reward.writeUInt16LE(e.amount, i * 6 + 4);
        });
        carve.writeUInt16LE(0xffff, entries.length * 4);
        reward.writeUInt16LE(0xffff, entries.length * 6);
        signatures.push({
          monster: m.name,
          what: `${what} (carve form)`,
          hex: carve.toString("hex"),
        });
        signatures.push({
          monster: m.name,
          what: `${what} (reward form)`,
          hex: reward.toString("hex"),
        });
      }
    }
  }
  return { signatures, skipped };
}

function region(
  file: string,
  ovl: OvlFile,
  start: number,
  length: number,
): MonstersProbe["regions"][number] {
  const from = Math.max(0x80, start);
  const to = Math.min(ovl.reader.length, start + length);
  return {
    file,
    offset: from,
    vaddr: vaddrOf(ovl, from),
    hex: ovl.reader.buf.subarray(from, to).toString("hex"),
  };
}

const EM_SLOT = (v: number) => v >= 0x09d00000 && v < 0x09e00000;

export function probeMonsters(
  overlays: MonsterOverlays,
  dataDir: string,
  chunksOffset: number,
): MonstersProbe {
  const all = files(overlays);
  const words = wordIndex(all);
  const monsters = loadMonsters(dataDir);
  const withHits = (s: Omit<Signature, "hits">): Signature => ({
    ...s,
    hits: search(all, words, Buffer.from(s.hex, "hex")),
  });

  const hitzones = hitzoneSignatures(monsters).map(withHits);
  const { signatures, skipped } = dropSignatures(monsters, dataDir);
  const drops = signatures.map(withHits);

  const regions: MonstersProbe["regions"] = [];
  const chunksEnd = chunksOffset + 90 * MONSTER_CHUNK_SIZE;
  regions.push(region("game_task.ovl", overlays.gameTask, chunksEnd, 0x1c000));
  const giaprey = overlays.gameSub.reader.buf.indexOf(
    Buffer.from("340054011e00560112001901ffff", "hex"),
  );
  if (giaprey !== -1)
    regions.push(region("game_sub.ovl", overlays.gameSub, giaprey - 0x8000, 0x18000));

  const emTargets: MonstersProbe["emTargets"] = [];
  const seen = new Set<string>();
  const task = overlays.gameTask;
  for (let emId = 0; emId < 90; emId++) {
    const base = chunksOffset + emId * MONSTER_CHUNK_SIZE;
    for (let w = 0; w < MONSTER_CHUNK_SIZE / 4; w++) {
      if (base + w * 4 + 4 > task.reader.length) break;
      const vaddr = task.reader.u32(base + w * 4);
      if (!EM_SLOT(vaddr)) continue;
      for (const n of emFilesContaining(overlays, vaddr)) {
        const file = emFileName(n);
        const key = `${file}:${vaddr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ovl = overlays.em.get(n)!;
        const at = ovl.vaddrToOffset(vaddr);
        emTargets.push({
          emId,
          word: w,
          vaddr,
          file,
          hex: ovl.reader.buf.subarray(at, Math.min(at + 64, ovl.reader.length)).toString("hex"),
        });
      }
    }
  }

  return { hitzones, drops, skippedDrops: skipped, regions, emTargets };
}
