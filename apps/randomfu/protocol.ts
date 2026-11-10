/** Messages between the page (app.ts) and the worker (worker.ts). */
import type { Settings } from "randomfu/src/settings.js";

export type Request =
  | { type: "check"; iso: File; eboot: File | null }
  | { type: "run"; iso: File; eboot: File | null; settings: Settings; dryRun: boolean };

/** A piece of the finished image: a range of the user's own file, or new bytes. */
export type Segment = { start: number; end: number } | { data: Uint8Array };

export type Response =
  | {
      type: "checked";
      discId: string | null;
      region: string | null;
      supported: boolean;
      /** Whether the disc's own EBOOT decrypts in the browser (null for an unsupported disc). */
      discEboot: { ok: boolean; detail: string } | null;
      eboot: { ok: boolean; detail: string } | null;
    }
  | { type: "log"; line: string }
  | { type: "done"; spoiler: string; problems: string[]; segments: Segment[] | null }
  | { type: "error"; message: string };
