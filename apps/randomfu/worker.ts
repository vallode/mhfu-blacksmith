/**
 * The randomizer in a worker: reads the user's ISO through FileReaderSync
 * (the shared code reads synchronously), runs randomfu's `runRandomizer`
 * over it, which keeps every write in memory, and sends back the finished
 * image as ranges of the user's file plus changed sectors. Nothing leaves
 * the browser.
 */
import { Buffer } from "buffer";
import { Iso9660Reader } from "mhfu-extract/src/container/iso9660.js";
import type { RandomAccessSource } from "mhfu-extract/src/container/source.js";
import { checkDisc } from "randomfu/src/game/load.js";
import { runRandomizer } from "randomfu/src/run.js";
import { applySettings, defaultSettings } from "randomfu/src/settings.js";
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

async function check(iso: File): Promise<Response> {
  return { type: "checked", ...checkDisc(new Iso9660Reader(new BlobSource(iso))) };
}

async function run(request: Extract<Request, { type: "run" }>): Promise<Response> {
  const settings = applySettings(defaultSettings(request.settings.seed), { ...request.settings });
  const result = await runRandomizer(
    new BlobSource(request.iso),
    settings,
    request.options,
    (line) => post({ type: "log", line }),
  );
  const segments: Segment[] | null =
    result.segments?.map((s) =>
      s.kind === "original" ? { start: s.start, end: s.end } : { data: new Uint8Array(s.data) },
    ) ?? null;
  return { type: "done", spoiler: result.spoiler, problems: result.problems, segments };
}

scope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      const response = request.type === "check" ? await check(request.iso) : await run(request);
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
