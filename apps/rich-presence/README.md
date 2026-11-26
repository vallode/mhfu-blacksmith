# Monster Hunter Freedom Unite Rich Presence

Shows what you're doing in Monster Hunter Freedom Unite as your Discord
status, read live from PPSSPP:

- **On a quest:** the target ("Hunting Tigrex", or the quest's title when it
  has no target monster), where you are ("Jungle area 5", numbered as the
  game's map numbers it), and the quest's own elapsed time. The picture is
  the target monster, or a Herb on gathering and delivery quests; hovering
  it shows the star level and title ("G★3 · Tigrex Tamer").
- **In town:** where you are (Pokke Village, home, the Felyne Kitchen, Pokke
  Farm, the Gathering Hall, the Training School) and your hunter's name.
- **Always:** your weapon's mini icon in its rarity's colour as the small
  picture, its name and class on hover.

It works with the EU release (ULES01213) and the Japanese release
(ULJM05500), FUComplete included. The presence clears when the game or
PPSSPP closes.

## Running it

You need Node.js 22+, pnpm, the Discord desktop app, and PPSSPP with its
remote debugger on (Settings → Tools → Developer tools → "Allow remote
debugger", or `RemoteDebuggerOnStartup = True` in ppsspp.ini).

From the repository root:

```sh
pnpm install
pnpm --filter rich-presence start --client-id <application ID>
```

Leave it running while you play; Ctrl+C clears the presence and quits. The
application ID can also come from `DISCORD_CLIENT_ID`.

PPSSPP sends its own Discord presence ("Playing PPSSPP") by default. Turn
it off (Settings → System → "Send Discord Presence information") so the
game's presence is the one people see.

Run one reader of PPSSPP's debugger at a time: two clients pausing and
resuming the CPU at once have left PPSSPP's debugger unanswering until
PPSSPP restarted (the game itself kept running). That includes the
Blacksmith site's PPSSPP link.

Options:

| Option           | What it does                                                                  |
| ---------------- | ----------------------------------------------------------------------------- |
| `--client-id`    | The Discord application's ID                                                  |
| `--port <n>`     | PPSSPP's debugger port, if it isn't found by itself (repeatable)              |
| `--ini <path>`   | Another ppsspp.ini to read the port from, e.g. a portable copy's (repeatable) |
| `--interval <s>` | Seconds between reads of the game (default 5)                                 |
| `--dry-run`      | Print the presence instead of sending it to Discord; needs no application ID  |
| `--once`         | Read the game once, show it, and quit                                         |
| `-v`             | Log every read                                                                |

PPSSPP's port is read from its ppsspp.ini (`RemoteISOPort`: in
`~/.config/ppsspp/PSP/SYSTEM/` on macOS and Linux, `Documents\PPSSPP\PSP\SYSTEM\`
on Windows), and otherwise looked up in PPSSPP's own discovery list, as the
site's PPSSPP link does.

## As a PPSSPP plugin

PPSSPP builds with Lua plugins (`type = lua` in a plugin's `plugin.ini`) can
show the same presence themselves, with nothing else running. Build the
plugin from `data/`:

```sh
pnpm --filter rich-presence plugin --out <memory stick>/PSP/PLUGINS
```

That writes `mhfu-presence/` (`plugin.ini` and `presence.lua`); with
"Enable plugins" and "Send Discord Presence information" on, PPSSPP sends
the presence while the game runs. The memory stick is PPSSPP's
`memstick` folder: `~/.config/ppsspp` on macOS and Linux,
`Documents\PPSSPP` on Windows. Discord then shows "Playing PPSSPP", with the
game below it, since the plugin speaks through PPSSPP's own Discord
application. In town the timer counts from when the game started.

`src/plugin.ts` writes every quest, monster, weapon and map name, the star
labels, area numbers and picture URLs into the script as tables, made with
the same code as the companion's presence; the Lua reads the same addresses
as `src/layout.ts` and picks from them.

## The Discord application

The name Discord shows after "Playing" is the Discord application's name. To
make one: [discord.com/developers/applications](https://discord.com/developers/applications)
→ New Application, named e.g. "Monster Hunter Freedom Unite", then copy its
Application ID from General Information. Nothing else is needed: no bot, no
OAuth, no uploaded art. The pictures are served by the Blacksmith site
(`/embed/presence/` on mhfu.vallode.com, written by its
`scripts/generate-embeds.ts` from `src/lib/presence-icons.ts`), and Discord
fetches them by URL.

## How it works

Every few seconds it pauses the emulated CPU, reads the hunter's block, the
current stage and the quest object in one read (a few more on a quest), and
resumes: a pause of a few milliseconds. The addresses and how they were
found are in [docs/discord-rich-presence.md](../../docs/discord-rich-presence.md).

| File              | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `src/layout.ts`   | The addresses, and parsing the bytes read from them    |
| `src/read.ts`     | Reading the game from PPSSPP inside one debugger pause |
| `src/names.ts`    | Quest, monster, weapon and map names from `data/`      |
| `src/presence.ts` | The Discord activity for a read of the game            |
| `src/discord.ts`  | Discord's local RPC over its IPC socket                |
| `src/ppsspp.ts`   | Finding PPSSPP's debugger port                         |
| `src/main.ts`     | The loop: read, build, send when something changed     |
| `src/plugin.ts`   | The same presence as a PPSSPP Lua plugin               |

The PPSSPP debugger client, the hunter block's address and checks, the star
levels and the map's area numbers are the Blacksmith site's
(`apps/blacksmith/src/lib/`). The presence is only sent when what Discord
shows would change, so the quest timer isn't resent unless it drifts by
more than five seconds (a paused emulator).

```sh
pnpm --filter rich-presence test
pnpm --filter rich-presence typecheck
```
