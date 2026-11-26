import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { iniPaths, knownPorts, portFromIni } from "../src/ppsspp";

test("the debugger port from ppsspp.ini", () => {
  assert.equal(portFromIni("[Network]\nRemoteISOPort = 58369\nLastRemoteISOPort = 0\n"), 58369);
  assert.equal(portFromIni("RemoteISOPort = 0\n"), null);
  assert.equal(portFromIni("LastRemoteISOPort = 1234\n"), null);
  assert.equal(portFromIni(""), null);
});

test("where ppsspp.ini lives", () => {
  assert.deepEqual(iniPaths("darwin", {}, "/Users/a"), [
    "/Users/a/.config/ppsspp/PSP/SYSTEM/ppsspp.ini",
  ]);
  assert.deepEqual(iniPaths("linux", { XDG_CONFIG_HOME: "/c" }, "/home/a"), [
    "/c/ppsspp/PSP/SYSTEM/ppsspp.ini",
  ]);
  assert.equal(
    iniPaths("win32", { USERPROFILE: "C:\\Users\\a" }, "C:\\Users\\a")[0]!.replaceAll("\\", "/"),
    "C:/Users/a/Documents/PPSSPP/PSP/SYSTEM/ppsspp.ini",
  );
});

test("ports given first, then each ini's, without repeats", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rich-presence-"));
  try {
    const ini = path.join(dir, "ppsspp.ini");
    writeFileSync(ini, "RemoteISOPort = 50000\n");
    assert.deepEqual(
      knownPorts([51000, 50000], [ini, path.join(dir, "missing.ini")]),
      [51000, 50000],
    );
    assert.deepEqual(knownPorts([], [ini]), [50000]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
