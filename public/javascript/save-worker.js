import { decryptGameLayer, decryptPSPLayer } from "./save-cipher.js";

// All multi-byte values are little-endian unless noted.
const CHAR_BASES = [0x001000, 0x06c100, 0x0d7200];

const OFFSETS = {
  HUNTER_NAME: 0x000000, // 24 bytes, UTF-16LE, null-padded (max 12 chars)
  SEX:         0x000012, // uint8: 0 = Male, 1 = Female
  ZENNY:       0x069250, // uint32 LE
  EQUIP_CHEST: 0x0000a8, // 400 slots × 12 bytes; equip type is BIG-endian
  ITEM_CHEST:  0x002f88, // 1000 slots × 4 bytes
  ITEM_POUCH:  0x003f28, // 24 slots × 4 bytes
};

const EQUIP_TYPES = {
  0x0100: "Leggings",
  0x0101: "Helmet",
  0x0102: "Chest",
  0x0103: "Gauntlets",
  0x0104: "Waist",
  0x0105: "Melee Weapon",
  0x0106: "Ranged Weapon",
};

function readName(view, base) {
  const bytes = new Uint8Array(view.buffer, base + OFFSETS.HUNTER_NAME, 24);
  const full = new TextDecoder("utf-16le").decode(bytes);
  const nullIdx = full.indexOf("\0");
  return (nullIdx === -1 ? full : full.slice(0, nullIdx)).trim();
}

function parseEquipSlot(view, offset) {
  const type = view.getUint16(offset, false); // BIG-endian — only field in file that is
  const id   = view.getUint16(offset + 2, true);
  if (type === 0x0000) return null;
  return { type, typeName: EQUIP_TYPES[type] ?? `0x${type.toString(16).padStart(4, "0")}`, id };
}

function parseItemSlot(view, offset) {
  const id  = view.getUint16(offset, true);
  const qty = view.getUint16(offset + 2, true);
  if (id === 0) return null;
  return { id, qty };
}

function parseCharacter(view, charIndex) {
  const base = CHAR_BASES[charIndex];
  // Empty slot: first two name bytes are both 0x00
  if (view.getUint8(base) === 0 && view.getUint8(base + 1) === 0) return null;

  const name  = readName(view, base);
  const sex   = view.getUint8(base + OFFSETS.SEX) === 0 ? "Male" : "Female";
  const zenny = view.getUint32(base + OFFSETS.ZENNY, true);

  const equipCounts = { Leggings: 0, Helmet: 0, Chest: 0, Gauntlets: 0, Waist: 0, "Melee Weapon": 0, "Ranged Weapon": 0 };
  let equipTotal = 0;
  for (let i = 0; i < 400; i++) {
    const slot = parseEquipSlot(view, base + OFFSETS.EQUIP_CHEST + i * 12);
    if (slot) {
      equipTotal++;
      if (slot.typeName in equipCounts) equipCounts[slot.typeName]++;
    }
  }

  const itemChest = [];
  for (let i = 0; i < 1000; i++) {
    const slot = parseItemSlot(view, base + OFFSETS.ITEM_CHEST + i * 4);
    if (slot) itemChest.push(slot);
  }

  const itemPouch = [];
  for (let i = 0; i < 24; i++) {
    const slot = parseItemSlot(view, base + OFFSETS.ITEM_POUCH + i * 4);
    if (slot) itemPouch.push(slot);
  }

  return { name, sex, zenny, equipTotal, equipCounts, itemChest, itemPouch };
}

const ENCRYPTED_SIZE   = 0x16A100; // game-layer only (PPSSPP default)
const DECRYPTED_SIZE   = 0x16A0E8; // plaintext (pre-decrypted export)
const PSP_HARDWARE_SIZE = 0x16A110; // PSP hardware layer still present

self.onmessage = async ({ data: { buffer, region } }) => {
  try {
    let plaintext = buffer;
    let decrypted = false;

    if (buffer.byteLength === PSP_HARDWARE_SIZE) {
      buffer = await decryptPSPLayer(buffer, region ?? "na");
    }

    if (buffer.byteLength !== ENCRYPTED_SIZE && buffer.byteLength !== DECRYPTED_SIZE) {
      throw new Error(
        `Unexpected file size (${buffer.byteLength} bytes). ` +
        `Expected ${ENCRYPTED_SIZE} (encrypted) or ${DECRYPTED_SIZE} (decrypted).`
      );
    }

    try {
      plaintext = await decryptGameLayer(buffer, region ?? "na");
      decrypted = true;
    } catch (e) {
      if (e.message !== "SHA-1 mismatch") throw e;
      // SHA-1 mismatch means no game-layer encryption present — treat as
      // pre-decrypted (e.g. PPSSPP export) and parse as-is.
    }

    const view = new DataView(plaintext);
    const characters = [0, 1, 2].map((i) => parseCharacter(view, i));
    self.postMessage({ ok: true, characters, decrypted });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
