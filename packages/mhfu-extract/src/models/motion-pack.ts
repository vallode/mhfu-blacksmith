/**
 * The site's compact motion file (`public/models/monsters/emNN.motions.bin`):
 * a monster's clips (animation.ts) without glTF's per-track JSON, which
 * outweighs the key data itself (Rathian: 841 KB of JSON for 440 KB of
 * keys). The site's viewer turns it into three.js clips on the bones the
 * skinned GLB names `bone_<id>` (apps/blacksmith/src/lib/motions.ts reads
 * it; keep the two in step).
 *
 * gzip of four sections, little-endian, so like data sits together:
 *   1. "MHM1", u16 clip count; per clip: u16 slot, u16 frames, u8 loop,
 *      u16 loop start frame, u16 track count; per track: u8 bone, u8 path
 *      (0 translation, 1 rotation, 2 scale), u16 key count.
 *   2. Key frames, every track's in order: each the frames since the last
 *      key of its track (the first: since 0) as a u8, or 255 then a u16.
 *   3. Rotation keys: s16 x4 (x y z w, /0x7fff) each.
 *   4. Translation and scale keys: s16 x3 each, translation in 1/16 model
 *      units (the source's own), scale in 1/256.
 * Sections 3 and 4 store each component as the change from the track's
 * previous key (the first: from 0), wrapping at 16 bits, which gzip squeezes
 * far better than the values. Frames are at FRAMES_PER_SECOND.
 */
import { gzipSync } from "node:zlib";
import { FRAMES_PER_SECOND, type Clip } from "./animation.js";

export const MOTION_PACK_MAGIC = "MHM1";
const PATHS = ["translation", "rotation", "scale"] as const;
/** Fixed-point units of each path's values. */
const UNITS = { translation: 16, rotation: 0x7fff, scale: 256 } as const;

class Bytes {
  private readonly chunks: Buffer[] = [];
  u8(v: number) {
    this.chunks.push(Buffer.from([v]));
  }
  u16(v: number) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v & 0xffff);
    this.chunks.push(b);
  }
  buffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export function packMotions(clips: readonly Clip[]): Buffer {
  const header = new Bytes();
  const frames = new Bytes();
  const rotations = new Bytes();
  const vectors = new Bytes();
  const frame = (seconds: number) => Math.round(seconds * FRAMES_PER_SECOND);

  header.u16(clips.length);
  for (const clip of clips) {
    header.u16(clip.slot);
    header.u16(frame(clip.duration));
    header.u8(clip.loop ? 1 : 0);
    header.u16(frame(clip.loopStart));
    header.u16(clip.tracks.length);
    for (const track of clip.tracks) {
      header.u8(track.bone);
      header.u8(PATHS.indexOf(track.path));
      header.u16(track.times.length);
      let last = 0;
      for (const t of track.times) {
        const delta = frame(t) - last;
        last += delta;
        if (delta < 255) frames.u8(delta);
        else {
          frames.u8(255);
          frames.u16(delta);
        }
      }
      const width = track.path === "rotation" ? 4 : 3;
      const unit = UNITS[track.path];
      const out = track.path === "rotation" ? rotations : vectors;
      const previous = new Array<number>(width).fill(0);
      track.values.forEach((c, i) => {
        const v = Math.max(-0x8000, Math.min(0x7fff, Math.round(c * unit)));
        out.u16(v - previous[i % width]!);
        previous[i % width] = v;
      });
    }
  }
  const magic = Buffer.from(MOTION_PACK_MAGIC, "latin1");
  return gzipSync(
    Buffer.concat([magic, header.buffer(), frames.buffer(), rotations.buffer(), vectors.buffer()]),
    { level: 9 },
  );
}
