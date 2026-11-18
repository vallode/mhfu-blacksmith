/** WebAssembly imports: wrangler compiles them into modules (Workers can't compile them at runtime). */
declare module "*.wasm" {
  const compiled: WebAssembly.Module;
  export default compiled;
}
