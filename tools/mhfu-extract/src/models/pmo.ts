/**
 * `.pmo` mesh format, version "1.0" (MHP2G / MHFU). Layout based on
 * svanheulen/mhff `psp/pmo.py` (`convert_mh2_pmo`, GPL-3.0), corrected
 * against real MHFU EU files: mesh records are 0x18 bytes, not 0x20 (mhff's
 * stride only works for single-mesh files such as weapons).
 *
 * Header (offsets from file start):
 *   0x00 "pmo\0"  0x04 "1.0\0"  0x08 u32 size
 *   0x0c f32 bounding radius   0x10 f32[3] position scale (x, y, z)
 *   0x1c u16 mesh count        0x1e u16 material count
 *   0x20 u32 mesh table        0x24 u32 vertex-group table
 *   0x28 u32 material map      0x2c u32 bone palette
 *   0x30 u32 material table    0x34 u32 display-list base
 * Mesh (0x18): f32[2] UV scale (u, v), u32 ?, u32 ?, u16 ?, u16 material
 *   slot base, u16 vertex-group count, u16 first vertex group.
 * Vertex group (0x10): u8 material slot (relative to the mesh's base), u8
 *   palette entry count, u16 first palette entry, u32 display-list offset
 *   (relative to display-list base), u32, u32.
 * Bone palette: (u8 matrix slot, u8 bone) pairs. Before drawing, a group
 *   loads its entries into the GE's bone matrix slots; a vertex's weights
 *   apply to slots 0, 1, ... Slots keep their bone until reloaded, within a
 *   mesh and across meshes.
 * Material map: u8 per material slot -> index into the material table. mhff
 *   indexes the material table with the slot directly, which happens to work
 *   for weapons but overruns it on monsters (e.g. em01: 48 slots, 41 materials).
 * Material (0x10): u32 diffuse ARGB, u32 ambient RGB, u32 texture index, u32.
 */
import { BinaryReader } from "../binary/reader.js";
import { runDisplayList, type DecodedGeometry } from "./ge.js";

export interface PmoMaterial {
  diffuse: number;
  ambient: number;
  textureIndex: number;
}

export interface PmoPrimitive {
  materialIndex: number;
  /** Bone (skeleton index) in each matrix slot, i.e. for each of a vertex's weights; -1 = unset. */
  bones: number[];
  geometry: DecodedGeometry;
}

export interface PmoMesh {
  uvScale: [number, number];
  primitives: PmoPrimitive[];
}

export interface Pmo {
  radius: number;
  scale: [number, number, number];
  materials: PmoMaterial[];
  meshes: PmoMesh[];
}

const MESH_STRIDE = 0x18;
const VERTEX_GROUP_STRIDE = 0x10;
const MATERIAL_STRIDE = 0x10;

export function isPmo(buf: Buffer): boolean {
  return buf.length >= 0x38 && buf.subarray(0, 8).equals(Buffer.from("pmo\x001.0\x00", "latin1"));
}

export function readPmo(buf: Buffer): Pmo {
  if (!isPmo(buf)) {
    const magic = buf.subarray(0, 8).toString("latin1");
    throw new Error(`Not a PMO 1.0 file (magic ${JSON.stringify(magic)})`);
  }
  const reader = new BinaryReader(buf);
  const radius = reader.f32(0x0c);
  const scale: [number, number, number] = [reader.f32(0x10), reader.f32(0x14), reader.f32(0x18)];
  const meshCount = reader.u16(0x1c);
  const materialCount = reader.u16(0x1e);
  const meshTable = reader.u32(0x20);
  const vertexGroupTable = reader.u32(0x24);
  const materialMap = reader.u32(0x28);
  const bonePalette = reader.u32(0x2c);
  const materialTable = reader.u32(0x30);
  const displayListBase = reader.u32(0x34);

  const materials: PmoMaterial[] = [];
  for (let i = 0; i < materialCount; i++) {
    const at = materialTable + i * MATERIAL_STRIDE;
    materials.push({
      diffuse: reader.u32(at),
      ambient: reader.u32(at + 4),
      textureIndex: reader.u32(at + 8),
    });
  }

  const meshes: PmoMesh[] = [];
  const slots: number[] = [];
  for (let m = 0; m < meshCount; m++) {
    const at = meshTable + m * MESH_STRIDE;
    const uvScale: [number, number] = [reader.f32(at), reader.f32(at + 4)];
    const materialBase = reader.u16(at + 0x12);
    const groupCount = reader.u16(at + 0x14);
    const firstGroup = reader.u16(at + 0x16);
    const primitives: PmoPrimitive[] = [];
    for (let g = 0; g < groupCount; g++) {
      const groupAt = vertexGroupTable + (firstGroup + g) * VERTEX_GROUP_STRIDE;
      const slot = materialBase + reader.u8(groupAt);
      const materialIndex = reader.u8(materialMap + slot);
      const paletteCount = reader.u8(groupAt + 1);
      const paletteStart = reader.u16(groupAt + 2);
      // Only skinned models with an .ahi use the bones (attach.ts); never let a
      // palette this reader misunderstands stop a mesh from converting.
      for (let i = 0; i < paletteCount; i++) {
        const entry = bonePalette + (paletteStart + i) * 2;
        if (bonePalette === 0 || entry + 2 > buf.length) break;
        slots[reader.u8(entry)] = reader.u8(entry + 1);
      }
      const listOffset = reader.u32(groupAt + 4);
      if (materialIndex >= materials.length) {
        throw new Error(
          `Mesh ${m} group ${g}: material slot ${slot} maps to material ${materialIndex} of ${materials.length}`,
        );
      }
      primitives.push({
        materialIndex,
        bones: Array.from(slots, (bone) => bone ?? -1),
        geometry: runDisplayList(reader, displayListBase + listOffset),
      });
    }
    meshes.push({ uvScale, primitives });
  }

  return { radius, scale, materials, meshes };
}
