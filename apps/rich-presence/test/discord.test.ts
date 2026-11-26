import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  DiscordIpc,
  FrameDecoder,
  HandshakeError,
  OP,
  encodeFrame,
  ipcPaths,
} from "../src/discord";

test("frames: an 8-byte header, then JSON", () => {
  const frame = encodeFrame(OP.handshake, { v: 1, client_id: "123" });
  assert.equal(frame.readUInt32LE(0), 0);
  assert.equal(frame.readUInt32LE(4), frame.length - 8);
  assert.deepEqual(JSON.parse(frame.subarray(8).toString()), { v: 1, client_id: "123" });
});

test("the decoder joins frames split across chunks", () => {
  const a = encodeFrame(OP.frame, { evt: "READY" });
  const b = encodeFrame(OP.ping, { n: 1 });
  const both = Buffer.concat([a, b]);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(both.subarray(0, 5)), []);
  assert.deepEqual(decoder.push(both.subarray(5, a.length + 3)), [
    { op: 1, data: { evt: "READY" } },
  ]);
  assert.deepEqual(decoder.push(both.subarray(a.length + 3)), [{ op: 3, data: { n: 1 } }]);
});

test("socket paths by platform", () => {
  assert.equal(
    ipcPaths("darwin", { TMPDIR: "/var/folders/x/T/" })[0],
    "/var/folders/x/T/discord-ipc-0",
  );
  assert.equal(ipcPaths("darwin", {}).length, 10);
  assert.equal(ipcPaths("win32", {})[3], "\\\\?\\pipe\\discord-ipc-3");
  const linux = ipcPaths("linux", { XDG_RUNTIME_DIR: "/run/user/1000" });
  assert.equal(linux.length, 30);
  assert.ok(linux.includes("/run/user/1000/app/com.discordapp.Discord/discord-ipc-0"));
  assert.ok(linux.includes("/run/user/1000/snap.discord/discord-ipc-9"));
});

/** A stand-in for the Discord client on a socket in a temp directory. */
function fakeDiscord(
  onFrame: (op: number, data: Record<string, unknown>, socket: net.Socket) => void,
) {
  const dir = mkdtempSync(path.join(tmpdir(), "rich-presence-"));
  const at = path.join(dir, "discord-ipc-0");
  const server = net.createServer((socket) => {
    const decoder = new FrameDecoder();
    socket.on("error", () => {}); // the client hanging up mid-reply
    socket.on("data", (chunk) => {
      for (const { op, data } of decoder.push(chunk)) onFrame(op, data, socket);
    });
  });
  return new Promise<{ at: string; close: () => void }>((resolve) =>
    server.listen(at, () =>
      resolve({
        at,
        close: () => {
          server.close();
          rmSync(dir, { recursive: true, force: true });
        },
      }),
    ),
  );
}

test("handshake, set and clear the activity", async () => {
  const seen: Record<string, unknown>[] = [];
  const server = await fakeDiscord((op, data, socket) => {
    if (op === OP.handshake) {
      assert.deepEqual(data, { v: 1, client_id: "42" });
      socket.write(encodeFrame(OP.frame, { cmd: "DISPATCH", evt: "READY", data: {} }));
    } else if (op === OP.frame) {
      seen.push(data);
      socket.write(encodeFrame(OP.frame, { cmd: "SET_ACTIVITY", nonce: data.nonce, data: {} }));
    }
  });
  try {
    const ipc = await DiscordIpc.connect("42", [
      path.join(path.dirname(server.at), "missing"),
      server.at,
    ]);
    await ipc.setActivity({ details: "Hunting Tigrex" });
    await ipc.setActivity(null);
    ipc.close();
    assert.equal(seen.length, 2);
    assert.equal(seen[0]!.cmd, "SET_ACTIVITY");
    assert.deepEqual(seen[0]!.args, { pid: process.pid, activity: { details: "Hunting Tigrex" } });
    assert.deepEqual(seen[1]!.args, { pid: process.pid });
  } finally {
    server.close();
  }
});

test("an error reply rejects; a refused client ID is a HandshakeError", async () => {
  const server = await fakeDiscord((op, data, socket) => {
    if (op === OP.handshake && data.client_id === "bad") {
      socket.write(encodeFrame(OP.close, { code: 4000, message: "Invalid Client ID" }));
    } else if (op === OP.handshake) {
      socket.write(encodeFrame(OP.frame, { evt: "READY" }));
    } else if (op === OP.frame) {
      socket.write(
        encodeFrame(OP.frame, { evt: "ERROR", nonce: data.nonce, data: { message: "nope" } }),
      );
    }
  });
  try {
    await assert.rejects(DiscordIpc.connect("bad", [server.at]), HandshakeError);
    const ipc = await DiscordIpc.connect("ok", [server.at]);
    await assert.rejects(ipc.setActivity({ details: "x" }), /nope/);
    ipc.close();
  } finally {
    server.close();
  }
});

test("no Discord: connect rejects", async () => {
  await assert.rejects(DiscordIpc.connect("42", [path.join(tmpdir(), "no-such-discord-ipc")]));
});
