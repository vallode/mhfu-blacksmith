// Ported from mhef/psp.py SavedataCipher by Seth VanHeulen (GPLv3).
// Implements the game-layer XOR + substitution + SHA-1 decryption used in
// MHFU / MHP2G save files.

// SavedataCipher._decode_table from the local mhef build (matches MHFUdic_de.bin)
const DECODE_TABLE = new Uint8Array([
   86, 124, 154, 138,  31,  56,  16,  63, 101, 234,  64, 248,  92, 252, 162, 118,
  199,   1, 139, 235, 171, 205, 215,  20, 152, 191, 166,  82, 233, 133, 246,  72,
  137, 156, 126,   6, 122, 230, 143,  26, 176,  29, 105, 244,  62, 172,  77,   4,
   85,  40, 194,  35, 155, 214,  61, 237, 197,  50,   0, 108, 119,  71, 211, 200,
  208,  11, 135, 125, 251, 204, 192,  27, 147,  36, 117, 236, 240,  55, 141, 229,
  132, 220, 243,  76,  68, 123, 209,  12,  73,  65, 186,  30,   9,  13,  34,  17,
  104, 160, 107, 165, 189, 130, 179, 131,  54, 216, 183,   8, 201, 184,   3,  48,
  129, 254,   2, 253, 226, 177,  45,  58,  97, 161,   5,  39, 112,  89, 232, 120,
  151,  46,  21, 249,  43, 218,  25,  51,  24,  78, 127, 157, 187, 225,  32, 219,
  103, 180,  57, 163,  70, 142, 134, 190,  81,  60, 198, 116,  80, 167, 175, 196,
  128, 102, 221, 164, 174,  38,  74, 109,  15, 178,  75,  53,  94,  47,  33,  99,
  100, 228,  14, 168, 206,  42, 224,  41, 145, 150, 115,  22,  67, 181,  98,  90,
   52,  84, 242, 149,  93, 222, 121,  28, 213,  18,  10, 250, 227, 169, 136, 238,
  148, 203,  23, 182, 106, 153,  83, 146,  19, 110, 239,  37, 173, 255, 207, 158,
   49,  69, 202, 140, 144, 210, 170, 188,  91, 159,  96,  79, 114, 111, 223,  88,
    7, 245, 195,  95,  87, 113,  44, 241, 247, 212,  66, 185, 217, 231, 193,  59,
]);

// SavedataCipher key constants
const KEY_DEFAULT  = [0xdfa3, 0x215f];
const KEY_MODIFIER = [0xffef, 0xff8f];

// SHA-1 salts per region (MHP2G_JP uses a distinct salt; NA and EU share one)
const enc = new TextEncoder();
const HASH_SALTS = {
  jp: enc.encode("S)R?Bf8xW3#5h9lGU8wR"),
  na: enc.encode("3Nc94Hq1zOLh8d62Sb69"),
  eu: enc.encode("3Nc94Hq1zOLh8d62Sb69"),
};

function applyDecodeTable(src) {
  const dst = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = DECODE_TABLE[src[i]];
  return dst;
}

// Mirrors DataCipher.decrypt (with SavedataCipher's key constants).
// Operates on uint32 LE words: decode table → XOR keystream.
function xorDecrypt(bytes, seed) {
  let k0 = (seed >>> 16) & 0xffff;
  let k1 =  seed         & 0xffff;
  if (k0 === 0) k0 = KEY_DEFAULT[0];
  if (k1 === 0) k1 = KEY_DEFAULT[1];

  // Work on a copy so as not to mutate the caller's buffer
  const out = new Uint8Array(bytes.length);
  const srcView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dstView = new DataView(out.buffer);

  const wordCount = Math.floor(bytes.length / 4);
  for (let i = 0; i < wordCount; i++) {
    k0 = (k0 * KEY_DEFAULT[0])  % KEY_MODIFIER[0];
    k1 = (k1 * KEY_DEFAULT[1])  % KEY_MODIFIER[1];
    const key = (((k0 << 16) >>> 0) + k1) >>> 0;
    dstView.setUint32(i * 4, srcView.getUint32(i * 4, true) ^ key, true);
  }
  return out;
}

// PSPSavedataCipher constants (MHP2/MHP3 family — same for all NA/EU/JP variants)
const PSP_CIPHER1 = new Uint8Array([112,  68, 163, 174, 239,  93, 165, 242, 133, 127, 242, 214, 148, 245,  54,  59]);
const PSP_CIPHER2 = new Uint8Array([236, 109,  41,  89,  38,  53, 165, 127, 151,  42,  13, 188, 163,  38,  51,   0]);
const PSP_CIPHER3 = new Uint8Array([ 93, 199,  17,  57, 208,  25,  56, 188,   2, 127, 221, 220, 176, 131, 125, 157]);
const PSP_CIPHER4 = new Uint8Array([  3, 179,   2, 232,  95, 243, 129, 177,  59, 141, 170,  42, 144, 255,  94,  97]);
const PSP_KEY_NA  = new Uint8Array([ 74,  31, 243,  89, 174, 182, 239, 248,  28, 168, 203,  35, 188, 165, 123, 179]);
const PSP_KEY_JP  = new Uint8Array([205,  31,  32,  89, 174, 112, 239, 104, 220, 162,  69,  19, 180,  90, 219,  10]);

// AES-CBC decrypt for exact multiples of 16 bytes (no PKCS7 padding in plaintext).
// WebCrypto always requires PKCS7-padded input for decrypt, so we construct a valid
// padding ciphertext block by encrypting 0x10×16 with IV = last ciphertext block.
async function aesCbcDecryptRaw(keyBytes, iv, ciphertext) {
  const aesKey = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["encrypt", "decrypt"]);
  const lastBlock = ciphertext.slice(ciphertext.length - 16);
  const padPlain  = new Uint8Array(16).fill(0x10);
  // E(k, padPlain XOR lastBlock) gives a valid PKCS7 padding ciphertext block
  const encPad = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: lastBlock }, aesKey, padPlain));
  const paddedInput = new Uint8Array(ciphertext.length + 16);
  paddedInput.set(ciphertext);
  paddedInput.set(encPad.slice(0, 16), ciphertext.length);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, paddedInput));
}

/**
 * Strip the PSP hardware encryption layer from a raw MHP2NDG.BIN.
 *
 * Real PSP saves and PPSSPP saves exported with hardware encryption are
 * 0x16A110 bytes. This reduces them to 0x16A100 bytes (game-layer only),
 * which decryptGameLayer can then handle.
 *
 * @param {ArrayBuffer} buffer  Raw 0x16A110-byte save file
 * @param {"na"|"eu"|"jp"} region
 */
export async function decryptPSPLayer(buffer, region) {
  const buff    = new Uint8Array(buffer);
  const pspKey  = region === "jp" ? PSP_KEY_JP : PSP_KEY_NA;
  const IV_ZERO = new Uint8Array(16);

  // Step 1: derive per-save XOR key from the first 16 bytes
  const xorKeyRaw = new Uint8Array(16);
  for (let i = 0; i < 16; i++) xorKeyRaw[i] = buff[i] ^ PSP_CIPHER2[i] ^ pspKey[i];

  // Step 2: AES-CBC-decrypt xorKeyRaw with cipher3, IV=0 → take first 12 bytes
  const xorKeyDec = await aesCbcDecryptRaw(PSP_CIPHER3, IV_ZERO, xorKeyRaw);
  const xorKey = new Uint8Array(12);
  for (let i = 0; i < 12; i++) xorKey[i] = xorKeyDec[i] ^ PSP_CIPHER1[i];

  // Step 3: build keystream blocks — each block is xorKey(12b) + LE counter(4b)
  const blockCount = Math.floor(buff.length / 16) - 1;
  const xorBuff    = new Uint8Array(blockCount * 16);
  const counterView = new DataView(xorBuff.buffer);
  for (let i = 0; i < blockCount; i++) {
    xorBuff.set(xorKey, i * 16);
    counterView.setUint32(i * 16 + 12, i + 1, true); // LE counter starts at 1
  }

  // Step 4: AES-CBC-decrypt xorBuff with cipher4, IV=0
  const xorStream = await aesCbcDecryptRaw(PSP_CIPHER4, IV_ZERO, xorBuff);

  // Step 5: XOR buff[16:] with decrypted keystream
  const result = new Uint8Array(buff.length - 16);
  for (let i = 0; i < result.length; i++) result[i] = buff[16 + i] ^ xorStream[i];

  return result.buffer;
}

/**
 * Attempt game-layer decryption of a raw MHP2NDG.BIN ArrayBuffer.
 *
 * Returns an ArrayBuffer of the plaintext on success.
 * Throws an Error with message "SHA-1 mismatch" if the buffer does not carry
 * game-layer encryption (e.g. it is already decrypted), so callers can fall
 * back gracefully.
 *
 * @param {ArrayBuffer} buffer  Raw file bytes
 * @param {"na"|"eu"|"jp"} region  Game region
 */
export async function decryptGameLayer(buffer, region) {
  const bytes = new Uint8Array(buffer);

  // 1. Extract seed: last 4 bytes, apply decode table twice
  const seedBytes = applyDecodeTable(applyDecodeTable(bytes.slice(-4)));
  const seed = new DataView(seedBytes.buffer).getUint32(0, true);

  // 2. DataCipher.decrypt on body (all but last 4): decode table → XOR
  const body        = bytes.slice(0, -4);
  const afterDecode = applyDecodeTable(body);
  const afterXor    = xorDecrypt(afterDecode, seed);

  // 3. Second decode table pass
  const plaintext = applyDecodeTable(afterXor);

  // 4. SHA-1 verification: plaintext[-20:] must equal SHA-1(plaintext[:-32] + salt)
  //    (The trailing 20 bytes are the hash; the 12 bytes before that are a footer
  //     not included in the hash, matching mhef's buff[:-12] + salt pattern.)
  const hash     = plaintext.slice(-20);
  const content  = plaintext.slice(0, -20);
  const salt     = HASH_SALTS[region] ?? HASH_SALTS.na;

  const toHash = new Uint8Array(content.length - 12 + salt.length);
  toHash.set(content.slice(0, -12));
  toHash.set(salt, content.length - 12);

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", toHash));

  for (let i = 0; i < 20; i++) {
    if (digest[i] !== hash[i]) {
      throw new Error("SHA-1 mismatch");
    }
  }

  return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
}
