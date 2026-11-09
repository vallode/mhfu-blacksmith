/**
 * Who uses an attack table: from the code that builds a table's address
 * (`mips.ts`) up through callers and pointer lists to a `MonChunk` slot,
 * which names the monster (vallode/mhfu-blacksmith#122).
 *
 * Nodes are functions (a known start: a `jal` target or a prologue) and
 * data (a run of pointers, from its first entry). A node's parents are the
 * pointer runs holding its address, the code building its address, and,
 * for a function, its callers. A chunk slot holding the address ends the
 * search there.
 *
 * `game_task.ovl` is always loaded, so anything may point into it. The
 * per-monster `emNN.ovl` files share load addresses, so an address in their
 * range means the file it was read from; from `game_task.ovl` (a chunk
 * slot) it could mean any of them, and each is followed.
 */
import type { OvlFile } from "../container/ovl.js";
import { OVL_HEADER_SIZE } from "../container/ovl.js";
import { isUserAddress } from "./collision.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "./hitzones.js";
import { scanCode, type AddressUse, type CodeScan } from "./mips.js";

export interface CodeFile {
  name: string;
  ovl: OvlFile;
  /** True for `game_task.ovl`; per-monster overlays are false. */
  shared: boolean;
}

/** A code location that builds or touches an address in a table. */
export interface TableUse {
  file: string;
  offset: number;
  kind: AddressUse["kind"];
  /** Function the instruction is in (file offset of its start). */
  func: number;
  /** Record index and byte within it. */
  record: number;
  byte: number;
}

export interface MonsterLink {
  emId: number;
  /** Chunk slot (offset within the 0x1D0-byte chunk) that leads here. */
  at: string;
  depth: number;
  /** From the chunk slot down to the function, e.g. "em01.ovl:0x1234 list[3/12]". */
  path: string[];
}

interface Node {
  file: CodeFile;
  /** File offset: a function start, or the first entry of a pointer run. */
  offset: number;
  kind: "func" | "data";
  /** For data: the entry the child was found in. */
  entry?: number;
}

const MAX_DEPTH = 6;
const MAX_NODES = 400;
const hex = (n: number) => `0x${n.toString(16)}`;

export class CodeGraph {
  private readonly scans = new Map<CodeFile, CodeScan>();
  private readonly starts = new Map<CodeFile, number[]>();
  private readonly sortedAddresses = new Map<CodeFile, Float64Array>();
  /** u32 value -> where it is stored. */
  private readonly stored = new Map<number, { file: CodeFile; offset: number }[]>();
  /** Callee (file name + offset) -> call sites. */
  private readonly callers = new Map<string, { file: CodeFile; offset: number }[]>();
  private readonly linkCache = new Map<string, MonsterLink[]>();

  constructor(
    private readonly files: readonly CodeFile[],
    private readonly chunks: { ovl: OvlFile; offset: number } | null,
  ) {
    for (const file of files) {
      const scan = scanCode(file.ovl);
      this.scans.set(file, scan);
      this.sortedAddresses.set(file, Float64Array.from(scan.addresses.keys()).sort());
      const r = file.ovl.reader;
      for (let at = OVL_HEADER_SIZE; at + 4 <= r.length; at += 4) {
        const v = r.u32(at);
        if (!isUserAddress(v)) continue;
        const list = this.stored.get(v);
        if (list) list.push({ file, offset: at });
        else this.stored.set(v, [{ file, offset: at }]);
      }
    }
    const starts = new Map<CodeFile, Set<number>>(files.map((f) => [f, new Set<number>()]));
    for (const file of files) {
      const scan = this.scans.get(file)!;
      for (const p of scan.prologues) starts.get(file)!.add(p);
      for (const call of scan.calls) {
        for (const target of this.resolve(call.target, file)) {
          const offset = target.ovl.vaddrToOffset(call.target);
          starts.get(target)!.add(offset);
          const key = `${target.name}:${offset}`;
          const list = this.callers.get(key);
          if (list) list.push({ file, offset: call.offset });
          else this.callers.set(key, [{ file, offset: call.offset }]);
        }
      }
    }
    for (const [file, set] of starts)
      this.starts.set(
        file,
        [...set].sort((a, b) => a - b),
      );
  }

  /** Files an address read from `from` can mean. */
  private resolve(vaddr: number, from: CodeFile): CodeFile[] {
    const out: CodeFile[] = [];
    for (const f of this.files) {
      if (!f.ovl.isOwnVaddr(vaddr)) continue;
      if (f.shared || f === from || from.shared) out.push(f);
    }
    return out;
  }

  /** Files whose pointers or code can mean an address in `target`. */
  private referrers(target: CodeFile): CodeFile[] {
    return this.files.filter((f) => target.shared || f === target || f.shared);
  }

  /** The function containing `offset`: the last known start at or before it. */
  funcOf(file: CodeFile, offset: number): number {
    const starts = this.starts.get(file)!;
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid]! <= offset) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? starts[lo - 1]! : offset;
  }

  /** Code locations building or touching an address in [`from`, `to`) of the named file. */
  usesOf(fileName: string, from: number, to: number, recordSize: number): TableUse[] {
    const file = this.files.find((f) => f.name === fileName);
    if (!file) return [];
    const lo = file.ovl.loadBase + from;
    const hi = file.ovl.loadBase + to;
    const uses: TableUse[] = [];
    for (const h of this.referrers(file)) {
      const sorted = this.sortedAddresses.get(h)!;
      const scan = this.scans.get(h)!;
      for (let i = lowerBound(sorted, lo); i < sorted.length && sorted[i]! < hi; i++) {
        const address = sorted[i]!;
        const rel = address - lo;
        for (const use of scan.addresses.get(address)!) {
          uses.push({
            file: h.name,
            offset: use.offset,
            kind: use.kind,
            func: this.funcOf(h, use.offset),
            record: Math.floor(rel / recordSize),
            byte: rel % recordSize,
          });
        }
      }
    }
    return uses;
  }

  /** The monsters whose chunks lead to the function at `offset` in the named file. */
  monstersOf(fileName: string, offset: number): MonsterLink[] {
    const key = `${fileName}:${offset}`;
    const cached = this.linkCache.get(key);
    if (cached) return cached;
    const file = this.files.find((f) => f.name === fileName)!;
    const links = this.search({ file, offset, kind: "func" });
    this.linkCache.set(key, links);
    return links;
  }

  private label(node: Node): string {
    const name = node.file.name.replace(/^overlay\//, "");
    if (node.kind === "func") return `${name}:${hex(node.offset)} func`;
    const index = ((node.entry ?? node.offset) - node.offset) / 4;
    return `${name}:${hex(node.offset)} list[${index}/${this.runLength(node.file, node.offset)}]`;
  }

  private runStart(file: CodeFile, offset: number): number {
    const r = file.ovl.reader;
    let at = offset;
    while (at - 4 >= OVL_HEADER_SIZE && isUserAddress(r.u32(at - 4))) at -= 4;
    return at;
  }

  private runLength(file: CodeFile, start: number): number {
    const r = file.ovl.reader;
    let at = start;
    while (at + 4 <= r.length && isUserAddress(r.u32(at))) at += 4;
    return (at - start) / 4;
  }

  /** The chunk slot at `offset` of `game_task.ovl`, if it is one. */
  private chunkSlot(file: CodeFile, offset: number): { emId: number; at: string } | null {
    const chunks = this.chunks;
    if (!chunks || file.ovl !== chunks.ovl) return null;
    const rel = offset - chunks.offset;
    if (rel < 0 || rel >= MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE) return null;
    return { emId: Math.floor(rel / MONSTER_CHUNK_SIZE), at: hex(rel % MONSTER_CHUNK_SIZE) };
  }

  /** Breadth-first from `start` up to the chunk slots that lead to it. */
  private search(start: Node): MonsterLink[] {
    const links: MonsterLink[] = [];
    const seen = new Set<string>();
    let frontier: { node: Node; path: string[] }[] = [{ node: start, path: [this.label(start)] }];
    seen.add(`${start.file.name}:${start.offset}`);
    for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
      const next: typeof frontier = [];
      for (const { node, path } of frontier) {
        for (const parent of this.parents(node)) {
          if ("emId" in parent) {
            links.push({ emId: parent.emId, at: parent.at, depth, path: [...path].reverse() });
            continue;
          }
          const key = `${parent.file.name}:${parent.offset}`;
          if (seen.has(key) || seen.size >= MAX_NODES) continue;
          seen.add(key);
          next.push({ node: parent, path: [...path, this.label(parent)] });
        }
      }
      frontier = next;
    }
    return links;
  }

  private *parents(node: Node): Generator<Node | { emId: number; at: string }> {
    const vaddr = node.file.ovl.loadBase + node.offset;
    if (node.kind === "func") {
      for (const call of this.callers.get(`${node.file.name}:${node.offset}`) ?? []) {
        yield { file: call.file, offset: this.funcOf(call.file, call.offset), kind: "func" };
      }
    }
    // Pointers to the node (for data, to its first entry or the entry itself).
    const targets =
      node.kind === "data" && node.entry !== undefined
        ? [vaddr, node.file.ovl.loadBase + node.entry]
        : [vaddr];
    const allowed = new Set(this.referrers(node.file));
    for (const target of new Set(targets)) {
      for (const loc of this.stored.get(target) ?? []) {
        if (!allowed.has(loc.file)) continue;
        const slot = this.chunkSlot(loc.file, loc.offset);
        if (slot) {
          yield slot;
          continue;
        }
        yield {
          file: loc.file,
          offset: this.runStart(loc.file, loc.offset),
          kind: "data",
          entry: loc.offset,
        };
      }
      // Code building the address (a list's, or a function's to store as a callback).
      for (const h of allowed) {
        for (const use of this.scans.get(h)!.addresses.get(target) ?? []) {
          yield { file: h, offset: this.funcOf(h, use.offset), kind: "func" };
        }
      }
    }
  }
}

function lowerBound(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
