/**
 * Writes the break raw dump for `extract --raw` (see `emit/break-code-raw.ts`):
 * `raw/break-code.json`, and every overlay copied to `raw/overlays/`.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { findAddressRefs, type AddressRange, type CodeFile } from "../emit/break-code-raw.js";
import { OVERLAY_DIR, type MonsterOverlays } from "../monsters/overlays.js";
import {
  CAP_BREAK_ENTRY_SIZE,
  CAP_BREAK_POINTER_COUNT,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  CARVE_POINTER_COUNT,
  type RewardTableLocation,
} from "../monsters/rewards.js";

/** The reward tables in `game_sub.ovl`, as vaddr ranges. */
export function rewardTableRanges(
  loadBase: number,
  rewards: RewardTableLocation,
  capBreakCount: number,
): AddressRange[] {
  const range = (name: string, offset: number, size: number): AddressRange => ({
    name,
    start: (loadBase + offset) >>> 0,
    end: (loadBase + offset + size) >>> 0,
  });
  return [
    // The index runs to its 0xFF terminator entry.
    range("capbreakindex", rewards.capBreak.index, (capBreakCount + 1) * CAP_BREAK_ENTRY_SIZE),
    range("capBreakPointers", rewards.capBreak.pointers, CAP_BREAK_POINTER_COUNT * 4),
    range("bodytailshiny", rewards.carves.index, CARVE_INDEX_COUNT * CARVE_INDEX_SIZE),
    range("carvePointers", rewards.carves.pointers, CARVE_POINTER_COUNT * 4),
  ];
}

export async function writeBreakCodeRaw(
  unpackedDir: string,
  outDir: string,
  eboot: Buffer,
  overlays: MonsterOverlays,
  rewards: RewardTableLocation,
  capBreakCount: number,
): Promise<void> {
  const overlayDir = path.join(unpackedDir, OVERLAY_DIR);
  const copyDir = path.join(outDir, "raw", "overlays");
  await mkdir(copyDir, { recursive: true });
  const files: CodeFile[] = [{ name: "eboot.bin", buf: eboot }];
  for (const name of (await readdir(overlayDir)).filter((n) => n.endsWith(".ovl")).sort()) {
    files.push({ name: `overlay/${name}`, buf: await readFile(path.join(overlayDir, name)) });
    await copyFile(path.join(overlayDir, name), path.join(copyDir, name));
  }

  const ranges = rewardTableRanges(overlays.gameSub.loadBase, rewards, capBreakCount);
  const refs = findAddressRefs(files, ranges);
  const outPath = path.join(outDir, "raw", "break-code.json");
  const summary = {
    ranges: ranges.map((r) => ({
      name: r.name,
      start: `0x${r.start.toString(16)}`,
      end: `0x${r.end.toString(16)}`,
    })),
    files: files.map((f) => ({ name: f.name, size: f.buf.length })),
    refs,
  };
  await writeFile(outPath, `${JSON.stringify(summary)}\n`, "utf-8");
  const byFile = new Map<string, number>();
  for (const ref of refs) byFile.set(ref.file, (byFile.get(ref.file) ?? 0) + 1);
  console.log(
    `Wrote ${outPath} (${refs.length} reward table references: ${[...byFile].map(([f, n]) => `${f} ${n}`).join(", ") || "none"}) and ${files.length - 1} overlays to ${copyDir}.`,
  );
}
