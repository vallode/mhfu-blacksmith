/**
 * Finding PPSSPP's remote debugger. PPSSPP picks its port the first time the
 * debugger starts and keeps it in ppsspp.ini (`RemoteISOPort`), so reading
 * the ini finds it without a scan. PPSSPP's own discovery list (what the
 * site uses) is the fallback, in main.ts.
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Where PPSSPP keeps ppsspp.ini on this system. */
export function iniPaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string[] {
  const system = (root: string) => path.join(root, "PSP", "SYSTEM", "ppsspp.ini");
  if (platform === "win32") {
    // The installer's default; a portable copy keeps memstick/ next to the exe (pass --ini).
    return [system(path.join(env.USERPROFILE ?? home, "Documents", "PPSSPP"))];
  }
  const config = env.XDG_CONFIG_HOME || path.join(home, ".config");
  return [system(path.join(config, "ppsspp"))];
}

/** The debugger port ppsspp.ini records, or null if it has none yet. */
export function portFromIni(text: string): number | null {
  const match = /^\s*RemoteISOPort\s*=\s*(\d+)\s*$/m.exec(text);
  const port = match ? Number(match[1]) : 0;
  return port > 0 && port < 65536 ? port : null;
}

/** Ports to try, best first: the ones given, then ppsspp.ini's. */
export function knownPorts(given: number[], inis: string[]): number[] {
  const ports = [...given];
  for (const ini of inis) {
    try {
      const port = portFromIni(readFileSync(ini, "utf8"));
      if (port) ports.push(port);
    } catch {
      // No ini there.
    }
  }
  return [...new Set(ports)];
}
