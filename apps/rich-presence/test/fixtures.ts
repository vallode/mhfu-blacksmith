/** Game memory as the reader sees it, built byte by byte for the tests. */
import {
  QUEST_HEADER_SIZE,
  QUEST_OFFSET,
  SNAPSHOT_SIZE,
  STAGE_OFFSET,
  WEAPON_OFFSET,
} from "../src/layout";

export /** A snapshot as `readGame` reads it, with a loaded hunter unless `hunter` is false. */
function snapshot({
  stage = 139,
  hunter = true,
  weapon = [0x01, 0x05, 0xd1, 0x01],
  quest = { state: 0, timeLeft: 0, file: 0 },
} = {}) {
  const bytes = new Uint8Array(SNAPSHOT_SIZE);
  const v = new DataView(bytes.buffer);
  v.setUint16(0, stage, true);
  const block = -STAGE_OFFSET;
  if (hunter) {
    [..."Nito"].forEach((c, i) => v.setUint16(block + i * 2, c.charCodeAt(0), true));
    bytes[block + 0x12] = 1;
    bytes.set(weapon, block + WEAPON_OFFSET);
    v.setUint16(block + 0x2f88, 1, true); // one item stack in the box
    v.setUint16(block + 0x2f8a, 5, true);
  }
  const q = QUEST_OFFSET - STAGE_OFFSET;
  v.setUint8(q, quest.state);
  v.setUint32(q + 0x10, quest.timeLeft, true);
  v.setUint32(q + 0x4c, quest.file, true);
  return bytes;
}

/** A quest file's header. */
export function header({ id = 10217, stars = 3, map = 2, type = 4, target = 6, count = 1 } = {}) {
  const bytes = new Uint8Array(QUEST_HEADER_SIZE);
  const v = new DataView(bytes.buffer);
  bytes.set([0x4c, 0, 0, 0, 0x32, 0x4e, 0x44, 0x47]);
  v.setUint32(0x4c, type, true);
  v.setUint32(0x5c, 90000, true);
  v.setUint16(0x64, id, true);
  v.setUint8(0x66, stars);
  v.setUint8(0x68, map);
  v.setUint16(0x70, target, true);
  v.setUint16(0x72, count, true);
  return bytes;
}
