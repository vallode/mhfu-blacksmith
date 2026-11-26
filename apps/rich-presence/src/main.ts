/**
 * The companion: reads MHFU from PPSSPP every few seconds and shows it as
 * the player's Discord activity. See the README for running it.
 */
import { parseArgs } from "node:util";
import { connectFirst, discoverPorts, type PpssppDebugger } from "blacksmith/src/lib/ppsspp-link";
import { DiscordIpc, HandshakeError } from "./discord";
import { loadNames } from "./names";
import { iniPaths, knownPorts } from "./ppsspp";
import { activityChanged, buildActivity, type Activity } from "./presence";
import { readGame } from "./read";

const { values } = parseArgs({
  options: {
    "client-id": { type: "string" },
    port: { type: "string", multiple: true },
    ini: { type: "string", multiple: true },
    interval: { type: "string", default: "5" },
    "dry-run": { type: "boolean", default: false },
    once: { type: "boolean", default: false },
    verbose: { type: "boolean", short: "v", default: false },
  },
});

const clientId = values["client-id"] ?? process.env.DISCORD_CLIENT_ID;
const dryRun = values["dry-run"];
if (!clientId && !dryRun) {
  console.error(
    "Give the Discord application's ID: --client-id <id> or DISCORD_CLIENT_ID (or --dry-run to print the presence).",
  );
  process.exit(1);
}
const intervalMs = Math.max(2, Number(values.interval)) * 1000;
const givenPorts = (values.port ?? []).map(Number).filter((p) => p > 0 && p < 65536);
const inis = [...(values.ini ?? []), ...iniPaths()];
const log = (...args: unknown[]) => console.log(new Date().toLocaleTimeString(), ...args);
const debug = (...args: unknown[]) => values.verbose && log(...args);

const names = loadNames();

let ppsspp: { debugger: PpssppDebugger; port: number } | null = null;
let discord: DiscordIpc | null = null;
let shown: Activity | null = null;
let sessionStart: number | null = null;
let lastDiscovery = 0;
const DISCOVERY_INTERVAL = 60_000;

async function findPpsspp() {
  const found = await connectFirst(knownPorts(givenPorts, inis));
  if (found || Date.now() - lastDiscovery < DISCOVERY_INTERVAL) return found;
  lastDiscovery = Date.now();
  return connectFirst(await discoverPorts());
}

async function ensureDiscord(): Promise<DiscordIpc | null> {
  if (discord || dryRun || !clientId) return discord;
  try {
    const ipc = await DiscordIpc.connect(clientId);
    ipc.onClose = () => {
      if (discord === ipc) discord = null;
      shown = null;
      log("Discord went away");
    };
    discord = ipc;
    shown = null;
    log("connected to Discord");
  } catch (e) {
    if (e instanceof HandshakeError) {
      console.error(`Discord refused the client ID: ${e.message}`);
      process.exit(1);
    }
    debug("Discord isn't reachable:", (e as Error).message);
  }
  return discord;
}

async function show(activity: Activity | null) {
  if (!activityChanged(shown, activity)) return;
  if (dryRun) {
    log(activity ? JSON.stringify(activity) : "(presence cleared)");
    shown = activity;
    return;
  }
  const ipc = await ensureDiscord();
  if (!ipc) return;
  try {
    await ipc.setActivity(activity);
    shown = activity;
    log(activity ? `${activity.details ?? ""} | ${activity.state ?? ""}` : "presence cleared");
  } catch (e) {
    log("couldn't set the presence:", (e as Error).message);
  }
}

async function tick() {
  if (!ppsspp) {
    ppsspp = await findPpsspp();
    if (ppsspp) log(`connected to PPSSPP on port ${ppsspp.port}`);
  }
  if (!ppsspp) {
    sessionStart = null;
    await show(null);
    return;
  }
  try {
    const state = await readGame(ppsspp.debugger);
    debug(JSON.stringify(state));
    if (state.kind === "noGame" || state.kind === "otherGame") sessionStart = null;
    else sessionStart ??= Date.now();
    await show(
      buildActivity(state, names, { now: Date.now(), sessionStart: sessionStart ?? Date.now() }),
    );
  } catch (e) {
    log("lost PPSSPP:", (e as Error).message);
    ppsspp.debugger.close();
    ppsspp = null;
    sessionStart = null;
    await show(null);
  }
}

/** The read in progress, if any: quitting waits for it, so a pause it started is resumed. */
let reading: Promise<void> | null = null;

async function quit() {
  const pending = reading;
  if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, 3000))]);
  try {
    if (discord && shown) await discord.setActivity(null);
  } catch {
    // Discord clears it anyway when the connection closes.
  }
  discord?.close();
  ppsspp?.debugger.close();
  process.exit(0);
}
process.on("SIGINT", quit);
process.on("SIGTERM", quit);

function read() {
  reading = tick().finally(() => (reading = null));
  return reading;
}

if (values.once) {
  await read();
  await quit();
} else {
  log(dryRun ? "dry run: printing the presence instead of sending it" : "watching PPSSPP");
  for (;;) {
    await read();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
