/**
 * `node:crypto` for the browser build: the synchronous SHA-1 and SHA-256
 * randomfu needs (quest checksums, seeds), with the same `createHash`
 * interface. Tested against Node's own (test/web-shims.test.ts), since
 * seeds must give the same game everywhere.
 */
import { Buffer } from "buffer";

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** The message padded to whole 64-byte blocks, with its bit length at the end (big-endian). */
function pad(data: Uint8Array): DataView {
  const length = Math.ceil((data.length + 9) / 64) * 64;
  const bytes = new Uint8Array(length);
  bytes.set(data);
  bytes[data.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const bits = data.length * 8;
  view.setUint32(length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(length - 4, bits >>> 0);
  return view;
}

export function sha256(data: Uint8Array): Uint8Array {
  const view = pad(data);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let block = 0; block < view.byteLength; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (hh! + S1 + ch + K256[i]! + w[i]!) >>> 0;
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d! + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i]! + v!) >>> 0));
  }
  const out = new DataView(new ArrayBuffer(32));
  h.forEach((v, i) => out.setUint32(i * 4, v));
  return new Uint8Array(out.buffer);
}

export function sha1(data: Uint8Array): Uint8Array {
  const view = pad(data);
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const w = new Uint32Array(80);
  for (let block = 0; block < view.byteLength; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    let [a, b, c, d, e] = h as unknown as number[];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b! & c!) | (~b! & d!), 0x5a827999]
          : i < 40
            ? [b! ^ c! ^ d!, 0x6ed9eba1]
            : i < 60
              ? [(b! & c!) | (b! & d!) | (c! & d!), 0x8f1bbcdc]
              : [b! ^ c! ^ d!, 0xca62c1d6];
      const t = (rotl(a!, 5) + f + e! + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b!, 30) >>> 0;
      b = a;
      a = t;
    }
    [a, b, c, d, e].forEach((v, i) => (h[i] = (h[i]! + v!) >>> 0));
  }
  const out = new DataView(new ArrayBuffer(20));
  h.forEach((v, i) => out.setUint32(i * 4, v));
  return new Uint8Array(out.buffer);
}

class Hash {
  private readonly parts: Buffer[] = [];

  constructor(private readonly algorithm: "sha1" | "sha256") {}

  update(data: string | Uint8Array, encoding?: BufferEncoding): this {
    this.parts.push(
      typeof data === "string" ? Buffer.from(data, encoding ?? "utf8") : Buffer.from(data),
    );
    return this;
  }

  digest(): Buffer;
  digest(encoding: BufferEncoding): string;
  digest(encoding?: BufferEncoding): Buffer | string {
    const data = Buffer.concat(this.parts);
    const out = Buffer.from(this.algorithm === "sha1" ? sha1(data) : sha256(data));
    return encoding ? out.toString(encoding) : out;
  }
}

export function createHash(algorithm: string): Hash {
  if (algorithm !== "sha1" && algorithm !== "sha256") {
    throw new Error(`The browser build only has sha1 and sha256, not ${algorithm}`);
  }
  return new Hash(algorithm);
}

export function randomBytes(size: number): Buffer {
  const out = new Uint8Array(size);
  globalThis.crypto.getRandomValues(out);
  return Buffer.from(out);
}
