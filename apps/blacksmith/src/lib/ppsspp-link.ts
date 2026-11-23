/**
 * Reads the loaded hunter straight out of a running PPSSPP, over its remote
 * debugger (a WebSocket at ws://127.0.0.1:<port>/debugger, on when PPSSPP's
 * "Allow remote debugger" is set).
 *
 * The game keeps the loaded hunter in RAM as the plaintext character block of
 * its save (the save's slot layout, `HUNTER_SIZE` bytes), so the site's save
 * parser reads it as it is. Reads happen inside one debugger pause
 * (`cpu.stepping`, read, `cpu.resume`): reading while the game runs makes
 * PPSSPP pause and resume around every call, which has crashed it.
 */

/** One character block: a save slot's size (the save worker's CHARACTER_SIZE). */
export const HUNTER_SIZE = 0x6b100;

/**
 * Where each release keeps the loaded hunter's block, found by matching a
 * savestate's RAM against the save it was made with (EU) and by
 * `findHunter` over savestates (JP, FUComplete reports ULJM05500).
 */
export const HUNTER_ADDRESSES: Readonly<Record<string, number>> = {
  ULES01213: 0x0999a100,
  ULJM05500: 0x09995e40,
};

/** The PSP's user memory, where `findHunter` looks for a release not listed above. */
const USER_MEMORY = { start: 0x08800000, end: 0x0a000000 };
const SCAN_CHUNK = 0x100000;

/** The save worker's region for a game ID: JP saves and memory use the JP layout of IDs. */
export function regionForGame(id: string): "us" | "jp" {
  return /^(ULJM|ULJS|NPJ)/.test(id) ? "jp" : "us";
}

const NAME_UNITS = 9; // the Guild Card compares 18 bytes of name
const SEX = 0x13;
const EQUIP_BOX = 0xa8;
const ITEM_CHEST = 0x2f88;
const ZENNY = 0x69250;

/**
 * Whether `bytes` at `offset` holds a loaded hunter's block: a 1–9 character
 * name of characters the game can type, zero-padded; the byte before the sex flag (always 1); an equipment
 * box whose used slots start `01 <type 0–6>`; an item box of real-looking
 * stacks; and something in one of the boxes. On the title screen, before a
 * hunter is loaded, the block fails this.
 */
export function looksLikeHunter(bytes: Uint8Array, offset = 0): boolean {
  if (offset + HUNTER_SIZE > bytes.length) return false;
  if (bytes[offset + SEX - 1] !== 1 || bytes[offset + SEX] > 1) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, HUNTER_SIZE);
  let units = 0;
  while (units < NAME_UNITS && view.getUint16(units * 2, true) !== 0) {
    if (!nameCharacter(view.getUint16(units * 2, true))) return false;
    units++;
  }
  if (units === 0) return false;
  for (let i = units; i < NAME_UNITS; i++) if (view.getUint16(i * 2, true) !== 0) return false;
  let equipment = 0;
  for (let i = 0; i < 400; i++) {
    const slot = offset + EQUIP_BOX + i * 12;
    if (bytes[slot] === 0 && bytes[slot + 1] === 0) continue;
    if (bytes[slot] !== 1 || bytes[slot + 1] > 6) return false;
    equipment++;
  }
  let stacks = 0;
  for (let i = 0; i < 1000; i++) {
    const id = view.getUint16(ITEM_CHEST + i * 4, true);
    if (id === 0) continue;
    const qty = view.getUint16(ITEM_CHEST + i * 4 + 2, true);
    if (id > 2000 || qty === 0 || qty > 999) return false;
    stacks++;
  }
  return stacks + equipment > 0 && view.getUint32(ZENNY, true) <= 99_999_999;
}

/** ASCII, kana and CJK punctuation, kanji, and full-width forms: what a hunter's name is typed in. */
function nameCharacter(unit: number): boolean {
  return (
    (unit >= 0x20 && unit <= 0x7e) ||
    (unit >= 0x3000 && unit <= 0x30ff) ||
    (unit >= 0x4e00 && unit <= 0x9fff) ||
    (unit >= 0xff01 && unit <= 0xff9f)
  );
}

/** Every offset in `bytes` (4-aligned) where `looksLikeHunter` holds. */
export function findHunters(bytes: Uint8Array): number[] {
  const found: number[] = [];
  for (let o = 0; o + HUNTER_SIZE <= bytes.length; o += 4) {
    // The cheap byte tests first: looksLikeHunter repeats them.
    if (bytes[o + SEX - 1] !== 1 || bytes[o + SEX] > 1 || bytes[o] === 0) continue;
    if (looksLikeHunter(bytes, o)) found.push(o);
  }
  return found;
}

// --- The debugger connection -------------------------------------------------

interface DebuggerMessage {
  event: string;
  ticket?: number;
  message?: string;
  [key: string]: unknown;
}

/** One WebSocket to PPSSPP's debugger, with ticketed requests. */
export class PpssppDebugger {
  private nextTicket = 1;
  private pending = new Map<
    number,
    { resolve: (m: DebuggerMessage) => void; reject: (e: Error) => void }
  >();
  private waiters: { event: string; resolve: (m: DebuggerMessage) => void }[] = [];

  private constructor(private ws: WebSocket) {
    ws.onmessage = (e) => {
      let msg: DebuggerMessage;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.ticket !== undefined && this.pending.has(msg.ticket)) {
        const p = this.pending.get(msg.ticket)!;
        this.pending.delete(msg.ticket);
        if (msg.event === "error") p.reject(new Error(msg.message ?? "PPSSPP debugger error"));
        else p.resolve(msg);
        return;
      }
      const i = this.waiters.findIndex((w) => w.event === msg.event);
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(msg);
    };
    ws.onclose = () => {
      for (const p of this.pending.values()) p.reject(new Error("PPSSPP closed the connection"));
      this.pending.clear();
    };
  }

  /** Connects to PPSSPP on `port`, or rejects after `timeoutMs`. */
  static open(port: number, timeoutMs = 2000): Promise<PpssppDebugger> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`ws://127.0.0.1:${port}/debugger`);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("timeout"));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new PpssppDebugger(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("unreachable"));
      };
    });
  }

  call(event: string, args: Record<string, unknown> = {}, timeoutMs = 5000) {
    const ticket = this.nextTicket++;
    return new Promise<DebuggerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(ticket);
        reject(new Error(`PPSSPP didn't answer ${event}`));
      }, timeoutMs);
      this.pending.set(ticket, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ event, ticket, ...args }));
    });
  }

  /**
   * Sends `event` with no ticket and waits for PPSSPP to broadcast the event
   * of the same name (`cpu.stepping` and `cpu.resume` answer this way).
   */
  broadcast(event: string, timeoutMs = 3000) {
    return new Promise<DebuggerMessage>((resolve, reject) => {
      const waiter = {
        event,
        resolve: (m: DebuggerMessage) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`PPSSPP didn't answer ${event}`));
      }, timeoutMs);
      this.waiters.push(waiter);
      this.ws.send(JSON.stringify({ event }));
    });
  }

  async read(address: number, size: number): Promise<Uint8Array> {
    const reply = await this.call("memory.read", { address, size });
    const binary = atob(String(reply.base64 ?? ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length !== size) throw new Error("PPSSPP returned a short read");
    return bytes;
  }

  close() {
    this.ws.close(1000);
  }
}

// --- Finding PPSSPP and reading the hunter -----------------------------------

/**
 * Ports PPSSPP instances on this network have announced to PPSSPP's own
 * discovery list (what its web debugger uses to find them). PPSSPP keeps its
 * port between runs, so this is only needed until one connects. The list
 * matches by public IP, so it comes back empty through iCloud Private Relay
 * (Safari's requests arrive from a relay address): the port is typed in then.
 */
export async function discoverPorts(timeoutMs = 4000): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://report.ppsspp.org/match/list", {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!res.ok) return [];
    const list = (await res.json()) as { p?: unknown }[];
    const ports = list.map((e) => Number(e.p)).filter((p) => Number.isInteger(p) && p > 0);
    return [...new Set(ports)];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Connects to the first of `ports` that answers, trying them in order. */
export async function connectFirst(
  ports: number[],
): Promise<{ debugger: PpssppDebugger; port: number } | null> {
  for (const port of [...new Set(ports)]) {
    try {
      return { debugger: await PpssppDebugger.open(port), port };
    } catch {
      // Not this one.
    }
  }
  return null;
}

export type LiveRead =
  | { kind: "noGame" }
  | { kind: "otherGame"; gameId: string; title: string }
  | { kind: "noHunter"; gameId: string }
  | {
      kind: "hunter";
      gameId: string;
      region: "us" | "jp";
      address: number;
      block: ArrayBuffer;
    };

const MHFU_TITLE = /monster hunter|モンスターハンター|MHP2|freedom unite/i;

/**
 * Reads the loaded hunter from PPSSPP. `known` adds addresses found by
 * earlier scans (by game ID); `scan` allows a search of user memory when
 * the game's address isn't known or doesn't hold a hunter.
 */
export async function readLiveHunter(
  dbg: PpssppDebugger,
  { known = {}, scan = false }: { known?: Record<string, number>; scan?: boolean } = {},
): Promise<LiveRead> {
  const status = await dbg.call("game.status");
  const game = status.game as { id?: string; title?: string } | null | undefined;
  if (!game?.id) return { kind: "noGame" };
  const gameId = game.id;
  const address = HUNTER_ADDRESSES[gameId] ?? known[gameId];
  if (address === undefined && !MHFU_TITLE.test(game.title ?? "")) {
    return { kind: "otherGame", gameId, title: game.title ?? gameId };
  }

  return withPause(dbg, async () => {
    if (address !== undefined) {
      const block = await dbg.read(address, HUNTER_SIZE);
      if (looksLikeHunter(block)) return hunter(gameId, address, block);
    }
    if (!scan) return { kind: "noHunter", gameId };
    const found = await scanForHunter(dbg);
    return found ? hunter(gameId, found.address, found.block) : { kind: "noHunter", gameId };
  });
}

function hunter(gameId: string, address: number, block: Uint8Array): LiveRead {
  return {
    kind: "hunter",
    gameId,
    region: regionForGame(gameId),
    address,
    block: block.buffer.slice(block.byteOffset, block.byteOffset + block.byteLength) as ArrayBuffer,
  };
}

async function scanForHunter(dbg: PpssppDebugger) {
  const memory = new Uint8Array(USER_MEMORY.end - USER_MEMORY.start);
  for (let at = USER_MEMORY.start; at < USER_MEMORY.end; at += SCAN_CHUNK) {
    memory.set(await dbg.read(at, SCAN_CHUNK), at - USER_MEMORY.start);
  }
  const [offset] = findHunters(memory);
  if (offset === undefined) return null;
  return { address: USER_MEMORY.start + offset, block: memory.slice(offset, offset + HUNTER_SIZE) };
}

/**
 * Runs `fn` with the emulated CPU stopped, unless it already was (the
 * debugger or the user paused it): then it is left as it was.
 */
async function withPause<T>(dbg: PpssppDebugger, fn: () => Promise<T>): Promise<T> {
  const cpu = await dbg.call("cpu.status");
  const stopped = Boolean(cpu.stepping) || Boolean(cpu.paused);
  if (!stopped) await dbg.broadcast("cpu.stepping");
  try {
    return await fn();
  } finally {
    if (!stopped) await dbg.broadcast("cpu.resume");
  }
}
