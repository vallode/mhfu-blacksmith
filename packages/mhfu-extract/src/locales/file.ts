/**
 * `data/locales/<code>.json` files: the site's game text in one language
 * (schema `data/schemas/locale.schema.json`, read by the site's
 * `src/lib/i18n/game-text.ts`). Names are keyed by the site's English name
 * per kind, quest board text by quest ID.
 *
 * `locales` writes only the sections it produced and keeps every other
 * section of an existing file as it is, so a run that finds quest text but
 * no name tables doesn't wipe hand-checked names, and vice versa. Keys are
 * sorted (quest IDs numerically) so reruns give clean diffs.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

/** The languages the discs have besides English: the EU disc's four and the JP disc's Japanese. */
export const LOCALE_CODES = ["de", "es", "fr", "it", "ja"] as const;
export type LocaleCode = (typeof LOCALE_CODES)[number];

/** The kinds of name a locale file translates, in the schema's order. */
export const NAME_KINDS = [
  "weapon",
  "armor",
  "item",
  "monster",
  "skill",
  "decoration",
  "map",
] as const;
export type NameKind = (typeof NAME_KINDS)[number];

export const QUEST_TEXT_FIELDS = ["title", "goal", "fail", "details", "client"] as const;
export type QuestText = Record<(typeof QUEST_TEXT_FIELDS)[number], string>;

export interface LocaleFile {
  $comment?: string;
  source?: string | null;
  weapon?: Record<string, string>;
  armor?: Record<string, string>;
  item?: Record<string, string>;
  monster?: Record<string, string>;
  skill?: Record<string, string>;
  decoration?: Record<string, string>;
  map?: Record<string, string>;
  quest?: Record<string, Partial<QuestText>>;
}

/** What one run produced for one language. A section left out is kept from the existing file. */
export interface ProducedLocale {
  names: Partial<Record<NameKind, Record<string, string>>>;
  quest?: Record<string, Partial<QuestText>>;
}

const LANGUAGE_LABELS: Record<LocaleCode, string> = {
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  ja: "Japanese",
};

/** The `$comment` of a new locale file, worded like the committed `es.json`'s. */
export function defaultComment(code: LocaleCode): string {
  const disc = code === "ja" ? "JP" : "EU";
  return (
    `${LANGUAGE_LABELS[code]} game text: names keyed by their English name, quest board text keyed by quest ID. ` +
    `Missing entries fall back to English. Generated from the ${disc} disc by \`pnpm --filter mhfu-extract locales\` ` +
    `(see tools/mhfu-extract/README.md, "Localized text"); don't hand-translate official names.`
  );
}

/** `source` text: the disc and the date, e.g. "EU disc ULES01213, extracted 2026-11-09". */
export function sourceLabel(region: string, discId: string, date: Date): string {
  return `${region.toUpperCase()} disc ${discId}, extracted ${date.toISOString().slice(0, 10)}`;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sortedNames(section: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(section).sort(([a], [b]) => byKey(a, b)));
}

function sortedQuests(
  section: Record<string, Partial<QuestText>>,
): Record<string, Partial<QuestText>> {
  return Object.fromEntries(
    Object.entries(section)
      .sort(([a], [b]) => Number(a) - Number(b) || byKey(a, b))
      .map(([id, text]) => {
        const fields: Partial<QuestText> = {};
        for (const f of QUEST_TEXT_FIELDS) if (text[f] !== undefined) fields[f] = text[f];
        return [id, fields];
      }),
  );
}

/**
 * `existing` (or a new file) with `produced`'s sections replacing the same
 * sections, every other section kept, and `source` set. Key order is fixed:
 * `$comment`, `source`, the name kinds in schema order, then `quest`.
 */
export function mergeLocale(
  code: LocaleCode,
  existing: LocaleFile | null,
  produced: ProducedLocale,
  source: string,
): LocaleFile {
  const base: LocaleFile = existing ?? {};
  const out: LocaleFile = {
    $comment: base.$comment ?? defaultComment(code),
    source,
  };
  for (const kind of NAME_KINDS) {
    const section = produced.names[kind] ?? base[kind] ?? {};
    out[kind] = sortedNames(section);
  }
  out.quest = sortedQuests(produced.quest ?? base.quest ?? {});
  return out;
}

/** JSON text as committed: two-space indent and a trailing newline (what Prettier gives). */
export function serializeLocale(file: LocaleFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

interface LocaleSchema {
  properties: Record<string, { $ref?: string; type?: unknown; additionalProperties?: unknown }>;
  definitions?: unknown;
}

/** Reads `data/schemas/locale.schema.json`. */
export async function loadLocaleSchema(dataDir: string): Promise<LocaleSchema> {
  return JSON.parse(
    await readFile(path.join(dataDir, "schemas", "locale.schema.json"), "utf-8"),
  ) as LocaleSchema;
}

/**
 * Checks `file` against the locale schema's shape without a JSON Schema
 * library (this package doesn't depend on one; the repo's
 * `pnpm validate-schema` runs Ajv over the written files): only the
 * schema's top-level keys, name sections of non-empty strings, numeric
 * quest IDs and the schema's quest fields. Returns the errors, or [].
 */
export function validateLocale(file: LocaleFile, schema: LocaleSchema): string[] {
  const errors: string[] = [];
  const props = schema.properties;
  const questFields = Object.keys(
    ((props.quest?.additionalProperties ?? {}) as { properties?: object }).properties ?? {},
  );
  for (const [key, value] of Object.entries(file)) {
    const prop = props[key];
    if (!prop) {
      errors.push(`unknown key "${key}"`);
      continue;
    }
    if (key === "$comment") {
      if (typeof value !== "string") errors.push(`$comment: not a string`);
    } else if (key === "source") {
      if (value !== null && typeof value !== "string") errors.push(`source: not a string or null`);
    } else if (prop.$ref === "#/definitions/names") {
      for (const [en, text] of Object.entries(value as Record<string, unknown>)) {
        if (typeof text !== "string" || text.length === 0)
          errors.push(`${key}["${en}"]: not a non-empty string`);
      }
    } else if (key === "quest") {
      for (const [id, text] of Object.entries(value as Record<string, Record<string, unknown>>)) {
        if (!/^[0-9]+$/.test(id)) errors.push(`quest["${id}"]: ID isn't a number`);
        for (const [field, v] of Object.entries(text)) {
          if (!questFields.includes(field)) errors.push(`quest["${id}"].${field}: unknown field`);
          else if (typeof v !== "string") errors.push(`quest["${id}"].${field}: not a string`);
        }
      }
    }
  }
  return errors;
}
