/**
 * AES-128 in CBC mode with a zero IV and no padding, as the PSP's KIRK
 * engine uses it. Pure TypeScript and synchronous, so it runs the same in
 * Node and in the browser (Web Crypto is async and insists on padding).
 * The usual 32-bit lookup-table form, quick enough for a whole EBOOT.
 * Tested against Node's AES and FIPS-197 (test/prx.test.ts).
 */

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
/** Round tables: SubBytes and MixColumns in one lookup, one per byte position. */
const TE = [0, 1, 2, 3].map(() => new Uint32Array(256));
const TD = [0, 1, 2, 3].map(() => new Uint32Array(256));

/** Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x + 1. */
function mul(a: number, b: number): number {
  let out = 0;
  for (; b; b >>= 1) {
    if (b & 1) out ^= a;
    a = (a << 1) ^ (a & 0x80 ? 0x11b : 0);
  }
  return out;
}

const rotr8 = (w: number) => ((w >>> 8) | (w << 24)) >>> 0;

for (let x = 0; x < 256; x++) {
  // The S-box: each byte's multiplicative inverse, then the affine transform.
  let inv = 0;
  if (x) for (inv = 1; mul(x, inv) !== 1; inv++);
  let s = inv;
  for (let r = 1; r <= 4; r++) s ^= ((inv << r) | (inv >> (8 - r))) & 0xff;
  s ^= 0x63;
  SBOX[x] = s;
  INV_SBOX[s] = x;
}
for (let x = 0; x < 256; x++) {
  const s = SBOX[x]!;
  const i = INV_SBOX[x]!;
  let te = ((mul(s, 2) << 24) | (s << 16) | (s << 8) | mul(s, 3)) >>> 0;
  let td = ((mul(i, 14) << 24) | (mul(i, 9) << 16) | (mul(i, 13) << 8) | mul(i, 11)) >>> 0;
  for (let t = 0; t < 4; t++) {
    TE[t]![x] = te;
    TD[t]![x] = td;
    te = rotr8(te);
    td = rotr8(td);
  }
}
const [TE0, TE1, TE2, TE3] = TE as [Uint32Array, Uint32Array, Uint32Array, Uint32Array];
const [TD0, TD1, TD2, TD3] = TD as [Uint32Array, Uint32Array, Uint32Array, Uint32Array];

/** The 44 round-key words of a 128-bit key. */
function expandKey(key: Uint8Array): Uint32Array {
  if (key.length !== 16) throw new Error("AES-128 needs a 16-byte key");
  const w = new Uint32Array(44);
  for (let i = 0; i < 4; i++) {
    w[i] =
      ((key[4 * i]! << 24) | (key[4 * i + 1]! << 16) | (key[4 * i + 2]! << 8) | key[4 * i + 3]!) >>>
      0;
  }
  let rcon = 1;
  for (let i = 4; i < 44; i++) {
    let t = w[i - 1]!;
    if (i % 4 === 0) {
      t =
        ((SBOX[(t >>> 16) & 255]! << 24) |
          (SBOX[(t >>> 8) & 255]! << 16) |
          (SBOX[t & 255]! << 8) |
          SBOX[t >>> 24]!) ^
        (rcon << 24);
      rcon = mul(rcon, 2);
    }
    w[i] = (w[i - 4]! ^ t) >>> 0;
  }
  return w;
}

/** Decryption round keys: reversed, with InvMixColumns on the inner rounds. */
function decryptionKeys(w: Uint32Array): Uint32Array {
  const d = new Uint32Array(44);
  for (let round = 0; round <= 10; round++) {
    for (let j = 0; j < 4; j++) {
      const k = w[(10 - round) * 4 + j]!;
      d[round * 4 + j] =
        round === 0 || round === 10
          ? k
          : (TD0[SBOX[k >>> 24]!]! ^
              TD1[SBOX[(k >>> 16) & 255]!]! ^
              TD2[SBOX[(k >>> 8) & 255]!]! ^
              TD3[SBOX[k & 255]!]!) >>>
            0;
    }
  }
  return d;
}

const readWord = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

function writeWord(b: Uint8Array, at: number, w: number): void {
  b[at] = w >>> 24;
  b[at + 1] = w >>> 16;
  b[at + 2] = w >>> 8;
  b[at + 3] = w;
}

function checkLength(data: Uint8Array): void {
  if (data.length % 16 !== 0) throw new Error("AES-CBC data must be whole 16-byte blocks");
}

/** AES-128-CBC encryption with a zero IV and no padding. */
export function cbcEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  checkLength(data);
  const k = expandKey(key);
  const out = new Uint8Array(data.length);
  let [p0, p1, p2, p3] = [0, 0, 0, 0];
  for (let at = 0; at < data.length; at += 16) {
    let s0 = (readWord(data, at) ^ p0 ^ k[0]!) >>> 0;
    let s1 = (readWord(data, at + 4) ^ p1 ^ k[1]!) >>> 0;
    let s2 = (readWord(data, at + 8) ^ p2 ^ k[2]!) >>> 0;
    let s3 = (readWord(data, at + 12) ^ p3 ^ k[3]!) >>> 0;
    for (let r = 1; r < 10; r++) {
      const t0 =
        TE0[s0 >>> 24]! ^
        TE1[(s1 >>> 16) & 255]! ^
        TE2[(s2 >>> 8) & 255]! ^
        TE3[s3 & 255]! ^
        k[4 * r]!;
      const t1 =
        TE0[s1 >>> 24]! ^
        TE1[(s2 >>> 16) & 255]! ^
        TE2[(s3 >>> 8) & 255]! ^
        TE3[s0 & 255]! ^
        k[4 * r + 1]!;
      const t2 =
        TE0[s2 >>> 24]! ^
        TE1[(s3 >>> 16) & 255]! ^
        TE2[(s0 >>> 8) & 255]! ^
        TE3[s1 & 255]! ^
        k[4 * r + 2]!;
      const t3 =
        TE0[s3 >>> 24]! ^
        TE1[(s0 >>> 16) & 255]! ^
        TE2[(s1 >>> 8) & 255]! ^
        TE3[s2 & 255]! ^
        k[4 * r + 3]!;
      [s0, s1, s2, s3] = [t0 >>> 0, t1 >>> 0, t2 >>> 0, t3 >>> 0];
    }
    const last = (a: number, b: number, c: number, d: number, rk: number) =>
      (((SBOX[a >>> 24]! << 24) |
        (SBOX[(b >>> 16) & 255]! << 16) |
        (SBOX[(c >>> 8) & 255]! << 8) |
        SBOX[d & 255]!) ^
        rk) >>>
      0;
    p0 = last(s0, s1, s2, s3, k[40]!);
    p1 = last(s1, s2, s3, s0, k[41]!);
    p2 = last(s2, s3, s0, s1, k[42]!);
    p3 = last(s3, s0, s1, s2, k[43]!);
    writeWord(out, at, p0);
    writeWord(out, at + 4, p1);
    writeWord(out, at + 8, p2);
    writeWord(out, at + 12, p3);
  }
  return out;
}

/** AES-128-CBC decryption with a zero IV and no padding. */
export function cbcDecrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  checkLength(data);
  const k = decryptionKeys(expandKey(key));
  const out = new Uint8Array(data.length);
  let [p0, p1, p2, p3] = [0, 0, 0, 0];
  for (let at = 0; at < data.length; at += 16) {
    const c0 = readWord(data, at);
    const c1 = readWord(data, at + 4);
    const c2 = readWord(data, at + 8);
    const c3 = readWord(data, at + 12);
    let s0 = (c0 ^ k[0]!) >>> 0;
    let s1 = (c1 ^ k[1]!) >>> 0;
    let s2 = (c2 ^ k[2]!) >>> 0;
    let s3 = (c3 ^ k[3]!) >>> 0;
    for (let r = 1; r < 10; r++) {
      const t0 =
        TD0[s0 >>> 24]! ^
        TD1[(s3 >>> 16) & 255]! ^
        TD2[(s2 >>> 8) & 255]! ^
        TD3[s1 & 255]! ^
        k[4 * r]!;
      const t1 =
        TD0[s1 >>> 24]! ^
        TD1[(s0 >>> 16) & 255]! ^
        TD2[(s3 >>> 8) & 255]! ^
        TD3[s2 & 255]! ^
        k[4 * r + 1]!;
      const t2 =
        TD0[s2 >>> 24]! ^
        TD1[(s1 >>> 16) & 255]! ^
        TD2[(s0 >>> 8) & 255]! ^
        TD3[s3 & 255]! ^
        k[4 * r + 2]!;
      const t3 =
        TD0[s3 >>> 24]! ^
        TD1[(s2 >>> 16) & 255]! ^
        TD2[(s1 >>> 8) & 255]! ^
        TD3[s0 & 255]! ^
        k[4 * r + 3]!;
      [s0, s1, s2, s3] = [t0 >>> 0, t1 >>> 0, t2 >>> 0, t3 >>> 0];
    }
    const last = (a: number, b: number, c: number, d: number, rk: number) =>
      (((INV_SBOX[a >>> 24]! << 24) |
        (INV_SBOX[(b >>> 16) & 255]! << 16) |
        (INV_SBOX[(c >>> 8) & 255]! << 8) |
        INV_SBOX[d & 255]!) ^
        rk) >>>
      0;
    writeWord(out, at, last(s0, s3, s2, s1, k[40]!) ^ p0);
    writeWord(out, at + 4, last(s1, s0, s3, s2, k[41]!) ^ p1);
    writeWord(out, at + 8, last(s2, s1, s0, s3, k[42]!) ^ p2);
    writeWord(out, at + 12, last(s3, s2, s1, s0, k[43]!) ^ p3);
    [p0, p1, p2, p3] = [c0, c1, c2, c3];
  }
  return out;
}
