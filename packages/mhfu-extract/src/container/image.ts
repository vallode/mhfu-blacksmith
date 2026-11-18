/** Opens a disc image (.iso) for reading. */
import { FileSource, type RandomAccessSource } from "./source.js";
import { Iso9660Reader } from "./iso9660.js";

export function openDiscImage(path: string): { source: RandomAccessSource; iso: Iso9660Reader } {
  const source = new FileSource(path);
  return { source, iso: new Iso9660Reader(source) };
}
