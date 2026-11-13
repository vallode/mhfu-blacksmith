import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, test } from "node:test";
import { startGui, type Gui } from "../src/gui/server.js";
import { buildFixtureDisc, tempDir } from "./fixtures.js";

let gui: Gui;
before(async () => {
  gui = await startGui({ port: 0, open: false, log: () => {} });
});
after(() => gui.close());

async function call(route: string, body?: unknown, token = gui.token): Promise<Response> {
  return fetch(new URL(route, gui.url), {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-randomfu-token": token, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A JSON response body, loosely typed for assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(response: Promise<Response>): Promise<any> {
  return (await response).json();
}

/** A raw request with a chosen Host header (fetch won't let us set it). */
function withHost(host: string): Promise<number> {
  const url = new URL(gui.url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: "/api/schema",
        headers: { host, "x-randomfu-token": gui.token },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("the page loads with its token, and the API needs the token and the right host", async () => {
  const page = await (await fetch(gui.url)).text();
  assert.ok(page.includes(gui.token));
  assert.ok(!page.includes("__RANDOMFU_TOKEN__"));
  assert.equal((await call("/api/schema", undefined, "wrong")).status, 403);
  assert.equal(await withHost("evil.example:80"), 421);
  assert.equal(await withHost(new URL(gui.url).host), 200);
});

test("schema, settings strings and files", async () => {
  const schema = await json(call("/api/schema"));
  assert.ok(schema.options.length > 5);
  assert.ok(schema.presets.some((p: { name: string }) => p.name === "Chaos"));

  const settings = { ...schema.defaults, seed: "GUI", "costs.enabled": true };
  const encoded = await json(call("/api/settings/encode", { settings }));
  const decoded = await json(call("/api/settings/decode", { string: encoded.string }));
  assert.deepEqual(decoded.settings, encoded.settings);
  assert.equal(decoded.warning, null);
  const imported = await json(call("/api/settings/import", { json: encoded.json }));
  assert.deepEqual(imported.settings, encoded.settings);

  const bad = await call("/api/settings/encode", { settings: { ...settings, "costs.spread": 7 } });
  assert.equal(bad.status, 400);
  assert.match((await json(Promise.resolve(bad))).error, /costs.spread/);
});

test("checking files and running the randomizer, with the log streamed", async () => {
  const dir = tempDir();
  const iso = path.join(dir, "disc.iso");
  writeFileSync(iso, buildFixtureDisc());

  const check = await json(call("/api/check", { iso }));
  assert.deepEqual(check, {
    discId: "ULJM05500",
    region: "jp",
    supported: true,
  });
  assert.equal((await call("/api/check", { iso: path.join(dir, "missing.iso") })).status, 400);

  const schema = await json(call("/api/schema"));
  const out = path.join(dir, "out.iso");
  const res = await call("/api/randomize", {
    iso,
    out,
    settings: { ...schema.defaults, seed: "RUN" },
  });
  const text = await res.text();
  assert.match(text, /Seed RUN/);
  const done = text.split("\n").find((l) => l.startsWith("@@DONE "));
  assert.ok(done, text);
  const result = JSON.parse(done.slice(7));
  assert.match(result.spoiler, /randomfu spoiler log/);
  assert.equal(result.spoilerPath, path.join(dir, "out.spoiler.txt"));
  assert.ok(existsSync(out));

  // Again without overwrite: an error line, not a crash; the existing output stays.
  const again = await (
    await call("/api/randomize", { iso, out, settings: { ...schema.defaults } })
  ).text();
  assert.match(again, /@@ERROR .*already exists/);
  assert.ok(existsSync(out));
});
