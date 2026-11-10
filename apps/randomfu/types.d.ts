/** Text files the build embeds (esbuild's text loader). */
declare module "*.csv" {
  const text: string;
  export default text;
}
declare module "*.enum" {
  const text: string;
  export default text;
}

/** Synchronous file reads, available in workers. */
declare class FileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer;
}
