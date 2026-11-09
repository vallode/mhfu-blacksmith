/**
 * Seeded random numbers. The same seed always gives the same output, on any
 * machine, so a seed plus settings fully describes a randomized game.
 *
 * xoshiro128** seeded from SHA-256 of the seed string. Each shuffle draws
 * from its own stream (`fork`), so turning one setting on or off doesn't
 * change what the others do with the same seed.
 */
import { createHash } from "node:crypto";

export class Rng {
  private readonly s: Uint32Array;

  constructor(readonly seed: string) {
    const digest = createHash("sha256").update(seed, "utf8").digest();
    this.s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) this.s[i] = digest.readUInt32LE(i * 4);
    // xoshiro must not start from all zeros; SHA-256 makes that astronomically unlikely.
    if (this.s.every((w) => w === 0)) this.s[0] = 1;
  }

  /** An independent stream for one part of the randomizer. */
  fork(label: string): Rng {
    return new Rng(`${this.seed}\u0000${label}`);
  }

  /** The next 32 random bits. */
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1]!, 5), 7), 9) >>> 0;
    const t = s[1]! << 9;
    s[2]! ^= s[0]!;
    s[3]! ^= s[1]!;
    s[1]! ^= s[2]!;
    s[0]! ^= s[3]!;
    s[2]! ^= t;
    s[3] = rotl(s[3]!, 11);
    return result;
  }

  /** A uniform number in `[0, 1)`. */
  float(): number {
    return this.nextU32() / 0x100000000;
  }

  /** A uniform integer in `[0, n)`, without modulo bias. */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) throw new RangeError(`int(${n})`);
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      const x = this.nextU32();
      if (x < limit) return x % n;
    }
  }

  /** Shuffles `items` in place (Fisher-Yates) and returns it. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** A short random seed for when the user doesn't give one. */
export function randomSeed(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}
