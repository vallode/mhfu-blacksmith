/** Node's Buffer, which the shared code uses everywhere, as a global in the browser. */
import { Buffer } from "buffer";
(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
