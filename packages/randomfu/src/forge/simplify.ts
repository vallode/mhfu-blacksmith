/**
 * Fewer vertices for a part drawn smaller than its model drew it: a great
 * sword's head shrunk onto dual blades keeps a great sword's detail, which
 * looks finer than the weapon around it and takes room the frame's small
 * file doesn't have.
 *
 * Vertex clustering: vertices in one grid cell, facing the same way, become
 * one at their average, and triangles left with two corners in one cell go.
 * The cell is the part's own median edge over its scale, so edges come out
 * about as long as the source's were. Facing keeps the two sides of a thin
 * blade apart, and a UV bucket the faces drawn from other parts of the
 * texture (merged across them, a hammer's sides smeared); the merged vertex
 * keeps the UV of the one nearest it.
 */
import type { Part, PartChunk, PartStrip, PartVertex, Vec3 } from "./parts.js";

/** Below this scale a part is simplified. */
export const SIMPLIFY_BELOW = 0.8;
/** The cell, in the part's median edges as placed. */
const CELL = 0.8;
/** Kept as it was unless this many fewer vertices come out. */
const WORTH = 0.85;

/** A strip's triangles, each wound as the strip's first (lists, strips, fans). */
export function stripTriangles(strip: PartStrip): [number, number, number][] {
  const { prim, indices: ix } = strip;
  const out: [number, number, number][] = [];
  if (prim === 3) {
    for (let i = 0; i + 2 < ix.length; i += 3) out.push([ix[i]!, ix[i + 1]!, ix[i + 2]!]);
  } else if (prim === 4) {
    for (let i = 0; i + 2 < ix.length; i++) {
      out.push(i % 2 === 0 ? [ix[i]!, ix[i + 1]!, ix[i + 2]!] : [ix[i + 1]!, ix[i]!, ix[i + 2]!]);
    }
  } else if (prim === 5) {
    for (let i = 1; i + 1 < ix.length; i++) out.push([ix[0]!, ix[i]!, ix[i + 1]!]);
  }
  return out;
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Vertices in different squares of the texture this wide (in its widths) don't merge. */
const UV_BUCKET = 1 / 4;

/** The median length of the part's triangle edges. */
function medianEdge(part: Part): number {
  const edges: number[] = [];
  for (const chunk of part.chunks) {
    for (const strip of chunk.strips) {
      for (const t of stripTriangles(strip)) {
        for (let k = 0; k < 3; k++) {
          const a = chunk.vertices[t[k]!]!.position;
          const b = chunk.vertices[t[(k + 1) % 3]!]!.position;
          const d = distance(a, b);
          if (d > 0) edges.push(d);
        }
      }
    }
  }
  edges.sort((a, b) => a - b);
  return edges[edges.length >> 1] ?? 0;
}

/** Which of the six axis directions a normal is nearest. */
const facing = (n: Vec3 | null) => {
  if (!n) return 6;
  let axis = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(n[k]!) > Math.abs(n[axis]!)) axis = k;
  return axis * 2 + (n[axis]! < 0 ? 1 : 0);
};

const strongestBone = (v: PartVertex) => {
  let best = 0;
  v.weights.forEach((w, s) => {
    if (w > (v.weights[best] ?? 0)) best = s;
  });
  return v.bones[best] ?? -1;
};

function clusterChunk(chunk: PartChunk, cell: number): PartChunk {
  const keyOf = chunk.vertices.map((v) =>
    [
      ...v.position.map((c) => Math.floor(c / cell)),
      ...v.uv.map((c) => Math.floor(c / UV_BUCKET)),
      facing(v.normal),
      strongestBone(v),
    ].join(),
  );
  const clusters = new Map<string, number[]>();
  keyOf.forEach((key, i) => {
    const list = clusters.get(key);
    if (list) list.push(i);
    else clusters.set(key, [i]);
  });
  const vertices: PartVertex[] = [];
  const remap = new Map<string, number>();
  const toNew = (i: number) => {
    const key = keyOf[i]!;
    let n = remap.get(key);
    if (n !== undefined) return n;
    const members = clusters.get(key)!.map((m) => chunk.vertices[m]!);
    const position = [0, 1, 2].map(
      (k) => members.reduce((s, v) => s + v.position[k]!, 0) / members.length,
    ) as Vec3;
    const nearest = members.reduce((a, b) =>
      distance(b.position, position) < distance(a.position, position) ? b : a,
    );
    let normal: Vec3 | null = null;
    if (members.every((v) => v.normal)) {
      const sum = [0, 1, 2].map((k) => members.reduce((s, v) => s + v.normal![k]!, 0)) as Vec3;
      const length = Math.hypot(...sum);
      normal = length > 1e-6 ? (sum.map((c) => c / length) as Vec3) : nearest.normal;
    }
    n = vertices.push({ ...nearest, position, normal }) - 1;
    remap.set(key, n);
    return n;
  };
  const byFace = new Map<number, number[]>();
  const seen = new Set<string>();
  for (const strip of chunk.strips) {
    for (const t of stripTriangles(strip)) {
      if (
        keyOf[t[0]] === keyOf[t[1]] ||
        keyOf[t[1]] === keyOf[t[2]] ||
        keyOf[t[0]] === keyOf[t[2]]
      ) {
        continue;
      }
      const [a, b, c] = t.map(toNew) as [number, number, number];
      // One triangle once, whichever corner it starts at.
      const first = Math.min(a, b, c);
      const turned = first === a ? [a, b, c] : first === b ? [b, c, a] : [c, a, b];
      const key = `${strip.frontFace}/${turned.join()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list =
        byFace.get(strip.frontFace) ?? byFace.set(strip.frontFace, []).get(strip.frontFace)!;
      list.push(a, b, c);
    }
  }
  return {
    ...chunk,
    vertices,
    strips: [...byFace].map(([frontFace, indices]) => ({ prim: 3, frontFace, indices })),
  };
}

const cache = new WeakMap<Part, Map<number, Part>>();

/**
 * The part with about the detail it had, once drawn at `scale`: itself at
 * `SIMPLIFY_BELOW` and up, or when clustering would save little.
 */
export function simplified(part: Part, scale: number): Part {
  if (scale >= SIMPLIFY_BELOW) return part;
  // Scales a few percent apart cluster the same.
  const step = Math.round(scale * 40) / 40;
  let byScale = cache.get(part);
  if (!byScale) cache.set(part, (byScale = new Map()));
  const known = byScale.get(step);
  if (known) return known;
  const edge = medianEdge(part);
  let out = part;
  if (edge > 0 && step > 0) {
    // A piece too small to keep a triangle goes.
    const chunks = part.chunks
      .map((c) => clusterChunk(c, (CELL * edge) / step))
      .filter((c) => c.strips.length > 0);
    const before = part.chunks.reduce((n, c) => n + c.vertices.length, 0);
    const after = chunks.reduce((n, c) => n + c.vertices.length, 0);
    if (after <= before * WORTH && chunks.length > 0) {
      const triangles = chunks.reduce(
        (n, c) => n + c.strips.reduce((m, s) => m + s.indices.length / 3, 0),
        0,
      );
      out = { ...part, chunks, triangles };
    }
  }
  byScale.set(step, out);
  return out;
}
