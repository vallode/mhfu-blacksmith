/**
 * The settings page: a small local web server (Node's own `http`, no
 * dependencies) serving `page.html` and a JSON API over the same code the
 * CLI uses.
 *
 * It only listens on 127.0.0.1. Every API call must carry the random token
 * printed with the URL, and every request must name this server in its
 * Host header, so other websites open in the same browser can't drive it
 * (including through DNS rebinding). One randomizer run at a time.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { randomSeed } from "../rng.js";
import { checkDisc, defaultSpoilerPath, runRandomizer } from "../run.js";
import {
  OPTIONS,
  PRESETS,
  SettingsError,
  actionsOf,
  applySettings,
  decodeSettings,
  defaultSettings,
  encodeSettings,
  settingsFromJson,
  settingsToJson,
  type Settings,
} from "../settings.js";
import { LOGIC_VERSION } from "../version.js";

const PAGE = fileURLToPath(new URL("./page.html", import.meta.url));
const MAX_BODY = 1024 * 1024;

export interface GuiOptions {
  /** 0 picks a free port. */
  port: number;
  /** Open the page in the default browser. */
  open: boolean;
  /** Messages for the terminal. */
  log?: (line: string) => void;
}

export interface Gui {
  url: string;
  token: string;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "Request too large"));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Body isn't valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function str(body: Record<string, unknown>, key: string, required = true): string {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `Missing ${key}`);
    return "";
  }
  if (typeof value !== "string") throw new HttpError(400, `${key} must be a string`);
  return value.trim();
}

/** Settings sent by the page: every option, checked like a settings file. */
function settingsFrom(body: Record<string, unknown>): Settings {
  const raw = asObject(body.settings);
  const seed = typeof raw.seed === "string" && raw.seed.trim() ? raw.seed : randomSeed();
  return applySettings(defaultSettings(seed), { ...raw, seed });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // No browser to open; the URL is printed anyway.
  }
}

export async function startGui(options: GuiOptions): Promise<Gui> {
  const log = options.log ?? ((line: string) => console.log(line));
  const token = randomBytes(16).toString("hex");
  let running = false;
  let port = 0;

  const handleApi = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    route: string,
  ): Promise<void> => {
    if (req.headers["x-randomfu-token"] !== token) throw new HttpError(403, "Bad or missing token");
    if (req.method === "GET" && route === "/api/schema") {
      return sendJson(res, 200, {
        options: OPTIONS,
        // Each with what it does: shuffle, randomize or both.
        presets: PRESETS.map((preset) => ({
          ...preset,
          actions: [
            ...new Set(actionsOf(applySettings(defaultSettings("-"), preset.changes)).values()),
          ].sort(),
        })),
        defaults: defaultSettings(randomSeed()),
        logicVersion: LOGIC_VERSION,
      });
    }
    if (req.method === "GET" && route === "/api/seed") {
      return sendJson(res, 200, { seed: randomSeed() });
    }
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const body = asObject(await readBody(req));

    switch (route) {
      case "/api/settings/encode": {
        const settings = settingsFrom(body);
        return sendJson(res, 200, {
          settings,
          string: encodeSettings(settings),
          json: settingsToJson(settings),
        });
      }
      case "/api/settings/decode": {
        const { settings, version } = decodeSettings(str(body, "string"));
        return sendJson(res, 200, {
          settings,
          warning:
            version === LOGIC_VERSION
              ? null
              : `Made with logic v${version}; this is v${LOGIC_VERSION}, so the same seed gives a different game.`,
        });
      }
      case "/api/settings/import": {
        const settings = settingsFromJson(str(body, "json"), randomSeed());
        return sendJson(res, 200, { settings });
      }
      case "/api/check": {
        const iso = str(body, "iso");
        try {
          const result = checkDisc(iso);
          return sendJson(res, 200, result);
        } catch (error) {
          throw new HttpError(400, `Couldn't read ${iso}: ${(error as Error).message}`);
        }
      }
      case "/api/randomize": {
        const settings = settingsFrom(body);
        const iso = str(body, "iso");
        const dryRun = body.dryRun === true;
        const out = dryRun ? null : str(body, "out");
        if (running) throw new HttpError(409, "A run is already going");
        running = true;
        // Stream log lines, then one final "@@" line with the result.
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        const line = (text: string) => res.write(`${text}\n`);
        try {
          const result = await runRandomizer(
            {
              iso,
              out,
              settings,
              force: body.force === true,
              spoiler: out ? defaultSpoilerPath(out) : undefined,
            },
            line,
          );
          line(`@@DONE ${JSON.stringify(result)}`);
        } catch (error) {
          line(`@@ERROR ${(error as Error).message}`);
        } finally {
          running = false;
          res.end();
        }
        return;
      }
      default:
        throw new HttpError(404, "Not found");
    }
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const host = req.headers.host ?? "";
        if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
          throw new HttpError(421, "Wrong host");
        }
        const route = new URL(req.url ?? "/", `http://${host}`).pathname;
        if (route.startsWith("/api/")) return await handleApi(req, res, route);
        if (req.method === "GET" && (route === "/" || route === "/index.html")) {
          const page = readFileSync(PAGE, "utf8").replace("__RANDOMFU_TOKEN__", token);
          res.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy":
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            "x-frame-options": "DENY",
          });
          return res.end(page);
        }
        throw new HttpError(404, "Not found");
      } catch (error) {
        if (res.headersSent) return res.end();
        const status =
          error instanceof HttpError ? error.status : error instanceof SettingsError ? 400 : 500;
        sendJson(res, status, { error: (error as Error).message });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/`;
  log(`randomfu settings page: ${url}`);
  log("Keep this running while you use the page; press Ctrl+C to stop.");
  if (options.open) openBrowser(url);

  return {
    url,
    token,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
