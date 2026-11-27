/** Messages between the page (app.ts) and the worker (worker.ts). */
import type { RunOptions } from "whetstone/src/run.js";
import type { WhetstoneSettings } from "whetstone/src/settings.js";

export type Request =
  | { type: "check"; iso: File }
  | { type: "run"; iso: File; settings: WhetstoneSettings; options: RunOptions };

/** A piece of the finished image: a range of the user's own file, or new bytes. */
export type Segment = { start: number; end: number } | { data: Uint8Array };

export type Response =
  | {
      type: "checked";
      discId: string | null;
      region: string | null;
      supported: boolean;
    }
  | { type: "log"; line: string }
  | { type: "done"; report: string; segments: Segment[] | null }
  | { type: "error"; message: string };
