/** `node:path` for the browser build: the few joins the vendored file lookups do. */
export function join(...parts: string[]): string {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}
export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
export function resolve(...parts: string[]): string {
  return join(...parts);
}
export function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}
export default { join, dirname, resolve, basename };
