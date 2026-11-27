/**
 * How options are described, checked, shown and packed into a settings
 * string: the machinery Whetstone's settings (`settings.ts`) and randomfu's
 * share. Settings are a flat object keyed by option (`"camera.fov"`), so they
 * serialize as they are. A settings string is a two-letter prefix and
 * base64url JSON of a version and every option that isn't its default.
 */

export type OptionType =
  | { kind: "boolean" }
  | {
      kind: "number";
      min: number;
      max: number;
      step: number;
      /** Shown as ±50%. */
      percent?: boolean;
      /** Shown as ±4 levels. */
      unit?: string;
      /** Shown as 12%: a chance in percent, not a spread. */
      chance?: boolean;
    }
  | {
      kind: "choice";
      choices: { value: string; label: string; help: string; action?: Action }[];
    };

/**
 * What a randomizer's option does to the game. A shuffle moves what's already
 * there to other places: nothing new is made. A randomizer rolls new values.
 * Whetstone's own options do neither; randomfu's pages tag options with it,
 * and its presets are built on it.
 */
export type Action = "shuffle" | "randomize";

export interface OptionDef<K extends string = string> {
  key: K;
  section: string;
  label: string;
  help: string;
  type: OptionType;
  default: boolean | number | string;
  /** Shuffle or randomize: left out for options that only tune another. */
  action?: Action;
  /** An option that must be on for this one to matter. */
  enabledBy?: K;
  /** With `enabledBy` a choice: the values of it that count as on. */
  enabledWhen?: readonly string[];
  /** A few short points under `help`, for what doesn't fit its one or two sentences. */
  points?: readonly string[];
  /**
   * Switched in game from the START menu's Whetstone entry, and the save
   * keeps that choice: the option only picks how a disc starts.
   */
  inGame?: true;
  /** The discs it works on, when that isn't all of them ("EU", "EU and JP"). */
  discs?: string;
}

export class SettingsError extends Error {}

export type OptionValue = boolean | number | string;

/** Each option's default, by key. */
export function optionDefaults(options: readonly OptionDef[]): Record<string, OptionValue> {
  const out: Record<string, OptionValue> = {};
  for (const option of options) out[option.key] = option.default;
  return out;
}

/** Checks one value against its option, converting strings ("true", "0.5"). */
export function coerceOption(
  option: OptionDef | undefined,
  key: string,
  value: unknown,
): OptionValue {
  if (!option) throw new SettingsError(`Unknown setting "${key}"`);
  const type = option.type;
  if (type.kind === "boolean") {
    if (value === true || value === "true" || value === "on") return true;
    if (value === false || value === "false" || value === "off") return false;
    throw new SettingsError(`${key} must be true or false`);
  }
  if (type.kind === "number") {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < type.min || n > type.max) {
      throw new SettingsError(`${key} must be a number from ${type.min} to ${type.max}`);
    }
    return type.step >= 1 ? Math.round(n) : n;
  }
  if (typeof value !== "string" || !type.choices.some((c) => c.value === value)) {
    throw new SettingsError(`${key} must be one of ${type.choices.map((c) => c.value).join(", ")}`);
  }
  return value;
}

/**
 * True if the option is in effect: its `enabledBy` switch is on (or its
 * choice is at `enabledWhen`), and that option is in effect too.
 */
export function optionActive(
  byKey: ReadonlyMap<string, OptionDef>,
  settings: Readonly<Record<string, unknown>>,
  option: OptionDef,
): boolean {
  if (!option.enabledBy) return true;
  const parent = byKey.get(option.enabledBy)!;
  const value = settings[option.enabledBy];
  const on = option.enabledWhen ? option.enabledWhen.includes(String(value)) : value === true;
  return on && optionActive(byKey, settings, parent);
}

/** An option's value in words: yes/no, ±50%, ±4 levels, a number, or the choice's label. */
export function formatOption(option: OptionDef, value: unknown): string {
  const type = option.type;
  if (type.kind === "boolean") return value ? "yes" : "no";
  if (type.kind === "number" && type.percent) return `±${Math.round(Number(value) * 100)}%`;
  if (type.kind === "number" && type.unit) return `±${String(value)} ${type.unit}`;
  if (type.kind === "number" && type.chance) return `${String(value)}%`;
  if (type.kind === "choice") {
    return type.choices.find((c) => c.value === value)?.label ?? String(value);
  }
  return String(value);
}

// base64url by hand: the browser's Buffer has plain base64 only.
function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SettingsError("That settings string is damaged");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
}

/** `prefix` and `payload` as base64url JSON. */
export function encodePayload(prefix: string, payload: Record<string, unknown>): string {
  return `${prefix}${toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"))}`;
}

/** The JSON object in a settings string that starts with `prefix`. */
export function decodePayload(prefix: string, value: string): Record<string, unknown> {
  const text = value.trim();
  if (!text.startsWith(prefix)) {
    throw new SettingsError(`A settings string starts with ${prefix}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(text.slice(prefix.length)).toString("utf8"));
  } catch {
    throw new SettingsError("That settings string is damaged");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new SettingsError("That settings string is damaged");
  }
  return payload as Record<string, unknown>;
}

/** A settings file's JSON object. */
export function parseSettingsJson(text: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new SettingsError(`Settings file isn't valid JSON: ${(error as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SettingsError("Settings file must be a JSON object");
  }
  return data as Record<string, unknown>;
}
