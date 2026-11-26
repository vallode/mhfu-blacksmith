/**
 * Sends the bot's slash commands (src/commands.ts) to Discord, replacing
 * the ones it has. Run it after changing a command:
 *
 *   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… pnpm --filter discord-bot register
 *
 * With DISCORD_GUILD_ID the commands go to that one server, where they
 * show up at once (for trying them out); without it they're global, which
 * can take up to an hour. `--dry-run` prints what it would send.
 */
import { COMMANDS } from "../src/commands.js";
import { API } from "../src/discord.js";

const dryRun = process.argv.includes("--dry-run");
const app = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guild = process.env.DISCORD_GUILD_ID;

if (dryRun) {
  console.log(JSON.stringify(COMMANDS, null, 2));
  process.exit(0);
}
if (!app || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN (Developer Portal > your app).");
  process.exit(1);
}

const url = guild
  ? `${API}/applications/${app}/guilds/${guild}/commands`
  : `${API}/applications/${app}/commands`;
const res = await fetch(url, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bot ${token}` },
  body: JSON.stringify(COMMANDS),
});
if (!res.ok) {
  console.error(`Discord answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const registered = (await res.json()) as { name: string }[];
console.log(
  `Registered ${registered.map((c) => `/${c.name}`).join(", ")} ${guild ? `in server ${guild}` : "globally"}.`,
);
