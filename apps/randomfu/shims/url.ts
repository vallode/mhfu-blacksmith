/** `node:url` for the browser build. */
export function fileURLToPath(url: string | URL): string {
  return new URL(String(url)).pathname;
}
export function pathToFileURL(path: string): URL {
  return new URL(`file://${path}`);
}
