/**
 * Discord's local RPC over IPC: the socket (a named pipe on Windows) the
 * desktop client opens for rich presence. Each frame is an 8-byte header
 * (u32 LE opcode, u32 LE length) and that many bytes of JSON.
 */
import { randomUUID } from "node:crypto";
import net from "node:net";
import path from "node:path";

export const OP = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const;

export function encodeFrame(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export interface Frame {
  op: number;
  data: Record<string, unknown>;
}

/** Splits a byte stream into frames, holding a partial one until the rest arrives. */
export class FrameDecoder {
  private pending = Buffer.alloc(0);

  push(chunk: Buffer): Frame[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const frames: Frame[] = [];
    while (this.pending.length >= 8) {
      const length = this.pending.readUInt32LE(4);
      if (this.pending.length < 8 + length) break;
      const op = this.pending.readUInt32LE(0);
      const body = this.pending.subarray(8, 8 + length).toString("utf8");
      this.pending = this.pending.subarray(8 + length);
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(body) as Record<string, unknown>;
      } catch {
        // Not JSON: keep the op, drop the body.
      }
      frames.push({ op, data });
    }
    return frames;
  }
}

/**
 * Where the desktop client may be listening, in the order Discord's own SDKs
 * try them: `discord-ipc-0` to `-9`, in the runtime or temp directory (and the
 * Flatpak and Snap sandboxes' on Linux), or as named pipes on Windows.
 */
export function ipcPaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const ids = Array.from({ length: 10 }, (_, i) => `discord-ipc-${i}`);
  if (platform === "win32") return ids.map((id) => `\\\\?\\pipe\\${id}`);
  const base = (env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || "/tmp").replace(
    /\/$/,
    "",
  );
  const dirs = [base];
  if (platform === "linux") {
    dirs.push(
      path.posix.join(base, "app/com.discordapp.Discord"),
      path.posix.join(base, "snap.discord"),
    );
  }
  return dirs.flatMap((dir) => ids.map((id) => path.posix.join(dir, id)));
}

/** One connection to the Discord client, after a successful handshake. */
export class DiscordIpc {
  private decoder = new FrameDecoder();
  private replies = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private closed = false;
  /** Called once when the client goes away (Discord quit or restarted). */
  onClose: () => void = () => {};

  private constructor(private socket: net.Socket) {
    socket.on("data", (chunk) => {
      for (const frame of this.decoder.push(chunk)) this.handle(frame);
    });
    socket.on("close", () => this.shutdown(new Error("Discord closed the connection")));
    socket.on("error", (e) => this.shutdown(e));
  }

  /** Connects to the first Discord client that answers the handshake for `clientId`. */
  static async connect(clientId: string, paths = ipcPaths()): Promise<DiscordIpc> {
    let last: Error = new Error("Discord isn't running");
    for (const at of paths) {
      try {
        const socket = await openSocket(at);
        const ipc = new DiscordIpc(socket);
        await ipc.handshake(clientId);
        return ipc;
      } catch (e) {
        if (e instanceof HandshakeError) throw e;
        last = e as Error;
      }
    }
    throw last;
  }

  private handshake(clientId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Discord didn't answer the handshake")),
        5000,
      );
      this.replies.set("READY", {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.socket.write(encodeFrame(OP.handshake, { v: 1, client_id: clientId }));
    });
  }

  private handle({ op, data }: Frame) {
    if (op === OP.ping) {
      this.socket.write(encodeFrame(OP.pong, data));
      return;
    }
    if (op === OP.close) {
      // A refused handshake (a wrong client ID) ends here.
      const error = new HandshakeError(String(data.message ?? "Discord refused the connection"));
      this.replies.get("READY")?.reject(error);
      this.replies.delete("READY");
      this.shutdown(error);
      return;
    }
    if (op !== OP.frame) return;
    const key = data.evt === "READY" ? "READY" : String(data.nonce ?? "");
    const reply = this.replies.get(key);
    if (!reply) return;
    this.replies.delete(key);
    if (data.evt === "ERROR") {
      const message = (data.data as { message?: string } | undefined)?.message;
      reply.reject(new Error(message ?? "Discord returned an error"));
    } else {
      reply.resolve();
    }
  }

  /** Sets this app's activity, or clears it with null. */
  setActivity(activity: object | null): Promise<void> {
    if (this.closed) return Promise.reject(new Error("not connected to Discord"));
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.replies.delete(nonce);
        reject(new Error("Discord didn't answer SET_ACTIVITY"));
      }, 5000);
      this.replies.set(nonce, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      const args = activity ? { pid: process.pid, activity } : { pid: process.pid };
      this.socket.write(encodeFrame(OP.frame, { cmd: "SET_ACTIVITY", args, nonce }));
    });
  }

  close() {
    if (this.closed) return;
    this.socket.end(encodeFrame(OP.close, {}));
    this.shutdown(new Error("closed"));
  }

  private shutdown(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const reply of this.replies.values()) reply.reject(error);
    this.replies.clear();
    this.socket.destroy();
    this.onClose();
  }
}

/** Discord refused the client ID: trying other sockets won't help. */
export class HandshakeError extends Error {}

function openSocket(at: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(at);
    socket.once("connect", () => {
      socket.removeAllListeners("error");
      resolve(socket);
    });
    socket.once("error", reject);
  });
}
