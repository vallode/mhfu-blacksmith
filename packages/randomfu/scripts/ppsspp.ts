/**
 * PPSSPP's remote debugger (WebSocket `/debugger`), for the live tools.
 *
 * Every read and write happens inside one pause (`paused`, `cpu.stepping`
 * to `cpu.resume`). A `memory.read` or `memory.write` sent while the game
 * runs pauses and resumes it by itself, and a few dozen of those in a row
 * crashed PPSSPP 1.19.3 (corrupting its heap; the crash came in the
 * renderer or the audio thread). One pause around them didn't.
 */
import { execSync } from "node:child_process";

export const RAM_START = 0x08800000;
export const RAM_SIZE = 0x01800000;
const READ_CHUNK = 0x100000;

function ppssppLsof(args: string): string {
  try {
    return execSync(`lsof -nP -a -c PPSSPP ${args}`, { encoding: "utf8" });
  } catch {
    return ""; // lsof exits 1 when nothing matches.
  }
}

/** The port PPSSPP's debugger listens on. */
export function debuggerPort(): number {
  const port = /:(\d+) \(LISTEN\)/.exec(ppssppLsof("-iTCP -sTCP:LISTEN"))?.[1];
  if (!port) {
    throw new Error(
      "PPSSPP's remote debugger isn't listening: start the game in PPSSPP with Allow remote debugger on, or pass --port.",
    );
  }
  return Number(port);
}

/** The disc image PPSSPP has open. */
export function runningDisc(): string {
  const disc = ppssppLsof("-Fn")
    .split("\n")
    .map((line) => line.slice(1))
    .find((name) => /\.iso$/i.test(name));
  if (!disc) throw new Error("Can't tell which .iso PPSSPP is running: pass --running.");
  return disc;
}

export interface Debugger {
  /**
   * `code` reads the game's instructions where PPSSPP's JIT has put its own
   * opcodes in their place (at the start of each compiled block).
   */
  read(address: number, size: number, code?: boolean): Promise<Buffer>;
  write(address: number, data: Buffer): Promise<void>;
  /** Runs `body` with the game paused once, however many reads and writes it makes. */
  paused<T>(body: () => Promise<T>): Promise<T>;
  close(): void;
}

export async function connect(port: number): Promise<Debugger> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/debugger`);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`Can't connect to PPSSPP's debugger on port ${port}`));
  });
  type Message = Record<string, unknown>;
  let ticket = 1;
  const pending = new Map<number, (reply: Message) => void>();
  const waiting: { event: string; resolve: (message: Message) => void }[] = [];
  ws.onmessage = (message) => {
    const reply = JSON.parse(String(message.data)) as Message;
    const resolve = pending.get(reply.ticket as number);
    if (resolve) {
      pending.delete(reply.ticket as number);
      resolve(reply);
      return;
    }
    // Events without a ticket: cpu.stepping and cpu.resume answer that way.
    const at = waiting.findIndex((w) => w.event === reply.event);
    if (at >= 0) waiting.splice(at, 1)[0]!.resolve(reply);
  };
  const call = (event: string, args: Message = {}) =>
    new Promise<Message>((resolve, reject) => {
      const id = ticket++;
      pending.set(id, (reply) =>
        reply.event === "error" ? reject(new Error(String(reply.message))) : resolve(reply),
      );
      ws.send(JSON.stringify({ event, ticket: id, ...args }));
    });
  const until = (event: string, send: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`PPSSPP didn't answer ${send}`)), 5000);
      waiting.push({
        event,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
      ws.send(JSON.stringify({ event: send }));
    });
  return {
    async read(address, size, code = false) {
      const reply = await call("memory.read", { address, size, replacements: !code });
      return Buffer.from(String(reply.base64), "base64");
    },
    async write(address, data) {
      await call("memory.write", { address, base64: data.toString("base64") });
    },
    async paused(body) {
      const status = await call("cpu.status");
      const wasStepping = status.stepping === true;
      if (!wasStepping) await until("cpu.stepping", "cpu.stepping");
      try {
        return await body();
      } finally {
        if (!wasStepping) await until("cpu.resume", "cpu.resume");
      }
    },
    close: () => ws.close(1000),
  };
}

/** User memory, whole (call while paused). */
export async function readRam(ppsspp: Debugger): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (let at = 0; at < RAM_SIZE; at += READ_CHUNK) {
    chunks.push(await ppsspp.read(RAM_START + at, READ_CHUNK));
  }
  return Buffer.concat(chunks);
}

/** Prints why a live tool stopped, and exits. */
export function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    message === "CPU not started"
      ? "PPSSPP is open but no game is running: start the game."
      : message,
  );
  process.exit(1);
}
