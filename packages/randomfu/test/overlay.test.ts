import assert from "node:assert/strict";
import { test } from "node:test";
import { OverlaySource, SECTOR_SIZE } from "../src/disc/image.js";
import { assemble, memorySource } from "./fixtures.js";

test("OverlaySource reads through changed sectors and assembles the image", () => {
  const original = Buffer.alloc(SECTOR_SIZE * 6);
  for (let i = 0; i < original.length; i++) original[i] = i % 251;
  const overlay = new OverlaySource(memorySource(original));

  const expected = Buffer.from(original);
  const write = (offset: number, data: Buffer) => {
    overlay.write(offset, data);
    data.copy(expected, offset);
  };
  write(10, Buffer.from("hello"));
  write(SECTOR_SIZE * 2 - 3, Buffer.alloc(SECTOR_SIZE + 6, 7)); // spans three sectors
  assert.ok(overlay.read(0, original.length).equals(expected));
  assert.ok(
    overlay
      .read(SECTOR_SIZE * 2 - 5, 20)
      .equals(expected.subarray(SECTOR_SIZE * 2 - 5, SECTOR_SIZE * 2 + 15)),
  );
  assert.equal(overlay.changedSectors, 4);
  assert.ok(assemble(overlay.segments(), original).equals(expected));

  // Growing past the end, then truncating.
  overlay.write(original.length + 100, Buffer.from("tail"));
  overlay.truncate(original.length + SECTOR_SIZE);
  const grown = Buffer.concat([expected, Buffer.alloc(SECTOR_SIZE)]);
  Buffer.from("tail").copy(grown, original.length + 100);
  assert.equal(overlay.totalBytes, grown.length);
  assert.ok(assemble(overlay.segments(), original).equals(grown));
  assert.ok(overlay.read(0, grown.length).equals(grown));
  overlay.close();
});
