/**
 * Decoration struct readers, transcribed from `DecoValues`/`DecoSkillsTable`
 * in vendor/mhp2g-patterns/patterns/eboot.hexpat — MIT, see ../../NOTICE.md.
 */
import { BinaryReader } from "../binary/reader.js";
import { DECO_SKILL_ENTRY_SIZE, ITEM_ENTRY_SIZE, TABLE_COUNTS, tableOffset } from "./offsets.js";

export interface DecorationValue {
  /**
   * Index into DecorationValues, and into ItemID[index + 948] for name
   * lookup — confirmed against a real EBOOT: dereferencing ItemID[i + 948]
   * for every DecorationValues[i] resolves to real, sensibly-progressing
   * decoration names (rarity/price/name all line up against real committed
   * decoration data, e.g. index 0 -> "Paralysis Jewel").
   */
  index: number;
  unkn1: number;
  rarity: number;
  stackLimit: number;
  /** 0 = regular jewel, 1 = "encased" jewel. */
  iconDeco: number;
  iconId: number;
  color: number;
  unkn2: number;
  unkn3: number;
  price: number;
  unkn4: number;
  unkn5: number;
  unkn6: number;
  /** Index into the DecoSkills table (readDecorationSkills()). */
  skillTblId: number;
}

/** DecorationValues[169] @ 0x0899FB18 — 24 bytes/entry. */
export function readDecorationValues(reader: BinaryReader): DecorationValue[] {
  const base = tableOffset("decorationValues");
  const out: DecorationValue[] = [];
  for (let i = 0; i < TABLE_COUNTS.decorations; i++) {
    const off = base + i * ITEM_ENTRY_SIZE;
    out.push({
      index: i,
      unkn1: reader.u16(off + 0),
      rarity: reader.u8(off + 2),
      stackLimit: reader.u8(off + 3),
      iconDeco: reader.u8(off + 4),
      iconId: reader.u8(off + 5),
      color: reader.u8(off + 6),
      unkn2: reader.u8(off + 7),
      unkn3: reader.u32(off + 8),
      price: reader.u32(off + 12),
      unkn4: reader.u16(off + 16),
      unkn5: reader.u16(off + 18),
      unkn6: reader.u16(off + 20),
      skillTblId: reader.u16(off + 22),
    });
  }
  return out;
}

export interface DecorationSkillEntry {
  skill: number;
  amount: number;
}

export interface DecorationSkill {
  /** Index into DecoSkills[168] (the dummy slot 0 is skipped/hidden per eboot.hexpat). */
  index: number;
  reqSlots: number;
  unkn1: number;
  unkn2: number;
  unkn3: number;
  skills: DecorationSkillEntry[];
  term: number;
}

/**
 * DecoSkillsTable @ 0x08974EE0 — a hidden dummy entry followed by
 * DecoSkills[168], 16 bytes/entry. Returns only the 168 real entries.
 */
export function readDecorationSkills(reader: BinaryReader): DecorationSkill[] {
  const dummyBase = tableOffset("decorationSkills");
  const base = dummyBase + DECO_SKILL_ENTRY_SIZE; // skip the hidden dummy slot
  const count = TABLE_COUNTS.decorations - 1; // 169 total incl. dummy -> 168 real
  const out: DecorationSkill[] = [];
  for (let i = 0; i < count; i++) {
    const off = base + i * DECO_SKILL_ENTRY_SIZE;
    const skills: DecorationSkillEntry[] = [];
    for (let s = 0; s < 3; s++) {
      skills.push({ skill: reader.u8(off + 8 + s * 2), amount: reader.s8(off + 9 + s * 2) });
    }
    out.push({
      index: i,
      reqSlots: reader.u8(off + 0),
      unkn1: reader.u8(off + 1),
      unkn2: reader.u16(off + 2),
      unkn3: reader.u32(off + 4),
      skills,
      term: reader.u16(off + 14),
    });
  }
  return out;
}

/**
 * Resolves `DecorationValue.skillTblId` against the array returned by
 * `readDecorationSkills()`. Confirmed against a real EBOOT: `skillTblId`
 * values are 2-based against the *undropped* raw table (dummy slot at real
 * position 0), i.e. one *further* dummy/reserved slot than
 * `readDecorationSkills()` skips — empirically, `skillTblId=2` (the first
 * value seen in practice, for decoration index 0) must land on
 * `readDecorationSkills()`'s own index 0 for the decoded skills to match a
 * real disc's known decorations (e.g. "Paralysis Jewel" -> Paralysis+1/
 * Poison-1), hence the `- 2` here rather than the `- 1` you'd expect from
 * `readDecorationSkills()` skipping only one slot.
 */
export function resolveDecorationSkill(
  skills: DecorationSkill[],
  skillTblId: number
): DecorationSkill | undefined {
  return skills[skillTblId - 2];
}
