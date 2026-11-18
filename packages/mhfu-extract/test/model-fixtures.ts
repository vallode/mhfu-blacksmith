/** Model file builders shared by the model tests. */

/** A `.pac` package of the given entries; an empty entry is an unused (0, 0) slot. */
export function pac(entries: Buffer[]): Buffer {
  const header = Buffer.alloc(4 + entries.length * 8);
  header.writeUInt32LE(entries.length, 0);
  let offset = header.length;
  entries.forEach((entry, i) => {
    if (entry.length === 0) return;
    header.writeUInt32LE(offset, 4 + i * 8);
    header.writeUInt32LE(entry.length, 8 + i * 8);
    offset += entry.length;
  });
  return Buffer.concat([header, ...entries]);
}

/** An indexed 4-vertex triangle strip (s16 positions, u8 indices). */
export function stripDisplayList(clockwise: boolean): Buffer {
  const commands = [
    0x12000000 | (2 << 7) | (1 << 11),
    0x01000000 | 0x20,
    0x02000000 | 0x38,
    0x9b000000 | (clockwise ? 1 : 0),
    0x04040004,
    0x0b000000,
  ];
  const list = Buffer.alloc(0x40);
  commands.forEach((c, i) => list.writeUInt32LE(c >>> 0, i * 4));
  const positions = [
    [0, 0, 0],
    [0x7fff, 0, 0],
    [0, 0x7fff, 0],
    [0x7fff, 0x7fff, 0],
  ];
  positions.forEach((p, i) => p.forEach((v, k) => list.writeInt16LE(v, 0x20 + i * 6 + k * 2)));
  list.set([0, 1, 2, 3], 0x38);
  return list;
}

/** A one-mesh PMO with two vertex groups drawing `list`, on materials 1 and 0. */
export function pmo(list: Buffer = stripDisplayList(false)): Buffer {
  const buf = Buffer.alloc(0x100 + list.length);
  buf.write("pmo\x001.0\x00", 0, "latin1");
  buf.writeUInt32LE(buf.length, 0x08);
  buf.writeFloatLE(2, 0x0c);
  [2, 4, 8].forEach((s, i) => buf.writeFloatLE(s, 0x10 + i * 4));
  buf.writeUInt16LE(1, 0x1c); // meshes
  buf.writeUInt16LE(2, 0x1e); // materials
  buf.writeUInt32LE(0x40, 0x20); // mesh table
  buf.writeUInt32LE(0x60, 0x24); // vertex groups
  buf.writeUInt32LE(0x80, 0x28); // material map
  buf.writeUInt32LE(0x90, 0x2c);
  buf.writeUInt32LE(0x90, 0x30); // materials
  buf.writeUInt32LE(0x100, 0x34); // display lists
  buf.writeFloatLE(1, 0x40);
  buf.writeFloatLE(1, 0x44);
  buf.writeUInt16LE(0, 0x52); // material slot base
  buf.writeUInt16LE(2, 0x54); // group count
  buf.writeUInt16LE(0, 0x56); // first group
  buf.writeUInt8(0, 0x60); // group 0 -> slot 0
  buf.writeUInt8(1, 0x70); // group 1 -> slot 1
  buf.set([1, 0], 0x80); // slot 0 -> material 1, slot 1 -> material 0
  buf.writeUInt32LE(0xffffffff, 0x90);
  buf.writeUInt32LE(3, 0x98); // material 0 texture 3
  buf.writeUInt32LE(5, 0xa8); // material 1 texture 5
  list.copy(buf, 0x100);
  return buf;
}
