/** FNV-1a (32-bit) over `bytes`, each taken as its low 8 bits. */
export function fnv1a(bytes: Iterable<number>): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ (byte & 0xff), 0x01000193) >>> 0;
  return hash;
}
