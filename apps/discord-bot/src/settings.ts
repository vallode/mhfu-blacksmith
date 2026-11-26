/**
 * /settings: a RandomFU settings string's seed and the options it changes,
 * decoded by randomfu's own settings module. That module is plain code (no
 * disc, no files), so it runs in the Worker as it does in the web app.
 */
import {
  decodeSettings,
  defaultSettings,
  formatOption,
  isActive,
  OPTIONS,
  PRESETS,
  SettingsError,
  type Settings,
} from "randomfu/src/settings.js";
import { LOGIC_VERSION } from "randomfu/src/version.js";
import { clip, LIMITS, type Embed } from "./discord.js";
import { EMBED_COLOR } from "./lookup.js";

/** The preset whose changes these settings are, if any. */
function presetOf(settings: Settings): string | null {
  for (const preset of PRESETS) {
    const want = { ...defaultSettings(settings.seed), ...preset.changes } as Settings;
    if (OPTIONS.every((o) => settings[o.key] === want[o.key])) return preset.name;
  }
  return null;
}

/** The reply to /settings: an embed, or an error for the asker only. */
export function settingsReply(
  value: string,
  randomfuUrl: string,
): { embed: Embed } | { error: string } {
  let decoded: { settings: Settings; version: number };
  try {
    decoded = decodeSettings(value);
  } catch (e) {
    return { error: e instanceof SettingsError ? e.message : "That settings string is damaged" };
  }
  const { settings, version } = decoded;
  const changed = OPTIONS.filter((o) => isActive(settings, o) && settings[o.key] !== o.default);
  const bySection = new Map<string, string[]>();
  for (const o of changed) {
    const lines = bySection.get(o.section) ?? [];
    lines.push(`${o.label}: ${formatOption(o, settings[o.key])}`);
    bySection.set(o.section, lines);
  }
  const fields: NonNullable<Embed["fields"]> = [
    { name: "Seed", value: `\`${settings.seed}\``, inline: true },
  ];
  const preset = presetOf(settings);
  fields.push({ name: "Preset", value: preset ?? "Custom", inline: true });
  if (version !== LOGIC_VERSION) {
    fields.push({
      name: "Made with",
      value: `An older RandomFU (logic ${version}, now ${LOGIC_VERSION}): the same seed can make a different game`,
    });
  }
  const title = "RandomFU settings";
  const description =
    changed.length === 0
      ? "Every option at its default."
      : `${changed.length} option${changed.length === 1 ? "" : "s"} changed from the defaults.`;
  // Discord takes 25 fields and 6000 characters an embed; sections that
  // don't fit are counted in the last one shown.
  const size = (f: { name: string; value: string }) => f.name.length + f.value.length;
  let used = title.length + description.length + fields.reduce((n, f) => n + size(f), 0);
  const sections = [...bySection];
  const shown: { name: string; value: string }[] = [];
  const tail = 40; // room for the "…and N more sections" line
  for (const [section, lines] of sections) {
    if (fields.length + shown.length >= LIMITS.fields) break;
    const value = clip(lines.join("\n"), LIMITS.fieldValue - tail);
    if (used + section.length + value.length + tail > LIMITS.embedTotal) break;
    shown.push({ name: section, value });
    used += section.length + value.length;
  }
  const rest = sections.length - shown.length;
  const last = shown.at(-1);
  if (rest && last) last.value += `\n…and ${rest} more section${rest === 1 ? "" : "s"}`;
  fields.push(...shown);
  return {
    embed: {
      title,
      url: randomfuUrl,
      description,
      color: EMBED_COLOR,
      fields,
    },
  };
}
