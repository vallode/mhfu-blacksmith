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

/** The commit the build was made from (build.mjs), sent with analytics events. */
declare const BUILD_ID: string;

/** The Extras step's gathering-node map preview, filled in by build.mjs. */
declare const NODE_MAP_PREVIEW: {
  /** `images/area-maps/<texture>.png` */
  texture: string;
  /** The picture's width and height, a marker's, and the art's alpha a node must be on. */
  size: number;
  marker: number;
  onArtAlpha: number;
  colors: Record<import("randomfu/src/patches/node-map.js").NodeKind, [number, number, number]>;
  points: import("./node-map-preview.js").PreviewPoint[];
};
