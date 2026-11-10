/**
 * Reads a monster's motions file (`/models/monsters/emNN.motions.bin`, named
 * by its model's `asset.extras.motions`), written by mhfu-extract's
 * `src/models/motion-pack.ts`, which documents the layout; keep the two in
 * step. Plain data here; ModelViewer makes three.js clips of it.
 */

export const MOTIONS_MAGIC = "MHM1";
/** Motion frames per second (mhfu-extract's FRAMES_PER_SECOND). */
export const MOTION_FPS = 60;

export type MotionPath = "translation" | "rotation" | "scale";
const PATHS: MotionPath[] = ["translation", "rotation", "scale"];
/** Fixed-point units of each path's values. */
const UNITS: Record<MotionPath, number> = { translation: 16, rotation: 0x7fff, scale: 256 };

export interface MotionTrack {
  /** Skeleton index; the model's node is `bone_<id>`. */
  bone: number;
  path: MotionPath;
  /** Seconds. */
  times: Float32Array;
  /** 4 (rotation, x y z w) or 3 numbers per key. */
  values: Float32Array;
}

export interface MotionClip {
  /** The game's motion number within each part. */
  slot: number;
  /** Seconds. */
  duration: number;
  /** Whether the game loops it, from `loopStart` (seconds) to the end. */
  loop: boolean;
  loopStart: number;
  tracks: MotionTrack[];
}

/** Parses a decompressed motions file. */
export function parseMotions(bytes: Uint8Array): MotionClip[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const u16 = () => {
    const v = view.getUint16(at, true);
    at += 2;
    return v;
  };
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MOTIONS_MAGIC) throw new Error(`Not a motions file (${JSON.stringify(magic)})`);
  at = 4;

  const clips: MotionClip[] = [];
  for (let c = u16(); c > 0; c--) {
    const slot = u16();
    const frames = u16();
    const loop = u8() === 1;
    const loopStart = u16() / MOTION_FPS;
    const tracks: MotionTrack[] = [];
    for (let t = u16(); t > 0; t--) {
      const bone = u8();
      const path = PATHS[u8()];
      if (!path) throw new Error("Bad motion track path");
      const count = u16();
      tracks.push({
        bone,
        path,
        times: new Float32Array(count),
        values: new Float32Array(count * (path === "rotation" ? 4 : 3)),
      });
    }
    clips.push({ slot, duration: frames / MOTION_FPS, loop, loopStart, tracks });
  }
  const all = clips.flatMap((clip) => clip.tracks);

  // Key frames: deltas from the track's last key, u8 or 255 + u16.
  for (const track of all) {
    let frame = 0;
    for (let k = 0; k < track.times.length; k++) {
      const delta = u8();
      frame += delta === 255 ? u16() : delta;
      track.times[k] = frame / MOTION_FPS;
    }
  }
  // Values: s16 deltas from the track's previous key, wrapping; rotations first.
  const readValues = (track: MotionTrack) => {
    const width = track.path === "rotation" ? 4 : 3;
    const previous = new Array<number>(width).fill(0);
    for (let i = 0; i < track.values.length; i++) {
      const value = (((previous[i % width]! + u16()) & 0xffff) << 16) >> 16;
      previous[i % width] = value;
      track.values[i] = value / UNITS[track.path];
    }
  };
  for (const track of all) if (track.path === "rotation") readValues(track);
  for (const track of all) if (track.path !== "rotation") readValues(track);
  if (at !== bytes.length) throw new Error("Motions file has trailing bytes");
  return clips;
}

/** Fetches and decompresses a motions file. */
export async function fetchMotions(url: string, signal?: AbortSignal): Promise<MotionClip[]> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Motions unavailable (${res.status})`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return parseMotions(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/**
 * Plays motions in place: the shallowest bone with a translation track (the
 * hips) keeps its horizontal bind position, so a charge doesn't carry the
 * monster out of view; its height still moves. `parentOf` gives a bone's
 * parent index, -1 for a root; `bind` its bind translation.
 */
export function inPlace(
  clip: MotionClip,
  parentOf: (bone: number) => number,
  bind: (bone: number) => [number, number, number],
): MotionClip {
  const translated = new Set(
    clip.tracks.filter((t) => t.path === "translation").map((t) => t.bone),
  );
  const hasTranslatedAncestor = (bone: number) => {
    for (let b = parentOf(bone); b >= 0; b = parentOf(b)) if (translated.has(b)) return true;
    return false;
  };
  return {
    ...clip,
    tracks: clip.tracks.map((track) => {
      if (track.path !== "translation" || hasTranslatedAncestor(track.bone)) return track;
      const [x, , z] = bind(track.bone);
      const values = track.values.slice();
      for (let i = 0; i < values.length; i += 3) {
        values[i] = x;
        values[i + 2] = z;
      }
      return { ...track, values };
    }),
  };
}
