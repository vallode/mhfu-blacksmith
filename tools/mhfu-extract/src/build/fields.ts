/**
 * Per-field comparison and conversion rules shared by `compare` and
 * `build-data`.
 *
 * Every field has a kind. A kind says how to reduce a value to a canonical
 * form that ignores presentation (skill spelling, list order, material
 * spelling, `null` vs `[]`), and how to turn a disc value into the site's
 * vocabulary (`toSite`) for writing to `data/`. `toSite` keeps the committed
 * value whenever its canonical form already equals the disc's, so an
 * unchanged field stays byte-identical.
 */
import { canonicalDecorationSkill, canonicalSkillName } from "../overlay/skill-name-aliases.js";
import type { MaterialContext } from "../overlay/item-name-corrections.js";
import type { NameTable } from "../strings/names.js";
import { formatSignedAmount } from "../emit/common.js";
import { discMaterialId, enumIdOf, type EquipmentSlot, type SiteIndex } from "./ids.js";

export type FieldKind =
  /** Compared and taken as-is (numbers, strings, ordered arrays like sharpness). */
  | "scalar"
  /** Armor `{ name, amount }[]`, compared as a set with skill names canonicalized. */
  | "armor-skills"
  /** Decoration `"Name +N"[]`, compared as a set with skill names canonicalized. */
  | "decoration-skills"
  /** `{ name, amount, type, color }[]`, compared as a multiset of (item ID, amount). */
  | "materials"
  /** Weapon upgrade-tree names (`improve_from`/`improve_to`), compared as a set of game IDs. */
  | "weapon-refs"
  /** Unordered list of plain values (bow/bowgun `coatings`, `elements`). */
  | "set"
  /** A percentage (`"10%"`, `"-5%"`, or a bare `"0"`), compared by its number. */
  | "percent"
  /** Bowgun `{ name, capacity }[]` ammo lists, compared by ammo name (trimmed). */
  | "ammo"
  /** A `|`-joined list (`rapid_fire`), compared as a set of trimmed entries; null is empty. */
  | "joined-set";

export interface FieldSpec {
  field: string;
  kind: FieldKind;
}

/** Everything a field rule needs to know about where a value came from. */
export interface FieldContext {
  site: SiteIndex;
  spellings: SpellingIndex;
  materialContext: MaterialContext;
  /** For weapon refs: the ID space and its enum table. */
  weaponSlot?: EquipmentSlot;
  weaponTable?: NameTable;
}

/**
 * Most common committed spelling (and, for materials, type/color) for each
 * canonical skill name and item ID. Used to spell a value the committed
 * item didn't have before, the way the rest of the site already spells it.
 * A skill no committed item of the same category spells is written with
 * its `SkillID` name.
 *
 * Material names are taken from the same recipe context first (armor
 * files spell some items differently from weapon files, e.g.
 * "FireWyvern Claw" vs "Fire Wyvern Claw", and both resolve). The icon
 * style is taken from weapon and decoration recipes first: about a third
 * of the items armor shares with them carry a placeholder "bone"/"white"
 * style in the committed armor files.
 */
export interface SpellingIndex {
  skill(canonical: string, context: MaterialContext): string | undefined;
  material(
    itemId: number,
    context: MaterialContext,
  ): { name: string; type: string; color: string } | undefined;
}

interface Material {
  name: string;
  amount: number;
  type: string;
  color: string;
}

type Counts<T> = Map<string, { value: T; n: number }[]>;

function mostCommon<T>(counts: Counts<T>, key: string): T | undefined {
  const list = counts.get(key);
  if (!list) return undefined;
  return [...list].sort((a, b) => b.n - a.n)[0]!.value;
}

function bump<T>(counts: Counts<T>, key: string, value: T): void {
  const list = counts.get(key) ?? [];
  const json = JSON.stringify(value);
  const hit = list.find((e) => JSON.stringify(e.value) === json);
  if (hit) hit.n++;
  else list.push({ value, n: 1 });
  counts.set(key, list);
}

const MATERIAL_FIELDS = ["create_mats", "improve_mats", "alternative_create_mats"];

/** Builds a SpellingIndex from committed items, grouped by recipe context. */
export function buildSpellingIndex(
  byContext: Map<MaterialContext, Record<string, unknown>[]>,
  site: SiteIndex,
): SpellingIndex {
  const skills = new Map<MaterialContext, Counts<string>>();
  const names = new Map<MaterialContext | "any", Counts<string>>();
  const styles = {
    armor: new Map() as Counts<{ type: string; color: string }>,
    other: new Map() as Counts<{ type: string; color: string }>,
  };
  for (const [context, items] of byContext) {
    if (!skills.has(context)) skills.set(context, new Map());
    const skillCounts = skills.get(context)!;
    for (const item of items) {
      for (const skill of (item.skills as unknown[] | null | undefined) ?? []) {
        if (typeof skill === "string") {
          const match = /^(.*?)\s*[+-]\d+$/.exec(skill.trim());
          if (match?.[1]) bump(skillCounts, canonicalSkillName(match[1]), match[1]);
        } else if (
          skill &&
          typeof skill === "object" &&
          typeof (skill as { name?: unknown }).name === "string"
        ) {
          const name = (skill as { name: string }).name;
          bump(skillCounts, canonicalSkillName(name), name);
        }
      }
      for (const field of MATERIAL_FIELDS) {
        for (const m of (item[field] as Material[] | null | undefined) ?? []) {
          const id = site.itemIdOf(m.name);
          if (id === null) continue;
          for (const key of [context, "any"] as const) {
            if (!names.has(key)) names.set(key, new Map());
            bump(names.get(key)!, String(id), m.name);
          }
          bump(context === "armor" ? styles.armor : styles.other, String(id), {
            type: m.type,
            color: m.color,
          });
        }
      }
    }
  }
  return {
    // Skill spelling is per category only: decorations use the SkillID
    // spelling for trees armor spells differently ("SleepCAdd" vs "SleepCtAdd").
    skill: (canonical, context) => mostCommon(skills.get(context) ?? new Map(), canonical),
    material: (itemId, context) => {
      const key = String(itemId);
      const empty: Counts<string> = new Map();
      const name =
        mostCommon(names.get(context) ?? empty, key) ?? mostCommon(names.get("any") ?? empty, key);
      const style = mostCommon(styles.other, key) ?? mostCommon(styles.armor, key);
      return name && style ? { name, ...style } : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Canonical forms
// ---------------------------------------------------------------------------

/** The number in a percentage string or number; `null` when there isn't one. */
export function percentValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*$/.exec(value);
  return match ? Number(match[1]) : null;
}

function list(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function armorSkillKeys(value: unknown): string[] {
  return list(value)
    .map((s) => s as { name: string; amount: number })
    .map((s) => `${canonicalSkillName(s.name)} ${formatSignedAmount(s.amount)}`)
    .sort();
}

function decorationSkillKeys(value: unknown): string[] {
  return list(value)
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => canonicalDecorationSkill(s))
    .sort();
}

function materialKey(m: Material, side: "site" | "disc", ctx: FieldContext): string {
  const id =
    side === "site" ? ctx.site.itemIdOf(m.name) : discMaterialId(m.name, ctx.materialContext);
  return `${id ?? `?${m.name}`} x${m.amount}`;
}

function materialKeys(value: unknown, side: "site" | "disc", ctx: FieldContext): string[] {
  return list(value)
    .map((m) => materialKey(m as Material, side, ctx))
    .sort();
}

function weaponRefKeys(value: unknown, side: "site" | "disc", ctx: FieldContext): string[] {
  return list(value)
    .map((name) => String(name))
    .map((name) => {
      const ids =
        side === "site"
          ? ctx.site.equipmentIdsByName(ctx.weaponSlot!, name)
          : [enumIdOf(name, ctx.weaponTable!)];
      return ids.length === 1 && ids[0] !== null ? String(ids[0]) : `?${name}`;
    })
    .sort();
}

function ammoKeys(value: unknown): string[] {
  return list(value)
    .map((a) => a as { name: string; capacity: number[] })
    .map((a) => `${a.name.trim()}=${JSON.stringify(a.capacity)}`)
    .sort();
}

function joinedKeys(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("|")
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .sort();
}

/** The value reduced to a string that's equal on both sides exactly when they agree. */
export function canonical(
  spec: FieldSpec,
  value: unknown,
  side: "site" | "disc",
  ctx: FieldContext,
): string {
  switch (spec.kind) {
    case "scalar":
      return JSON.stringify(value ?? null);
    case "armor-skills":
      return JSON.stringify(armorSkillKeys(value));
    case "decoration-skills":
      return JSON.stringify(decorationSkillKeys(value));
    case "materials":
      return JSON.stringify(materialKeys(value, side, ctx));
    case "weapon-refs":
      return JSON.stringify(weaponRefKeys(value, side, ctx));
    case "set":
      return JSON.stringify(
        list(value)
          .map((v) => JSON.stringify(v))
          .sort(),
      );
    case "percent": {
      const n = percentValue(value);
      return n === null ? JSON.stringify(value ?? null) : String(n);
    }
    case "ammo":
      return JSON.stringify(ammoKeys(value));
    case "joined-set":
      return JSON.stringify(joinedKeys(value));
  }
}

// ---------------------------------------------------------------------------
// Disc -> site conversion
// ---------------------------------------------------------------------------

function skillSpelling(
  canonicalName: string,
  committedSpellings: Map<string, string>,
  ctx: FieldContext,
): string {
  return (
    committedSpellings.get(canonicalName) ??
    ctx.spellings.skill(canonicalName, ctx.materialContext) ??
    canonicalName
  );
}

function armorSkillsToSite(disc: unknown, committed: unknown, ctx: FieldContext): unknown {
  const discSkills = list(disc) as { name: string; amount: number }[];
  if (discSkills.length === 0) return null;
  const committedSkills = list(committed) as { name: string; amount: number }[];
  const spellings = new Map(committedSkills.map((s) => [canonicalSkillName(s.name), s.name]));
  const discByName = new Map(discSkills.map((s) => [canonicalSkillName(s.name), s.amount]));
  // Keep the committed order for skills both sides have, then add the
  // disc's new ones in disc order.
  // A skill the committed list repeats is written once.
  const out: { name: string; amount: number }[] = [];
  const written = new Set<string>();
  for (const s of committedSkills) {
    const canon = canonicalSkillName(s.name);
    const amount = discByName.get(canon);
    if (amount !== undefined && !written.has(canon)) out.push({ name: s.name, amount });
    written.add(canon);
  }
  for (const s of discSkills) {
    if (!spellings.has(canonicalSkillName(s.name)))
      out.push({
        name: skillSpelling(canonicalSkillName(s.name), spellings, ctx),
        amount: s.amount,
      });
  }
  return out;
}

function decorationSkillsToSite(disc: unknown, committed: unknown, ctx: FieldContext): unknown {
  const parse = (s: string) => {
    const match = /^(.*?)\s*([+-]\d+)$/.exec(s.trim());
    return match ? { name: match[1]!, amount: Number(match[2]) } : null;
  };
  const discSkills = list(disc)
    .map((s) => parse(String(s)))
    .filter((s): s is { name: string; amount: number } => s !== null);
  const committedSkills = list(committed)
    .map((s) => parse(String(s)))
    .filter((s): s is { name: string; amount: number } => s !== null);
  const spellings = new Map(committedSkills.map((s) => [canonicalSkillName(s.name), s.name]));
  const discByName = new Map(discSkills.map((s) => [canonicalSkillName(s.name), s.amount]));
  const out: string[] = [];
  const written = new Set<string>();
  for (const s of committedSkills) {
    const canon = canonicalSkillName(s.name);
    const amount = discByName.get(canon);
    if (amount !== undefined && !written.has(canon))
      out.push(`${s.name} ${formatSignedAmount(amount)}`);
    written.add(canon);
  }
  for (const s of discSkills) {
    const canon = canonicalSkillName(s.name);
    if (!spellings.has(canon))
      out.push(`${skillSpelling(canon, spellings, ctx)} ${formatSignedAmount(s.amount)}`);
  }
  return out;
}

function materialsToSite(
  disc: unknown,
  siteItem: Record<string, unknown>,
  ctx: FieldContext,
): unknown {
  const discMats = list(disc) as Material[];
  if (discMats.length === 0) return null;
  // Spellings this item already uses, from any of its recipes.
  const own = new Map<number, Material>();
  for (const field of MATERIAL_FIELDS) {
    for (const m of list(siteItem[field]) as Material[]) {
      const id = ctx.site.itemIdOf(m.name);
      if (id !== null && !own.has(id)) own.set(id, m);
    }
  }
  return discMats.map((m) => {
    const id = discMaterialId(m.name, ctx.materialContext);
    if (id === null) return m;
    const known = own.get(id) ?? ctx.spellings.material(id, ctx.materialContext);
    if (known) return { name: known.name, amount: m.amount, type: known.type, color: known.color };
    const item = ctx.site.items.get(id);
    return { name: item?.name ?? m.name, amount: m.amount, type: m.type, color: m.color };
  });
}

function weaponRefsToSite(disc: unknown, field: string, ctx: FieldContext): unknown {
  const names = list(disc).map((name) => {
    const id = enumIdOf(String(name), ctx.weaponTable!);
    return (id !== null && ctx.site.equipment[ctx.weaponSlot!]?.[id]?.name) || String(name);
  });
  if (names.length === 0) return null;
  // Site convention: `improve_from` is a bare string for a single source.
  return field === "improve_from" && names.length === 1 ? names[0] : names;
}

/**
 * The disc value converted to the site's vocabulary. Returns the committed
 * value unchanged when the two already agree.
 */
export function toSite(
  spec: FieldSpec,
  disc: unknown,
  siteItem: Record<string, unknown>,
  ctx: FieldContext,
): unknown {
  const committed = siteItem[spec.field];
  if (
    spec.field in siteItem &&
    canonical(spec, committed, "site", ctx) === canonical(spec, disc, "disc", ctx)
  )
    return committed;
  switch (spec.kind) {
    case "scalar":
    case "set":
    case "ammo":
    case "joined-set":
      return disc;
    case "armor-skills":
      return armorSkillsToSite(disc, committed, ctx);
    case "decoration-skills":
      return decorationSkillsToSite(disc, committed, ctx);
    case "materials":
      return materialsToSite(disc, siteItem, ctx);
    case "weapon-refs":
      return weaponRefsToSite(disc, spec.field, ctx);
    case "percent": {
      const n = percentValue(disc);
      return n === null ? disc : `${n}%`;
    }
  }
}
