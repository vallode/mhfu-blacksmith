/**
 * The randomizer in a worker: reads the user's ISO through FileReaderSync
 * (the shared code reads synchronously), keeps every write in memory over it
 * (OverlaySource), and sends back the finished image as ranges of the
 * user's file plus changed sectors. Nothing leaves the browser.
 */
import { Buffer } from "buffer";
import { Iso9660Reader } from "../../mhfu-extract/src/container/iso9660.js";
import { detectRegion, parseSfo } from "../../mhfu-extract/src/container/sfo.js";
import type { RandomAccessSource } from "../../mhfu-extract/src/container/source.js";
import { OverlaySource, PatchableImage } from "../src/disc/image.js";
import { loadGame } from "../src/game/load.js";
import { randomize } from "../src/randomize.js";
import {
  applySettings,
  defaultSettings,
  describeSettings,
  encodeSettings,
  needsEboot,
} from "../src/settings.js";
import { formatSpoiler } from "../src/spoiler.js";
import { writeEdits } from "../src/write.js";
import type { Request, Response, Segment } from "./protocol.js";

interface WorkerScope {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Response, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
const post = (message: Response, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);

/** The user's file, read in slices as the shared code asks for them. */
class BlobSource implements RandomAccessSource {
  private readonly reader = new FileReaderSync();

  constructor(private readonly blob: Blob) {}

  get totalBytes(): number {
    return this.blob.size;
  }

  read(offset: number, length: number): Buffer {
    if (offset < 0 || offset + length > this.blob.size) {
      throw new RangeError(`read past the end of the file at 0x${offset.toString(16)}`);
    }
    return Buffer.from(this.reader.readAsArrayBuffer(this.blob.slice(offset, offset + length)));
  }

  close(): void {}
}

function openIso(file: File): BlobSource {
  const source = new BlobSource(file);
  if (source.totalBytes >= 4 && source.read(0, 4).toString("latin1") === "CISO") {
    throw new Error(
      "That's a CSO. Decompress it to an ISO first (for example with maxcso or PPSSPP).",
    );
  }
  return source;
}

const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

function check(iso: File, eboot: File | null): Response {
  const reader = new Iso9660Reader(openIso(iso));
  const { region, discId } = detectRegion(parseSfo(reader.readFile("/PSP_GAME/PARAM.SFO")));
  let ebootCheck: { ok: boolean; detail: string } | null = null;
  if (eboot) {
    const head = new BlobSource(eboot).read(0, Math.min(4, eboot.size));
    const ok = head.equals(ELF);
    ebootCheck = { ok, detail: ok ? "decrypted (ELF)" : "not decrypted (no ELF header)" };
  }
  return {
    type: "checked",
    discId,
    region,
    supported: region === "jp" || region === "eu",
    eboot: ebootCheck,
  };
}

async function run(request: Extract<Request, { type: "run" }>): Promise<Response> {
  const log = (line: string) => post({ type: "log", line });
  const settings = applySettings(defaultSettings(request.settings.seed), { ...request.settings });
  const needs = needsEboot(settings);
  if (needs && !request.eboot) {
    throw new Error("These settings change the EBOOT: add your decrypted EBOOT dump.");
  }
  const overlay = new OverlaySource(openIso(request.iso));
  const image = new PatchableImage(overlay);
  log("Reading the disc...");
  const dump = needs ? new BlobSource(request.eboot!).read(0, request.eboot!.size) : undefined;
  const game = await loadGame(overlay, image.iso, { eboot: needs ? { dump } : null });
  log(
    `${game.discId} (${game.region}): ${game.quests.length} quests, ${game.skippedQuests.length} skipped.`,
  );
  log(`Seed ${settings.seed}. Settings string: ${encodeSettings(settings)}`);
  for (const line of describeSettings(settings)) log(`  ${line}`);

  const result = randomize(game, settings);
  for (const report of result.reports) log(`${report.title}: ${report.lines.length} slots`);
  if (result.problems.length > 0) {
    log(
      `Warning: ${result.problems.length} recipe materials can't be found as early as before; see the spoiler log.`,
    );
  }
  let segments: Segment[] | null = null;
  if (!request.dryRun) {
    const summary = writeEdits(image, game, result.edits);
    log(
      `Changed ${summary.quests} quests and ${summary.files} other DATA.BIN files; EBOOT ${summary.eboot}. Read-back check passed.`,
    );
    segments = overlay
      .segments()
      .map((s) =>
        s.kind === "original" ? { start: s.start, end: s.end } : { data: new Uint8Array(s.data) },
      );
  }
  return {
    type: "done",
    spoiler: formatSpoiler(game, settings, result),
    problems: result.problems,
    segments,
  };
}

scope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      const response =
        request.type === "check" ? check(request.iso, request.eboot) : await run(request);
      const transfer =
        response.type === "done" && response.segments
          ? response.segments.flatMap((s) => ("data" in s ? [s.data.buffer] : []))
          : [];
      post(response, transfer);
    } catch (error) {
      post({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  })();
};
