/**
 * `eboot-info`: what the disc's EBOOT is and what in-process decryption
 * makes of it, for when it doesn't give the EBOOT the tables expect. With a
 * PPSSPP dump, also where the two differ. Prints facts about the files only
 * (sizes, hashes, offsets), never their contents.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { decryptPrxDetailed, isPspModule } from "mhfu-extract/src/container/prx.js";
import { detectRegion, parseSfo } from "mhfu-extract/src/container/sfo.js";
import { EU_ALL_SIGNATURES } from "mhfu-extract/src/tables/eu-signatures.js";
import { SignatureResolver } from "mhfu-extract/src/tables/resolver.js";
import { EBOOT_PATH } from "./game/load.js";

const hex = (n: number) => `0x${n.toString(16)}`;
const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");

/** How many of the EU table signatures are found exactly once. */
function signatureReport(elf: Buffer): string {
  const resolver = new SignatureResolver(EU_ALL_SIGNATURES);
  const names = Object.keys(EU_ALL_SIGNATURES);
  const missing: string[] = [];
  for (const name of names) {
    try {
      resolver.resolve(name, elf);
    } catch {
      missing.push(name);
    }
  }
  return missing.length === 0
    ? `all ${names.length} EU table signatures found`
    : `${names.length - missing.length}/${names.length} EU table signatures found; missing: ${missing.join(", ")}`;
}

function describeElf(label: string, elf: Buffer): string[] {
  const isElf = elf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  const lines = [
    `${label}: ${elf.length} bytes, sha1 ${sha1(elf)}, ${isElf ? "ELF" : "not an ELF"}`,
  ];
  if (isElf) {
    lines.push(
      `  ELF entry ${hex(elf.readUInt32LE(0x18))}, ${elf.readUInt16LE(0x2c)} program headers at ${hex(elf.readUInt32LE(0x1c))}, ${elf.readUInt16LE(0x30)} sections at ${hex(elf.readUInt32LE(0x20))}`,
    );
  }
  lines.push(`  ${signatureReport(elf)}`);
  return lines;
}

export function ebootInfo(isoPath: string, dumpPath?: string): string[] {
  const lines: string[] = [];
  const { source, iso } = openDiscImage(isoPath);
  let decrypted: Buffer | null = null;
  try {
    const { region, discId } = detectRegion(parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO")));
    lines.push(`Disc: ${discId} (${region})`);
    const raw = iso.readFile(EBOOT_PATH);
    lines.push(`EBOOT.BIN on the disc: ${raw.length} bytes, sha1 ${sha1(raw)}`);
    if (!isPspModule(raw)) {
      lines.push(`  starts with ${raw.subarray(0, 4).toString("hex")}, not ~PSP`);
    } else {
      lines.push(
        `  tag ${hex(raw.readUInt32LE(0xd0))}, attribute ${hex(raw.readUInt16LE(4))}, comp_attribute ${hex(raw.readUInt16LE(6))}, decrypt_mode ${raw[0x7c]}`,
        `  elf_size ${raw.readUInt32LE(0x28)}, psp_size ${raw.readUInt32LE(0x2c)}, comp_size (0xB0) ${raw.readInt32LE(0xb0)}, 0xB4 ${hex(raw.readUInt32LE(0xb4))}`,
      );
      try {
        const { data, type } = decryptPrxDetailed(raw);
        const head = Buffer.from(data.subarray(0, 4)).toString("hex");
        lines.push(`  decrypted as type ${type}: ${data.length} bytes, starting ${head}`);
        decrypted = Buffer.from(data);
        if (data[0] === 0x1f && data[1] === 0x8b) {
          decrypted = gunzipSync(data);
          lines.push(`  gunzipped: ${decrypted.length} bytes`);
        }
        if (decrypted.length !== raw.readUInt32LE(0x28)) {
          lines.push(
            `  NOTE: that's ${decrypted.length - raw.readUInt32LE(0x28)} bytes off the header's elf_size`,
          );
        }
        lines.push(...describeElf("In-process decryption", decrypted));
      } catch (error) {
        lines.push(`  in-process decryption failed: ${(error as Error).message}`);
      }
    }
  } finally {
    source.close();
  }

  if (dumpPath) {
    const dump = readFileSync(dumpPath);
    lines.push(...describeElf("Your dump", dump));
    if (decrypted) {
      const length = Math.min(dump.length, decrypted.length);
      let first = -1;
      let differing = 0;
      for (let i = 0; i < length; i++) {
        if (dump[i] !== decrypted[i]) {
          differing++;
          if (first < 0) first = i;
        }
      }
      lines.push(
        first < 0 && dump.length === decrypted.length
          ? "The dump and in-process decryption are identical."
          : `They differ: ${differing} of the first ${length} bytes${first >= 0 ? `, first at ${hex(first)}` : ""}; lengths ${dump.length} and ${decrypted.length}.`,
      );
    }
  }
  return lines;
}
