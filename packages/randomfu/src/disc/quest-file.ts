/**
 * Opening and re-sealing quest files (`mission_jpn/m#####.mib`).
 *
 * On top of DATA.BIN's own encryption, each quest is XOR-ciphered with a
 * keystream from four seeds stored at its start, and carries its size and a
 * salted SHA1 of its contents (`mhfu-extract/src/quests/mib.ts`). Re-sealing
 * keeps the original seeds and re-encrypts the whole entry, sector padding
 * included, so an unchanged quest comes back byte for byte.
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
  /** The DATA.BIN entry with `payload` in place of the original contents. */
  seal(payload: Buffer): Buffer;
}

export function openQuestFile(entry: Buffer, region: Region): QuestFile {
  const payload = decryptQuest(entry, region); // verifies the size and hash
  const seeds = [0, 2, 4, 6].map((o) => entry.readUInt16LE(o)) as [number, number, number, number];
  const body = decryptQuestBlock(entry);
  return {
    payload,
    seal(next: Buffer): Buffer {
      if (next.length !== payload.length) {
        throw new Error(
          `quest would change size (${payload.length} -> ${next.length} bytes); only same-size edits are supported`,
        );
      }
      const nextBody = Buffer.from(body);
      questHash(next, region).copy(nextBody, 4);
      next.copy(nextBody, HEADER_SIZE);
      return encryptQuestBlock(nextBody, seeds);
    },
  };
}
