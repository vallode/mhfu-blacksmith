/**
 * Opening and re-sealing quest files (`mission_jpn/m#####.mib`).
 *
 * On top of DATA.BIN's own encryption, each quest is XOR-ciphered with a
 * keystream from four seeds stored at its start, and carries its size and a
 * salted SHA1 of its contents (`mhfu-extract/src/quests/mib.ts`). Re-sealing
 * keeps the original seeds and re-encrypts the whole entry, sector padding
 * included, so an unchanged quest comes back byte for byte.
 *
 * A quest can grow into its sector padding: the size field says how much of
 * the entry is the quest, so a longer payload that still fits the entry's
 * sectors leaves DATA.BIN as it is.
 */
import {
  decryptQuest,
  decryptQuestBlock,
  encryptQuestBlock,
  questHash,
} from "mhfu-extract/src/quests/mib.js";
import type { Region } from "mhfu-extract/src/container/sfo.js";

const HEADER_SIZE = 24; // u32 size + 20-byte SHA1

export interface QuestFile {
  /** The plaintext `.mib`. Edit a copy and pass it to `seal`. */
  payload: Buffer;
  /** The longest payload the entry's sectors hold. */
  capacity: number;
  /** The DATA.BIN entry with `payload` in place of the original contents. */
  seal(payload: Buffer): Buffer;
}

export function openQuestFile(entry: Buffer, region: Region): QuestFile {
  const payload = decryptQuest(entry, region); // verifies the size and hash
  const seeds = [0, 2, 4, 6].map((o) => entry.readUInt16LE(o)) as [number, number, number, number];
  const body = decryptQuestBlock(entry);
  const capacity = body.length - HEADER_SIZE;
  return {
    payload,
    capacity,
    seal(next: Buffer): Buffer {
      if (next.length < payload.length || next.length > capacity) {
        throw new Error(
          `quest would be ${next.length} bytes; it can grow from ${payload.length} to at most ${capacity} (its sectors)`,
        );
      }
      const nextBody = Buffer.from(body);
      nextBody.writeUInt32LE(next.length, 0);
      questHash(next, region).copy(nextBody, 4);
      next.copy(nextBody, HEADER_SIZE);
      return encryptQuestBlock(nextBody, seeds);
    },
  };
}
