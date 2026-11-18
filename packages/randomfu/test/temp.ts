/**
 * Temp folders for tests, removed when the test process ends. Each test file
 * runs in its own process, and a run writes a few hundred megabytes of discs.
 * Set KEEP_TEST_DISCS=1 to keep them for inspection; the paths are printed.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const keep = process.env.KEEP_TEST_DISCS === "1";
const tempDirs: string[] = [];

function cleanUp(): void {
  if (keep) {
    for (const dir of tempDirs) console.error(`kept ${dir}`);
    return;
  }
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
}

process.on("exit", cleanUp);
// A signal ends the process without "exit": clean up, then die by it as usual.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    cleanUp();
    process.kill(process.pid, signal);
  });
}

/** A new directory under the system's temp folder, removed when the process ends. */
export function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "randomfu-test-"));
  tempDirs.push(dir);
  return dir;
}
