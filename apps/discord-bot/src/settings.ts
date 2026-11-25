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
  const room = LIMITS.fields - fields.length;
  const sections = [...bySection];
  sections.slice(0, room).forEach(([section, lines], i) => {
    const rest = sections.length > room && i === room - 1 ? sections.length - room : 0;
    fields.push({
      name: section,
      value: clip(
        lines.join("\n") + (rest ? `\n…and ${rest} more sections` : ""),
        LIMITS.fieldValue,
      ),
    });
  });
  return {
    embed: {
      title: "RandomFU settings",
      url: randomfuUrl,
      description:
        changed.length === 0
          ? "Every option at its default."
          : `${changed.length} option${changed.length === 1 ? "" : "s"} changed from the defaults.`,
      color: EMBED_COLOR,
      fields,
    },
  };
}
