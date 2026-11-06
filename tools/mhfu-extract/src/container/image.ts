/** Opens a .iso or .cso disc image, sniffing which one it is by magic bytes. */
import { CsoSource, isCso } from "./cso.js";
import { FileSource, type RandomAccessSource } from "./source.js";
import { Iso9660Reader } from "./iso9660.js";

export function openDiscImage(path: string): { source: RandomAccessSource; iso: Iso9660Reader } {
  const file = new FileSource(path);
  const header = file.read(0, 0x18);
  const source: RandomAccessSource = isCso(header) ? new CsoSource(file) : file;
  return { source, iso: new Iso9660Reader(source) };
}
