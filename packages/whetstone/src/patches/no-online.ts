/**
 * No online play: every Whetstone disc is offline, randomfu's too. A
 * patched disc doesn't play the same game as anyone else's (a randomized one
 * least of all), so it shouldn't meet other hunters through ad hoc (the Gathering Hall, the Training School) or reach the
 * download servers. Always on; not a setting.
 *
 * What the game does (EU addresses; found statically on the EU and JP EBOOTs
 * and overlays):
 *
 * - Before and during any network play the game reads the WLAN switch with
 *   `sceWlanGetSwitchState` (1 is on). The EBOOT polls it (EU 0x088ABE58,
 *   keeping `state == 1` at `+0x176` and acting when it goes off), and
 *   `lobby_task`, `game_sub` and `arcade_task` test it before going on, or
 *   flag the session to end (EU `*0x09A0B544 + 0x1AFC`) when it's off: the
 *   path a PSP takes when the switch is flipped mid-session.
 * - The network starts with `sceNetInit` (EU 0x088AC66C in the EBOOT's net
 *   state machine, which goes on to `sceNetAdhocInit` or `sceNetInetInit`
 *   and their control libraries; `lobby_task` has a call of its own). A
 *   negative result puts the state machine in its error state (2).
 *
 * The patch replaces every `jal` to those two imports' stubs, in the EBOOT
 * and in every overlay, with a load of the result: the switch reads 0 (off),
 * so the game takes its own WLAN-off path, and `sceNetInit` returns
 * 0x80410000 (an error), so nothing past it can start even where the switch
 * isn't read. The calls' delay slots set up arguments only, and still run.
 */
import type { Region } from "mhfu-extract/src/container/sfo.js";
import { loadFileList } from "mhfu-extract/src/container/filelist.js";
import type { Edits } from "../edits.js";
import type { Report } from "../report.js";
import { findImports } from "./code-loader.js";
import { codeSegment, jalTo } from "./mips.js";

/** The imports the patch cuts off, by NID, and the word each call becomes. */
export const OFFLINE_CALLS = [
  // sceWlanGetSwitchState → `addiu $v0, $zero, 0`: the switch is off.
  { name: "sceWlanGetSwitchState", nid: 0xd7763699, word: 0x24020000 },
  // sceNetInit → `lui $v0, 0x8041`: a network error.
  { name: "sceNetInit", nid: 0x39af39a6, word: 0x3c028041 },
] as const;

export interface OfflineResult {
  /** Calls replaced in the EBOOT, and in overlays (by path). */
  eboot: number;
  overlays: Map<string, number>;
}

/** Replaces each `jal` to a stub in `buf[from, to)` with its word; returns how many. */
function cutCalls(buf: Buffer, from: number, to: number, calls: Map<number, number>): number {
  let n = 0;
  for (let at = from; at + 4 <= to; at += 4) {
    const word = calls.get(buf.readUInt32LE(at));
    if (word === undefined) continue;
    buf.writeUInt32LE(word, at);
    n++;
  }
  return n;
}

/**
 * Cuts the game off from the network (see above), or says why not. Every
 * `overlay/*.ovl` among DATA.BIN's first `fileCount` files is patched.
 */
export function disableOnline(
  vanillaEboot: Buffer,
  region: Region,
  fileCount: number,
  edits: Edits,
): OfflineResult | string {
  const segment = codeSegment(vanillaEboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const stubs = findImports(vanillaEboot, segment);
  /** Each stub's `jal` word, to the word that replaces it. */
  const calls = new Map<number, number>();
  for (const call of OFFLINE_CALLS) {
    const stub = stubs.get(call.nid);
    if (stub === undefined) return `the EBOOT doesn't import ${call.name}`;
    calls.set(jalTo(stub), call.word);
  }

  const eboot = edits.eboot();
  const inEboot = cutCalls(eboot, segment.offset, segment.offset + segment.size, calls);
  if (inEboot === 0) return "the EBOOT never calls the network imports";
  const overlays = new Map<string, number>();
  for (const [index, path] of loadFileList(region)) {
    if (index >= fileCount || !path.startsWith("overlay/") || !path.endsWith(".ovl")) continue;
    const now = edits.dataFileNow(index);
    // Count on a copy first, so files with no calls aren't marked edited.
    const n = cutCalls(Buffer.from(now), 0, now.length, calls);
    if (n === 0) continue;
    const file = edits.dataFile(index);
    cutCalls(file, 0, file.length, calls);
    overlays.set(path, n);
  }
  return { eboot: inEboot, overlays };
}

export function offlineReport(result: OfflineResult | string): Report {
  if (typeof result === "string") {
    return {
      title: "Online play",
      notes: [`Online play couldn't be turned off on this image: ${result}.`],
      lines: [],
      summary: `Online play: not turned off (${result})`,
    };
  }
  const total = result.eboot + [...result.overlays.values()].reduce((a, b) => a + b, 0);
  const files = [...result.overlays.keys()].map((p) => p.replace(/^overlay\//, "")).join(", ");
  return {
    title: "Online play",
    notes: [
      "Off: the game sees the WLAN switch as off and can't start the network, so there's no ad hoc play or downloading.",
      `${total} calls cut (${result.eboot} in the EBOOT${files ? `, the rest in ${files}` : ""}).`,
    ],
    lines: [],
    summary: `Online play: off (${total} calls)`,
  };
}
